// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. REJECTION
// - rejectPlaceIdentityReview
// 2. DISCOVERY SUPPRESSION
// - rejectedFeaturePlaceSourceIds
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { placeIdentityRejection } from '../schema/place'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Reject an unchanged retained identity comparison without modifying either establishment.
 * @param db Request-local database.
 * @param input Reauthorized owner scope, retained review, actor and mandatory reason.
 * @returns Rejected (including exact replay) or conflict; reasons are never overwritten.
 * @remarks The INSERT fences ownership, identity, latest revision and identity history.
 * Database triggers serialize rejection against acceptance and merge application.
 */
export async function rejectPlaceIdentityReview(
  db: Database,
  input: {
    placeId: string
    ownerProjectId: string | null
    reviewId: string
    actorId: string
    reason: string
  },
): Promise<{ status: 'rejected' | 'conflict' }> {
  const reason = input.reason.trim()
  if (!input.actorId.trim() || !reason || reason.length > 2000)
    throw new Error('Identity rejection requires an actor and reason')
  // Read only the caller's current Place scope; old ownership never authorizes a replay.
  const existing = await db
    .select()
    .from(placeIdentityRejection)
    .where(
      and(
        eq(placeIdentityRejection.reviewId, input.reviewId),
        eq(placeIdentityRejection.placeId, input.placeId),
        sql`EXISTS (SELECT 1 FROM place p WHERE p.id=${input.placeId} AND p.ownerProjectId IS ${input.ownerProjectId})`,
      ),
    )
    .get()
  if (existing)
    return {
      status:
        existing.actorId === input.actorId && existing.reason === reason
          ? 'rejected'
          : 'conflict',
    }
  const inserted = await db
    .insert(placeIdentityRejection)
    .select(sql`SELECT
    r.id,r.placeId,json_extract(r.projection,'$.ssId'),${input.actorId},${reason},strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM placeIdentityReview r JOIN place p ON p.id=r.placeId
    WHERE r.id=${input.reviewId} AND r.placeId=${input.placeId}
      AND r.ownerProjectId IS ${input.ownerProjectId} AND p.ownerProjectId IS ${input.ownerProjectId}
      AND p.state=json_extract(r.baseline,'$.expectedState')
      AND p.ssId IS json_extract(r.baseline,'$.expectedSsId')
      AND p.sourceAvailability=json_extract(r.baseline,'$.expectedSourceAvailability')
      AND (SELECT id FROM placeRevision WHERE placeId=p.id ORDER BY sequence DESC LIMIT 1) IS json_extract(r.baseline,'$.expectedLatestRevisionId')
      AND (SELECT h.id FROM placeIdentityHistory h WHERE h.placeId=p.id AND NOT EXISTS
        (SELECT 1 FROM placeIdentityHistory n WHERE n.previousHistoryId=h.id)) IS json_extract(r.baseline,'$.expectedHistoryId')
      AND NOT EXISTS (SELECT 1 FROM placeIdentityHistory WHERE reviewId=r.id)
      AND NOT EXISTS (SELECT 1 FROM placeRedirect d JOIN placeMergeReview m ON m.id=d.reviewId WHERE m.identityReviewId=r.id)
    `)
    .onConflictDoNothing()
    .returning({ id: placeIdentityRejection.reviewId })
  return { status: inserted.length ? 'rejected' : 'conflict' }
}

/**
 * Read rejected candidate IDs only for the Feature's currently accessible Place.
 * @param db Request-local database.
 * @param featureId Feature already authorized for all inherited fields.
 * @param projectId Persisted Project ancestry, never client-supplied scope.
 * @returns IDs to omit from ordinary discovery; explicit ID lookup may reconsider them.
 * @remarks No reviewer identity, reason or other Feature relationships are disclosed.
 */
export async function rejectedFeaturePlaceSourceIds(
  db: Database,
  featureId: string,
  projectId: string,
): Promise<Set<string>> {
  const rows = await db.all<{
    ssId: string
  }>(sql`SELECT DISTINCT r.ssId FROM placeIdentityRejection r
    JOIN featurePlace fp ON fp.placeId=r.placeId JOIN place p ON p.id=fp.placeId
    JOIN feature f ON f.id=fp.featureId
    WHERE f.id=${featureId} AND f.projectId=${projectId}
      AND (p.ownerProjectId IS NULL OR p.ownerProjectId=${projectId}) AND p.ssId IS NOT r.ssId`)
  return new Set(rows.map(row => row.ssId))
}
