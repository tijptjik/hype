// TABLE OF CONTENTS
// 1. Queue progress
// 2. Explicit unavailable disposition
// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'

/** Pending queue predicate for the Location table joined with alias l. */
export const pendingLocationReconciliation = sql`(l.id IS NULL OR ((l.state!='linked' OR l.ssId IS NULL) AND l.lastManualMatchAttemptAt IS NULL))`

/** Count Feature outcomes without treating skips or unavailable Locations as matches.
 * @param db Request-local database. @param projectId Authorized persisted Project ID.
 * @returns Disjoint matched, accepted-unavailable and remaining Feature counts.
 * @remarks A shared Location disposition affects every associated Feature; archived Features are excluded.
 */
export async function readLocationReconciliationProgress(
  db: Database,
  projectId: string,
): Promise<{ total: number; matched: number; unavailable: number; remaining: number }> {
  const result = await db.get<{
    total: number
    matched: number
    unavailable: number
    remaining: number
  }>(sql`
    SELECT count(*) total,
      coalesce(sum(l.state='linked' AND l.ssId IS NOT NULL),0) matched,
      coalesce(sum((l.state!='linked' OR l.ssId IS NULL) AND l.lastManualMatchAttemptAt IS NOT NULL),0) unavailable,
      coalesce(sum(${pendingLocationReconciliation}),0) remaining
    FROM feature f LEFT JOIN featureLocation fl ON fl.featureId=f.id
      LEFT JOIN location l ON l.id=fl.locationId
    WHERE f.projectId=${projectId} AND f.isArchived=0
  `)
  return result ?? { total: 0, matched: 0, unavailable: 0, remaining: 0 }
}

/** Persist an explicit no-upstream outcome using the database clock.
 * @param db Request-local database. @param input Authorized identity and association before-image.
 * @returns The durable timestamp, or null when ownership, association or matching state changed.
 * @remarks Does not create a source identity or rewrite Feature facts. Retries retain the first accepted timestamp.
 */
export async function markLocationUnavailable(
  db: Database,
  input: {
    projectId: string
    featureId: string
    locationId: string
    ownerOrganisationId: string | null
  },
): Promise<{ lastManualMatchAttemptAt: string } | null> {
  // Check the association and Location ownership again in the same atomic statement as the write.
  return (
    (await db.get<{ lastManualMatchAttemptAt: string }>(sql`
    UPDATE location
    SET lastManualMatchAttemptAt=coalesce(lastManualMatchAttemptAt,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE id=${input.locationId} AND ownerOrganisationId IS ${input.ownerOrganisationId}
      AND state IN ('unresolved','manual') AND ssId IS NULL
      AND EXISTS (SELECT 1 FROM feature f JOIN featureLocation fl ON fl.featureId=f.id
        WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isArchived=0 AND fl.locationId=location.id)
    RETURNING lastManualMatchAttemptAt
  `)) ?? null
  )
}

/** Clear a previously accepted no-upstream outcome.
 * @param db Request-local database. @param input Authorized identity and association before-image.
 * @returns The Location identity, or null when ownership, association or matching state changed.
 * @remarks Does not create a source identity or rewrite Feature facts. Repeated resets are idempotent.
 */
export async function resetLocationUnavailable(
  db: Database,
  input: {
    projectId: string
    featureId: string
    locationId: string
    ownerOrganisationId: string | null
  },
): Promise<{ id: string } | null> {
  // Check the association and Location ownership again in the same atomic statement as the write.
  return (
    (await db.get<{ id: string }>(sql`
    UPDATE location
    SET lastManualMatchAttemptAt=NULL
    WHERE id=${input.locationId} AND ownerOrganisationId IS ${input.ownerOrganisationId}
      AND state IN ('unresolved','manual') AND ssId IS NULL
      AND EXISTS (SELECT 1 FROM feature f JOIN featureLocation fl ON fl.featureId=f.id
        WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isArchived=0 AND fl.locationId=location.id)
    RETURNING id
  `)) ?? null
  )
}
