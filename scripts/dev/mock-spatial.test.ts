// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// TESTS
import { expect, test } from 'bun:test'
// SQLITE
import { Database } from 'bun:sqlite'
// REBUILD
import { prepareMockSpatial } from './mock-spatial'

test('indexes task fixtures without changing real Features or existing map cells', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hype-task-map-'))
  const path = join(directory, 'test.sqlite')
  const db = new Database(path)
  try {
    db.exec(
      'CREATE TABLE feature(id TEXT PRIMARY KEY, geometry TEXT, spatialIndex TEXT)',
    )
    const geometry = JSON.stringify({ type: 'Point', coordinates: [114.16, 22.3] })
    for (const id of ['real-feature', 'task-demo-newPhoto', 'lifecycle-demo-a-feature'])
      db.query('INSERT INTO feature(id,geometry) VALUES (?,?)').run(id, geometry)
    db.query('INSERT INTO feature VALUES (?,?,?)').run(
      'task-demo-existing',
      geometry,
      'preserved',
    )
    expect(prepareMockSpatial(path)).toBe(2)
    expect(prepareMockSpatial(path)).toBe(0)
    expect(
      db.query("SELECT spatialIndex FROM feature WHERE id='real-feature'").get(),
    ).toEqual({ spatialIndex: null })
    expect(
      db.query("SELECT spatialIndex FROM feature WHERE id='task-demo-existing'").get(),
    ).toEqual({ spatialIndex: 'preserved' })
    const row = db
      .query<{ spatialIndex: string }, []>(
        "SELECT spatialIndex FROM feature WHERE id='task-demo-newPhoto'",
      )
      .get()
    expect(row).not.toBeNull()
    expect(JSON.parse(row?.spatialIndex ?? '{}').geometry).toBe(geometry)
  } finally {
    db.close()
    rmSync(directory, { recursive: true })
  }
})
