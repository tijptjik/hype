// NODE
import { resolve } from 'node:path'
import { readdirSync } from 'node:fs'
// TESTS
import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
// PIPELINE
import { bootstrapLocalDatabase, seedLocalApplication } from './lib/local-bootstrap'

describe('clean local source and migration bootstrap', () => {
  it('builds an empty local database and records only applied migrations in the ledger', () => {
    const db = new Database(':memory:')
    try {
      const receipt = bootstrapLocalDatabase(db, resolve('.'))
      seedLocalApplication(db)
      const migrationNames = readdirSync(resolve('migrations'))
        .filter(name => name.endsWith('.sql'))
        .sort()
      expect(receipt.deferred.map(migration => migration.name)).toContain(
        '0028_seed_breadline_layers.sql',
      )
      const appliedNames = migrationNames.filter(
        name => !receipt.deferred.some(m => m.name === name),
      )
      expect(receipt.migrations.map(migration => migration.name)).toEqual(appliedNames)
      expect(db.query('SELECT name FROM d1_migrations ORDER BY id').all()).toEqual(
        appliedNames.map(name => ({ name })),
      )
      expect(db.query('SELECT count(*) AS n FROM d1_migrations').get()).toEqual({
        n: receipt.migrations.length,
      })
      expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 2 })
      expect(db.query('SELECT count(*) AS n FROM account').get()).toEqual({ n: 0 })
      expect(
        db.query("SELECT component FROM property WHERE id='gPropPhNum01'").get(),
      ).toEqual({
        component: 'PhoneField',
      })
      expect(
        db
          .query(
            "SELECT count(*) AS n FROM mapStyles WHERE code IN ('breadline-light','breadline-dark','midnight')",
          )
          .get(),
      ).toEqual({ n: 3 })
      expect(
        db.query("SELECT code FROM project WHERE id='breadlinePrj'").get(),
      ).toEqual({ code: 'breadline' })
      expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(db.query('PRAGMA integrity_check').get()).toEqual({
        integrity_check: 'ok',
      })
      expect(() => bootstrapLocalDatabase(db, resolve('.'))).toThrow('empty disposable')
    } finally {
      db.close()
    }
  }, 30000)
})
