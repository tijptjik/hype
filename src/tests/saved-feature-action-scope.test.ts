import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WishlistAction from '$lib/bits/patterns/cards/featureCard/components/actions/WishlistAction.svelte'
import VisitAction from '$lib/bits/patterns/cards/featureCard/components/actions/VisitAction.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'

const mocks = vi.hoisted(() => ({
  app: {
    user: { id: 'old-user' },
    getWishlistUserFeatures: () => [],
    getVisitedUserFeatures: () => [],
    applyUserFeatureState: vi.fn(),
  },
  updates: vi.fn(),
}))

vi.mock('$lib/context/app.svelte', () => ({ getAppCtx: () => mocks.app }))
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('$lib/i18n', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
  toDateFnsLocale: () => undefined,
}))
vi.mock('$lib/api/server/user.remote', () => ({
  addUserFeatureToList: () => ({ updates: mocks.updates }),
  removeUserFeatureFromList: () => ({ updates: mocks.updates }),
  getUserFeatures: () => ({ withOverride: () => ({}) }),
}))
vi.mock(
  '$lib/bits/patterns/cards/featureCard/components/actions/WishlistActionDisplay.svelte',
  () => import('./mocks/SavedFeatureActionDisplay.svelte'),
)
vi.mock(
  '$lib/bits/patterns/cards/featureCard/components/actions/VisitActionDisplay.svelte',
  () => import('./mocks/SavedFeatureActionDisplay.svelte'),
)

beforeEach(() => vi.useRealTimers())
afterEach(() => cleanup())

describe.each([
  ['wishlist', WishlistAction],
  ['visit', VisitAction],
] as const)('%s save scope', (_name, Component) => {
  it.each(['success', 'failure'] as const)(
    'does not write to a new account on %s',
    async outcome => {
      mocks.app.user = { id: 'old-user' }
      mocks.app.applyUserFeatureState.mockClear()
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
      expect(mocks.app.applyUserFeatureState).toHaveBeenCalledTimes(1)
      mocks.app.user = { id: 'new-user' }
      if (outcome === 'success') resolve({ data: null })
      else reject(new Error('Save failed'))
      await new Promise(res => setTimeout(res, 0))
      expect(mocks.app.applyUserFeatureState).toHaveBeenCalledTimes(1)
    },
  )

  it('reconciles the original feature after the card changes', async () => {
    mocks.app.user = { id: 'old-user' }
    mocks.app.applyUserFeatureState.mockClear()
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
      expect(mocks.app.applyUserFeatureState).toHaveBeenLastCalledWith(
        'old-feature',
        null,
      )
    })
  })
})
