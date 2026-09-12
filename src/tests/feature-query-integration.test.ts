// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import {
  createFeatureQueryEffectRoot,
  createFeatureQueryPageSignal,
} from './fixtures/featureQueryHarness.svelte'
import type { RemoteQuery } from '@sveltejs/kit'
import { withRemoteMeta } from './remote-function-mock'
import { AppCtx } from '$lib/context/app.svelte'
import { OmniCtx } from '$lib/context/omni.svelte'
import { PlaceCtx } from '$lib/context/place.svelte'
import { getFeaturePage } from '$lib/api/server/featureQueries.remote'
import { getFeatureViewportQuery } from '$lib/map/featureSpatial'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { ResponsiveCtx } from '$lib/context/responsive.svelte'
import type { FeatureQueryPage } from '$lib/types'

vi.mock('$lib/api/server/featureQueries.remote', () => ({
  getFeaturePage: withRemoteMeta(vi.fn(), 'query'),
}))
vi.mock('$lib/api/server/feature.remote', () => ({
  getFeature: withRemoteMeta(vi.fn(), 'query'),
  getFeatures: withRemoteMeta(vi.fn(), 'query'),
}))
vi.mock('$lib', () => ({
  isMobile: () => false,
  API_PATH: '/api',
  ADMIN_PATH: '/admin',
  NEW_REF: 'new',
}))
vi.mock('$lib/map/data', () => ({ searchAllAsync: vi.fn(async () => []) }))
vi.mock('$lib/map/markers', () => ({
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
    i18n: { en: { title: id, addressProperties: { neighbourhood: 'Bowrington' } } },
  } as FeatureFromCollection
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
          totalCount === null ? null : { neighbourhoods: { Bowrington: totalCount } },
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
  const app = new AppCtx(new PlaceCtx(), null, {} as ResponsiveCtx)
  app.state.prisms.layer = ['layer-a']
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
  vi.mocked(getFeaturePage).mockReset()
})
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
})

describe('map query integration', () => {
  it('waits for viewport coverage before loading the initial markers', async () => {
    const app = createApp()
    expect(await app.featuresQueryFn()).toEqual([])
    expect(getFeaturePage).not.toHaveBeenCalled()
  })

  it('composes filters with viewport cells and fetches one page even when more results exist', async () => {
    const app = createApp()
    expect(app.featureQueryInput({ q: ' tea ' }).q).toBe('tea')
    app.featureViewport = getFeatureViewportQuery([114.16, 22.26, 114.2, 22.3], 14)
    app.featureQueryFilters.isVisitable = true
    app.state.filters.feature.properties = {
      'layer-a': { category: ['tea'] },
    } as unknown as typeof app.state.filters.feature.properties
    const first = controlledPage()
    vi.mocked(getFeaturePage).mockReturnValue(first.query)
    const pending = app.featuresQueryFn()
    expect(getFeaturePage).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        includeCounts: false,
        spatial: app.featureViewport,
        filters: expect.objectContaining({
          isVisitable: true,
          properties: { 'layer-a': { category: ['tea'] } },
        }),
      }),
    )
    const feature = row('a')
    feature.properties = [
      { propertyId: 'category', propertyValueId: 'tea' },
    ] as FeatureFromCollection['properties']
    first.resolve([feature], null, true)
    await pending
    expect(getFeaturePage).toHaveBeenCalledOnce()
    expect(app.cacheCtx.featureQueries.map.totalCount).toBeNull()
    expect(app.cacheCtx.featureQueries.map.hasMore).toBe(true)
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
    app.featureViewport = getFeatureViewportQuery([114.16, 22.26, 114.2, 22.3], 14)
    const initial = app.featuresQueryFn()
    first.resolve(initialRows, null, true)
    await initial

    app.featureViewport = getFeatureViewportQuery([114.15, 22.25, 114.21, 22.31], 13)
    const extra = app.featuresQueryFn()
    expect(app.getVisibleFeatures()).toHaveLength(100)
    second.resolve(additionalRows, null, true)
    expect(await extra).toHaveLength(200)
    expect(app.getVisibleFeatures()).toHaveLength(200)
    expect(new Set(app.getVisibleFeatureIds()).size).toBe(200)

    app.featureViewport = getFeatureViewportQuery([114.4, 22.4, 114.41, 22.41], 14)
    expect(app.getVisibleFeatures()).toEqual([])
  })

  it('keeps loading state while a newer viewport request is pending', async () => {
    const app = createApp()
    const older = controlledPage(),
      newer = controlledPage()
    vi.mocked(getFeaturePage)
      .mockReturnValueOnce(older.query)
      .mockReturnValueOnce(newer.query)
    const previous = app.loadFeatureQuery('map', app.featureQueryInput({ q: 'old' }))
    const current = app.loadFeatureQuery('map', app.featureQueryInput({ q: 'new' }))
    older.resolve([row('old')])
    await previous
    expect(app.cacheCtx.featureQueries.map.loading).toBe(true)
    expect(app.featureLoadState).toBe('loading')
    newer.resolve([row('new')])
    await current
    expect(app.featureLoadState).toBe('complete')
  })

  it('keeps a closed search tray idle and loads one page when the user opens it', async () => {
    const app = createApp()
    app.isInitialised = true
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
    expect(app.cacheCtx.featureQueries.search.totalCount).toBe(5_000)
    expect(getFeaturePage).toHaveBeenCalledOnce()
  })
})

