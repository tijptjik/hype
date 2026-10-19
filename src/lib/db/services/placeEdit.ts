// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featurePlace } from '../schema/place'
// DOMAIN
import { applyFeaturePlaceEdits } from '#lib/places/edits.js'
import { equalPlaceValue } from '#lib/places/baseline.js'
import { FeaturePlaceOverridesSchema } from '#lib/places/validation.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
import { PlaceBrandEditSchema, type PlaceBrandEdit } from '#lib/places/brandEdit.js'
import {
  PlaceResetSchema,
  materializePlaceReset,
  type PlaceReset,
} from '#lib/places/reset.js'
// SERVICES
import { readPlaceResetSources, preparePlacePhoneReset } from './placeReset'
import { readFeaturePlaceBaseline } from './placeBaseline'
import { prepareFeaturePlaceAssociationWrite } from './placeAssociation'
import { prepareFeaturePlaceRelations } from './placeRelations'
// TYPES
import type { Database } from '#lib/types.js'
import type {
  FeatureDB,
  FeatureDBPartial,
  FeatureI18nPartial,
  NewFeatureProperty,
} from '#lib/db/zod/schema/feature.types.js'

export type LinkedFeatureSaveResult =
  | { status: 'unlinked' | 'conflict' }
  | { status: 'review'; reason: string }
  | { status: 'saved'; feature: FeatureDB; geometryChanged: boolean }

/**
 * Save a linked Feature form and its override history in one conditional batch.
 * @param db Request-local database.
 * @param input Authorized form values, persisted scope and the editor's Feature timestamp.
 * @returns Saved Feature, stale conflict, review requirement or unlinked fallback.
 * @remarks Caller authorizes actual changed fields and validates property values before
 * invoking this service. All source revisions remain unchanged. Every child write is
 * gated by the new association token; a failed or stale save cannot partially replace data.
 */
