// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CONCURRENCY GUARDS
// - baselineGuard
// - featureTokenSQL
// - mergeGuard
// 2. MERGE REVIEW
// - probePlaceMergeSource
// - probePlaceMergeReview
// - readPlaceMergeReview
// - capturePlaceMergeReview
// 3. ATOMIC MERGE
// - applyPlaceMergeReview
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import {
  place,
  placeRevision,
  featurePlace,
  placeIdentityHistory,
  placeIdentityReview,
  type PlaceMergeReviewRecord,
} from '../schema/place'
// DOMAIN
import { equalPlaceValue } from '#lib/places/baseline.js'
// SERVICES
import { readPlaceIdentityBaseline } from './placeIdentityReview'
import { prepareSaanSeoiRevision } from './placeSource'
import { retainAuthoredAddress } from '#lib/places/authoredAddress.js'
import { placeAliasIds } from './placeRedirect'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { PlaceIdentityBaseline } from '#lib/places/identity.js'

type MergeReview = PlaceMergeReviewRecord

// ---
/********************
 *  1. CONCURRENCY GUARDS
 ************/
// +++ Concurrency Guards
/**
 * Fence the exact Place identity, private ownership, source revision and review history.
 * @param value Server-captured baseline.
 * @returns Trusted SQL predicate; no client SQL or identifiers are interpolated.
 */
function baselineGuard(value: PlaceIdentityBaseline): SQL {
  return sql`EXISTS(SELECT 1 FROM place WHERE id=${value.placeId} AND state=${value.expectedState}
    AND ssId IS ${value.expectedSsId} AND ownerOrganisationId IS ${value.expectedOwnerOrganisationId}
    AND sourceAvailability=${value.expectedSourceAvailability})
    AND (SELECT id FROM placeRevision WHERE placeId=${value.placeId} ORDER BY sequence DESC LIMIT 1)
      =${value.expectedLatestRevisionId}
    AND (SELECT h.id FROM placeIdentityHistory h WHERE h.placeId=${value.placeId}
      AND NOT EXISTS(SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id))
      IS ${value.expectedHistoryId}`
}

/**
 * Capture an ordered association/ancestry token without loading private Feature contents.
 * @param placeId Source Place whose interpretations would move.
 * @returns Scalar JSON expression stable across query plans and request retries.
 */
function featureTokenSQL(placeId: string): SQL {
  return sql`(SELECT json_group_array(json_object('featureId',featureId,'revision',revision,'projectId',projectId))
    FROM (SELECT fp.featureId,fp.revision,f.projectId FROM featurePlace fp JOIN feature f ON f.id=fp.featureId
      WHERE fp.placeId=${placeId} ORDER BY fp.featureId))`
}

/**
 * Recheck both reviewed identities, all affected associations and compatible privacy boundaries.
 * @param row Immutable merge comparison.
 * @returns One predicate used before the transaction's permanent redirect receipt is created.
 */
function mergeGuard(
  row: Pick<
    MergeReview,
    'targetBaseline' | 'sourceBaseline' | 'sourceFeatureToken' | 'identityReviewId'
  >,
): SQL {
  const target = row.targetBaseline,
    source = row.sourceBaseline
  return sql`NOT EXISTS (SELECT 1 FROM placeIdentityReview WHERE rejection IS NOT NULL AND id=${row.identityReviewId})
    AND ${baselineGuard(target)} AND ${baselineGuard(source)}
    AND ${featureTokenSQL(source.placeId)}=${row.sourceFeatureToken}
    AND (${source.expectedOwnerOrganisationId} IS NULL OR ${source.expectedOwnerOrganisationId} IS ${target.expectedOwnerOrganisationId})
    AND NOT EXISTS(SELECT 1 FROM featurePlace fp JOIN feature f ON f.id=fp.featureId
      WHERE fp.placeId=${source.placeId} AND (f.isDraft!=0 OR
        (${target.expectedOwnerOrganisationId} IS NOT NULL AND (SELECT organisationId FROM project WHERE id=f.projectId) IS NOT ${target.expectedOwnerOrganisationId})))
    AND NOT EXISTS(SELECT 1 FROM placeIdentityHistory WHERE
      (ssId=${source.expectedSsId} OR previousSsId=${source.expectedSsId})
      AND placeId NOT IN ${placeAliasIds(target.placeId)} AND placeId NOT IN ${placeAliasIds(source.placeId)})`
}

// ---
/********************
 *  2. MERGE REVIEW
 ************/
