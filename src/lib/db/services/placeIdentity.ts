// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CONTRACTS
// 2. REVIEWED IDENTITY TRANSITION
// - acceptPlaceIdentity
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import { place, placeIdentityHistory, placeRevision } from '../schema/place'
// SERVICES
import { placeAliasIds } from './placeRedirect'
import { prepareSaanSeoiRevision } from './placeSource'
// TYPES
import type { Database } from '#lib/types.js'
import type { SaanSeoiPlaceProjection } from '#lib/places/saanseoi.js'

// ---
/********************
 *  1. CONTRACTS
 ************/
// +++ Contracts
export type PlaceIdentityTransition = {
  placeId: string
  expectedState: 'manual' | 'unresolved' | 'linked'
  expectedSsId: string | null
  expectedHistoryId: string | null
  expectedOwnerOrganisationId: string | null
  reviewId?: string
  expectedLatestRevisionId?: string
  expectedSourceAvailability?: 'current' | 'missing' | 'review'
  actorId: string
  reason: string
}

// ---
/********************
 *  2. REVIEWED IDENTITY TRANSITION
 ************/
// +++ Reviewed Identity Transition
/**
 * Accept a reviewed promotion or source ID correction without replacing the HYPE Place.
 * @param db Request-local database supporting atomic D1 batches.
 * @param input Authorized stable identity, concurrency baseline, actor and review reason.
 * @param projection Server-verified canonical source evidence explicitly reviewed by the actor.
 * @returns Applied history/revision identities, a stale conflict, or a required merge review.
 * @remarks Trusted service only. Caller must authorize the Place owner or global steward,
 * never merely a linked Feature editor. Ownership remains private after promotion. Existing
 * accepted revisions, Feature values and overrides remain untouched: source adoption is separate.
 * This operation does not merge occupied identities or infer equivalence from names/proximity.
 */
export async function acceptPlaceIdentity(
  db: Database,
  input: PlaceIdentityTransition,
  projection: SaanSeoiPlaceProjection,
): Promise<
  | { status: 'applied'; historyId: string; revisionId: string }
  | { status: 'conflict' | 'unchanged' | 'merge-required' }
> {
  const reason = input.reason.trim()
  if (!input.actorId.trim() || !reason || reason.length > 2000)
    throw new Error(
      'Identity review requires an actor and a reason of 1–2000 characters',
    )
  if (
    input.reviewId &&
    (await db.get(
      sql`SELECT 1 AS found FROM placeIdentityReview WHERE rejection IS NOT NULL AND id=${input.reviewId}`,
    ))
  )
    return { status: 'conflict' }
  const prepared = await prepareSaanSeoiRevision(input.placeId, projection)
  const revisionId = `identityRevision_${nanoid(24)}`
  const current = await db.select().from(place).where(eq(place.id, input.placeId)).get()
  if (
    !current ||
    current.state !== input.expectedState ||
    current.ssId !== input.expectedSsId ||
    current.ownerOrganisationId !== input.expectedOwnerOrganisationId
  )
    return { status: 'conflict' }
  const occupied = await db
    .select({ id: place.id })
    .from(place)
    .where(eq(place.ssId, projection.ssId))
    .get()
  if (occupied && occupied.id !== input.placeId) return { status: 'merge-required' }
  const historicalClaim = await db
    .select({ id: placeIdentityHistory.id })
    .from(placeIdentityHistory)
    .where(sql`${placeIdentityHistory.placeId} NOT IN ${placeAliasIds(input.placeId)}
      AND (${placeIdentityHistory.ssId}=${projection.ssId}
        OR ${placeIdentityHistory.previousSsId}=${projection.ssId})`)
    .get()
  if (historicalClaim) return { status: 'merge-required' }
  if (current.ssId === projection.ssId) return { status: 'unchanged' }

  const revisionGuard = input.expectedLatestRevisionId
    ? sql`(SELECT id FROM placeRevision WHERE placeId=${input.placeId}
        ORDER BY sequence DESC LIMIT 1)=${input.expectedLatestRevisionId}`
    : sql`1`
  const availabilityGuard = input.expectedSourceAvailability
    ? sql`(SELECT sourceAvailability FROM place WHERE id=${input.placeId})=${input.expectedSourceAvailability}`
    : sql`1`
  const historyId = nanoid(24)
  // The history tail fences ABA identity changes; the batch rechecks every captured input.
  const guard = sql`NOT EXISTS (SELECT 1 FROM placeIdentityReview WHERE rejection IS NOT NULL AND id=${input.reviewId ?? null}) AND ${availabilityGuard} AND EXISTS (SELECT 1 FROM place WHERE id=${input.placeId}
    AND state=${input.expectedState} AND ssId IS ${input.expectedSsId}
    AND ownerOrganisationId IS ${input.expectedOwnerOrganisationId})
    AND NOT EXISTS (SELECT 1 FROM place WHERE ssId=${projection.ssId} AND id!=${input.placeId})
    AND NOT EXISTS (SELECT 1 FROM placeIdentityHistory WHERE placeId NOT IN ${placeAliasIds(input.placeId)}
      AND (ssId=${projection.ssId} OR previousSsId=${projection.ssId}))
    AND (SELECT h.id FROM placeIdentityHistory h WHERE h.placeId=${input.placeId}
      AND NOT EXISTS (SELECT 1 FROM placeIdentityHistory next WHERE next.previousHistoryId=h.id))
      IS ${input.expectedHistoryId}`
  // Source revision, review evidence and identity change either all commit or all roll back.
  const results = await db.batch([
    db
      .insert(placeRevision)
      .select(sql`SELECT ${revisionId},${input.placeId},
      (SELECT coalesce(max(sequence),0)+1 FROM placeRevision WHERE placeId=${input.placeId}),
      'saanseoi',${projection.ssId},${projection.apiVersion},${projection.releaseId},
      ${projection.snapshotId},${prepared.contentHash},${JSON.stringify(prepared.payload)},
      ${JSON.stringify(prepared.facts)},strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard} AND ${revisionGuard}`)
      .onConflictDoNothing({ target: placeRevision.id }),
    db.insert(placeIdentityHistory).select(sql`SELECT ${historyId},${input.placeId},
      ${input.expectedHistoryId},${input.expectedState},${input.expectedSsId},${projection.ssId},
      ${revisionId},${input.actorId},${reason},${input.reviewId ?? null},strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE ${guard} AND EXISTS (SELECT 1 FROM placeRevision WHERE id=${revisionId})`),
    db
      .update(place)
      .set({ state: 'linked', ssId: projection.ssId, sourceAvailability: 'current' })
      .where(
        and(
          eq(place.id, input.placeId),
          sql`EXISTS
        (SELECT 1 FROM placeIdentityHistory WHERE id=${historyId})`,
        ),
      )
      .returning({ id: place.id }),
  ])
  return results[2].length
    ? { status: 'applied', historyId, revisionId }
    : { status: 'conflict' }
}
