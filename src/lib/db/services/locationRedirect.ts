// DRIZZLE
import { sql } from 'drizzle-orm'
// OWNERSHIP
import { locationOwnerForProject } from './locationScope'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Build the retained identity set for a surviving Location, including earlier merge aliases.
 * @param locationId Stable current HYPE identity.
 * @returns Trusted SQL subquery usable with IN; no dynamic identifier interpolation.
 * @remarks UNION deduplicates corrupt cycles as well as valid multistep redirect chains.
 */
export function locationAliasIds(locationId: string): SQL {
  return sql`(WITH RECURSIVE aliases(id) AS (
    SELECT ${locationId} UNION SELECT r.id FROM location r
      JOIN aliases a ON r.redirectTargetId=a.id
  ) SELECT id FROM aliases)`
}

/**
 * Resolve an old HYPE identity without exposing a private survivor to another project.
 * @param db Request-local database.
 * @param locationId Current or retained old HYPE Location ID.
 * @param projectId Authorized reader project, or null for shared-only discovery.
 * @returns Accessible live identity or null; callers still authorize its individual records.
 */
export async function resolveLocationRedirect(
  db: Database,
  locationId: string,
  projectId: string | null,
): Promise<{ locationId: string; ssId: string | null } | null> {
  return (
    (await db.get<{
      locationId: string
      ssId: string | null
    }>(sql`WITH RECURSIVE chain(id) AS (
    SELECT ${locationId} UNION SELECT r.redirectTargetId FROM location r JOIN chain c ON r.id=c.id
  ) SELECT p.id AS locationId,p.ssId FROM chain c JOIN location p ON p.id=c.id
    WHERE p.state!='redirect' AND (p.state!='manual' OR p.ownerOrganisationId=${locationOwnerForProject(projectId)}) LIMIT 1`)) ??
    null
  )
}