// +++ Merge Review
/**
 * Resolve only the second identity needed for merge authorization from retained evidence.
 * @param db Request-local database.
 * @param input Already-authorized target scope and immutable identity comparison.
 * @returns Source Place ID or null; no candidate facts or Feature records are exposed.
 */
export async function probePlaceMergeSource(
  db: Database,
  input: {
    placeId: string
    identityReviewId: string
    ownerOrganisationId: string | null
  },
): Promise<{ sourcePlaceId: string } | null> {
  return (
    (await db
      .select({ sourcePlaceId: place.id })
      .from(placeIdentityReview)
      .innerJoin(
        place,
        sql`${place.ssId}=json_extract(${placeIdentityReview.projection},'$.ssId')`,
      )
      .where(
        and(
          eq(placeIdentityReview.id, input.identityReviewId),
          eq(placeIdentityReview.placeId, input.placeId),
          sql`${placeIdentityReview.ownerOrganisationId} IS ${input.ownerOrganisationId}`,
        ),
      )
      .get()) ?? null
  )
}

/**
 * Resolve the recorded second Place before authorizing a saved merge impact or decision.
 * @param db Request-local database.
 * @param input Already-authorized target and merge comparison IDs.
 * @returns Minimal source identity; never the retained private baseline or association token.
 */
export async function probePlaceMergeReview(
  db: Database,
  input: { placeId: string; reviewId: string },
): Promise<{ sourcePlaceId: string } | null> {
  const row = await readMergeEvidence(db, input)
  return row ? { sourcePlaceId: row.sourcePlaceId } : null
}

/**
 * Project merge impact only after both identities have been independently authorized.
 * @param db Request-local database.
 * @param input Current authorized owner scopes and saved merge comparison.
 * @returns A count, privacy boundary and stale/applied state, without other Feature contents.
 */
export async function readPlaceMergeReview(
  db: Database,
  input: {
    placeId: string
    sourcePlaceId: string
    reviewId: string
    ownerOrganisationId: string | null
    sourceOwnerOrganisationId: string | null
  },
): Promise<{
  reviewId: string
  affectedFeatures: number
  visibility: 'private' | 'shared'
  stale: boolean
  applied: boolean
} | null> {
  const row = await readMergeEvidence(db, input)
  if (
    !row ||
    row.sourcePlaceId !== input.sourcePlaceId ||
    row.targetBaseline.expectedOwnerOrganisationId !== input.ownerOrganisationId ||
    row.sourceBaseline.expectedOwnerOrganisationId !== input.sourceOwnerOrganisationId
  )
    return null
  const state = await db.get<{
    current: number
    applied: number
  }>(sql`SELECT CASE WHEN ${mergeGuard(row)} THEN 1 ELSE 0 END AS current,
    EXISTS(SELECT 1 FROM place WHERE json_extract(redirect,'$.reviewId')=${row.id}) AS applied`)
  return {
    reviewId: row.id,
    affectedFeatures: row.sourceFeatureCount,
    visibility: input.ownerOrganisationId === null ? 'shared' : 'private',
    stale: !state?.current,
    applied: Boolean(state?.applied),
  }
}

/**
 * Capture the impact of merging a mirrored source Place into an existing HYPE Place.
 * @param db Request-local database.
 * @param input Identity comparison and BOTH independently authorized persisted owner scopes.
 * @returns Review ID/count or an explicit conflict/privacy incompatibility.
 * @remarks Caller must authorize administration of both identities before invoking. This
 * does not grant access via a Feature link, publish private history, or change any identity.
 */
export async function capturePlaceMergeReview(
  db: Database,
  input: {
    placeId: string
    identityReviewId: string
    ownerOrganisationId: string | null
    sourcePlaceId: string
    sourceOwnerOrganisationId: string | null
    actorId: string
  },
): Promise<
  | { status: 'ready'; reviewId: string; affectedFeatures: number }
  | { status: 'conflict' | 'scope-conflict' }
