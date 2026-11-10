import { FirstClassResource } from '#lib/enums.js'
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ResourceIndex from '#lib/bits/patterns/resource/resourceIndex/ResourceIndex.svelte'

vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({
    listUi: { state: { layoutMode: { organisation: 'card', location: 'table' } } },
    view: {
      panels: { isPanelOpenOrVisual: () => false },
    },
  }),
}))
vi.mock('#lib/i18n.js', async importOriginal => {
  // Keep messages used by the real card skeleton's nested image components.
  const actual = await importOriginal<typeof import('#lib/i18n.js')>()
  return {
    ...actual,
    m: {
      ...actual.m,
      resource_loading: () => 'Loading',
      omni__no_results: () => 'No results',
      resource_index__empty_subtitle: () => 'Try another search',
    },
  }
})
beforeEach(() => {
  vi.useRealTimers()
  HTMLElement.prototype.getAnimations = vi.fn(() => [])
  HTMLElement.prototype.scrollTo = vi.fn()
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
  delete (HTMLElement.prototype as Partial<HTMLElement>).getAnimations
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollTo
})

it('shows skeletons until the initial query finishes, then permits an empty result', async () => {
  const view = render(ResourceIndex, {
    resource: FirstClassResource.organisation,
    entities: [],
    isInitialised: false,
  })
  expect(
    screen.getByRole('status', { name: 'Loading' }).getAttribute('aria-busy'),
  ).toBe('true')
  expect(screen.queryByText('No results')).toBeNull()
  await view.rerender({
    resource: FirstClassResource.organisation,
    entities: [],
    isInitialised: true,
  })
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.getByText('No results')).toBeTruthy()
})

it('paginates automatically with in-list skeletons and rechecks after loading settles', async () => {
  const onNearEnd = vi.fn()
  const props = {
    resource: FirstClassResource.location,
    entities: [
      {
        id: 'one',
        ssId: null,
        kind: 'unknown',
        state: 'unresolved',
        sourceAvailability: 'current',
        sourceReference: null,
        ownerOrganisationId: null,
        revisionId: null,
        facts: null,
      },
    ],
    hasMore: true,
    isLoadingMore: true,
    onNearEnd,
  } as const
  const view = render(ResourceIndex, { ...props, entities: [...props.entities] })
  expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()
  expect(
    view.container.querySelectorAll('svelte-virtual-list-row [aria-busy="true"]')
      .length,
  ).toBe(3)
  expect(onNearEnd).not.toHaveBeenCalled()
  await view.rerender({ ...props, entities: [...props.entities], isLoadingMore: false })
  expect(onNearEnd).toHaveBeenCalledTimes(1)
  await view.rerender({ ...props, entities: [...props.entities], isLoadingMore: true })
  await view.rerender({ ...props, entities: [...props.entities], isLoadingMore: false })
  expect(onNearEnd).toHaveBeenCalledTimes(2)
  await view.rerender({
    ...props,
    entities: [...props.entities],
    isLoadingMore: false,
    hasMore: false,
  })
  expect(view.container.querySelector('[aria-label="Loading"]')).toBeNull()
  expect(onNearEnd).toHaveBeenCalledTimes(2)
})
