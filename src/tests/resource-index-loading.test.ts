// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'

vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({
    appCtx: {
      state: { ui: { layoutMode: { organisation: 'card' } } },
      isPanelOpenOrVisual: () => false,
    },
  }),
}))
vi.mock('#lib/i18n.js', () => ({
  m: {
    resource_loading: () => 'Loading',
    omni__no_results: () => 'No results',
    resource_index__empty_subtitle: () => 'Try another search',
  },
}))
beforeEach(() => {
  vi.useRealTimers()
  // jsdom has no layout observer; this check covers loading-state transitions.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('shows skeletons until the initial query finishes, then permits an empty result', async () => {
  const view = render(ResourceIndex, {
    resource: 'organisation',
    entities: [],
    isInitialised: false,
  })
  expect(
    screen.getByRole('status', { name: 'Loading' }).getAttribute('aria-busy'),
  ).toBe('true')
  expect(screen.queryByText('No results')).toBeNull()
  await view.rerender({ resource: 'organisation', entities: [], isInitialised: true })
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText('No results')).toBeTruthy()
})
