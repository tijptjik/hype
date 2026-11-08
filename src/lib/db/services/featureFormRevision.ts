// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featureLayerAfterStatus } from './historicalLayers'
import {
  featureDestinationGuard,
  featureDestinationPropertiesGuard,
  reconcileFeatureTransferProperties,
  type FeatureDestinationScope,
} from './featureParentTransfer'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { equalRevisionValue } from '#lib/revisions/merge.js'
import { contentMapToStorage } from '#lib/i18n/contentRecords.js'
import { validateFeatureTranslationResult } from '#lib/revisions/featureTranslationReview.js'
// SERVICES
import { prepareFeatureLocationTransfer } from './featureLocationTransfer'
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { readFeatureRevisionSource } from './featureRevisionSource'
import {
  parseFeatureRevisionSource,
  buildFeatureRevisionBaselineContent,
} from './featureRevisionContent'
import {
  featureContentProjectionMatches,
  prepareFeatureEditorialProjection,
} from './featureRevisionProjection'
import { readFeatureRevisionWorkspace } from './featureRevisionWorkspace'
import { prepareFeatureAcceptedCapture } from './featureAcceptedCapture'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { validateFeatureFormResult } from './featureFormReview'
// TYPES
import type { Database } from '#lib/types.js'
import type { RevisionCommand } from './featureRevision'
import type { FeatureCommandProbe } from '#lib/db/zod/schema/feature.types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionValue } from '#lib/revisions/merge.js'
import type { z } from 'zod'
import type { FeatureEntityFormData } from '#lib/db/zod/schema/feature.js'
type FeatureFormValues = z.output<typeof FeatureEntityFormData>

// TABLE OF CONTENTS
// 1. Lossless form candidate construction
// 2. Transfer-owned text preservation
// 3. Existing form save routing

/**
 * Builds a candidate from authorized form values without writing compatibility tables.
 * @param previous Accepted authored content, including hidden fields and exact gallery pins.
 * @param snapshot Captured private source with proposed property definitions included.
 * @param data Validated form values; caller already authorized the changed fields.
 * @param retainOmittedInternal Preserve hidden fields for ordinary edits; transfers provide a complete server-reconciled snapshot.
 * @returns Complete proposed content, retaining omitted locales/internal fields and media pins.
 * @remarks Shared Location corrections/reset intents cannot be submitted through a Feature draft.
 */
