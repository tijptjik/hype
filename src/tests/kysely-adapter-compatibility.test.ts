// NODE
import { DatabaseSync } from 'node:sqlite'
// AUTH
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'
// TESTING
import { expect, it } from 'vitest'

it('runs native Kysely migrations and resolves a real Better Auth session', async () => {
  const database = new DatabaseSync(':memory:')
  const baseURL = 'https://kysely-compatibility.example'
  const options = {
    database,
    baseURL,
    secret: 'isolated-kysely-compatibility-test-secret',
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
  } as const

  try {
    // Exercise the real adapter import and introspection path that previously broke on Kysely 0.29.
    const migrations = await getMigrations(options)
    expect(migrations.toBeCreated.length).toBeGreaterThan(0)
    await migrations.runMigrations()

    // Persist credentials and read the resulting session through the HTTP pipeline without adapter mocks.
    const auth = betterAuth(options)
    const response = await auth.handler(
      new Request(`${baseURL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: baseURL },
        body: JSON.stringify({
          name: 'Compatibility Test',
          email: 'probe@example.com',
          password: 'isolated-test-password-123',
        }),
      }),
    )
    expect(response.status, await response.clone().text()).toBe(200)
    const cookie = response.headers
      .getSetCookie()
      .map(value => value.split(';')[0])
      .join('; ')
    const session = await auth.handler(
      new Request(`${baseURL}/api/auth/get-session`, { headers: { cookie } }),
    )
    expect(session.status).toBe(200)
    expect((await session.json()).user.email).toBe('probe@example.com')
  } finally {
    database.close()
  }
})
