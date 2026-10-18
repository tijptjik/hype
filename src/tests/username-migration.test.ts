// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTS
import { describe, expect, it } from 'vitest'

const migration = readFileSync('migrations/0086_username_display_case.sql', 'utf8')

describe('username casing migration', () => {
  it('preserves spelling and enforces case-insensitive uniqueness', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        "CREATE TABLE user(id TEXT PRIMARY KEY, username TEXT UNIQUE); INSERT INTO user VALUES ('one', 'MixedCase')",
      )
      db.exec(migration)
      expect(db.prepare('SELECT username, displayUsername FROM user').get()).toEqual({
        username: 'mixedcase',
        displayUsername: 'MixedCase',
      })
      expect(() =>
        db.exec("INSERT INTO user(id, username) VALUES ('two', 'MIXEDCASE')"),
      ).toThrow()
    } finally {
      db.close()
    }
  })

  it('blocks existing case collisions without merging users', () => {
    const db = new DatabaseSync(':memory:')
    try {
      db.exec(
        "CREATE TABLE user(id TEXT PRIMARY KEY, username TEXT UNIQUE); INSERT INTO user VALUES ('one', 'Name'), ('two', 'name')",
      )
      expect(() => db.exec(migration)).toThrow()
      expect(db.prepare('SELECT count(*) AS count FROM user').get()).toEqual({
        count: 2,
      })
    } finally {
      db.close()
    }
  })
})