> {
  if (!input.actorId.trim() || input.placeId === input.sourcePlaceId)
    return { status: 'conflict' }
  const identity = await db
    .select()
    .from(placeIdentityReview)
    .where(
      and(
        eq(placeIdentityReview.id, input.identityReviewId),
        eq(placeIdentityReview.placeId, input.placeId),
        sql`${placeIdentityReview.ownerOrganisationId} IS ${input.ownerOrganisationId}`,
      ),
    )
    .get()
  if (!identity) return { status: 'conflict' }
  const target = await readPlaceIdentityBaseline(
    db,
    input.placeId,
    input.ownerOrganisationId,
  )
  const source = await readPlaceIdentityBaseline(
    db,
    input.sourcePlaceId,
    input.sourceOwnerOrganisationId,
  )
  if (
    !target ||
    !source ||
    !equalPlaceValue(target, identity.baseline) ||
    source.expectedState !== 'linked' ||
    source.expectedSsId !== identity.projection.ssId ||
    source.expectedSourceAvailability !== 'current'
  )
    return { status: 'conflict' }
  const candidates = await db
    .select({
      id: placeRevision.id,
      facts: placeRevision.facts,
      payload: placeRevision.payload,
      contentHash: placeRevision.contentHash,
    })
    .from(placeRevision)
    .where(
      and(
        eq(placeRevision.placeId, source.placeId),
        eq(placeRevision.origin, 'saanseoi'),
        eq(placeRevision.ssId, identity.projection.ssId),
      ),
    )
    .orderBy(placeRevision.sequence)
  // Compare immutable source evidence while preserving each revision's authored address.
  let candidate: (typeof candidates)[number] | undefined
  for (const revision of candidates) {
    const evidence = await prepareSaanSeoiRevision(
      source.placeId,
      retainAuthoredAddress(identity.projection, revision),
    )
    if (revision.contentHash === evidence.contentHash) {
      candidate = revision
      break
    }
  }
  if (!candidate) return { status: 'conflict' }
  const token = await db.get<{ value: string }>(
    sql`SELECT ${featureTokenSQL(source.placeId)} AS value`,
  )
  if (!token) throw new Error('Missing merge association token')
  const affected = JSON.parse(token.value) as Array<{ projectId: string }>
  const outsideOwner = await db.get<{
    found: number
  }>(sql`SELECT 1 AS found FROM featurePlace fp JOIN feature f ON f.id=fp.featureId
    JOIN project pr ON pr.id=f.projectId WHERE fp.placeId=${source.placeId}
    AND pr.organisationId IS NOT ${target.expectedOwnerOrganisationId} LIMIT 1`)
  if (
    (source.expectedOwnerOrganisationId !== null &&
      source.expectedOwnerOrganisationId !== target.expectedOwnerOrganisationId) ||
    (target.expectedOwnerOrganisationId !== null && Boolean(outsideOwner))
  )
    return { status: 'scope-conflict' }
  const id = nanoid(24)
  const review: MergeReview = {
    id,
    identityReviewId: identity.id,
    targetPlaceId: target.placeId,
    sourcePlaceId: source.placeId,
    targetBaseline: target,
    sourceBaseline: source,
    sourceFeatureToken: token.value,
    sourceFeatureCount: affected.length,
    sourceRevisionId: candidate.id,
    actorId: input.actorId,
    createdAt: new Date().toISOString(),
  }
  const rows = await db
    .update(placeIdentityReview)
    .set({
      mergeReviews: sql`json_insert(mergeReviews,'$[#]',json(${JSON.stringify(review)}))`,
    })
    .where(and(eq(placeIdentityReview.id, identity.id), mergeGuard(review)))
    .returning({ id: placeIdentityReview.id })
  return rows.length
    ? { status: 'ready', reviewId: id, affectedFeatures: affected.length }
    : { status: 'conflict' }
}

// ---
/********************
 *  3. ATOMIC MERGE
 ************/
// +++ Atomic Merge
/**
 * Apply a reviewed merge, retaining the target HYPE ID and redirecting the absorbed identity.
 * @param db Request-local database with atomic D1 batch support.
 * @param input Review, independently reauthorized owner scopes, actor and explicit merge reason.
 * @returns Applied receipt and moved count, or conflict with no partial writes.
 * @remarks Source revisions remain immutable in the old Place and are copied verbatim into
 * the survivor. Feature fields, timestamps, overrides and routing jobs do not change. Only
 * association identity/revision tokens move, with normal association history. No private data
 * is widened to a shared/different owner. A late error rolls back the entire merge.
 */
export async function applyPlaceMergeReview(
  db: Database,
  input: {
    reviewId: string
    placeId: string
    sourcePlaceId: string
    ownerOrganisationId: string | null
    sourceOwnerOrganisationId: string | null
    actorId: string
    reason: string
  },
): Promise<
  | { status: 'applied'; redirectId: string; affectedFeatures: number }
  | { status: 'conflict' }
