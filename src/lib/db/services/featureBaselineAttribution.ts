// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'
import type { FeatureBaselineActor } from '#lib/revisions/changelog.js'

/** Reads frozen legacy authorship after the caller authorizes the owning publication.
 * @param db Request database.
 * @param publicationId Authorized initial publication receipt, never a client-selected task.
 * @returns Recorded reviewer/contributor with a current profile link, or null without evidence.
 * @remarks Enrollment remains attributed to the migration job; this is original contribution
 * provenance, not a claim that the user performed the migration or every historical edit.
 */
export async function readFeatureBaselineActor(
  db: Database,
  publicationId: string,
): Promise<FeatureBaselineActor | null> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE type='table' AND name='featureBaselineAttribution'`,
  )
  if (!storage?.n) return null
  return (
    (await db.get<FeatureBaselineActor>(sql`SELECT COALESCE(a.reviewerId,a.contributorId) AS actorId,
    COALESCE(u.name,u.displayUsername,u.username) AS actorName,
    NULLIF(u.username,'') AS actorUsername,NULLIF(u.displayUsername,'') AS actorDisplayUsername,
    CASE WHEN a.reviewerId IS NOT NULL THEN 'reviewer' ELSE 'contributor' END AS role
    FROM featureBaselineAttribution a LEFT JOIN user u ON u.id=COALESCE(a.reviewerId,a.contributorId)
    WHERE a.publicationId=${publicationId}`)) ?? null
  )
}
