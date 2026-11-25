// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// DOMAIN
import { researchProjectAccess } from '#lib/fieldResearch/access.js'
import {
  researchConfigurationSchema,
  researchLayerOverridesSchema,
  resolveResearchConfiguration,
} from '#lib/fieldResearch/configuration.js'
import { validResearchPropertyDefault } from '#lib/fieldResearch/configurationMigration.js'
import { requireFeatureType } from '#lib/features/intents.js'
import {
  encodePropertySelection,
  selectedPropertyValueIds,
} from '#lib/properties/selection.js'
import { isRangeProperty, normalizeRangeValue } from '#lib/properties/range.js'
import { normalizeLinkValue } from '#lib/properties/value.js'
// SCHEMA
import { feature } from '../schema/feature'
import { fieldResearchSession } from '../schema/fieldResearch'
// SERVICES
import { readCurrentFeatureRevision, prepareFeatureEdit } from './featureLifecycle'
import { prepareFeatureEditorialProjection } from './featureRevisionProjection'
import { readFeatureIntentPolicy } from './featureIntentPolicy'
import { listResolvedProjectProperties } from './property'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  RecorderEditor,
  RecorderEdit,
  RecorderFieldValue,
} from '#lib/fieldResearch/recorderEditor.js'
import type { Property } from '../zod/schema/property.types'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'

type Context = Parameters<typeof researchProjectAccess>[0] & { db: Database }
type Receipt = {
  featureId: string
  sessionId: string
  projectId: string
  layerId: string
  actualLayerId: string
  code: string
  configuration: string
  overrides: string
  isDraft: number
  isPendingReview: number
  modifiedAt: string
  completed: number
  sessionRevision: number
}

// TABLE OF CONTENTS
// 1. Authorized record and field projection
// 2. Validated atomic record editing

/** Read the current shared record through its session scope.
 * @param ctx Authenticated contributor. @param id Record identity. @returns Scoped receipt, revision and write guard.
 */
async function recordContext(ctx: Context, id: string) {
  const access = researchProjectAccess(ctx, sql`s.projectId`)
  const receipt =
    await ctx.db.get<Receipt>(sql`SELECT r.featureId,r.sessionId,s.projectId,coalesce(l.historicalSourceLayerId,l.id) layerId,f.layerId actualLayerId,s.code,s.configuration,sl.overrides,f.isDraft,f.isPendingReview,f.modifiedAt,s.status='completed' completed,s.revision sessionRevision
    FROM fieldResearchRecord r JOIN fieldResearchSession s ON s.id=r.sessionId
    JOIN feature f ON f.id=r.featureId AND f.projectId=s.projectId AND f.organisationId=s.organisationId
    JOIN project p ON p.id=s.projectId AND p.isArchived=0
    JOIN organisation o ON o.id=s.organisationId AND o.isArchived=0
    JOIN layer l ON l.id=f.layerId AND l.projectId=s.projectId AND l.isArchived=0
    JOIN fieldResearchSessionLayer sl ON sl.sessionId=s.id AND sl.layerId=coalesce(l.historicalSourceLayerId,l.id)
    WHERE r.id=${id} AND r.archivedAt IS NULL AND s.isArchived=0 AND f.isArchived=0 AND ${access}`)
  if (!receipt) error(404, 'Record unavailable')
  const guard = sql`EXISTS(SELECT 1 FROM fieldResearchRecord r JOIN fieldResearchSession s ON s.id=r.sessionId JOIN project p ON p.id=s.projectId AND p.isArchived=0 JOIN organisation o ON o.id=s.organisationId AND o.isArchived=0 JOIN fieldResearchSessionLayer sl ON sl.sessionId=s.id AND sl.layerId=${receipt.layerId}
    WHERE r.id=${id} AND r.archivedAt IS NULL AND r.featureId=${receipt.featureId} AND s.id=${receipt.sessionId} AND s.isArchived=0 AND s.revision=${receipt.sessionRevision} AND ${access})`
  const current = await readCurrentFeatureRevision(ctx.db, {
    featureId: receipt.featureId,
    guard,
  })
  if (!current) error(404, 'Record revision unavailable')
  return { receipt, guard, current }
}

/** Resolve the editor catalogue and intent policy for a scoped record.
 * @param ctx Authenticated contributor. @param id Record identity. @returns Editor context.
 */
