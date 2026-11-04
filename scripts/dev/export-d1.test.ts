// NODE
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// BUN
import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
// BACKUP
import { completeD1Export, planD1Export } from './export-d1'

/** Wrap schema rows in Wrangler's JSON response. @param rows SQLite schema rows. @returns Successful query response. */
function response(rows: Array<{ type: string; name: string; sql: string }>): unknown {
  return [{ success: true, results: rows }]
}

describe('FTS-compatible D1 backup', () => {
  it('exports only canonical tables and restores exact data, secondary schema and working search triggers', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hype-d1-export-'))
    const source = new Database(':memory:')
    try {
      const tableSql = `CREATE TABLE featureSearchDocument(id INTEGER PRIMARY KEY AUTOINCREMENT, grams TEXT NOT NULL);
CREATE TABLE audit(message TEXT);
CREATE TABLE featureSearchFtsArchive(value TEXT);`
      const canonical = `INSERT INTO featureSearchDocument VALUES (42, 'bakery');
INSERT INTO featureSearchFtsArchive VALUES ('literal; with ''quotes''
and a newline');
INSERT INTO sqlite_sequence VALUES ('featureSearchDocument', 100);`
      source.exec(tableSql)
      source.exec(`
CREATE VIRTUAL TABLE featureSearchFts USING fts5(grams, content='', contentless_delete=1, detail=none);
CREATE UNIQUE INDEX document_grams ON featureSearchDocument(grams);
CREATE VIEW featureSearchContent AS SELECT id, grams FROM featureSearchDocument;
CREATE TRIGGER document_insert AFTER INSERT ON featureSearchDocument BEGIN
  INSERT INTO featureSearchFts(rowid, grams) VALUES (NEW.id, NEW.grams);
  INSERT INTO audit VALUES ('inserted; document');
END;
CREATE TRIGGER document_delete AFTER DELETE ON featureSearchDocument BEGIN
  DELETE FROM featureSearchFts WHERE rowid=OLD.id;
END;`)
      const rows = source
        .query<{ type: string; name: string; sql: string }, []>(
          'SELECT type,name,sql FROM sqlite_schema WHERE sql IS NOT NULL ORDER BY type,name',
        )
        .all()
      const plan = planD1Export(
        response([
          ...rows,
          { type: 'table', name: '_cf_KV', sql: 'CREATE TABLE _cf_KV(key TEXT)' },
        ]),
      )
      expect(plan.tables).toEqual([
        'audit',
        'featureSearchDocument',
        'featureSearchFtsArchive',
        'sqlite_sequence',
      ])
      const canonicalPath = join(directory, 'canonical.sql')
      const output = join(directory, 'complete.sql')
      writeFileSync(canonicalPath, canonical)
      expect(completeD1Export(canonicalPath, plan, output)).toEqual({
        searchDocuments: 1,
        foreignKeyViolations: 0,
      })
      expect(readFileSync(output, 'utf8')).toContain(canonical)

      const restored = new Database(':memory:')
      try {
        restored.exec(readFileSync(output, 'utf8'))
        expect(
          restored
            .query(
              "SELECT rowid FROM featureSearchFts WHERE featureSearchFts MATCH 'bakery'",
            )
            .all(),
        ).toEqual([{ rowid: 42 }])
        expect(restored.query('SELECT * FROM audit').all()).toEqual([])
        expect(
          restored.query('SELECT value FROM featureSearchFtsArchive').get(),
        ).toEqual({ value: "literal; with 'quotes'\nand a newline" })
        restored.exec("INSERT INTO featureSearchDocument(grams) VALUES ('shop')")
        expect(
          restored
            .query(
              "SELECT rowid FROM featureSearchFts WHERE featureSearchFts MATCH 'shop'",
            )
            .all(),
        ).toEqual([{ rowid: 101 }])
        expect(restored.query('SELECT message FROM audit').all()).toEqual([
          { message: 'inserted; document' },
        ])
        expect(() =>
          restored.exec("INSERT INTO featureSearchDocument(grams) VALUES ('shop')"),
        ).toThrow()
        restored.exec('DELETE FROM featureSearchDocument WHERE id=42')
        expect(
          restored
            .query(
              "SELECT rowid FROM featureSearchFts WHERE featureSearchFts MATCH 'bakery'",
            )
            .all(),
        ).toEqual([])
      } finally {
        restored.close()
      }
      expect(() => completeD1Export(canonicalPath, plan, output)).toThrow()
    } finally {
      source.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('fails closed for unknown virtual tables and empty or invalid inventories', () => {
    expect(() =>
      planD1Export(
        response([
          {
            type: 'table',
            name: 'otherSearch',
            sql: 'CREATE VIRTUAL TABLE otherSearch USING fts5(body)',
          },
        ]),
      ),
    ).toThrow('Unknown virtual table')
    expect(() => planD1Export(response([]))).toThrow('No canonical tables')
    expect(() => planD1Export([{ success: false, results: [] }])).toThrow(
      'Invalid D1 schema response',
    )
    expect(() =>
      planD1Export([{ success: true, results: [{ name: 'broken' }] }]),
    ).toThrow('Invalid D1 schema object')
  })

  it('loads child-first data with foreign keys enabled and parent uniqueness in a separate index', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hype-d1-order-'))
    const restored = new Database(':memory:')
    try {
      const plan = planD1Export(
        response([
          {
            type: 'table',
            name: 'child',
            sql: 'CREATE TABLE child(parentId TEXT REFERENCES parent(id))',
          },
          { type: 'table', name: 'parent', sql: 'CREATE TABLE parent(id TEXT)' },
          {
            type: 'index',
            name: 'parent_id',
            sql: 'CREATE UNIQUE INDEX parent_id ON parent(id)',
          },
        ]),
      )
      const canonicalPath = join(directory, 'canonical.sql')
      const output = join(directory, 'complete.sql')
      writeFileSync(
        canonicalPath,
        "INSERT INTO child VALUES ('owner'); INSERT INTO parent VALUES ('owner');",
      )
      completeD1Export(canonicalPath, plan, output)
      restored.exec('PRAGMA foreign_keys=ON; BEGIN')
      restored.exec(readFileSync(output, 'utf8'))
      restored.exec('COMMIT')
      expect(restored.query('PRAGMA foreign_key_check').all()).toEqual([])
      expect(restored.query('SELECT parentId FROM child').get()).toEqual({
        parentId: 'owner',
      })
    } finally {
      restored.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('preserves and reports source foreign-key defects instead of silently changing data', () => {
    const directory = mkdtempSync(join(tmpdir(), 'hype-d1-fk-'))
    try {
      const parent = 'CREATE TABLE parent(id INTEGER PRIMARY KEY)'
      const child = 'CREATE TABLE child(parentId INTEGER REFERENCES parent(id))'
      const plan = planD1Export(
        response([
          { type: 'table', name: 'parent', sql: parent },
          { type: 'table', name: 'child', sql: child },
        ]),
      )
      const canonicalPath = join(directory, 'canonical.sql')
      writeFileSync(canonicalPath, 'INSERT INTO child VALUES (99);')
      expect(
        completeD1Export(canonicalPath, plan, join(directory, 'complete.sql')),
      ).toEqual({ searchDocuments: 0, foreignKeyViolations: 1 })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
