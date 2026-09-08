// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTS
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// DB
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { user, session, verification } from '$lib/db/schema/user'
// AUTH
import { getAuthForRequest } from '$lib/auth'
import { toLinkedAccountSelector } from '$lib/auth/account-selector'

// Role enrichment is unrelated to account storage; all auth persistence uses Drizzle/D1.
vi.mock('$lib/db/services/user', () => ({ getUserRoles: vi.fn(async () => []) }))

const previousMigration = readFileSync(
  'migrations/0076_better_auth_1_7_account_issuer.sql',
  'utf8',
)
const migration = readFileSync(
  'migrations/0077_better_auth_1_7_3_account_identity.sql',
  'utf8',
)
let sqlite: DatabaseSync
let serial = 0

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys = ON')
  // Use application column types and required constraints for the surrounding auth tables.
  for (const table of [user, session, verification]) {
    const config = getTableConfig(table)
    const columns = config.columns.map(
      column =>
        `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}${column.notNull ? ' NOT NULL' : ''}`,
    )
    sqlite.exec(`CREATE TABLE "${config.name}" (${columns.join(', ')})`)
  }
  // Start from the actual account DDL in the deployed migration, not a permissive mock.
  const accountDDL = previousMigration.match(
    /CREATE TABLE "account_new" \([\s\S]*?\n\);/,
  )?.[0]
  if (!accountDDL) throw new Error('Missing 0076 account DDL')
  sqlite.exec(accountDDL.replace('"account_new"', '"account"'))
  sqlite.exec(
    'CREATE UNIQUE INDEX account_issuer_accountId_uidx ON account(issuer, accountId)',
  )
})
afterEach(() => sqlite.close())

/**
 * Runs the production auth factory against SQLite through the D1 prepared-statement interface.
 * @returns The real Better Auth instance with its configured Drizzle adapter.
 */
function createAuth(): ReturnType<typeof getAuthForRequest> {
  const DB = {
    prepare(sql: string) {
      return {
        bind(...params: never[]) {
          return {
            async raw() {
              const statement = sqlite.prepare(sql)
              statement.setReturnArrays(true)
              return statement.all(...params)
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...params), success: true }
            },
            async run() {
              return { meta: sqlite.prepare(sql).run(...params), success: true }
            },
          }
        },
      }
    },
  }
  return getAuthForRequest(
    new Headers({ host: `adapter-${++serial}.example`, 'x-forwarded-proto': 'https' }),
    {
      DB: DB as never,
      AUTH_SECRET: 'integration-test-only-secret-longer-than-thirty-two-characters',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      AUTH_FACEBOOK_ID: '',
      AUTH_FACEBOOK_SECRET: '',
      AUTH_EMAIL_FROM: 'test@example.com',
      EMAIL: { send: vi.fn(async () => ({})) } as never,
    },
  )
}

