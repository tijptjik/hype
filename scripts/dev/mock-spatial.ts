// SQLITE
import { Database } from 'bun:sqlite'
// MAP
import { createFeatureSpatialIndex } from '../../src/lib/map/featureSpatial'

/**
 * Populate map cells for the explicitly synthetic Features after mock ingestion.
 * @param path Local database containing the development-only fixture namespace.
 * @returns Number of previously unindexed mock Features updated; replay returns zero.
 */
export function prepareMockSpatial(path: string): number {
  const db = new Database(path, { strict: true, create: false })
  try {
    return db.transaction(() => {
      const rows = db
        .query<{ id: string; geometry: string }, []>(
          "SELECT id,geometry FROM feature WHERE (id LIKE 'lifecycle-demo-%' OR id LIKE 'task-demo-%') AND spatialIndex IS NULL",
        )
        .all()
      for (const row of rows)
        db.query(
          'UPDATE feature SET spatialIndex=? WHERE id=? AND geometry=? AND spatialIndex IS NULL',
        ).run(
          JSON.stringify(createFeatureSpatialIndex(JSON.parse(row.geometry))),
          row.id,
          row.geometry,
        )
      return rows.length
    })()
  } finally {
    db.close()
  }
}
