// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import VisualSection from '#lib/bits/custom/main/VisualSection.svelte'
import { getAdminFacetOrderForResource } from '#lib/navigation/facets.js'
import { FirstClassResource } from '#lib/enums.js'
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('places Location immediately after Profile in Feature navigation', () => {
  expect(getAdminFacetOrderForResource(FirstClassResource.feature)).toEqual([
    'core',
    'address',
    'fields',
    'images',
  ])
})
it('omits the image pane during creation while retaining the map, and restores it after creation', async () => {
  vi.useRealTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  const view = render(VisualSection, { showImage: false })
  expect(view.container.querySelector('.bits-feature-visual__map')).not.toBeNull()
  expect(view.container.querySelector('.bits-feature-visual__image')).toBeNull()
  await view.rerender({ showImage: true })
  expect(view.container.querySelector('.bits-feature-visual__image')).not.toBeNull()
})
