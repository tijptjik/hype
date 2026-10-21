// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('shared Location kind migration', () => {
  it('classifies only sourced establishments and preserves identity, ownership and revisions', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(`CREATE TABLE place(id TEXT PRIMARY KEY, ssId TEXT, ownerOrganisationId TEXT, state TEXT);
        CREATE TABLE placeRevision(id TEXT PRIMARY KEY,placeId TEXT,facts TEXT,payload TEXT);
        INSERT INTO place VALUES ('a','canonical-id',NULL,'linked'),('b',NULL,'org','unresolved'),('c',NULL,'org','manual'),('donor',NULL,'org','unresolved'),('dropoff',NULL,'org','unresolved');
        INSERT INTO placeRevision VALUES ('revision','b','{"address":"Original display"}','{}');`)
      db.exec(`INSERT INTO placeRevision VALUES
        ('donor-r','donor','{}','{"kind":"breadline-place-import","sourceTable":"donors"}'),
        ('dropoff-r','dropoff','{}','{"kind":"breadline-place-import","sourceTable":"dropoffs"}');`)
      const before = db.prepare('SELECT * FROM placeRevision').all()
      db.exec(readFileSync('migrations/0137_location_kinds.sql', 'utf8'))
      expect(db.prepare('SELECT * FROM place ORDER BY id').all()).toEqual([
        {
          id: 'a',
          ssId: 'canonical-id',
          ownerOrganisationId: null,
          state: 'linked',
          kind: 'establishment',
        },
        {
          id: 'b',
          ssId: null,
          ownerOrganisationId: 'org',
          state: 'unresolved',
          kind: 'unknown',
        },
        {
          id: 'c',
          ssId: null,
          ownerOrganisationId: 'org',
          state: 'manual',
          kind: 'unknown',
        },
        {
          id: 'donor',
          ssId: null,
          ownerOrganisationId: 'org',
          state: 'unresolved',
          kind: 'establishment',
        },
        {
          id: 'dropoff',
          ssId: null,
          ownerOrganisationId: 'org',
          state: 'unresolved',
          kind: 'unknown',
        },
      ])
      expect(db.prepare('SELECT * FROM placeRevision').all()).toEqual(before)
      expect(() => db.exec("UPDATE place SET kind='invalid'")).toThrow()
    } finally {
      db.close()
    }
  })
})
