// DRIZZLE
import { sql, type SQL } from 'drizzle-orm'
// SCHEMA
import { featureLocation } from '../schema/location'
// VALIDATION
import { FeatureLocationOverridesSchema } from '#lib/locations/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureLocationOverrides } from '#lib/locations/model.js'

export type FeatureLocationAssociationWrite = {
  featureId: string
  projectId: string
  expectedFeatureModifiedAt: string
  expectedRevision: string | null
  locationId: string
  factsRevisionId: string
  locationRevisionId: string
  overrides: FeatureLocationOverrides
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
export function prepareFeatureLocationAssociationWrite(
  db: Database,
  input: FeatureLocationAssociationWrite,
) {
  for (const value of [
    input.featureId,
    input.projectId,
    input.locationId,
    input.factsRevisionId,
    input.locationRevisionId,
    input.actorId,
    input.expectedFeatureModifiedAt,
  ]) {
    if (!value) throw new Error('Incomplete Feature Location association')
  }
  if (input.expectedRevision === '') throw new Error('Invalid association revision')
  const overrides = FeatureLocationOverridesSchema.parse(input.overrides)
  const revision = crypto.randomUUID()
  // The persisted Feature guard closes the gap between baseline reads and the write.
  const featureGuard = sql`EXISTS (SELECT 1 FROM feature
    WHERE id = ${input.featureId} AND projectId = ${input.projectId}
      AND isDraft = 0 AND modifiedAt = ${input.expectedFeatureModifiedAt})
    AND (${input.additionalGuard ?? sql.raw('1=1')})`
  if (input.expectedRevision === null) {
    // Raw SELECT follows the schema column order; explicit insert columns are emitted by Drizzle.
    const query = db
      .insert(featureLocation)
      .select(sql`
      SELECT ${input.featureId},${input.locationId},${revision},${input.actorId},
        ${input.factsRevisionId},${input.locationRevisionId},${JSON.stringify(overrides)}
      WHERE ${featureGuard} AND NOT EXISTS
        (SELECT 1 FROM featureLocation WHERE featureId = ${input.featureId})
    `)
      .returning({ revision: featureLocation.revision })
    return { revision, query }
  }
  const query = db
    .update(featureLocation)
    .set({
      locationId: input.locationId,
      factsRevisionId: input.factsRevisionId,
      locationRevisionId: input.locationRevisionId,
      overrides,
      revision,
      actorId: input.actorId,
    })
    .where(sql`${featureLocation.featureId} = ${input.featureId}
    AND ${featureLocation.revision} = ${input.expectedRevision} AND ${featureGuard}`)
    .returning({ revision: featureLocation.revision })
  return { revision, query }
}
