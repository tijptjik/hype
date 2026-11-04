// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// DB
import { task } from '#lib/db/schema/index.js'
import { prepareRevisionCheck } from './revisionBatch.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

/**
 * Prepares monotonic revision updates for pending tasks whose evidence will change.
 * @param db Request database.
 * @param affected Predicate selecting affected tasks before evidence writes.
 * @returns Adjacent revision update and completion assertion for the same batch.
 * @remarks Execute both statements before changing the evidence. The predicate must
 * not depend on task.modifiedAt. The adjacent changes() check rejects skipped updates.
 */
export function prepareTaskEvidenceRevision(
  db: Database,
  affected: SQL,
): [BatchItem<'sqlite'>, BatchItem<'sqlite'>] {
  const pending = and(eq(task.isReviewed, false), affected)!
  return [
    db
      .update(task)
      .set({
        modifiedAt: sql`CASE
      WHEN ${task.modifiedAt} >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        THEN strftime('%Y-%m-%dT%H:%M:%fZ', ${task.modifiedAt}, '+0.001 seconds')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END`,
      })
      .where(pending),
    // changes() belongs to the adjacent UPDATE; count against the still-unchanged evidence.
    prepareRevisionCheck(
      db,
      sql`changes() = (SELECT count(*) FROM ${task} WHERE ${pending})`,
    ),
  ]
}