export function buildFeatureFormCandidate(
  previous: FeatureRevisionContent,
  snapshot: RevisionValue,
  data: FeatureFormValues,
  retainOmittedInternal = true,
): FeatureRevisionContent {
  const source = parseFeatureRevisionSource(snapshot)
  if (data.locationReset || (previous.placement.location && data.locationBrandEdit))
    throw new Error('Edit shared Location changes through separate review')
  if (
    previous.placement.location &&
    data.locationNameMode &&
    data.locationNameMode !==
      (previous.placement.location.acceptancePolicy?.nameMode ?? 'inherit')
  )
    throw new Error('Location name inheritance requires separate Location review')
  // Apply only authored fields; identity, authorship, visibility and workflow stay server-owned.
  source.record.geometry = data.geometry as unknown as RevisionValue
  source.record.addressMeta = (data.addressMeta ?? {}) as RevisionValue
  source.record.isIntangible = Boolean(data.isIntangible)
  source.record.isVisitable = Boolean(data.isVisitable)
  const locales = new Map(source.translations.map(row => [String(row.locale), row]))
  for (const [locale, value] of Object.entries(contentMapToStorage(data.i18n))) {
    const prior = locales.get(locale)
    const next = {
      ...prior,
      featureId: source.record.id,
      locale,
      title: value.title ?? prior?.title ?? '',
      titleGen: value.titleGen ?? prior?.titleGen ?? true,
      description:
        value.description === undefined
          ? (prior?.description ?? null)
          : value.description,
      descriptionGen: value.descriptionGen ?? prior?.descriptionGen ?? true,
      displayAddress:
        value.displayAddress === undefined
          ? (prior?.displayAddress ?? null)
          : value.displayAddress,
      displayAddressGen: value.displayAddressGen ?? prior?.displayAddressGen ?? true,
      addressProperties:
        value.addressProperties === undefined
          ? (prior?.addressProperties ?? null)
          : value.addressProperties,
    }
    locales.set(locale, next as (typeof source.translations)[number])
  }
  source.translations = [...locales.values()]
  const properties = data.properties ?? []
  const submitted = new Set(properties.map(row => row.propertyId))
  if (submitted.size !== properties.length)
    throw new Error('Duplicate property identities')
  const internal = new Set(
    source.fieldDefinitions
      .filter(row => row.audience === 'internal')
      .map(row => row.id),
  )
  source.properties = source.properties.filter(
    row =>
      retainOmittedInternal &&
      internal.has(row.propertyId) &&
      !submitted.has(String(row.propertyId)),
  )
  const retained = new Set([
    ...submitted,
    ...source.properties.map(row => String(row.propertyId)),
  ])
  source.propertyTranslations = source.propertyTranslations.filter(row =>
    retained.has(String(row.propertyId)),
  )
  for (const property of properties) {
    let propertyValueId = property.propertyValueId || null
    let value = property.value ?? null
    if (propertyValueId === 'true' || propertyValueId === 'false') {
      value ??= propertyValueId
      propertyValueId = null
    }
    source.properties.push({
      featureId: source.record.id,
      propertyId: property.propertyId,
      propertyValueId,
      value,
      valueJson: property.valueJson || null,
    })
    const translations = new Map(
      source.propertyTranslations
        .filter(row => row.propertyId === property.propertyId)
        .map(row => [String(row.locale), row]),
    )
    for (const [locale, translation] of Object.entries(
      contentMapToStorage(property.i18n ?? {}),
    )) {
      const prior = translations.get(locale)
      translations.set(locale, {
        featureId: source.record.id,
        propertyId: property.propertyId,
        locale,
        value:
          translation.value === undefined ? (prior?.value ?? null) : translation.value,
        valueGen: translation.valueGen ?? prior?.valueGen ?? false,
      })
    }
    source.propertyTranslations = [
      ...source.propertyTranslations.filter(
        row => row.propertyId !== property.propertyId,
      ),
      ...translations.values(),
    ]
  }
  const result = buildFeatureRevisionBaselineContent(source, {
    revisions: Object.fromEntries(
      Object.entries(previous.gallery.entries).map(([id, entry]) => [
        id,
        entry.imageRevisionId,
      ]),
    ),
    order: previous.gallery.order,
  })
  result.gallery = structuredClone(previous.gallery)
  // Merely changing a shared field label must not rewrite its historical interpretation.
  for (const [id, entry] of Object.entries(result.properties)) {
    const prior = previous.properties[id]
    if (
      prior &&
      equalRevisionValue(
        { ...entry.selection, definition: null },
        { ...prior.selection, definition: null },
      )
    )
      entry.selection.definition = structuredClone(prior.selection.definition)
  }
  if (data.locationBrandEdit) {
    if (data.locationBrandEdit.choice.mode === 'inherit')
      throw new Error('Detached brands cannot inherit')
    const brands = source.record.localLocationBrands
    if (
      !brands ||
      typeof brands !== 'object' ||
      Array.isArray(brands) ||
      brands.revision !== data.locationBrandEdit.expectedRevision
    )
      throw new Error('Brand selection changed; refresh the Feature')
    result.detachedBrands =
      data.locationBrandEdit.choice.mode === 'override'
        ? data.locationBrandEdit.choice.value
        : []
  }
  return FeatureRevisionContentSchema.parse(result)
}

/**
 * Keeps Location-owned text exact when a form transfers only Feature ownership.
 * @param previous Accepted revision before the transfer.
 * @param content Candidate whose editable descriptions and independent titles remain authored.
 * @returns Nothing; protected text is restored in the candidate in place.
 * @remarks Form transport fills nulls and empty default locales. Those defaults are not
 * Location corrections and must not change accepted source text or verification flags.
 */
