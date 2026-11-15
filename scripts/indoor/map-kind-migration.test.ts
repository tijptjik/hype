// TESTS
import { expect, test } from 'bun:test'
// NODE
import { readFileSync } from 'node:fs'
import { Database } from 'bun:sqlite'

test('complex map kind migration preserves existing maps and referencing history', () => {
  const db = new Database(':memory:')
  try {
    db.exec('PRAGMA foreign_keys=ON; CREATE TABLE location(id TEXT PRIMARY KEY);')
    db.exec(readFileSync('migrations/0255_premises_map_releases.sql', 'utf8'))
    db.exec(
      "INSERT INTO premisesMap(id,code,name,nameZh,kind,updatedBy,updatedAt) VALUES ('a','A','Building','','building','actor','now'); INSERT INTO premisesMapPublication VALUES ('a',1,'hash','actor','now'); INSERT INTO location VALUES ('loc'); INSERT INTO premisesMapUnit VALUES ('a','unit','loc');",
    )
    db.exec('BEGIN')
    db.exec(readFileSync('migrations/0259_premises_map_complex_kind.sql', 'utf8'))
    db.exec('COMMIT')
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.query('SELECT kind FROM premisesMap').get()).toEqual({ kind: 'building' })
    expect(db.query('SELECT hash FROM premisesMapPublication').get()).toEqual({
      hash: 'hash',
    })
    expect(db.query('SELECT locationId FROM premisesMapUnit').get()).toEqual({
      locationId: 'loc',
    })
    db.exec(
      "INSERT INTO premisesMap(id,code,name,nameZh,kind,updatedBy,updatedAt) VALUES ('b','B','Complex','','complex','actor','now')",
    )
    expect(() =>
      db.exec("UPDATE premisesMap SET kind='invalid' WHERE id='b'"),
    ).toThrow()
  } finally {
    db.close()
  }
})
