// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { betterAuth } from 'better-auth'
import { memoryAdapter } from 'better-auth/adapters/memory'
import { hashPassword } from 'better-auth/crypto'
import { createLocalAccountIssuer } from 'better-auth/db'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuthForRequest } from '$lib/auth'
import { POST } from '../routes/api/account/password/+server'

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
  sqlite.exec("INSERT INTO user VALUES ('user', 0)")
})
afterEach(() => {
  vi.useRealTimers()
  sqlite.close()
})

/** Builds the actual route and auth pipeline, with isolated credential and account-state stores. */
async function setup() {
  const instance = ++serial
  const baseURL = `https://password-setup-${instance}.example`
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
    new Headers({
      host: new URL(baseURL).host,
      'x-forwarded-proto': 'https',
    }),
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
        emailVerified: false,
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
    verification: [],
  }
  const hash = vi.fn(hashPassword)
  const sendVerificationEmail = vi
    .fn(runtime.options.emailVerification?.sendVerificationEmail)
    .mockResolvedValue(undefined)
  const auth = betterAuth({
    ...runtime.options,
    database: memoryAdapter(store),
    trustedOrigins: [baseURL],
    advanced: {
      ...runtime.options.advanced,
      disableOriginCheck: false,
      disableCSRFCheck: false,
    },
    emailAndPassword: {
      ...runtime.options.emailAndPassword,
      enabled: true,
      requireEmailVerification: false,
      password: { hash, verify: async () => true },
    },
    emailVerification: { sendVerificationEmail },
  })
  const signedIn = await auth.api.signInEmail({
    body: { email: store.user[0].email, password },
    headers: new Headers({ origin: baseURL }),
    asResponse: true,
  })
  expect(signedIn.status).toBe(200)
  const headers = new Headers({
    origin: baseURL,
    'content-type': 'application/json',
    'cf-connecting-ip': `192.0.2.${instance}`,
    cookie: signedIn.headers
      .getSetCookie()
      .map(value => value.split(';')[0])
      .join('; '),
  })
  // Model an upgraded social account that has a session but no password credential yet.
  store.account.length = 0
  hash.mockClear()
  const routeSession = store.session[0]
  const request = (
    body: unknown = { newPassword: password },
    direct = false,
    overrides?: Headers,
  ) => {
    const url = new URL(
      direct ? '/api/auth/account-password' : '/api/account/password',
      baseURL,
    )
    const req = new Request(url, {
      method: 'POST',
      headers: overrides ?? headers,
      body: JSON.stringify(body),
    })
    return direct
      ? auth.handler(req)
      : POST({
          request: req,
          url,
          locals: {
            auth,
            session: routeSession,
            user: store.user[0],
          },
        } as never)
  }
  return { auth, store, hash, sendVerificationEmail, headers, request, baseURL }
}

