// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
// TESTS
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
// DRIZZLE
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
// AUTH
import { getAuthForRequest } from '#lib/auth.js'
import { claimBreadlineUser } from '#lib/auth/breadline-claim.server.js'
// SCHEMA
import {
  user,
  account,
  session,
  verification,
  passkey,
  breadlineImportUser,
  breadlineImportIdentity,
} from '#lib/db/schema/user.js'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

vi.mock('#lib/db/services/user.js', () => ({ getUserRoles: vi.fn(async () => []) }))
let sqlite: DatabaseSync
let ddl: string[]
let serial = 0
beforeAll(async () => {
  const current = await generateSQLiteDrizzleJson({
    user,
    account,
    session,
    verification,
    passkey,
    breadlineImportUser,
    breadlineImportIdentity,
  })
  const empty = structuredClone(current)
  empty.tables = {}
  ddl = await generateSQLiteMigration(empty, current)
})
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('PRAGMA foreign_keys=ON')
  for (const statement of ddl) sqlite.exec(statement)
  sqlite
    .prepare(
      `INSERT INTO user (id, username, telephone, isArchived, isAnonymous, createdAt, updatedAt) VALUES ('latent', 'latent-runner', '+85291234567', 0, 0, 1, 1)`,
    )
    .run()
  sqlite
    .prepare(
      `INSERT INTO breadlineImportUser (userId, telephone, state) VALUES ('latent', '+85291234567', 'unclaimed')`,
    )
    .run()
  for (const [id, email] of [
    [1, 'first@example.com'],
    [2, 'second@example.com'],
  ] as const)
    sqlite
      .prepare(
        'INSERT INTO breadlineImportIdentity (sourceUserId, sourceVolunteerId, userId, email) VALUES (?, ?, ?, ?)',
      )
      .run(id, id * 10, 'latent', email)
})
afterEach(() => sqlite.close())

/**
 * Provide the real D1 prepare/batch contract over SQLite, including atomic rollback.
 * @returns A D1-shaped fixture used by the production auth factory and claim service.
 */
function database(): D1Database {
  let queued = Promise.resolve()
  const prepare = (sql: string, values: unknown[] = []) => ({
    sql,
    values,
    bind(...parameters: unknown[]) {
      return prepare(sql, parameters)
    },
    async all() {
      const rows = sqlite.prepare(sql).all(...(values as never[]))
      const changes = (sqlite.prepare('SELECT changes() AS n').get() as { n: number }).n
      return { success: true, results: rows, meta: { changes } }
    },
    async first() {
      return sqlite.prepare(sql).get(...(values as never[])) ?? null
    },
    async run() {
      return this.all()
    },
    async raw() {
      const statement = sqlite.prepare(sql)
      statement.setReturnArrays(true)
      return statement.all(...(values as never[]))
    },
  })
  return {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      const previous = queued
      let release = (): void => {}
      queued = new Promise<void>(resolve => {
        release = resolve
      })
      await previous
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.all())
        sqlite.exec('COMMIT')
        return results
      } catch (cause) {
        sqlite.exec('ROLLBACK')
        throw cause
      } finally {
        release()
      }
    },
  } as unknown as D1Database
}

/**
 * Build production auth with provider verification replaced only at the external trust boundary.
 * @returns Real HTTP/API handlers, SQLite persistence, delivery capture and social login helper.
 */
