// TESTS
import { afterEach, expect, test } from 'bun:test'
// NODE
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
// SQLITE
import { Database } from 'bun:sqlite'
import { openSqliteDomain } from '../../locations/lib/sqlite-domain'
// ROLLOUT
import {
  activate,
  applyGroups,
  digest,
  fingerprint,
  journal,
  markVerified,
  pause,
  rebaseUnstarted,
  schemaMigrationBoundary,
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
    await expect(activate(d.binding, plan)).rejects.toThrow()
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

test.each([false, true])(
  'full-schema rehearsal enrolls, verifies and activates without imports (lifecycle=%s)',
  async lifecycle => {
    const { bootstrapLocalDatabase, seedLocalApplication } =
      await import('../../breadline/lib/local-bootstrap')
    const { prepareRelease } = await import('./prepare')
    const root = mkdtempSync(join(tmpdir(), 'revision-complete-'))
    directories.push(root)
    const source = join(root, 'source.sqlite')
    const initial = new Database(source)
    bootstrapLocalDatabase(initial, resolve('.'))
    seedLocalApplication(initial)
    initial.exec(`DELETE FROM image;
 INSERT INTO user(id,name,createdAt,updatedAt) VALUES('author','Author',1,1);
 INSERT INTO layer(id,projectId,organisationId,isPublished) VALUES('layer1','breadlinePrj','hkfoodworks1',1);
 INSERT INTO feature(id,projectId,organisationId,layerId,contributorId,geometry,isPublished,isDraft,isPendingReview)
 VALUES('feature1','breadlinePrj','hkfoodworks1','layer1','author','{"type":"Point","coordinates":[114,22]}',1,0,0);`)
    initial.close()
    let plan = await prepareRelease(
      source,
      join(root, 'release'),
      'production:test',
      async (_db, media) => {
        mkdirSync(media)
        writeFileSync(join(media, 'receipt.json'), JSON.stringify({ evidence: [] }))
        return { verified: 0, blocked: 0 }
      },
      lifecycle ? { featureLifecycle: 'current' } : {},
    )
    const d = openSqliteDomain(source)
    try {
      await pause(d.binding, plan)
      await verifyRows(d.binding, plan.initial)
      const boundary = schemaMigrationBoundary(plan)
      if (boundary) {
        await applyGroups(d.binding, plan, boundary)
        const fresh = await prepareRelease(
          source,
          join(root, 'after-schema'),
          'production:test',
          async (_db, media) => {
            mkdirSync(media)
            writeFileSync(join(media, 'receipt.json'), JSON.stringify({ evidence: [] }))
            return { verified: 0, blocked: 0 }
          },
          lifecycle ? { featureLifecycle: 'current' } : {},
        )
        fresh.parentHash = digest(plan)
        fresh.parentCursor = boundary
        await rebaseUnstarted(d.binding, fresh)
        plan = fresh
      }
      await applyGroups(d.binding, plan)
      await markVerified(d.binding, plan)
      expect((await journal(d.binding))?.phase).toBe('verified')
      expect(() =>
        d.sqlite.exec("UPDATE user SET name='blocked' WHERE id='author'"),
      ).toThrow('MAINTENANCE')
      await activate(d.binding, plan)
      expect((await journal(d.binding))?.phase).toBe('active')
      expect(
        d.sqlite
          .query(
            lifecycle
              ? 'SELECT count(*) n FROM feature WHERE currentRevisionId IS NOT NULL'
              : 'SELECT count(*) n FROM featureRevisionHead',
          )
          .get(),
      ).toEqual({
        n: 1,
      })
      expect(
        d.sqlite.query('SELECT count(*) n FROM breadlineImportFeature').get(),
      ).toEqual({ n: 0 })
      expect(d.sqlite.query('PRAGMA foreign_key_check').all()).toEqual([])
      d.sqlite.exec("UPDATE user SET name='allowed' WHERE id='author'")
      if (!lifecycle)
        expect(
          d.sqlite.query('SELECT enabled FROM featureRevisionCreationPolicy').get(),
        ).toEqual({ enabled: 1 })
    } finally {
      d.close()
    }
  },
  60000,
)

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
