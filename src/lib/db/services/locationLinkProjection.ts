// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature, featureI18n } from '../schema/feature'
// DOMAIN
import { materializeEffectiveLocation } from '#lib/locations/materialize.js'
import { createFeatureSpatialIndex } from '#lib/map/featureSpatial.js'
// SERVICES
import { prepareFeatureLocationRelations } from './locationRelations'
import { prepareLocationPhoneReset } from './locationReset'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureLocationOverrides, LocationFacts } from '#lib/locations/model.js'
import type { BatchItem } from 'drizzle-orm/batch'

/** Materialize an explicitly selected Location plus the Organisation's existing corrections.
 * @param db Request-local database.
 * @param input Authorized Feature, new association token and selected baseline/corrections.
 * @returns Guarded projection statements for the association's atomic batch.
 * @remarks Reusing a Location must reuse the Organisation's corrections, including for another Project.
 */
export async function prepareLinkedLocationProjection(
  db: Database,
  input: {
    featureId: string
    projectId: string
    revision: string
    facts: LocationFacts
    overrides: FeatureLocationOverrides
  },
): Promise<BatchItem<'sqlite'>[]> {
  const parent = await db
    .select()
    .from(feature)
    .where(and(eq(feature.id, input.featureId), eq(feature.projectId, input.projectId)))
    .get()
  if (!parent) throw new Error('Feature unavailable')
  const translations = await db
    .select()
    .from(featureI18n)
    .where(eq(featureI18n.featureId, input.featureId))
  const projection = materializeEffectiveLocation({
    facts: input.facts,
    locationFacts: input.facts,
    overrides: input.overrides,
    data: { geometry: parent.geometry, addressMeta: parent.addressMeta ?? {} },
    i18n: Object.fromEntries(translations.map(row => [row.locale, row])),
  })
  const guard = sql`EXISTS(SELECT 1 FROM featureLocation WHERE featureId=${input.featureId} AND revision=${input.revision})`
  return [
    db
      .update(feature)
      .set({
        geometry: projection.data.geometry,
        addressMeta: projection.data.addressMeta,
        spatialIndex: createFeatureSpatialIndex(projection.data.geometry!),
      })
      .where(and(eq(feature.id, input.featureId), guard)),
    ...prepareFeatureLocationRelations(
      db,
      input.featureId,
      input.revision,
      projection.i18n,
    ),
    ...(await prepareLocationPhoneReset(
      db,
      input.featureId,
      input.revision,
      projection.phones ?? [],
    )),
  ]
}
