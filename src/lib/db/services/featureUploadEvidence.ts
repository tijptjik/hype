// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/**
 * Selects current task attachment evidence while preserving pre-migration upload behavior.
 * @param db Request database.
 * @returns Trusted SQL relation with the upload receipt columns, including forwarded proposals.
 * @remarks Callers still authorize the Feature and task; this relation alone grants no access.
 */
export async function featureUploadEvidenceSource(db: Database): Promise<SQL> {
  const migrated = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureTaskUploadEvidence' AND type='view'`,
  )
  return migrated?.n ? sql`featureTaskUploadEvidence` : sql`featureImageUploadRevision`
}

/** Checks whether task ownership moved through a reviewed identity operation.
 * @param db Request database. @param taskId Exact task identity.
 * @returns Whether immutable transfer evidence exists; older schemas return false.
 */
export async function hasFeatureTaskTransfer(
  db: Database,
  taskId: string,
): Promise<boolean> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureTaskTransfer' AND type='table'`,
  )
  return Boolean(
    storage?.n &&
      (await db.get(
        sql`SELECT 1 FROM featureTaskTransfer WHERE taskId=${taskId} LIMIT 1`,
      )),
  )
}
