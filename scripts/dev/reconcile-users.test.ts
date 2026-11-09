// TESTS
import { afterEach, expect, test } from 'bun:test'
// NODE
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// SQLITE
import { Database } from 'bun:sqlite'
// RECONCILIATION
import { reconcilePreparedUsers } from './reconcile-users'
import { emptyUserSyncLocalState } from '../breadline/lib/user-sync-contract'
// TYPES
import type { UserSyncLocalState } from '../breadline/lib/user-sync-contract'

const directories: string[] = []
afterEach(() =>
  directories.splice(0).forEach(path => {
    rmSync(path, { recursive: true, force: true })
  }),
)

/** Build real import-role schemas and a completed synthetic source mirror. */
function fixture(): { directory: string; databasePath: string; sourcePath: string } {
  const directory = mkdtempSync(join(tmpdir(), 'hype-refresh-users-'))
  directories.push(directory)
  const databasePath = join(directory, 'target.sqlite')
  const db = new Database(databasePath)
  db.exec(`
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isArchived INTEGER DEFAULT 0,isPublished INTEGER DEFAULT 1,isCoreInclusive INTEGER DEFAULT 0,isHubExclusive INTEGER DEFAULT 0,code TEXT);
    INSERT INTO organisation(id,hubId,code) VALUES('org','breadline','hkfoodworks');
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,username TEXT UNIQUE,displayUsername TEXT,telephone TEXT,locale TEXT,image TEXT,emailVerified INTEGER,isAnonymous INTEGER,isArchived INTEGER,createdAt INTEGER,updatedAt INTEGER);
    CREATE TABLE organisationRole(organisationId TEXT REFERENCES organisation(id),userId TEXT REFERENCES user(id),role TEXT NOT NULL DEFAULT 'member',PRIMARY KEY(organisationId,userId));
    CREATE TABLE account(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id),providerId TEXT,accountId TEXT,createdAt INTEGER,updatedAt INTEGER,UNIQUE(providerId,accountId));
  `)
  for (const migration of [
    '0089_breadline_phone_identity.sql',
    '0090_breadline_claim_audit.sql',
    '0091_breadline_email_identity.sql',
    '0168_organisation_users.sql',
  ])
    db.exec(readFileSync(`migrations/${migration}`, 'utf8'))
  db.close()
  const sourcePath = join(directory, 'source.sqlite')
  const source = new Database(sourcePath)
  source.exec(`
    CREATE TABLE _breadline_sync_run(status TEXT,startedAt TEXT,sourceSnapshotAt TEXT,completedAt TEXT,tableCount INTEGER);
    INSERT INTO _breadline_sync_run VALUES('complete','2026-11-05T00:00:00Z','2026-11-05T00:00:01Z','2026-11-06T00:00:03Z',2);
    CREATE TABLE _breadline_sync_state(sourceSchema TEXT,sourceTable TEXT,mirrorTable TEXT,strategy TEXT,localRows INTEGER,sourceRows INTEGER,syncedAt TEXT);
    CREATE TABLE breadline__public__users(id INTEGER,volunteer_id INTEGER,uid TEXT,email TEXT,name TEXT,telephone TEXT,locale TEXT,picture TEXT,created_at TEXT,last_updated_at TEXT);
    INSERT INTO breadline__public__users VALUES(1,10,'google-1','first@example.invalid','Original Person','+85291234560','en',NULL,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z');
    CREATE TABLE breadline__public__volunteers(id INTEGER,total INTEGER);
    INSERT INTO breadline__public__volunteers VALUES(10,3);
  `)
  for (const table of ['users', 'volunteers'])
    source
      .query(
        "INSERT INTO _breadline_sync_state VALUES('public',?,?,'full-snapshot',1,1,'2026-11-05T00:00:02Z')",
      )
      .run(table, `breadline__public__${table}`)
  source.close()
  return { directory, databasePath, sourcePath }
}

test('refresh reconciles existing users, adds new users and verifies zero-write replay', () => {
  const paths = fixture()
  const options = {
    ...paths,
    targetIdentity: 'local:test',
    seed: 'a'.repeat(64),
    decisions: { version: 1 as const, merges: [], excludeEmails: [] },
    acceptedState: emptyUserSyncLocalState(),
  }
  const first = reconcilePreparedUsers({
    ...options,
    directory: join(paths.directory, 'first'),
  })
  const state = JSON.parse(readFileSync(first.statePath, 'utf8')) as UserSyncLocalState
  const db = new Database(paths.databasePath)
  const owner = db
    .query<{ userId: string }, []>(
      'SELECT userId FROM breadlineImportIdentity WHERE sourceUserId=1',
    )
    .get()!.userId
  const accounts = db.query('SELECT * FROM account').all()
  db.close()
  const source = new Database(paths.sourcePath)
  source.exec(`UPDATE breadline__public__users SET name='Updated Person';
    INSERT INTO breadline__public__users VALUES(2,20,'google-2','second@example.invalid','New Person','+85291234561','en',NULL,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z');
    INSERT INTO breadline__public__volunteers VALUES(20,0);
    UPDATE _breadline_sync_state SET localRows=2,sourceRows=2,syncedAt='2026-11-06T00:00:02Z';
    UPDATE _breadline_sync_run SET sourceSnapshotAt='2026-11-06T00:00:01Z';`)
  source.close()
  const second = reconcilePreparedUsers({
    ...options,
    acceptedState: state,
    directory: join(paths.directory, 'second'),
  })
  expect(second.counts).toMatchObject({ source: 2, created: 1, updated: 1, removed: 0 })
  expect(second.replay).toEqual({
    mutations: 0,
    exceptions: 0,
    checkpointChanged: false,
  })
  const updated = new Database(paths.databasePath)
  expect(
    updated
      .query('SELECT userId FROM breadlineImportIdentity WHERE sourceUserId=1')
      .get(),
  ).toEqual({ userId: owner })
  expect(updated.query('SELECT name FROM user WHERE id=?').get(owner)).toEqual({
    name: 'Updated Person',
  })
  expect(updated.query('SELECT * FROM account WHERE userId=?').all(owner)).toEqual(
    accounts,
  )
  updated.close()
})

test('refresh stops on an identity conflict without applying target changes', () => {
  const paths = fixture()
  const options = {
    ...paths,
    targetIdentity: 'local:test',
    seed: 'a'.repeat(64),
    decisions: { version: 1 as const, merges: [], excludeEmails: [] },
    acceptedState: emptyUserSyncLocalState(),
  }
  const first = reconcilePreparedUsers({
    ...options,
    directory: join(paths.directory, 'first'),
  })
  const state = JSON.parse(readFileSync(first.statePath, 'utf8')) as UserSyncLocalState
  const before = readFileSync(paths.databasePath)
  const source = new Database(paths.sourcePath)
  source.exec('UPDATE breadline__public__users SET volunteer_id=11')
  source.close()
  expect(() =>
    reconcilePreparedUsers({
      ...options,
      acceptedState: state,
      directory: join(paths.directory, 'conflict'),
    }),
  ).toThrow('exception(s)')
  expect(readFileSync(paths.databasePath)).toEqual(before)
  const plan = JSON.parse(
    readFileSync(join(paths.directory, 'conflict/plan.json'), 'utf8'),
  )
  expect(plan.exceptions).toEqual([
    { sourceUserIds: [1], reason: 'source_volunteer_identity_changed' },
  ])
})
