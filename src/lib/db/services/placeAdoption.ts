// DRIZZLE
import { and, eq } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featurePlace, placeRevision, place } from '../schema/place'
// DOMAIN
import { planPlaceAdoption } from '#lib/places/adoption.js'
// SERVICES
import { getAcceptedFeaturePlace, getProjectPlaceSettings } from './place'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceAdoptionPlan } from '#lib/places/adoption.js'
import type { ProjectPlaceSettings } from './place'

/**
 * Preview policy-based adoption from stored evidence for one authorized Feature.
 * @param db Request-local database.
 * @param input Persisted Feature scope and explicit target revision identity.
 * @returns Plan and concurrency inputs, or null for unavailable/mismatched source scope.
 * @remarks Read-only: does not adopt, enqueue, or reopen previously rejected decisions.
 * The applying workflow must recheck every token and the durable rejection ledger.
 */
export async function previewFeaturePlaceAdoption(
  db: Database,
  input: { featureId: string; projectId: string; candidateRevisionId: string },
): Promise<{
  plan: PlaceAdoptionPlan
  expectedRevision: string
  expectedFeatureModifiedAt: string
  settings: ProjectPlaceSettings
} | null> {
  const accepted = await getAcceptedFeaturePlace(db, input.featureId, input.projectId)
  if (!accepted) return null
  const association = await db
    .select({
      overrides: featurePlace.overrides,
      modifiedAt: feature.modifiedAt,
    })
    .from(featurePlace)
    .innerJoin(feature, eq(feature.id, featurePlace.featureId))
    .innerJoin(place, eq(place.id, featurePlace.placeId))
    .where(
      and(
        eq(featurePlace.featureId, input.featureId),
        eq(featurePlace.revision, accepted.revision),
        eq(feature.projectId, input.projectId),
        eq(place.sourceAvailability, 'current'),
      ),
    )
    .get()
  if (!association) return null
  // Fixed-size reads preserve the independent accepted facts/location revisions.
  /** Read one revision of this Place only. @param id Stored revision ID. @returns Scoped revision. */
  const read = async (id: string) =>
    db
      .select()
      .from(placeRevision)
      .where(and(eq(placeRevision.id, id), eq(placeRevision.placeId, accepted.placeId)))
      .get()
  const [facts, location, candidate, settings] = await Promise.all([
    read(accepted.factsRevisionId),
    read(accepted.locationRevisionId),
    read(input.candidateRevisionId),
    getProjectPlaceSettings(db, input.projectId),
  ])
  if (!facts || !location || !candidate) return null
  return {
    plan: planPlaceAdoption({
      facts,
      location,
      candidate,
      overrides: association.overrides,
      policy: settings.policy,
    }),
    expectedRevision: accepted.revision,
    expectedFeatureModifiedAt: association.modifiedAt,
    settings,
  }
}
