import { afterEach, describe, expect, it, vi } from 'vitest'
import { latLngToCell } from 'h3-js'
import type { RemoteQuery } from '@sveltejs/kit'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type {
  FeatureQueryInput,
  FeatureQueryPage,
} from '$lib/api/services/featureQuery.types'
import { FeatureQuery, FeatureQueryRetention } from '$lib/context/feature-query.svelte'
import { featureQueryKey } from '$lib/client/services/featureQuery'

const meta = { isAdminRequest: false, scope: 'user-a:hub-a:en' }
const pointA: [number, number] = [114.173, 22.278]
const pointB: [number, number] = [114.203, 22.31]

function viewport(resolution = 8, point = pointA): FeatureQueryInput {
  return {
    limit: 100,
    meta,
    spatial: {
      resolution,
      cells: [latLngToCell(point[1], point[0], resolution)],
      bounds: [point[0] - 0.005, point[1] - 0.005, point[0] + 0.005, point[1] + 0.005],
    },
  }
}

function rows(start: number, count: number, point = pointA): FeatureFromCollection[] {
  return Array.from(
    { length: count },
    (_, offset) =>
      ({
        id: `feature-${String(start + offset).padStart(4, '0')}`,
        layerId: 'layer',
        organisationId: 'organisation',
        projectId: 'project',
        contributorId: null,
        createdAt: '',
        modifiedAt: '',
        addressMeta: {},
        isPublished: true,
        isArchived: false,
        isPendingReview: false,
        isVisitable: true,
        isIntangible: false,
        imageCount: 0,
        imagePublishedCount: 0,
        geometry: { type: 'Point', coordinates: point },
        properties: [],
        i18n: { en: { title: String(start + offset) } },
      }) as FeatureFromCollection,
  )
}

