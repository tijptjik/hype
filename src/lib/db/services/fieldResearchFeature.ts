// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  fieldResearchRecord,
  fieldResearchSession,
  featureOrigin,
} from '../schema/fieldResearch'
// DOMAIN
import { researchProjectAccess } from '#lib/fieldResearch/access.js'
import {
  type ResearchConfiguration,
  researchConfigurationSchema,
  researchConfigurationVersion,
  researchLayerOverridesSchema,
  resolveResearchConfiguration,
} from '#lib/fieldResearch/configuration.js'
import { validResearchPropertyDefault } from '#lib/fieldResearch/configurationMigration.js'
import { requireFeatureType } from '#lib/features/intents.js'
import {
  renderDisplayTemplate,
  type TemplateScalar,
} from '#lib/templates/displayTemplate.js'
import {
  isRangeProperty,
  normalizeRangeValue,
  rangeText,
} from '#lib/properties/range.js'
import { normalizeLinkValue, displayLinkValue } from '#lib/properties/value.js'
import { encodePropertySelection } from '#lib/properties/selection.js'
// SERVICES
import { prepareFeatureCreationContent } from './featureCreationRevision'
import { prepareNewLifecycleFeature } from './featureLifecycleIdentity'
import { readFeatureIntentPolicy } from './featureIntentPolicy'
import { listResolvedProjectProperties } from './property'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type { NewFeatureProperty } from '../zod/schema/feature.types'

type Context = Parameters<typeof researchProjectAccess>[0] & { db: Database }
type CaptureContext = {
  projectId: string
  organisationId: string
  revision: number
  recordSequence: number
  configurationVersion: number
  configuration: string | null
  code: string | null
  layerId: string | null
  overrides: string | null
}

// TABLE OF CONTENTS
// 1. Translate session defaults into Feature properties and a title
// 2. Commit a provisional Feature and its session receipt

/** Translate effective settings using the same property representations as the Feature editor.
 * @param db Request database. @param projectId Authoritative project. @param settings Resolved layer configuration.
 * @param sequence Next session ordinal. @returns Materialized properties and initial title.
 */
async function prepareRecordingFields(
  db: Database,
  projectId: string,
  settings: ResearchConfiguration,
  sequence: number,
): Promise<{ properties: NewFeatureProperty[]; title: string }> {
  const values: Record<string, TemplateScalar> = {
    'session.sequence': sequence,
    'session.code': settings.code,
  }
  const properties: NewFeatureProperty[] = []
  const defaults = Object.entries(settings.properties).filter(
    ([, setting]) => setting.isRecordable && setting.defaultValue != null,
  )
  if (defaults.length) {
    const catalogue = new Map(
      (await listResolvedProjectProperties(db, projectId)).map(row => [row.id, row]),
    )
    for (const [propertyId, setting] of defaults) {
      const value = setting.defaultValue
      const property = catalogue.get(propertyId)
      if (!property || !validResearchPropertyDefault(property, value))
        error(
          409,
          'Review the session default for property ' +
            propertyId +
            ' before recording.',
        )
      if (value == null) continue
      const choice =
        Boolean(property.values?.length) ||
        (property.type === 'classifier' && property.dataType !== 'boolean')
      const label = (id: string) => {
        const option = property.values?.find(item => item.id === id)
        return option?.i18n?.en?.value || option?.value || id
      }
      values['properties.' + propertyId] = Array.isArray(value)
        ? value.map(label).join(', ')
        : choice
          ? label(String(value))
          : value
      if (Array.isArray(value)) {
        if (value.length)
          properties.push({ propertyId, valueJson: encodePropertySelection(value) })
      } else if (choice) properties.push({ propertyId, propertyValueId: String(value) })
      else if (isRangeProperty(property)) {
        properties.push({
          propertyId,
          valueJson: normalizeRangeValue(property, String(value)),
        })
        values['properties.' + propertyId] = rangeText(property, String(value))
      } else if (property.dataType === 'link') {
        properties.push({
          propertyId,
          valueJson: normalizeLinkValue(property, String(value)),
        })
        const display = displayLinkValue(property, String(value), ['en'])
        values['properties.' + propertyId] =
          display.kind === 'links'
            ? display.links.map(link => link.label).join(', ')
            : ''
      } else if (property.isTranslatable && property.type !== 'classifier')
        properties.push({
          propertyId,
          i18n: { en: { value: String(value), valueGen: false } },
        })
      else properties.push({ propertyId, value: String(value) })
    }
  }
  const title = renderDisplayTemplate(settings.titleTemplate, values).trim()
  if (!title)
    error(409, 'The configured title template produced an empty Feature title.')
  return { properties, title }
}

/** Create an unpublished Feature and session receipt in one transaction. Device IDs are retry keys.
 * @param ctx Signed-in contributor. @param sessionId Session identity. @param id Stable device request.
 * @param requestedLayer Configured recording layer. @returns Persisted record ID.
 */
