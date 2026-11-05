// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let sqlite: DatabaseSync
const migration = readFileSync(
  'migrations/0183_hkghostsigns_contribution_users.sql',
  'utf8',
)

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY,code TEXT,isPublished INTEGER DEFAULT 1,isArchived INTEGER DEFAULT 0,modifiedAt TEXT DEFAULT 'before');
    CREATE TABLE organisationI18n(organisationId TEXT);
    CREATE TABLE organisationProperty(organisationId TEXT);
    CREATE TABLE user(id TEXT PRIMARY KEY,isAnonymous INTEGER DEFAULT 0,isArchived INTEGER DEFAULT 0);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,code TEXT);
    CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT,contributorId TEXT,isDraft INTEGER DEFAULT 0);
    CREATE TABLE image(id TEXT PRIMARY KEY,contributorId TEXT);
    CREATE TABLE featureImage(featureId TEXT,imageId TEXT,isPublished INTEGER DEFAULT 0);
    CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT,projectId TEXT,organisationId TEXT,contributorId TEXT,type TEXT,isDraft INTEGER DEFAULT 1,isReviewed INTEGER DEFAULT 0);
    CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
    CREATE TABLE organisationRole(organisationId TEXT REFERENCES organisation(id),userId TEXT REFERENCES user(id),role TEXT NOT NULL,PRIMARY KEY(organisationId,userId));
    CREATE TABLE breadlineImportIdentity(sourceUserId INTEGER PRIMARY KEY);
    CREATE TABLE revisionChangeSet(id TEXT PRIMARY KEY,actorId TEXT,origin TEXT,reason TEXT,createdAt TEXT);
    INSERT INTO organisation(id,code) VALUES('ghost','old-ghost-name'),('other','other');
    INSERT INTO project VALUES('signs','ghost','hkghostsigns'),('outside','other','outside');
    INSERT INTO user(id) VALUES('author'),('photo'),('report'),('legacy'),('draft'),('staff'),('outsider');
    INSERT INTO user VALUES('anonymous',1,0),('archived',0,1);
    INSERT INTO feature VALUES('sign','signs','legacy',0),('draft-sign','signs','draft',1),('other-sign','outside','outsider',0);
  `)
  sqlite.exec(readFileSync('migrations/0168_organisation_users.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0173_organisation_revisions.sql', 'utf8'))
  sqlite.exec(
    readFileSync('migrations/0182_organisation_contribution_users.sql', 'utf8'),
  )
  sqlite.exec(
    "INSERT INTO organisationUserPolicy(organisationId,enabled,hubSignIn,customCard,contribution,revision) VALUES('ghost',1,1,1,1,3),('other',1,0,0,0,0)",
  )
})
afterEach(() => sqlite.close())

/** Insert a task with explicit ancestry so the real triggers decide eligibility. */
function submit(
  userId: string,
  type = 'newFeature',
  draft = 0,
  organisationId = 'ghost',
): void {
  sqlite
    .prepare(
      'INSERT INTO task(id,featureId,projectId,organisationId,contributorId,type,isDraft) VALUES(?,?,?,?,?,?,?)',
    )
    .run(`task-${userId}`, 'sign', 'signs', organisationId, userId, type, draft)
}

/** Read the effective audience and independent grant provenance. */
function roles(): Record<string, unknown>[] {
  return sqlite
    .prepare('SELECT * FROM organisationRole ORDER BY organisationId,userId')
    .all()
}

/** Apply the data migration with the same all-or-nothing boundary as D1. */
function backfill(): void {
  sqlite.exec('BEGIN')
  try {
    sqlite.exec(migration)
    sqlite.exec('COMMIT')
  } catch (error) {
    sqlite.exec('ROLLBACK')
    throw error
  }
}

describe('contribution organisation users', () => {
  it.each(['newFeature', 'newPhoto', 'reportedMissing'])(
    'enrols %s on submission, before review, exactly once',
    type => {
      submit('author', type, 1)
      expect(roles()).toEqual([])
      sqlite.exec("UPDATE task SET isDraft=0 WHERE id='task-author'")
      expect(roles()).toEqual([
        {
          organisationId: 'ghost',
          userId: 'author',
          role: 'user',
          grant: '{"contribution:signs":"user"}',
        },
      ])
      sqlite.exec("UPDATE task SET isDraft=0,isReviewed=1 WHERE id='task-author'")
      expect(roles()).toHaveLength(1)
    },
  )

  it('enrols already-final submissions and preserves stronger manual/import grants', () => {
    sqlite.exec(
      `INSERT INTO organisationRole VALUES('ghost','staff','owner','{"manual":"owner","breadline":"user"}')`,
    )
    submit('staff', 'newPhoto')
    expect(roles()).toEqual([
      {
        organisationId: 'ghost',
        userId: 'staff',
        role: 'owner',
        grant: '{"manual":"owner","breadline":"user","contribution:signs":"user"}',
      },
    ])
  })

  it.each([
    'UPDATE organisationUserPolicy SET enabled=0',
    'UPDATE organisationUserPolicy SET contribution=0',
    "UPDATE organisation SET isArchived=1 WHERE id='ghost'",
    "UPDATE organisation SET isPublished=0 WHERE id='ghost'",
    "UPDATE user SET isAnonymous=1 WHERE id='author'",
    "UPDATE user SET isArchived=1 WHERE id='author'",
    "UPDATE project SET organisationId='other' WHERE id='signs'",
  ])('checks persisted policy/account/ancestry: %s', change => {
    sqlite.exec(change)
    submit('author')
    expect(roles()).toEqual([])
  })

  it('rejects forged organisation ancestry and does not treat other task types as contributions', () => {
    submit('author', 'newFeature', 0, 'other')
    submit('report', 'unrelated')
    expect(roles()).toEqual([])
  })

  it('rolls back enrolment together with a failed submission transaction', () => {
    sqlite.exec('BEGIN')
    submit('author')
    expect(roles()).toHaveLength(1)
    expect(() => submit('author')).toThrow()
    sqlite.exec('ROLLBACK')
    expect(roles()).toEqual([])
    expect(sqlite.prepare('SELECT * FROM task').all()).toEqual([])
  })

  it('backfills historical signs, standalone images, reports and task-only image authors; excludes drafts and unrelated projects', () => {
    sqlite.exec('UPDATE organisationUserPolicy SET enabled=0,contribution=0')
    submit('author')
    submit('report', 'reportedMissing')
    submit('draft', 'newPhoto', 1)
    submit('staff', 'newPhoto')
    submit('anonymous')
    submit('archived')
    sqlite.exec(`
      INSERT INTO image VALUES('legacy-photo','photo'),('task-photo','staff'),('draft-photo','draft'),('other-photo','outsider');
      INSERT INTO featureImage VALUES('sign','legacy-photo',0),('sign','draft-photo',0),('other-sign','other-photo',1);
      INSERT INTO taskImage VALUES('task-report','task-photo'),('task-draft','draft-photo');
      INSERT INTO organisationRole VALUES('ghost','staff','member','{"manual":"member"}');
    `)
    backfill()
    expect(roles().map(row => row.userId)).toEqual([
      'author',
      'legacy',
      'photo',
      'report',
      'staff',
    ])
    expect(roles().find(row => row.userId === 'staff')?.role).toBe('member')
    expect(
      sqlite
        .prepare(
          "SELECT enabled,hubSignIn,customCard,contribution,revision FROM organisationUserPolicy WHERE organisationId='ghost'",
        )
        .get(),
    ).toEqual({ enabled: 1, hubSignIn: 1, customCard: 1, contribution: 1, revision: 4 })
    expect(
      sqlite
        .prepare(
          "SELECT contribution FROM organisationUserPolicy WHERE organisationId='other'",
        )
        .get(),
    ).toEqual({ contribution: 0 })
    const before = roles()
    backfill()
    expect(roles()).toEqual(before)
    expect(
      sqlite
        .prepare(
          "SELECT revision FROM organisationUserPolicy WHERE organisationId='ghost'",
        )
        .get(),
    ).toEqual({ revision: 4 })
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('creates the Ghost Signs policy if absent', () => {
    sqlite.exec("DELETE FROM organisationUserPolicy WHERE organisationId='ghost'")
    backfill()
    expect(
      sqlite
        .prepare(
          "SELECT enabled,contribution,hubSignIn FROM organisationUserPolicy WHERE organisationId='ghost'",
        )
        .get(),
    ).toEqual({ enabled: 1, contribution: 1, hubSignIn: 0 })
  })
})
