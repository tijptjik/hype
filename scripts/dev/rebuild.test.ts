// TESTS
import { expect, test } from 'bun:test'
// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'
// REBUILD
import { prepareMockSpatial } from './rebuild'

test('mock map preparation leaves real Features untouched and replays without writes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hype-mock-map-'))
  const path = join(directory, 'test.sqlite')
  const db = new Database(path)
  try {
    db.exec('CREATE TABLE feature(id TEXT PRIMARY KEY, geometry TEXT, spatialIndex TEXT)')
    const geometry = JSON.stringify({ type: 'Point', coordinates: [114.16, 22.3] })
    for (const id of ['real-feature', 'lifecycle-demo-a-feature', 'task-demo-newFeature'])
      db.query('INSERT INTO feature(id,geometry) VALUES (?,?)').run(id, geometry)
    expect(prepareMockSpatial(path)).toBe(2)
    expect(prepareMockSpatial(path)).toBe(0)
    expect(db.query("SELECT spatialIndex FROM feature WHERE id='real-feature'").get()).toEqual({spatialIndex:null})
    const row = db.query<{spatialIndex:string}, []>("SELECT spatialIndex FROM feature WHERE id='lifecycle-demo-a-feature'").get()!
    expect(JSON.parse(row.spatialIndex).geometry).toBe(geometry)
  } finally { db.close(); rmSync(directory, {recursive:true}) }
})

test('development rebuild rejects production environment before accessing exports or the database', () => {
  const result = Bun.spawnSync(['bun', 'scripts/dev/rebuild.ts', '--apply'], {
    env: {...process.env, CLOUDFLARE_ENV:'production'}, stdout:'pipe',stderr:'pipe',
  })
  expect(result.exitCode).toBe(1)
  expect(result.stderr.toString()).toContain('normal local development only')
})
