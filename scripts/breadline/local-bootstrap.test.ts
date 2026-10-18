// NODE
import { resolve, join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
// TESTS
import { describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
// PIPELINE
import { bootstrapLocalDatabase, seedLocalApplication } from './lib/local-bootstrap'

describe('clean local source and migration bootstrap', () => {
  it('replays all migrations with clean references and seeds no legacy credentials', () => {
    const directory = mkdtempSync(join(tmpdir(), 'breadline-bootstrap-'))
    const db = new Database(join(directory, 'fresh.sqlite'))
    try {
      const receipt = bootstrapLocalDatabase(db, resolve('.'))
      seedLocalApplication(db)
      expect(receipt.migrations.at(-1)?.name).toBe('0091_breadline_email_identity.sql')
      expect(db.query('SELECT count(*) AS n FROM d1_migrations').get()).toEqual({
        n: receipt.migrations.length,
      })
      expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 2 })
      expect(db.query('SELECT count(*) AS n FROM account').get()).toEqual({ n: 0 })
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
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
