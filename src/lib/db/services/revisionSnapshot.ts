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
 * @param includeAutomaticCache Include cache metadata only for private mutable-source reads.
 * @returns SQL JSON object with stable key order.
 */
export function rowSnapshot(
  table: SQLiteTable,
  excluded: readonly string[],
  includeAutomaticCache = false,
): SQL {
  const columns = getTableColumns(table)
  const parts = Object.entries(columns)
    .filter(
      ([key]) =>
        !excluded.includes(key) &&
        (includeAutomaticCache ||
          !['isAutomaticOnly', 'autoTranslated', 'translationProvenance'].includes(
            key,
          )),
    )
    .flatMap(([key, column]) => [
      sql.raw(`'${key.replaceAll("'", "''")}'`),
      jsonColumn(column),
    ])
  const content = sql`json_object(${sql.join(parts, sql`,`)})`
  if (includeAutomaticCache) return content
  // Cache writes are not authored revisions; omit absent provenance to retain legacy hashes.
  return columns.translationProvenance && !excluded.includes('translationProvenance')
    ? sql`json_patch(${content},CASE WHEN ${columns.translationProvenance} IS NULL THEN '{}' ELSE json_object('translationProvenance',json(${columns.translationProvenance})) END)`
    : content
}
