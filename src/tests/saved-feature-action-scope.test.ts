// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WishlistAction from '#lib/bits/patterns/cards/featureCard/components/actions/WishlistAction.svelte'
import VisitAction from '#lib/bits/patterns/cards/featureCard/components/actions/VisitAction.svelte'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

const mocks = vi.hoisted(() => ({
  app: {
    user: { id: 'old-user' },
    cacheCtx: { reconcile: vi.fn().mockResolvedValue(undefined) },
    account: {
      revision: 1,
      collections: {
        beginListEdit: () => () => {},
        state: { wishlisted: [], visited: [] },
        applyList: vi.fn(),
      },
    },
  },
  updates: vi.fn(),
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
  addUserFeatureToList: () => ({ updates: mocks.updates }),
  removeUserFeatureFromList: () => ({ updates: mocks.updates }),
  getUserFeatures: () => ({ withOverride: () => ({}) }),
}))
vi.mock(
  '#lib/bits/patterns/cards/featureCard/components/actions/WishlistActionDisplay.svelte',
  () => import('./mocks/SavedFeatureActionDisplay.svelte'),
)
vi.mock(
  '#lib/bits/patterns/cards/featureCard/components/actions/VisitActionDisplay.svelte',
  () => import('./mocks/SavedFeatureActionDisplay.svelte'),
)

beforeEach(() => vi.useRealTimers())
afterEach(() => cleanup())

describe.each([
  ['wishlist', WishlistAction],
  ['visit', VisitAction],
] as const)('%s save scope', (_name, Component) => {
  it.each(
    ['success', 'failure'].flatMap(outcome =>
      ['different-user', 'same-user-new-session'].map(change => ({ outcome, change })),
    ),
  )('does not write across $change on $outcome', async ({ outcome, change }) => {
    mocks.app.user = { id: 'old-user' }
    mocks.app.account.collections.applyList.mockClear()
    let resolve!: (value: unknown) => void
    let reject!: (reason: Error) => void
    mocks.updates.mockReturnValue(
      new Promise((res, rej) => {
        resolve = res
        reject = rej
      }),
    )
    render(Component, { feature: { id: 'old-feature' } as Feature })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mocks.app.account.collections.applyList).toHaveBeenCalledTimes(1)
    mocks.app.account.revision++
    mocks.app.user = { id: change === 'different-user' ? 'new-user' : 'old-user' }
    if (outcome === 'success') resolve({ data: null })
    else reject(new Error('Save failed'))
    await new Promise(res => setTimeout(res, 0))
    expect(mocks.app.account.collections.applyList).toHaveBeenCalledTimes(1)
  })

  it('reconciles the original feature after the card changes', async () => {
    mocks.app.user = { id: 'old-user' }
    mocks.app.account.collections.applyList.mockClear()
    let resolve!: (value: unknown) => void
    mocks.updates.mockReturnValue(
      new Promise(res => {
        resolve = res
      }),
    )
    const view = render(Component, { feature: { id: 'old-feature' } as Feature })
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await view.rerender({ feature: { id: 'new-feature' } as Feature })
    resolve({ data: null })
    await vi.waitFor(() => {
      expect(mocks.app.account.collections.applyList).toHaveBeenLastCalledWith(
        'old-feature',
        _name === 'wishlist' ? 'wishlist' : 'visited',
        null,
      )
    })
  })
})
