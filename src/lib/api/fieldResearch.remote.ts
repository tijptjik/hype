// SVELTEKIT
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { and, asc, desc, eq, gt, sql, getTableColumns } from 'drizzle-orm'
// API
import { guardedCommand, guardedQuery } from './server/guarded.js'
// SCHEMA
import {
  fieldResearchSession as sessions,
  fieldResearchImage as images,
  fieldResearchStack as stacks,
} from '#lib/db/schema/fieldResearch.js'
// DOMAIN
import {
  researchProjectAccess,
  requireResearchSessionAccess,
} from '#lib/fieldResearch/access.js'
import { mergeResearchStacks } from '#lib/db/services/fieldResearch.js'
import { image as imageTable } from '#lib/db/schema/image.js'
import { ImageContextResource } from '#lib/enums.js'
import { ResearchCoordinatesSchema } from '#lib/fieldResearch/model.js'
// SERVICES
import { setResearchSessionsArchived } from '#lib/db/services/fieldResearchArchive.js'
import {
  readResearchSession,
  clusterResearchImages,
  moveResearchImage,
  placeResearchStack,
} from '#lib/db/services/fieldResearch.js'
import { convertResearchStack } from '#lib/db/services/fieldResearchConversion.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import { readFeatureIntentPolicy } from '#lib/db/services/featureIntentPolicy.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types.js'

// TABLE OF CONTENTS
// 1. Authorization and scope choices
// 2. Session reads and edits
// 3. Grouping and Feature conversion

const id = z.string().min(1).max(100)
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
      sql`SELECT l.id,COALESCE((SELECT name FROM layerI18n WHERE layerId=l.id ORDER BY locale='en' DESC LIMIT 1),l.id) name FROM layer l WHERE l.projectId=${session.projectId} AND l.organisationId=${session.organisationId} AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL ORDER BY name`,
    )
    return Promise.all(
      rows.map(async row => ({
        ...row,
        types: (await readFeatureIntentPolicy(ctx.db, { type: 'layer', id: row.id }))
          .types,
      })),
    )
  },
)

/** Browse retained sessions with a stable identity cursor.
 * @param input Optional cursor, name search, creator/destination filters and sort order. @returns A bounded session page with layer and creator display metadata.
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
    sortBy: z.enum(['createdAt', 'name']).default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).default('desc'),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    const column = input.sortBy === 'name' ? sessions.name : sessions.createdAt
    const cursorColumn = sql.raw(input.sortBy === 'name' ? 'name' : 'createdAt')
    const direction = input.sortOrder === 'asc' ? asc : desc
    const comparison = sql.raw(input.sortOrder === 'asc' ? '>' : '<')
    return ctx.db
      .select({
        ...getTableColumns(sessions),
        totalCount: sql<number>`count(*) over()`,
        photoCount: sql<number>`(SELECT count(*) FROM fieldResearchImage WHERE sessionId=fieldResearchSession.id)`,
        stackCount: sql<number>`(SELECT count(*) FROM fieldResearchStack s WHERE s.sessionId=fieldResearchSession.id AND EXISTS(SELECT 1 FROM fieldResearchImage i WHERE i.stackId=s.id))`,
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
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    /** Build a facet scope excluding its own selection so that choice remains editable.
     * @param facet Facet whose available choices are requested.
     * @returns Authorization and other selected association predicates.
     */
    const scope = (facet: keyof typeof input) =>
      and(
        researchProjectAccess(ctx, sql`s.projectId`),
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
        organisationId: scope.organisationId,
        createdBy: ctx.user.id,
        createdAt: now,
        updatedAt: now,
        status: 'uploading',
      })
      .onConflictDoNothing()
    const created = await executeRevisionBatch(
      ctx.db,
      sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${input.projectId} AND p.organisationId=${scope.organisationId} AND p.isArchived=0 AND o.isArchived=0)`,
      [insert],
    )
    if (!created)
      error(409, 'The project changed. Refresh before creating this session.')
    const session = await readResearchSession(ctx.db, input.id)
    if (session.projectId !== input.projectId || session.createdBy !== ctx.user.id)
      error(409, 'Session identity already in use')
    return session
  },
)

/** Read session metadata and working stacks; image payloads use a separate paginated query.
 * @param input Session identity. @returns Session and nonempty working stacks.
 */
export const getResearchSession = guardedQuery(
  z.object({ sessionId: id }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    const session = await readResearchSession(ctx.db, input.sessionId)
    const groups = await ctx.db
      .select()
      .from(stacks)
      .where(
        and(
          eq(stacks.sessionId, session.id),
          sql`EXISTS(SELECT 1 FROM fieldResearchImage WHERE stackId=${stacks.id})`,
        ),
      )
      .orderBy(stacks.createdAt, stacks.id)
    return { session, stacks: groups }
  },
)

/** Page capture records without loading original image bytes or Feature relations.
 * @param input Session and optional cursor. @returns Up to 200 lightweight capture rows.
 */
export const getResearchImages = guardedQuery(
  z.object({ sessionId: id, after: id.optional() }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    await readResearchSession(ctx.db, input.sessionId)
    return ctx.db
      .select()
      .from(images)
      .where(
        and(
          eq(images.sessionId, input.sessionId),
          input.after ? gt(images.id, input.after) : undefined,
        ),
      )
      .orderBy(images.id)
      .limit(200)
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
    const guard = sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${input.sessionId} AND revision=${input.revision}) AND (${input.completed ? sql`NOT EXISTS(SELECT 1 FROM fieldResearchImage i LEFT JOIN fieldResearchStack s ON s.id=i.stackId WHERE i.sessionId=${input.sessionId} AND (i.state!='uploaded' OR s.featureId IS NULL))` : sql`1`})`
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
    if (!result)
      error(409, 'Refresh the session; all images must be converted before completion.')
  },
)

