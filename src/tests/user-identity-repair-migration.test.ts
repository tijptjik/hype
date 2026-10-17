// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTS
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'migrations/0087_refresh_generated_usernames_merge_user.sql',
  'utf8',
)
const source = 'dTygqS3HWCYsssnVaOzZ9VX5hdK7lGVb'
const target = 'QQrveSvG10G2'

/**
 * Create a synthetic identity graph covering every migrated relationship.
 * @returns An isolated in-memory database with both merge identities.
 */
function fixture(): DatabaseSync {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE user(id TEXT PRIMARY KEY, username TEXT UNIQUE, displayUsername TEXT, isAnonymous INTEGER DEFAULT 0);
    CREATE UNIQUE INDEX username_nocase ON user(lower(username));
    CREATE TABLE featureCountCache(key TEXT);
    CREATE TABLE featureCountRevision(id INTEGER, revision INTEGER);
    CREATE TABLE featureCountUserRevision(userId TEXT, revision INTEGER);
    CREATE TABLE userActivity(userId TEXT PRIMARY KEY REFERENCES user(id), loginCount INTEGER, lastLogin TEXT);
    CREATE TABLE userFeature(userId TEXT REFERENCES user(id), featureId TEXT, isVisited INTEGER, isWishlisted INTEGER, visitedAt TEXT, createdAt TEXT, modifiedAt TEXT, PRIMARY KEY(userId,featureId));
    CREATE TABLE userLayer(layerId TEXT, userId TEXT REFERENCES user(id), hubId TEXT, isDefaultVisible INTEGER, PRIMARY KEY(layerId,userId,hubId));
    CREATE TABLE hubUserState(hubId TEXT, userId TEXT REFERENCES user(id), subscriptionPromptDismissed INTEGER, subscriptionMember INTEGER, hasAgreedToTerms INTEGER, createdAt TEXT, modifiedAt TEXT, PRIMARY KEY(hubId,userId));`)
  for (const [table, columns] of Object.entries({
    account: ['userId'],
    session: ['userId'],
    passkey: ['userId'],
    image: ['contributorId'],
    feature: ['contributorId', 'publisherId'],
    featureImage: ['publisherId'],
    task: ['contributorId', 'reviewerId'],
    organisation: ['publisherId'],
    project: ['publisherId'],
    layer: ['publisherId'],
    organisationRole: ['userId'],
    projectRole: ['userId'],
    hubRole: ['userId'],
  }))
    db.exec(
      `CREATE TABLE ${table}(id TEXT PRIMARY KEY, ${columns.map(c => `${c} TEXT REFERENCES user(id)`).join(',')})`,
    )
  db.prepare('INSERT INTO user(id,username) VALUES (?,?)').run(target, 'broad salmon')
  db.prepare('INSERT INTO user(id,username) VALUES (?,?)').run(source, 'legacy')
  return db
}

describe('0087 identity repair', () => {
  it('transfers every attribution and login while combining overlapping state', () => {
    const db = fixture()
    try {
      for (const { name } of db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]) {
        if (
          ['user', 'userActivity', 'userFeature', 'userLayer', 'hubUserState'].includes(
            name,
          ) ||
          name.startsWith('featureCount')
        )
          continue
        const cols = db.prepare(`PRAGMA table_info(${name})`).all() as {
          name: string
        }[]
        db.prepare(`INSERT INTO ${name} VALUES (${cols.map(() => '?').join(',')})`).run(
          'record',
          ...cols.slice(1).map(() => source),
        )
      }
      for (const id of [source, target]) {
        db.prepare('INSERT INTO userActivity VALUES (?,2,?)').run(id, '2026-10-17')
        db.prepare('INSERT INTO userFeature VALUES (?, ?, ?, ?, NULL, ?, ?)').run(
          id,
          'f',
          id === source ? 1 : 0,
          id === target ? 1 : 0,
          '2026',
          '2026',
        )
        db.prepare('INSERT INTO userLayer VALUES (?, ?, ?, 1)').run('l', id, 'h')
        db.prepare('INSERT INTO hubUserState VALUES (?, ?, 1, 0, 1, ?, ?)').run(
          'h',
          id,
          '2026',
          '2026',
        )
      }
      db.exec(`BEGIN; ${migration} COMMIT;`)
      expect(db.prepare('SELECT id FROM user WHERE id=?').get(source)).toBeUndefined()
      expect(db.prepare('SELECT loginCount FROM userActivity').get()).toEqual({
        loginCount: 4,
      })
      expect(
        db.prepare('SELECT isVisited,isWishlisted FROM userFeature').get(),
      ).toEqual({ isVisited: 1, isWishlisted: 1 })
      for (const { name } of db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]) {
        const cols = db.prepare(`PRAGMA table_info(${name})`).all() as {
          name: string
        }[]
        for (const { name: col } of cols)
          expect(
            db.prepare(`SELECT count(*) AS n FROM ${name} WHERE ${col}=?`).get(source),
          ).toEqual({ n: 0 })
      }
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      db.exec(`BEGIN; ${migration} COMMIT;`)
      expect(db.prepare('SELECT loginCount FROM userActivity').get()).toEqual({
        loginCount: 4,
      })
    } finally {
      db.close()
    }
  })

  it('preserves custom edits, guests and unknown users while updating a frozen match', () => {
    const db = fixture()
    try {
      const matches = [
        ...migration.matchAll(
          /WHERE id = '([^']+)' AND lower\(username\) = '([^']+)'/g,
        ),
      ]
      const insert = db.prepare(
        'INSERT INTO user(id,username,isAnonymous) VALUES (?,?,?)',
      )
      insert.run(matches[0][1], matches[0][2], 0)
      insert.run(matches[1][1], 'MyCustomName', 0)
      insert.run(matches[2][1], matches[2][2], 1)
      insert.run('unknown', 'AnotherCustom', 0)
      db.exec(migration)
      expect(
        db.prepare('SELECT username FROM user WHERE id=?').get(matches[0][1]),
      ).not.toEqual({ username: matches[0][2] })
      expect(
        db.prepare('SELECT username FROM user WHERE id=?').get(matches[1][1]),
      ).toEqual({ username: 'MyCustomName' })
      expect(
        db.prepare('SELECT username FROM user WHERE id=?').get(matches[2][1]),
      ).toEqual({ username: matches[2][2] })
      expect(db.prepare('SELECT username FROM user WHERE id=?').get('unknown')).toEqual(
        { username: 'AnotherCustom' },
      )
    } finally {
      db.close()
    }
  })

  it('rolls back if the merge destination is missing', () => {
    const db = fixture()
    try {
      db.prepare('DELETE FROM user WHERE id=?').run(target)
      expect(() => db.exec(`BEGIN; ${migration} COMMIT;`)).toThrow()
      db.exec('ROLLBACK')
      expect(db.prepare('SELECT username FROM user WHERE id=?').get(source)).toEqual({
        username: 'legacy',
      })
    } finally {
      db.close()
    }
  })
})
