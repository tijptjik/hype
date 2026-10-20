// DRIZZLE
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
// SCHEMA
import { place, placeRevision } from '../schema/place'
import { persistSaanSeoiPlace } from './placeSource'
// VALIDATION
import { PlaceFactsSchema } from '#lib/places/validation.js'
// OWNERSHIP
import { placeOwnerForProject } from './placeScope'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceFacts } from '#lib/places/model.js'
import type { SaanSeoiPlaceProjection } from '#lib/places/saanseoi.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CANONICAL SOURCE CANDIDATE RESOLUTION
// 2. PRIVATE LOCAL DISCOVERY
// 3. SCOPED CANONICAL CANDIDATE INGESTION
// ---

export type PlaceCandidateResolution =
  | { status: 'source-import-needed' }
  | {
      status: 'ready'
      placeId: string
      revisionId: string
      ssId: string
      resourceReleaseId: string
      snapshotId: string
      facts: PlaceFacts
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
export async function resolvePlaceCandidate(
  db: Database,
  input: { projectId: string; ssId: string; resourceReleaseId: string },
): Promise<PlaceCandidateResolution> {
  // Only canonical source revisions for the selected identity are selectable.
  const row = await db
    .select({
      placeId: place.id,
      revisionId: placeRevision.id,
      ssId: placeRevision.ssId,
      resourceReleaseId: placeRevision.releaseId,
      snapshotId: placeRevision.snapshotId,
      facts: placeRevision.facts,
    })
    .from(placeRevision)
    .innerJoin(place, eq(place.id, placeRevision.placeId))
    .where(
      and(
        eq(place.ssId, input.ssId),
        eq(place.state, 'linked'),
        eq(place.sourceAvailability, 'current'),
        or(
          isNull(place.ownerOrganisationId),
          eq(place.ownerOrganisationId, placeOwnerForProject(input.projectId)),
        ),
        eq(placeRevision.origin, 'saanseoi'),
        eq(placeRevision.ssId, input.ssId),
        eq(placeRevision.releaseId, input.resourceReleaseId),
      ),
    )
    .orderBy(desc(placeRevision.sequence))
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
    facts: PlaceFactsSchema.parse(row.facts),
  }
}

export type LocalPlaceCandidate = {
  placeId: string
  revisionId: string
  state: 'manual' | 'unresolved'
  facts: PlaceFacts
}

/**
 * Find reusable private local Places by their latest localized names.
 * @param db Request-local database.
 * @param input Authorized owning project and a literal name fragment.
 * @returns At most twenty validated local baselines, never another project's records.
 * @remarks Search only the latest revision, so superseded names cannot resurrect old
 * facts. Wildcards are literal text; raw provenance is not returned. Caller must
 * authorize full inherited-field editing before accessing this private catalogue.
 */
export async function searchLocalPlaceCandidates(
  db: Database,
  input: { projectId: string; q: string },
): Promise<LocalPlaceCandidate[]> {
  const query = input.q.trim()
  if (!query || query.length > 200) throw new Error('Invalid local Place query')
  // Scope and latest-revision selection precede name matching and the result bound.
  const rows = await db
    .select({
      placeId: place.id,
      revisionId: placeRevision.id,
      state: place.state,
      facts: placeRevision.facts,
    })
    .from(place)
    .innerJoin(placeRevision, eq(placeRevision.placeId, place.id))
    .where(
      and(
        eq(place.ownerOrganisationId, placeOwnerForProject(input.projectId)),
        or(eq(place.state, 'manual'), eq(place.state, 'unresolved')),
        eq(placeRevision.origin, 'local'),
        sql`${placeRevision.sequence} = (select max(latest.sequence) from placeRevision latest where latest.placeId = ${place.id})`,
        sql`exists (select 1 from json_each(${placeRevision.facts}, '$.names') names where names.type = 'text' and instr(lower(names.value), lower(${query})) > 0)`,
      ),
    )
    .orderBy(desc(place.createdAt), place.id)
    .limit(20)
  return rows.map(row => {
    if (row.state !== 'manual' && row.state !== 'unresolved')
      throw new Error('Unexpected nonlocal Place')
    return { ...row, state: row.state, facts: PlaceFactsSchema.parse(row.facts) }
  })
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
export async function persistPlaceCandidate(
  db: Database,
  projectId: string,
  projection: SaanSeoiPlaceProjection,
): Promise<PlaceCandidateResolution | null> {
  // Fence all source writes against private ownership, including concurrent scope changes.
  const guard = sql`NOT EXISTS (SELECT 1 FROM place WHERE ssId=${projection.ssId}
    AND ownerOrganisationId IS NOT NULL AND ownerOrganisationId IS NOT ${placeOwnerForProject(projectId)})`
  await persistSaanSeoiPlace(db, projection, guard)
  const candidate = await resolvePlaceCandidate(db, {
    projectId,
    ssId: projection.ssId,
    resourceReleaseId: projection.releaseId,
  })
  return candidate.status === 'ready' ? candidate : null
}
