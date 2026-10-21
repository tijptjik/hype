// DRIZZLE
import { and, eq, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/sqlite-core'
// SCHEMA
import {
  featureLocation,
  location as locationTable,
  locationRevision,
} from '../schema/location'
import { feature } from '../schema/feature'
import { project } from '../schema/project'
// DOMAIN
import {
  locationSourceReference,
  type LocationKind,
  type LocationSourceReference,
} from '#lib/locations/kinds.js'
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  ProjectLocationPolicySchema,
} from '#lib/locations/model.js'
import { resolveFeatureLocation } from '#lib/locations/resolve.js'
import {
  FeatureLocationOverridesSchema,
  LocationFactsSchema,
} from '#lib/locations/validation.js'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { Database } from '#lib/types.js'
import type { ProjectLocationPolicy } from '#lib/locations/model.js'
import type { EffectiveLocationFacts } from '#lib/locations/resolve.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. PROJECT ADOPTION SETTINGS
// 2. ACCEPTED FEATURE VALUES
// ---

export type ProjectLocationSettings = {
  policy: ProjectLocationPolicy
  revision: number
}

/**
 * Read a project's policy; absence is represented as revision zero with review defaults.
 * @param db Request-local database.
 * @param projectId Authorized project identity.
 * @returns Validated policy and concurrency revision.
 * @remarks Caller must authorize the project before reading these settings.
 */
export async function getProjectLocationSettings(
  db: Database,
  projectId: string,
): Promise<ProjectLocationSettings> {
  const row = await db
    .select({
      policy: project.locationPolicy,
      revision: project.locationPolicyRevision,
    })
    .from(project)
    .where(eq(project.id, projectId))
    .get()
  return {
    policy: ProjectLocationPolicySchema.parse(
      row?.policy ?? DEFAULT_PROJECT_LOCATION_POLICY,
    ),
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
export async function saveProjectLocationSettings(
  db: Database,
  projectId: string,
  input: unknown,
  expectedRevision: number,
): Promise<ProjectLocationSettings | null> {
  const policy = ProjectLocationPolicySchema.parse(input)
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error('Invalid policy revision')
  // Policy and revision live on their Project and change under one compare-and-swap.
  const rows = await db
    .update(project)
    .set({ locationPolicy: policy, locationPolicyRevision: expectedRevision + 1 })
    .where(
      and(
        eq(project.id, projectId),
        eq(project.locationPolicyRevision, expectedRevision),
      ),
    )
    .returning({
      policy: project.locationPolicy,
      revision: project.locationPolicyRevision,
    })
  return rows[0]
    ? {
        policy: ProjectLocationPolicySchema.parse(rows[0].policy),
        revision: rows[0].revision,
      }
    : null
}

export type AcceptedFeatureLocation = {
  revision: string
  locationId: string
  ssId: string | null
  kind: LocationKind
  sourceReference: LocationSourceReference | null
  state: 'linked' | 'unresolved' | 'manual'
  factsRevisionId: string
  locationRevisionId: string
  brandMode: 'inherit' | 'override' | 'clear'
  effective: EffectiveLocationFacts
}

/**
 * Resolve only the accepted Location revisions of a Feature the caller can read.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity.
 * @param projectId Persisted project scope from the authorization probe.
 * @returns Accepted projected values, or null for unlinked/private-incompatible Locations.
 * @remarks Raw source payloads and other projects' Feature records are never returned.
 */
export async function getAcceptedFeatureLocation(
  db: Database,
  featureId: string,
  projectId: string,
): Promise<AcceptedFeatureLocation | null> {
  const acceptedFacts = alias(locationRevision, 'acceptedFacts')
  const acceptedLocation = alias(locationRevision, 'acceptedLocation')
  // Scope private baselines even if an invalid cross-project link was inserted out of band.
  const row = await db
    .select({
      revision: featureLocation.revision,
      locationId: locationTable.id,
      ssId: locationTable.ssId,
      kind: sql<
        import('#lib/locations/kinds.js').LocationKind
      >`COALESCE(json_extract(${acceptedFacts.facts},'$.kind'),${locationTable.kind})`,
      state: locationTable.state,
      factsRevisionId: featureLocation.factsRevisionId,
      locationRevisionId: featureLocation.locationRevisionId,
      facts: acceptedFacts.facts,
      location: acceptedLocation.facts,
      overrides: featureLocation.overrides,
    })
    .from(featureLocation)
    .innerJoin(
      feature,
      and(
        eq(feature.id, featureLocation.featureId),
        eq(feature.projectId, projectId),
        eq(feature.isDraft, false),
      ),
    )
    .innerJoin(locationTable, eq(locationTable.id, featureLocation.locationId))
    .innerJoin(
      acceptedFacts,
      and(
        eq(acceptedFacts.locationId, locationTable.id),
        eq(acceptedFacts.id, featureLocation.factsRevisionId),
      ),
    )
    .innerJoin(
      acceptedLocation,
      and(
        eq(acceptedLocation.locationId, locationTable.id),
        eq(acceptedLocation.id, featureLocation.locationRevisionId),
      ),
    )
    .where(
      and(
        eq(featureLocation.featureId, featureId),
        or(
          sql`${locationTable.state} != 'manual'`,
          eq(locationTable.ownerOrganisationId, locationOwnerForProject(projectId)),
        ),
      ),
    )
    .get()
  if (!row || row.state === 'redirect') return null
  const { facts, location, overrides, ...identity } = row
  return {
    ...identity,
    sourceReference: locationSourceReference(row.ssId),
    state: row.state,
    brandMode:
      FeatureLocationOverridesSchema.parse(overrides).brands?.mode ?? 'inherit',
    effective: resolveFeatureLocation(
      LocationFactsSchema.parse(facts),
      LocationFactsSchema.parse(location).location,
      FeatureLocationOverridesSchema.parse(overrides),
    ),
  }
}
