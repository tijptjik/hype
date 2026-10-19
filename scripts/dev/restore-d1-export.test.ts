// BUN
import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
// NODE
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// RESTORE
import { restoreD1Export } from './restore-d1-export'

describe('explicit-table D1 restore', () => {
  it('restores secondary schema and rebuilds derived search without replaying import triggers', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hype-restore-'))
    try {
      const dump = join(directory, 'dump.sql'),
        schema = join(directory, 'schema.json'),
        output = join(directory, 'db.sqlite')
      const table =
        'CREATE TABLE featureSearchDocument(id INTEGER PRIMARY KEY, grams TEXT)'
      const fts =
        "CREATE VIRTUAL TABLE featureSearchFts USING fts5(grams,content='',contentless_delete=1,detail=none)"
      const view =
        'CREATE VIEW featureSearchContent AS SELECT id,grams FROM featureSearchDocument'
      const index = 'CREATE UNIQUE INDEX document_grams ON featureSearchDocument(grams)'
      const trigger =
        'CREATE TRIGGER document_insert AFTER INSERT ON featureSearchDocument BEGIN INSERT INTO featureSearchFts(rowid,grams) VALUES (NEW.id,NEW.grams); END'
      writeFileSync(
        dump,
        table + "; INSERT INTO featureSearchDocument VALUES (1,'bakery');",
      )
      writeFileSync(
        schema,
        JSON.stringify([
          {
            success: true,
            results: [
              { type: 'table', name: 'featureSearchDocument', sql: table },
              { type: 'table', name: 'featureSearchFts', sql: fts },
              { type: 'view', name: 'featureSearchContent', sql: view },
              { type: 'index', name: 'document_grams', sql: index },
              { type: 'trigger', name: 'document_insert', sql: trigger },
            ],
          },
        ]),
      )
      expect(restoreD1Export(dump, schema, output).searchDocuments).toBe(1)
      const db = new Database(output)
      try {
        expect(
          db
            .query(
              "SELECT rowid FROM featureSearchFts WHERE featureSearchFts MATCH 'bakery'",
            )
            .all(),
        ).toEqual([{ rowid: 1 }])
        db.exec("INSERT INTO featureSearchDocument VALUES (2,'shop')")
        expect(
          db
            .query(
              "SELECT rowid FROM featureSearchFts WHERE featureSearchFts MATCH 'shop'",
            )
            .all(),
        ).toEqual([{ rowid: 2 }])
        expect(() =>
          db.exec("INSERT INTO featureSearchDocument VALUES (3,'shop')"),
        ).toThrow()
      } finally {
        db.close()
      }
      expect(() => restoreD1Export(dump, schema, output)).toThrow('already exists')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
