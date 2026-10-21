// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featureLocation } from '../schema/location'
// DOMAIN
import { applyFeatureLocationEdits } from '#lib/locations/edits.js'
import { equalLocationValue } from '#lib/locations/baseline.js'
import { FeatureLocationOverridesSchema } from '#lib/locations/validation.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
import {
  LocationBrandEditSchema,
  type LocationBrandEdit,
} from '#lib/locations/brandEdit.js'
import {
  LocationResetSchema,
  materializeLocationReset,
  type LocationReset,
} from '#lib/locations/reset.js'
// SERVICES
import { readLocationResetSources, prepareLocationPhoneReset } from './locationReset'
import { getDetachedFeatureBrands } from './locationDetached'
import { readFeatureLocationBaseline } from './locationBaseline'
import { prepareFeatureLocationAssociationWrite } from './locationAssociation'
import { prepareFeatureLocationRelations } from './locationRelations'
// ORGANISATION CORRECTIONS
import { prepareLocationCorrection } from './organisationLocation'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'
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
 * Save a linked Feature and its Organisation correction/baseline revision atomically.
 * @param db Request-local database.
 * @param input Authorized form values, persisted scope and the editor's Feature timestamp.
 * @returns Saved Feature, stale conflict, review requirement or unlinked fallback.
 * @remarks Caller authorizes actual changed fields and validates property values before
 * invoking this service. Source mirrors remain immutable; owner edits append a local baseline. Every child write is
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
    locationBrandEdit?: LocationBrandEdit
    locationReset?: LocationReset
    authorizeLocationCorrection?: () => Promise<void>
  },
): Promise<LinkedFeatureSaveResult> {
  const association = await db
    .select()
    .from(featureLocation)
    .where(eq(featureLocation.featureId, input.featureId))
    .get()
  if (!association) {
    if (input.locationReset || input.locationBrandEdit?.choice.mode === 'inherit')
      return { status: 'review', reason: 'Inheritance requires a linked Location' }
    if (input.locationBrandEdit) {
      const detached = await getDetachedFeatureBrands(
        db,
        input.featureId,
        input.projectId,
      )
      if (!detached || detached.revision !== input.locationBrandEdit.expectedRevision)
        return { status: 'conflict' }
    }
    return { status: 'unlinked' }
  }
  const brandEdit = input.locationBrandEdit
    ? LocationBrandEditSchema.parse(input.locationBrandEdit)
    : undefined
  const reset = input.locationReset
    ? LocationResetSchema.parse(input.locationReset)
    : undefined
  if (
    (brandEdit && brandEdit.expectedRevision !== association.revision) ||
    (reset && reset.expectedRevision !== association.revision)
  )
    return { status: 'conflict' }
  if (input.data.projectId && input.data.projectId !== input.projectId)
    return {
      status: 'review',
      reason: 'Location association must be reviewed before moving projects',
    }
  const before = await readFeatureLocationBaseline(
    db,
    input.featureId,
    input.projectId,
    undefined,
    'linked',
  )
  if (before.status !== 'ready') return { status: 'review', reason: before.reason }
  if (before.baseline.modifiedAt !== input.updatedAt) return { status: 'conflict' }
  const after = await readFeatureLocationBaseline(
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
  // Legacy classifier writes cannot become a second authority for linked Location brands.
  if (
    !equalLocationValue(
      before.baseline.effective.brands,
      after.baseline.effective.brands,
    )
  )
    return { status: 'review', reason: 'Edit brands through the Location association' }
  let overrides = applyFeatureLocationEdits(
    FeatureLocationOverridesSchema.parse(association.overrides),
    before.baseline.effective,
    after.baseline.effective,
  )
  // Brand choices use the Organisation correction scope; reset reads the accepted baseline.
  if (brandEdit) overrides.brands = brandEdit.choice
  let materializedData = input.data
  let materializedI18n = input.i18n
  let resetPhones: string[] | undefined
  if (reset) {
    const sources = await readLocationResetSources(db, {
      ...association,
      projectId: input.projectId,
    })
    if (!sources)
      return { status: 'review', reason: 'Accepted Location source is unavailable' }
    try {
      const result = materializeLocationReset({
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
          error instanceof Error ? error.message : 'Invalid accepted Location source',
      }
    }
  }
  let correction: Awaited<ReturnType<typeof prepareLocationCorrection>> | undefined
  if (!equalLocationValue(overrides, association.overrides)) {
    await input.authorizeLocationCorrection?.()
    const sources = await readLocationResetSources(db, {
      ...association,
      projectId: input.projectId,
    })
    if (!sources) return { status: 'conflict' }
    const organisation = await db.get<{ organisationId: string }>(
      sql`SELECT organisationId FROM project WHERE id=${input.projectId}`,
    )
    if (!organisation) return { status: 'conflict' }
    const desired = resolveFeatureLocation(
      sources.facts,
      sources.locationFacts.location,
      overrides,
    )
    correction = await prepareLocationCorrection(db, {
      organisationId: organisation.organisationId,
      locationId: association.locationId,
      actorId: input.actorId,
      before: before.baseline.effective,
      after: desired,
      currentOverrides: association.overrides,
      reset: Boolean(reset || brandEdit?.choice.mode === 'inherit'),
      desiredOverrides: overrides,
      guard: sql`EXISTS(SELECT 1 FROM feature f JOIN featureLocation fp ON fp.featureId=f.id WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.modifiedAt=${input.updatedAt} AND fp.revision=${association.revision})`,
    })
    overrides = correction.overrides
    const projected = materializeEffectiveLocation({
      facts: correction.baselineRevision?.facts ?? sources.facts,
      locationFacts: correction.baselineRevision?.facts ?? sources.locationFacts,
      overrides,
      data: materializedData,
      i18n: materializedI18n,
    })
    materializedData = projected.data
    materializedI18n = projected.i18n
    resetPhones = projected.phones
  }
  const associationWrite = prepareFeatureLocationAssociationWrite(db, {
    featureId: input.featureId,
    projectId: input.projectId,
    actorId: input.actorId,
    expectedFeatureModifiedAt: input.updatedAt,
    expectedRevision: association.revision,
    locationId: association.locationId,
    factsRevisionId: correction?.baselineRevision?.id ?? association.factsRevisionId,
    locationRevisionId:
      correction?.baselineRevision?.id ?? association.locationRevisionId,
    factsOrganisationRevision: correction?.organisationRevision,
    locationOrganisationRevision: correction?.organisationRevision,
    additionalGuard: correction?.guard,
    overrides,
  })
  // Do not enqueue spatial/MTR work when the user changed only non-location values.
  const { id: _id, geometry, modifiedAt: _modifiedAt, ...data } = materializedData
  const geometryChanged =
    geometry !== undefined &&
    !equalLocationValue(geometry, before.baseline.effective.location?.geometry)
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
        sql`EXISTS (SELECT 1 FROM featureLocation
    WHERE featureId = ${input.featureId} AND revision = ${associationWrite.revision})`,
      ),
    )
    .returning()
  let phoneWrites: Awaited<ReturnType<typeof prepareLocationPhoneReset>> = []
  if (resetPhones !== undefined) {
    try {
      phoneWrites = await prepareLocationPhoneReset(
        db,
        input.featureId,
        associationWrite.revision,
        resetPhones,
      )
    } catch (error) {
      return {
        status: 'review',
        reason:
          error instanceof Error ? error.message : 'Invalid accepted Location phones',
      }
    }
  }
  // One batch covers the association, parent, translations and property snapshots.
  const result = await db.batch([
    ...(correction?.queries ?? []),
    associationWrite.query,
    parent,
    ...prepareFeatureLocationRelations(
      db,
      input.featureId,
      associationWrite.revision,
      materializedI18n,
      input.properties,
    ),
    ...phoneWrites,
  ] as [
    import('drizzle-orm/batch').BatchItem<'sqlite'>,
    ...import('drizzle-orm/batch').BatchItem<'sqlite'>[],
  ])
  const rows = result[(correction?.queries.length ?? 0) + 1] as FeatureDB[]
  return rows[0]
    ? { status: 'saved', feature: rows[0], geometryChanged }
    : { status: 'conflict' }
}
