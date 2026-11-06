// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
// DRIZZLE
import { sql } from 'drizzle-orm'
// SERVICES
import {
  readUserResourceCheckpoint,
  saveUserResourceCheckpoint,
} from '#lib/db/services/userResourceCheckpoint.js'
// TYPES
import type { Database } from '#lib/types.js'
import type { UserResourceCheckpointTarget } from '#lib/db/services/userResourceCheckpoint.js'

let fixture: ReturnType<typeof publicationSqlite>
let db: Database
const target: UserResourceCheckpointTarget = {
  userId: 'u',
  resourceType: 'feature',
  resourceId: 'f',
  checkpointKind: 'review',
  guard: sql`EXISTS(SELECT 1 FROM feature WHERE id='f' AND organisationId='o')`,
}
const cutoff = '2026-11-06T05:30:00.000Z'
const legacyMigration = readFileSync(
  'migrations/0192_user_changelog_checks.sql',
  'utf8',
)
const migration = readFileSync('migrations/0193_user_resource_checkpoints.sql', 'utf8')
beforeEach(() => {
  fixture = publicationSqlite({})
  db = fixture.db as unknown as Database
  fixture.sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE user(id TEXT PRIMARY KEY); INSERT INTO user VALUES('u'),('other');
    CREATE TABLE feature(id TEXT PRIMARY KEY,organisationId TEXT); INSERT INTO feature VALUES('f','o');`)
  fixture.sqlite.exec(legacyMigration)
  fixture.sqlite.exec(migration)
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-06T06:00:00.000Z'))
})
afterEach(() => {
  fixture.sqlite.close()
  vi.useRealTimers()
})

it('has no invented progress, then persists a feature-owned cutoff without changelog dependencies', async () => {
  expect(await readUserResourceCheckpoint(db, target)).toBeNull()
  expect(
    await saveUserResourceCheckpoint(db, { ...target, checkedThrough: cutoff }),
  ).toBe(cutoff)
  expect(await readUserResourceCheckpoint(db, target)).toBe(cutoff)
})

it('isolates users, resource identities, resource types and checkpoint kinds', async () => {
  await saveUserResourceCheckpoint(db, { ...target, checkedThrough: cutoff })
  for (const variation of [
    { userId: 'other' },
    { resourceId: 'other' },
    { resourceType: 'layer' as const },
    { checkpointKind: 'changelog' },
  ]) {
    const other = { ...target, ...variation }
    expect(await readUserResourceCheckpoint(db, other)).toBeNull()
    expect(
      await saveUserResourceCheckpoint(db, {
        ...other,
        checkedThrough: '2026-11-06T05:45:00.000Z',
      }),
    ).toBe('2026-11-06T05:45:00.000Z')
    expect(await readUserResourceCheckpoint(db, target)).toBe(cutoff)
  }
})

it('prevents delayed writers from rewinding progress and caps future timestamps', async () => {
  await saveUserResourceCheckpoint(db, { ...target, checkedThrough: cutoff })
  expect(
    await saveUserResourceCheckpoint(db, {
      ...target,
      checkedThrough: '2026-11-06T05:00:00.000Z',
    }),
  ).toBe(cutoff)
  expect(
    await saveUserResourceCheckpoint(db, {
      ...target,
      checkedThrough: '2099-01-01T00:00:00.000Z',
    }),
  ).toBe('2026-11-06T06:00:00.000Z')
})

it('repeats the caller guard for reads, inserts and conflict updates', async () => {
  await saveUserResourceCheckpoint(db, { ...target, checkedThrough: cutoff })
  fixture.sqlite.exec("UPDATE feature SET organisationId='moved' WHERE id='f'")
  expect(await readUserResourceCheckpoint(db, target)).toBeNull()
  expect(
    await saveUserResourceCheckpoint(db, {
      ...target,
      checkedThrough: '2026-11-06T05:50:00.000Z',
    }),
  ).toBeNull()
  expect(
    await saveUserResourceCheckpoint(db, {
      ...target,
      checkpointKind: 'another',
      checkedThrough: cutoff,
    }),
  ).toBeNull()
  expect(
    fixture.sqlite.prepare('SELECT checkedThrough FROM userResourceCheckpoint').all(),
  ).toEqual([{ checkedThrough: cutoff }])
})

it('removes private progress with the user and rejects invalid timestamps and empty kinds', async () => {
  await expect(
    saveUserResourceCheckpoint(db, { ...target, checkedThrough: 'invalid' }),
  ).rejects.toThrow()
  await expect(
    saveUserResourceCheckpoint(db, {
      ...target,
      checkpointKind: ' ',
      checkedThrough: cutoff,
    }),
  ).rejects.toThrow()
  await saveUserResourceCheckpoint(db, { ...target, checkedThrough: cutoff })
  fixture.sqlite.exec("DELETE FROM user WHERE id='u'")
  expect(
    fixture.sqlite.prepare('SELECT count(*) AS n FROM userResourceCheckpoint').get(),
  ).toEqual({ n: 0 })
  expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

it('migrates every legacy row exactly into the changelog kind before removing legacy storage', () => {
  fixture.sqlite.exec('DROP TABLE userResourceCheckpoint')
  fixture.sqlite.exec(legacyMigration)
  fixture.sqlite.exec(`INSERT INTO userChangelogCheck VALUES
    ('u','organisation','o','2026-01-01T00:00:00.001Z'),
    ('u','project','p','2026-06-07T08:09:10.011Z'),
    ('u','layer','l','2026-11-06T05:30:00.000Z'),
    ('other','layer','l','2026-10-31T23:59:59.999Z');`)
  const expected = fixture.sqlite
    .prepare(
      "SELECT userId,resourceType,resourceId,'changelog' AS checkpointKind,checkedAt AS checkedThrough FROM userChangelogCheck ORDER BY userId,resourceType,resourceId",
    )
    .all()
  fixture.sqlite.exec(migration)
  expect(
    fixture.sqlite
      .prepare(
        'SELECT * FROM userResourceCheckpoint ORDER BY userId,resourceType,resourceId',
      )
      .all(),
  ).toEqual(expected)
  expect(
    fixture.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE name='userChangelogCheck'")
      .get(),
  ).toBeUndefined()
  expect(fixture.sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(fixture.sqlite.prepare('SELECT * FROM feature').all()).toEqual([
    { id: 'f', organisationId: 'o' },
  ])
})
