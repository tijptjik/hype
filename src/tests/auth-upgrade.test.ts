import { describe, expect, it } from 'vitest'
import { hasDurableAccount, isGuestUser } from '$lib/auth/upgrade'

describe('account upgrade session guards', () => {
  it('accepts only an explicit non-anonymous marker as a durable account', () => {
    expect(hasDurableAccount({ isAnonymous: false })).toBe(true)
    expect(hasDurableAccount({ isAnonymous: true })).toBe(false)
    expect(hasDurableAccount({})).toBe(false)
    expect(hasDurableAccount(null)).toBe(false)
  })

  it('continues to identify explicit anonymous sessions as guests', () => {
    expect(isGuestUser({ isAnonymous: true })).toBe(true)
    expect(isGuestUser({ isAnonymous: false })).toBe(false)
  })
})