/** Cluster only new ungrouped captures after their upload queue settles.
 * @param input Session revision. @returns Nothing after a successful suggestion pass.
 */
export const clusterResearchSession = guardedCommand(
  sessionRevision,
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    await clusterResearchImages(ctx.db, input.sessionId, input.revision)
  },
)

/** Move an image between working stacks or extract it into a singleton.
 * @param input Current revision, image and optional target stack. @returns Nothing.
 */
export const moveResearchCapture = guardedCommand(
  sessionRevision.extend({
    imageId: id,
    targetStackId: id.nullable(),
    coordinates: ResearchCoordinatesSchema.optional(),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    await moveResearchImage(ctx.db, input)
  },
)

/** Place a working stack while retaining each original image coordinate.
 * @param input Current revision, stack and chosen coordinates. @returns Nothing.
 */
export const placeResearchCapture = guardedCommand(
  sessionRevision.extend({ stackId: id, coordinates: ResearchCoordinatesSchema }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    await placeResearchStack(ctx.db, input)
  },
)

/** Convert one reviewed stack into an unpublished Feature and retain its receipt.
 * @param input Current revision, stack and chosen destination layer/type. @returns Feature ID.
 */
export const createResearchFeature = guardedCommand(
  sessionRevision.extend({ stackId: id, layerId: id, featureType: id }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    return convertResearchStack(ctx.db, { ...input, actorId: ctx.user.id })
  },
)

/** Retain provisional labels without creating or editing a Feature.
 * @param input Working stack and editable fields. @returns Nothing after a revision-fenced write.
 */
export const updateResearchStack = guardedCommand(
  sessionRevision.extend({
    stackId: id,
    name: z.string().max(200),
    featureType: z.string().max(100),
  }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    const committed = await executeRevisionBatch(
      ctx.db,
      sql`EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${input.sessionId} AND revision=${input.revision} AND status!='completed') AND EXISTS(SELECT 1 FROM fieldResearchStack WHERE id=${input.stackId} AND sessionId=${input.sessionId} AND featureId IS NULL)`,
      [
        ctx.db
          .update(stacks)
          .set({ name: input.name.trim(), featureType: input.featureType || null })
          .where(eq(stacks.id, input.stackId)),
        ctx.db
          .update(sessions)
          .set({
            revision: sql`${sessions.revision}+1`,
            updatedAt: new Date().toISOString(),
          })
          .where(eq(sessions.id, input.sessionId)),
      ],
    )
    if (!committed) error(409, 'The stack changed. Refresh before editing its details.')
  },
)

/** Set a legacy session's destination once, before entering map review.
 * @param input Session revision and initial layer. @returns Nothing.
 */
export const configureResearchLayer = guardedCommand(
  sessionRevision.extend({ layerId: id }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    const committed = await executeRevisionBatch(
      ctx.db,
      sql`EXISTS(SELECT 1 FROM fieldResearchSession s JOIN layer l ON l.projectId=s.projectId AND l.organisationId=s.organisationId WHERE s.id=${input.sessionId} AND s.revision=${input.revision} AND s.layerId IS NULL AND s.status!='completed' AND l.id=${input.layerId} AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL)`,
      [
        ctx.db
          .update(sessions)
          .set({ layerId: input.layerId, revision: sql`${sessions.revision}+1` })
          .where(eq(sessions.id, input.sessionId)),
      ],
    )
    if (!committed) error(409, 'Refresh the session before choosing its layer.')
  },
)

/** Convert all reviewed provisional stacks, retaining receipts so retries never duplicate Features.
 * @param input Session revision. @returns Number of newly created unpublished Features.
 * @remarks Each stack is atomic; a later failure leaves earlier receipts available for safe retry.
 */
export const saveResearchFeatures = guardedCommand(
  sessionRevision,
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    let session = await readResearchSession(ctx.db, input.sessionId)
    if (session.revision !== input.revision)
      error(409, 'Refresh before saving this session.')
    if (!session.layerId) error(400, 'Choose the session layer before saving.')
    const layerId = session.layerId
    const rows = await ctx.db
      .select()
      .from(stacks)
      .where(
        and(
          eq(stacks.sessionId, session.id),
          sql`${stacks.featureId} IS NULL`,
          sql`EXISTS(SELECT 1 FROM fieldResearchImage WHERE stackId=${stacks.id})`,
        ),
      )
    const policy = await readFeatureIntentPolicy(ctx.db, { type: 'layer', id: layerId })
    if (
      await ctx.db.get(
        sql`SELECT id FROM fieldResearchImage WHERE sessionId=${session.id} AND (state!='uploaded' OR stackId IS NULL) LIMIT 1`,
      )
    )
      error(400, 'Finish uploading and grouping all images first.')
    for (const row of rows) {
      if (row.longitude === null || row.latitude === null)
        error(400, 'Place every stack on the map before saving.')
      if (
        !policy.types.some(
          type => type.id === row.featureType && type.enabled !== false,
        )
      )
        error(400, 'Choose a Feature type for every stack before saving.')
    }
    for (const row of rows) {
      await convertResearchStack(ctx.db, {
        sessionId: session.id,
        revision: session.revision,
        stackId: row.id,
        layerId,
        featureType: row.featureType!,
        actorId: ctx.user.id,
      })
      session = await readResearchSession(ctx.db, session.id)
    }
    return { created: rows.length }
  },
)

