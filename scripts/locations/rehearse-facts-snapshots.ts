// Refs #194. See spec/breadline/proposal/01-places-features.md.
// RUNTIME
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Database } from 'bun:sqlite'
// DOMAIN
import {
  readLocationFacts,
  LocationFactsSnapshotSchema,
} from '../../src/lib/locations/factsSnapshot'

/** Hash ordered rows without exporting private contents to the verification report.
 * @param rows Selected rows from one local table.
 * @returns Stable content digest independent of physical row order.
 */
function digest(rows: unknown[]): string {
  return createHash('sha256')
    .update(JSON.stringify(rows.map(row => JSON.stringify(row)).sort()))
    .digest('hex')
}

/** Normalize the existing effective display fields while retaining null versus absent assertions.
 * @param raw Persisted old or new revision facts.
 * @returns Comparable display fields; typed entity details are checked separately.
 */
function display(raw: unknown): unknown {
  const { entity: _entity, ...facts } = readLocationFacts(raw)
  return facts
}

/** Rehearse the typed-facts migration against an isolated consistent copy, never the primary input.
 * @returns Completion after all snapshots, unrelated tables, source evidence and integrity pass.
 * @remarks The output directory must be new and private. No remote binding or publication is used.
 */
async function main(): Promise<void> {
  const [input, output] = process.argv.slice(2)
  assert.ok(
    input && output,
    'Usage: rehearse-facts-snapshots.ts INPUT.sqlite NEW_OUTPUT_DIRECTORY',
  )
  const directory = resolve(output)
  assert.ok(
    directory.startsWith(resolve('.local/locations') + '/') && !existsSync(directory),
    'Use a new .local/locations output directory',
  )
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const target = resolve(directory, 'result.sqlite')
  // Take a consistent SQLite backup without opening the input for writes.
  const backup = spawnSync(
    'python3',
    [
      '-c',
      "import sqlite3,pathlib,sys; s=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True); t=sqlite3.connect(sys.argv[2]); s.backup(t); t.close(); s.close()",
      input,
      target,
    ],
    { encoding: 'utf8' },
  )
  assert.equal(backup.status, 0, backup.stderr)
  const db = new Database(target, { strict: true, create: false })
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;')
    // Capture immutable evidence and unrelated tables before applying the conversion.
    const tables = (
      db.query("SELECT name FROM sqlite_schema WHERE type='table'").all() as {
        name: string
      }[]
    ).map(row => row.name)
    const hashes = new Map(
      tables
        .filter(name => !['locationRevision', 'd1_migrations'].includes(name))
        .map(name => [
          name,
          digest(db.query(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()),
        ]),
    )
    const original = db.query('SELECT * FROM locationRevision ORDER BY id').all() as {
      id: string
      facts: string
      [key: string]: unknown
    }[]
    const originalById = new Map(original.map(row => [row.id, row]))
    const migration = '0142_location_facts_snapshots.sql',
      sql = readFileSync(resolve('migrations', migration), 'utf8')
    assert.equal(
      db.query('SELECT count(*) AS n FROM d1_migrations WHERE name=?').get(migration)
        ?.n,
      0,
      'Input already has this migration',
    )
    db.exec('BEGIN IMMEDIATE')
    try {
      // Convert and validate every revision before recording or committing the migration.
      db.exec(sql)
      const kinds: Record<string, number> = {}
      const rows = db
        .query('SELECT * FROM locationRevision ORDER BY id')
        .all() as typeof original
      assert.equal(rows.length, original.length)
      for (const row of rows) {
        const before = originalById.get(row.id)!
        const snapshot = LocationFactsSnapshotSchema.parse(JSON.parse(row.facts))
        kinds[snapshot.kind] = (kinds[snapshot.kind] ?? 0) + 1
        const { facts: _beforeFacts, ...beforeEvidence } = before,
          { facts: _afterFacts, ...afterEvidence } = row
        assert.deepEqual(
          afterEvidence,
          beforeEvidence,
          'Revision identity, source evidence or content hash changed',
        )
        assert.deepEqual(
          display(row.facts),
          display(before.facts),
          'Effective display/lifecycle values changed',
        )
      }
      // Prove that conversion changed only the versioned facts representation.
      for (const [table, hash] of hashes)
        assert.equal(
          digest(db.query(`SELECT * FROM "${table.replaceAll('"', '""')}"`).all()),
          hash,
          `Unrelated table changed: ${table}`,
        )
      assert.deepEqual(db.query('PRAGMA foreign_key_check').all(), [])
      assert.equal(Object.values(db.query('PRAGMA integrity_check').get()!)[0], 'ok')
      db.query('INSERT INTO d1_migrations(name) VALUES(?)').run(migration)
      db.exec('COMMIT')
      const receipt = {
        migration,
        sha256: createHash('sha256').update(sql).digest('hex'),
        revisions: rows.length,
        kinds,
        effectiveValuesUnchanged: true,
        sourceEvidenceAndHashesUnchanged: true,
        unrelatedTablesUnchanged: hashes.size,
        foreignKeyViolations: 0,
        integrity: 'ok',
        productionModified: false,
      }
      writeFileSync(
        resolve(directory, 'receipt.json'),
        JSON.stringify(receipt, null, 2) + '\n',
        { mode: 0o600 },
      )
      console.log(JSON.stringify(receipt))
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } finally {
    db.close()
  }
}
await main()
