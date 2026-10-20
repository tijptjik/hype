// ═══════════════════════
// TABLE OF CONTENTS
// 1. CANONICAL EVIDENCE PREPARATION
// 2. GUARDED SOURCE PERSISTENCE
// 3. FORWARD-ONLY BULK MIRROR PERSISTENCE
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { place, placeIdentityHistory, placeRevision } from '../schema/place'
// VALIDATION
import { PlaceFactsSchema } from '#lib/places/validation.js'
// DOMAIN
import { equalPlaceSourceRecord } from '#lib/places/sourceEvidence.js'
import {
  comparePlacePublications,
  readPlacePublicationMetadata,
} from '#lib/places/publication.js'
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
 * Prepare immutable source evidence for a specific stable HYPE Place identity.
 * @param placeId Existing or deterministically allocated HYPE identity.
 * @param projection Trusted publication-pinned projection.
 * @returns Validated facts, retained payload, content hash and deterministic revision ID.
 * @remarks Does not write or accept an identity; callers must authorize and fence writes.
 */
export async function prepareSaanSeoiRevision(
  placeId: string,
  projection: SaanSeoiPlaceProjection,
): Promise<{
  facts: SaanSeoiPlaceProjection['facts']
  payload: Record<string, unknown>
  contentHash: string
  revisionId: string
}> {
  const facts = PlaceFactsSchema.parse(projection.facts)
  if (
    !projection.ssId ||
    !projection.snapshotId ||
    !projection.releaseId ||
    !projection.apiVersion
  )
    throw new Error('Source Place requires complete publication identity')
  const payload = { ...projection.payload, issues: projection.issues }
  const contentHash = await hash({ payload, facts })
  const revisionId = `ssRevision_${await hash({ placeId, ssId: projection.ssId, contentHash })}`
  return { facts, payload, contentHash, revisionId }
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
  const existing = await db
    .select({ id: place.id })
    .from(place)
    .where(eq(place.ssId, projection.ssId))
    .get()
  // A retired source ID must not silently create a second identity after reviewed churn.
  const retired = await db
    .select({ id: placeIdentityHistory.id })
    .from(placeIdentityHistory)
    .where(eq(placeIdentityHistory.previousSsId, projection.ssId))
    .get()
  if (!existing && retired) throw new Error('Retired source identity requires review')
  // Deterministic first identity makes concurrent first ingestion converge without orphan rows.
  const placeId = existing?.id ?? `ssPlace_${await hash(projection.ssId)}`
  const {
    facts,
    payload,
    contentHash,
    revisionId: generatedRevisionId,
  } = await prepareSaanSeoiRevision(placeId, projection)
  // Reviewed identity transitions may already retain this exact source evidence.
  const retainedRevision = await db
    .select({ id: placeRevision.id })
    .from(placeRevision)
    .where(
      and(
        eq(placeRevision.placeId, placeId),
        eq(placeRevision.ssId, projection.ssId),
        eq(placeRevision.contentHash, contentHash),
        eq(placeRevision.origin, 'saanseoi'),
      ),
    )
    .orderBy(placeRevision.sequence)
    .get()
  const revisionId = retainedRevision?.id ?? generatedRevisionId
  const identityGuard = sql`EXISTS (SELECT 1 FROM place WHERE id=${placeId}
    AND ssId=${projection.ssId} AND state='linked')`
  const creationGuard = sql`${guard} AND NOT EXISTS
    (SELECT 1 FROM placeIdentityHistory WHERE previousSsId=${projection.ssId})`
  await db.batch([
    db
      .insert(place)
      .select(sql`SELECT ${placeId},${projection.ssId},'linked',NULL,'current',
        strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${creationGuard}`)
      .onConflictDoNothing({ target: place.id }),
    db
      .insert(placeRevision)
      .select(sql`SELECT ${revisionId},${placeId},
        (SELECT coalesce(max(sequence),0)+1 FROM placeRevision WHERE placeId=${placeId}),
        'saanseoi',${projection.ssId},${projection.apiVersion},${projection.releaseId},
        ${projection.snapshotId},${contentHash},${JSON.stringify(payload)},${JSON.stringify(facts)},
        strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard} AND ${identityGuard}`)
      .onConflictDoNothing({ target: placeRevision.id }),
    db
      .update(place)
      .set({ sourceAvailability: 'current' })
      .where(and(eq(place.id, placeId), guard, identityGuard)),
  ])
  const retained = await db
    .select({ ssId: place.ssId })
    .from(place)
    .where(eq(place.id, placeId))
    .get()
  if (retained && retained.ssId !== projection.ssId)
    throw new Error('Source identity changed during ingestion; review required')
  return { placeId, revisionId }
}

