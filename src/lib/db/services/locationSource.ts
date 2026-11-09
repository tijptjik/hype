import {
  reconcileSharedLocationSource,
  reconcileOrganisationSourcePolicies,
} from './locationShared'
// ═══════════════════════
// TABLE OF CONTENTS
// 1. CANONICAL EVIDENCE PREPARATION
// 2. GUARDED SOURCE PERSISTENCE
// 3. FORWARD-ONLY SOURCE PERSISTENCE
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  location as locationTable,
  locationIdentityHistory,
  locationRevision,
} from '../schema/location'
// VALIDATION
import { LocationFactsSchema } from '#lib/locations/validation.js'
// DOMAIN
import {
  readLocationFacts,
  serializeLocationFacts,
} from '#lib/locations/factsSnapshot.js'
import { deriveLocationId } from '#lib/locations/id.server.js'
import { equalLocationSourceRecord } from '#lib/locations/sourceEvidence.js'
import {
  compareLocationPublications,
  readLocationPublicationMetadata,
} from '#lib/locations/publication.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

/** Canonical source evidence requires review rather than an automatic retry. */
export class LocationSourceReviewError extends Error {}

/** Concurrent state or lost ownership prevented a confirmed source write. */
export class LocationSourceConflictError extends Error {}

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
 * Prepare immutable source evidence for a specific stable HYPE Location identity.
 * @param locationId Existing or deterministically allocated HYPE identity.
 * @param projection Trusted publication-pinned projection.
 * @returns Validated facts, retained rawSource, content hash and deterministic revision ID.
 * @remarks Does not write or accept an identity; callers must authorize and fence writes.
 */
export async function prepareSaanSeoiRevision(
  locationId: string,
  projection: SaanSeoiPlaceProjection,
): Promise<{
  facts: SaanSeoiPlaceProjection['facts']
  rawSource: Record<string, unknown>
  contentHash: string
  revisionId: string
}> {
  const facts = LocationFactsSchema.parse(projection.facts)
  if (
    !projection.ssId ||
    !projection.snapshotId ||
    !projection.releaseId ||
    !projection.apiVersion
  )
    throw new Error('Source Location requires complete publication identity')
  const rawSource = { ...projection.rawSource, issues: projection.issues }
  const contentHash = await hash({ payload: rawSource, facts })
  const revisionId = `ssRevision_${await hash({ locationId, ssId: projection.ssId, contentHash })}`
  return { facts, rawSource, contentHash, revisionId }
}

/**
 * Mirror a verified SaanSeoi projection as an immutable shared Location revision.
 * @param db Request-local database with atomic batch support.
 * @param projection Validated, publication-pinned source and Address projection.
 * @param guard Optional trusted sync ownership/identity fence for every write.
 * @returns Stable HYPE Location identity and idempotent source revision identity.
 * @remarks Trusted ingestion only: never expose this as an arbitrary client rawSource
 * mutation. Existing identity wins over generated identity; no Feature is linked,
 * adopted or materialized here. Replayed payloads do not create new revisions.
 * With a guard, returned deterministic IDs are not proof of persistence: the caller
 * must checkpoint them only under the same fence and after verifying the revision exists.
 */
