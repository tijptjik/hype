// TABLE OF CONTENTS
// 1. Queue progress
// 2. Saved Feature skips
// 3. Explicit unavailable disposition
// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'

/** Shared unpublished Locations are already reviewed identities, not failed source matches. */
const canonicalDraft = sql`(l.state='unresolved' AND l.ssId IS NULL AND l.ownerOrganisationId IS NULL)`

/** Unresolved Location predicate for the Location table joined with alias l. */
const unresolvedLocationReconciliation = sql`(l.id IS NULL OR ((l.state!='linked' OR l.ssId IS NULL) AND l.lastManualMatchAttemptAt IS NULL AND NOT ${canonicalDraft}))`
/** Pending queue predicate for Feature alias f and Location alias l. */
export const pendingLocationReconciliation = sql`(${unresolvedLocationReconciliation} AND f.reconciliationSkippedAt IS NULL)`

/** Count Feature outcomes without treating skips or unavailable Locations as matches.
 * @param db Request-local database. @param projectId Authorized persisted Project ID.
 * @returns Disjoint matched, draft, skipped, accepted-unavailable and remaining Feature counts.
 * @remarks A shared Location disposition affects every associated Feature; archived Features are excluded.
 */
export async function readLocationReconciliationProgress(
  db: Database,
  projectId: string,
): Promise<{
  total: number
  matched: number
  unavailable: number
  remaining: number
  drafts?: number
  skipped?: number
}> {
  const result = await db.get<{
    total: number
    matched: number
    unavailable: number
    remaining: number
    drafts: number
    skipped: number
  }>(sql`
    SELECT count(*) total,
      coalesce(sum(${canonicalDraft}),0) drafts,
      coalesce(sum(l.state='linked' AND l.ssId IS NOT NULL),0) matched,
      coalesce(sum((l.state!='linked' OR l.ssId IS NULL) AND NOT ${canonicalDraft} AND l.lastManualMatchAttemptAt IS NOT NULL),0) unavailable,
      coalesce(sum(${pendingLocationReconciliation}),0) remaining,
      coalesce(sum(${unresolvedLocationReconciliation} AND f.reconciliationSkippedAt IS NOT NULL),0) skipped
    FROM feature f LEFT JOIN featureLocation fl ON fl.featureId=f.id
      LEFT JOIN location l ON l.id=fl.locationId
    WHERE f.projectId=${projectId} AND f.isArchived=0
  `)
  if (!result) return { total: 0, matched: 0, unavailable: 0, remaining: 0 }
  const { drafts, skipped, ...progress } = result
  if (drafts) Object.assign(progress, { drafts })
  if (skipped) Object.assign(progress, { skipped })
  return progress
}

/** Save a Feature-specific skip without creating or changing a Location.
 * @param db Request-local database. @param input Authorized Feature before-image and actor.
 * @returns Saved review date, or null if the Feature or association changed.
 * @remarks The first timestamp and actor survive retries. Matched and otherwise reviewed records cannot be skipped.
 */
export async function skipFeatureReconciliation(
  db: Database,
  input: {
    projectId: string
    featureId: string
    modifiedAt: string
    associationVersion: string | null
    actorId: string
  },
): Promise<{ skippedAt: string } | null> {
  // Recheck scope, content and association in the same statement as the saved decision.
  return (
    (await db.get<{ skippedAt: string }>(sql`
    UPDATE feature SET
      reconciliationSkippedAt=coalesce(reconciliationSkippedAt,strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      reconciliationSkippedBy=coalesce(reconciliationSkippedBy,${input.actorId})
    WHERE id=${input.featureId} AND projectId=${input.projectId} AND isArchived=0
      AND modifiedAt=${input.modifiedAt}
      AND EXISTS (SELECT 1 FROM feature f LEFT JOIN featureLocation fl ON fl.featureId=f.id
        LEFT JOIN location l ON l.id=fl.locationId
        WHERE f.id=feature.id AND fl.version IS ${input.associationVersion} AND ${unresolvedLocationReconciliation})
    RETURNING reconciliationSkippedAt skippedAt
  `)) ?? null
  )
}

/** Return a skipped Feature to the matching queue.
 * @param db Request-local database. @param input Authorized project, Feature and displayed review date.
 * @returns Feature identity, or null if its scope or review changed.
 * @remarks A reset never modifies a shared Location or another Feature's review.
 */
export async function resetFeatureReconciliationSkip(
  db: Database,
  input: { projectId: string; featureId: string; skippedAt: string },
): Promise<{ id: string } | null> {
  // Compare the displayed decision so a stale reset cannot remove a newer skip.
  return (
    (await db.get<{ id: string }>(sql`
    UPDATE feature SET reconciliationSkippedAt=NULL,reconciliationSkippedBy=NULL
    WHERE id=${input.featureId} AND projectId=${input.projectId} AND isArchived=0
      AND reconciliationSkippedAt=${input.skippedAt}
    RETURNING id
  `)) ?? null
  )
}

/** List saved skips that still need a Location match.
 * @param db Request-local database. @param projectId Authorized project.
 * @returns Feature rows with their persisted review dates.
 * @remarks Later matches and other completed Location outcomes take precedence over skips.
 */
export async function listFeatureReconciliationSkips(
  db: Database,
  projectId: string,
): Promise<
  Array<{
    id: string
    name: string
    address: string | null
    locationId: string | null
    skippedAt: string
  }>
> {
  return db.all(sql`
    SELECT f.id,coalesce(i.title,f.id) name,i.displayAddress address,fl.locationId,f.reconciliationSkippedAt skippedAt
    FROM feature f LEFT JOIN featureLocation fl ON fl.featureId=f.id
      LEFT JOIN location l ON l.id=fl.locationId
      LEFT JOIN featureI18n i ON i.featureId=f.id AND i.locale='en'
    WHERE f.projectId=${projectId} AND f.isArchived=0
      AND f.reconciliationSkippedAt IS NOT NULL AND ${unresolvedLocationReconciliation}
    ORDER BY name,f.id
  `)
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
      AND state IN ('unresolved','manual') AND ssId IS NULL AND ownerOrganisationId IS NOT NULL
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
      AND state IN ('unresolved','manual') AND ssId IS NULL AND ownerOrganisationId IS NOT NULL
      AND EXISTS (SELECT 1 FROM feature f JOIN featureLocation fl ON fl.featureId=f.id
        WHERE f.id=${input.featureId} AND f.projectId=${input.projectId} AND f.isArchived=0 AND fl.locationId=location.id)
    RETURNING id
  `)) ?? null
  )
}
