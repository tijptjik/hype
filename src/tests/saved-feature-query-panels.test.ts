// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WantToVisitSection from '#lib/bits/patterns/panels/sections/wantToVisit/WantToVisitSection.svelte'
import HaveVisitedSection from '#lib/bits/patterns/panels/sections/haveVisited/HaveVisitedSection.svelte'
import { useSavedFeatureListModel } from '#lib/adapters/panels/useSavedFeatureListModel.svelte.js'
import { createFeatureQueryEffectRoot } from './fixtures/featureQueryHarness.svelte'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { PanelProps } from '#lib/bits/patterns/panels/panel.types.js'

const mocks = vi.hoisted(() => {
  const feature = {
    id: 'beyond-the-map',
    i18n: { en: { title: 'Server-only feature' } },
  }
  const membership = {
    featureId: feature.id,
    userId: 'user-a',
    isWishlisted: true,
    isVisited: true,
    visitedAt: '2026-09-01T00:00:00.000Z',
  }
  const query = () => ({
    rows: [feature],
    pages: [{ current: { userFeatures: [membership] } }],
    totalCount: 23 as number | null,
    loading: false,
    error: null,
    hasMore: true,
    clear: vi.fn(),
    invalidate: vi.fn(),
  })
  return {
    app: {
      user: { id: 'user-a' },
      account: { collections: { state: { wishlisted: [], visited: [] } } },
      resources: { featureQueries: { wishlist: query(), visited: query() } },
      queries: {
        rows: { feature: [] },
        loadFeatureQuery: vi.fn(async () => {}),
        loadMoreFeatureQuery: vi.fn(async () => {}),
      },
      isAdmin: () => false,
      filters: {
        featureQueryInput: (overrides: object) => ({
          meta: { isAdminRequest: false, scope: 'user-a' },
          ...overrides,
        }),
      },
      getHierarchySync: () => ({}),
      getUserPreferences: () => ({}),
      getContextualProjectName: () => '',
      getContextualLayerName: () => '',
    },
    navigate: vi.fn(),
  }
})

vi.mock('#lib/context/app.svelte.js', () => ({ getAppCtx: () => mocks.app }))
vi.mock('#lib/context/omni.svelte.js', () => ({ getOmniCtx: () => ({}) }))
vi.mock(
  '#lib/bits/patterns/panels/components/common/Section.svelte',
  () => import('./mocks/svelte-component.svelte'),
)
vi.mock('#lib/bits/index.js', async () => ({
  Icon: (await import('./mocks/svelte-component.svelte')).default,
}))
vi.mock('#lib/navigation/index.js', () => ({
  navigateToVisited: mocks.navigate,
  navigateToStarred: mocks.navigate,
}))
vi.mock('#lib/i18n.js', () => ({
  m: new Proxy({}, { get: (_target, key) => () => String(key) }),
  getI18n: (
    resource: { i18n?: { en?: Record<string, string> } } | undefined,
    field: string,
  ) => resource?.i18n?.en?.[field] ?? '',
  toDateFnsLocale: () => undefined,
}))

beforeEach(() => {
  vi.useRealTimers()
  mocks.app.queries.loadFeatureQuery.mockClear()
  mocks.app.queries.loadMoreFeatureQuery.mockClear()
})
let disposeModel: (() => void) | undefined
afterEach(() => {
  cleanup()
  disposeModel?.()
  disposeModel = undefined
})

describe.each([
  ['wishlist', WantToVisitSection],
  ['visited', HaveVisitedSection],
] as const)('%s remote feature panel', (channel, Component) => {
  function renderPanel(): void {
    let model: ReturnType<typeof useSavedFeatureListModel> | undefined
    disposeModel = createFeatureQueryEffectRoot(() => {
      model = useSavedFeatureListModel(
        mocks.app as unknown as ResourceViewCtx,
        {} as OmniCtx,
        channel,
      )
    })
    if (!model) throw new Error('Expected the saved feature list model')
    render(Component, { model, panel: {} as PanelProps })
  }

  it('renders server rows beyond map membership and exposes pagination using the server total', async () => {
    renderPanel()
    expect(screen.getByText('Server-only feature')).toBeTruthy()
    // A single local row must not hide search when the server reports 23 matches.
    expect(screen.getByRole('searchbox')).toBeTruthy()
    await fireEvent.click(screen.getByRole('button', { name: 'resource_load_more' }))
    expect(mocks.app.queries.loadMoreFeatureQuery).toHaveBeenCalledWith(channel)
  })

  it('sends search and list selectors to the server query without requiring map rows', async () => {
    renderPanel()
    await fireEvent.input(screen.getByRole('searchbox'), {
      target: { value: 'new tea' },
    })
    await vi.waitFor(() =>
      expect(mocks.app.queries.loadFeatureQuery).toHaveBeenLastCalledWith(
        channel,
        expect.objectContaining({
          q: 'new tea',
          filters: { list: { listId: channel } },
          ...(channel === 'visited'
            ? { sorting: { sortBy: 'visitedAt', sortOrder: 'desc' } }
            : {}),
        }),
      ),
    )
  })

  it('keeps saved rows and the load-more label visible during a pending response', () => {
    const query = mocks.app.resources.featureQueries[channel]
    query.loading = true
    try {
      renderPanel()
      expect(screen.getByText('Server-only feature')).toBeTruthy()
      expect(screen.queryByText('resource_loading')).toBeNull()
      expect(screen.queryByRole('status')).toBeNull()
      expect(
        (
          screen.getByRole('button', {
            name: 'resource_load_more',
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true)
    } finally {
      query.loading = false
    }
  })

  it('shows neither loading text nor an empty-state message before the first response', () => {
    const query = mocks.app.resources.featureQueries[channel]
    const rows = query.rows
    const totalCount = query.totalCount
    query.rows = []
    query.totalCount = null
    query.loading = true
    try {
      renderPanel()
      expect(screen.queryByText('resource_loading')).toBeNull()
      expect(screen.queryByRole('status')).toBeNull()
      expect(screen.queryByText('due_mad_whale_attend')).toBeNull()
      expect(screen.queryByText('short_watery_marten_race')).toBeNull()
    } finally {
      query.rows = rows
      query.totalCount = totalCount
      query.loading = false
    }
  })

  it('keeps a settled empty state until the replacement rows arrive', async () => {
    const model = {
      title: 'Saved places (0)',
      rows: [],
      totalCount: 0,
      loading: false,
      error: null,
      hasMore: false,
      search: '',
      setSearch: vi.fn(),
      onOpen: vi.fn(),
    }
    const view = render(Component, { model: model as never, panel: {} as PanelProps })
    const emptyLabel =
      channel === 'visited' ? 'due_mad_whale_attend' : 'short_watery_marten_race'
    const emptyState = screen.getByText(emptyLabel)
    await view.rerender({ model: { ...model, loading: true } as never })
    expect(screen.getByText(emptyLabel)).toBe(emptyState)
    expect(screen.queryByText('resource_loading')).toBeNull()
    await view.rerender({
      model: {
        ...model,
        totalCount: 1,
        rows: [{ id: 'market', title: 'Bridges Street Market' }],
      } as never,
    })
    expect(screen.queryByText(emptyLabel)).toBeNull()
    expect(screen.getByText('Bridges Street Market')).toBeTruthy()
  })
})
