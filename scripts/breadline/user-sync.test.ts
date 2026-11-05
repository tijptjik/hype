// NODE
import { readFileSync } from 'node:fs'
// BUN
import { Database } from 'bun:sqlite'
import { afterEach, describe, expect, it } from 'bun:test'
// SYNC
import {
  acceptUserSyncPlan,
  emptyUserSyncLocalState,
  type UserSyncLocalState,
  applyUserSync,
  planUserSync,
  readUserSyncSource,
  readUserSyncTarget,
  userSyncHash,
  type UserSyncSource,
} from './lib/user-sync'
import type { LegacyUser } from './lib/users'
import {
  applyUserSyncRemote,
  userSyncRowStatements,
  type UserSyncJournal,
} from './lib/user-sync-remote'
import type { D1Database } from '@cloudflare/workers-types'

const databases: Database[] = []
const states = new WeakMap<Database, UserSyncLocalState>()
const state = (db: Database): UserSyncLocalState =>
  states.get(db) ?? emptyUserSyncLocalState()
const target = (db: Database): ReturnType<typeof readUserSyncTarget> =>
  readUserSyncTarget(db, state(db))
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
const options = {
  targetIdentity: 'local:synthetic',
  seed: 'synthetic-seed',
  organisationId: 'org',
  decisions: { version: 1 as const, merges: [], excludeEmails: [] },
  now: 100,
}

/** Build a disposable schema using the actual audience migration.
 * @returns Empty relational database with an existing organisation.
 */
