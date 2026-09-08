// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { createLocalAccountIssuer } from 'better-auth/db'
import { hashPassword } from 'better-auth/crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthForRequest } from '$lib/auth'

// Role enrichment is separate from the authoritative account-state SQL under test.
vi.mock('$lib/db/services/user', () => ({ getUserRoles: vi.fn(async () => []) }))

let sqlite: DatabaseSync
let serial = 0
let passwordHash: string
const password = 'valid-test-password-123'
beforeAll(async () => {
  passwordHash = await hashPassword(password)
})
beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec('CREATE TABLE user (id TEXT PRIMARY KEY, isArchived INTEGER NOT NULL)')
  sqlite.prepare('INSERT INTO user VALUES (?, 0)').run('user')
})
afterEach(() => sqlite.close())

/** Builds the real auth pipeline with isolated credential storage and SQLite account-state reads. */
function setup() {
  const host = `account-state-${serial++}.example`
  const baseURL = `https://${host}`
  const DB = {
    prepare: (sql: string) => ({
      bind: (...params: never[]) => ({
        raw: async () => {
          const statement = sqlite.prepare(sql)
          statement.setReturnArrays(true)
          return statement.all(...params)
        },
      }),
    }),
  }
  const runtime = getAuthForRequest(
    new Headers({ host, 'x-forwarded-proto': 'https' }),
    {
      DB: DB as never,
      AUTH_SECRET: 'long-test-auth-secret-that-is-not-production',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      AUTH_FACEBOOK_ID: '',
      AUTH_FACEBOOK_SECRET: '',
    },
  )
  const store = {
    user: [
      {
        id: 'user',
        name: 'User',
        email: 'user@example.com',
        emailVerified: true,
        isAnonymous: false,
        isArchived: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    account: [
      {
        id: 'account',
        userId: 'user',
        providerId: 'credential',
        issuer: createLocalAccountIssuer('credential'),
        accountId: 'user',
        password: passwordHash,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    session: [] as Record<string, unknown>[],
  }
  const auth = betterAuth({
    ...runtime.options,
    database: memoryAdapter(store),
    trustedOrigins: [baseURL],
    rateLimit: { enabled: false },
  })
  const signIn = () =>
    auth.api.signInEmail({
      body: { email: 'user@example.com', password },
      headers: new Headers({ origin: baseURL }),
      asResponse: true,
    })
  return { auth, store, signIn, baseURL }
}

/** Replays issued cookies without exposing their signed values in test output. */
function cookies(response: Response): Headers {
  return new Headers({
    cookie: response.headers
      .getSetCookie()
      .map(value => value.split(';')[0])
      .join('; '),
  })
}

describe('archived account session enforcement', () => {
  it('rejects new sessions for archived accounts after valid credentials', async () => {
    const { signIn, store } = setup()
    sqlite.exec('UPDATE user SET isArchived = 1')
    expect((await signIn()).status).toBe(401)
    expect(store.session).toHaveLength(0)
  })

  it('denies cached session reuse after archival even when cached user data says active', async () => {
    const { auth, signIn } = setup()
    const signedIn = await signIn()
    expect(signedIn.status).toBe(200)
    const headers = cookies(signedIn)
    expect((await auth.api.getSession({ headers, asResponse: true })).status).toBe(200)
    sqlite.exec('UPDATE user SET isArchived = 1')
    await expect(
      auth.api.getSession({ headers, asResponse: true }),
    ).rejects.toMatchObject({
      status: 'UNAUTHORIZED',
      body: { code: 'ACCOUNT_UNAVAILABLE' },
    })
  })

  it('blocks direct authenticated profile writes with a stale active-user cookie', async () => {
    const { auth, signIn, store, baseURL } = setup()
    const headers = cookies(await signIn())
    headers.set('origin', baseURL)
    sqlite.exec('UPDATE user SET isArchived = 1')
    await expect(
      auth.api.updateUser({
        headers,
        body: { name: 'Changed' },
        asResponse: true,
      }),
    ).rejects.toMatchObject({ status: 'UNAUTHORIZED' })
    expect(store.user[0].name).toBe('User')
  })

  it('allows an archived account to sign out and clear its session', async () => {
    const { auth, signIn, store, baseURL } = setup()
    const headers = cookies(await signIn())
    headers.set('origin', baseURL)
    sqlite.exec('UPDATE user SET isArchived = 1')
    expect((await auth.api.signOut({ headers, asResponse: true })).status).toBe(200)
    expect(store.session).toHaveLength(0)
  })

  it('keeps active guest sessions eligible', async () => {
    const { auth, store, signIn } = setup()
    store.user[0].isAnonymous = true
    const context = await auth.$context
    expect(await context.internalAdapter.createSession('user')).toBeTruthy()
    const result = await auth.api.getSession({ headers: cookies(await signIn()) })
    expect(result?.user).toMatchObject({ isAnonymous: true })
  })

  it('does not refresh a fresh active session during its availability check', async () => {
    const { auth, signIn, store } = setup()
    const headers = cookies(await signIn())
    const sessionsBefore = structuredClone(store.session)
    const result = await auth.api.getSession({ headers, asResponse: true })
    expect(result.status).toBe(200)
    expect(result.headers.getSetCookie()).toHaveLength(0)
    expect(store.session).toEqual(sessionsBefore)
  })

  it('denies sessions whose account disappeared', async () => {
    const { auth, signIn } = setup()
    const headers = cookies(await signIn())
    sqlite.exec('DELETE FROM user')
    await expect(
      auth.api.getSession({ headers, asResponse: true }),
    ).rejects.toMatchObject({
      status: 'UNAUTHORIZED',
    })
  })

  it('fails closed when the account-state database is unavailable', async () => {
    const { auth, signIn } = setup()
    const headers = cookies(await signIn())
    sqlite.exec('DROP TABLE user')
    await expect(auth.api.getSession({ headers, asResponse: true })).rejects.toThrow()
  })

  it('enforces archival over HTTP while keeping sign-out available', async () => {
    const { auth, signIn, store, baseURL } = setup()
    const headers = cookies(await signIn())
    headers.set('origin', baseURL)
    headers.set('content-type', 'application/json')
    const request = (path: string, body?: object) =>
      auth.handler(
        new Request(`${baseURL}/api/auth/${path}`, {
          headers,
          method: body ? 'POST' : 'GET',
          body: body ? JSON.stringify(body) : undefined,
        }),
      )
    expect((await request('get-session')).status).toBe(200)
    expect((await request('update-user', { name: 'Active' })).status).toBe(200)
    expect(store.user[0].name).toBe('Active')
    sqlite.exec('UPDATE user SET isArchived = 1')
    const denied = await request('get-session')
    expect(denied.status).toBe(401)
    expect(await denied.json()).toMatchObject({ code: 'ACCOUNT_UNAVAILABLE' })
    expect((await request('update-user', { name: 'Archived' })).status).toBe(401)
    expect(store.user[0].name).toBe('Active')
    expect((await request('sign-out', {})).status).toBe(200)
    expect(store.session).toHaveLength(0)
  })

  it('fails closed over HTTP when the account-state read fails', async () => {
    const { auth, signIn, baseURL } = setup()
    const headers = cookies(await signIn())
    sqlite.exec('DROP TABLE user')
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/get-session`, { headers }),
    )
    expect(response.status).toBe(500)
  })
})