function controlledPage() {
  let resolve!: (page: FeatureQueryPage) => void
  const query = new Promise<FeatureQueryPage>(done => {
    resolve = done
  }) as RemoteQuery<FeatureQueryPage>
  Object.assign(query, {
    ready: false,
    current: undefined,
    refresh: vi.fn(async () => {}),
  })
  return {
    query,
    resolve(data: FeatureFromCollection[]) {
      const page: FeatureQueryPage = {
        data,
        totalCount: null,
        facets: null,
        nextCursor: null,
      }
      Object.assign(query, { current: page, ready: true })
      resolve(page)
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('incremental map markers', () => {
  it('loads 100 extra markers on another viewport and keeps the first 100 in order', async () => {
    const first = controlledPage(),
      second = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load(viewport(8))
    expect(fetch.mock.calls[0][0]).toMatchObject({
      limit: 100,
      includeCounts: false,
      excludeIds: [],
    })
    first.resolve(rows(0, 100))
    await initial
    const next = map.load(viewport(9))
    expect(map.rows.map(row => row.id)).toEqual(rows(0, 100).map(row => row.id))
    expect(fetch.mock.calls[1][0]).toMatchObject({
      limit: 100,
      excludeIds: rows(0, 100).map(row => row.id),
    })
    second.resolve(rows(100, 100))
    await next
    expect(map.rows.map(row => row.id)).toEqual(rows(0, 200).map(row => row.id))
    expect(map.totalCount).toBeNull()
    expect(map.facets).toBeNull()
    await map.load(viewport(9))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(map.isCurrent(viewport(9))).toBe(true)
  })

  it('updates an overlapping ID without moving older markers or introducing duplicates', async () => {
    const first = controlledPage(),
      second = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load(viewport())
    first.resolve(rows(0, 2))
    await initial
    const next = map.load(viewport(9))
    const updated = rows(0, 1)[0]
    updated.isIntangible = true
    second.resolve([updated, ...rows(2, 1)])
    await next
    expect(map.rows.map(row => row.id)).toEqual(rows(0, 3).map(row => row.id))
    expect(map.rows[0].isIntangible).toBe(true)
  })

  it('uses cache to fill slots, requests only the remaining ten, and stops at 500', async () => {
    const retained = new FeatureQueryRetention()
    retained.retain(rows(0, 490), viewport())
    const first = controlledPage()
    const fetch = vi.fn((_input: FeatureQueryInput) => first.query)
    const map = new FeatureQuery(fetch, retained, undefined, true)
    const initial = map.load(viewport())
    expect(map.rows).toHaveLength(490)
    expect(fetch.mock.calls[0][0]).toMatchObject({ limit: 10, includeCounts: false })
    expect(fetch.mock.calls[0][0].excludeIds).toHaveLength(490)
    first.resolve(rows(490, 20))
    await initial
    expect(map.rows).toHaveLength(500)
    expect(map.rows.map(row => row.id)).toEqual(rows(0, 500).map(row => row.id))
    await map.load(viewport(9))
    expect(map.rows).toHaveLength(500)
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('drops offscreen markers and restores fresh cached markers when returning', async () => {
    const first = controlledPage(),
      second = controlledPage(),
      returned = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
      .mockReturnValueOnce(returned.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load(viewport())
    first.resolve(rows(0, 100))
    await initial
    const pan = map.load(viewport(8, pointB))
    expect(map.rows).toEqual([])
    expect(fetch.mock.calls[1][0].excludeIds).toEqual([])
    second.resolve(rows(100, 100, pointB))
    await pan
    const back = map.load(viewport())
    expect(map.rows.map(row => row.id)).toEqual(rows(0, 100).map(row => row.id))
    expect(fetch.mock.calls[2][0].excludeIds).toEqual(rows(0, 100).map(row => row.id))
    returned.resolve(rows(200, 100))
    await back
    expect(map.rows).toHaveLength(200)
    expect(map.rows.some(row => row.id === 'feature-0100')).toBe(false)
  })

  it('restores native handles with 500 cached markers for optimistic updates and stale refresh', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const nativePages = Array.from({ length: 6 }, () => controlledPage())
    const fetch = vi.fn<(input: FeatureQueryInput) => RemoteQuery<FeatureQueryPage>>()
    for (const page of nativePages) fetch.mockReturnValueOnce(page.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)

    for (let index = 0; index < 5; index++) {
      const loaded = map.load(viewport(index + 5))
      nativePages[index].resolve(rows(index * 100, 100))
      await loaded
    }
    const expectedIds = rows(0, 500).map(row => row.id)
    const initialHandles = nativePages.slice(0, 5).map(page => page.query)
    expect(map.rows.map(row => row.id)).toEqual(expectedIds)
    expect(map.pages).toEqual(initialHandles)

    const pan = map.load(viewport(9, pointB))
    nativePages[5].resolve(rows(500, 100, pointB))
    await pan
    expect(map.pages).toEqual([nativePages[5].query])

    await map.load(viewport(9))
    expect(map.rows.map(row => row.id)).toEqual(expectedIds)
    expect(map.pages).toEqual(initialHandles)
    expect(fetch).toHaveBeenCalledTimes(6)

    // Returning markers must still observe their native optimistic override and rollback.
    const snapshot = nativePages[0].query.current
    if (!snapshot) throw new Error('Expected the first native page to be loaded')
    Object.assign(nativePages[0].query, {
      current: {
        ...snapshot,
        data: snapshot.data.map((row, index) =>
          index === 0 ? { ...row, isPublished: false } : row,
        ),
      },
    })
    expect(map.rows.map(row => row.id)).toEqual(expectedIds.slice(1))
    Object.assign(nativePages[0].query, { current: snapshot })
    expect(map.rows.map(row => row.id)).toEqual(expectedIds)

    vi.mocked(nativePages[0].query.refresh).mockImplementationOnce(async () => {
      Object.assign(nativePages[0].query, {
        current: {
          ...snapshot,
          data: snapshot.data.map((row, index) =>
            index === 0
              ? { ...row, i18n: { en: { title: 'Refreshed feature' } } }
              : row,
          ),
        },
      })
    })
    now.mockReturnValue(62_000)
    const refreshed = map.revalidate()
    expect(map.rows.map(row => row.id)).toEqual(expectedIds)
    await refreshed
    for (const page of initialHandles) expect(page.refresh).toHaveBeenCalledOnce()
    expect(nativePages[5].query.refresh).not.toHaveBeenCalled()
    expect(map.rows.map(row => row.id)).toEqual(expectedIds)
    expect(map.rows[0].i18n.en?.title).toBe('Refreshed feature')
    expect(map.pages).toEqual(initialHandles)
    expect(fetch).toHaveBeenCalledTimes(6)
  })

  it('bounds retained native provenance and expires it with ordinary cached entities', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const retained = new FeatureQueryRetention()
    const input = viewport()
    const nativePages = Array.from({ length: 21 }, () => controlledPage())
    nativePages.forEach((page, index) => {
      const data = rows(index, 1)
      page.resolve(data)
      retained.retain(data, input, page.query)
    })

    const preview = retained.preview({ ...input, limit: 500 }, {})
    const sources = new Set(
      preview.flatMap(entry => (entry.nativeSource ? [entry.nativeSource.page] : [])),
    )
    expect(preview).toHaveLength(20)
    expect(preview.every(entry => entry.nativeSource !== undefined)).toBe(true)
    expect(sources.size).toBe(20)
    expect(sources.has(nativePages[0].query)).toBe(false)
    expect(sources.has(nativePages[20].query)).toBe(true)
    const newest = preview.find(entry => entry.row.id === 'feature-0020')
    if (!newest) throw new Error('Expected the newest retained feature')
    expect(newest.nativeSource).toMatchObject({ input, fetchedAt: 1_000 })
    expect(newest.nativeSource?.page).toBe(nativePages[20].query)

    now.mockReturnValue(62_000)
    expect(retained.preview({ ...input, limit: 500 }, {})).toEqual([])
  })

  it('keeps visible markers during an ordinary stale refresh and adds the next page', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const first = controlledPage(),
      second = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load(viewport())
    first.resolve(rows(0, 100))
    await initial
    now.mockReturnValue(62_000)
    const refresh = map.revalidate()
    expect(map.rows).toHaveLength(100)
    for (let index = 0; index < 5; index++) await Promise.resolve()
    expect(first.query.refresh).toHaveBeenCalledOnce()
    expect(fetch.mock.calls[1][0].excludeIds).toEqual(rows(0, 100).map(row => row.id))
    second.resolve(rows(100, 100))
    await refresh
    expect(map.rows).toHaveLength(200)
  })

  it('does not restore stale offscreen cache entries on a return visit', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const first = controlledPage(),
      second = controlledPage(),
      returned = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
      .mockReturnValueOnce(returned.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load(viewport())
    first.resolve(rows(0, 1))
    await initial
    now.mockReturnValue(62_000)
    const pan = map.load(viewport(8, pointB))
    second.resolve(rows(1, 1, pointB))
    await pan
    const back = map.load(viewport())
    expect(map.rows).toEqual([])
    returned.resolve(rows(0, 1))
    await back
  })

  it('trims current markers by filters and never carries markers across authorization scopes', async () => {
    const first = controlledPage(),
      second = controlledPage(),
      third = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
      .mockReturnValueOnce(third.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load(viewport())
    const data = rows(0, 3)
    data[1].isVisitable = false
    first.resolve(data)
    await initial
    const filtered = map.load({ ...viewport(), filters: { isVisitable: false } })
    expect(map.rows.map(row => row.id)).toEqual(['feature-0001'])
    expect(fetch.mock.calls[1][0].excludeIds).toEqual(['feature-0001'])
    second.resolve([])
    await filtered
    const scoped = map.load({
      ...viewport(),
      meta: { ...meta, scope: 'user-b:hub-a:en' },
    })
    expect(map.rows).toEqual([])
    expect(fetch.mock.calls[2][0].excludeIds).toEqual([])
    third.resolve(rows(10, 1))
    await scoped
    expect(map.rows.map(row => row.id)).toEqual(['feature-0010'])
  })

  it('does not infer new list membership from retained unfiltered native pages', async () => {
    const first = controlledPage(),
      second = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load(viewport())
    first.resolve(rows(0, 2))
    await initial
    map.setMatchContext({
      listMembership: row => (row.id === 'feature-0000' ? true : undefined),
    })
    const filtered = map.load({
      ...viewport(),
      filters: { list: { listId: 'wishlist' } },
    })
    expect(map.rows.map(row => row.id)).toEqual(['feature-0000'])
    second.resolve(rows(2, 1))
    await filtered
    expect(map.rows.map(row => row.id)).toEqual(['feature-0000', 'feature-0002'])
  })

  it('never carries membership from one user list into another user list', async () => {
    const first = controlledPage(),
      second = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const initial = map.load({
      ...viewport(),
      filters: { list: { listId: 'wishlist', userId: 'user-a' } },
    })
    first.resolve(rows(0, 2))
    await initial
    const next = map.load({
      ...viewport(),
      filters: { list: { listId: 'wishlist', userId: 'user-b' } },
    })
    expect(map.rows).toEqual([])
    expect(fetch.mock.calls[1][0].excludeIds).toEqual([])
    second.resolve(rows(3, 1))
    await next
    expect(map.rows.map(row => row.id)).toEqual(['feature-0003'])
  })

  it('does not revive expired offscreen rows from a native page retained for overlapping markers', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const first = controlledPage(),
      second = controlledPage(),
      returned = controlledPage()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
      .mockReturnValueOnce(returned.query)
    const map = new FeatureQuery(fetch, undefined, undefined, true)
    const overlap: [number, number] = [pointA[0] + 0.003, pointA[1]]
    const nearby: [number, number] = [pointA[0] + 0.006, pointA[1]]
    // Coarse cells include both points; exact bounds determine their visibility.
    const initial = map.load(viewport(5))
    first.resolve([...rows(0, 1), ...rows(1, 1, overlap)])
    await initial
    now.mockReturnValue(62_000)
    const pan = map.load(viewport(5, nearby))
    second.resolve([])
    await pan
    expect(map.rows.map(row => row.id)).toEqual(['feature-0001'])
    const back = map.load(viewport(5))
    expect(map.rows.map(row => row.id)).toEqual(['feature-0001'])
    expect(fetch.mock.calls[2][0].excludeIds).toEqual(['feature-0001'])
    returned.resolve(rows(0, 1))
    await back
    expect(map.rows.map(row => row.id)).toEqual(['feature-0001', 'feature-0000'])
  })

  it('treats exclusions as transport details while retaining filter and viewport identity', () => {
    expect(featureQueryKey({ ...viewport(), excludeIds: ['a', 'b'] })).toBe(
      featureQueryKey(viewport()),
    )
    expect(featureQueryKey(viewport())).not.toBe(featureQueryKey(viewport(9)))
  })
})