async function setup() {
  const host = `breadline-claim-${serial++}.example`
  const origin = `https://${host}`
  const send = vi.fn(async (_message: unknown) => ({}))
  const DB = database()
  const auth = getAuthForRequest(new Headers({ host, 'x-forwarded-proto': 'https' }), {
    DB,
    AUTH_SECRET: 'integration-only-secret-that-is-longer-than-thirty-two-characters',
    AUTH_GOOGLE_ID: 'test-client',
    AUTH_GOOGLE_SECRET: 'test-secret',
    AUTH_FACEBOOK_ID: '',
    AUTH_FACEBOOK_SECRET: '',
    AUTH_EMAIL_FROM: 'sender@example.com',
    EMAIL: { send } as never,
  })
  const context = await auth.$context
  const google = context.socialProviders.find(provider => provider.id === 'google')
  if (!google) throw new Error('Missing Google provider fixture')
  google.idToken = { verify: async () => true }
  google.getUserInfo = async token => {
    const second = token.idToken === 'second'
    return {
      user: {
        email: second ? 'second@example.com' : 'first@example.com',
        emailVerified: token.idToken !== 'unverified',
        name: 'Verified runner',
      },
      data: { sub: second ? 'subject-second' : 'subject-first' },
    }
  }
  const social = (token = 'first') =>
    auth.api.signInSocial({
      body: { provider: 'google', idToken: { token } },
      asResponse: true,
    })
  return { auth, social, send, origin, DB }
}

/** @returns The ownership row without exposing credentials or delivery tokens. */
function ownership() {
  return sqlite
    .prepare('SELECT userId, state, claimedEmail, claimedAt FROM breadlineImportUser')
    .get()
}

/** @param response Auth response. @returns Only session cookies for a follow-up request. */
function cookies(response: Response): Headers {
  return new Headers({
    cookie: response.headers
      .getSetCookie()
      .map(value => value.split(';')[0])
      .join('; '),
  })
}

