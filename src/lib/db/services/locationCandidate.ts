// DRIZZLE
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
// SCHEMA
import { location as locationTable, locationRevision } from '../schema/location'
import { persistSaanSeoiPlace } from './locationSource'
// VALIDATION
import { LocationFactsSchema } from '#lib/locations/validation.js'
import { locationDistance } from '#lib/locations/searchPresentation.js'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { LocationKind } from '#lib/locations/kinds.js'
import type { Database } from '#lib/types.js'
import type { LocationFacts } from '#lib/locations/model.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CANONICAL SOURCE CANDIDATE RESOLUTION
// 2. PRIVATE LOCAL DISCOVERY
// 3. SCOPED CANONICAL CANDIDATE INGESTION
// ---

export type LocationCandidateResolution =
  | { status: 'source-import-needed' }
  | {
      status: 'ready'
      locationId: string
      revisionId: string
      ssId: string
      resourceReleaseId: string
      snapshotId: string
      facts: LocationFacts
    }

/**
 * Resolve discovery identity to verified source facts already mirrored in HYPE.
 * @param db Request-local database.
 * @param input Authorized project scope and selected upstream identity/release.
 * @returns A linkable immutable revision, or a non-disclosing import-needed result.
 * @remarks Search labels are never identity evidence. Require the exact resource
 * release, current source availability and accessible ownership. This does not claim
 * that a mirrored release is still upstream's latest publication, import missing
 * records, or adopt a revision into any Feature. Raw snapshots stay server-side.
 */
export async function resolveLocationCandidate(
  db: Database,
  input: { projectId: string; ssId: string; resourceReleaseId: string },
): Promise<LocationCandidateResolution> {
  // Only canonical source revisions for the selected identity are selectable.
  const row = await db
    .select({
      locationId: locationTable.id,
      revisionId: locationRevision.id,
      ssId: locationRevision.ssId,
      resourceReleaseId: locationRevision.releaseId,
      snapshotId: locationRevision.snapshotId,
      facts: locationRevision.facts,
    })
    .from(locationRevision)
    .innerJoin(locationTable, eq(locationTable.id, locationRevision.locationId))
    .where(
      and(
        eq(locationTable.ssId, input.ssId),
        eq(locationTable.state, 'linked'),
        eq(locationTable.sourceAvailability, 'current'),
        or(
          sql`${locationTable.state} != 'manual'`,
          eq(
            locationTable.ownerOrganisationId,
            locationOwnerForProject(input.projectId),
          ),
        ),
        eq(locationRevision.origin, 'saanseoi'),
        eq(locationRevision.ssId, input.ssId),
        eq(locationRevision.releaseId, input.resourceReleaseId),
      ),
    )
    .orderBy(desc(locationRevision.sequence))
    .limit(1)
    .get()
  if (!row?.ssId || !row.resourceReleaseId || !row.snapshotId)
    return { status: 'source-import-needed' }
  return {
    status: 'ready',
    ...row,
    ssId: row.ssId,
    resourceReleaseId: row.resourceReleaseId,
    snapshotId: row.snapshotId,
    facts: LocationFactsSchema.parse(row.facts),
  }
}

export type LocalLocationCandidate = {
  locationId: string
  revisionId: string
  state: 'manual' | 'unresolved'
  kind: LocationKind
  facts: LocationFacts
}

/**
 * Find reusable private local Locations by their latest localized names.
 * @param db Request-local database.
 * @param input Authorized owning project and a literal name fragment.
 * @returns At most twenty validated local baselines, never another project's records.
 * @remarks Search only the latest revision, so superseded names cannot resurrect old
 * facts. Wildcards are literal text; raw provenance is not returned. Caller must
 * authorize full inherited-field editing before accessing this private catalogue.
 */
