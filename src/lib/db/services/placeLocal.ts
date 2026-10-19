// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import { place, placeRevision } from '../schema/place'
// VALIDATION
import { LocalPlaceInputSchema } from '#lib/places/local.js'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Create a private manual or unresolved Place and its immutable local baseline.
 * @param db Request-local database with atomic D1 batch support.
 * @param projectId Persisted, authorized owning project.
 * @param input Local facts and the intentional manual/unresolved distinction.
 * @param actorId Authenticated author retained in baseline provenance.
 * @returns Stable local Place identity and initial revision identity.
 * @remarks The caller must authorize project management. No Feature is linked or
 * rewritten; canonical identities and addresses require separate verified workflows.
 */
export async function createLocalPlace(
  db: Database,
  projectId: string,
  input: unknown,
  actorId: string,
): Promise<{ placeId: string; revisionId: string }> {
  const parsed = LocalPlaceInputSchema.parse(input)
  const placeId = nanoid(12)
  const revisionId = nanoid(12)
  const payload = { kind: 'local-baseline', actorId, projectId, input: parsed }
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(payload)),
  )
  const contentHash = Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  // An atomic batch cannot leave an identity behind if its baseline insert fails.
  await db.batch([
    db
      .insert(place)
      .values({ id: placeId, state: parsed.state, ownerProjectId: projectId }),
    db.insert(placeRevision).values({
      id: revisionId,
      placeId,
      sequence: 1,
      origin: 'local',
      contentHash,
      payload,
      facts: parsed.facts,
    }),
  ])
  return { placeId, revisionId }
}
