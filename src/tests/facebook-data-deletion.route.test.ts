// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateUsernameFromId } from '$lib/utils/username-generator.server'
import { POST } from '../routes/api/auth/facebook/data-deletion/+server'

// Collision retries need real seeded names rather than the global constant-name stub.
vi.unmock('unique-names-generator')

let sqlite: DatabaseSync
let beforeBatch: () => void
const privateTables = [
  'session',
  'passkey',
  'userActivity',
  'userFeature',
  'userLayer',
  'hubRole',
  'hubUserState',
  'organisationRole',
  'projectRole',
]

const appSecret = 'facebook-secret'

/**
 * Encodes bytes in Facebook's URL-safe base64 format.
 *
 * @param bytes - Bytes to encode.
 * @returns URL-safe base64 text without padding.
 */
function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Creates an authenticated Facebook deletion callback event.
 *
 * @returns Minimum SvelteKit request event consumed by the deletion route.
 */
async function createEvent(): Promise<unknown> {
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ user_id: 'facebook-user-1' })),
  )
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = toBase64Url(
    new Uint8Array(
      await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)),
    ),
  )
  const form = new FormData()
  form.set('signed_request', `${signature}.${payload}`)

  return {
    request: new Request('https://hype.example/api/auth/facebook/data-deletion', {
      method: 'POST',
      body: form,
    }),
    url: new URL('https://hype.example/api/auth/facebook/data-deletion'),
    platform: { env: { AUTH_FACEBOOK_SECRET: appSecret, DB: database } },
  }
}

