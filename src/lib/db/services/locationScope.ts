// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Resolve a Feature context's private Location owner from persisted Project ancestry.
 * @param projectId Authorized Project identity.
 * @returns Scalar SQL selecting its Organisation; missing ancestry never matches a private owner.
 */
export function locationOwnerForProject(projectId: string | null): SQL {
  return sql`(SELECT organisationId FROM project WHERE id=${projectId})`
}

/**
 * Read the Organisation that owns newly split Location baselines.
 * @param db Request-local database.
 * @param projectId Persisted Project identity.
 * @returns Owning Organisation ID; fails closed when the Project has no owner.
 */
export async function readProjectLocationOwner(
  db: Database,
  projectId: string,
): Promise<string> {
  const row = await db.get<{ organisationId: string | null }>(
    sql`SELECT organisationId FROM project WHERE id=${projectId}`,
  )
  if (!row?.organisationId)
    throw new Error('Location requires a Project with an Organisation')
  return row.organisationId
}
