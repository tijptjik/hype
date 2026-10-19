// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { place, placeRevision } from '../schema/place'
// VALIDATION
import { PlaceFactsSchema } from '#lib/places/validation.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { SaanSeoiPlaceProjection } from '#lib/places/saanseoi.js'

/**
 * Serialize JSON with stable object-key order for reproducible source revision identity.
 * @param value JSON-compatible source evidence.
 * @returns Canonical JSON, preserving array order and every source field.
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`
}

/**
 * Hash canonical source evidence without including fetch time or random request identity.
 * @param value JSON-compatible input.
 * @returns Full SHA-256 hexadecimal digest.
 */
async function hash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(value)),
  )
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/**
 * Mirror a verified SaanSeoi projection as an immutable shared Place revision.
 * @param db Request-local database with atomic batch support.
 * @param projection Validated, publication-pinned source and Address projection.
 * @returns Stable HYPE Place identity and idempotent source revision identity.
 * @remarks Trusted ingestion only: never expose this as an arbitrary client payload
 * mutation. Existing identity wins over generated identity; no Feature is linked,
 * adopted or materialized here. Replayed payloads do not create new revisions.
 */
export async function persistSaanSeoiPlace(
  db: Database,
  projection: SaanSeoiPlaceProjection,
): Promise<{ placeId: string; revisionId: string }> {
  const facts = PlaceFactsSchema.parse(projection.facts)
  if (
    !projection.ssId ||
    !projection.snapshotId ||
    !projection.releaseId ||
    !projection.apiVersion
  )
    throw new Error('Source Place requires complete publication identity')
  const existing = await db
    .select({ id: place.id })
    .from(place)
    .where(eq(place.ssId, projection.ssId))
    .get()
  // Deterministic first identity makes concurrent first ingestion converge without orphan rows.
  const placeId = existing?.id ?? `ssPlace_${await hash(projection.ssId)}`
  const payload = { ...projection.payload, issues: projection.issues }
  const contentHash = await hash({ payload, facts })
  const revisionId = `ssRevision_${await hash({ placeId, ssId: projection.ssId, contentHash })}`
  await db.batch([
    db
      .insert(place)
      .values({ id: placeId, ssId: projection.ssId, state: 'linked' })
      .onConflictDoNothing({ target: place.id }),
    db
      .insert(placeRevision)
      .values({
        id: revisionId,
        placeId,
        sequence: sql`(select coalesce(max(sequence), 0) + 1 from placeRevision where placeId = ${placeId})`,
        origin: 'saanseoi',
        ssId: projection.ssId,
        apiVersion: projection.apiVersion,
        releaseId: projection.releaseId,
        snapshotId: projection.snapshotId,
        contentHash,
        payload,
        facts,
      })
      .onConflictDoNothing({ target: placeRevision.id }),
    db
      .update(place)
      .set({ sourceAvailability: 'current' })
      .where(eq(place.id, placeId)),
  ])
  return { placeId, revisionId }
}
