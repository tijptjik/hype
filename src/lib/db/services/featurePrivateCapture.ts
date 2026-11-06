// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'

/** Resolves approved private projection evidence without choosing an arbitrary staff proposal.
 * @param db Request database. @param featureId Trusted SQL identity expression.
 * @param generation Exact publication generation. @returns SQL scalar, or NULL before migration.
 * @remarks The latest sequence belongs to an append-only approved-maintenance journal. Ordinary
 * staff drafts never enter it. Publishing advances generation and ends this private branch.
 */
export async function privateFeatureComparison(db: Database, featureId: SQL, generation: SQL): Promise<SQL> {
  const table = await db.get<{ n: number }>(sql`SELECT count(*) n FROM sqlite_master WHERE name='featurePrivateCapture' AND type='table'`)
  return table?.n ? sql`(SELECT revisionId FROM featurePrivateCapture WHERE featureId=${featureId}
    AND generation=${generation} ORDER BY sequence DESC LIMIT 1)` : sql`NULL`
}
