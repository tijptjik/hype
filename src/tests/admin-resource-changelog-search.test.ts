// @vitest-environment jsdom
// TESTS
import { cleanup, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  actions: vi.fn(),
  entity: vi.fn(),
  query: vi.fn(),
  facets: [
    { ref: 'features', label: 'Features' },
    { ref: 'updates', label: 'History' },
  ],
}))
vi.mock('#lib/context/admin.svelte.js', () => ({
  getAdminCtx: () => ({
    activeResourceType: 'organisation',
    activeResourceRef: 'ghost-signs',
    view: { account: { revision: 1 } },
  }),
}))
vi.mock('#lib/context/header.svelte.js', () => ({
  getEntityVisibility: () => ({ showFacets: true, showFilter: false }),
  getHeaderCtrl: () => ({
    state: { meta: { facets: mocks.facets } },
    setSearch: mocks.search,
    setViewActions: mocks.actions,
    setHeaderForEntity: mocks.entity,
    setFacets: vi.fn(),
    setTitleMenuItems: vi.fn(),
    clearFormActions: vi.fn(),
    setFormActions: vi.fn(),
  }),
}))
vi.mock('#lib/navigation/facets.js', () => ({
  getAdminFacetTabsForResource: () => new Map([['users', { label: 'Users' }]]),
}))
vi.mock('#lib/navigation/admin.js', () => ({ navigateOnAdmin: vi.fn() }))
vi.mock('#lib/i18n.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/i18n.js')>()),
  getLocaleKey: () => 'en',
}))
vi.mock('#lib/api/resourceChangelog.remote.js', () => ({
  getResourceChangelog: mocks.query,
  markResourceChangelogChecked: vi.fn(),
}))
vi.mock('#lib/remote/index.js', () => ({
  refreshRemoteQuery: (query: unknown) => query,
}))
// COMPONENT
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import AdminResourceChangelog from '#lib/bits/patterns/revisionHistory/AdminResourceChangelog.svelte'

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  )
  mocks.query.mockResolvedValue({
    owner: { id: 'owner', name: 'Organisation' },
    entries: [],
    nextCursor: null,
    unavailable: [],
    checkpoint: { lastCheckedAt: null, checkedThrough: '2026-11-06T00:00:00.000Z' },
  })
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
it('registers top-header search, keeps it through owner loading, and clears it on departure', async () => {
  const page = render(AdminResourceChangelog, {
    props: { resource: 'organisation', resourceRef: 'ghost-signs' },
    context: new Map([[Symbol.for('hype.context.responsive'), new ResponsiveCtx()]]),
  })
  await vi.waitFor(() => expect(mocks.query).toHaveBeenCalled())
  await vi.waitFor(() =>
    expect(mocks.entity).toHaveBeenLastCalledWith(
      'Organisation',
      expect.anything(),
      expect.any(Map),
      {
        showFilter: true,
        showViewActions: true,
        showFormActions: false,
        showControlBarToggle: false,
        showLayoutToggle: false,
      },
    ),
  )
  const facets = mocks.entity.mock.calls.at(-1)?.[2] as Map<string, unknown>
  expect([...facets.keys()]).toEqual(['features', 'updates', 'changelog'])
  expect(screen.queryByRole('heading', { name: 'Changelog' })).toBeNull()
  const actions = mocks.actions.mock.calls.at(-1)?.[0]
  expect(actions.map((action: { text: string }) => action.text)).toEqual([
    'Filters',
    'Refresh',
    'Expand all',
  ])
  actions[0].onClick()
  await vi.waitFor(() =>
    expect(mocks.actions.mock.calls.at(-1)?.[0][0].attrs['aria-expanded']).toBe(true),
  )
  const search = mocks.search.mock.calls.at(-1)?.[0]
  expect(search).toMatchObject({ query: '', placeholder: 'Search changes' })
  search.onFilter('house')
  await vi.waitFor(() =>
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.objectContaining({ filters: { search: 'house' } }),
    ),
  )
  expect(mocks.search.mock.calls.at(-1)?.[0].query).toBe('house')
  // Clearing in the header updates the same controlled filter state.
  search.onFilter('')
  await vi.waitFor(() => expect(mocks.search.mock.calls.at(-1)?.[0].query).toBe(''))
  page.unmount()
  expect(mocks.search).toHaveBeenLastCalledWith(null)
  expect(mocks.actions).toHaveBeenLastCalledWith([])
})

it('retains the available Users action when entering descendant history', async () => {
  mocks.facets.push({ ref: 'users', label: 'Users' })
  try {
    render(AdminResourceChangelog, {
      props: { resource: 'organisation', resourceRef: 'ghost-signs' },
      context: new Map([[Symbol.for('hype.context.responsive'), new ResponsiveCtx()]]),
    })
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalled())
    const facets = mocks.entity.mock.calls.at(-1)?.[2] as Map<string, unknown>
    expect([...facets.keys()]).toEqual(['features', 'updates', 'users', 'changelog'])
  } finally {
    mocks.facets.pop()
  }
})
