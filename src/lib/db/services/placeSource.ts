// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { place, placeRevision } from '../schema/place'
// VALIDATION
import { PlaceFactsSchema } from '#lib/places/validation.js'
// TYPES
import type { SQL } from 'drizzle-orm'
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
 * @param guard Optional trusted sync ownership/identity fence for every write.
 * @returns Stable HYPE Place identity and idempotent source revision identity.
 * @remarks Trusted ingestion only: never expose this as an arbitrary client payload
 * mutation. Existing identity wins over generated identity; no Feature is linked,
 * adopted or materialized here. Replayed payloads do not create new revisions.
 * With a guard, returned deterministic IDs are not proof of persistence: the caller
 * must checkpoint them only under the same fence and after verifying the revision exists.
 */
export async function persistSaanSeoiPlace(
  db: Database,
  projection: SaanSeoiPlaceProjection,
  guard: SQL = sql`1`,
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
      .select(sql`SELECT ${placeId},${projection.ssId},'linked',NULL,'current',
        strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard}`)
      .onConflictDoNothing({ target: place.id }),
    db
      .insert(placeRevision)
      .select(sql`SELECT ${revisionId},${placeId},
        (SELECT coalesce(max(sequence),0)+1 FROM placeRevision WHERE placeId=${placeId}),
        'saanseoi',${projection.ssId},${projection.apiVersion},${projection.releaseId},
        ${projection.snapshotId},${contentHash},${JSON.stringify(payload)},${JSON.stringify(facts)},
        strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard}`)
      .onConflictDoNothing({ target: placeRevision.id }),
    db
      .update(place)
      .set({ sourceAvailability: 'current' })
      .where(and(eq(place.id, placeId), guard)),
  ])
  return { placeId, revisionId }
}