export async function searchLocalLocationCandidates(
  db: Database,
  input: { projectId: string; q: string },
): Promise<LocalLocationCandidate[]> {
  const query = input.q.trim()
  if (!query || query.length > 200) throw new Error('Invalid local Location query')
  // Scope and latest-revision selection precede name matching and the result bound.
  const rows = await db
    .select({
      locationId: locationTable.id,
      revisionId: locationRevision.id,
      state: locationTable.state,
      kind: locationTable.kind,
      facts: locationRevision.facts,
    })
    .from(locationTable)
    .innerJoin(locationRevision, eq(locationRevision.locationId, locationTable.id))
    .where(
      and(
        or(
          sql`${locationTable.state} != 'manual'`,
          eq(
            locationTable.ownerOrganisationId,
            locationOwnerForProject(input.projectId),
          ),
        ),
        or(eq(locationTable.state, 'manual'), eq(locationTable.state, 'unresolved')),
        eq(locationRevision.origin, 'local'),
        sql`${locationRevision.sequence} = (select max(latest.sequence) from locationRevision latest where latest.locationId = ${locationTable.id})`,
        sql`exists (select 1 from json_each(${locationRevision.facts}, '$.names') names where names.type = 'text' and instr(lower(names.value), lower(${query})) > 0)`,
      ),
    )
    .orderBy(desc(locationTable.createdAt), locationTable.id)
    .limit(20)
  return rows.map(row => {
    if (row.state !== 'manual' && row.state !== 'unresolved')
      throw new Error('Unexpected nonlocal Location')
    return { ...row, state: row.state, facts: LocationFactsSchema.parse(row.facts) }
  })
}

/**
 * Discover organisation-local Locations around a pin, independently of their names.
 * @param db Request-local database.
 * @param input Authorized Project ancestry and validated search circle.
 * @returns Bounded local previews and an explicit truncation indicator.
 * @remarks Ownership and latest revision filtering precede the bounding box and limit.
 */
export async function nearbyLocalLocationCandidates(
  db: Database,
  input: { projectId: string; coordinates: [number, number]; radius: number },
): Promise<{ candidates: LocalLocationCandidate[]; limited: boolean }> {
  const [lng, lat] = input.coordinates
  const dy = input.radius / 110000
  const dx = dy / Math.cos((lat * Math.PI) / 180)
  // Use a conservative bounding box before exact distance filtering, retaining an explicit cap.
  const rows = await db
    .select({
      locationId: locationTable.id,
      revisionId: locationRevision.id,
      state: locationTable.state,
      kind: locationTable.kind,
      facts: locationRevision.facts,
    })
    .from(locationTable)
    .innerJoin(locationRevision, eq(locationRevision.locationId, locationTable.id))
    .where(
      and(
        or(
          sql`${locationTable.state} != 'manual'`,
          eq(
            locationTable.ownerOrganisationId,
            locationOwnerForProject(input.projectId),
          ),
        ),
        or(eq(locationTable.state, 'manual'), eq(locationTable.state, 'unresolved')),
        eq(locationRevision.origin, 'local'),
        sql`${locationRevision.sequence} = (select max(latest.sequence) from locationRevision latest where latest.locationId = ${locationTable.id})`,
        sql`json_extract(${locationRevision.facts}, '$.location.geometry.coordinates[0]') BETWEEN ${lng - dx} AND ${lng + dx}`,
        sql`json_extract(${locationRevision.facts}, '$.location.geometry.coordinates[1]') BETWEEN ${lat - dy} AND ${lat + dy}`,
      ),
    )
    .orderBy(locationTable.id)
    .limit(201)
  const candidates = rows
    .slice(0, 200)
    .map(row => {
      if (row.state !== 'manual' && row.state !== 'unresolved')
        throw new Error('Unexpected nonlocal Location')
      return { ...row, state: row.state, facts: LocationFactsSchema.parse(row.facts) }
    })
    .filter(
      row =>
        locationDistance(input.coordinates, row.facts.location.geometry.coordinates) <=
        input.radius,
    )
  return { candidates, limited: rows.length > 200 }
}

/**
 * Retain trusted canonical evidence without writing another project's private identity.
 * @param db Request-local database.
 * @param projectId Persisted authorized Feature ancestry.
 * @param projection Publication-pinned projection fetched by the server.
 * @returns Accessible candidate, or null when unavailable or concurrently moved out of scope.
 * @remarks Every ingestion write carries the ownership fence. Retired source identity
 * protections remain in the source service. No Feature is linked or adopted here.
 */
export async function persistLocationCandidate(
  db: Database,
  projectId: string,
  projection: SaanSeoiPlaceProjection,
): Promise<LocationCandidateResolution | null> {
  // Fence all source writes against private ownership, including concurrent scope changes.
  const guard = sql`NOT EXISTS (SELECT 1 FROM location WHERE ssId=${projection.ssId}
    AND ownerOrganisationId IS NOT NULL AND ownerOrganisationId IS NOT ${locationOwnerForProject(projectId)})`
  await persistSaanSeoiPlace(db, projection, guard)
  const candidate = await resolveLocationCandidate(db, {
    projectId,
    ssId: projection.ssId,
    resourceReleaseId: projection.releaseId,
  })
  return candidate.status === 'ready' ? candidate : null
}