> {
  const reason = input.reason.trim()
  if (!input.actorId.trim() || !reason || reason.length > 2000)
    throw new Error('Merge requires an actor and a reason of 1–2000 characters')
  const row = await readMergeEvidence(db, input)
  if (
    !row ||
    row.sourcePlaceId !== input.sourcePlaceId ||
    row.targetBaseline.expectedOwnerOrganisationId !== input.ownerOrganisationId ||
    row.sourceBaseline.expectedOwnerOrganisationId !== input.sourceOwnerOrganisationId
  )
    return { status: 'conflict' }
  const targetLatest = await db
    .select({ sequence: placeRevision.sequence })
    .from(placeRevision)
    .where(
      and(
        eq(placeRevision.id, row.targetBaseline.expectedLatestRevisionId),
        eq(placeRevision.placeId, input.placeId),
      ),
    )
    .get()
  const candidate = await db
    .select({ sequence: placeRevision.sequence })
    .from(placeRevision)
    .where(
      and(
        eq(placeRevision.id, row.sourceRevisionId),
        eq(placeRevision.placeId, input.sourcePlaceId),
      ),
    )
    .get()
  if (!targetLatest || !candidate) return { status: 'conflict' }
  const id = nanoid(24),
    prefix = `mergeRevision_${id}_`,
    historyId = nanoid(24)
  const receipt = sql`EXISTS(SELECT 1 FROM place WHERE json_extract(redirect,'$.id')=${id})`
  // The absorbed Place's redirect is the unique receipt; subsequent writes require it.
  const result = await db.batch([
    db
      .update(place)
      .set({
        redirectTargetId: input.placeId,
        redirect: {
          sourcePlaceId: input.sourcePlaceId,
          targetPlaceId: input.placeId,
          id,
          sourceSsId: row.sourceBaseline.expectedSsId,
          reviewId: row.id,
          actorId: input.actorId,
          reason,
          createdAt: new Date().toISOString(),
        },
      })
      .where(and(eq(place.id, input.sourcePlaceId), mergeGuard(row))),
    db
      .insert(placeRevision)
      .select(sql`SELECT ${prefix}||sequence,${input.placeId},${targetLatest.sequence}+sequence,
      origin,ssId,apiVersion,releaseId,snapshotId,contentHash,payload,facts,createdAt FROM placeRevision
      WHERE placeId=${input.sourcePlaceId} AND ${receipt} ORDER BY sequence`),
    db
      .update(featurePlace)
      .set({
        placeId: input.placeId,
        factsRevisionId: sql`${prefix}||(SELECT sequence FROM placeRevision WHERE id=${featurePlace.factsRevisionId})`,
        locationRevisionId: sql`${prefix}||(SELECT sequence FROM placeRevision WHERE id=${featurePlace.locationRevisionId})`,
        revision: sql`${`mergeAssociation_${id}_`}||${featurePlace.featureId}`,
        actorId: input.actorId,
      })
      .where(and(eq(featurePlace.placeId, input.sourcePlaceId), receipt)),
    db
      .update(place)
      .set({ ssId: null, state: 'redirect', sourceAvailability: 'review' })
      .where(and(eq(place.id, input.sourcePlaceId), receipt)),
    db
      .update(place)
      .set({
        ssId: row.sourceBaseline.expectedSsId,
        state: 'linked',
        sourceAvailability: 'current',
      })
      .where(and(eq(place.id, input.placeId), receipt)),
    db
      .insert(placeIdentityHistory)
      .select(sql`SELECT ${historyId},${input.placeId},
      ${row.targetBaseline.expectedHistoryId},${row.targetBaseline.expectedState},${row.targetBaseline.expectedSsId},
      ${row.sourceBaseline.expectedSsId},${prefix + candidate.sequence},${input.actorId},${reason},
      ${row.identityReviewId},strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${receipt}`)
      .returning({ id: placeIdentityHistory.id }),
  ])
  return result[5].length
    ? { status: 'applied', redirectId: id, affectedFeatures: row.sourceFeatureCount }
    : { status: 'conflict' }
}

/**
 * Read one retained merge impact from its owning identity comparison.
 * @param db Request-local database.
 * @param input Authorized target and immutable impact ID.
 * @returns Saved impact, or null outside the requested target scope.
 */
async function readMergeEvidence(
  db: Database,
  input: { placeId: string; reviewId: string },
): Promise<MergeReview | null> {
  const row = await db.get<{
    value: string
  }>(sql`SELECT m.value FROM placeIdentityReview r,json_each(r.mergeReviews) m
    WHERE r.placeId=${input.placeId} AND json_extract(m.value,'$.id')=${input.reviewId} LIMIT 1`)
  return row ? (JSON.parse(row.value) as MergeReview) : null
}
