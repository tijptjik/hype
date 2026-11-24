// TESTS
import { afterEach, expect, test } from 'bun:test'
// NODE
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// SQLITE
import { Database } from 'bun:sqlite'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
// ROLLOUT
import {
  applyGroups,
  digest,
  fingerprint,
  journal,
  pause,
  schemaFingerprint,
  verifyRows,
} from './contract'
import type { Plan } from './contract'

const directories: string[] = []
afterEach(() => {
  for (const d of directories.splice(0)) rmSync(d, { recursive: true, force: true })
})
/** Isolate maintenance behavior from the application schema. @returns Disposable binding and a pinned migration plan. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'revision-deployment-'))
  directories.push(root)
  const file = join(root, 'db.sqlite')
  new Database(file).close()
  const d = openSqliteDomain(file)
  d.sqlite.exec(
    "CREATE TABLE content(id TEXT PRIMARY KEY,value TEXT); INSERT INTO content VALUES('one','before')",
  )
  const shape = schemaFingerprint(
    d.sqlite
      .query('SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL')
      .all() as Record<string, unknown>[],
  )
  const plan: Plan = {
    version: 1,
    target: 'production:test',
    sourceHash: 'source',
    initialSchema: shape,
    expectedSchema: shape,
    initial: { content: fingerprint([{ id: 'one', value: 'before' }]) },
    expected: { content: fingerprint([{ id: 'one', value: 'after' }]) },
    groups: [
      {
        label: 'edit',
        statements: [
          { sql: 'UPDATE content SET value=? WHERE id=?', params: ['after', 'one'] },
        ],
      },
    ],
    tables: ['content'],
    migrations: [],
  }
  return { d, plan, root, file }
}
test('fences ordinary writers and resumes a committed batch after a lost response', async () => {
  const { d, plan } = fixture()
  try {
    await pause(d.binding, plan)
    expect(() => d.sqlite.exec("UPDATE content SET value='untracked'")).toThrow(
      'MAINTENANCE',
    )
    await verifyRows(d.binding, plan.initial)
    const original = d.binding.batch.bind(d.binding)
    let lost = true
    d.binding.batch = (async statements => {
      const result = await original(statements)
      if (lost) {
        lost = false
        throw Error('lost response')
      }
      return result
    }) as typeof d.binding.batch
    await expect(applyGroups(d.binding, plan)).rejects.toThrow('lost response')
    expect((await journal(d.binding))?.nextGroup).toBe(1)
    expect(await applyGroups(d.binding, plan)).toBe(1)
    expect(d.sqlite.query('SELECT value FROM content').get()).toEqual({
      value: 'after',
    })
    expect(() => d.sqlite.exec('DELETE FROM content')).toThrow('MAINTENANCE')
  } finally {
    d.close()
  }
})
test('rolls back late failure including write permission and cursor, rejecting another plan', async () => {
  const { d, plan } = fixture()
  plan.groups[0].statements.push({ sql: "SELECT json('late failure')", params: [] })
  try {
    await pause(d.binding, plan)
    await expect(applyGroups(d.binding, plan)).rejects.toThrow()
    expect(await journal(d.binding)).toMatchObject({
      nextGroup: 0,
      writable: 0,
      phase: 'paused',
    })
    expect(d.sqlite.query('SELECT value FROM content').get()).toEqual({
      value: 'before',
    })
    await expect(pause(d.binding, { ...plan, sourceHash: 'other' })).rejects.toThrow()
  } finally {
    d.close()
  }
})
test('rejects same-count row drift and catches clock drift in the initial snapshot', async () => {
  const { d, plan } = fixture()
  try {
    d.sqlite.exec("UPDATE content SET value='other'")
    await pause(d.binding, plan)
    await expect(verifyRows(d.binding, plan.initial)).rejects.toThrow(
      'Snapshot differs',
    )
    expect(fingerprint([{ id: 1, modifiedAt: 'a' }])).not.toEqual(
      fingerprint([{ id: 1, modifiedAt: 'b' }]),
    )
    expect(fingerprint([{ id: 1, modifiedAt: 'a' }], true)).toEqual(
      fingerprint([{ id: 1, modifiedAt: 'b' }], true),
    )
  } finally {
    d.close()
  }
})
test('reinstalls fences on a table rebuilt by a migration in the same atomic batch', async () => {
  const { d, plan } = fixture()
  plan.groups = [
    {
      label: 'rebuild',
      tables: ['content'],
      statements: [
        { sql: 'ALTER TABLE content RENAME TO old_content', params: [] },
        { sql: 'CREATE TABLE content(id TEXT PRIMARY KEY,value TEXT)', params: [] },
        { sql: 'INSERT INTO content SELECT * FROM old_content', params: [] },
        { sql: 'DROP TABLE old_content', params: [] },
      ],
    },
  ]
  try {
    await pause(d.binding, plan)
    await applyGroups(d.binding, plan)
    expect(() => d.sqlite.exec("INSERT INTO content VALUES('two','no')")).toThrow(
      'MAINTENANCE',
    )
  } finally {
    d.close()
  }
})

test('resumes after lifecycle tables replace the original schema and detects a lost fence', async () => {
  const { d, plan } = fixture()
  plan.groups.push({
    label: 'lifecycle-schema',
    tables: ['currentContent'],
    statements: [
      { sql: 'CREATE TABLE currentContent AS SELECT * FROM content', params: [] },
      { sql: 'DROP TABLE content', params: [] },
    ],
  })
  try {
    await pause(d.binding, plan)
    await applyGroups(d.binding, plan)
    await pause(d.binding, plan)
    expect(await journal(d.binding)).toMatchObject({ nextGroup: 2, schemaBoundary: 0 })
    expect(() => d.sqlite.exec('DELETE FROM currentContent')).toThrow('MAINTENANCE')
    d.sqlite.exec('DROP TRIGGER revision_deploy_currentContent_DELETE')
    await expect(pause(d.binding, plan)).rejects.toThrow()
  } finally {
    d.close()
  }
})

test('cancels only before mutation and retains the irreversible boundary through schema replanning', async () => {
  const { abortBeforeMigration, rebaseUnstarted } = await import('./contract')
  const { d, plan } = fixture()
  try {
    await pause(d.binding, plan)
    await abortBeforeMigration(d.binding, plan)
    expect((await journal(d.binding))?.phase).toBe('active')
    plan.groups[0].tables = ['content']
    await pause(d.binding, plan)
    await applyGroups(d.binding, plan, 1)
    const next = {
      ...plan,
      parentHash: digest(plan),
      parentCursor: 1,
      sourceHash: 'after-schema',
      groups: [],
    }
    await rebaseUnstarted(d.binding, next)
    await rebaseUnstarted(d.binding, next)
    expect(await journal(d.binding)).toMatchObject({
      nextGroup: 0,
      irreversible: 1,
      phase: 'paused',
    })
    await expect(abortBeforeMigration(d.binding, next)).rejects.toThrow()
  } finally {
    d.close()
  }
})
