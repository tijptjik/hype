// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, asc, desc, eq, sql, type SQL } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded.js'
// SCHEMA
import {
  fieldResearchConfigurationHistory as history,
  fieldResearchRecord as captures,
  fieldResearchSession as sessions,
  fieldResearchSessionLayer as sessionLayers,
} from '#lib/db/schema/fieldResearch.js'
// DOMAIN
import {
  researchProjectAccess,
  requireResearchSessionAccess,
} from '#lib/fieldResearch/access.js'
import {
  researchConfigurationVersion,
  suggestResearchFeatureType,
  researchConfigurationSchema,
  researchLayerOverridesSchema,
} from '#lib/fieldResearch/configuration.js'
import {
  migrateResearchSettings,
  validResearchPropertyDefault,
} from '#lib/fieldResearch/configurationMigration.js'
import { listResolvedProjectProperties } from '#lib/db/services/property.js'
import { researchProjectProperties } from '#lib/fieldResearch/propertyChoices.js'
import { requireFeatureType } from '#lib/features/intents.js'
import { recorderIdentifierTags } from '#lib/fieldResearch/recorderIdentifier.js'
import { recorderLocationAddresses } from '#lib/fieldResearch/recorder.js'
// SERVICES
import {
  listRecorderLocations,
  recorderCardFields,
  recorderCaptureTitle,
} from '#lib/db/services/recorderSessions.js'
import {
  firstResearchLayerSQL,
  initialResearchLayersSQL,
} from '#lib/db/services/fieldResearchLayers.js'
import { setResearchSessionsArchived } from '#lib/db/services/fieldResearchArchive.js'
import {
  readResearchSession,
  researchSessionMetadata,
} from '#lib/db/services/fieldResearch.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import { readFeatureIntentPolicy } from '#lib/db/services/featureIntentPolicy.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types.js'

// TABLE OF CONTENTS
// 1. Authorization and scope choices
// 2. Session reads and edits
// 3. Versioned configuration and session metadata
// 4. Record filtering and bulk actions
// 5. Session status updates

const id = z.string().min(1).max(100)
const sessionPrisms = z.object({
  organisation: z.array(id),
  project: z.array(id),
})

/** Restrict session results to selected organisation and project prisms.
 * @param prisms Selected IDs; empty selections impose no restriction.
 * @returns SQL predicates for the session alias.
 */
function sessionPrismScope(prisms: z.infer<typeof sessionPrisms> | undefined) {
  return and(
    prisms?.organisation.length
      ? sql`s.organisationId IN (SELECT value FROM json_each(${JSON.stringify(prisms.organisation)}))`
      : undefined,
    prisms?.project.length
      ? sql`s.projectId IN (SELECT value FROM json_each(${JSON.stringify(prisms.project)}))`
      : undefined,
  )
}
const sessionRevision = z.object({
  sessionId: id,
  revision: z.number().int().nonnegative(),
})

/** Require the private research capability on every remote operation.
 * @param ctx Current authenticated request. @returns Nothing when authorized.
 */
function requireResearch(ctx: GuardedBaseContext): void {
  if (ctx.user.isAnonymous) error(403, 'INSUFFICIENT_ROLE')
}

/** List active owning projects; names remain within the authenticated portal.
 * @param input Empty options. @returns Organisation/project choices.
 */
export const getResearchProjects = guardedQuery(z.object({}), async (_, ctx) => {
  requireResearch(ctx)
  return ctx.db.all<{
    id: string
    organisationId: string
    name: string
    organisationName: string
    code: string
    organisationCode: string
  }>(sql`SELECT p.id,p.organisationId,p.code,o.code organisationCode,
    COALESCE((SELECT name FROM projectI18n WHERE projectId=p.id ORDER BY locale='en' DESC LIMIT 1),p.id) name,
    COALESCE((SELECT name FROM organisationI18n WHERE organisationId=p.organisationId ORDER BY locale='en' DESC LIMIT 1),p.organisationId) organisationName
    FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.isArchived=0 AND o.isArchived=0 AND ${researchProjectAccess(ctx, sql`p.id`)} ORDER BY organisationName,name`)
})

/** List available destination layers and inherited Feature types only when conversion is needed.
 * @param input Session identity. @returns Active layers in the session's project.
 */
