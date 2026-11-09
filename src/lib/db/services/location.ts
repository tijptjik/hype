// REVISIONS
import { prepareAdminResourceRevisionCapture } from './adminResourceRevision.js'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch.js'
import type { OrganisationRevisionActor } from './organisationRevision.js'
import { addressRevision } from '../schema/locationRelationships'
import { LocalLocationAddressSchema } from '#lib/addresses/localLocationAddress.js'
// DRIZZLE
import { and, eq, or, sql } from 'drizzle-orm'
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
import {
  BuildingSourceSchema,
  type BuildingSource,
} from '#lib/locations/buildingSource.js'
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
 * @param actor Authenticated editor for project history.
 * @param expectedScope Persisted ancestry captured before authorization.
 * @returns Saved settings, or null if another editor won the race.
 * @remarks Updating settings does not replay rejected or pending source decisions.
 */
export async function saveProjectLocationSettings(
  db: Database,
  projectId: string,
  input: unknown,
  expectedRevision: number,
  actor?: OrganisationRevisionActor,
  expectedScope?: { organisationId: string; hubId: string | null },
): Promise<ProjectLocationSettings | null> {
  const policy = ProjectLocationPolicySchema.parse(input)
  if (
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 0 ||
    expectedRevision >= Number.MAX_SAFE_INTEGER
  )
    throw new Error('Invalid policy revision')
  // Policy and revision live on their Project and change under one compare-and-swap.
  const updateCore = db
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
  const capture = await prepareAdminResourceRevisionCapture(
    db,
    'project',
    sql`SELECT ${projectId} AS id`,
    actor,
  )
  const scopeGuard = expectedScope
    ? sql`EXISTS(SELECT 1 FROM project p JOIN organisation o ON o.id=p.organisationId WHERE p.id=${projectId} AND p.organisationId=${expectedScope.organisationId} AND o.hubId IS ${expectedScope.hubId})`
    : sql`1`
  const results = await executeRevisionBatch(
    db,
    sql`(${scopeGuard}) AND EXISTS(SELECT 1 FROM project WHERE id=${projectId} AND locationPolicyRevision=${expectedRevision})`,
    [
      ...capture.before,
      updateCore,
      prepareRevisionCheck(db, sql`changes()=1`),
      ...capture.after,
    ],
  )
  if (!results) return null
  const rows = results[capture.before.length] as { policy: unknown; revision: number }[]
  return rows[0]
    ? {
        policy: ProjectLocationPolicySchema.parse(rows[0].policy),
        revision: rows[0].revision,
      }
    : null
}

export type AcceptedFeatureLocation = {
  nameMode?: 'inherit' | 'independent'
  version: string
  locationId: string
  ssId: string | null
  kind: LocationKind
  sourceReference: LocationSourceReference | null
  state: 'linked' | 'unresolved' | 'manual'
  buildingSource?: BuildingSource
  factsRevisionId: string
  locationRevisionId: string
  factsOrganisationRevision: string | null
  locationOrganisationRevision: string | null
  occupancyRevisionId: string | null
  addressRevisionId: string | null
  membershipRevisionIds: string[]
  placementOverrides: { accessHints?: Record<string, string | null> }
  brandMode: 'inherit' | 'override' | 'clear'
  effective: EffectiveLocationFacts
}

/**
 * Resolve only the accepted Location revisions of a Feature the caller can read.
 * @param db Request-local database.
 * @param featureId Authorized Feature identity.
 * @param projectId Persisted project scope from the authorization probe.
 * @returns Accepted projected values, or null for unlinked/private-incompatible Locations.
 * @remarks Only the validated building catalogue reference is projected from source
 * provenance; raw payloads and other Features are never returned.
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
      acceptancePolicy: featureLocation.acceptancePolicy,
      version: featureLocation.version,
      locationId: locationTable.id,
      ssId: locationTable.ssId,
      kind: sql<
        import('#lib/locations/kinds.js').LocationKind
      >`COALESCE(json_extract(${acceptedFacts.facts},'$.kind'),${locationTable.kind})`,
      state: locationTable.state,
      factsRevisionId: featureLocation.factsRevisionId,
      locationRevisionId: featureLocation.locationRevisionId,
      factsOrganisationRevision: featureLocation.factsOrganisationRevision,
      locationOrganisationRevision: featureLocation.locationOrganisationRevision,
      occupancyRevisionId: featureLocation.occupancyRevisionId,
      addressRevisionId: featureLocation.addressRevisionId,
      membershipRevisionIds: featureLocation.membershipRevisionIds,
      placementOverrides: featureLocation.placementOverrides,
      acceptedGeometry: featureLocation.acceptedGeometry,
      buildingSourceId: sql<
        string | null
      >`json_extract(${acceptedLocation.rawSource}, '$.buildingSource.id')`,
      buildingSourceRelease: sql<
        string | null
      >`json_extract(${acceptedLocation.rawSource}, '$.buildingSource.release')`,
      buildingSourceAddressId: sql<
        string | null
      >`json_extract(${acceptedLocation.rawSource}, '$.buildingSource.addressId')`,
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
  const {
    facts,
    location,
    overrides,
    acceptancePolicy,
    buildingSourceId,
    buildingSourceRelease,
    buildingSourceAddressId,
    ...identity
  } = row
  const buildingSource = BuildingSourceSchema.safeParse({
    id: buildingSourceId,
    release: buildingSourceRelease,
    ...(buildingSourceAddressId ? { addressId: buildingSourceAddressId } : {}),
  })
  const effective = resolveFeatureLocation(
    LocationFactsSchema.parse(facts),
    LocationFactsSchema.parse(location).location,
    FeatureLocationOverridesSchema.parse(overrides),
  )
  if (row.acceptedGeometry && effective.location)
    effective.location.geometry =
      LocationFactsSchema.shape.location.shape.geometry.parse(row.acceptedGeometry)
  if (row.addressRevisionId && effective.location) {
    const canonical = await db
      .select()
      .from(addressRevision)
      .where(eq(addressRevision.id, row.addressRevisionId))
      .get()
    if (canonical)
      effective.location.address.canonical = {
        addressId: canonical.addressId,
        revisionId: canonical.id,
        content: LocalLocationAddressSchema.parse(canonical.components),
      }
  }
  return {
    ...identity,
    ...(buildingSource.success ? { buildingSource: buildingSource.data } : {}),
    nameMode: acceptancePolicy?.nameMode === 'independent' ? 'independent' : 'inherit',
    sourceReference: locationSourceReference(row.ssId),
    state: row.state,
    brandMode:
      FeatureLocationOverridesSchema.parse(overrides).brands?.mode ?? 'inherit',
    effective,
  }
}