function fixture(): Database {
  const db = new Database(':memory:')
  databases.push(db)
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,isArchived INTEGER DEFAULT 0,isPublished INTEGER DEFAULT 1,isCoreInclusive INTEGER DEFAULT 0,isHubExclusive INTEGER DEFAULT 0);
    INSERT INTO organisation(id,hubId) VALUES('org','breadline');
    CREATE TABLE user(id TEXT PRIMARY KEY,name TEXT,email TEXT UNIQUE,username TEXT UNIQUE,displayUsername TEXT,telephone TEXT,locale TEXT,image TEXT,emailVerified INTEGER,isAnonymous INTEGER,isArchived INTEGER,createdAt INTEGER,updatedAt INTEGER);
    CREATE TABLE organisationRole(organisationId TEXT REFERENCES organisation(id), userId TEXT REFERENCES user(id), role TEXT NOT NULL DEFAULT 'member', PRIMARY KEY(organisationId,userId));
    CREATE TABLE account(id TEXT PRIMARY KEY,userId TEXT REFERENCES user(id),providerId TEXT,accountId TEXT,createdAt INTEGER,updatedAt INTEGER,UNIQUE(providerId,accountId));`)
  for (const name of [
    '0089_breadline_phone_identity.sql',
    '0090_breadline_claim_audit.sql',
    '0091_breadline_email_identity.sql',
    '0168_organisation_users.sql',
  ])
    db.exec(readFileSync(`migrations/${name}`, 'utf8'))
  return db
}

/** Build a source snapshot with synthetic user and related-record values.
 * @param rows Source overrides.
 * @returns Complete source snapshot without real personal data.
 */
function source(...rows: Array<Partial<LegacyUser>>): UserSyncSource {
  return {
    complete: true,
    snapshotAt: '2026-11-01T00:00:00Z',
    rows: rows.map((row, i) => ({
      user: {
        id: i + 1,
        volunteer_id: (i + 1) * 10,
        uid: null,
        name: 'example person',
        email: `person${i + 1}@example.invalid`,
        telephone: `+8529123456${i}`,
        locale: 'en',
        picture: null,
        created_at: '2020-01-01T00:00:00Z',
        last_updated_at: '2020-01-01T00:00:00Z',
        ...row,
      },
      related: { runs: [{ id: 1, collected_amount: 10 }] },
    })),
  }
}

/** Plan and apply one complete source against the current local accepted state.
 * @param db Disposable target.
 * @param input Source snapshot.
 * @returns Applied plan.
 */
function sync(db: Database, input: UserSyncSource): ReturnType<typeof planUserSync> {
  const plan = planUserSync(input, target(db), options)
  expect(plan.exceptions).toEqual([])
  applyUserSync(db, plan, state(db))
  states.set(db, acceptUserSyncPlan(plan, state(db)))
  return plan
}

describe('accepted local Breadline user sync', () => {
  it('fingerprints direct and referenced related records and refuses incomplete mirror coverage', () => {
    const db = new Database(':memory:')
    databases.push(db)
    db.exec(`CREATE TABLE _breadline_sync_run(status TEXT,startedAt TEXT,sourceSnapshotAt TEXT,completedAt TEXT,tableCount INTEGER);
      INSERT INTO _breadline_sync_run VALUES('complete','2026-11-01T00:00:00Z','2026-11-01T00:00:01Z','2026-11-01T00:00:03Z',5);
      CREATE TABLE _breadline_sync_state(sourceSchema TEXT,sourceTable TEXT,mirrorTable TEXT,strategy TEXT,localRows INTEGER,sourceRows INTEGER,syncedAt TEXT);
      CREATE TABLE breadline__public__users(id INTEGER,volunteer_id INTEGER);
      INSERT INTO breadline__public__users VALUES(1,10);
      CREATE TABLE breadline__public__volunteers(id INTEGER,total INTEGER);
      INSERT INTO breadline__public__volunteers VALUES(10,3);
      CREATE TABLE breadline__public__runs(id INTEGER,volunteer_id INTEGER,collected_amount INTEGER);
      INSERT INTO breadline__public__runs VALUES(20,10,3);
      CREATE TABLE breadline__public__user_roles(id INTEGER,user_id INTEGER,role_id INTEGER);
      INSERT INTO breadline__public__user_roles VALUES(30,1,40);
      CREATE TABLE breadline__public__roles(id INTEGER,name TEXT);
      INSERT INTO breadline__public__roles VALUES(40,'volunteer');`)
    for (const table of ['users', 'volunteers', 'runs', 'user_roles', 'roles'])
      db.query(
        "INSERT INTO _breadline_sync_state VALUES('public',?,?,'full-snapshot',1,1,'2026-11-01T00:00:02Z')",
      ).run(table, `breadline__public__${table}`)
    const initial = readUserSyncSource(db)
    expect(Object.keys(initial.rows[0].related).sort()).toEqual([
      'roles',
      'runs',
      'user_roles',
      'volunteers',
    ])
    db.exec(
      "UPDATE breadline__public__roles SET name='changed'; UPDATE breadline__public__runs SET collected_amount=4",
    )
    expect(userSyncHash(readUserSyncSource(db).rows)).not.toBe(
      userSyncHash(initial.rows),
    )
    db.exec("UPDATE _breadline_sync_state SET sourceRows=2 WHERE sourceTable='runs'")
    expect(() => readUserSyncSource(db)).toThrow('incomplete')
    db.exec(
      "UPDATE _breadline_sync_state SET sourceRows=1; UPDATE _breadline_sync_run SET status='failed'",
    )
    expect(() => readUserSyncSource(db)).toThrow('Complete source')
  })
  it('imports users and memberships, retains source IDs, and replays with literally zero writes', () => {
    const db = fixture(),
      input = source({})
    const first = sync(db, input)
    expect(first.counts.created).toBe(1)
    expect(
      db.query('SELECT sourceVolunteerId FROM breadlineImportIdentity').get(),
    ).toEqual({ sourceVolunteerId: 10 })
    expect(db.query('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 1,
    })
    const before = db.query('SELECT total_changes() AS n').get()
    const second = sync(db, input)
    expect(second.mutations).toEqual([])
    expect(db.query('SELECT total_changes() AS n').get()).toEqual(before)
  })
  it('keeps stable owners for changed phone/name and related-only changes; adds new users', () => {
    const db = fixture(),
      input = source({})
    sync(db, input)
    const owner = (
      db.query('SELECT userId FROM breadlineImportIdentity').get() as { userId: string }
    ).userId
    input.rows[0].user.telephone = '+85291234599'
    input.rows[0].user.name = 'new name'
    sync(db, input)
    expect(db.query('SELECT id,name,telephone,updatedAt FROM user').get()).toEqual({
      id: owner,
      name: 'New Name',
      telephone: '+85291234599',
      updatedAt: 100,
    })
    input.rows[0].related.runs[0].collected_amount = 25
    expect(sync(db, input).counts.updated).toBe(1)
    const next = source({}, { id: 2 })
    next.rows[0] = input.rows[0]
    expect(sync(db, next).counts.created).toBe(1)
    expect(sync(db, next).mutations).toEqual([])
  })
  it('advances the accepted snapshot even when a newer complete mirror has identical rows', () => {
    const db = fixture(),
      input = source({})
    sync(db, input)
    const newer = { ...input, snapshotAt: '2026-11-02T00:00:00Z' }
    const plan = sync(db, newer)
    expect(plan.mutations).toEqual([])
    expect(plan.checkpointChanged).toBe(true)
    expect(() => planUserSync(input, target(db), options)).toThrow('predates')
    const before = db.query('SELECT total_changes() AS n').get()
    sync(db, newer)
    expect(db.query('SELECT total_changes() AS n').get()).toEqual(before)
  })
  it('preserves independent local edits, verified primary email and claimed-account profile', () => {
    const db = fixture(),
      input = source({})
    sync(db, input)
    db.exec(
      "UPDATE user SET name='Local Name',emailVerified=1; UPDATE breadlineImportUser SET claimedAt=123",
    )
    input.rows[0].user.name = 'source replacement'
    input.rows[0].user.email = 'changed@example.invalid'
    input.rows[0].user.telephone = '+85291234599'
    sync(db, input)
    expect(db.query('SELECT name,email,telephone FROM user').get()).toEqual({
      name: 'Local Name',
      email: 'person1@example.invalid',
      telephone: '+85291234560',
    })
    expect(db.query('SELECT email FROM breadlineImportIdentity').get()).toEqual({
      email: 'changed@example.invalid',
    })
  })
  it('adds a new identity to an accepted shared owner without duplicate users or credentials', () => {
    const db = fixture(),
      input = source({})
    sync(db, input)
    const next = source({}, { telephone: '+85291234560', name: 'example person' })
    sync(db, next)
    expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 })
    expect(db.query('SELECT count(*) AS n FROM breadlineImportIdentity').get()).toEqual(
      { n: 2 },
    )
    expect(db.query('SELECT count(*) AS n FROM account').get()).toEqual({ n: 0 })
  })
  it('retains an established profile when a new shared identity makes the source cohort ambiguous', () => {
    const db = fixture()
    sync(db, source({ picture: 'https://example.invalid/avatar.png' }))
    sync(
      db,
      source(
        { picture: 'https://example.invalid/avatar.png' },
        { telephone: '+85291234560', name: 'different person' },
      ),
    )
    expect(db.query('SELECT name,image,email FROM user').get()).toEqual({
      name: 'Example Person',
      image: 'https://example.invalid/avatar.png',
      email: 'person1@example.invalid',
    })
    expect(
      db.query('SELECT state,claimedEmail FROM breadlineImportUser').get(),
    ).toEqual({ state: 'claimed', claimedEmail: 'person1@example.invalid' })
  })
  it('deletes only source grants and restores the same history owner', () => {
    const db = fixture(),
      input = source({})
    sync(db, input)
    const owner = (db.query('SELECT id FROM user').get() as { id: string }).id
    db.query(
      "UPDATE organisationRole SET grant=json_set(grant,'$.onboarding','user') WHERE userId=?",
    ).run(owner)
    expect(sync(db, source()).counts.removed).toBe(1)
    expect(state(db).rows[0].active).toBe(0)
    expect(db.query('SELECT active FROM breadlineImportIdentity').get()).toEqual({
      active: 0,
    })
    expect(db.query('SELECT id FROM user').get()).toEqual({ id: owner })
    expect(db.query('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 1,
    })
    expect(
      db.query('SELECT sourceVolunteerId FROM breadlineImportIdentity').get(),
    ).toEqual({ sourceVolunteerId: 10 })
    expect(sync(db, source()).mutations).toEqual([])
    expect(sync(db, input).counts.restored).toBe(1)
    expect(db.query('SELECT id FROM user').get()).toEqual({ id: owner })
  })
  it('retains membership for surviving shared identities and removes it after the last grant', () => {
    const db = fixture(),
      input = source({}, { telephone: '+85291234560' })
    sync(db, input)
    sync(db, source({}))
    expect(db.query('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 1,
    })
    sync(db, source())
    expect(db.query('SELECT count(*) AS n FROM organisationRole').get()).toEqual({
      n: 0,
    })
    expect(db.query('SELECT count(*) AS n FROM breadlineImportIdentity').get()).toEqual(
      { n: 2 },
    )
  })
  it('rejects partial, older, wrong-target and stale snapshots', () => {
    const db = fixture(),
      input = source({})
    expect(() =>
      planUserSync({ ...input, complete: false }, target(db), options),
    ).toThrow('Complete source')
    sync(db, input)
    expect(() =>
      planUserSync({ ...input, snapshotAt: '2020-01-01' }, target(db), options),
    ).toThrow('predates')
    expect(() =>
      planUserSync(input, target(db), {
        ...options,
        targetIdentity: 'production:other',
      }),
    ).toThrow('Target identity')
    const plan = planUserSync(source(), target(db), options)
    db.exec("UPDATE user SET name='Concurrent edit'")
    expect(() => applyUserSync(db, plan)).toThrow('Stale')
    expect(state(db).rows[0].active).toBe(1)
  })
  it('quarantines merges, splits, reassigned volunteer IDs and target phone collisions', () => {
    const db = fixture()
    sync(db, source({}, {}))
    const merged = source({}, { telephone: '+85291234560' })
    expect(planUserSync(merged, target(db), options).exceptions.length).toBeGreaterThan(
      0,
    )
    expect(
      planUserSync(source({ volunteer_id: 999 }), target(db), options).exceptions[0]
        .reason,
    ).toBe('source_volunteer_identity_changed')
    expect(() => applyUserSync(db, planUserSync(merged, target(db), options))).toThrow(
      'exceptions',
    )
  })
  it("quarantines a new source user taking a deleted identity's historic volunteer join", () => {
    const db = fixture()
    sync(db, source({}))
    sync(db, source())
    const plan = planUserSync(
      source({
        id: 2,
        volunteer_id: 10,
        telephone: '+85291234599',
        email: 'new@example.invalid',
      }),
      target(db),
      options,
    )
    expect(plan.exceptions).toEqual([
      { sourceUserIds: [2], reason: 'source_volunteer_owner_conflict' },
    ])
    expect(() => applyUserSync(db, plan)).toThrow('exceptions')
    expect(
      db
        .query('SELECT sourceUserId,sourceVolunteerId FROM breadlineImportIdentity')
        .get(),
    ).toEqual({ sourceUserId: 1, sourceVolunteerId: 10 })
  })
  it('rolls back an interrupted batch and can reapply the same plan', () => {
    const db = fixture(),
      plan = planUserSync(source({}), target(db), options)
    db.exec(
      "CREATE TRIGGER fail_sync BEFORE INSERT ON organisationRole BEGIN SELECT RAISE(ABORT,'synthetic failure'); END",
    )
    expect(() => applyUserSync(db, plan)).toThrow('synthetic failure')
    expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 0 })
    db.exec('DROP TRIGGER fail_sync')
    expect(applyUserSync(db, plan)).toBeGreaterThan(0)
  })
  it('preserves reviewed phone corrections, exclusions and email fallback', () => {
    const db = fixture(),
      input = source({ telephone: 'bad' }, { email: 'excluded@example.invalid' })
    const plan = planUserSync(input, target(db), {
      ...options,
      decisions: {
        version: 1,
        merges: [],
        excludeEmails: ['excluded@example.invalid'],
        telephoneOverrides: [
          { sourceUserId: 1, expectedTelephone: 'bad', telephone: null },
        ],
      },
    })
    expect(plan.exceptions).toEqual([])
    expect(plan.counts).toMatchObject({ excluded: 1, created: 1 })
    applyUserSync(db, plan)
    expect(db.query('SELECT telephone FROM user').get()).toEqual({ telephone: null })
  })
})

/** Adapt SQLite to D1's atomic batch API, optionally interrupting one batch.
 * @param db Disposable production-shaped target.
 * @param failAt Batch number to reject before execution.
 * @returns D1 binding with transactional batch semantics.
 */
function remoteFixture(db: Database, failAt = 0): D1Database {
  let calls = 0
  const prepare = (sql: string, values: Array<string | number | null> = []) => ({
    bind: (...parameters: Array<string | number | null>) => prepare(sql, parameters),
    first: async () => db.query(sql).get(...values),
    execute: () => db.query(sql).all(...values),
  })
  return {
    prepare,
    batch: async (statements: Array<ReturnType<typeof prepare>>) => {
      if (++calls === failAt) throw new Error('synthetic network interruption')
      return db
        .transaction(() => statements.map(statement => statement.execute()))
        .immediate()
    },
  } as unknown as D1Database
}

describe('reviewed profile resolution', () => {
  it('resolves an existing unclaimed owner without changing history, grants or its ID and replays without writes', () => {
    const db = fixture()
    const input = source(
      {
        name: 'Example',
        email: 'same@example.invalid',
        uid: '123456789012345678901',
        picture: 'https://example.invalid/avatar.jpg',
      },
      {
        name: 'EXAMPLE [12S1]',
        email: 'same@example.invalid',
        telephone: '+85291234560',
        uid: 'legacy-facebook',
      },
    )
    sync(db, input)
    const before = db.query('SELECT id FROM user').get() as { id: string }
    const history = db
      .query('SELECT * FROM breadlineImportIdentity ORDER BY sourceUserId')
      .all()
    const grants = db.query('SELECT * FROM organisationRole').all()
    const reviewed = {
      ...options,
      decisions: {
        ...options.decisions,
        profileResolutions: [
          { sourceUserIds: [1, 2], email: 'same@example.invalid', name: 'Example FL' },
        ],
      },
    }
    const plan = planUserSync(input, target(db), reviewed)
    expect(plan.exceptions).toEqual([])
    applyUserSync(db, plan, state(db))
    states.set(db, acceptUserSyncPlan(plan, state(db)))
    expect(db.query('SELECT id,name,email,image FROM user').get()).toEqual({
      id: before.id,
      name: 'Example FL',
      email: 'same@example.invalid',
      image: 'https://example.invalid/avatar.jpg',
    })
    expect(
      db.query('SELECT state,claimedEmail,claimedAt FROM breadlineImportUser').get(),
    ).toEqual({
      state: 'claimed',
      claimedEmail: 'same@example.invalid',
      claimedAt: null,
    })
    expect(
      db.query('SELECT * FROM breadlineImportIdentity ORDER BY sourceUserId').all(),
    ).toEqual(history)
    expect(db.query('SELECT * FROM organisationRole').all()).toEqual(grants)
    expect(db.query('SELECT count(*) AS n FROM account').get()).toEqual({ n: 1 })
    expect(planUserSync(input, target(db), reviewed).mutations).toEqual([])
    db.query(
      "UPDATE user SET image='https://example.invalid/owner.jpg',name='Owner preference'",
    ).run()
    expect(planUserSync(input, target(db), reviewed).mutations).toEqual([])
  })
})

describe('production user sync protocol without production access', () => {
  it('resumes an older small-batch cursor after an unacknowledged batch', async () => {
    const db = fixture(),
      input = source(...Array.from({ length: 30 }, () => ({ telephone: null })))
    const plan = planUserSync(input, target(db), {
      ...options,
      targetIdentity: 'production:synthetic',
    })
    const mutations = plan.mutations.filter(
      row => row.table !== 'breadlineUserSyncState',
    )
    const remote = remoteFixture(db)
    await remote.batch(
      mutations
        .slice(0, 40)
        .flatMap(m =>
          userSyncRowStatements(m).map(s => remote.prepare(s.sql).bind(...s.values)),
        ),
    )
    let journal: UserSyncJournal = {
      planHash: userSyncHash(plan),
      targetIdentity: plan.targetIdentity,
      nextMutation: 20,
      complete: false,
    }
    await applyUserSyncRemote(remote, plan, plan.targetIdentity, journal, next => {
      journal = next
    })
    expect(journal.complete).toBe(true)
    expect(journal.nextMutation).toBe(mutations.length)
    expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 30 })
    expect(db.query('SELECT count(*) AS n FROM breadlineImportIdentity').get()).toEqual(
      { n: 30 },
    )
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('resumes after a lost response and keeps all bookkeeping local', async () => {
    const db = fixture(),
      input = source({}, {}, {}, {}, {}, {}, {}, {})
    const plan = planUserSync(input, target(db), {
      ...options,
      targetIdentity: 'production:synthetic',
    })
    let journal: UserSyncJournal | null = null
    let saves = 0
    const save = (next: UserSyncJournal): void => {
      if (++saves === 2) throw new Error('lost response')
      journal = next
    }
    await expect(
      applyUserSyncRemote(remoteFixture(db), plan, plan.targetIdentity, journal, save),
    ).rejects.toThrow('lost response')
    expect(journal!.nextMutation).toBe(0)
    const saveAgain = (next: UserSyncJournal): void => {
      journal = next
    }
    await applyUserSyncRemote(
      remoteFixture(db),
      plan,
      plan.targetIdentity,
      journal,
      saveAgain,
    )
    expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 8 })
    expect(journal!.complete).toBe(true)
    const changes = db.query('SELECT total_changes() AS n').get()
    await applyUserSyncRemote(
      remoteFixture(db),
      plan,
      plan.targetIdentity,
      journal,
      saveAgain,
    )
    expect(db.query('SELECT total_changes() AS n').get()).toEqual(changes)
    expect(
      db
        .query("SELECT name FROM sqlite_master WHERE name LIKE 'breadlineUserSync%'")
        .all(),
    ).toEqual([])
  })
  it('protects concurrent remote edits and rolls back the whole failed batch', async () => {
    const db = fixture(),
      input = source({})
    sync(db, input)
    state(db).checkpoint!.targetIdentity = 'production:synthetic'
    input.rows[0].user.name = 'source changed'
    const plan = planUserSync(input, target(db), {
      ...options,
      targetIdentity: 'production:synthetic',
    })
    db.exec("UPDATE user SET name='Concurrent HYPE change'")
    let journal: UserSyncJournal | null = null
    await expect(
      applyUserSyncRemote(
        remoteFixture(db),
        plan,
        plan.targetIdentity,
        journal,
        next => {
          journal = next
        },
      ),
    ).rejects.toThrow()
    expect(db.query('SELECT name FROM user').get()).toEqual({
      name: 'Concurrent HYPE change',
    })
    expect(journal!.nextMutation).toBe(0)
    expect(db.query('SELECT name FROM breadlineImportIdentity').get()).toEqual({
      name: 'example person',
    })
  })
  it('rejects a different local journal and wrong database identity', async () => {
    const db = fixture(),
      plan = planUserSync(source({}), target(db), {
        ...options,
        targetIdentity: 'production:synthetic',
      })
    await expect(
      applyUserSyncRemote(remoteFixture(db), plan, 'production:wrong', null, () => {}),
    ).rejects.toThrow('mismatch')
    await expect(
      applyUserSyncRemote(
        remoteFixture(db),
        plan,
        plan.targetIdentity,
        {
          planHash: 'other',
          targetIdentity: plan.targetIdentity,
          nextMutation: 0,
          complete: false,
        },
        () => {},
      ),
    ).rejects.toThrow('mismatch')
    expect(db.query('SELECT count(*) AS n FROM user').get()).toEqual({ n: 0 })
  })
})