async function editorContext(ctx: Context, id: string) {
  const record = await recordContext(ctx, id)
  const { receipt } = record
  const settings = resolveResearchConfiguration(
    researchConfigurationSchema.parse({
      ...JSON.parse(receipt.configuration),
      code: receipt.code,
    }),
    researchLayerOverridesSchema.parse(JSON.parse(receipt.overrides)),
  )
  const fields = (
    await listResolvedProjectProperties(ctx.db, receipt.projectId)
  ).filter(p => settings.properties[p.id]?.isRecordable)
  const policy = await readFeatureIntentPolicy(ctx.db, {
    type: 'layer',
    id: receipt.layerId,
  })
  return { ...record, fields, policy }
}

/** @param receipt Session state. @param current Feature revision. @returns Whether Recorder may edit this record. */
function editableRecord(
  receipt: Receipt,
  current: Awaited<ReturnType<typeof recordContext>>['current'],
): boolean {
  return (
    !receipt.completed &&
    !current.state.isPublished &&
    !current.retired &&
    !current.content.placement.location
  )
}

/** Authorize a new photo against the same session and Feature rules as a field edit.
 * @param ctx Authenticated contributor. @param id Record identity. @returns Scoped Feature upload command.
 */
export async function recorderPhotoScope(ctx: Context, id: string) {
  const { receipt, current, guard } = await recordContext(ctx, id)
  if (!editableRecord(receipt, current))
    error(403, 'This record is read-only in Recorder')
  // Recheck session and Feature membership inside the revision transaction.
  return {
    featureId: receipt.featureId,
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    guard: sql`(${guard}) AND EXISTS(SELECT 1 FROM fieldResearchSession s
      JOIN feature f ON f.projectId=s.projectId AND f.organisationId=s.organisationId
      JOIN layer l ON l.id=f.layerId AND l.projectId=s.projectId AND l.isArchived=0
      WHERE s.id=${receipt.sessionId} AND s.status!='completed' AND f.id=${receipt.featureId}
        AND f.layerId=${receipt.actualLayerId} AND f.isArchived=0 AND f.isPublished=0)`,
  }
}

/** Decode a field without conflating false, zero and unset.
 * @param field Server definition. @param stored Revision field. @returns Editable scalar or option IDs.
 */
function fieldValue(
  field: Property,
  stored?: FeatureRevisionContent['properties'][string],
): RecorderFieldValue {
  if (!stored) return null
  if (field.cardinality === 'many' && field.type === 'classifier')
    return selectedPropertyValueIds(stored.selection)
  if (stored.selection.propertyValueId) return stored.selection.propertyValueId
  const value =
    stored.selection.valueJson ??
    stored.selection.value ??
    stored.translations.en?.value
  if (value == null) return null
  if (field.dataType === 'boolean' || field.component === 'ToggleField')
    return value === 'true'
  if (field.dataType === 'number') return Number(value)
  return value
}

/** Read editable status and all configured fields from the saved Feature revision.
 * @param ctx Authenticated contributor. @param id Shared record. @returns Editor payload.
 */
