// @vitest-environment jsdom
import { writable } from 'svelte/store'
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/VirtualListFixture.svelte'

// Hold a previous measured range across a result shrink, as happens before the
// virtualizer's effect catches up with a new remote search response.
vi.mock('@tanstack/svelte-virtual', () => ({
  createVirtualizer: () =>
    writable({
      range: { startIndex: 0, endIndex: 2 },
      setOptions: vi.fn(),
      measureElement: vi.fn(),
      getTotalSize: () => 168,
      getVirtualItems: () =>
        [0, 1, 2].map(index => ({ index, key: index, start: index * 56 })),
    }),
}))
// jsdom does not implement scrolling; geometry itself is exercised in Chromium.
beforeEach(() => {
  vi.useRealTimers()
  // Layout measurements are exercised in Chromium; jsdom only needs the observer lifecycle.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  // jsdom has no Web Animations API; real animation is verified in Chromium.
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
  HTMLElement.prototype.scrollTo = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
})

it('safely renders shorter and empty searches while a previous range remains measured', async () => {
  const view = render(Fixture, {
    items: [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
      { id: 'c', name: 'Gamma' },
    ],
  })
  expect(screen.getByText('Gamma')).toBeTruthy()
  await view.rerender({ items: [{ id: 'b', name: 'Beta updated' }] })
  expect(screen.getByText('Beta updated')).toBeTruthy()
  expect(screen.queryByText('Gamma')).toBeNull()
  await view.rerender({ items: [] })
  expect(screen.queryByText('Beta updated')).toBeNull()
})
