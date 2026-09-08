// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

const migration = readFileSync(
  'migrations/0077_better_auth_1_7_3_account_identity.sql',
  'utf8',
)
const sqlite = new DatabaseSync(':memory:')
afterEach(() => sqlite.exec('ROLLBACK'))
afterAll(() => sqlite.close())

/** Creates the account shape deployed by migration 0076 in a rollback-only fixture. */
function setup(): void {
  sqlite.exec(`BEGIN;
    CREATE TABLE user (id TEXT PRIMARY KEY);
    INSERT INTO user VALUES ('user');
    CREATE TABLE account (
      id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      accountId TEXT NOT NULL, issuer TEXT NOT NULL, providerId TEXT NOT NULL,
      accessToken TEXT, refreshToken TEXT, accessTokenExpiresAt INTEGER,
      refreshTokenExpiresAt INTEGER, scope TEXT, idToken TEXT, password TEXT,
      createdAt INTEGER NOT NULL, updatedAt INTEGER NOT NULL);
    CREATE UNIQUE INDEX account_issuer_accountId_uidx ON account(issuer, accountId);
    INSERT INTO account VALUES ('local-row', 'user', 'external-subject', 'https://accounts.google.com',
      'google', 'access', 'refresh', 10, 20, 'email', 'token', NULL, 30, 40);`)
}

describe('Better Auth 1.7.3 account migration', () => {
  it('preserves all account data and accepts issuer-free writes with provider uniqueness', () => {
    setup()
    const before = sqlite.prepare('SELECT * FROM account').all()
    sqlite.exec(migration)
    expect(sqlite.prepare('SELECT * FROM account').all()).toEqual(before)
    sqlite.exec(`INSERT INTO account (id, userId, accountId, providerId, password, createdAt, updatedAt)
      VALUES ('credential', 'user', 'user', 'credential', 'hash', 0, 0)`)
    expect(
      sqlite.prepare("SELECT issuer FROM account WHERE id = 'credential'").get(),
    ).toMatchObject({ issuer: null })
    expect(() =>
      sqlite.exec(`INSERT INTO account (id, userId, accountId, providerId, createdAt, updatedAt)
      VALUES ('duplicate', 'user', 'external-subject', 'google', 0, 0)`),
    ).toThrow(/UNIQUE/)
    sqlite.exec(`INSERT INTO account (id, userId, accountId, providerId, createdAt, updatedAt)
      VALUES ('other-provider', 'user', 'external-subject', 'facebook', 0, 0)`)
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })

  it('refuses ambiguous provider identities before altering existing rows', () => {
    setup()
    sqlite.exec(`INSERT INTO account (id, userId, accountId, issuer, providerId, createdAt, updatedAt)
      VALUES ('collision', 'user', 'external-subject', 'other-issuer', 'google', 0, 0)`)
    const before = sqlite.prepare('SELECT * FROM account').all()
    expect(() => sqlite.exec(migration)).toThrow(/UNIQUE/)
    expect(sqlite.prepare('SELECT * FROM account').all()).toEqual(before)
    expect(
      sqlite
        .prepare('PRAGMA table_info(account)')
        .all()
        .find(row => row.name === 'issuer'),
    ).toMatchObject({ notnull: 1 })
  })
})
