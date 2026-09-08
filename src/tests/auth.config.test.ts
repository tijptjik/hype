import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import { parseUserInput, parseUserOutput } from 'better-auth/db'
import { getAuthForRequest } from '$lib/auth'
import { authConfig } from '$lib/auth/config'
import { account, user } from '$lib/db/schema/user'
import type { D1Database as MiniflareD1Database } from '@miniflare/d1'

describe('authConfig user.additionalFields', () => {
  it('only persists fields that exist on the user table', () => {
    const userColumnNames = new Set(Object.keys(getTableColumns(user)))
    const additionalFieldNames = Object.keys(authConfig.user.additionalFields)

    expect(
      additionalFieldNames.every(fieldName => userColumnNames.has(fieldName)),
    ).toBe(true)
  })
})

describe('server-owned account state', () => {
  /** Returns the real merged runtime options, including anonymous-plugin field overrides. */
  function runtimeOptions() {
    return getAuthForRequest(
      new Headers({ host: 'localhost:5173', 'x-forwarded-proto': 'http' }),
      {
        DB: {} as MiniflareD1Database,
        AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
        AUTH_GOOGLE_ID: '',
        AUTH_GOOGLE_SECRET: '',
        AUTH_FACEBOOK_ID: '',
        AUTH_FACEBOOK_SECRET: '',
      },
    ).options
  }

  it.each(['isArchived', 'isAnonymous'] as const)(
    'does not accept client-controlled %s in profile updates',
    field => {
      for (const options of [runtimeOptions(), authConfig]) {
        expect(
          parseUserInput(
            options,
            { [field]: false, attribution: 'Updated credit' },
            'update',
          ),
        ).toEqual({ attribution: 'Updated credit' })
        expect(() => parseUserInput(options, { [field]: true }, 'update')).toThrow()
      }
    },
  )

  it('uses server defaults for account state during sign-up', () => {
    for (const options of [authConfig, runtimeOptions()]) {
      expect(
        parseUserInput(options, { isArchived: true, isAnonymous: true }, 'create'),
      ).toMatchObject({ isArchived: false, isAnonymous: false })
    }
  })

  it('still returns server-maintained flags and accepts ordinary profile settings', () => {
    const options = runtimeOptions()
    const user = {
      id: 'user',
      name: 'User',
      email: 'user@example.com',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      isArchived: true,
      isAnonymous: true,
    }
    expect(parseUserOutput(options, user)).toMatchObject({
      id: 'user',
      isArchived: true,
      isAnonymous: true,
    })
    expect(
      parseUserInput(options, { locale: 'zh-hant', attribution: 'Credit' }, 'update'),
    ).toEqual({ locale: 'zh-hant', attribution: 'Credit' })
  })
})

describe('Better Auth 1.7 account identity', () => {
  it('retains optional legacy issuers and uniquely scopes accounts by provider', () => {
    expect(getTableColumns(account).issuer.notNull).toBe(false)

    expect(
      getTableConfig(account).indexes.some(
        index =>
          index.config.name === 'account_providerId_accountId_uidx' &&
          index.config.unique === true,
      ),
    ).toBe(true)
  })
})

describe('authConfig embedded sessions', () => {
  it('permits secure guest-session cookies in cross-site iframes', () => {
    expect(authConfig.advanced.defaultCookieAttributes).toMatchObject({
      sameSite: 'none',
      secure: true,
      partitioned: true,
    })
  })
})

describe('authConfig session cache', () => {
  it('caches the session payload for a bounded interval', () => {
    expect(authConfig.session.cookieCache).toMatchObject({
      enabled: true,
      maxAge: 5 * 60,
    })
  })
})

describe('authConfig account.accountLinking', () => {
  it('allows accounts with a different email address to be linked', () => {
    expect(authConfig.account.accountLinking.allowDifferentEmails).toBe(true)
  })

  it('trusts Facebook for verified-account linking', () => {
    expect(authConfig.account.accountLinking.trustedProviders).toContain('facebook')
  })
})

describe('authConfig user.changeEmail', () => {
  it('stores an email supplied during passkey sign-up without verifying it', () => {
    expect(authConfig.user.changeEmail.updateEmailWithoutVerification).toBe(true)
  })
})

describe('OAuth callback errors', () => {
  it('returns to the local sign-in route when callback state cannot be recovered', () => {
    const auth = getAuthForRequest(
      new Headers({
        host: 'localhost:5173',
        'x-forwarded-proto': 'http',
      }),
      {
        DB: {} as MiniflareD1Database,
        AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
        AUTH_GOOGLE_ID: '',
        AUTH_GOOGLE_SECRET: '',
        AUTH_FACEBOOK_ID: '',
        AUTH_FACEBOOK_SECRET: '',
      },
    )

    expect(auth.options.onAPIError?.errorURL).toBe('http://localhost:5173/signin')
  })
})

describe('auth instance configuration', () => {
  it('preserves embedded-session cookie attributes alongside request IP settings', () => {
    const auth = getAuthForRequest(
      new Headers({
        host: 'localhost:5173',
        'x-forwarded-proto': 'http',
      }),
      {
        DB: {} as MiniflareD1Database,
        AUTH_SECRET: 'test-secret-that-is-long-enough-for-better-auth',
        AUTH_GOOGLE_ID: '',
        AUTH_GOOGLE_SECRET: '',
        AUTH_FACEBOOK_ID: '',
        AUTH_FACEBOOK_SECRET: '',
      },
    )

    expect(auth.options.advanced?.defaultCookieAttributes).toMatchObject({
      sameSite: 'none',
      secure: true,
      partitioned: true,
    })
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([
      'cf-connecting-ip',
    ])
  })
})
