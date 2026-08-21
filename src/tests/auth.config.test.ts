import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
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

describe('Better Auth 1.7 account identity', () => {
  it('stores issuer-scoped identities with a unique account key', () => {
    expect(getTableColumns(account).issuer.notNull).toBe(true)

    expect(
      getTableConfig(account).indexes.some(
        index =>
          index.config.name === 'account_issuer_accountId_uidx' &&
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
