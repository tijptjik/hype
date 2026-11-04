// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import { UserFeatureCollections } from '#lib/context/userFeatureCollections.svelte.js'
import WishlistAction from '#lib/bits/patterns/cards/featureCard/components/actions/WishlistAction.svelte'
import VisitAction from '#lib/bits/patterns/cards/featureCard/components/actions/VisitAction.svelte'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { UserFeature } from '#lib/db/zod/schema/user.types.js'

const mocks = vi.hoisted(() => ({
  app: {} as any,
  save: vi.fn(),
  overrides: [] as Array<(value: { data: UserFeature[] }) => { data: UserFeature[] }>,
}))
vi.mock('#lib/context/resourceView.svelte.js', () => ({
  getSurfaceCtx: () => mocks.app,
}))
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('#lib/i18n.js', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
  toDateFnsLocale: () => undefined,
}))
vi.mock('#lib/api/user.remote.js', () => ({
  addUserFeatureToList: (input: unknown) => ({ updates: () => mocks.save(input) }),
  removeUserFeatureFromList: (input: unknown) => ({ updates: () => mocks.save(input) }),
  getUserFeatures: () => ({
    withOverride: (
      override: (value: { data: UserFeature[] }) => { data: UserFeature[] },
    ) => {
      mocks.overrides.push(override)
      return {}
    },
  }),
}))
vi.mock(
  '#lib/bits/patterns/cards/featureCard/components/actions/WishlistActionDisplay.svelte',
  () => import('./mocks/SavedFeatureActionDisplay.svelte'),
)
vi.mock(
  '#lib/bits/patterns/cards/featureCard/components/actions/VisitActionDisplay.svelte',
  () => import('./mocks/SavedFeatureActionDisplay.svelte'),
)
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it.each(
  ['wishlist', 'visited'].flatMap(first =>
    [false, true].flatMap(fails =>
      [false, true].map(removing => ({ first, fails, removing })),
    ),
  ),
)(
  'preserves the other pending list when $first settles (failure: $fails, removal: $removing)',
  async ({ first, fails, removing }) => {
    vi.useRealTimers()
    const collections = new UserFeatureCollections()
    mocks.app = {
      user: { id: 'user' },
      account: { revision: 1, collections },
      cacheCtx: { reconcile: vi.fn().mockResolvedValue(undefined) },
    }
    const pending = new Map<
      string,
      { resolve: (value: unknown) => void; reject: (error: Error) => void }
    >()
    mocks.save.mockImplementation(
      ({ list }: { list: string }) =>
        new Promise((resolve, reject) => pending.set(list, { resolve, reject })),
    )
    const feature = { id: 'feature' } as Feature
    if (removing)
      collections.apply(feature.id, {
        featureId: feature.id,
        isWishlisted: true,
        isVisited: true,
        visitedAt: new Date().toISOString(),
      } as UserFeature)
    const wishlist = render(WishlistAction, { feature })
    const visited = render(VisitAction, { feature })
    await fireEvent.click(wishlist.container.querySelector('button')!)
    await fireEvent.click(visited.container.querySelector('button')!)
    expect(collections.membership(feature.id, 'wishlist')).toBe(!removing)
    expect(collections.membership(feature.id, 'visited')).toBe(!removing)
    const response = {
      featureId: feature.id,
      isWishlisted: (first === 'wishlist') !== removing,
      isVisited: (first === 'visited') !== removing,
      visitedAt: first === 'visited' ? new Date().toISOString() : null,
    } as UserFeature
    if (fails) pending.get(first)!.reject(new Error('save failed'))
    else pending.get(first)!.resolve({ data: response })
    await new Promise(resolve => setTimeout(resolve, 0))
    const other = first === 'wishlist' ? 'visited' : 'wishlist'
    expect(collections.membership(feature.id, other)).toBe(!removing)
    expect(collections.membership(feature.id, first as 'wishlist' | 'visited')).toBe(
      fails ? removing : !removing,
    )
    pending.get(other)!.resolve({
      data: {
        ...response,
        isWishlisted: (other === 'wishlist') !== removing,
        isVisited: (other === 'visited') !== removing,
      },
    })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(collections.membership(feature.id, other)).toBe(!removing)
    expect(collections.membership(feature.id, first as 'wishlist' | 'visited')).toBe(
      fails ? removing : !removing,
    )
  },
)

// Native query overrides are re-evaluated against the latest payload while commands are pending.
it.each(
  (
    [
      ['wishlist', WishlistAction],
      ['visited', VisitAction],
    ] as const
  ).flatMap(([list, Component]) =>
    [false, true].map(removing => ({ list, Component, removing })),
  ),
)(
  '$list override preserves newer membership from the query payload (removal: $removing)',
  async ({ list, Component, removing }) => {
    vi.useRealTimers()
    mocks.overrides = []
    mocks.app = {
      user: { id: 'user' },
      account: { revision: 1, collections: new UserFeatureCollections() },
      cacheCtx: { reconcile: vi.fn().mockResolvedValue(undefined) },
    }
    mocks.save.mockResolvedValue({ data: null })
    const feature = { id: 'feature' } as Feature
    if (removing)
      mocks.app.account.collections.apply(feature.id, {
        featureId: feature.id,
        isWishlisted: true,
        isVisited: true,
        visitedAt: '2026-11-03T00:00:00.000Z',
      } as UserFeature)
    const view = render(Component, { feature })
    await fireEvent.click(view.container.querySelector('button')!)
    const newer = {
      featureId: feature.id,
      isWishlisted: !removing,
      isVisited: !removing,
      visitedAt: removing ? null : '2026-11-04T00:00:00.000Z',
    } as UserFeature
    const result = mocks.overrides[0]({ data: [newer] }).data[0]
    expect(result.isWishlisted).toBe(!removing)
    expect(result.isVisited).toBe(!removing)
    if (list === 'wishlist') expect(result.visitedAt).toBe(newer.visitedAt)
  },
)

it.each(
  (
    [
      ['wishlist', WishlistAction],
      ['visited', VisitAction],
    ] as const
  ).flatMap(([list, Component]) =>
    [false, true].map(fails => ({ list, Component, fails })),
  ),
)(
  'prevents overlapping $list writes from separate cards and releases after settlement (failure: $fails)',
  async ({ list, Component, fails }) => {
    vi.useRealTimers()
    const collections = new UserFeatureCollections()
    mocks.app = {
      user: { id: 'user' },
      account: { revision: 1, collections },
      cacheCtx: { reconcile: vi.fn().mockResolvedValue(undefined) },
    }
    let resolve!: (value: unknown) => void, reject!: (error: Error) => void
    mocks.save.mockImplementation(
      () =>
        new Promise((res, rej) => {
          resolve = res
          reject = rej
        }),
    )
    const feature = { id: 'feature' } as Feature
    const first = render(Component, { feature })
    const second = render(Component, { feature })
    await fireEvent.click(first.container.querySelector('button')!)
    first.unmount()
    await fireEvent.click(second.container.querySelector('button')!)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    if (fails) reject(new Error('save failed'))
    else
      resolve({
        data: {
          featureId: feature.id,
          isWishlisted: list === 'wishlist',
          isVisited: list === 'visited',
          visitedAt: new Date().toISOString(),
        },
      })
    await new Promise(done => setTimeout(done, 0))
    mocks.save.mockResolvedValue({ data: null })
    await fireEvent.click(second.container.querySelector('button')!)
    expect(mocks.save).toHaveBeenCalledTimes(2)
  },
)