export async function readRecorderEditor(
  ctx: Context,
  id: string,
): Promise<RecorderEditor> {
  const { receipt, current, fields, policy } = await editorContext(ctx, id)
  const translation =
    current.content.translations.en ?? Object.values(current.content.translations)[0]
  return {
    id,
    title: translation?.title.value ?? 'Record',
    description: translation?.description.value ?? '',
    revisionId: current.revisionId,
    version: current.version,
    modifiedAt: receipt.modifiedAt,
    editable: editableRecord(receipt, current),
    photoRevisions: current.content.gallery.order.map(
      imageId => current.content.gallery.entries[imageId].imageRevisionId,
    ),
    status: {
      featureType: current.content.profile.featureType ?? 'object',
      isVisitable: current.content.profile.visitability.isVisitable,
      isIntangible: current.content.profile.isIntangible,
      isDraft: Boolean(receipt.isDraft),
      isPendingReview: Boolean(receipt.isPendingReview),
    },
    types: policy.types
      .filter(t => t.enabled !== false)
      .map(t => ({ id: t.id, label: t.label, kind: t.kind })),
    fields: fields.map(field => ({
      id: field.id,
      key: field.key,
      type: field.type,
      component: field.component,
      dataType:
        field.component === 'ToggleField' && !field.values?.length
          ? 'boolean'
          : (field.dataType ?? 'text'),
      cardinality: field.cardinality ?? 'one',
      dateResolution: field.dateResolution ?? 'day',
      timeMaxHour: field.timeMaxHour ?? 24,
      min: field.min,
      max: field.max,
      i18n: field.i18n ?? {},
      values: (field.values ?? [])
        .toSorted((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
        .map(option => ({
          icon: option.icon ?? null,
          id: option.id,
          value: option.value ?? option.id,
          i18n: option.i18n ?? {},
        })),
    })),
    values: Object.fromEntries(
      fields.map(field => [
        field.id,
        fieldValue(field, current.content.properties[field.id]),
      ]),
    ),
  }
}

/** Validate and encode one field while retaining other translations.
 * @param field Trusted catalogue definition. @param value Submitted value. @param previous Existing revision field.
 * @returns Revision field or null when cleared.
 */
export function recorderFieldContent(
  field: Property,
  value: RecorderFieldValue,
  previous?: FeatureRevisionContent['properties'][string],
): FeatureRevisionContent['properties'][string] | null {
  const boolean =
    field.dataType === 'boolean' ||
    (field.component === 'ToggleField' && !field.values?.length)
  if (
    !validResearchPropertyDefault(
      boolean ? { ...field, dataType: 'boolean' } : field,
      value,
    )
  )
    error(400, 'Invalid value for ' + field.key)
  if (
    typeof value === 'number' &&
    ((field.min != null && value < field.min) ||
      (field.max != null && value > field.max))
  )
    error(400, 'Value outside limits for ' + field.key)
  if (value == null || value === '' || (Array.isArray(value) && !value.length))
    return null
  const selection = {
    propertyValueId: null as string | null,
    value: null as string | null,
    valueJson: null as string | null,
  }
  const translations = { ...previous?.translations }
  if (Array.isArray(value)) selection.valueJson = encodePropertySelection(value)
  else if (
    !boolean &&
    (field.values?.length ||
      (field.type === 'classifier' && field.dataType !== 'boolean'))
  )
    selection.propertyValueId = String(value)
  else if (isRangeProperty(field))
    selection.valueJson = normalizeRangeValue(field, String(value))
  else if (field.dataType === 'link')
    selection.valueJson = normalizeLinkValue(field, String(value))
  else if (
    field.isTranslatable &&
    field.type !== 'classifier' &&
    field.dataType === 'text'
  )
    translations.en = { value: String(value), generated: false }
  else selection.value = String(value)
  const option = (id: string) => {
    const item = field.values?.find(item => item.id === id)
    if (!item) error(400, 'Selected option is unavailable')
    return {
      id,
      value: item.value,
      translations: Object.fromEntries(
        Object.entries(item.i18n ?? {}).map(([locale, row]) => [
          locale,
          { value: row.value ?? '', generated: row.valueGen ?? false },
        ]),
      ),
    }
  }
  return {
    selection: {
      ...selection,
      definition: {
        key: field.key,
        type: field.type,
        component: field.component,
        dataType: field.dataType ?? 'text',
        dateResolution: field.dateResolution ?? 'day',
        timeMaxHour: field.timeMaxHour ?? 24,
        cardinality: field.cardinality ?? 'one',
        presentation: field.presentation ?? 'text',
        min: field.min ?? null,
        max: field.max ?? null,
        audience: field.audience ?? 'public',
        isTranslatable: field.isTranslatable,
        labels: Object.fromEntries(
          Object.entries(field.i18n ?? {}).map(([locale, row]) => [
            locale,
            { value: row.label ?? '', generated: row.labelGen ?? false },
          ]),
        ),
        selectedOption: selection.propertyValueId
          ? option(selection.propertyValueId)
          : null,
        ...(Array.isArray(value) ? { selectedOptions: value.map(option) } : {}),
      },
    },
    translations,
  }
}

/** Save unpublished session work with revision, role, catalogue and policy fences.
 * @param ctx Authenticated contributor. @param input Record identity, inspected version and explicit edits.
 * @returns Refreshed editor. @remarks Clearing Draft never publishes the Feature. Published records use the main editorial workflow.
 */
export async function saveRecorderEditor(
  ctx: Context,
  input: RecorderEdit,
): Promise<RecorderEditor> {
  const {
    receipt,
    current,
    fields,
    policy,
    guard: scope,
  } = await editorContext(ctx, input.id)
  if (!editableRecord(receipt, current))
    error(403, 'This record is read-only in Recorder')
  if (receipt.modifiedAt !== input.modifiedAt)
    error(409, 'This record changed. Reopen it before saving.')
  const type = requireFeatureType(policy.types, input.status.featureType)
  if (
    current.content.placement.location &&
    type.id !== current.content.profile.featureType
  )
    error(409, 'Change the type of a linked Feature in HYPE.')
  const catalogue = new Map(fields.map(field => [field.id, field]))
  for (const id of Object.keys(input.values))
    if (!catalogue.has(id)) error(400, 'Field is not included in this session')
  // Hold both workflow flags and the session configuration stable during the content revision.
  const guard = sql`(${scope}) AND EXISTS(SELECT 1 FROM feature WHERE id=${receipt.featureId} AND modifiedAt=${input.modifiedAt} AND isPublished=0 AND isArchived=0 AND layerId=${receipt.actualLayerId})
    AND EXISTS(SELECT 1 FROM fieldResearchSession WHERE id=${receipt.sessionId} AND status!='completed')
    AND NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(policy.lineage)}) entry WHERE coalesce((SELECT version FROM featureIntentPolicy WHERE scopeType=json_extract(entry.value,'$.scope.type') AND scopeId=json_extract(entry.value,'$.scope.id')),0)!=json_extract(entry.value,'$.version'))`
  const plan = await prepareFeatureEdit(ctx.db, {
    featureId: receipt.featureId,
    expectedRevisionId: input.revisionId,
    expectedVersion: input.version,
    actorId: ctx.user.id,
    guard,
    reason: 'Field research record edited',
    validate: () => [],
    derive: previous => {
      // Edit the same locale shown on the device and preserve untouched generation flags.
      const translation =
        previous.translations.en ?? Object.values(previous.translations)[0]
      if (input.title !== undefined || input.description !== undefined) {
        if (!translation) error(409, 'Record translation unavailable')
        if (input.title !== undefined && input.title !== translation.title.value)
          translation.title = { value: input.title, generated: false }
        if (
          input.description !== undefined &&
          input.description !== (translation.description.value ?? '')
        )
          translation.description = {
            value: input.description || null,
            generated: false,
          }
      }
      previous.profile.featureType = type.id
      previous.profile.kind = type.kind ?? (type.id === 'business' ? 'place' : 'object')
      previous.profile.associationRelation =
        type.relation ??
        (previous.profile.kind === 'place' ? 'represents' : 'locatedAt')
      previous.profile.isIntangible = input.status.isIntangible
      if (previous.profile.visitability.isVisitable !== input.status.isVisitable)
        previous.profile.visitability.asOf = input.status.isVisitable
          ? new Date().toISOString().slice(0, 10)
          : null
      previous.profile.visitability.isVisitable = input.status.isVisitable
      for (const [id, value] of Object.entries(input.values)) {
        const encoded = recorderFieldContent(
          catalogue.get(id)!,
          value,
          previous.properties[id],
        )
        if (encoded) previous.properties[id] = encoded
        else delete previous.properties[id]
      }
      return previous
    },
    prepareProjection: ({ previous, content, source }) => {
      const projection = prepareFeatureEditorialProjection(ctx.db, {
        featureId: receipt.featureId,
        previous,
        content,
        source,
        reclassifyUnlinkedCapture: type.id !== previous.profile.featureType,
        identity: { actorId: ctx.user.id, preserveDraft: input.status.isDraft },
      })
      projection.statements.push(
        ctx.db
          .update(feature)
          .set({
            isDraft: input.status.isDraft,
            isPendingReview: input.status.isPendingReview,
            modifiedAt: new Date(
              Math.max(Date.now(), Date.parse(input.modifiedAt) + 1),
            ).toISOString(),
          })
          .where(eq(feature.id, receipt.featureId)),
      )
      return projection
    },
  })
  if (
    !plan ||
    !(await executeRevisionBatch(ctx.db, plan.guard, [
      ...plan.statements,
      ctx.db
        .update(fieldResearchSession)
        .set({ updatedAt: new Date().toISOString() })
        .where(eq(fieldResearchSession.id, receipt.sessionId)),
    ]))
  )
    error(409, 'This record changed. Reopen it before saving.')
  return readRecorderEditor(ctx, input.id)
}
