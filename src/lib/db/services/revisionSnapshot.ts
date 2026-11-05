// DRIZZLE
import { getTableColumns, sql } from 'drizzle-orm'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { SQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core'

/**
 * Converts a typed database column to its JSON representation inside a snapshot.
 * @param column Authored database column.
 * @returns JSON-safe SQL retaining nulls, booleans and structured values.
 */
function jsonColumn(column: SQLiteColumn): SQL {
  if (column.dataType === 'json') return sql`json(${column})`
  if (column.dataType === 'boolean')
    return sql`json(CASE WHEN ${column} IS NULL THEN 'null' WHEN ${column} THEN 'true' ELSE 'false' END)`
  return sql`${column}`
}

/**
 * Builds a deterministic row object from trusted schema metadata.
 * @param table Table whose owned fields are captured.
 * @param excluded Identity/concurrency fields that do not represent authored changes.
 * @returns SQL JSON object with stable key order.
 */
export function rowSnapshot(table: SQLiteTable, excluded: readonly string[]): SQL {
  const parts = Object.entries(getTableColumns(table))
    .filter(([key]) => !excluded.includes(key))
    .flatMap(([key, column]) => [
      sql.raw(`'${key.replaceAll("'", "''")}'`),
      jsonColumn(column),
    ])
  return sql`json_object(${sql.join(parts, sql`,`)})`
}