export async function persistSaanSeoiPlace(
  db: Database,
  projection: SaanSeoiPlaceProjection,
  guard: SQL = sql`1`,
): Promise<{ locationId: string; revisionId: string }> {
  const existing = await db
    .select({ id: locationTable.id })
    .from(locationTable)
    .where(eq(locationTable.ssId, projection.ssId))
    .get()
  // A retired source ID must not silently create a second identity after reviewed churn.
  const retired = await db
    .select({ id: locationIdentityHistory.id })
    .from(locationIdentityHistory)
    .where(eq(locationIdentityHistory.previousSsId, projection.ssId))
    .get()
  if (!existing && retired) throw new Error('Retired source identity requires review')
  // Deterministic first identity makes concurrent first ingestion converge without orphan rows.
  const locationId = existing?.id ?? deriveLocationId('saanseoi', projection.ssId)
  const latest = await db
    .select({
      id: locationRevision.id,
      facts: locationRevision.facts,
      rawSource: locationRevision.rawSource,
    })
    .from(locationRevision)
    .where(eq(locationRevision.locationId, locationId))
    .orderBy(sql`${locationRevision.version} DESC`)
    .get()
  const {
    facts,
    rawSource,
    contentHash,
    revisionId: generatedRevisionId,
  } = await prepareSaanSeoiRevision(locationId, projection)
  // Reviewed identity transitions may already retain this exact source evidence.
  const retainedRevision = await db
    .select({ id: locationRevision.id })
    .from(locationRevision)
    .where(
      and(
        eq(locationRevision.locationId, locationId),
        eq(locationRevision.ssId, projection.ssId),
        eq(locationRevision.contentHash, contentHash),
        eq(locationRevision.origin, 'saanseoi'),
      ),
    )
    .orderBy(locationRevision.version)
    .get()
  const revisionId = retainedRevision?.id ?? generatedRevisionId
  guard = sql`(${guard}) AND ((SELECT id FROM locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1) IS ${latest?.id ?? null}
    OR (SELECT id FROM locationRevision WHERE locationId=${locationId} ORDER BY version DESC LIMIT 1)=${revisionId})`
  const identityGuard = sql`EXISTS (SELECT 1 FROM location WHERE id=${locationId}
    AND ssId=${projection.ssId} AND state='linked')`
  const creationGuard = sql`${guard} AND NOT EXISTS
    (SELECT 1 FROM locationIdentityHistory WHERE previousSsId=${projection.ssId})`
  await db.batch([
    db
      .insert(locationTable)
      .select(sql`SELECT ${locationId},${projection.ssId},'establishment',NULL,'linked','current',
        NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${creationGuard}`)
      .onConflictDoNothing({ target: locationTable.id }),
    db
      .insert(locationRevision)
      .select(sql`SELECT ${revisionId},${locationId},
        (SELECT coalesce(max(version),0)+1 FROM locationRevision WHERE locationId=${locationId}),
        'saanseoi',${projection.ssId},${projection.apiVersion},${projection.releaseId},
        ${projection.snapshotId},${contentHash},${JSON.stringify(rawSource)},${serializeLocationFacts(facts, 'establishment')},
        strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard} AND ${identityGuard}`)
      .onConflictDoNothing({ target: locationRevision.id }),
    db
      .update(locationTable)
      .set({ sourceAvailability: 'current' })
      .where(and(eq(locationTable.id, locationId), guard, identityGuard)),
  ])
  const retained = await db
    .select({ ssId: locationTable.ssId })
    .from(locationTable)
    .where(eq(locationTable.id, locationId))
    .get()
  if (retained && retained.ssId !== projection.ssId)
    throw new Error('Source identity changed during ingestion; review required')
  return { locationId, revisionId }
}

/**
 * Persist source evidence without rewinding a source publication or losing hydration.
 * @param db Primary/local database with atomic batch support.
 * @param projection Verified canonical projection with publication and Address evidence.
 * @param ownershipGuard Optional trusted run/lease fence, checked during writes and receipt verification.
 * @returns Confirmed stable Location/revision receipt, or throws before checkpoint advancement.
 * @remarks Same-publication hydration may improve, but canonical records cannot drift.
 * Identity/history/latest-revision guards fence concurrent refresh and merge operations.
 * This never changes Feature associations, effective values or adoption decisions.
 */
