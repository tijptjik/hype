// @vitest-environment jsdom
import { AccountState } from '#lib/context/account.svelte.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import {
  createFeatureQueryEffectRoot,
  createFeatureQueryPageSignal,
} from './fixtures/featureQueryHarness.svelte'
import type { RemoteQuery } from '$app/server'
import { withRemoteMeta } from './remote-function-mock'
import { AppCtx } from '#lib/context/app.svelte.js'
import { OmniCtx } from '#lib/context/omni.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { getFeaturePage } from '#lib/api/featureQueries.remote.js'
import { getFeatureViewportQuery } from '#lib/map/featureSpatial.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { FeatureQueryPage } from '#lib/api/services/featureQuery.types.js'

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }))

vi.mock('#lib/navigation/index.js', async importOriginal => {
  const actual = await importOriginal<typeof import('#lib/navigation/index.js')>()
  return { ...actual, navigate: navigateMock }
})
vi.mock('#lib/api/featureQueries.remote.js', () => ({
  getFeaturePage: withRemoteMeta(vi.fn(), 'query'),
}))
vi.mock('#lib/api/feature.remote.js', () => ({
  getFeature: withRemoteMeta(vi.fn(), 'query'),
  getFeatures: withRemoteMeta(vi.fn(), 'query'),
}))
vi.mock('#lib', () => ({
  isMobile: () => false,
  API_PATH: '/api',
  ADMIN_PATH: '/admin',
  NEW_REF: 'new',
}))
vi.mock('#lib/map/data.js', () => ({
  searchAllAsync: vi.fn(async (): Promise<unknown[]> => []),
}))
vi.mock('#lib/map/markers.js', () => ({
  addMarkerClass: vi.fn(),
  removeMarkerClass: vi.fn(),
}))

const cleanups: Array<() => void> = []
const selectionOptions = {
  focus: false,
  focusFeature: false,
  highlight: false,
  openCard: false,
}

function row(id: string, isVisitable = true): FeatureFromCollection {
  return {
    id,
    layerId: 'layer-a',
    organisationId: 'org-a',
    projectId: 'project-a',
    contributorId: null,
    createdAt: '',
    modifiedAt: '',
    addressMeta: {},
    isPublished: true,
    isArchived: false,
    isPendingReview: false,
    isVisitable,
    isIntangible: false,
    imageCount: 0,
    imagePublishedCount: 0,
    geometry: { type: 'Point', coordinates: [114.173, 22.278] },
    properties: [],
    divisionMemberships: [
      { divisionId: 'causeway-bay', selected: true },
      { divisionId: 'bowrington', selected: true },
    ],
    i18n: { en: { title: id, addressProperties: { neighbourhood: 'Bowrington' } } },
  } as unknown as FeatureFromCollection
}

function controlledPage() {
  const current = createFeatureQueryPageSignal()
  let resolve!: (value: FeatureQueryPage) => void
  const query = new Promise<FeatureQueryPage>(done => {
    resolve = done
  }) as RemoteQuery<FeatureQueryPage>
  Object.assign(query, {
    ready: false,
    refresh: vi.fn(async () => {}),
  })
  Object.defineProperty(query, 'current', { get: () => current.current })
  return {
    query,
    resolve: (
      data: FeatureFromCollection[],
      totalCount: number | null = data.length,
      more = false,
    ) => {
      const lastItem = data.at(-1)
      const value: FeatureQueryPage = {
        data,
        totalCount,
        facets:
          totalCount === null
            ? null
            : {
                divisions: {
                  'causeway-bay': {
                    id: 'causeway-bay',
                    level: 5,
                    category: 'hood',
                    class: 'neighbourhood',
                    count: totalCount,
                    i18n: { en: { name: 'Causeway Bay' }, zhHant: { name: '銅鑼灣' } },
                  },
                  bowrington: {
                    id: 'bowrington',
                    level: 6,
                    category: 'hood',
                    class: 'microhood',
                    count: totalCount,
                    i18n: { en: { name: 'Bowrington' } },
                  },
                },
              },
        nextCursor:
          more && lastItem ? { id: lastItem.id, signature: 'signature' } : null,
      }
      Object.assign(query, { ready: true })
      current.current = value
      resolve(value)
    },
  }
}

function createApp(): AppCtx {
  const app = new AppCtx(new DivisionCtx(), new AccountState(null), {} as ResponsiveCtx)
  app.view.scope.prisms.layer = ['layer-a']
  return app
}

function createOmni(app: AppCtx): OmniCtx {
  let omni!: OmniCtx
  cleanups.push(
    createFeatureQueryEffectRoot(() => {
      omni = new OmniCtx(app)
    }),
  )
  cleanups.push(() => omni.eventCleanup?.())
  flushSync()
  return omni
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index++) {
    await Promise.resolve()
    flushSync()
  }
}

