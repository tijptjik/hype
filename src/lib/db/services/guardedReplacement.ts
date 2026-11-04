// DRIZZLE
import { and, eq, getTableColumns, is, SQL, sql } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
// LIMITS
import { SQL_BATCH_SIZE } from '#lib/utils/batch-query.js'
// TYPES
import type { InferInsertModel } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database, DbTable, Id } from '#lib/types.js'

/**
 * Prepares a relation replacement whose deletion and inserts all require a live parent guard.
 * @param db Request database.
 * @param table Relation table, with normal Drizzle defaults and driver encoders.
 * @param rows Complete desired replacement rows.
 * @param parentColumn Relation's owning parent column.
 * @param parentId Authorised parent identity, overriding any submitted ownership.
 * @param guard Parent revision predicate, evaluated at execution time for every statement.
 * @returns Unexecuted delete and parameter-budgeted insert statements for one atomic batch.
 * @remarks The caller must append the parent token update last in the same batch. Empty rows
 * clear the relation only if the guard matches. Defaults are evaluated once per prepared row.
 */
export function prepareGuardedReplacement<T extends DbTable>(
  db: Database,
  table: T,
  rows: InferInsertModel<T>[],
  parentColumn: SQLiteColumn,
  parentId: Id,
  guard: SQL,
): [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]] {
  const columns = Object.entries(getTableColumns(table)).filter(
    ([, column]) => !column.generated || column.generated.type === 'byDefault',
  )
  if (!columns.some(([, column]) => column === parentColumn)) {
    throw new Error('Replacement parent column must belong to the table')
  }
  const dialect = new SQLiteSyncDialect()
  const guardParameters = dialect.sqlToQuery(guard).params.length
  if (guardParameters + 1 > SQL_BATCH_SIZE)
    throw new Error('Replacement guard exceeds D1 parameter budget')
  const deletion = db.delete(table).where(and(eq(parentColumn, parentId), guard))
  const inserts: BatchItem<'sqlite'>[] = []
  let batch: SQL[] = []
  let parameters = guardParameters

  // Insert from VALUES through a WHERE guard so stale submissions cannot recreate deleted relations.
  const flush = (): void => {
    if (!batch.length) return
    inserts.push(
      db
        .insert(table)
        .select(sql`SELECT * FROM (VALUES ${sql.join(batch, sql`, `)}) WHERE ${guard}`),
    )
    batch = []
    parameters = guardParameters
  }
  for (const row of rows) {
    const values = columns.map(([key, column]) => {
      let value: unknown =
        column === parentColumn ? parentId : (row as Record<string, unknown>)[key]
      if (value === undefined) {
        if (column.default !== null && column.default !== undefined)
          value = column.default
        else if (column.defaultFn) value = column.defaultFn()
        else if (!column.default && column.onUpdateFn) value = column.onUpdateFn()
        else value = null
      }
      return is(value, SQL)
        ? value
        : value === null
          ? sql`null`
          : sql`${sql.param(value, column)}`
    })
    const tuple = sql`(${sql.join(values, sql`, `)})`
    const count = dialect.sqlToQuery(tuple).params.length
    if (count + guardParameters > SQL_BATCH_SIZE)
      throw new Error('Replacement row exceeds D1 parameter budget')
    if (parameters + count > SQL_BATCH_SIZE) flush()
    batch.push(tuple)
    parameters += count
  }
  flush()
  return [deletion, ...inserts]
}