export async function createRecorderRecord(
  ctx: Context,
  sessionId: string,
  id: string,
  requestedLayer?: string,
): Promise<string> {
  const access = researchProjectAccess(ctx, sql`s.projectId`)
  const receipt = () =>
    ctx.db.get<{ featureId: string | null }>(
      sql`SELECT r.featureId FROM fieldResearchRecord r JOIN fieldResearchSession s ON s.id=r.sessionId WHERE r.id=${id} AND s.id=${sessionId} AND s.isArchived=0 AND ${access}`,
    )
  const existing = await receipt()
  if (existing?.featureId) return id
  const session =
    await ctx.db.get<CaptureContext>(sql`SELECT s.projectId,s.organisationId,s.revision,s.recordSequence,s.configurationVersion,s.code,s.configuration,l.id layerId,sl.overrides
    FROM fieldResearchSession s JOIN project p ON p.id=s.projectId AND p.organisationId=s.organisationId AND p.isArchived=0
    JOIN organisation o ON o.id=s.organisationId AND o.isArchived=0
    LEFT JOIN fieldResearchSessionLayer sl ON sl.sessionId=s.id AND sl.layerId=coalesce(${requestedLayer ?? null},s.layerId)
    LEFT JOIN layer l ON l.id=sl.layerId AND l.projectId=p.id AND l.organisationId=o.id AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL
    WHERE s.id=${sessionId} AND s.isArchived=0 AND s.status!='completed' AND ${access}`)
  if (!session) error(403, 'Recording unavailable for this session.')
  if (session.configurationVersion !== researchConfigurationVersion)
    error(409, 'Migrate the session configuration in Field Sessions before recording.')
  if (!session.configuration || !session.code || !session.layerId || !session.overrides)
    error(
      409,
      'Save the session settings and choose a configured layer before recording.',
    )
  const settings = resolveResearchConfiguration(
    researchConfigurationSchema.parse({
      ...JSON.parse(session.configuration),
      code: session.code,
    }),
    researchLayerOverridesSchema.parse(JSON.parse(session.overrides)),
  )
  const policy = await readFeatureIntentPolicy(ctx.db, {
    type: 'layer',
    id: session.layerId,
  })
  const type = requireFeatureType(policy.types, settings.defaults.featureType)
  const sequence = session.recordSequence + 1
  const { properties, title } = await prepareRecordingFields(
    ctx.db,
    session.projectId,
    settings,
    sequence,
  )
  const scope = {
    organisationId: session.organisationId,
    projectId: session.projectId,
    layerId: session.layerId,
  }
  const featureId = crypto.randomUUID()
  const kind = type.kind ?? (type.id === 'business' ? 'place' : 'object')
  const { content, checks } = await prepareFeatureCreationContent(ctx.db, {
    id: featureId,
    data: {
      ...scope,
      ...settings.defaults,
      id: featureId,
      contributorId: ctx.user.id,
      kind,
      associationRelation:
        type.relation ?? (kind === 'place' ? 'represents' : 'locatedAt'),
      geometry: { type: 'GeometryCollection', geometries: [] },
      addressMeta: {},
      isPublished: false,
      isArchived: false,
      visitableAsOf: settings.defaults.isVisitable
        ? new Date().toISOString().slice(0, 10)
        : null,
    },
    properties,
    i18n: { en: { title, baseName: title, titleGen: false, description: '' } },
  })
  // Fence the ordinal, configuration, destination, policy and retry key before creating either row.
  const guard = sql`EXISTS(SELECT 1 FROM fieldResearchSession s JOIN project p ON p.id=s.projectId AND p.organisationId=s.organisationId JOIN organisation o ON o.id=p.organisationId JOIN layer l ON l.id=${scope.layerId} AND l.projectId=p.id AND l.organisationId=o.id
    WHERE s.id=${sessionId} AND s.revision=${session.revision} AND s.recordSequence=${session.recordSequence} AND s.configurationVersion=${researchConfigurationVersion} AND s.isArchived=0 AND s.status!='completed' AND p.isArchived=0 AND o.isArchived=0 AND l.isArchived=0 AND l.historicalSourceLayerId IS NULL AND ${access})
    AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(policy.lineage)}) entry WHERE coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=json_extract(entry.value,'$.scope.type') AND scopeId=json_extract(entry.value,'$.scope.id')),0)!=json_extract(entry.value,'$.version'))
    AND NOT EXISTS(SELECT 1 FROM fieldResearchRecord WHERE id=${id} AND (sessionId!=${sessionId} OR featureId IS NOT NULL))`
  const plan = await prepareNewLifecycleFeature(ctx.db, {
    featureId,
    scope,
    content,
    guard,
    actorId: ctx.user.id,
    contributorId: ctx.user.id,
    isDraft: settings.defaults.isDraft,
    isPendingReview: settings.defaults.isPendingReview,
    reason: 'Field research capture',
  })
  const committed = await executeRevisionBatch(ctx.db, guard, [
    ...checks,
    ...plan.statements,
    ctx.db.insert(featureOrigin).values({
      featureId,
      origin: 'field_research',
      originId: sessionId,
      recordedAt: new Date().toISOString(),
      recordedBy: ctx.user.id,
    }),
    existing
      ? ctx.db
          .update(fieldResearchRecord)
          .set({ featureId })
          .where(eq(fieldResearchRecord.id, id))
      : ctx.db.insert(fieldResearchRecord).values({ id, sessionId, featureId }),
    ctx.db
      .update(fieldResearchSession)
      .set({ recordSequence: sequence, updatedAt: new Date().toISOString() })
      .where(eq(fieldResearchSession.id, sessionId)),
  ])
  if (!committed && !(await receipt())?.featureId)
    error(409, 'The session changed. Retry the capture.')
  return id
}