describe('account password HTTP pipeline', () => {
  it('adds the first credential without replacing an existing password', async () => {
    const { request, store, hash } = await setup()
    expect((await request()).status).toBe(200)
    expect(store.account).toHaveLength(1)
    const savedPassword = store.account[0].password
    const rejected = await request({ newPassword: 'another-valid-password' })
    expect(rejected.status).toBe(400)
    expect(await rejected.json()).toMatchObject({ message: 'PASSWORD_NOT_SET' })
    expect(store.account[0].password).toBe(savedPassword)
    expect(hash).toHaveBeenCalledTimes(1)
  })

  it('shares the five-per-minute budget across direct and delegated HTTP requests', async () => {
    const { request, hash, sendVerificationEmail, store } = await setup()
    for (let i = 0; i < 5; i++) {
      expect((await request(undefined, i % 2 === 0)).status).toBe(i === 0 ? 200 : 400)
    }
    const rejected = await request({
      newPassword: password,
      email: 'changed@example.com',
    })
    expect(rejected.status).toBe(429)
    expect(Number(rejected.headers.get('x-retry-after'))).toBeGreaterThan(0)
    expect(hash).toHaveBeenCalledTimes(1)
    expect(sendVerificationEmail).not.toHaveBeenCalled()
    expect(store.user[0].email).toBe('user@example.com')
  })

  it('enforces the budget atomically for concurrent requests', async () => {
    const { request, hash } = await setup()
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => request({ newPassword: 'short' })),
    )
    expect(responses.filter(response => response.status === 400)).toHaveLength(5)
    expect(responses.filter(response => response.status === 429)).toHaveLength(7)
    expect(hash).not.toHaveBeenCalled()
  })

  it('accepts requests again after the rate window expires', async () => {
    const { request, hash } = await setup()
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.now()
    for (let i = 0; i < 5; i++) {
      expect((await request({ newPassword: 'short' })).status).toBe(400)
    }
    expect((await request()).status).toBe(429)
    vi.setSystemTime(now + 61_000)
    expect((await request()).status).toBe(200)
    expect(hash).toHaveBeenCalledOnce()
  })

  it('forwards refreshed session cookies after changing an unverified login email', async () => {
    const { request, store, sendVerificationEmail } = await setup()
    const response = await request({
      newPassword: password,
      email: 'changed@example.com',
    })
    expect(response.status).toBe(200)
    expect(store.user[0].email).toBe('changed@example.com')
    expect(store.user[0].emailVerified).toBe(false)
    expect(sendVerificationEmail).toHaveBeenCalledOnce()
    expect(
      response.headers
        .getSetCookie()
        .filter(cookie => cookie.includes('session_data=')),
    ).toHaveLength(1)
  })

  it('does not hash or create a credential when email change fails', async () => {
    const { request, store, hash } = await setup()
    expect(
      (await request({ newPassword: password, email: 'invalid-email' })).status,
    ).toBe(400)
    expect(store.account).toHaveLength(0)
    expect(hash).not.toHaveBeenCalled()
  })

  it('does not create a password when the requested email belongs to another account', async () => {
    const { request, store, hash } = await setup()
    store.user.push({ ...store.user[0], id: 'other', email: 'taken@example.com' })
    const response = await request({
      newPassword: password,
      email: 'taken@example.com',
    })
    expect(response.status).toBe(400)
    expect(store.user[0].email).toBe('user@example.com')
    expect(store.account).toHaveLength(0)
    expect(hash).not.toHaveBeenCalled()
  })

  it('does not create a password before a verified account completes its email change', async () => {
    const { request, store, hash, sendVerificationEmail, auth } = await setup()
    store.user[0].emailVerified = true
    const response = await request({
      newPassword: password,
      email: 'pending@example.com',
    })
    expect(response.status).toBe(400)
    expect(sendVerificationEmail).toHaveBeenCalledOnce()
    expect(store.user[0].email).toBe('user@example.com')
    expect(store.account).toHaveLength(0)
    expect(hash).not.toHaveBeenCalled()
    // Complete the real verification callback, then retry with the original session cookie.
    const verification = await auth.handler(
      new Request(sendVerificationEmail.mock.calls[0][0].url),
    )
    expect(verification.status).toBe(302)
    expect(store.user[0].email).toBe('pending@example.com')
    expect(
      (await request({ newPassword: password, email: 'pending@example.com' })).status,
    ).toBe(200)
    expect(store.account).toHaveLength(1)
    expect(hash).toHaveBeenCalledOnce()
  })

  it.each(['short', 'x'.repeat(129)])(
    'does not change email when the password has invalid length',
    async newPassword => {
      const { request, store, hash, sendVerificationEmail } = await setup()
      expect(
        (await request({ newPassword, email: 'changed@example.com' })).status,
      ).toBe(400)
      expect(store.user[0].email).toBe('user@example.com')
      expect(sendVerificationEmail).not.toHaveBeenCalled()
      expect(store.account).toHaveLength(0)
      expect(hash).not.toHaveBeenCalled()
    },
  )

  it('does not change email when a password already exists', async () => {
    const { request, store, sendVerificationEmail } = await setup()
    expect((await request()).status).toBe(200)
    expect(
      (await request({ newPassword: password, email: 'changed@example.com' })).status,
    ).toBe(400)
    expect(store.user[0].email).toBe('user@example.com')
    expect(sendVerificationEmail).not.toHaveBeenCalled()
  })

  it('does not create a credential when the email-change database write fails', async () => {
    const { request, store, hash, auth } = await setup()
    const context = await auth.$context
    vi.spyOn(context.internalAdapter, 'updateUser').mockRejectedValueOnce(
      new Error('Database unavailable'),
    )
    const response = await request({
      newPassword: password,
      email: 'changed@example.com',
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(store.account).toHaveLength(0)
    expect(hash).not.toHaveBeenCalled()
  })

  it('rejects archived accounts before credential work', async () => {
    const { request, hash } = await setup()
    sqlite.exec('UPDATE user SET isArchived = 1')
    expect((await request()).status).toBe(401)
    expect(hash).not.toHaveBeenCalled()
  })

  it('requires a fresh authoritative session for password setup', async () => {
    const { request, store, hash } = await setup()
    store.session[0].createdAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    expect((await request()).status).toBe(403)
    expect(hash).not.toHaveBeenCalled()
  })

  it('rejects guests even when they call the auth endpoint directly', async () => {
    const { request, store, hash } = await setup()
    store.user[0].isAnonymous = true
    const response = await request(undefined, true)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ message: 'ACCOUNT_REQUIRED' })
    expect(hash).not.toHaveBeenCalled()
    await expect(request()).rejects.toMatchObject({ status: 403 })
  })

  it('rejects missing or revoked sessions without trusting stale route locals', async () => {
    const { request, store, hash } = await setup()
    store.session.length = 0
    expect((await request(undefined, true)).status).toBe(401)
    expect((await request()).status).toBe(401)
    expect(hash).not.toHaveBeenCalled()
  })

  it.each([null, 'https://attacker.example'])(
    'rejects invalid origins on both HTTP entry points: %s',
    async origin => {
      const { request, headers, hash } = await setup()
      const forged = new Headers(headers)
      if (origin) forged.set('origin', origin)
      else forged.delete('origin')
      expect((await request(undefined, true, forged)).status).toBe(403)
      await expect(request(undefined, false, forged)).rejects.toMatchObject({
        status: 403,
      })
      expect(hash).not.toHaveBeenCalled()
    },
  )
})
