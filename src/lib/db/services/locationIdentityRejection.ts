// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. REJECTION
// - rejectLocationIdentityReview
// 2. DISCOVERY SUPPRESSION
// - rejectedFeatureLocationSourceIds
// ---
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { locationIdentityReview } from '../schema/location'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Reject an unchanged retained identity comparison without modifying either establishment.
 * @param db Request-local database.
 * @param input Reauthorized owner scope, retained review, actor and mandatory reason.
 * @returns Rejected (including exact replay) or conflict; reasons are never overwritten.
 * @remarks The UPDATE fences ownership, identity, latest revision and identity history.
 * Database triggers serialize rejection against acceptance and merge application.
 */
export async function rejectLocationIdentityReview(
  db: Database,
  input: {
    locationId: string
    ownerOrganisationId: string | null
    reviewId: string
    actorId: string
    reason: string
  },
): Promise<{ status: 'rejected' | 'conflict' }> {
  const reason = input.reason.trim()
  if (!input.actorId.trim() || !reason || reason.length > 2000)
    throw new Error('Identity rejection requires an actor and reason')
  // Read only the caller's current Location scope; old ownership never authorizes a replay.
  const existing = await db
    .select({ rejection: locationIdentityReview.rejection })
    .from(locationIdentityReview)
    .where(
      and(
        eq(locationIdentityReview.id, input.reviewId),
        eq(locationIdentityReview.locationId, input.locationId),
        sql`EXISTS (SELECT 1 FROM location p WHERE p.id=${input.locationId} AND p.ownerOrganisationId IS ${input.ownerOrganisationId})`,
      ),
    )
    .get()
  if (existing?.rejection)
    return {
      status:
        existing.rejection.actorId === input.actorId &&
        existing.rejection.reason === reason
          ? 'rejected'
          : 'conflict',
    }
  const inserted = await db
    .update(locationIdentityReview)
    .set({
      rejection: sql`json_object('reviewId',id,'locationId',locationId,'ssId',json_extract(projection,'$.ssId'),
      'actorId',${input.actorId},'reason',${reason},'createdAt',strftime('%Y-%m-%dT%H:%M:%fZ','now'))`,
    })
    .where(sql`locationIdentityReview.id=${input.reviewId} AND rejection IS NULL AND EXISTS (SELECT 1
    FROM locationIdentityReview r JOIN location p ON p.id=r.locationId
    WHERE r.id=${input.reviewId} AND r.locationId=${input.locationId}
      AND r.ownerOrganisationId IS ${input.ownerOrganisationId} AND p.ownerOrganisationId IS ${input.ownerOrganisationId}
      AND p.state=json_extract(r.baseline,'$.expectedState')
      AND p.ssId IS json_extract(r.baseline,'$.expectedSsId')
      AND p.sourceAvailability=json_extract(r.baseline,'$.expectedSourceAvailability')
      AND (SELECT id FROM locationRevision WHERE locationId=p.id ORDER BY sequence DESC LIMIT 1) IS json_extract(r.baseline,'$.expectedLatestRevisionId')
      AND (SELECT h.id FROM locationIdentityHistory h WHERE h.locationId=p.id AND NOT EXISTS
        (SELECT 1 FROM locationIdentityHistory n WHERE n.previousHistoryId=h.id)) IS json_extract(r.baseline,'$.expectedHistoryId')
      AND NOT EXISTS (SELECT 1 FROM locationIdentityHistory WHERE reviewId=r.id)
      AND NOT EXISTS (SELECT 1 FROM location d,json_each(r.mergeReviews) m WHERE json_extract(d.redirect,'$.reviewId')=json_extract(m.value,'$.id'))
    )`)
    .returning({ id: locationIdentityReview.id })
  return { status: inserted.length ? 'rejected' : 'conflict' }
}

/**
 * Read rejected candidate IDs only for the Feature's currently accessible Location.
 * @param db Request-local database.
 * @param featureId Feature already authorized for all inherited fields.
 * @param projectId Persisted Project ancestry, never client-supplied scope.
 * @returns IDs to omit from ordinary discovery; explicit ID lookup may reconsider them.
 * @remarks No reviewer identity, reason or other Feature relationships are disclosed.
 */
export async function rejectedFeatureLocationSourceIds(
  db: Database,
  featureId: string,
  projectId: string,
): Promise<Set<string>> {
  const rows = await db.all<{
    ssId: string
  }>(sql`SELECT DISTINCT json_extract(r.projection,'$.ssId') AS ssId FROM locationIdentityReview r
    JOIN featureLocation fp ON fp.locationId=r.locationId JOIN location p ON p.id=fp.locationId
    JOIN feature f ON f.id=fp.featureId
    WHERE r.rejection IS NOT NULL AND f.id=${featureId} AND f.projectId=${projectId}
      AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=${locationOwnerForProject(projectId)}) AND p.ssId IS NOT json_extract(r.projection,'$.ssId')`)
  return new Set(rows.map(row => row.ssId))
}