/** Executes real generated SQL with D1-style atomic batch semantics. */
const database = {
  prepare: (sql: string) => ({
    bind: (...params: never[]) => ({
      sql,
      params,
      run: async () => sqlite.prepare(sql).run(...params),
      raw: async () => {
        const statement = sqlite.prepare(sql)
        statement.setReturnArrays(true)
        return statement.all(...params)
      },
    }),
  }),
  batch: async (statements: { sql: string; params: never[] }[]) => {
    beforeBatch()
    sqlite.exec('BEGIN')
    try {
      const results = statements.map(({ sql, params }) => ({
        results: sqlite.prepare(sql).all(...params),
      }))
      sqlite.exec('COMMIT')
      return results
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  },
}

/** Calls the route with a genuinely signed request. */
async function invoke(): Promise<Response> {
  return POST((await createEvent()) as never)
}

/** Captures all persisted state for retry and rollback assertions. */
function snapshot() {
  return [
    'user',
    'account',
    'verification',
    'facebookDeletionRequest',
    ...privateTables,
  ].map(table => sqlite.prepare(`SELECT * FROM ${table}`).all())
}

beforeEach(() => {
  beforeBatch = () => {}
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    CREATE TABLE user (id TEXT PRIMARY KEY, name TEXT, username TEXT UNIQUE,
      email TEXT UNIQUE, emailVerified INTEGER, image TEXT, locale TEXT, attribution TEXT,
      isAnonymous INTEGER, isArchived INTEGER, preferences TEXT, experimental TEXT, updatedAt INTEGER);
    CREATE TABLE account (id TEXT PRIMARY KEY, userId TEXT, providerId TEXT, accountId TEXT);
    CREATE TABLE verification (value TEXT);
    CREATE TABLE facebookDeletionRequest (confirmationCodeHash TEXT PRIMARY KEY, completedAt INTEGER);
    INSERT INTO user (id, name, username, email, isArchived) VALUES ('user-1', 'Alice', 'alice', 'alice@example.com', 0);
    INSERT INTO account VALUES ('account-facebook', 'user-1', 'facebook', 'facebook-user-1');
    INSERT INTO verification VALUES ('user-1');
  `)
  for (const table of privateTables) {
    sqlite.exec(`CREATE TABLE ${table} (id TEXT, userId TEXT)`)
    if (table !== 'passkey')
      sqlite.exec(`INSERT INTO ${table} VALUES ('private', 'user-1')`)
  }
})
afterEach(() => sqlite.close())

describe('Facebook data deletion atomic batch', () => {
  it('rolls back a concurrent tombstone collision and succeeds on retry', async () => {
    beforeBatch = () => {
      sqlite
        .prepare('INSERT INTO user (id, username) VALUES (?, ?)')
        .run('other-user', generateUsernameFromId('deleted:user-1:0'))
    }
    await expect(invoke()).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM account').all()).toHaveLength(1)
    expect(sqlite.prepare('SELECT * FROM facebookDeletionRequest').all()).toEqual([])
    beforeBatch = () => {}
    await invoke()
    expect(
      sqlite.prepare("SELECT username FROM user WHERE id = 'user-1'").get(),
    ).toEqual({ username: generateUsernameFromId('deleted:user-1:1') })
  })

  it('does not remove another user private state', async () => {
    for (const table of privateTables) {
      sqlite.exec(`INSERT INTO ${table} VALUES ('other-private', 'other-user')`)
    }
    sqlite.exec("INSERT INTO verification VALUES ('other-user')")
    await invoke()
    for (const table of privateTables) {
      expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([
        { id: 'other-private', userId: 'other-user' },
      ])
    }
    expect(sqlite.prepare('SELECT * FROM verification').all()).toEqual([
      { value: 'other-user' },
    ])
  })

  it('scrubs private state, retains the user, and durably confirms with safe retries', async () => {
    expect((await invoke()).status).toBe(200)
    expect(
      sqlite.prepare('SELECT id, name, email, isArchived FROM user').get(),
    ).toEqual({
      id: 'user-1',
      name: 'Deleted User',
      email: 'deleted+user-1@hype.invalid',
      isArchived: 1,
    })
    for (const table of ['account', 'verification', ...privateTables]) {
      expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
    }
    expect(sqlite.prepare('SELECT * FROM facebookDeletionRequest').all()).toHaveLength(
      1,
    )
    const state = snapshot()
    await invoke()
    expect(snapshot()).toEqual(state)
  })

  it.each(['account', 'passkey'])(
    'preserves a %s added after the lookup',
    async table => {
      beforeBatch = () =>
        sqlite.exec(
          table === 'account'
            ? "INSERT INTO account VALUES ('password', 'user-1', 'credential', 'user-1')"
            : "INSERT INTO passkey VALUES ('key', 'user-1')",
        )
      await invoke()
      expect(sqlite.prepare('SELECT name, isArchived FROM user').get()).toEqual({
        name: 'Alice',
        isArchived: 0,
      })
      expect(
        sqlite.prepare("SELECT * FROM account WHERE id = 'account-facebook'").all(),
      ).toEqual([])
      expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toHaveLength(1)
      expect(sqlite.prepare('SELECT * FROM session').all()).toHaveLength(1)
    },
  )

  it('uses current credentials when an alternate method was removed', async () => {
    sqlite.exec("INSERT INTO passkey VALUES ('key', 'user-1')")
    beforeBatch = () => sqlite.exec('DELETE FROM passkey')
    await invoke()
    expect(sqlite.prepare('SELECT isArchived FROM user').get()).toEqual({
      isArchived: 1,
    })
  })

  it.each([
    'DELETE FROM account',
    "UPDATE account SET userId = 'other-user'",
    "UPDATE account SET accountId = 'other-facebook'",
  ])('does not scrub from a stale link snapshot: %s', async mutation => {
    beforeBatch = () => sqlite.exec(mutation)
    await invoke()
    expect(sqlite.prepare('SELECT name, isArchived FROM user').get()).toEqual({
      name: 'Alice',
      isArchived: 0,
    })
    expect(sqlite.prepare('SELECT * FROM session').all()).toHaveLength(1)
    if (mutation !== 'DELETE FROM account') {
      expect(sqlite.prepare('SELECT * FROM account').all()).toHaveLength(1)
    }
  })

  it.each(['session', 'account', 'facebookDeletionRequest'])(
    'rolls back every write when %s fails',
    async table => {
      sqlite.exec(`CREATE TRIGGER fail_write BEFORE ${table === 'facebookDeletionRequest' ? 'INSERT' : 'DELETE'} ON ${table}
        BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
      const before = snapshot()
      await expect(invoke()).rejects.toThrow()
      expect(snapshot()).toEqual(before)
    },
  )
})