export const getResearchLayers = guardedQuery(
  z.union([z.object({ sessionId: id }), z.object({ projectId: id })]),
  async (input, ctx) => {
    requireResearch(ctx)
    const session =
      'sessionId' in input
        ? await readResearchSession(ctx.db, input.sessionId)
        : await ctx.db.get<{ projectId: string; organisationId: string }>(
            sql`SELECT id projectId,organisationId FROM project WHERE id=${input.projectId} AND isArchived=0`,
          )
    if (!session) error(404, 'Project not found')
    if (
      !(await ctx.db.get(
        sql`SELECT id FROM project WHERE id=${session.projectId} AND ${researchProjectAccess(ctx, sql`project.id`)}`,
      ))
    )
      error(403, 'INSUFFICIENT_ROLE')
    const rows = await ctx.db.all<{ id: string; name: string }>(
      sql`SELECT l.id,COALESCE((SELECT name FROM layerI18n WHERE layerId=l.id ORDER BY locale='en' DESC LIMIT 1),l.id) name FROM layer l WHERE l.projectId=${session.projectId} AND l.organisationId=${session.organisationId} AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL ORDER BY name,l.id`,
    )
    // Count only this project's retained Features; historical layers and disabled types cannot win the suggestion.
    const counts = await ctx.db.all<{
      layerId: string
      featureType: string
      count: number
    }>(
      sql`SELECT layerId,featureType,count(*) count FROM feature WHERE projectId=${session.projectId}
        AND organisationId=${session.organisationId} AND isArchived=0 AND featureType IS NOT NULL
        GROUP BY layerId,featureType`,
    )
    return Promise.all(
      rows.map(async row => {
        const types = (
          await readFeatureIntentPolicy(ctx.db, { type: 'layer', id: row.id })
        ).types
        return {
          ...row,
          types,
          suggestedFeatureType: suggestResearchFeatureType(
            types,
            counts.filter(count => count.layerId === row.id),
          ),
        }
      }),
    )
  },
)

/** Browse retained sessions with a stable identity cursor.
 * @param input Optional cursor, name search, creator/destination filters and sort order. @returns A bounded session page with record counts and project, layer and creator display metadata.
 */
