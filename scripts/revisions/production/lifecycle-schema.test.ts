// TESTS
import { afterEach, expect, test } from 'bun:test'
// SQLITE
import { Database } from 'bun:sqlite'
// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// DEPLOYMENT
import { prepareLifecycleSchemaGroup, stageLifecyclePayloads } from './lifecycle-schema'
import {
  atomic,
  applyGroups,
  fingerprint,
  journal,
  pause,
  schemaMigrationBoundary,
} from './contract'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
import type { Plan } from './contract'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Create an incoming CASCADE dependency that must survive a parent rebuild.
 * @returns Source binding and exact target with additive lifecycle columns.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lifecycle-schema-'))
  roots.push(root)
  const d = openSqliteDomain(join(root, 'before.sqlite')),
    after = new Database(':memory:')
  for (const db of [d.sqlite, after])
    db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE feature(id TEXT PRIMARY KEY,title TEXT);
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT);
    CREATE TABLE featureRevision(id TEXT PRIMARY KEY,featureId TEXT REFERENCES feature(id));
    CREATE TABLE featureRevisionImage(id TEXT PRIMARY KEY,revisionId TEXT REFERENCES featureRevision(id) ON DELETE CASCADE);
    INSERT INTO feature VALUES('f','Original'); INSERT INTO revisionChangeSet VALUES('c','author');
    INSERT INTO featureRevision VALUES('r','f'); INSERT INTO featureRevisionImage VALUES('pin','r');`)
  after.exec(`ALTER TABLE feature ADD COLUMN currentRevisionId TEXT REFERENCES featureRevision(id);
    ALTER TABLE feature ADD COLUMN revisionVersion INTEGER NOT NULL DEFAULT 0 CHECK(revisionVersion>=0);
    ALTER TABLE revisionChangeSet ADD COLUMN legacyEvidence TEXT CHECK(legacyEvidence IS NULL OR json_valid(legacyEvidence));
    ALTER TABLE featureRevision ADD COLUMN sequence INTEGER;
    UPDATE feature SET currentRevisionId='r'; UPDATE featureRevision SET sequence=0;
    UPDATE revisionChangeSet SET legacyEvidence='{"retained":true}';`)
  return { d, after }
}

test('rebuilds incoming cascade dependents atomically without deleting their pins', async () => {
  const { d, after } = fixture()
  try {
    const group = prepareLifecycleSchemaGroup(d.sqlite, after)
    expect(group.fenceTables).toContain('featureRevisionImage')
    expect(group.statements.some(s => /foreign_keys\s*=\s*OFF/i.test(s.sql))).toBe(
      false,
    )
    await atomic(d.binding, group.statements)
    for (const table of group.tables!)
      expect(
        fingerprint(d.sqlite.query(`SELECT * FROM "${table}"`).all() as never[]),
      ).toEqual(fingerprint(after.query(`SELECT * FROM "${table}"`).all() as never[]))
    expect(d.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    d.close()
    after.close()
  }
})

test('rolls back late failure and preserves maintenance fences and the resume cursor', async () => {
  const { d, after } = fixture()
  try {
    const group = prepareLifecycleSchemaGroup(d.sqlite, after)
    group.statements.push({ sql: "SELECT json('late failure')", params: [] })
    const plan = {
      version: 1,
      target: 'test',
      groups: [group],
      initial: Object.fromEntries(group.tables!.map(name => [name, {}])),
      sourceHash: 'test',
    } as unknown as Plan
    await pause(d.binding, plan)
    await expect(applyGroups(d.binding, plan)).rejects.toThrow()
    expect(await journal(d.binding)).toMatchObject({
      nextGroup: 0,
      writable: 0,
      phase: 'paused',
    })
    expect(d.sqlite.query('SELECT * FROM featureRevisionImage').all()).toEqual([
      { id: 'pin', revisionId: 'r' },
    ])
    expect(() => d.sqlite.exec("UPDATE feature SET title='unfenced'")).toThrow(
      'MAINTENANCE',
    )
    expect(
      d.sqlite
        .query('PRAGMA table_info(feature)')
        .all()
        .some((r: any) => r.name === 'currentRevisionId'),
    ).toBe(false)
  } finally {
    d.close()
    after.close()
  }
})

test('keeps post-enrollment schema replacement out of the initial migration boundary', () => {
  expect(
    schemaMigrationBoundary({
      groups: [
        { label: 'numbered', tables: ['feature'], statements: [] },
        { label: 'enroll', statements: [] },
        { label: 'lifecycle', tables: ['feature'], statements: [] },
      ],
    }),
  ).toBe(1)
})

test('rejects oversized retained rows before creating a deployment group', () => {
  const { d, after } = fixture()
  try {
    after.exec('ALTER TABLE featureRevision ADD COLUMN evidence TEXT')
    after.query('UPDATE featureRevision SET evidence=?').run('x'.repeat(900_001))
    expect(() => prepareLifecycleSchemaGroup(d.sqlite, after)).toThrow(
      'Oversized lifecycle row',
    )
    expect(d.sqlite.query('SELECT * FROM featureRevisionImage').all()).toEqual([
      { id: 'pin', revisionId: 'r' },
    ])
  } finally {
    d.close()
    after.close()
  }
})

test('stages large revision payloads under a resumable fence and switches schema atomically', async () => {
  const { d, after } = fixture()
  try {
    after.exec('ALTER TABLE featureRevision ADD COLUMN evidence TEXT')
    for (let i = 0; i < 9; i++)
      after
        .query(
          'INSERT INTO featureRevision(id,featureId,sequence,evidence) VALUES(?,?,?,?)',
        )
        .run('r' + i, 'f', i + 1, 'x'.repeat(600_000))
    const replacement = prepareLifecycleSchemaGroup(d.sqlite, after)
    const tables = replacement.tables!
    const groups = stageLifecyclePayloads(replacement, tables)
    expect(groups.length).toBeGreaterThan(3)
    const plan = {
      version: 1,
      target: 'test',
      groups,
      initial: Object.fromEntries(tables.map(t => [t, {}])),
      sourceHash: 'stage-test',
    } as unknown as Plan
    await pause(d.binding, plan)
    await applyGroups(d.binding, plan, 2)
    expect(() => d.sqlite.exec('DELETE FROM revisionLifecyclePayload')).toThrow(
      'MAINTENANCE',
    )
    await pause(d.binding, plan)
    expect(d.sqlite.query('SELECT count(*) AS n FROM featureRevision').get()).toEqual({
      n: 1,
    })
    await applyGroups(d.binding, plan)
    expect(
      d.sqlite
        .query(
          'SELECT count(*) AS n FROM featureRevision WHERE length(evidence)=600000',
        )
        .get(),
    ).toEqual({ n: 9 })
    expect(
      d.sqlite
        .query("SELECT name FROM sqlite_schema WHERE name='revisionLifecyclePayload'")
        .get(),
    ).toBeNull()
    expect(d.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
  } finally {
    d.close()
    after.close()
  }
})