describe('Better Auth production Drizzle adapter', () => {
  it('reproduces issuer failure before migration and persists credentials after migration', async () => {
    const auth = createAuth()
    const context = await auth.$context
    const created = await context.internalAdapter.createUser(
      {
        name: 'User',
        email: 'user@example.com',
        emailVerified: true,
      },
      { method: 'email-password' },
    )
    const credential = {
      userId: created.id,
      accountId: created.id,
      providerId: 'credential',
      password: 'stored-hash',
    }
    await expect(context.internalAdapter.createAccount(credential)).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM account').all()).toEqual([])
    sqlite.exec(migration)
    const saved = await context.internalAdapter.createAccount(credential)
    expect(
      sqlite.prepare('SELECT * FROM account WHERE id = ?').get(saved.id),
    ).toMatchObject({
      userId: created.id,
      providerId: 'credential',
      password: 'stored-hash',
      issuer: null,
    })
  })

  it('registers, signs in and resolves a persisted session through the real adapter', async () => {
    sqlite.exec(migration)
    const auth = createAuth()
    const body = {
      name: 'User',
      email: 'signup@example.com',
      password: 'integration-password-123',
    }
    const registered = await auth.api.signUpEmail({ body })
    expect(registered.user.email).toBe(body.email)
    const account = sqlite
      .prepare('SELECT * FROM account WHERE userId = ?')
      .get(registered.user.id)
    expect(account).toMatchObject({
      accountId: registered.user.id,
      providerId: 'credential',
      issuer: null,
    })
    expect(account?.password).not.toBe(body.password)
    // Email delivery is mocked; mark this fixture verified before exercising password verification.
    sqlite
      .prepare('UPDATE user SET emailVerified = 1 WHERE id = ?')
      .run(registered.user.id)
    const signedIn = await auth.api.signInEmail({ body, asResponse: true })
    expect(signedIn.status).toBe(200)
    const headers = new Headers({
      cookie: signedIn.headers
        .getSetCookie()
        .map(value => value.split(';')[0])
        .join('; '),
    })
    const current = await auth.api.getSession({ headers })
    expect(current?.user.id).toBe(registered.user.id)
    expect(sqlite.prepare('SELECT userId FROM session').all()).toEqual([
      expect.objectContaining({ userId: registered.user.id }),
    ])
  })

  it('unlinks only the selected local account and rejects another user’s row', async () => {
    sqlite.exec(migration)
    const auth = createAuth()
    const context = await auth.$context
    const owner = await context.internalAdapter.createUser(
      {
        name: 'Owner',
        email: 'owner@example.com',
        emailVerified: true,
      },
      { method: 'email-password' },
    )
    const other = await context.internalAdapter.createUser(
      {
        name: 'Other',
        email: 'other@example.com',
        emailVerified: true,
      },
      { method: 'email-password' },
    )
    const first = await context.internalAdapter.createAccount({
      userId: owner.id,
      providerId: 'google',
      accountId: 'shared-external-id',
    })
    const second = await context.internalAdapter.createAccount({
      userId: owner.id,
      providerId: 'facebook',
      accountId: 'shared-external-id',
    })
    const foreign = await context.internalAdapter.createAccount({
      userId: other.id,
      providerId: 'google',
      accountId: 'foreign-id',
    })
    const password = 'integration-password-123'
    const credential = await context.internalAdapter.createAccount({
      userId: owner.id,
      providerId: 'credential',
      accountId: owner.id,
      password: await context.password.hash(password),
    })
    // Obtain a real signed session through the public sign-in API.
    const signedIn = await auth.api.signInEmail({
      body: { email: owner.email, password },
      asResponse: true,
    })
    expect(signedIn.status).toBe(200)
    const headers = new Headers({
      cookie: signedIn.headers
        .getSetCookie()
        .map(value => value.split(';')[0])
        .join('; '),
    })
    await expect(
      auth.api.unlinkAccount({ headers, body: toLinkedAccountSelector(foreign) }),
    ).rejects.toThrow()
    await expect(
      auth.api.unlinkAccount({ headers, body: { accountId: first.accountId } }),
    ).rejects.toThrow()
    // With no external provider configured, the local selector must still resolve
    // the account before reaching provider lookup (rather than ACCOUNT_NOT_FOUND).
    await expect(
      auth.api.accountInfo({ headers, query: toLinkedAccountSelector(first) }),
    ).rejects.toMatchObject({ body: { code: 'PROVIDER_NOT_CONFIGURED' } })
    await auth.api.unlinkAccount({ headers, body: toLinkedAccountSelector(first) })
    expect(
      sqlite
        .prepare('SELECT id FROM account WHERE userId = ? ORDER BY id')
        .all(owner.id)
        .map(row => row.id),
    ).toEqual([second.id, credential.id].sort())
    expect(
      sqlite.prepare('SELECT id FROM account WHERE id = ?').get(foreign.id),
    ).toBeTruthy()
  })
})
