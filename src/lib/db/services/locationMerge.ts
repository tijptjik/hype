// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CONCURRENCY GUARDS
// - baselineGuard
// - featureTokenSQL
// - mergeGuard
// 2. MERGE REVIEW
// - probeLocationMergeSource
// - probeLocationMergeReview
// - readLocationMergeReview
// - captureLocationMergeReview
// 3. ATOMIC MERGE
// - applyLocationMergeReview
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// IDENTITY
import { nanoid } from 'nanoid'
// SCHEMA
import {
  location as locationTable,
  locationRevision,
  featureLocation,
  locationIdentityHistory,
  locationIdentityReview,
  organisationLocation,
  type LocationMergeReviewRecord,
} from '../schema/location'
// DOMAIN
import { equalLocationValue } from '#lib/locations/baseline.js'
// SERVICES
import { readLocationIdentityBaseline } from './locationIdentityReview'
import { prepareSaanSeoiRevision } from './locationSource'
import { locationAliasIds } from './locationRedirect'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { LocationIdentityBaseline } from '#lib/locations/identity.js'

type MergeReview = LocationMergeReviewRecord

// ---
/********************
 *  1. CONCURRENCY GUARDS
 ************/
// +++ Concurrency Guards
/**
 * Fence the exact Location identity, private ownership, source revision and review history.
 * @param value Server-captured baseline.
 * @returns Trusted SQL predicate; no client SQL or identifiers are interpolated.
 */
function baselineGuard(value: LocationIdentityBaseline): SQL {
  return sql`EXISTS(SELECT 1 FROM location WHERE id=${value.locationId} AND state=${value.expectedState}
    AND ssId IS ${value.expectedSsId} AND ownerOrganisationId IS ${value.expectedOwnerOrganisationId}
    AND sourceAvailability=${value.expectedSourceAvailability})
    AND (SELECT id FROM locationRevision WHERE locationId=${value.locationId} ORDER BY sequence DESC LIMIT 1)
      =${value.expectedLatestRevisionId}
    AND (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=${value.locationId}
      AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id))
      IS ${value.expectedHistoryId}`
}

/**
 * Capture an ordered association/ancestry token without loading private Feature contents.
 * @param locationId Source Location whose interpretations would move.
 * @returns Scalar JSON expression stable across query plans and request retries.
 */
