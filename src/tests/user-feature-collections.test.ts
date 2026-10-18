import { describe, expect, it, vi } from 'vitest'
import { AccountState } from '#lib/context/account.svelte.js'
import type { SessionUser } from '#lib/types.js'
import type { UserFeature } from '#lib/db/zod/schema/user.types.js'

/** @param id Account identity. @returns Minimal authoritative session fixture. */
const session = (id: string): SessionUser =>
  ({ id, roles: [] }) as unknown as SessionUser
/** @param featureId Saved feature. @returns Wishlist membership fixture. */
const row = (featureId: string): UserFeature =>
  ({ featureId, isWishlisted: true, isVisited: false }) as UserFeature

describe('account feature collections', () => {
  it('rejects cross-surface and previous-account responses', () => {
    const account = new AccountState(session('a'))
    const first = account.collections.beginRefresh()
    const second = account.collections.beginRefresh()
    expect(account.collections.replace([row('old')], first)).toBe(false)
    expect(account.collections.replace([row('current')], second)).toBe(true)
    account.syncSession(session('b'))
    expect(account.collections.replace([row('old')], second)).toBe(false)
    expect(account.collections.state.wishlisted).toEqual([])
  })

  it('keeps an optimistic removal authoritative over late page and full responses', () => {
    const account = new AccountState(session('a'))
    account.collections.apply('f', row('f'))
    const generation = account.collections.beginRefresh()
    account.collections.apply('f', null)
    account.collections.replace([row('f')], generation)
    account.collections.mergePage(['f'], [row('f')])
    expect(account.collections.membership('f', 'wishlist')).toBe(false)
    expect(account.collections.state.wishlisted).toEqual([])
    expect(account.collections.membership('unknown', 'wishlist')).toBeUndefined()
  })

  it('notifies both surfaces and releases disposed subscriptions', () => {
    const account = new AccountState(session('a'))
    const app = vi.fn(),
      admin = vi.fn()
    const release = account.collections.subscribe(app)
    account.collections.subscribe(admin)
    account.collections.apply('f', row('f'))
    release()
    account.collections.apply('g', row('g'))
    expect(app).toHaveBeenCalledTimes(1)
    expect(admin).toHaveBeenCalledTimes(2)
  })
})
