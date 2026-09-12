// NODE
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { promisify } from 'node:util'
// VITEST
import { describe, expect, it } from 'vitest'
// MAP
import { createFeatureSpatialIndex } from '$lib/map/featureSpatial'
// BACKFILL
import {
  featureSpatialBackfillSelect,
  featureSpatialBackfillStatements,
} from '../../scripts/lib/feature-spatial-backfill'
import { parseFeatureSpatialBackfillOptions } from '../../scripts/backfill-feature-spatial-index'

const migration = readFileSync('migrations/0078_feature_spatial_index.sql', 'utf8')
const execFileAsync = promisify(execFile)
const schema =
  'PRAGMA foreign_keys = ON; CREATE TABLE feature (id text PRIMARY KEY, layerId text NOT NULL, geometry text NOT NULL, modifiedAt text);'
const original = JSON.stringify({ type: 'Point', coordinates: [114.17, 22.32] })
const moved = JSON.stringify({ type: 'Point', coordinates: [114.27, 22.42] })

/**
 * Runs fixture SQL in an isolated SQLite database.
 * @param statements Mutations and final inspection query.
 * @returns JSON records returned by the final query.
 */
async function query(statements: string): Promise<Array<Record<string, unknown>>> {
  const { stdout } = await execFileAsync('sqlite3', [
    ':memory:',
    '-batch',
    '-json',
    '-cmd',
    '.explain off',
    `${schema}\n${migration}\n${statements}`,
  ])
  return JSON.parse(stdout.trim() || '[]')
}

/**
 * Serializes a trusted fixture value as an SQL string.
 * @param value Fixture string.
 * @returns Escaped SQL literal.
 */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

/**
 * Inserts a fixture with optionally precomputed membership.
 * @param indexed Whether the same insert should include precomputed data.
 * @returns Fixture insert statement.
 */
function insert(indexed = true): string {
  const index = JSON.stringify(createFeatureSpatialIndex(JSON.parse(original)))
  return `INSERT INTO feature (id, layerId, geometry, modifiedAt, spatialIndex) VALUES ('feature-1', 'layer-1', ${literal(original)}, 'original-version', ${indexed ? literal(index) : 'NULL'});`
}

describe('feature spatial migration', () => {
  it('materializes all resolutions atomically and cascades layer moves and deletion', async () => {
    expect(
      await query(`${insert()} SELECT count(*) AS count FROM featureSpatial;`),
    ).toEqual([{ count: 13 }])
    expect(
      await query(
        `${insert()} UPDATE feature SET layerId = 'layer-2'; SELECT DISTINCT layerId FROM featureSpatial;`,
      ),
    ).toEqual([{ layerId: 'layer-2' }])
    expect(
      await query(
        `${insert()} DELETE FROM feature; SELECT count(*) AS count FROM featureSpatial;`,
      ),
    ).toEqual([{ count: 0 }])
  })

  it('updates cells only with the winning geometry write and rolls back membership with the transaction', async () => {
    const index = JSON.stringify(createFeatureSpatialIndex(JSON.parse(moved)))
    const mutation = `UPDATE feature SET geometry = ${literal(moved)}, spatialIndex = ${literal(index)} WHERE id = 'feature-1' AND modifiedAt = 'original-version';`
    expect(
      await query(
        `${insert()} ${mutation} SELECT DISTINCT longitude, latitude FROM featureSpatial;`,
      ),
    ).toEqual([{ longitude: 114.27, latitude: 22.42 }])
    expect(
      await query(
        `${insert()} BEGIN; ${mutation} ROLLBACK; SELECT DISTINCT longitude, latitude FROM featureSpatial;`,
      ),
    ).toEqual([{ longitude: 114.17, latitude: 22.32 }])
  })

  it('invalidates membership after raw geometry edits and leaves the feature repairable', async () => {
    expect(
      await query(
        `${insert()} UPDATE feature SET geometry = ${literal(moved)}; SELECT spatialIndex, (SELECT count(*) FROM featureSpatial) AS count FROM feature;`,
      ),
    ).toEqual([{ spatialIndex: null, count: 0 }])
  })

  it('uses the cell covering index for count lookups and a partial index for pending backfill', async () => {
    const plan = await query(
      `${insert()} EXPLAIN QUERY PLAN SELECT count(*) FROM featureSpatial WHERE resolution = 8 AND cell = '8841034c09fffff' AND layerId = 'layer-1';`,
    )
    expect(
      plan.some(row =>
        String(row.detail).includes('COVERING INDEX featureSpatial_cell_layer_idx'),
      ),
    ).toBe(true)
    const pendingPlan = await query(
      `EXPLAIN QUERY PLAN ${featureSpatialBackfillSelect('', 25)};`,
    )
    expect(
      pendingPlan.some(row =>
        String(row.detail).includes('feature_spatial_pending_idx'),
      ),
    ).toBe(true)
  })
})

describe('feature spatial backfill', () => {
  it('is idempotent, preserves modifiedAt, and does not overwrite a concurrent geometry edit', async () => {
    const updates = featureSpatialBackfillStatements([
      { id: 'feature-1', geometry: original },
    ])
      .map(statement => statement.replace(' RETURNING id;', ';'))
      .join('\n')
    expect(
      await query(
        `${insert(false)} ${updates} ${updates} SELECT modifiedAt, (SELECT count(*) FROM featureSpatial) AS count FROM feature;`,
      ),
    ).toEqual([{ modifiedAt: 'original-version', count: 13 }])
    expect(
      await query(
        `${insert(false)} UPDATE feature SET geometry = ${literal(moved)}; ${updates} SELECT spatialIndex FROM feature;`,
      ),
    ).toEqual([{ spatialIndex: null }])
  })

  it('preserves raw geometry encoding and safely quotes IDs', async () => {
    const geometry = '{ "type": "Point", "coordinates": [114.170, 22.320] }'
    const id = "feature'quoted"
    const statements = featureSpatialBackfillStatements([{ id, geometry }])
      .map(statement => statement.replace(' RETURNING id;', ';'))
      .join('\n')
    expect(
      await query(
        `INSERT INTO feature(id, layerId, geometry) VALUES (${literal(id)}, 'layer-1', ${literal(geometry)}); ${statements} SELECT count(*) AS count FROM featureSpatial;`,
      ),
    ).toEqual([{ count: 13 }])
  })

  it('enforces bounded work and explicit remote targets', () => {
    expect(parseFeatureSpatialBackfillOptions([])).toMatchObject({
      stage: 'local',
      remote: false,
      batchSize: 25,
      maxBatches: 20,
    })
    expect(() => parseFeatureSpatialBackfillOptions(['--remote'])).toThrow()
    expect(() =>
      parseFeatureSpatialBackfillOptions(['--stage', 'production']),
    ).toThrow()
    expect(() => parseFeatureSpatialBackfillOptions(['--batch-size', '1000'])).toThrow()
    expect(
      parseFeatureSpatialBackfillOptions([
        '--remote',
        '--stage',
        'preview',
        '--after-id',
        "feature'quoted",
        '--dry-run',
      ]),
    ).toMatchObject({
      stage: 'preview',
      remote: true,
      dryRun: true,
      afterId: "feature'quoted",
    })
  })
})
