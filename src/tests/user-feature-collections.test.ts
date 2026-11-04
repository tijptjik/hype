import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountState } from '#lib/context/account.svelte.js'
import type { SessionUser } from '#lib/types.js'
import type { UserFeature } from '#lib/db/zod/schema/user.types.js'

/** @param id Account identity. @returns Minimal authoritative session fixture. */
const session = (id: string): SessionUser =>
  ({ id, roles: [] }) as unknown as SessionUser
/** @param featureId Saved feature. @returns Wishlist membership fixture. */
const row = (featureId: string): UserFeature =>
  ({ featureId, isWishlisted: true, isVisited: false }) as UserFeature

afterEach(() => vi.restoreAllMocks())

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

it.each(['apply', 'replace', 'mergePage'] as const)(
  'reclaims expired override snapshots during %s without dropping recent edits',
  operation => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const account = new AccountState(session('a'))
    const collections = account.collections
    for (let i = 0; i < 128; i++) collections.apply(`old-${i}`, null)
    now += 30_000
    collections.apply('recent', null)
    now += 30_000
    if (operation === 'apply') collections.apply('new', row('new'))
    if (operation === 'replace')
      collections.replace([row('old-0'), row('recent')], collections.beginRefresh())
    if (operation === 'mergePage')
      collections.mergePage(['old-0', 'recent'], [row('old-0'), row('recent')])
    // Retention is the invariant: expired tombstones must not accumulate for an account's lifetime.
    const retained = (collections as unknown as { overrides: Map<string, unknown> })
      .overrides
    expect(retained.size).toBe(operation === 'apply' ? 2 : 1)
    expect(collections.membership('recent', 'wishlist')).toBe(false)
    expect(collections.hasRecentOverride('old-0')).toBe(false)
    if (operation !== 'apply')
      expect(collections.membership('old-0', 'wishlist')).toBe(true)
  },
)

it('isolates pending list edits and prevents old releases from unlocking a new account operation', () => {
  const account = new AccountState(session('a'))
  const collections = account.collections
  const releaseOld = collections.beginListEdit('f', 'wishlist')!
  expect(collections.beginListEdit('f', 'wishlist')).toBeNull()
  const releaseVisit = collections.beginListEdit('f', 'visited')!
  const releaseOther = collections.beginListEdit('g', 'wishlist')!
  expect(releaseVisit).toBeTypeOf('function')
  expect(releaseOther).toBeTypeOf('function')
  account.syncSession(session('b'))
  const releaseNew = collections.beginListEdit('f', 'wishlist')!
  releaseOld()
  expect(collections.beginListEdit('f', 'wishlist')).toBeNull()
  releaseNew()
  releaseNew()
  const releaseNext = collections.beginListEdit('f', 'wishlist')!
  expect(releaseNext).toBeTypeOf('function')
  releaseOld()
  releaseNew()
  expect(collections.beginListEdit('f', 'wishlist')).toBeNull()
  releaseNext()
  releaseVisit()
  releaseOther()
})

it.each(['replace', 'mergePage'] as const)(
  'retains a pending removal beyond TTL during %s, then expires after settlement',
  operation => {
    let now = 1_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const collections = new AccountState(session('a')).collections
    const release = collections.beginListEdit('f', 'wishlist')!
    collections.applyList('f', 'wishlist', null)
    now += 60_001
    const refresh = () => {
      if (operation === 'replace')
        collections.replace([row('f')], collections.beginRefresh())
      else collections.mergePage(['f'], [row('f')])
    }
    refresh()
    expect(collections.membership('f', 'wishlist')).toBe(false)
    expect(collections.state.wishlisted).toEqual([])
    // The action applies its result before releasing; that result gets its own normal TTL.
    collections.applyList('f', 'wishlist', null)
    release()
    refresh()
    expect(collections.membership('f', 'wishlist')).toBe(false)
    now += 60_000
    refresh()
    expect(collections.membership('f', 'wishlist')).toBe(true)
  },
)
