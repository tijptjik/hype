// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. AUTHORIZATION PROBE
// - probePlaceIdentityScope
// 2. REVIEW EVIDENCE
// - readPlaceIdentityBaseline
// - capturePlaceIdentityReview
// - captureMirroredPlaceIdentityReview
// - readPlaceIdentityReview
// 3. REVIEW ACCEPTANCE
// - acceptPlaceIdentityReview
// ---
// DRIZZLE
import { and, eq, isNull, or, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import { place, placeIdentityReview, placeRevision } from '../schema/place'
// DOMAIN
import { PlaceFactsSchema } from '#lib/places/validation.js'
import { equalPlaceValue } from '#lib/places/baseline.js'
// SERVICES
import { acceptPlaceIdentity } from './placeIdentity'
import { prepareSaanSeoiRevision } from './placeSource'
// TYPES
import type { Database } from '#lib/types.js'
import type { PlaceFacts } from '#lib/places/model.js'
import type { PlaceIdentityBaseline } from '#lib/places/identity.js'
import type { SaanSeoiPlaceProjection } from '#lib/places/saanseoi.js'

// ---
/********************
 *  1. AUTHORIZATION PROBE
 ************/
// +++ Authorization Probe
/**
 * Read only the persisted ownership needed to authorize Place identity administration.
 * @param db Request-local database.
 * @param placeId Stable HYPE identity.
 * @returns Minimal scope or null, never source facts or raw provenance.
 */
export async function probePlaceIdentityScope(
  db: Database,
  placeId: string,
): Promise<{ id: string; ownerProjectId: string | null } | null> {
  return (
    (await db
      .select({ id: place.id, ownerProjectId: place.ownerProjectId })
      .from(place)
      .where(eq(place.id, placeId))
      .get()) ?? null
  )
}

// ---
/********************
 *  2. REVIEW EVIDENCE
 ************/
// +++ Review Evidence
/**
 * Capture the current identity and source-revision concurrency baseline.
 * @param db Request-local database.
 * @param placeId Authorized Place identity.
 * @param ownerProjectId Ownership checked by the authorization probe, including null for shared.
 * @returns Baseline tokens or null if ownership/identity disappeared.
 * @remarks One SQL statement captures the latest revision and history tail together.
 */
export async function readPlaceIdentityBaseline(
  db: Database,
  placeId: string,
  ownerProjectId: string | null,
): Promise<PlaceIdentityBaseline | null> {
  const row = await db
    .select({
      placeId: place.id,
      expectedState: place.state,
      expectedSsId: place.ssId,
      expectedOwnerProjectId: place.ownerProjectId,
      expectedSourceAvailability: place.sourceAvailability,
      expectedLatestRevisionId: placeRevision.id,
      expectedHistoryId: sql<string | null>`(SELECT h.id FROM placeIdentityHistory h
      WHERE h.placeId=${place.id} AND NOT EXISTS
      (SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id))`,
    })
    .from(place)
    .innerJoin(placeRevision, eq(placeRevision.placeId, place.id))
    .where(
      and(
        eq(place.id, placeId),
        sql`${place.ownerProjectId} IS ${ownerProjectId}`,
        sql`${placeRevision.sequence}=(SELECT max(r.sequence) FROM placeRevision r WHERE r.placeId=${place.id})`,
      ),
    )
    .get()
  if (!row || row.expectedState === 'redirect') return null
  return { ...row, expectedState: row.expectedState }
}

/**
 * Retain server-verified canonical evidence without claiming the candidate's source identity.
 * @param db Request-local database.
 * @param baseline Authorized target state captured before fetching source evidence.
 * @param projection Verified pinned collection record, never supplied by a remote client.
 * @param actorId Authenticated reviewer starting the comparison.
 * @returns Immutable review ID or null when the target changed during source retrieval.
 */
export async function capturePlaceIdentityReview(
  db: Database,
  baseline: PlaceIdentityBaseline,
  projection: SaanSeoiPlaceProjection,
  actorId: string,
): Promise<string | null> {
  if (!actorId.trim()) throw new Error('Identity review requires an actor')
  await prepareSaanSeoiRevision(baseline.placeId, projection)
  const current = await readPlaceIdentityBaseline(
    db,
    baseline.placeId,
    baseline.expectedOwnerProjectId,
  )
  if (!equalPlaceValue(current, baseline)) return null
  const id = nanoid(24)
  // Capture cannot race an identity, ownership or source-revision change after the fetch.
  const rows = await db
    .insert(placeIdentityReview)
    .select(sql`SELECT ${id},${baseline.placeId},
    ${baseline.expectedOwnerProjectId},${JSON.stringify(baseline)},${JSON.stringify(projection)},
    ${actorId},strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE EXISTS
    (SELECT 1 FROM place WHERE id=${baseline.placeId} AND ownerProjectId IS ${baseline.expectedOwnerProjectId}
      AND state=${baseline.expectedState} AND ssId IS ${baseline.expectedSsId}
      AND sourceAvailability=${baseline.expectedSourceAvailability})
    AND (SELECT id FROM placeRevision WHERE placeId=${baseline.placeId} ORDER BY sequence DESC LIMIT 1)
      =${baseline.expectedLatestRevisionId}
    AND (SELECT h.id FROM placeIdentityHistory h WHERE h.placeId=${baseline.placeId}
      AND NOT EXISTS (SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id))
      IS ${baseline.expectedHistoryId}`)
    .returning({ id: placeIdentityReview.id })
  return rows[0]?.id ?? null
}

/**
 * Capture a canonical revision already mirrored in HYPE for the editor's selected candidate.
 * @param db Request-local database.
 * @param baseline Authorized target scope captured before resolving the candidate.
 * @param candidateRevisionId Exact selected source revision, not client-supplied facts.
 * @param actorId Authenticated reviewer.
 * @returns Retained review ID or null for inaccessible, obsolete-identity or changed input.
 * @remarks Only shared source evidence or evidence owned by the same project is eligible.
 * A candidate already bound to another Place remains subject to explicit merge handling.
 */
export async function captureMirroredPlaceIdentityReview(
  db: Database,
  baseline: PlaceIdentityBaseline,
  candidateRevisionId: string,
  actorId: string,
): Promise<string | null> {
  const row = await db
    .select({
      ssId: placeRevision.ssId,
      apiVersion: placeRevision.apiVersion,
      releaseId: placeRevision.releaseId,
      snapshotId: placeRevision.snapshotId,
      payload: placeRevision.payload,
      facts: placeRevision.facts,
    })
    .from(placeRevision)
    .innerJoin(place, eq(place.id, placeRevision.placeId))
    .where(
      and(
        eq(placeRevision.id, candidateRevisionId),
        eq(placeRevision.origin, 'saanseoi'),
        eq(place.state, 'linked'),
        eq(place.sourceAvailability, 'current'),
        eq(place.ssId, placeRevision.ssId),
        or(
          isNull(place.ownerProjectId),
          baseline.expectedOwnerProjectId
            ? eq(place.ownerProjectId, baseline.expectedOwnerProjectId)
            : sql`0`,
        ),
      ),
    )
    .get()
  if (!row?.ssId || !row.apiVersion || !row.releaseId || !row.snapshotId) return null
  const { issues: rawIssues, ...payload } = row.payload
  const issues = z
    .array(
      z.discriminatedUnion('kind', [
        z.object({
          kind: z.literal('invalidPhone'),
          index: z.number().int().nonnegative(),
          value: z.string(),
        }),
        z.object({ kind: z.literal('addressRecordsPending') }),
      ]),
    )
    .parse(rawIssues ?? [])
  return capturePlaceIdentityReview(
    db,
    baseline,
    {
      ...row,
      ssId: row.ssId,
      apiVersion: row.apiVersion,
      releaseId: row.releaseId,
      snapshotId: row.snapshotId,
      payload,
      issues,
    },
    actorId,
  )
}

/**
 * Read the comparison shown to an authorized identity reviewer.
 * @param db Request-local database.
 * @param input Persisted target scope and immutable review identity.
 * @returns Projected before/after facts and source identifiers; raw payload stays server-side.
 * @remarks A stale review remains readable but cannot be accepted without recapturing evidence.
 */
export async function readPlaceIdentityReview(
  db: Database,
  input: {
    placeId: string
    ownerProjectId: string | null
    reviewId: string
  },
): Promise<{
  id: string
  placeId: string
  stale: boolean
  previousSsId: string | null
  previousState: PlaceIdentityBaseline['expectedState']
  before: PlaceFacts
  candidate: {
    ssId: string
    releaseId: string
    snapshotId: string
    facts: PlaceFacts
    issueKinds: SaanSeoiPlaceProjection['issues'][number]['kind'][]
  }
  createdAt: string
} | null> {
  const row = await db
    .select()
    .from(placeIdentityReview)
    .where(
      and(
        eq(placeIdentityReview.id, input.reviewId),
        eq(placeIdentityReview.placeId, input.placeId),
        sql`${placeIdentityReview.ownerProjectId} IS ${input.ownerProjectId}`,
      ),
    )
    .get()
  if (!row) return null
  const current = await readPlaceIdentityBaseline(
    db,
    input.placeId,
    input.ownerProjectId,
  )
  if (!current) return null
  const baseline = await db
    .select({ facts: placeRevision.facts })
    .from(placeRevision)
    .where(
      and(
        eq(placeRevision.placeId, input.placeId),
        eq(placeRevision.id, row.baseline.expectedLatestRevisionId),
      ),
    )
    .get()
  if (!baseline) return null
  return {
    id: row.id,
    placeId: input.placeId,
    stale: !equalPlaceValue(current, row.baseline),
    previousSsId: row.baseline.expectedSsId,
    previousState: row.baseline.expectedState,
    before: PlaceFactsSchema.parse(baseline.facts),
    candidate: {
      ssId: row.projection.ssId,
      releaseId: row.projection.releaseId,
      snapshotId: row.projection.snapshotId,
      facts: PlaceFactsSchema.parse(row.projection.facts),
      issueKinds: row.projection.issues.map(issue => issue.kind),
    },
    createdAt: row.createdAt,
  }
}

// ---
/********************
 *  3. REVIEW ACCEPTANCE
 ************/
// +++ Review Acceptance
/**
 * Accept only the source evidence and target tokens retained in a server-created review.
 * @param db Request-local database.
 * @param input Reauthorized target scope, review ID, authenticated actor and recorded reason.
 * @returns Transition result or conflict; occupied source identities still require merge review.
 * @remarks Client-supplied source facts, state tokens or project scope are never accepted.
 */
export async function acceptPlaceIdentityReview(
  db: Database,
  input: {
    placeId: string
    ownerProjectId: string | null
    reviewId: string
    actorId: string
    reason: string
  },
): Promise<Awaited<ReturnType<typeof acceptPlaceIdentity>>> {
  const row = await db
    .select()
    .from(placeIdentityReview)
    .where(
      and(
        eq(placeIdentityReview.id, input.reviewId),
        eq(placeIdentityReview.placeId, input.placeId),
        sql`${placeIdentityReview.ownerProjectId} IS ${input.ownerProjectId}`,
      ),
    )
    .get()
  if (!row) return { status: 'conflict' }
  const current = await readPlaceIdentityBaseline(
    db,
    input.placeId,
    input.ownerProjectId,
  )
  if (!equalPlaceValue(current, row.baseline)) return { status: 'conflict' }
  return acceptPlaceIdentity(
    db,
    { ...row.baseline, reviewId: row.id, actorId: input.actorId, reason: input.reason },
    row.projection,
  )
}