export const getResearchSessions = guardedQuery(
  z.object({
    before: id.optional(),
    query: z.string().max(200).optional(),
    archive: z.enum(['active', 'archived', 'all']).default('active'),
    creatorId: id.optional(),
    organisationId: id.optional(),
    projectId: id.optional(),
    layerId: id.optional(),
    prisms: sessionPrisms.optional(),
    hasRecords: z.boolean().optional(),
    sortBy: z.enum(['createdAt', 'name']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    if (input.archive !== 'active' && !ctx.user.superAdmin)
      error(403, 'Only super admins can view archived sessions.')
    const column = input.sortBy === 'name' ? sessions.name : sessions.createdAt
    const cursorColumn = sql.raw(input.sortBy === 'name' ? 'name' : 'createdAt')
    const direction = input.sortOrder === 'asc' ? asc : desc
    const comparison = sql.raw(input.sortOrder === 'asc' ? '>' : '<')
    return ctx.db
      .select({
        ...researchSessionMetadata,
        totalCount: sql<number>`count(*) over()`,
        recordCount: sql<number>`(SELECT count(*) FROM fieldResearchRecord WHERE archivedAt IS NULL AND sessionId=fieldResearchSession.id)`,
        projectName: sql<
          string | null
        >`(SELECT name FROM projectI18n WHERE projectId=fieldResearchSession.projectId ORDER BY locale='en' DESC LIMIT 1)`,
        layerName: sql<
          string | null
        >`(SELECT name FROM layerI18n WHERE layerId=fieldResearchSession.layerId ORDER BY locale='en' DESC LIMIT 1)`,
        creatorName: sql<
          string | null
        >`(SELECT COALESCE(NULLIF(name,''),displayUsername,username) FROM user WHERE id=${sessions.createdBy})`,
        creatorImage: sql<
          string | null
        >`(SELECT image FROM user WHERE id=${sessions.createdBy})`,
      })
      .from(sessions)
      .where(
        and(
          researchProjectAccess(ctx, sql`${sessions.projectId}`),
          input.archive === 'all'
            ? undefined
            : eq(sessions.isArchived, input.archive === 'archived'),
          input.creatorId ? eq(sessions.createdBy, input.creatorId) : undefined,
          input.organisationId
            ? eq(sessions.organisationId, input.organisationId)
            : undefined,
          input.projectId ? eq(sessions.projectId, input.projectId) : undefined,
          input.layerId ? eq(sessions.layerId, input.layerId) : undefined,
          input.prisms?.organisation.length
            ? sql`${sessions.organisationId} IN (SELECT value FROM json_each(${JSON.stringify(input.prisms.organisation)}))`
            : undefined,
          input.prisms?.project.length
            ? sql`${sessions.projectId} IN (SELECT value FROM json_each(${JSON.stringify(input.prisms.project)}))`
            : undefined,
          input.hasRecords === undefined
            ? undefined
            : input.hasRecords
              ? sql`EXISTS (SELECT 1 FROM fieldResearchRecord WHERE archivedAt IS NULL AND sessionId=${sessions.id})`
              : sql`NOT EXISTS (SELECT 1 FROM fieldResearchRecord WHERE archivedAt IS NULL AND sessionId=${sessions.id})`,
          input.query?.trim()
            ? sql`instr(lower(${sessions.name}),lower(${input.query.trim()})) > 0`
            : undefined,
          input.before
            ? sql`(${column},${sessions.id}) ${comparison} (SELECT ${cursorColumn},id FROM fieldResearchSession WHERE id=${input.before} AND ${researchProjectAccess(ctx, sql`fieldResearchSession.projectId`)})`
            : undefined,
        ),
      )
      .orderBy(direction(column), direction(sessions.id))
      .limit(50)
  },
)

/** List filter choices only from sessions the current actor can manage.
 * @param input Selected associations. @returns Choices matching the other facets across all authorized pages.
 */
export const getResearchSessionFilters = guardedQuery(
  z.object({
    archive: z.enum(['active', 'archived', 'all']).default('active'),
    creatorId: id.optional(),
    organisationId: id.optional(),
    projectId: id.optional(),
    layerId: id.optional(),
    prisms: sessionPrisms.optional(),
    hasRecords: z.boolean().optional(),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    if (input.archive !== 'active' && !ctx.user.superAdmin)
      error(403, 'Only super admins can view archived sessions.')
    /** Build a facet scope excluding its own selection so that choice remains editable.
     * @param facet Facet whose available choices are requested.
     * @returns Authorization and other selected association predicates.
     */
    const scope = (facet: keyof typeof input) =>
      and(
        researchProjectAccess(ctx, sql`s.projectId`),
        sessionPrismScope(input.prisms),
        input.hasRecords === undefined
          ? undefined
          : input.hasRecords
            ? sql`EXISTS (SELECT 1 FROM fieldResearchRecord WHERE archivedAt IS NULL AND sessionId=s.id)`
            : sql`NOT EXISTS (SELECT 1 FROM fieldResearchRecord WHERE archivedAt IS NULL AND sessionId=s.id)`,
        input.archive === 'all'
          ? undefined
          : sql`s.isArchived=${input.archive === 'archived' ? 1 : 0}`,
        facet !== 'creatorId' && input.creatorId
          ? sql`s.createdBy=${input.creatorId}`
          : undefined,
        facet !== 'organisationId' && input.organisationId
          ? sql`s.organisationId=${input.organisationId}`
          : undefined,
        facet !== 'projectId' && input.projectId
          ? sql`s.projectId=${input.projectId}`
          : undefined,
        facet !== 'layerId' && input.layerId
          ? sql`s.layerId=${input.layerId}`
          : undefined,
      )
    // Distinct scoped choices avoid loading all session records into the browser.
    const [creators, organisations, projects, layers] = await Promise.all([
      ctx.db.all<{ value: string; label: string }>(
        sql`SELECT DISTINCT s.createdBy value,COALESCE(NULLIF(u.name,''),u.displayUsername,u.username,s.createdBy) label FROM fieldResearchSession s LEFT JOIN user u ON u.id=s.createdBy WHERE ${scope('creatorId')} ORDER BY label`,
      ),
      ctx.db.all<{ value: string; label: string }>(
        sql`SELECT DISTINCT s.organisationId value,COALESCE((SELECT name FROM organisationI18n WHERE organisationId=s.organisationId ORDER BY locale='en' DESC LIMIT 1),s.organisationId) label FROM fieldResearchSession s WHERE ${scope('organisationId')} ORDER BY label`,
      ),
      ctx.db.all<{ value: string; label: string }>(
        sql`SELECT DISTINCT s.projectId value,COALESCE((SELECT name FROM projectI18n WHERE projectId=s.projectId ORDER BY locale='en' DESC LIMIT 1),s.projectId) label FROM fieldResearchSession s WHERE ${scope('projectId')} ORDER BY label`,
      ),
      ctx.db.all<{ value: string; label: string }>(
        sql`SELECT DISTINCT s.layerId value,COALESCE((SELECT name FROM layerI18n WHERE layerId=s.layerId ORDER BY locale='en' DESC LIMIT 1),s.layerId) label FROM fieldResearchSession s WHERE s.layerId IS NOT NULL AND ${scope('layerId')} ORDER BY label`,
      ),
    ])
    return { creators, organisations, projects, layers }
  },
)

/** Archive or restore selected sessions with the same project-edit authority as the index.
 * @param input Selected session revisions and desired archive state.
 * @returns Number of changed sessions; stale or unauthorized selections change nothing.
 */
export const archiveResearchSessions = guardedCommand(
  z.object({
    sessions: z
      .array(z.object({ id, revision: z.number().int().nonnegative() }))
      .min(1)
      .max(5000),
    archived: z.boolean(),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    if (!input.archived && !ctx.user.superAdmin)
      error(403, 'Only super admins can restore archived sessions.')
    const changed = await setResearchSessionsArchived(
      ctx,
      input.sessions,
      input.archived,
    )
    if (!changed)
      error(
        409,
        'Some sessions changed or are no longer editable. Refresh and select them again.',
      )
    return { count: new Set(input.sessions.map(session => session.id)).size }
  },
)

/** Create an internal research session with its setup destination, without creating a Feature.
 * @param input Client-generated retry identity, internal name and owning project.
 * @returns Retained session identity.
 */
export const createResearchSession = guardedCommand(
  z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    projectId: id,
    layerId: id.optional(),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    const scope = await ctx.db.get<{ organisationId: string }>(
      sql`SELECT p.organisationId FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${input.projectId} AND p.isArchived=0 AND o.isArchived=0 AND ${researchProjectAccess(ctx, sql`p.id`)}`,
    )
    if (!scope) error(400, 'Choose an active project')
    if (
      input.layerId &&
      !(await ctx.db.get(
        sql`SELECT id FROM layer WHERE id=${input.layerId} AND projectId=${input.projectId} AND organisationId=${scope.organisationId} AND isArchived=0 AND historicalSourceLayerId IS NULL`,
      ))
    )
      error(400, 'Choose an active layer in this project')
    const now = new Date().toISOString()
    const insert = ctx.db
      .insert(sessions)
      .values({
        ...input,
        layerId:
          input.layerId ?? firstResearchLayerSQL(input.projectId, scope.organisationId),
        organisationId: scope.organisationId,
        createdBy: ctx.user.id,
        configurationVersion: researchConfigurationVersion,
        createdAt: now,
        updatedAt: now,
        status: 'uploading',
      })
      .onConflictDoNothing()
    const created = await executeRevisionBatch(
      ctx.db,
      sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${input.projectId} AND p.organisationId=${scope.organisationId} AND p.isArchived=0 AND o.isArchived=0) AND NOT EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${input.id} AND (projectId!=${input.projectId} OR createdBy!=${ctx.user.id}))`,
      [
        insert,
        // Include every eligible layer only on the initial insert; retries preserve saved choices.
        ctx.db
          .insert(sessionLayers)
          .select(
            initialResearchLayersSQL(input.id, input.projectId, scope.organisationId),
          ),
      ],
    )
    if (!created)
      error(409, 'The project changed. Refresh before creating this session.')
    const session = await readResearchSession(ctx.db, input.id)
    if (session.projectId !== input.projectId || session.createdBy !== ctx.user.id)
      error(409, 'Session identity already in use')
    return session
  },
)

/** Read configuration and all configured project layers for an authorized session.
 * @param input Session identity and optional revision cache key. @returns Session settings, project properties and layer choices.
 */
export const getResearchConfiguration = guardedQuery(
  z.object({ sessionId: id, revision: z.number().int().nonnegative().optional() }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    const session = await readResearchSession(ctx.db, input.sessionId)
    const version = session.configurationVersion
    if (version !== researchConfigurationVersion)
      return {
        version,
        currentVersion: researchConfigurationVersion,
        settings: null,
        configuredLayers: [],
        properties: [],
        types: [],
        layerPropertyDefaults: {},
      }
    const stored = await ctx.db
      .select({ code: sessions.code, configuration: sessions.configuration })
      .from(sessions)
      .where(eq(sessions.id, input.sessionId))
      .get()
    const configuredLayers = await ctx.db
      .select()
      .from(sessionLayers)
      .where(eq(sessionLayers.sessionId, input.sessionId))
    const [resolvedProperties, projectAssignments, policy] = await Promise.all([
      listResolvedProjectProperties(ctx.db, session.projectId),
      ctx.db.all<{ propertyId: string }>(
        sql`SELECT propertyId FROM projectProperty WHERE projectId=${session.projectId}`,
      ),
      readFeatureIntentPolicy(ctx.db, { type: 'project', id: session.projectId }),
    ])
    // Only project-owned or explicitly added and enabled inherited fields belong in session configuration.
    const assignedIds = new Set(projectAssignments.map(row => row.propertyId))
    const properties = researchProjectProperties(resolvedProperties, assignedIds)
    // Read active field assignments from the project's layers, without conflating public contribution permissions.
    const assignments = await ctx.db.all<{
      layerId: string
      propertyId: string
      isVisible: number
    }>(
      sql`SELECT lp.layerId,lp.propertyId,lp.isVisible FROM layerProperty lp JOIN layer l ON l.id=lp.layerId
        WHERE l.projectId=${session.projectId} AND l.organisationId=${session.organisationId}
        AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL`,
    )
    const layerPropertyDefaults: Record<
      string,
      Record<string, { isVisible: boolean; isRecordable: boolean }>
    > = {}
    for (const assignment of assignments) {
      if (!properties.some(property => property.id === assignment.propertyId)) continue
      layerPropertyDefaults[assignment.layerId] ??= {}
      layerPropertyDefaults[assignment.layerId][assignment.propertyId] = {
        isVisible: Boolean(assignment.isVisible),
        isRecordable: Boolean(assignment.isVisible),
      }
    }
    return {
      version,
      currentVersion: researchConfigurationVersion,
      settings:
        stored?.code && stored.configuration
          ? { ...stored.configuration, code: stored.code }
          : null,
      layerPropertyDefaults,
      configuredLayers,
      properties,
      types: policy.types,
    }
  },
)

const configurationInput = sessionRevision.extend({
  settings: researchConfigurationSchema,
  layers: z
    .array(
      z.object({
        layerId: id,
        isDefault: z.boolean(),
        overrides: researchLayerOverridesSchema,
      }),
    )
    .max(100),
})

/** Validate and atomically replace the complete configuration with a version/revision fence.
 * @param input Validated settings and configured layers. @param ctx Authorized request.
 * @param expectedVersion Source schema version. @returns Once the batch has committed.
 */
async function writeConfiguration(
  input: z.infer<typeof configurationInput>,
  ctx: GuardedBaseContext,
  expectedVersion: number,
): Promise<void> {
  requireResearch(ctx)
  await requireResearchSessionAccess(ctx, input.sessionId)
  const session = await readResearchSession(ctx.db, input.sessionId)
  if (
    new Set(input.layers.map(layer => layer.layerId)).size !== input.layers.length ||
    input.layers.filter(layer => layer.isDefault).length > 1
  )
    error(400, 'Choose distinct layers and at most one default layer.')
  const properties = await listResolvedProjectProperties(ctx.db, session.projectId)
  const byId = new Map(properties.map(property => [property.id, property]))
  for (const settings of [
    input.settings.properties,
    ...input.layers.map(layer => layer.overrides.properties),
  ]) {
    for (const [id, setting] of Object.entries(settings)) {
      const property = byId.get(id)
      if (!property || !validResearchPropertyDefault(property, setting.defaultValue))
        error(
          400,
          'Choose an available project property and a compatible default for ' +
            id +
            '.',
        )
    }
  }
  const projectPolicy = await readFeatureIntentPolicy(ctx.db, {
    type: 'project',
    id: session.projectId,
  })
  requireFeatureType(projectPolicy.types, input.settings.defaults.featureType)
  for (const layer of input.layers) {
    const valid = await ctx.db.get(
      sql`SELECT id FROM layer WHERE id=${layer.layerId} AND projectId=${session.projectId} AND organisationId=${session.organisationId} AND isArchived=0 AND historicalSourceLayerId IS NULL`,
    )
    if (!valid) error(400, 'Choose active layers in this project.')
    const policy = await readFeatureIntentPolicy(ctx.db, {
      type: 'layer',
      id: layer.layerId,
    })
    requireFeatureType(
      policy.types,
      layer.overrides.defaults.featureType ?? input.settings.defaults.featureType,
    )
  }
  const { code, ...configuration } = input.settings
  const defaultLayer = input.layers.find(layer => layer.isDefault)?.layerId ?? null
  const committed = await executeRevisionBatch(
    ctx.db,
    sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${session.id} AND revision=${input.revision} AND configurationVersion=${expectedVersion} AND (status!='completed' OR ${expectedVersion !== researchConfigurationVersion ? 1 : 0}) AND isArchived=0) AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(input.layers.map(layer => layer.layerId))}) chosen LEFT JOIN layer l ON l.id=chosen.value AND l.projectId=${session.projectId} AND l.organisationId=${session.organisationId} AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL WHERE l.id IS NULL)`,
    [
      ctx.db.insert(history).values({
        sessionId: session.id,
        revision: input.revision,
        schemaVersion: expectedVersion,
        code: sql`(SELECT code FROM fieldResearchSession WHERE id=${session.id})`,
        configuration: sql`(SELECT configuration FROM fieldResearchSession WHERE id=${session.id})`,
        layers: sql`(SELECT json_group_array(json_object('layerId',layerId,'isDefault',isDefault,'overrides',overrides)) FROM fieldResearchSessionLayer WHERE sessionId=${session.id})`,
      }),
      ctx.db.delete(sessionLayers).where(eq(sessionLayers.sessionId, session.id)),
      ...input.layers.map(layer =>
        ctx.db.insert(sessionLayers).values({ sessionId: session.id, ...layer }),
      ),
      ctx.db
        .update(sessions)
        .set({
          code,
          configuration,
          configurationVersion: researchConfigurationVersion,
          layerId: defaultLayer,
          revision: sql`${sessions.revision}+1`,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(sessions.id, session.id)),
    ],
  )
  if (!committed)
    error(
      409,
      'The session, its schema version or its layers changed. Refresh and retry.',
    )
}

/** Save settings only for a session on the current configuration schema.
 * @param input Current revision, settings and layer overrides. @returns Once saved.
 */
export const saveResearchConfiguration = guardedCommand(
  configurationInput.extend({ schemaVersion: z.literal(researchConfigurationVersion) }),
  (input, ctx) => writeConfiguration(input, ctx, researchConfigurationVersion),
)

const migrationInput = sessionRevision.extend({
  from: z.number().int().nonnegative(),
  to: z.literal(researchConfigurationVersion),
})

/** Compute the same migration for preview and apply, always from server-side persisted data.
 * @param input Reviewed session revision and version pair. @param ctx Authenticated request.
 * @returns Valid target settings and changes for the reviewer.
 */
async function planMigration(
  input: z.infer<typeof migrationInput>,
  ctx: GuardedBaseContext,
): Promise<ReturnType<typeof migrateResearchSettings> & { token: string }> {
  requireResearch(ctx)
  await requireResearchSessionAccess(ctx, input.sessionId)
  const session = await readResearchSession(ctx.db, input.sessionId)
  if (
    session.revision !== input.revision ||
    session.configurationVersion !== input.from ||
    input.from >= input.to
  )
    error(409, 'Refresh the session before migrating its configuration.')
  const [stored, rows, properties, project, layers] = await Promise.all([
    ctx.db.get<{ code: string | null; configuration: string | null }>(
      sql`SELECT code,configuration FROM fieldResearchSession WHERE id=${session.id}`,
    ),
    ctx.db.all<{ layerId: string; isDefault: number; overrides: string }>(
      sql`SELECT layerId,isDefault,overrides FROM fieldResearchSessionLayer WHERE sessionId=${session.id} ORDER BY layerId`,
    ),
    listResolvedProjectProperties(ctx.db, session.projectId),
    readFeatureIntentPolicy(ctx.db, { type: 'project', id: session.projectId }),
    ctx.db.all<{ id: string }>(
      sql`SELECT id FROM layer WHERE projectId=${session.projectId} AND organisationId=${session.organisationId} AND isArchived=0 AND historicalSourceLayerId IS NULL AND id IN (SELECT layerId FROM fieldResearchSessionLayer WHERE sessionId=${session.id})`,
    ),
  ])
  const enabled = (policy: typeof project): string[] =>
    policy.types.filter(type => type.enabled !== false).map(type => type.id)
  const policies = await Promise.all(
    layers.map(
      async layer =>
        [
          layer.id,
          enabled(
            await readFeatureIntentPolicy(ctx.db, { type: 'layer', id: layer.id }),
          ),
        ] as const,
    ),
  )
  const unreadable: string[] = []
  // A historical blob may not decode as an object. Its original bytes are kept in history on apply.
  /** Decode historical settings safely before target validation.
   * @param raw Stored JSON. @param path Review label. @returns Object members or an empty fallback.
   */
  function decode(
    raw: string | null | undefined,
    path: string,
  ): Record<string, unknown> {
    if (raw == null) return {}
    try {
      const value: unknown = JSON.parse(raw)
      if (value && typeof value === 'object' && !Array.isArray(value))
        return value as Record<string, unknown>
    } catch {
      /* Report the field and supply target defaults below. */
    }
    unreadable.push(path)
    return {}
  }
  const plan = migrateResearchSettings(
    {
      settings: {
        ...decode(stored?.configuration, 'session.configuration'),
        code: stored?.code,
      },
      layers: rows.map(row => ({
        ...row,
        isDefault: Boolean(row.isDefault),
        overrides: decode(row.overrides, 'layers.' + row.layerId + '.overrides'),
      })),
    },
    input.from,
    input.to,
    session.id,
    { properties, types: enabled(project), layers: new Map(policies) },
  )
  plan.removed.push(...unreadable)
  // A catalogue edit can change the preview even when the session revision stays the same.
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(plan)),
  )
  const token = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return { ...plan, token }
}

/** Preview a specific schema upgrade without changing stored data.
 * @param input Session revision and version pair. @returns Proposed changes and review token.
 */
export const previewResearchMigration = guardedQuery(migrationInput, planMigration)

/** Apply exactly the migration reviewed for this session, retaining its source in history.
 * @param input Source/target versions, revision and preview token. @returns Once migrated.
 */
export const migrateResearchConfiguration = guardedCommand(
  migrationInput.extend({ token: z.string().length(64) }),
  async (input, ctx) => {
    const plan = await planMigration(input, ctx)
    if (input.token !== plan.token)
      error(409, 'The migration preview changed. Review it again.')
    await writeConfiguration(
      configurationInput.parse({
        ...input,
        settings: plan.settings,
        layers: plan.layers,
      }),
      ctx,
      input.from,
    )
  },
)

/** Read session metadata without decoding version-specific settings.
 * @param input Session identity. @returns Session metadata.
 */
export const getResearchSession = guardedQuery(
  z.object({ sessionId: id }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    const session = await readResearchSession(ctx.db, input.sessionId)
    return { session }
  },
)

const recordFilters = z.object({
  sessionId: id,
  archived: z.boolean().optional(),
  setting: z.enum(['interior', 'exterior', 'unspecified']).optional(),
  search: z.string().trim().max(200).optional(),
})
const recordTitle = sql`(SELECT i.title FROM featureI18n i WHERE i.featureId=f.id AND i.title!=''
  ORDER BY i.locale='en' DESC,i.locale LIMIT 1)`

/** Share visibility, title resolution and filters between paging and select-all.
 * @param input Session and record filters. @param ctx Authenticated request.
 * @param showAddresses Include address labels when reading a page.
 * @returns Scoped joins, display address and predicates for record queries.
 */
async function recordScope(
  input: z.infer<typeof recordFilters>,
  ctx: GuardedBaseContext,
  showAddresses: boolean,
): Promise<{ scope: SQL; address: SQL }> {
  requireResearch(ctx)
  if (input.archived && !ctx.user.superAdmin)
    error(403, 'Archived records require super admin access.')
  await requireResearchSessionAccess(ctx, input.sessionId)
  // Resolve shared Location addresses once for the query, including addresses inherited from buildings.
  const located =
    showAddresses || input.search
      ? await ctx.db.all<{
          locationId: string
        }>(sql`SELECT DISTINCT locationId FROM fieldResearchRecord
      WHERE sessionId=${input.sessionId} AND (archivedAt IS NOT NULL)=${input.archived ? 1 : 0}
      AND locationId IS NOT NULL AND nullif(json_extract(pin,'$.unitAddress'),'') IS NULL`)
      : []
  const places = located.length
    ? recorderLocationAddresses(await listRecorderLocations(ctx, input.sessionId, true))
    : new Map<string, string>()
  const addresses = located.flatMap(({ locationId }) => {
    const label = places.get(locationId)
    return label ? [[locationId, label]] : []
  })
  const address = sql`coalesce(nullif(json_extract(r.pin,'$.unitAddress'),''), addr.value,
    (SELECT nullif(trim(i.displayAddress),'') FROM featureI18n i WHERE i.featureId=f.id AND trim(i.displayAddress)!=''
     ORDER BY i.locale='en' DESC,i.locale LIMIT 1))`
  const search = input.search
  const sequence = search?.match(/^#(\d+)$/)?.[1]
  const predicates = and(
    sql`r.sessionId=${input.sessionId}`,
    sql`(s.isArchived=0 OR ${ctx.user.superAdmin ? 1 : 0})`,
    researchProjectAccess(ctx, sql`s.projectId`),
    input.archived ? sql`r.archivedAt IS NOT NULL` : sql`r.archivedAt IS NULL`,
    input.setting === 'unspecified'
      ? sql`r.spatialRealm IS NULL`
      : input.setting
        ? sql`r.spatialRealm=${input.setting}`
        : undefined,
    search
      ? sql`(instr(lower(r.id),lower(${search}))>0 OR instr(lower(${recordTitle}),lower(${search}))>0
          OR instr(lower(${address}),lower(${search}))>0
          ${sequence ? sql`OR substr(coalesce(${recorderCaptureTitle},${recordTitle}),-${sequence.length + 1})=${`-${sequence}`}` : sql``})`
      : undefined,
  )
  const scope = sql`FROM fieldResearchRecord r JOIN fieldResearchSession s ON s.id=r.sessionId
    LEFT JOIN feature f ON f.id=r.featureId AND f.projectId=s.projectId AND f.organisationId=s.organisationId
    LEFT JOIN layer l ON l.id=f.layerId
    LEFT JOIN fieldResearchSessionLayer sl ON sl.sessionId=s.id AND sl.layerId=coalesce(l.historicalSourceLayerId,l.id)
    LEFT JOIN featureOrigin origin ON origin.featureId=f.id AND origin.origin='field_research' AND origin.originId=s.id
    LEFT JOIN json_each(${JSON.stringify(Object.fromEntries(addresses))}) addr ON addr.key=r.locationId
    WHERE ${predicates}`
  return { scope, address }
}

/** List captures for the session, including receipts created before Feature linking.
 * @param input Session filters and optional exclusive cursor from the preceding page.
 * @returns A page in reverse capture order, its cursor and the first page's matching count.
 */
export const getResearchRecords = guardedQuery(
  recordFilters.extend({ before: z.number().int().positive().optional() }),
  async (input, ctx) => {
    const { scope, address } = await recordScope(input, ctx, true)
    // Count matching receipts on the initial page only.
    const rows = await ctx.db.all<{
      cursor: number
      id: string
      featureId: string | null
      title: string | null
      recordedAt: string | null
      address: string | null
      titleTemplate: string | null
      captureTitle: string | null
      thumbnailRevision: string | null
      code: string | null
      spatialRealm: 'interior' | 'exterior' | null
      total: number | null
    }>(sql`SELECT r.rowid cursor, r.id, f.id featureId, r.spatialRealm, origin.recordedAt,
        ${recorderCardFields}, ${address} address, ${recordTitle} title, ${input.before ? sql`NULL` : sql`count(*) OVER ()`} total
      ${scope} ${input.before === undefined ? sql`` : sql`AND r.rowid<${input.before}`}
      ORDER BY r.rowid DESC LIMIT 51`)
    const records = rows
      .slice(0, 50)
      .map(({ code, captureTitle, titleTemplate, ...row }) => {
        const identifierTags = recorderIdentifierTags(
          captureTitle ?? row.title,
          code,
          titleTemplate,
        )
        const customTitle =
          identifierTags.length && (!row.title || row.title === captureTitle)
            ? null
            : row.title
        return { ...row, identifierTags, customTitle }
      })
    return {
      records,
      next: rows.length > records.length ? (records.at(-1)?.cursor ?? null) : null,
    }
  },
)

/** Collect all matching IDs for a single atomic bulk action, including undisplayed pages.
 * @param input Current session and filters. @returns Selected record IDs.
 */
export const getMatchingResearchRecordIds = guardedQuery(
  recordFilters,
  async (input, ctx) => {
    const { scope } = await recordScope(input, ctx, false)
    const rows = await ctx.db.all<{ id: string }>(sql`SELECT r.id ${scope} LIMIT 5001`)
    if (rows.length > 5000)
      error(400, 'Narrow your filters to select at most 5,000 records.')
    return rows.map(row => row.id)
  },
)

/** Change selected session receipts atomically, preserving independently managed Features.
 * @param input Session, observed archive state, selected record IDs and requested action.
 * @returns Number of changed records.
 */
export const updateResearchRecords = guardedCommand(
  z.object({
    sessionId: id,
    ids: z.array(id).min(1).max(5000),
    archived: z.boolean(),
    action: z.enum(['archive', 'restore', 'delete']),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    if ((input.action !== 'archive' || input.archived) && !ctx.user.superAdmin)
      error(403, 'Only super admins can restore or delete records.')
    if (input.action !== 'delete' && (input.action === 'archive') === input.archived)
      error(400, 'The selected action does not change the archive state.')
    const ids = [...new Set(input.ids)]
    const picked = sql`SELECT value FROM json_each(${JSON.stringify(ids)})`
    const selection = sql`sessionId=${input.sessionId} AND id IN (${picked})
      AND (archivedAt IS NOT NULL)=${input.archived ? 1 : 0}`
    // Recheck permission and membership for the entire selection inside the write transaction.
    const guard = sql`EXISTS(SELECT 1 FROM fieldResearchSession s WHERE s.id=${input.sessionId}
      AND s.isArchived=0 AND ${researchProjectAccess(ctx, sql`s.projectId`)})
      AND (SELECT count(*) FROM fieldResearchRecord WHERE ${selection})=${ids.length}`
    const now = new Date().toISOString()
    const changed = await executeRevisionBatch(ctx.db, guard, [
      input.action === 'delete'
        ? ctx.db.delete(captures).where(selection)
        : ctx.db
            .update(captures)
            .set({
              archivedAt: input.action === 'archive' ? now : null,
              archivedBy: input.action === 'archive' ? ctx.user.id : null,
            })
            .where(selection),
      ctx.db
        .update(sessions)
        .set({ updatedAt: now })
        .where(eq(sessions.id, input.sessionId)),
    ])
    if (!changed)
      error(
        409,
        'The selection changed or is no longer editable. Refresh and select the records again.',
      )
    return { count: ids.length }
  },
)

/** Rename, finish or reopen a retained session without changing its ownership.
 * @param input Observed revision and new internal name/status. @returns Nothing.
 */
export const updateResearchSession = guardedCommand(
  sessionRevision.extend({
    name: z.string().trim().min(1).max(200),
    completed: z.boolean(),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    const guard = sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${input.sessionId} AND revision=${input.revision} AND configurationVersion=${researchConfigurationVersion} AND isArchived=0)`
    const result = await executeRevisionBatch(ctx.db, guard, [
      ctx.db
        .update(sessions)
        .set({
          name: input.name,
          status: input.completed ? 'completed' : 'organising',
          completedAt: input.completed ? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
          revision: sql`${sessions.revision}+1`,
        })
        .where(eq(sessions.id, input.sessionId)),
    ])
    if (!result) error(409, 'Refresh the session and check its configuration version.')
  },
)
