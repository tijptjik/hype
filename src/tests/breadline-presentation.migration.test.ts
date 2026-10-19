// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { expect, it } from 'vitest'

it('registers Breadline presentation without selecting it for unrelated projects or changing layer metadata', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE organisation(id TEXT PRIMARY KEY,code TEXT);
      CREATE TABLE cardStyle(code TEXT PRIMARY KEY);
      INSERT INTO cardStyle VALUES ('full'),('conditional');
      CREATE TABLE project(id TEXT PRIMARY KEY,code TEXT,organisationId TEXT,cardStyleCode TEXT);
      CREATE TABLE layer(id TEXT, metadata TEXT);
      INSERT INTO organisation VALUES ('food','hkfoodworks'),('other','other');
      INSERT INTO project VALUES ('bl','breadline','food','full'),('other','other','other','conditional'),('same-code','breadline','other','full');
      INSERT INTO layer VALUES ('layer','{"cardStyleCode":"full"}');`)
    db.exec(readFileSync('migrations/0102_marker_presentation.sql', 'utf8'))
    db.exec(readFileSync('migrations/0103_breadline_presentation.sql', 'utf8'))
    expect(
      db
        .prepare('SELECT cardStyleCode,markerStyleCode FROM project WHERE id=?')
        .get('bl'),
    ).toEqual({ cardStyleCode: 'breadline', markerStyleCode: 'breadline' })
    expect(
      db
        .prepare('SELECT cardStyleCode,markerStyleCode FROM project WHERE id=?')
        .get('other'),
    ).toEqual({ cardStyleCode: 'conditional', markerStyleCode: null })
    expect(
      db
        .prepare('SELECT cardStyleCode,markerStyleCode FROM project WHERE id=?')
        .get('same-code'),
    ).toEqual({ cardStyleCode: 'full', markerStyleCode: null })
    expect(db.prepare('SELECT metadata FROM layer').get()).toEqual({
      metadata: '{"cardStyleCode":"full"}',
    })
    expect(() => db.exec("UPDATE project SET markerStyleCode='unknown'")).toThrow()
  } finally {
    db.close()
  }
})