function featureTokenSQL(locationId: string): SQL {
  return sql`(SELECT json_group_array(json_object('featureId',featureId,'revision',revision,'projectId',projectId))
    FROM (SELECT fp.featureId,fp.revision,f.projectId FROM featureLocation fp JOIN feature f ON f.id=fp.featureId
      WHERE fp.locationId=${locationId} ORDER BY fp.featureId))`
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
  return sql`NOT EXISTS (SELECT 1 FROM locationIdentityReview WHERE rejection IS NOT NULL AND id=${row.identityReviewId})
    AND ${baselineGuard(target)} AND ${baselineGuard(source)}
    AND ${featureTokenSQL(source.locationId)}=${row.sourceFeatureToken}
    AND NOT EXISTS(SELECT 1 FROM organisationLocation a JOIN organisationLocation b ON a.organisationId=b.organisationId
      WHERE a.locationId=${source.locationId} AND b.locationId=${target.locationId})
    AND (${source.expectedOwnerOrganisationId} IS NULL OR ${source.expectedOwnerOrganisationId} IS ${target.expectedOwnerOrganisationId})
    AND NOT EXISTS(SELECT 1 FROM featureLocation fp JOIN feature f ON f.id=fp.featureId
      WHERE fp.locationId=${source.locationId} AND (f.isDraft!=0 OR
        (${target.expectedOwnerOrganisationId} IS NOT NULL AND (SELECT organisationId FROM project WHERE id=f.projectId) IS NOT ${target.expectedOwnerOrganisationId})))
    AND NOT EXISTS(SELECT 1 FROM locationIdentityHistory WHERE
      (ssId=${source.expectedSsId} OR previousSsId=${source.expectedSsId})
      AND locationId NOT IN ${locationAliasIds(target.locationId)} AND locationId NOT IN ${locationAliasIds(source.locationId)})`
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
 * @returns Source Location ID or null; no candidate facts or Feature records are exposed.
 */
export async function probeLocationMergeSource(
  db: Database,
  input: {
    locationId: string
    identityReviewId: string
    ownerOrganisationId: string | null
  },
): Promise<{ sourceLocationId: string } | null> {
  return (
    (await db
      .select({ sourceLocationId: locationTable.id })
      .from(locationIdentityReview)
      .innerJoin(
        locationTable,
        sql`${locationTable.ssId}=json_extract(${locationIdentityReview.projection},'$.ssId')`,
      )
      .where(
        and(
          eq(locationIdentityReview.id, input.identityReviewId),
          eq(locationIdentityReview.locationId, input.locationId),
          sql`${locationIdentityReview.ownerOrganisationId} IS ${input.ownerOrganisationId}`,
        ),
      )
      .get()) ?? null
  )
}

/**
 * Resolve the recorded second Location before authorizing a saved merge impact or decision.
 * @param db Request-local database.
 * @param input Already-authorized target and merge comparison IDs.
 * @returns Minimal source identity; never the retained private baseline or association token.
 */
export async function probeLocationMergeReview(
  db: Database,
  input: { locationId: string; reviewId: string },
): Promise<{ sourceLocationId: string } | null> {
  const row = await readMergeEvidence(db, input)
  return row ? { sourceLocationId: row.sourceLocationId } : null
}

/**
 * Project merge impact only after both identities have been independently authorized.
 * @param db Request-local database.
 * @param input Current authorized owner scopes and saved merge comparison.
 * @returns A count, privacy boundary and stale/applied state, without other Feature contents.
 */
export async function readLocationMergeReview(
  db: Database,
  input: {
    locationId: string
    sourceLocationId: string
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
    row.sourceLocationId !== input.sourceLocationId ||
    row.targetBaseline.expectedOwnerOrganisationId !== input.ownerOrganisationId ||
    row.sourceBaseline.expectedOwnerOrganisationId !== input.sourceOwnerOrganisationId
  )
    return null
  const state = await db.get<{
    current: number
    applied: number
  }>(sql`SELECT CASE WHEN ${mergeGuard(row)} THEN 1 ELSE 0 END AS current,
    EXISTS(SELECT 1 FROM location WHERE json_extract(redirect,'$.reviewId')=${row.id}) AS applied`)
  return {
    reviewId: row.id,
    affectedFeatures: row.sourceFeatureCount,
    visibility: input.ownerOrganisationId === null ? 'shared' : 'private',
    stale: !state?.current,
    applied: Boolean(state?.applied),
  }
}

/**
 * Capture the impact of merging a mirrored source Location into an existing HYPE Location.
 * @param db Request-local database.
 * @param input Identity comparison and BOTH independently authorized persisted owner scopes.
 * @returns Review ID/count or an explicit conflict/privacy incompatibility.
 * @remarks Caller must authorize administration of both identities before invoking. This
 * does not grant access via a Feature link, publish private history, or change any identity.
 */
export async function captureLocationMergeReview(
  db: Database,
  input: {
    locationId: string
    identityReviewId: string
    ownerOrganisationId: string | null
    sourceLocationId: string
    sourceOwnerOrganisationId: string | null
    actorId: string
  },
): Promise<
  | { status: 'ready'; reviewId: string; affectedFeatures: number }
  | { status: 'conflict' | 'scope-conflict' }
> {
  if (!input.actorId.trim() || input.locationId === input.sourceLocationId)
    return { status: 'conflict' }
  const identity = await db
    .select()
    .from(locationIdentityReview)
    .where(
      and(
        eq(locationIdentityReview.id, input.identityReviewId),
        eq(locationIdentityReview.locationId, input.locationId),
        sql`${locationIdentityReview.ownerOrganisationId} IS ${input.ownerOrganisationId}`,
      ),
    )
    .get()
  if (!identity) return { status: 'conflict' }
  const target = await readLocationIdentityBaseline(
    db,
    input.locationId,
    input.ownerOrganisationId,
  )
  const source = await readLocationIdentityBaseline(
    db,
    input.sourceLocationId,
    input.sourceOwnerOrganisationId,
  )
  if (
    !target ||
    !source ||
    !equalLocationValue(target, identity.baseline) ||
    source.expectedState !== 'linked' ||
    source.expectedSsId !== identity.projection.ssId ||
    source.expectedSourceAvailability !== 'current'
  )
    return { status: 'conflict' }
  const candidates = await db
    .select({
      id: locationRevision.id,
      facts: locationRevision.facts,
      payload: locationRevision.payload,
      contentHash: locationRevision.contentHash,
    })
    .from(locationRevision)
    .where(
      and(
        eq(locationRevision.locationId, source.locationId),
        eq(locationRevision.origin, 'saanseoi'),
        eq(locationRevision.ssId, identity.projection.ssId),
      ),
    )
    .orderBy(locationRevision.sequence)
  // Compare immutable source evidence without mixing in Organisation-authored addresses.
  let candidate: (typeof candidates)[number] | undefined
  for (const revision of candidates) {
    const evidence = await prepareSaanSeoiRevision(
      source.locationId,
      identity.projection,
    )
    if (revision.contentHash === evidence.contentHash) {
      candidate = revision
      break
    }
  }
  if (!candidate) return { status: 'conflict' }
  const token = await db.get<{ value: string }>(
    sql`SELECT ${featureTokenSQL(source.locationId)} AS value`,
  )
  if (!token) throw new Error('Missing merge association token')
  const affected = JSON.parse(token.value) as Array<{ projectId: string }>
  const outsideOwner = await db.get<{
    found: number
  }>(sql`SELECT 1 AS found FROM featureLocation fp JOIN feature f ON f.id=fp.featureId
    JOIN project pr ON pr.id=f.projectId WHERE fp.locationId=${source.locationId}
    AND pr.organisationId IS NOT ${target.expectedOwnerOrganisationId} LIMIT 1`)
  if (
    (source.expectedOwnerOrganisationId !== null &&
      source.expectedOwnerOrganisationId !== target.expectedOwnerOrganisationId) ||
    (target.expectedOwnerOrganisationId !== null && Boolean(outsideOwner))
  )
    return { status: 'scope-conflict' }
  const overlapping = await db.get(
    sql`SELECT 1 FROM organisationLocation a JOIN organisationLocation b ON a.organisationId=b.organisationId WHERE a.locationId=${source.locationId} AND b.locationId=${target.locationId} LIMIT 1`,
  )
  if (overlapping) return { status: 'scope-conflict' }
  const id = nanoid(24)
  const review: MergeReview = {
    id,
    identityReviewId: identity.id,
    targetLocationId: target.locationId,
    sourceLocationId: source.locationId,
    targetBaseline: target,
    sourceBaseline: source,
    sourceFeatureToken: token.value,
    sourceFeatureCount: affected.length,
    sourceRevisionId: candidate.id,
    actorId: input.actorId,
    createdAt: new Date().toISOString(),
  }
  const rows = await db
    .update(locationIdentityReview)
    .set({
      mergeReviews: sql`json_insert(mergeReviews,'$[#]',json(${JSON.stringify(review)}))`,
    })
    .where(and(eq(locationIdentityReview.id, identity.id), mergeGuard(review)))
    .returning({ id: locationIdentityReview.id })
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
 * @remarks Source revisions remain immutable in the old Location and are copied verbatim into
 * the survivor. Feature fields, timestamps, overrides and routing jobs do not change. Only
 * association identity/revision tokens move, with normal association history. No private data
 * is widened to a shared/different owner. A late error rolls back the entire merge.
 */
export async function applyLocationMergeReview(
  db: Database,
  input: {
    reviewId: string
    locationId: string
    sourceLocationId: string
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
    row.sourceLocationId !== input.sourceLocationId ||
    row.targetBaseline.expectedOwnerOrganisationId !== input.ownerOrganisationId ||
    row.sourceBaseline.expectedOwnerOrganisationId !== input.sourceOwnerOrganisationId
  )
    return { status: 'conflict' }
  const targetLatest = await db
    .select({ sequence: locationRevision.sequence })
    .from(locationRevision)
    .where(
      and(
        eq(locationRevision.id, row.targetBaseline.expectedLatestRevisionId),
        eq(locationRevision.locationId, input.locationId),
      ),
    )
    .get()
  const candidate = await db
    .select({ sequence: locationRevision.sequence })
    .from(locationRevision)
    .where(
      and(
        eq(locationRevision.id, row.sourceRevisionId),
        eq(locationRevision.locationId, input.sourceLocationId),
      ),
    )
    .get()
  if (!targetLatest || !candidate) return { status: 'conflict' }
  const id = nanoid(24),
    prefix = `mergeRevision_${id}_`,
    historyId = nanoid(24)
  const receipt = sql`EXISTS(SELECT 1 FROM location WHERE json_extract(redirect,'$.id')=${id})`
  // The absorbed Location's redirect is the unique receipt; subsequent writes require it.
  const result = await db.batch([
    db
      .update(locationTable)
      .set({
        redirectTargetId: input.locationId,
        redirect: {
          sourceLocationId: input.sourceLocationId,
          targetLocationId: input.locationId,
          id,
          sourceSsId: row.sourceBaseline.expectedSsId,
          reviewId: row.id,
          actorId: input.actorId,
          reason,
          createdAt: new Date().toISOString(),
        },
      })
      .where(and(eq(locationTable.id, input.sourceLocationId), mergeGuard(row))),
    db
      .insert(locationRevision)
      .select(sql`SELECT ${prefix}||sequence,${input.locationId},${targetLatest.sequence}+sequence,
      origin,ssId,apiVersion,releaseId,snapshotId,contentHash,payload,facts,createdAt FROM locationRevision
      WHERE locationId=${input.sourceLocationId} AND ${receipt} ORDER BY sequence`),
    // Retain the original correction histories on the redirect; copy their snapshots into the survivor.
    db
      .insert(organisationLocation)
      .select(sql`SELECT organisationId,${input.locationId},
      ${'merge:' + id + ':'}||organisationId,overrides,
      json_insert(history,'$[#]',json_object('revision',${'merge:' + id + ':'}||organisationId,'overrides',json(overrides),'actorId',${input.actorId},'createdAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'))),
      ${input.actorId},createdAt,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organisationLocation
      WHERE locationId=${input.sourceLocationId} AND ${receipt}`),
    db
      .update(featureLocation)
      .set({
        locationId: input.locationId,
        factsRevisionId: sql`${prefix}||(SELECT sequence FROM locationRevision WHERE id=${featureLocation.factsRevisionId})`,
        locationRevisionId: sql`${prefix}||(SELECT sequence FROM locationRevision WHERE id=${featureLocation.locationRevisionId})`,
        revision: sql`${`mergeAssociation_${id}_`}||${featureLocation.featureId}`,
        actorId: input.actorId,
      })
      .where(and(eq(featureLocation.locationId, input.sourceLocationId), receipt)),
    db
      .update(locationTable)
      .set({ ssId: null, state: 'redirect', sourceAvailability: 'review' })
      .where(and(eq(locationTable.id, input.sourceLocationId), receipt)),
    db
      .update(locationTable)
      .set({
        ssId: row.sourceBaseline.expectedSsId,
        state: 'linked',
        ownerOrganisationId: null,
        kind: 'establishment',
        sourceAvailability: 'current',
      })
      .where(and(eq(locationTable.id, input.locationId), receipt)),
    db
      .insert(locationIdentityHistory)
      .select(sql`SELECT ${historyId},${input.locationId},
      ${row.targetBaseline.expectedHistoryId},${row.targetBaseline.expectedState},${row.targetBaseline.expectedSsId},
      ${row.sourceBaseline.expectedSsId},${prefix + candidate.sequence},${input.actorId},${reason},
      ${row.identityReviewId},strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE ${receipt}`)
      .returning({ id: locationIdentityHistory.id }),
  ])
  return result[6].length
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
  input: { locationId: string; reviewId: string },
): Promise<MergeReview | null> {
  const row = await db.get<{
    value: string
  }>(sql`SELECT m.value FROM locationIdentityReview r,json_each(r.mergeReviews) m
    WHERE r.locationId=${input.locationId} AND json_extract(m.value,'$.id')=${input.reviewId} LIMIT 1`)
  return row ? (JSON.parse(row.value) as MergeReview) : null
}
