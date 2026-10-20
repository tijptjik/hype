// DRIZZLE
import { sql } from 'drizzle-orm'
// OWNERSHIP
import { placeOwnerForProject } from './placeScope'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Build the retained identity set for a surviving Place, including earlier merge aliases.
 * @param placeId Stable current HYPE identity.
 * @returns Trusted SQL subquery usable with IN; no dynamic identifier interpolation.
 * @remarks UNION deduplicates corrupt cycles as well as valid multistep redirect chains.
 */
export function placeAliasIds(placeId: string): SQL {
  return sql`(WITH RECURSIVE aliases(id) AS (
    SELECT ${placeId} UNION SELECT r.id FROM place r
      JOIN aliases a ON r.redirectTargetId=a.id
  ) SELECT id FROM aliases)`
}

/**
 * Resolve an old HYPE identity without exposing a private survivor to another project.
 * @param db Request-local database.
 * @param placeId Current or retained old HYPE Place ID.
 * @param projectId Authorized reader project, or null for shared-only discovery.
 * @returns Accessible live identity or null; callers still authorize its individual records.
 */
export async function resolvePlaceRedirect(
  db: Database,
  placeId: string,
  projectId: string | null,
): Promise<{ placeId: string; ssId: string | null } | null> {
  return (
    (await db.get<{
      placeId: string
      ssId: string | null
    }>(sql`WITH RECURSIVE chain(id) AS (
    SELECT ${placeId} UNION SELECT r.redirectTargetId FROM place r JOIN chain c ON r.id=c.id
  ) SELECT p.id AS placeId,p.ssId FROM chain c JOIN place p ON p.id=c.id
    WHERE p.state!='redirect' AND (p.ownerOrganisationId IS NULL OR p.ownerOrganisationId=${placeOwnerForProject(projectId)}) LIMIT 1`)) ??
    null
  )
}
