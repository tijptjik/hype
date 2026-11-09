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
  factsOrganisationRevision?: string | null
  locationOrganisationRevision?: string | null
  occupancyRevisionId?: string | null
  addressRevisionId?: string | null
  membershipRevisionIds?: string[]
  placementOverrides?: { accessHints?: Record<string, string | null> }
  acceptedGeometry?: import('geojson').Point
  acceptancePolicy?: Record<string, unknown>
  acceptanceProposalId?: string
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
  if (input.expectedRevision === '') throw new Error('Invalid association version')
  const overrides = FeatureLocationOverridesSchema.parse(input.overrides)
  const version = crypto.randomUUID()
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
      SELECT ${input.featureId},${input.locationId},${version},${input.actorId},
        ${input.factsRevisionId},${input.locationRevisionId},${JSON.stringify(overrides)},${input.factsOrganisationRevision ?? null},${input.locationOrganisationRevision ?? null},${input.occupancyRevisionId ?? null},${input.addressRevisionId ?? null},${JSON.stringify(input.membershipRevisionIds ?? [])},${JSON.stringify(input.placementOverrides ?? {})},${input.acceptedGeometry ? JSON.stringify(input.acceptedGeometry) : null},${input.acceptancePolicy ? JSON.stringify(input.acceptancePolicy) : null},${input.acceptanceProposalId ?? null}
      WHERE ${featureGuard} AND NOT EXISTS
        (SELECT 1 FROM featureLocation WHERE featureId = ${input.featureId})
    `)
      .returning({ version: featureLocation.version })
    return { version, query, input }
  }
  const query = db
    .update(featureLocation)
    .set({
      locationId: input.locationId,
      factsRevisionId: input.factsRevisionId,
      locationRevisionId: input.locationRevisionId,
      overrides,
      ...(input.factsOrganisationRevision === undefined
        ? {}
        : { factsOrganisationRevision: input.factsOrganisationRevision }),
      ...(input.locationOrganisationRevision === undefined
        ? {}
        : { locationOrganisationRevision: input.locationOrganisationRevision }),
      version,
      actorId: input.actorId,
      acceptedGeometry:
        input.acceptedGeometry ??
        sql`CASE WHEN locationId=${input.locationId} THEN acceptedGeometry ELSE NULL END`,
      // Keep Feature name ownership across adoption, placement and ordinary saves.
      acceptancePolicy: input.acceptancePolicy
        ? sql`json_patch(CASE WHEN locationId=${input.locationId} THEN COALESCE(acceptancePolicy,'{}') ELSE '{}' END,${JSON.stringify(input.acceptancePolicy)})`
        : sql`CASE WHEN locationId=${input.locationId} THEN acceptancePolicy ELSE NULL END`,
      acceptanceProposalId: input.acceptanceProposalId ?? null,
      occupancyRevisionId:
        input.occupancyRevisionId === undefined
          ? sql`CASE WHEN locationId=${input.locationId} THEN occupancyRevisionId ELSE NULL END`
          : input.occupancyRevisionId,
      addressRevisionId:
        input.addressRevisionId === undefined
          ? sql`CASE WHEN locationId=${input.locationId} THEN addressRevisionId ELSE NULL END`
          : input.addressRevisionId,
      membershipRevisionIds:
        input.membershipRevisionIds === undefined
          ? sql`CASE WHEN locationId=${input.locationId} THEN membershipRevisionIds ELSE '[]' END`
          : input.membershipRevisionIds,
      placementOverrides:
        input.placementOverrides ??
        sql`CASE WHEN locationId=${input.locationId} THEN placementOverrides ELSE '{}' END`,
    })
    .where(sql`${featureLocation.featureId} = ${input.featureId}
    AND ${featureLocation.version} = ${input.expectedRevision} AND ${featureGuard}`)
    .returning({ version: featureLocation.version })
  return { version, query, input }
}
