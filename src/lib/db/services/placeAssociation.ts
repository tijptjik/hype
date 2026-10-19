// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { featurePlace } from '../schema/place'
// VALIDATION
import { FeaturePlaceOverridesSchema } from '#lib/places/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeaturePlaceOverrides } from '#lib/places/model.js'

export type FeaturePlaceAssociationWrite = {
  featureId: string
  projectId: string
  expectedFeatureModifiedAt: string
  expectedRevision: string | null
  placeId: string
  factsRevisionId: string
  locationRevisionId: string
  overrides: FeaturePlaceOverrides
  actorId: string
  additionalGuard?: SQL
}

/**
 * Prepare a conditional association write for an atomic materialization batch.
 * @param db Request-local database.
 * @param input Authorized persisted scope, concurrency guards and validated inheritance inputs.
 * @returns New token and a returning query for db.batch; an empty result means stale state.
 * @remarks Trusted internal primitive, not a remote API. The caller must authorize all
 * affected Feature fields, derive initial overrides from persisted values, and batch
 * effective-value writes with this query. Subsequent writes must require this new token
 * to exist, so a stale association cannot change materialized values. Database triggers enforce scope and retain
 * history. An optional server-owned SQL guard adds workflow preconditions (never client SQL).
 * This function does not execute or expose source payloads to clients.
 */
export function prepareFeaturePlaceAssociationWrite(
  db: Database,
  input: FeaturePlaceAssociationWrite,
) {
  for (const value of [
    input.featureId,
    input.projectId,
    input.placeId,
    input.factsRevisionId,
    input.locationRevisionId,
    input.actorId,
    input.expectedFeatureModifiedAt,
  ]) {
    if (!value) throw new Error('Incomplete Feature Place association')
  }
  if (input.expectedRevision === '') throw new Error('Invalid association revision')
  const overrides = FeaturePlaceOverridesSchema.parse(input.overrides)
  const revision = crypto.randomUUID()
  // The persisted Feature guard closes the gap between baseline reads and the write.
  const featureGuard = sql`EXISTS (SELECT 1 FROM feature
    WHERE id = ${input.featureId} AND projectId = ${input.projectId}
      AND isDraft = 0 AND modifiedAt = ${input.expectedFeatureModifiedAt})
    AND (${input.additionalGuard ?? sql.raw('1=1')})`
  if (input.expectedRevision === null) {
    // Raw SELECT follows the schema column order; explicit insert columns are emitted by Drizzle.
    const query = db
      .insert(featurePlace)
      .select(sql`
      SELECT ${input.featureId},${input.placeId},${revision},${input.actorId},
        ${input.factsRevisionId},${input.locationRevisionId},${JSON.stringify(overrides)}
      WHERE ${featureGuard} AND NOT EXISTS
        (SELECT 1 FROM featurePlace WHERE featureId = ${input.featureId})
    `)
      .returning({ revision: featurePlace.revision })
    return { revision, query }
  }
  const query = db
    .update(featurePlace)
    .set({
      placeId: input.placeId,
      factsRevisionId: input.factsRevisionId,
      locationRevisionId: input.locationRevisionId,
      overrides,
      revision,
      actorId: input.actorId,
    })
    .where(sql`${featurePlace.featureId} = ${input.featureId}
    AND ${featurePlace.revision} = ${input.expectedRevision} AND ${featureGuard}`)
    .returning({ revision: featurePlace.revision })
  return { revision, query }
}