describe('paginated collection activation', () => {
  it('activates a freshly retained feature outside the displayed map immediately', async () => {
    const app = createApp()
    const seed = controlledPage(),
      collection = controlledPage()
    vi.mocked(getFeaturePage)
      .mockReturnValueOnce(seed.query)
      .mockReturnValueOnce(collection.query)
    const seedRequest = app.loadFeatureQuery(
      'search',
      app.featureQueryInput({ q: 'cached' }),
    )
    seed.resolve([row('cached')], 1)
    await seedRequest
    expect(app.state.resources.feature).toEqual([])
    const omni = createOmni(app)
    omni.initNeighbourhood('Causeway Bay', selectionOptions)
    expect(app.state.active.collection?.items.map(feature => feature.id)).toEqual([
      'cached',
    ])
    expect(app.state.active.feature?.id).toBe('cached')
    expect(app.state.active.collection?.totalCount).toBeNull()
    collection.resolve([row('cached'), row('server')], 200, true)
    await settle()
    expect(app.state.active.feature?.id).toBe('cached')
    expect(app.state.active.collection?.totalCount).toBe(200)
    expect(getFeaturePage).toHaveBeenCalledTimes(2)
  })

  it('activates the first returned feature when a collection has no cached matches', async () => {
    const app = createApp()
    const first = controlledPage()
    vi.mocked(getFeaturePage).mockReturnValue(first.query)
    const omni = createOmni(app)
    omni.initNeighbourhood('Causeway Bay', selectionOptions)
    expect(app.state.active.collection?.items).toEqual([])
    first.resolve([row('server')], 200, true)
    await settle()
    expect(app.state.active.collection?.items.map(feature => feature.id)).toEqual([
      'server',
    ])
    expect(app.state.active.feature?.id).toBe('server')
    expect(app.state.active.collection?.totalCount).toBe(200)
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
    omni.initNeighbourhood('Causeway Bay', selectionOptions)
    first.resolve([row('first')], 100)
    await settle()
    app.featureViewport = getFeatureViewportQuery([114.16, 22.26, 114.2, 22.3], 14)
    app.featureQueryFilters.isVisitable = false
    flushSync()
    expect(getFeaturePage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          neighbourhoods: ['Causeway Bay'],
          isVisitable: false,
        }),
      }),
    )
    expect(vi.mocked(getFeaturePage).mock.calls.at(-1)?.[0].spatial).toBeUndefined()
    filtered.resolve([row('filtered', false)], 50)
    await settle()
    expect(app.state.active.collection?.items.map(feature => feature.id)).toEqual([
      'filtered',
    ])
    expect(app.state.active.collection?.totalCount).toBe(50)
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
    omni.initNeighbourhood('Causeway Bay', selectionOptions)
    flushSync()
    app.featureQueryFilters.isVisitable = false
    flushSync()
    first.resolve([row('obsolete')], 100)
    await settle()
    filtered.resolve([row('filtered', false)], 50)
    await settle()
    expect(app.state.active.collection?.items.map(feature => feature.id)).toEqual([
      'filtered',
    ])
    expect(app.state.active.feature?.id).toBe('filtered')
  })
})
