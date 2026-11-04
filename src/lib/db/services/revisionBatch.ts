// DRIZZLE
import { sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

/**
 * Executes prepared form statements only after the parent revision matches inside the transaction.
 * @param db Request database.
 * @param guard Parent identity and revision predicate.
 * @param statements Complete ordered form writes, including the parent revision update.
 * @returns Batch results without the guard probe, or null for a stale/missing parent.
 * @remarks D1 batches roll back on error. A deliberately invalid JSON path provides a
 * distinct SQLite error for stale revisions before any unguarded catalog writes execute.
 * Other database/validation failures are rethrown unchanged.
 */
export async function executeRevisionBatch(
  db: Database,
  guard: SQL,
  statements: BatchItem<'sqlite'>[],
): Promise<unknown[] | null> {
  const check = prepareRevisionCheck(db, guard)
  try {
    const results = await db.batch([check, ...statements])
    return results.slice(1)
  } catch (cause) {
    if (isStaleRevision(cause)) return null
    throw cause
  }
}

/**
 * Recognizes only the SQLite JSON-path error emitted by the internal revision check.
 * @param cause Possibly wrapped D1/Drizzle error.
 * @returns Whether the parent revision guard deliberately aborted the batch.
 */
function isStaleRevision(cause: unknown): boolean {
  const pending: unknown[] = [cause]
  const seen = new Set<object>()
  while (pending.length) {
    const value = pending.pop()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    const wrapped = value as {
      message?: unknown
      cause?: unknown
      error?: unknown
      errors?: unknown[]
    }
    if (
      typeof wrapped.message === 'string' &&
      /(?:bad JSON path:|JSON path error near)\s*['"]HYPE_STALE_REVISION['"]/i.test(
        wrapped.message,
      )
    )
      return true
    pending.push(wrapped.cause, wrapped.error)
    if (Array.isArray(wrapped.errors)) pending.push(...wrapped.errors)
  }
  return false
}

/**
 * Prepares an in-transaction identity/revision assertion for composed writes.
 * @param db Request database.
 * @param guard Predicate required before following statements may execute.
 * @returns Unexecuted assertion; a mismatch aborts the entire enclosing batch.
 */
export function prepareRevisionCheck(db: Database, guard: SQL): BatchItem<'sqlite'> {
  return db
    .select({
      valid: sql`json_extract('{}', case when ${guard} then '$' else 'HYPE_STALE_REVISION' end)`,
    })
    .from(sql`(select 1)`)
}
