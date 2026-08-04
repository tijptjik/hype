import { describe, expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
import { authConfig } from '$lib/auth/config'
import { user } from '$lib/db/schema/user'

describe('authConfig user.additionalFields', () => {
  it('only persists fields that exist on the user table', () => {
    const userColumnNames = new Set(Object.keys(getTableColumns(user)))
    const additionalFieldNames = Object.keys(authConfig.user.additionalFields)

    expect(
      additionalFieldNames.every(fieldName => userColumnNames.has(fieldName)),
    ).toBe(true)
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
