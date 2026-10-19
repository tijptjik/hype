// DRIZZLE
import { and, eq, isNull, or } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
// SCHEMA
import { featurePlace, place, placeRevision, projectPlacePolicy } from '../schema/place'
import { feature } from '../schema/feature'
// DOMAIN
import {
  DEFAULT_PROJECT_PLACE_POLICY,
  ProjectPlacePolicySchema,
} from '#lib/places/model.js'
import { resolveFeaturePlace } from '#lib/places/resolve.js'
import {
  FeaturePlaceOverridesSchema,
  PlaceFactsSchema,
} from '#lib/places/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { ProjectPlacePolicy } from '#lib/places/model.js'
import type { EffectivePlaceFacts } from '#lib/places/resolve.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. PROJECT ADOPTION SETTINGS
// 2. ACCEPTED FEATURE VALUES
// ---

export type ProjectPlaceSettings = { policy: ProjectPlacePolicy; revision: number }

/**
 * Read a project's policy; absence is represented as revision zero with review defaults.
 * @param db Request-local database.
 * @param projectId Authorized project identity.
 * @returns Validated policy and concurrency revision.
 * @remarks Caller must authorize the project before reading these settings.
 */
export async function getProjectPlaceSettings(
  db: Database,
  projectId: string,
): Promise<ProjectPlaceSettings> {
  const row = await db
    .select()
    .from(projectPlacePolicy)
    .where(eq(projectPlacePolicy.projectId, projectId))
    .get()
  return {
    policy: ProjectPlacePolicySchema.parse(row?.policy ?? DEFAULT_PROJECT_PLACE_POLICY),
    revision: row?.revision ?? 0,
  }
}

/**
 * Save a policy only if its persisted revision still matches the editor's revision.
 * @param db Request-local database.
 * @param projectId Authorized project identity.
 * @param input Policy to validate before persistence.
 * @param expectedRevision Zero for first creation, otherwise the last read revision.
 * @returns Saved settings, or null if another editor won the race.
 * @remarks Updating settings does not replay rejected or pending source decisions.
 */
export async function saveProjectPlaceSettings(
  db: Database,
  projectId: string,
  input: unknown,
  expectedRevision: number,
): Promise<ProjectPlaceSettings | null> {
  const policy = ProjectPlacePolicySchema.parse(input)
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error('Invalid policy revision')
  // Initial creation and subsequent updates both use a single conditional statement.
  const rows =
    expectedRevision === 0
      ? await db
          .insert(projectPlacePolicy)
          .values({ projectId, policy, revision: 1 })
          .onConflictDoNothing({ target: projectPlacePolicy.projectId })
          .returning()
      : await db
          .update(projectPlacePolicy)
          .set({ policy, revision: expectedRevision + 1 })
          .where(
            and(
              eq(projectPlacePolicy.projectId, projectId),
              eq(projectPlacePolicy.revision, expectedRevision),
            ),
          )
          .returning()
  return rows[0] ? { policy: rows[0].policy, revision: rows[0].revision } : null
}

export type AcceptedFeaturePlace = {
  placeId: string
  ssId: string | null
  state: 'linked' | 'unresolved' | 'manual'
  factsRevisionId: string
  locationRevisionId: string
  effective: EffectivePlaceFacts
}

/**
 * Resolve only the accepted Place revisions of a Feature the caller can read.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity.
 * @param projectId Persisted project scope from the authorization probe.
 * @returns Accepted projected values, or null for unlinked/private-incompatible Places.
 * @remarks Raw source payloads and other projects' Feature records are never returned.
 */
export async function getAcceptedFeaturePlace(
  db: Database,
  featureId: string,
  projectId: string,
): Promise<AcceptedFeaturePlace | null> {
  const acceptedFacts = alias(placeRevision, 'acceptedFacts')
  const acceptedLocation = alias(placeRevision, 'acceptedLocation')
  // Scope private baselines even if an invalid cross-project link was inserted out of band.
  const row = await db
    .select({
      placeId: place.id,
      ssId: place.ssId,
      state: place.state,
      factsRevisionId: featurePlace.factsRevisionId,
      locationRevisionId: featurePlace.locationRevisionId,
      facts: acceptedFacts.facts,
      location: acceptedLocation.facts,
      overrides: featurePlace.overrides,
    })
    .from(featurePlace)
    .innerJoin(
      feature,
      and(
        eq(feature.id, featurePlace.featureId),
        eq(feature.projectId, projectId),
        eq(feature.isDraft, false),
      ),
    )
    .innerJoin(place, eq(place.id, featurePlace.placeId))
    .innerJoin(
      acceptedFacts,
      and(
        eq(acceptedFacts.placeId, place.id),
        eq(acceptedFacts.id, featurePlace.factsRevisionId),
      ),
    )
    .innerJoin(
      acceptedLocation,
      and(
        eq(acceptedLocation.placeId, place.id),
        eq(acceptedLocation.id, featurePlace.locationRevisionId),
      ),
    )
    .where(
      and(
        eq(featurePlace.featureId, featureId),
        or(isNull(place.ownerProjectId), eq(place.ownerProjectId, projectId)),
      ),
    )
    .get()
  if (!row) return null
  const { facts, location, overrides, ...identity } = row
  return {
    ...identity,
    effective: resolveFeaturePlace(
      PlaceFactsSchema.parse(facts),
      PlaceFactsSchema.parse(location).location,
      FeaturePlaceOverridesSchema.parse(overrides),
    ),
  }
}