function preserveTransferredLocationText(
  previous: FeatureRevisionContent,
  content: FeatureRevisionContent,
): void {
  if (!previous.placement.location) return
  const inheritsNames =
    previous.placement.location.acceptancePolicy?.nameMode !== 'independent'
  for (const [locale, row] of Object.entries(content.translations)) {
    const accepted = previous.translations[locale]
    if (accepted) {
      row.address = structuredClone(accepted.address)
      if (inheritsNames) row.title = structuredClone(accepted.title)
    } else if (
      !row.title.value &&
      !row.description?.value &&
      !row.address.value &&
      !Object.keys(row.address.properties ?? {}).length
    ) {
      // Empty transport-only locales do not create new inherited names or addresses.
      delete content.translations[locale]
    }
  }
}

/**
 * Saves authorized staff edits directly for enrolled identities.
 * @param db Request database.
 * @param input Authorized form and exact loaded parent timestamp, never a client snapshot.
 * @returns Legacy routing or an accepted revision. Stale input fails before any mutation.
 * @remarks Staff saves preserve publication state. Translation-only staff retain their field restrictions.
 */
export async function saveFeatureFormRevision(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    expectedScope: Omit<FeatureCommandProbe, 'id'>
    updatedAt: string
    data: FeatureFormValues
    destinationScope?: FeatureDestinationScope
    authorizeDestinationLocation?: () => Promise<unknown>
    canPublish: boolean
    allowDescriptions: boolean
    allowedInternalIds: ReadonlySet<string>
  },
): Promise<{ status: 'legacy' } | { status: 'applied'; revisionId: string }> {
  const workspace = await readFeatureRevisionWorkspace(db, input)
  if (workspace.enabled && workspace.state !== 'active')
    throw new Error('Retired Feature history is read-only')
  if (!workspace.enabled) {
    const storage = await db.get<{ n: number }>(
      sql`SELECT count(*) AS n FROM sqlite_master WHERE name='featureRevisionHead'`,
    )
    if (
      storage?.n &&
      (await db.get(
        sql`SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId}`,
      ))
    )
      throw new Error('Feature identity is retired or its revision requires migration')
    return { status: 'legacy' }
  }
  const row = await db.get<{ content: string }>(
    sql`SELECT content FROM featureRevision WHERE id=${workspace.comparisonRevisionId} AND featureId=${input.featureId}`,
  )
  if (!row) throw new Error('Feature revision changed; refresh the editor')
  const previous = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
  const destination = input.destinationScope
  const transfer = destination
    ? await reconcileFeatureTransferProperties(
        db,
        input.featureId,
        destination,
        input.data.properties,
        input.allowedInternalIds,
      )
    : undefined
  const data = transfer
    ? { ...input.data, properties: transfer.properties }
    : input.data
  const source = await readFeatureRevisionSource(
    db,
    input.featureId,
    input.guard,
    data.properties?.map(row => row.propertyId),
  )
  if (
    !source ||
    parseFeatureRevisionSource(source.snapshot).record.modifiedAt !== input.updatedAt
  )
    throw new Error('Feature changed; refresh the editor')
  const content = buildFeatureFormCandidate(previous, source.snapshot, data, !transfer)
  if (destination) preserveTransferredLocationText(previous, content)
  // Automatic drops and null initialization are transfer operations, not edits to protected fields.
  const validationPrevious = transfer
    ? {
        ...previous,
        properties: Object.fromEntries(
          Object.keys(content.properties).map(id => [
            id,
            previous.properties[id] ?? content.properties[id],
          ]),
        ),
      }
    : previous
  const validationSource = parseFeatureRevisionSource(source.snapshot)
  if (destination) {
    validationSource.record.projectId = destination.projectId
    validationSource.record.organisationId = destination.organisationId
  }
  const coreHub = await db.get<{ id: string }>(
    sql`SELECT id FROM hub WHERE code='core'`,
  )
  const validateResult = (
    before: FeatureRevisionContent,
    after: FeatureRevisionContent,
  ): string[] =>
    validateFeatureFormResult(before, after, {
      snapshot: validationSource as unknown as RevisionValue,
      coreHubId: coreHub?.id,
      allowedInternalIds: input.allowedInternalIds,
      allowDescriptions: input.allowDescriptions,
      resourceHubId: destination
        ? destination.resourceHubId
        : input.expectedScope.resourceHubId,
    })
  const errors = validateResult(validationPrevious, content)
  if (errors.length) throw new Error(errors.join('; '))
  const currentGuard = (await hasFeatureLifecycleStorage(db))
    ? sql`EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND currentRevisionId=${workspace.comparisonRevisionId} AND revisionVersion=${workspace.generation})`
    : sql`EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId}
      AND state='active' AND generation=${workspace.generation} AND publishedRevisionId IS ${workspace.publishedRevisionId})`
  const guard = sql`(${input.guard}) AND (${source.unchanged}) AND (${transfer?.unchanged ?? sql`1`})
    AND (${featureContentProjectionMatches(input.featureId, previous)})
    AND (${currentGuard})
    AND ((SELECT id FROM hub WHERE code='core') IS ${coreHub?.id ?? null})`
  const fields: ('title' | 'description')[] = input.allowDescriptions
    ? ['title', 'description']
    : ['title']
  // Translation authority permits immediate text saves, never broader fields or visibility.
  if (!input.canPublish) {
    const translationErrors = validateFeatureTranslationResult(
      previous,
      content,
      fields,
    )
    if (translationErrors.length) throw new Error(translationErrors.join('; '))
  }
  const projection = prepareFeatureEditorialProjection(db, {
    featureId: input.featureId,
    source,
    previous,
    content,
  })
  const locationTransfer =
    destination &&
    destination.organisationId !== input.expectedScope.organisationId &&
    content.placement.location
      ? await prepareFeatureLocationTransfer(db, {
          featureId: input.featureId,
          actorId: input.actorId,
          sourceOrganisationId: input.expectedScope.organisationId,
          destinationOrganisationId: destination.organisationId,
          accepted: content.placement.location,
          authorizeDestination: input.authorizeDestinationLocation,
        })
      : undefined
  const transferredContent = locationTransfer ? structuredClone(content) : content
  if (locationTransfer)
    transferredContent.placement.location = locationTransfer.accepted
  const layerChanged = input.data.layerId !== input.expectedScope.layerId
  const resultingScope =
    destination ??
    (layerChanged
      ? {
          organisationId: input.expectedScope.organisationId,
          projectId: input.expectedScope.projectId,
          layerId: input.data.layerId,
        }
      : undefined)
  // Capture rechecks its own source; the complete form guard runs first in the atomic batch.
  const capture = await prepareFeatureAcceptedCapture(db, {
    ...input,
    resultingScope,
    revisionBoundary: Boolean(resultingScope) || input.revisionBoundary,
    derive: current => {
      if (!equalRevisionValue(current, previous))
        throw new Error('Feature changed; refresh the editor')
      return transferredContent
    },
  })
  if (!capture.revisionId)
    throw new Error('Feature revision changed; refresh the editor')
  // Parent membership is outside authored content; verify the old projection before moving and capturing the new scope.
  const layerWrites =
    layerChanged || destination
      ? [
          ...(destination
            ? [
                prepareRevisionCheck(db, featureDestinationGuard(destination)),
                prepareRevisionCheck(
                  db,
                  featureDestinationPropertiesGuard(input.featureId, destination),
                ),
              ]
            : []),
          prepareRevisionCheck(
            db,
            sql`EXISTS (SELECT 1 FROM layer WHERE id=${input.data.layerId}
      AND projectId=${destination?.projectId ?? input.expectedScope.projectId} AND organisationId=${destination?.organisationId ?? input.expectedScope.organisationId}
      AND historicalSourceLayerId IS NULL)`,
          ),
          db
            .update(feature)
            .set({
              ...(destination
                ? {
                    projectId: destination.projectId,
                    organisationId: destination.organisationId,
                  }
                : {}),
              layerId: featureLayerAfterStatus(
                input.data.layerId,
                input.data.isIntangible,
              ),
            })
            .where(eq(feature.id, input.featureId)),
          prepareRevisionCheck(db, sql`changes()=1`),
        ]
      : []
  // Apply the form and its attributed history together without changing visibility.
  const applied = await executeRevisionBatch(db, guard, [
    ...capture.before,
    ...projection.statements,
    ...(projection.afterPublication ?? []),
    prepareRevisionCheck(db, projection.verify),
    ...(locationTransfer?.beforeMove ?? []),
    ...layerWrites,
    ...(locationTransfer?.afterMove ?? []),
    ...capture.after,
  ])
  if (!applied) throw new Error('Feature changed; refresh the editor')
  return { status: 'applied', revisionId: capture.revisionId }
}