/**
 * Persist bulk mirror evidence without rewinding a source publication or losing hydration.
 * @param db Primary/local database with atomic batch support.
 * @param projection Verified canonical projection with publication and Address evidence.
 * @returns Confirmed stable Place/revision receipt, or throws before checkpoint advancement.
 * @remarks Same-publication hydration may improve, but canonical records cannot drift.
 * Identity/history/latest-revision guards fence concurrent refresh and merge operations.
 * This never changes Feature associations, effective values or adoption decisions.
 */
export async function persistForwardSaanSeoiPlace(
  db: Database,
  projection: SaanSeoiPlaceProjection,
): Promise<{ placeId: string; revisionId: string }> {
  const publication = readPlacePublicationMetadata(projection.payload.meta)
  const existing = await db.get<{
    id: string
    ownerProjectId: string | null
    state: string
    sourceAvailability: string
    latestId: string | null
    historyId: string | null
    payload: string | null
    facts: string | null
  }>(sql`SELECT p.id,p.ownerProjectId,p.state,p.sourceAvailability,r.id AS latestId,
    r.payload,r.facts,(SELECT h.id FROM placeIdentityHistory h WHERE h.placeId=p.id
      AND NOT EXISTS(SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id)) AS historyId
    FROM place p LEFT JOIN placeRevision r ON r.placeId=p.id
      AND r.sequence=(SELECT max(sequence) FROM placeRevision WHERE placeId=p.id)
    WHERE p.ssId=${projection.ssId}`)
  if (existing) {
    if (
      existing.state !== 'linked' ||
      !existing.latestId ||
      !existing.payload ||
      !existing.facts
    )
      throw new Error('Source mirror identity requires review')
    const previousPayload = JSON.parse(existing.payload)
    const transition = comparePlacePublications(
      readPlacePublicationMetadata(previousPayload.meta),
      publication,
    )
    if (transition === 'review')
      throw new Error('Source mirror publication is older or ambiguous')
    if (transition === 'unchanged') {
      if (
        existing.sourceAvailability !== 'current' ||
        !previousPayload.resource ||
        !projection.payload.resource ||
        !equalPlaceSourceRecord(previousPayload.resource, projection.payload.resource)
      )
        throw new Error(
          'Source mirror canonical evidence changed within its publication',
        )
      if (
        JSON.parse(existing.facts).location.address.status === 'resolved' &&
        projection.facts.location.address.status !== 'resolved'
      )
        throw new Error('Source mirror cannot discard resolved Address evidence')
    }
  }
  const placeId = existing?.id ?? `ssPlace_${await hash(projection.ssId)}`
  const prepared = await prepareSaanSeoiRevision(placeId, projection)
  // The new revision is allowed in the guard after this batch inserts it, so availability can advance too.
  const guard = existing
    ? sql`EXISTS(SELECT 1 FROM place p WHERE p.id=${placeId} AND p.ssId=${projection.ssId}
      AND p.state='linked' AND p.ownerProjectId IS ${existing.ownerProjectId}
      AND p.sourceAvailability=${existing.sourceAvailability}
      AND (SELECT h.id FROM placeIdentityHistory h WHERE h.placeId=p.id AND NOT EXISTS
        (SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id)) IS ${existing.historyId}
      AND (SELECT id FROM placeRevision WHERE placeId=p.id ORDER BY sequence DESC LIMIT 1)
        IN (${existing.latestId},${prepared.revisionId}))`
    : sql`NOT EXISTS(SELECT 1 FROM place p WHERE p.ssId=${projection.ssId} AND
      (p.id!=${placeId} OR p.state!='linked' OR p.ownerProjectId IS NOT NULL OR p.sourceAvailability!='current'
        OR EXISTS(SELECT 1 FROM placeRevision r WHERE r.placeId=p.id AND r.id!=${prepared.revisionId})
        OR EXISTS(SELECT 1 FROM placeIdentityHistory h WHERE h.placeId=p.id)))`
  const receipt = await persistSaanSeoiPlace(db, projection, guard)
  // Low-level persistence can return deterministic IDs after a rejected fence; verify before checkpointing.
  const retained = await db.get<{
    id: string
  }>(sql`SELECT r.id FROM placeRevision r JOIN place p ON p.id=r.placeId
    WHERE r.id=${receipt.revisionId} AND p.id=${placeId} AND p.ssId=${projection.ssId}
      AND p.state='linked' AND p.sourceAvailability='current' AND p.ownerProjectId IS ${existing?.ownerProjectId ?? null}
      AND (SELECT h.id FROM placeIdentityHistory h WHERE h.placeId=p.id AND NOT EXISTS
        (SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id)) IS ${existing?.historyId ?? null}
      AND (SELECT id FROM placeRevision WHERE placeId=p.id ORDER BY sequence DESC LIMIT 1)
        IN (${existing?.latestId ?? null},${prepared.revisionId},${receipt.revisionId})`)
  if (!retained || receipt.placeId !== placeId)
    throw new Error('Source mirror changed during persistence; retry required')
  return receipt
}