beforeEach(() => {
  navigateMock.mockReset()
  vi.mocked(getFeaturePage).mockReset()
})
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

describe('map query integration', () => {
  it('uses the clicked marker element without a resource-view DOM registry', () => {
    const app = createApp()
    const omni = createOmni(app)
    const element = document.createElement('div')
    element.getBoundingClientRect = () =>
      ({ left: 10, top: 20, width: 30, height: 40 }) as DOMRect
    omni.prepareCardTransitionFromMarker(element)
    expect(omni.cardTransition.sourceRect).toEqual({
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    })
    expect(omni.cardTransition.sourceKind).toBe('marker')
    expect('markerElements' in app).toBe(false)
    omni.prepareCardTransitionFromMarker(null)
    expect(omni.cardTransition.sourceRect).toBeNull()
  })

  it('waits for viewport coverage before loading the initial markers', async () => {
    const app = createApp()
    expect(await app.featuresQueryFn()).toEqual([])
    expect(getFeaturePage).not.toHaveBeenCalled()
  })

  it('composes filters with viewport cells and fetches one page even when more results exist', async () => {
    const app = createApp()
    expect(app.view.filters.featureQueryInput({ q: ' tea ' }).q).toBe('tea')
    app.view.featureViewport = getFeatureViewportQuery([114.16, 22.26, 114.2, 22.3], 14)
    app.view.filters.featureQueryFilters.isVisitable = true
    app.view.filters.values.feature.properties = {
      'layer-a': { category: ['tea'] },
    } as unknown as typeof app.view.filters.values.feature.properties
    const first = controlledPage()
    vi.mocked(getFeaturePage).mockReturnValue(first.query)
    const pending = app.featuresQueryFn()
    expect(getFeaturePage).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        includeCounts: false,
        spatial: app.view.featureViewport,
        filters: expect.objectContaining({
          isVisitable: true,
          properties: { 'layer-a': { category: ['tea'] } },
        }),
      }),
    )
    const feature = row('a')
    feature.properties = [
      { propertyId: 'category', propertyValueId: 'tea' },
    ] as unknown as FeatureFromCollection['properties']
    first.resolve([feature], null, true)
    await pending
    expect(getFeaturePage).toHaveBeenCalledOnce()
    expect(app.view.resources.featureQueries.map.totalCount).toBeNull()
    expect(app.view.resources.featureQueries.map.hasMore).toBe(true)
  })

  it('keeps more than 100 visible markers and drops offscreen rows before the next page loads', async () => {
    const app = createApp()
    const first = controlledPage(),
      second = controlledPage()
    vi.mocked(getFeaturePage)
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const initialRows = Array.from({ length: 100 }, (_, index) => row(`a-${index}`))
    const additionalRows = Array.from({ length: 100 }, (_, index) => row(`b-${index}`))
    app.view.featureViewport = getFeatureViewportQuery([114.16, 22.26, 114.2, 22.3], 14)
    const initial = app.featuresQueryFn()
    first.resolve(initialRows, null, true)
    await initial

    app.view.featureViewport = getFeatureViewportQuery(
      [114.15, 22.25, 114.21, 22.31],
      13,
    )
    const extra = app.featuresQueryFn()
    expect(app.getVisibleFeatures()).toHaveLength(100)
    second.resolve(additionalRows, null, true)
    expect(await extra).toHaveLength(200)
    expect(app.getVisibleFeatures()).toHaveLength(200)
    expect(new Set(app.getVisibleFeatureIds()).size).toBe(200)

    app.view.featureViewport = getFeatureViewportQuery([114.4, 22.4, 114.41, 22.41], 14)
    expect(app.getVisibleFeatures()).toEqual([])
  })

  it('keeps loading state while a newer viewport request is pending', async () => {
    const app = createApp()
    const older = controlledPage(),
      newer = controlledPage()
    vi.mocked(getFeaturePage)
      .mockReturnValueOnce(older.query)
      .mockReturnValueOnce(newer.query)
    const previous = app.view.queries.loadFeatureQuery(
      'map',
      app.view.filters.featureQueryInput({ q: 'old' }),
    )
    const current = app.view.queries.loadFeatureQuery(
      'map',
      app.view.filters.featureQueryInput({ q: 'new' }),
    )
    older.resolve([row('old')])
    await previous
    expect(app.view.resources.featureQueries.map.loading).toBe(true)
    expect(app.view.queries.featureLoadState).toBe('loading')
    newer.resolve([row('new')])
    await current
    expect(app.view.queries.featureLoadState).toBe('complete')
  })

  it('keeps a closed search tray idle and loads one page when the user opens it', async () => {
    const app = createApp()
    app.view.isInitialised = true
    const first = controlledPage()
    vi.mocked(getFeaturePage).mockReturnValue(first.query)
    const omni = createOmni(app)
    await vi.advanceTimersByTimeAsync(150)
    expect(getFeaturePage).not.toHaveBeenCalled()
    omni.state.isTrayOpen = true
    flushSync()
    await vi.advanceTimersByTimeAsync(150)
    expect(getFeaturePage).toHaveBeenCalledOnce()
    first.resolve([row('search')], 5_000, true)
    await settle()
    expect(app.view.resources.featureQueries.search.totalCount).toBe(5_000)
    expect(getFeaturePage).toHaveBeenCalledOnce()
  })

  it('keeps search available when no layer prism is active', async () => {
    const app = createApp()
    app.view.scope.prisms.layer = []
    app.view.isInitialised = true
    const first = controlledPage()
    vi.mocked(getFeaturePage).mockReturnValue(first.query)
    const omni = createOmni(app)

    omni.state.isTrayOpen = true
    omni.setSearchTerm('mong')
    flushSync()
    await vi.advanceTimersByTimeAsync(150)

    expect(getFeaturePage).toHaveBeenCalledOnce()
    expect(getFeaturePage).toHaveBeenCalledWith(
      expect.objectContaining({
        q: 'mong',
        prisms: expect.objectContaining({ layer: [] }),
      }),
    )
    first.resolve([], 0, false)
    await settle()
  })
})