/** Browse authorized layer destinations with their owning organisation image.
 * @param input Empty options. @returns Layer suggestions grouped visually by project.
 */
export const getResearchDestinations = guardedQuery(z.object({}), async (_, ctx) => {
  requireResearch(ctx)
  const rows = await ctx.db.all<{
    id: string
    projectId: string
    organisationId: string
    name: string
    projectName: string
    organisationImageId: string | null
  }>(
    sql`SELECT l.id,l.projectId,l.organisationId,o.imageId organisationImageId,COALESCE((SELECT name FROM layerI18n WHERE layerId=l.id ORDER BY locale='en' DESC LIMIT 1),l.id) name,COALESCE((SELECT name FROM projectI18n WHERE projectId=p.id ORDER BY locale='en' DESC LIMIT 1),p.id) projectName FROM layer l JOIN project p ON p.id=l.projectId JOIN organisation o ON o.id=p.organisationId WHERE l.isArchived=0 AND l.historicalSourceLayerId IS NULL AND p.isArchived=0 AND o.isArchived=0 AND ${researchProjectAccess(ctx, sql`p.id`)} ORDER BY projectName,name`,
  )
  const icons = new Map<string, Promise<typeof imageTable.$inferSelect | undefined>>()
  return Promise.all(
    rows.map(async row => {
      if (row.organisationImageId && !icons.has(row.organisationImageId))
        icons.set(
          row.organisationImageId,
          ctx.db
            .select()
            .from(imageTable)
            .where(eq(imageTable.id, row.organisationImageId))
            .get(),
        )
      const image = row.organisationImageId
        ? await icons.get(row.organisationImageId)
        : undefined
      return {
        ...row,
        organisationImage: image
          ? {
              ctxType: ImageContextResource.organisation,
              ctxId: row.organisationId,
              image,
            }
          : null,
      }
    }),
  )
})

/** Merge a complete working stack into another without changing the target marker.
 * @param input Session revision and source/target stack identities. @returns Nothing.
 */
export const mergeResearchCaptures = guardedCommand(
  sessionRevision.extend({ sourceStackId: id, targetStackId: id }),
  async (input, ctx) => {
    requireResearch(ctx)
    await requireResearchSessionAccess(ctx, input.sessionId)
    await mergeResearchStacks(ctx.db, input)
  },
)
