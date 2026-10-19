// DRIZZLE
import { and, desc, eq, isNull, or } from 'drizzle-orm'
// SCHEMA
import { place, placeRevision } from '../schema/place'
// VALIDATION
import { PlaceFactsSchema } from '#lib/places/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceFacts } from '#lib/places/model.js'

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
        or(isNull(place.ownerProjectId), eq(place.ownerProjectId, input.projectId)),
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