describe('paginated collection activation', () => {
  it('navigates and opens the card on the first marker selection', async () => {
    const app = createApp()
    const feature = row('first-marker')
    app.view.cache.feature.set(feature.id, feature)
    const omni = createOmni(app)

    // Markers omit updateUrl; the initial collection must preserve navigation defaults.
    await omni.initFeature(feature.id, { focus: false, openCardDelay: 0 })

    expect(navigateMock).toHaveBeenCalledWith('feature', feature.id, expect.any(Object))
    await vi.advanceTimersByTimeAsync(0)
    expect(app.selection.featureId).toBe(feature.id)
    expect(omni.state.isCardOpen).toBe(true)
  })

  it('preserves an explicitly delayed card opening across a mode change', async () => {
    const app = createApp()
    const feature = row('delayed-feature')
    app.view.cache.feature.set(feature.id, feature)
    const omni = createOmni(app)

    await omni.initFeature(feature.id, {
      focus: false,
      openCard: true,
      openCardDelay: 500,
      updateUrl: false,
    })

    await vi.advanceTimersByTimeAsync(499)
    expect(omni.state.isCardOpen).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(omni.state.isCardOpen).toBe(true)
  })

  it('keeps the card closed when selection disables opening', async () => {
    const app = createApp()
    const feature = row('closed-feature')
    app.view.cache.feature.set(feature.id, feature)
    const omni = createOmni(app)

    await omni.initFeature(feature.id, {
      focus: false,
      openCard: false,
      updateUrl: false,
    })

    await vi.advanceTimersByTimeAsync(2500)
    expect(omni.state.isCardOpen).toBe(false)
  })

  it('activates a retained feature without waiting for a remote detail read', async () => {
    const app = createApp()
    const feature = row('cached-feature')
    app.view.cache.feature.set(feature.id, feature)
    const getFeatureById = vi.spyOn(app.view, 'getFeatureById')
    const omni = createOmni(app)

    await omni.initFeature(feature.id, {
      focus: false,
      openCard: true,
      updateUrl: false,
    })

    expect(app.getActiveFeature()?.id).toBe(feature.id)
    expect(getFeatureById).toHaveBeenCalledOnce()
    expect(getFeatureById).toHaveBeenCalledWith(feature.id, false)
    await vi.advanceTimersByTimeAsync(0)
    expect(omni.state.isCardOpen).toBe(true)
  })

  it('opens a route-hydrated feature without scheduling another URL update', async () => {
    const app = createApp()
    const feature = row('route-feature')
    vi.spyOn(app.view, 'getFeatureById').mockResolvedValue(feature)
    const omni = createOmni(app)

    await omni.initFeature(feature.id, {
      focus: false,
      openCard: true,
      updateUrl: false,
    })

    expect(app.getActiveFeature()?.id).toBe(feature.id)
    expect(navigateMock).not.toHaveBeenCalled()

    app.setActiveFeature(feature.id, { focus: true, openCard: false })
    expect(navigateMock).toHaveBeenCalledOnce()
  })

  it('discards a late feature opening after a newer selection', async () => {
    const app = createApp()
    const omni = createOmni(app)
    const pending = Promise.withResolvers<FeatureFromCollection>()
    vi.spyOn(app.view, 'getFeatureById').mockImplementation(async id =>
      id === 'slow' ? pending.promise : row(id),
    )
    const slow = omni.initFeature('slow', { updateUrl: false, openCard: false })
    await omni.initFeature('newer', { updateUrl: false, openCard: false })
    pending.resolve(row('slow'))
    await slow
    expect(app.selection.featureId).toBe('newer')
  })

  it.each(['dismiss', 'dispose'] as const)(
    'does not reopen a feature after %s',
    async action => {
      const app = createApp()
      const omni = createOmni(app)
      const pending = Promise.withResolvers<FeatureFromCollection>()
      vi.spyOn(app.view, 'getFeatureById').mockReturnValue(pending.promise)
      const opening = omni.initFeature('slow', { updateUrl: false })
      if (action === 'dispose') app.dispose()
      else omni.resetToSearch(false)
      pending.resolve(row('slow'))
      await opening
      await vi.advanceTimersByTimeAsync(2500)
      expect(app.selection.featureId).toBeNull()
      expect(omni.state.isCardOpen).toBe(false)
    },
  )

  it('activates a freshly retained feature outside the displayed map immediately', async () => {
    const app = createApp()
    const seed = controlledPage(),
      collection = controlledPage()
    vi.mocked(getFeaturePage)
      .mockReturnValueOnce(seed.query)
      .mockReturnValueOnce(collection.query)
    const seedRequest = app.view.queries.loadFeatureQuery(
      'search',
      app.view.filters.featureQueryInput({ q: 'cached' }),
    )
    seed.resolve([row('cached')], 1)
    await seedRequest
    expect(app.view.queries.rows.feature).toEqual([])
    const omni = createOmni(app)
    omni.initNeighbourhood('causeway-bay', selectionOptions)
    expect(app.selection.collection?.items.map(feature => feature.id)).toEqual([
      'cached',
    ])
    expect(app.selection.feature?.id).toBe('cached')
    expect(app.selection.collection?.totalCount).toBeNull()
    collection.resolve([row('cached'), row('server')], 200, true)
    await settle()
    expect(app.selection.feature?.id).toBe('cached')
    expect(app.selection.collection?.totalCount).toBe(200)
    expect(app.selection.collection?.i18n.zhHant.name).toBe('銅鑼灣')
    expect(getFeaturePage).toHaveBeenCalledTimes(2)
  })

  it('activates the first returned feature when a collection has no cached matches', async () => {
    const app = createApp()
    const first = controlledPage()
    vi.mocked(getFeaturePage).mockReturnValue(first.query)
    const omni = createOmni(app)
    omni.initNeighbourhood('causeway-bay', selectionOptions)
    expect(app.selection.collection?.items).toEqual([])
    first.resolve([row('server')], 200, true)
    await settle()
    expect(app.selection.collection?.items.map(feature => feature.id)).toEqual([
      'server',
    ])
    expect(app.selection.feature?.id).toBe('server')
    expect(app.selection.collection?.totalCount).toBe(200)
    expect(getFeaturePage).toHaveBeenCalledOnce()
  })

  it('composes changed flags with an active neighbourhood collection independently of the viewport', async () => {
    const app = createApp()
    const first = controlledPage(),
      filtered = controlledPage()
    vi.mocked(getFeaturePage)
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(filtered.query)
    const omni = createOmni(app)
    omni.initNeighbourhood('causeway-bay', selectionOptions)
    first.resolve([row('first')], 100)
    await settle()
    app.view.featureViewport = getFeatureViewportQuery([114.16, 22.26, 114.2, 22.3], 14)
    app.view.filters.featureQueryFilters.isVisitable = false
    flushSync()
    expect(getFeaturePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          divisionIds: ['causeway-bay'],
          isVisitable: false,
        }),
      }),
    )
    expect(vi.mocked(getFeaturePage).mock.calls.at(-1)?.[0].spatial).toBeUndefined()
    filtered.resolve([row('filtered', false)], 50)
    await settle()
    expect(app.selection.collection?.items.map(feature => feature.id)).toEqual([
      'filtered',
    ])
    expect(app.selection.collection?.totalCount).toBe(50)
    expect(getFeaturePage).toHaveBeenCalledTimes(2)
  })

  it('still initializes a cold collection when its filters change before the first response', async () => {
    const app = createApp()
    const first = controlledPage(),
      filtered = controlledPage()
    vi.mocked(getFeaturePage)
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(filtered.query)
    const omni = createOmni(app)
    omni.initNeighbourhood('causeway-bay', selectionOptions)
    flushSync()
    app.view.filters.featureQueryFilters.isVisitable = false
    flushSync()
    first.resolve([row('obsolete')], 100)
    await settle()
    filtered.resolve([row('filtered', false)], 50)
    await settle()
    expect(app.selection.collection?.items.map(feature => feature.id)).toEqual([
      'filtered',
    ])
    expect(app.selection.feature?.id).toBe('filtered')
  })
})
