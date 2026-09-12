// MAP
import { createFeatureSpatialIndex } from '../../src/lib/map/featureSpatial'
// TYPES
import type { FeatureSpatialBackfillRow } from '../../src/lib/types'

/**
 * Quotes a SQL text literal used by the Wrangler file/command interface.
 * @param value Stored value to encode.
 * @returns A single escaped SQL text literal, never shell code.
 */
function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Builds the bounded pending-index read for an explicit backfill cursor.
 * @param afterId Last fully processed feature ID; empty starts from the beginning.
 * @param batchSize Maximum source rows, bounded independently of total dataset size.
 * @returns SQL using the partial pending-index rather than revisiting completed rows.
 */
export function featureSpatialBackfillSelect(
  afterId: string,
  batchSize: number,
): string {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('Backfill batch size must be between 1 and 100')
  return `SELECT id, geometry FROM feature INDEXED BY feature_spatial_pending_idx WHERE spatialIndex IS NULL AND json_extract(geometry, '$.type') = 'Point' AND id > ${sqlText(afterId)} ORDER BY id LIMIT ${batchSize}`
}

/**
 * Builds conditional atomic geometry-index writes for a bounded source page.
 * @param rows Raw persisted geometry snapshots.
 * @returns One statement per valid point; invalid point geometries are left pending.
 * @remarks Geometry equality and the NULL predicate prevent a concurrent edit or
 * another backfill from being overwritten. Raw JSON text is retained as the stamp
 * so legacy whitespace and numeric encoding remain valid. Triggers write all H3
 * cells within the same statement, without changing the feature's modifiedAt.
 */
export function featureSpatialBackfillStatements(
  rows: FeatureSpatialBackfillRow[],
): string[] {
  return rows.flatMap(row => {
    const index = createFeatureSpatialIndex(JSON.parse(row.geometry))
    if (!index) return []
    index.geometry = row.geometry
    return [
      `UPDATE feature SET spatialIndex = ${sqlText(JSON.stringify(index))} WHERE id = ${sqlText(row.id)} AND geometry = ${sqlText(row.geometry)} AND spatialIndex IS NULL RETURNING id;`,
    ]
  })
}