export async function saveLinkedFeatureForm(
  db: Database,
  input: {
    featureId: string
    projectId: string
    actorId: string
    updatedAt: string
    data: FeatureDBPartial
    i18n: Record<string, FeatureI18nPartial>
    properties?: NewFeatureProperty[]
    placeBrandEdit?: PlaceBrandEdit
    placeReset?: PlaceReset
  },
): Promise<LinkedFeatureSaveResult> {
  const association = await db
    .select()
    .from(featurePlace)
    .where(eq(featurePlace.featureId, input.featureId))
    .get()
  if (!association)
    return input.placeBrandEdit || input.placeReset
      ? { status: 'review', reason: 'Inheritance requires a linked Place' }
      : { status: 'unlinked' }
  const brandEdit = input.placeBrandEdit
    ? PlaceBrandEditSchema.parse(input.placeBrandEdit)
    : undefined
  const reset = input.placeReset ? PlaceResetSchema.parse(input.placeReset) : undefined
  if (
    (brandEdit && brandEdit.expectedRevision !== association.revision) ||
    (reset && reset.expectedRevision !== association.revision)
  )
    return { status: 'conflict' }
  if (input.data.projectId && input.data.projectId !== input.projectId)
    return {
      status: 'review',
      reason: 'Place association must be reviewed before moving projects',
    }
  const before = await readFeaturePlaceBaseline(
    db,
    input.featureId,
    input.projectId,
    undefined,
    'linked',
  )
  if (before.status !== 'ready') return { status: 'review', reason: before.reason }
  if (before.baseline.modifiedAt !== input.updatedAt) return { status: 'conflict' }
  const after = await readFeaturePlaceBaseline(
    db,
    input.featureId,
    input.projectId,
    {
      data: {
        geometry: input.data.geometry ?? before.baseline.effective.location!.geometry,
        addressMeta: input.data.addressMeta ?? { address: before.baseline.address },
        ...(input.data.isIntangible === undefined
          ? {}
          : { isIntangible: input.data.isIntangible }),
      },
      i18n: input.i18n,
      properties: input.properties,
    },
    'linked',
  )
  if (after.status !== 'ready') return { status: 'review', reason: after.reason }
  if (after.baseline.modifiedAt !== input.updatedAt) return { status: 'conflict' }
  // Legacy classifier writes cannot become a second authority for linked Place brands.
  if (
    !equalPlaceValue(before.baseline.effective.brands, after.baseline.effective.brands)
  )
    return { status: 'review', reason: 'Edit brands through the Place association' }
  let overrides = applyFeaturePlaceEdits(
    FeaturePlaceOverridesSchema.parse(association.overrides),
    before.baseline.effective,
    after.baseline.effective,
  )
  // Brand choices live only on the association; reset uses its accepted facts revision.
  if (brandEdit) overrides.brands = brandEdit.choice
  let materializedData = input.data
  let materializedI18n = input.i18n
  let resetPhones: string[] | undefined
  if (reset) {
    const sources = await readPlaceResetSources(db, {
      ...association,
      projectId: input.projectId,
    })
    if (!sources)
      return { status: 'review', reason: 'Accepted Place source is unavailable' }
    try {
      const result = materializePlaceReset({
        reset,
        ...sources,
        overrides,
        data: {
          ...input.data,
          addressMeta: input.data.addressMeta ?? { address: before.baseline.address },
        },
        i18n: input.i18n,
      })
      materializedData = result.data
      materializedI18n = result.i18n
      overrides = result.overrides
      resetPhones = result.phoneNumber
    } catch (error) {
      return {
        status: 'review',
        reason:
          error instanceof Error ? error.message : 'Invalid accepted Place source',
      }
    }
  }
  const associationWrite = prepareFeaturePlaceAssociationWrite(db, {
    featureId: input.featureId,
    projectId: input.projectId,
    actorId: input.actorId,
    expectedFeatureModifiedAt: input.updatedAt,
    expectedRevision: association.revision,
    placeId: association.placeId,
    factsRevisionId: association.factsRevisionId,
    locationRevisionId: association.locationRevisionId,
    overrides,
  })
  // Do not enqueue spatial/MTR work when the user changed only non-location values.
  const { id: _id, geometry, modifiedAt: _modifiedAt, ...data } = materializedData
  const geometryChanged =
    geometry !== undefined &&
    !equalPlaceValue(geometry, before.baseline.effective.location?.geometry)
  const modifiedAt = new Date(
    Math.max(Date.now(), (Date.parse(input.updatedAt) || 0) + 1),
  ).toISOString()
  const parent = db
    .update(feature)
    .set({
      ...data,
      modifiedAt,
      ...(geometryChanged
        ? { geometry, spatialIndex: createFeatureSpatialIndex(geometry) }
        : {}),
    })
    .where(
      and(
        eq(feature.id, input.featureId),
        sql`EXISTS (SELECT 1 FROM featurePlace
    WHERE featureId = ${input.featureId} AND revision = ${associationWrite.revision})`,
      ),
    )
    .returning()
  let phoneWrites: Awaited<ReturnType<typeof preparePlacePhoneReset>> = []
  if (resetPhones !== undefined) {
    try {
      phoneWrites = await preparePlacePhoneReset(
        db,
        input.featureId,
        associationWrite.revision,
        resetPhones,
      )
    } catch (error) {
      return {
        status: 'review',
        reason:
          error instanceof Error ? error.message : 'Invalid accepted Place phones',
      }
    }
  }
  // One batch covers the association, parent, translations and property snapshots.
  const result = await db.batch([
    associationWrite.query,
    parent,
    ...prepareFeaturePlaceRelations(
      db,
      input.featureId,
      associationWrite.revision,
      materializedI18n,
      input.properties,
    ),
    ...phoneWrites,
  ])
  const rows = result[1] as FeatureDB[]
  return rows[0]
    ? { status: 'saved', feature: rows[0], geometryChanged }
    : { status: 'conflict' }
}