export async function persistForwardSaanSeoiPlace(
  db: Database,
  projection: SaanSeoiPlaceProjection,
  ownershipGuard: SQL = sql`1`,
): Promise<{ locationId: string; revisionId: string }> {
  const publication = readLocationPublicationMetadata(projection.rawSource.meta)
  const existing = await db.get<{
    id: string
    ownerOrganisationId: string | null
    state: string
    sourceAvailability: string
    latestId: string | null
    historyId: string | null
    rawSource: string | null
    facts: string | null
  }>(sql`SELECT p.id,p.ownerOrganisationId,p.state,p.sourceAvailability,r.id AS latestId,
    r.rawSource,r.facts,(SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=p.id
      AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id)) AS historyId
    FROM location p LEFT JOIN locationRevision r ON r.locationId=p.id
      AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=p.id)
    WHERE p.ssId=${projection.ssId}`)
  if (existing) {
    if (
      existing.state !== 'linked' ||
      !existing.latestId ||
      !existing.rawSource ||
      !existing.facts
    )
      throw new LocationSourceReviewError('Source mirror identity requires review')
    const previousPayload = JSON.parse(existing.rawSource)
    const transition = compareLocationPublications(
      readLocationPublicationMetadata(previousPayload.meta),
      publication,
    )
    if (transition === 'review')
      throw new LocationSourceReviewError(
        'Source mirror publication is older or ambiguous',
      )
    if (transition === 'unchanged') {
      if (
        existing.sourceAvailability !== 'current' ||
        !previousPayload.resource ||
        !projection.rawSource.resource ||
        !equalLocationSourceRecord(
          previousPayload.resource,
          projection.rawSource.resource,
        )
      )
        throw new LocationSourceReviewError(
          'Source mirror canonical evidence changed within its publication',
        )
      if (
        (
          previousPayload.sourceAddress ??
          readLocationFacts(existing.facts).location.address
        ).status === 'resolved' &&
        projection.facts.location.address.status !== 'resolved'
      )
        throw new LocationSourceReviewError(
          'Source mirror cannot discard resolved Address evidence',
        )
    }
  }
  const locationId = existing?.id ?? deriveLocationId('saanseoi', projection.ssId)
  const prepared = await prepareSaanSeoiRevision(locationId, projection)
  // The new revision is allowed in the guard after this batch inserts it, so availability can advance too.
  const guard = existing
    ? sql`EXISTS(SELECT 1 FROM location p WHERE p.id=${locationId} AND p.ssId=${projection.ssId}
      AND p.state='linked' AND p.ownerOrganisationId IS ${existing.ownerOrganisationId}
      AND p.sourceAvailability=${existing.sourceAvailability}
      AND (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=p.id AND NOT EXISTS
        (SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id)) IS ${existing.historyId}
      AND (SELECT id FROM locationRevision WHERE locationId=p.id ORDER BY version DESC LIMIT 1)
        IN (${existing.latestId},${prepared.revisionId}))`
    : sql`NOT EXISTS(SELECT 1 FROM location p WHERE p.ssId=${projection.ssId} AND
      (p.id!=${locationId} OR p.state!='linked' OR p.ownerOrganisationId IS NOT NULL OR p.sourceAvailability!='current'
        OR EXISTS(SELECT 1 FROM locationRevision r WHERE r.locationId=p.id AND r.id!=${prepared.revisionId})
        OR EXISTS(SELECT 1 FROM locationIdentityHistory h WHERE h.locationId=p.id)))`
  const receipt = await persistSaanSeoiPlace(
    db,
    projection,
    sql`${guard} AND (${ownershipGuard})`,
  )
  // Low-level persistence can return deterministic IDs after a rejected fence; verify before checkpointing.
  const retained = await db.get<{
    id: string
  }>(sql`SELECT r.id FROM locationRevision r JOIN location p ON p.id=r.locationId
    WHERE (${ownershipGuard}) AND r.id=${receipt.revisionId} AND p.id=${locationId} AND p.ssId=${projection.ssId}
      AND p.state='linked' AND p.sourceAvailability='current' AND p.ownerOrganisationId IS ${existing?.ownerOrganisationId ?? null}
      AND (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=p.id AND NOT EXISTS
        (SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id)) IS ${existing?.historyId ?? null}
      AND (SELECT id FROM locationRevision WHERE locationId=p.id ORDER BY version DESC LIMIT 1)
        IN (${existing?.latestId ?? null},${prepared.revisionId},${receipt.revisionId})`)
  if (!retained || receipt.locationId !== locationId)
    throw new LocationSourceConflictError(
      'Source mirror changed during persistence; retry required',
    )
  await reconcileSharedLocationSource(db, receipt.locationId, receipt.revisionId)
  await reconcileOrganisationSourcePolicies(db, receipt.locationId, receipt.revisionId)
  return receipt
}
