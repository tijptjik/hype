// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import {
  featureLocation,
  locationRevision,
  location as locationTable,
} from '../schema/location'
// DOMAIN
import { planLocationAdoption } from '#lib/locations/adoption.js'
// SERVICES
import { getAcceptedFeatureLocation, getProjectLocationSettings } from './location'
import { readOrganisationLocation } from './organisationLocation'
// TYPES
import type { Database } from '#lib/types.js'
import type { LocationAdoptionPlan } from '#lib/locations/adoption.js'
import type { ProjectLocationSettings } from './location'

/**
 * Preview policy-based adoption from stored evidence for one authorized Feature.
 * @param db Request-local database.
 * @param input Persisted Feature scope and explicit target revision identity.
 * @returns Plan and concurrency inputs, or null for unavailable/mismatched source scope.
 * @remarks Read-only: does not adopt, enqueue, or reopen previously rejected decisions.
 * The applying workflow must recheck every token and the durable rejection ledger.
 */
export async function previewFeatureLocationAdoption(
  db: Database,
  input: {
    featureId: string
    projectId: string
    candidateRevisionId: string
    organisationRevision?: string
  },
): Promise<{
  plan: LocationAdoptionPlan
  candidateOverrides: import('#lib/locations/model.js').FeatureLocationOverrides
  expectedRevision: string
  expectedFeatureModifiedAt: string
  settings: ProjectLocationSettings
} | null> {
  const accepted = await getAcceptedFeatureLocation(
    db,
    input.featureId,
    input.projectId,
  )
  if (!accepted) return null
  const association = await db
    .select({
      overrides: featureLocation.overrides,
      modifiedAt: feature.modifiedAt,
    })
    .from(featureLocation)
    .innerJoin(feature, eq(feature.id, featureLocation.featureId))
    .innerJoin(locationTable, eq(locationTable.id, featureLocation.locationId))
    .where(
      and(
        eq(featureLocation.featureId, input.featureId),
        eq(featureLocation.version, accepted.version),
        eq(feature.projectId, input.projectId),
        eq(locationTable.sourceAvailability, 'current'),
      ),
    )
    .get()
  if (!association) return null
  // Fixed-size reads preserve the independent accepted facts/location revisions.
  /** Read one revision of this Location only. @param id Stored revision ID. @returns Scoped revision. */
  const read = async (id: string) =>
    db
      .select()
      .from(locationRevision)
      .where(
        and(
          eq(locationRevision.id, id),
          eq(locationRevision.locationId, accepted.locationId),
        ),
      )
      .get()
  const [facts, location, candidate, settings] = await Promise.all([
    read(accepted.factsRevisionId),
    read(accepted.locationRevisionId),
    read(input.candidateRevisionId),
    getProjectLocationSettings(db, input.projectId),
  ])
  if (!facts || !location || !candidate) return null
  const organisation = await db.get<{ organisationId: string }>(
    sql`SELECT organisationId FROM project WHERE id=${input.projectId}`,
  )
  const correction =
    input.organisationRevision && organisation
      ? await readOrganisationLocation(
          db,
          organisation.organisationId,
          accepted.locationId,
          input.organisationRevision,
        )
      : null
  if (input.organisationRevision && !correction) return null
  const candidateOverrides = correction?.overrides ?? association.overrides
  return {
    candidateOverrides,
    plan: planLocationAdoption({
      facts,
      location,
      candidate,
      overrides: association.overrides,
      candidateOverrides,
      policy: settings.policy,
    }),
    expectedRevision: accepted.version,
    expectedFeatureModifiedAt: association.modifiedAt,
    settings,
  }
}