describe('Breadline first verified login', () => {
  it('claims the existing user ID with one proven provider and resolves its real session', async () => {
    const { auth, social } = await setup()
    const response = await social()
    expect(response.status).toBe(200)
    expect(await response.clone().json()).toMatchObject({
      user: { id: 'latent', email: 'first@example.com' },
    })
    expect(ownership()).toMatchObject({
      state: 'claimed',
      claimedEmail: 'first@example.com',
    })
    expect(sqlite.prepare('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 })
    expect(
      sqlite.prepare('SELECT userId, providerId, accountId FROM account').all(),
    ).toEqual([{ userId: 'latent', providerId: 'google', accountId: 'subject-first' }])
    expect(
      sqlite
        .prepare(
          'SELECT sourceVolunteerId, userId FROM breadlineImportIdentity ORDER BY sourceUserId',
        )
        .all(),
    ).toEqual([
      { sourceVolunteerId: 10, userId: 'latent' },
      { sourceVolunteerId: 20, userId: 'latent' },
    ])
    const current = await auth.api.getSession({ headers: cookies(response) })
    expect(current?.user.id).toBe('latent')
  })
  it('claims email-only history without manufacturing a phone number', async () => {
    sqlite.exec(
      "UPDATE user SET telephone=NULL WHERE id='latent'; UPDATE breadlineImportUser SET telephone=NULL WHERE userId='latent'",
    )
    const { auth, social } = await setup()
    const response = await social()
    expect(response.status).toBe(200)
    expect((await response.json()).user.id).toBe('latent')
    expect(ownership()).toMatchObject({ state: 'claimed' })
    expect(
      sqlite
        .prepare("SELECT telephone FROM breadlineImportUser WHERE userId='latent'")
        .get(),
    ).toMatchObject({ telephone: null })
    expect(
      (await auth.api.getSession({ headers: cookies(response) }))?.user.telephone,
    ).toBeNull()
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS n FROM breadlineImportIdentity WHERE userId='latent'",
        )
        .get(),
    ).toEqual({ n: 2 })
  })
  it('never lets a losing candidate acquire the imported user or reopen it on retry', async () => {
    const { social } = await setup()
    expect((await social()).status).toBe(200)
    const loser = await social('second')
    expect(loser.status).toBe(200)
    expect((await loser.json()).user.id).not.toBe('latent')
    expect((await (await social()).json()).user.id).toBe('latent')
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM account WHERE userId='latent'").get(),
    ).toEqual({ n: 1 })
    expect(ownership()).toMatchObject({
      state: 'claimed',
      claimedEmail: 'first@example.com',
    })
  })
  it('rejects an unverified provider and typed password signup without consuming eligibility', async () => {
    const { auth, social, send } = await setup()
    expect((await social('unverified')).status).toBe(403)
    const response = await auth.api.signUpEmail({
      body: {
        email: 'first@example.com',
        password: 'long-test-password',
        name: 'Typed name',
      },
      asResponse: true,
    })
    // Verified-email signup deliberately returns an opaque success to prevent enumeration.
    expect(response.status).toBe(200)
    expect(send).toHaveBeenCalledOnce()
    expect(ownership()).toMatchObject({ state: 'unclaimed', claimedEmail: null })
    expect(sqlite.prepare('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 })
  })
  it('permits only one concurrent winner and keeps the losing credential off the imported user', async () => {
    const { social } = await setup()
    const results = await Promise.all([social(), social('second')])
    const bodies = await Promise.all(results.map(response => response.json()))
    expect(bodies.filter(body => body.user?.id === 'latent')).toHaveLength(1)
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM account WHERE userId='latent'").get(),
    ).toEqual({ n: 1 })
    expect(ownership()).toMatchObject({ state: 'claimed' })
  })
  it('serializes stale concurrent proofs with one ownership winner, rather than a partial batch', async () => {
    const { DB } = await setup()
    const attempt = (email: string, accountId: string) =>
      claimBreadlineUser(
        DB,
        {
          userId: 'latent',
          email,
          name: 'Runner',
          image: null,
          method: 'oauth',
          providerId: 'google',
          accountId,
        },
        { userId: 'latent', providerId: 'google', accountId },
      )
    const results = await Promise.allSettled([
      attempt('first@example.com', 'first'),
      attempt('second@example.com', 'second'),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const loser = results.find(result => result.status === 'rejected')
    if (loser?.status !== 'rejected') throw new Error('Missing losing claim')
    expect(loser.reason).toMatchObject({
      body: { code: 'BREADLINE_CLAIM_UNAVAILABLE' },
    })
    expect(
      sqlite.prepare("SELECT accountId FROM account WHERE userId='latent'").all(),
    ).toEqual([{ accountId: 'first' }])
  })
  it('allows the claimed owner to explicitly link another eligible social identity', async () => {
    const { auth, social } = await setup()
    const winner = await social()
    const linked = await auth.api.linkSocialAccount({
      body: { provider: 'google', idToken: { token: 'second' } },
      headers: cookies(winner),
      asResponse: true,
    })
    expect(linked.status).toBe(200)
    expect(
      sqlite.prepare("SELECT count(*) AS n FROM account WHERE userId='latent'").get(),
    ).toEqual({ n: 2 })
    expect((await (await social('second')).json()).user.id).toBe('latent')
    expect(ownership()).toMatchObject({ claimedEmail: 'first@example.com' })
  })
  it('does not let a profile email edit reserve a latent candidate', async () => {
    const { auth } = await setup()
    sqlite.exec(
      "INSERT INTO user (id,email,isArchived,isAnonymous,createdAt,updatedAt) VALUES ('other','other@example.com',0,0,1,1)",
    )
    const context = await auth.$context
    await expect(
      context.internalAdapter.updateUser('other', { email: 'first@example.com' }),
    ).rejects.toMatchObject({ body: { code: 'BREADLINE_EMAIL_VERIFICATION_REQUIRED' } })
    expect(sqlite.prepare("SELECT email FROM user WHERE id='other'").get()).toEqual({
      email: 'other@example.com',
    })
    expect(ownership()).toMatchObject({ state: 'unclaimed' })
  })
  it('rejects an archived latent target without provisioning a replacement identity', async () => {
    const { social } = await setup()
    sqlite.exec("UPDATE user SET isArchived=1 WHERE id='latent'")
    expect((await social()).status).toBe(403)
    expect(ownership()).toMatchObject({ state: 'unclaimed' })
    expect(sqlite.prepare('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 })
  })
  it('rolls back the claim when credential insertion fails, then permits a clean retry', async () => {
    const { DB } = await setup()
    sqlite.exec(`INSERT INTO user (id, isArchived, isAnonymous, createdAt, updatedAt) VALUES ('other',0,0,1,1);
      INSERT INTO account (id,userId,providerId,accountId,createdAt,updatedAt) VALUES ('existing','other','google','occupied',1,1)`)
    const proof = {
      userId: 'latent',
      email: 'first@example.com',
      name: 'Runner',
      image: null,
      method: 'oauth' as const,
      providerId: 'google',
      accountId: 'occupied',
    }
    await expect(
      claimBreadlineUser(DB, proof, {
        userId: 'latent',
        providerId: 'google',
        accountId: 'occupied',
      }),
    ).rejects.toThrow()
    expect(ownership()).toMatchObject({
      state: 'unclaimed',
      claimedEmail: null,
      claimedAt: null,
    })
    expect(sqlite.prepare("SELECT email FROM user WHERE id='latent'").get()).toEqual({
      email: null,
    })
    await claimBreadlineUser(
      DB,
      { ...proof, accountId: 'free' },
      {
        userId: 'latent',
        providerId: 'google',
        accountId: 'free',
      },
    )
    expect(ownership()).toMatchObject({ state: 'claimed' })
  })
  it('claims via a delivered one-time email link, never from the request alone', async () => {
    const { auth, send, origin } = await setup()
    const request = await auth.api.signInMagicLink({
      body: { email: 'second@example.com', callbackURL: '/' },
      headers: new Headers({ origin }),
      asResponse: true,
    })
    expect(request.status).toBe(200)
    expect(ownership()).toMatchObject({ state: 'unclaimed' })
    const message = send.mock.calls[0][0] as { text: string }
    const link = message.text.match(/^Sign in: (.+)$/m)?.[1]
    if (!link) throw new Error('No sign-in link in captured email')
    const verified = await auth.handler(new Request(link))
    expect(verified.status).toBe(302)
    expect(ownership()).toMatchObject({
      state: 'claimed',
      claimedEmail: 'second@example.com',
    })
    expect(sqlite.prepare('SELECT count(*) AS n FROM account').get()).toEqual({ n: 0 })
    expect((await auth.api.getSession({ headers: cookies(verified) }))?.user.id).toBe(
      'latent',
    )
    const repeated = await auth.handler(new Request(link))
    expect(repeated.headers.get('location')).toContain('INVALID_TOKEN')
  })
  it('rejects expired email links without consuming a latent user', async () => {
    const { auth, send, origin } = await setup()
    await auth.api.signInMagicLink({
      body: { email: 'first@example.com', callbackURL: '/' },
      headers: new Headers({ origin }),
    })
    const message = send.mock.calls[0][0] as { text: string }
    const link = message.text.match(/^Sign in: (.+)$/m)?.[1]
    if (!link) throw new Error('No sign-in link in captured email')
    sqlite.exec('UPDATE verification SET expiresAt=0')
    const response = await auth.handler(new Request(link))
    expect(response.headers.get('location')).toContain('INVALID_TOKEN')
    expect(ownership()).toMatchObject({ state: 'unclaimed' })
  })
  it('denies cached sessions when ownership is unclaimed or the user is archived', async () => {
    const { auth, social } = await setup()
    const signedIn = await social()
    const headers = cookies(signedIn)
    expect((await auth.api.getSession({ headers }))?.user.id).toBe('latent')
    sqlite.exec("UPDATE breadlineImportUser SET state='unclaimed', claimedEmail=NULL")
    await expect(auth.api.getSession({ headers })).rejects.toMatchObject({
      statusCode: 401,
    })
    sqlite.exec(
      "UPDATE breadlineImportUser SET state='claimed', claimedEmail='first@example.com'; UPDATE user SET isArchived=1 WHERE id='latent'",
    )
    await expect(auth.api.getSession({ headers })).rejects.toMatchObject({
      statusCode: 401,
    })
  })
})
