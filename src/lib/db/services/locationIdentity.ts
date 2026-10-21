// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CONTRACTS
// 2. REVIEWED IDENTITY TRANSITION
// - acceptLocationIdentity
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import {
  location as locationTable,
  locationIdentityHistory,
  locationRevision,
} from '../schema/location'
// SERVICES
import { locationAliasIds } from './locationRedirect'
import { retainAuthoredAddress } from '#lib/locations/authoredAddress.js'
import { prepareSaanSeoiRevision } from './locationSource'
// TYPES
import type { Database } from '#lib/types.js'
import type { SaanSeoiPlaceProjection } from '#lib/locations/saanseoi.js'

// ---
/********************
 *  1. CONTRACTS
 ************/
// +++ Contracts
export type LocationIdentityTransition = {
  locationId: string
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
 * Accept a reviewed promotion or source ID correction without replacing the HYPE Location.
 * @param db Request-local database supporting atomic D1 batches.
 * @param input Authorized stable identity, concurrency baseline, actor and review reason.
 * @param projection Server-verified canonical source evidence explicitly reviewed by the actor.
 * @returns Applied history/revision identities, a stale conflict, or a required merge review.
 * @remarks Trusted service only. Caller must authorize the Location owner or global steward,
 * never merely a linked Feature editor. Ownership remains private after promotion. Existing
 * accepted revisions, Feature values and overrides remain untouched: source adoption is separate.
 * This operation does not merge occupied identities or infer equivalence from names/proximity.
 */
export async function acceptLocationIdentity(
  db: Database,
  input: LocationIdentityTransition,
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
      sql`SELECT 1 AS found FROM locationIdentityReview WHERE rejection IS NOT NULL AND id=${input.reviewId}`,
    ))
  )
    return { status: 'conflict' }
  const retained = await db
    .select({
      id: locationRevision.id,
      facts: locationRevision.facts,
      payload: locationRevision.payload,
    })
    .from(locationRevision)
    .where(eq(locationRevision.locationId, input.locationId))
    .orderBy(sql`${locationRevision.sequence} DESC`)
    .get()
  projection = retainAuthoredAddress(
    projection,
    retained,
    input.expectedState !== 'linked',
  )
  const prepared = await prepareSaanSeoiRevision(input.locationId, projection)
  const revisionId = `identityRevision_${nanoid(24)}`
  const current = await db
    .select()
    .from(locationTable)
    .where(eq(locationTable.id, input.locationId))
    .get()
  if (
    !current ||
    current.state !== input.expectedState ||
    current.ssId !== input.expectedSsId ||
    current.ownerOrganisationId !== input.expectedOwnerOrganisationId
  )
    return { status: 'conflict' }
  const occupied = await db
    .select({ id: locationTable.id })
    .from(locationTable)
    .where(eq(locationTable.ssId, projection.ssId))
    .get()
  if (occupied && occupied.id !== input.locationId) return { status: 'merge-required' }
  const historicalClaim = await db
    .select({ id: locationIdentityHistory.id })
    .from(locationIdentityHistory)
    .where(sql`${locationIdentityHistory.locationId} NOT IN ${locationAliasIds(input.locationId)}
      AND (${locationIdentityHistory.ssId}=${projection.ssId}
        OR ${locationIdentityHistory.previousSsId}=${projection.ssId})`)
    .get()
  if (historicalClaim) return { status: 'merge-required' }
  if (current.ssId === projection.ssId) return { status: 'unchanged' }

  const revisionGuard = input.expectedLatestRevisionId
    ? sql`(SELECT id FROM locationRevision WHERE locationId=${input.locationId}
        ORDER BY sequence DESC LIMIT 1)=${input.expectedLatestRevisionId}`
    : sql`(SELECT id FROM locationRevision WHERE locationId=${input.locationId} ORDER BY sequence DESC LIMIT 1) IS ${retained?.id ?? null}`
  const availabilityGuard = input.expectedSourceAvailability
    ? sql`(SELECT sourceAvailability FROM location WHERE id=${input.locationId})=${input.expectedSourceAvailability}`
    : sql`1`
  const historyId = nanoid(24)
  // The history tail fences ABA identity changes; the batch rechecks every captured input.
  const guard = sql`NOT EXISTS (SELECT 1 FROM locationIdentityReview WHERE rejection IS NOT NULL AND id=${input.reviewId ?? null}) AND ${availabilityGuard} AND EXISTS (SELECT 1 FROM location WHERE id=${input.locationId}
    AND state=${input.expectedState} AND ssId IS ${input.expectedSsId}
    AND ownerOrganisationId IS ${input.expectedOwnerOrganisationId})
    AND NOT EXISTS (SELECT 1 FROM location WHERE ssId=${projection.ssId} AND id!=${input.locationId})
    AND NOT EXISTS (SELECT 1 FROM locationIdentityHistory WHERE locationId NOT IN ${locationAliasIds(input.locationId)}
      AND (ssId=${projection.ssId} OR previousSsId=${projection.ssId}))
    AND (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=${input.locationId}
      AND NOT EXISTS (SELECT 1 FROM locationIdentityHistory next WHERE next.previousHistoryId=h.id))
      IS ${input.expectedHistoryId}`
  // Source revision, review evidence and identity change either all commit or all roll back.
  const results = await db.batch([
    db
      .insert(locationRevision)
      .select(sql`SELECT ${revisionId},${input.locationId},
      (SELECT coalesce(max(sequence),0)+1 FROM locationRevision WHERE locationId=${input.locationId}),
      'saanseoi',${projection.ssId},${projection.apiVersion},${projection.releaseId},
      ${projection.snapshotId},${prepared.contentHash},${JSON.stringify(prepared.payload)},
      ${JSON.stringify(prepared.facts)},strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${guard} AND ${revisionGuard}`)
      .onConflictDoNothing({ target: locationRevision.id }),
    db
      .insert(locationIdentityHistory)
      .select(sql`SELECT ${historyId},${input.locationId},
      ${input.expectedHistoryId},${input.expectedState},${input.expectedSsId},${projection.ssId},
      ${revisionId},${input.actorId},${reason},${input.reviewId ?? null},strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE ${guard} AND EXISTS (SELECT 1 FROM locationRevision WHERE id=${revisionId})`),
    db
      .update(locationTable)
      .set({
        state: 'linked',
        kind: 'establishment',
        ssId: projection.ssId,
        sourceAvailability: 'current',
      })
      .where(
        and(
          eq(locationTable.id, input.locationId),
          sql`EXISTS
        (SELECT 1 FROM locationIdentityHistory WHERE id=${historyId})`,
        ),
      )
      .returning({ id: locationTable.id }),
  ])
  return results[2].length
    ? { status: 'applied', historyId, revisionId }
    : { status: 'conflict' }
}
