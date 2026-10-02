import { afterEach, describe, expect, it, vi } from 'vitest'
import { latLngToCell } from 'h3-js'
import type { RemoteQuery } from '$app/server'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type {
  FeatureQueryInput,
  FeatureQueryPage,
} from '#lib/api/services/featureQuery.types.js'
import {
  FeatureQuery,
  FeatureQueryRetention,
} from '#lib/context/feature-query.svelte.js'
import {
  featureQueryKey,
  matchesFeatureQuery,
} from '#lib/client/services/featureQuery.js'

const input: FeatureQueryInput = {
  meta: { isAdminRequest: false, scope: 'user-a:hub-a:en' },
}
const row = (id: string, title = id): FeatureFromCollection =>
  ({
    id,
    layerId: 'layer-a',
    organisationId: 'organisation-a',
    projectId: 'project-a',
    contributorId: null,
    createdAt: '',
    modifiedAt: '',
    addressMeta: {},
    isPendingReview: false,
    imageCount: 0,
    imagePublishedCount: 0,
    divisionMemberships: [
      { divisionId: 'causeway-bay', selected: true },
      { divisionId: 'bowrington', selected: true },
    ],
    i18n: { en: { title, addressProperties: { neighbourhood: 'Bowrington' } } },
    isPublished: true,
    isArchived: false,
    isVisitable: true,
    isIntangible: false,
    geometry: { type: 'Point', coordinates: [114.173, 22.278] },
    properties: [],
  }) as FeatureFromCollection

function page(
  data: FeatureFromCollection[],
  totalCount = data.length,
): FeatureQueryPage {
  return {
    data,
    totalCount,
    nextCursor: null,
    facets: {
      divisions: {
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
  }
}

function controlledQuery() {
  let resolve!: (value: FeatureQueryPage) => void
  let reject!: (reason: unknown) => void
  const query = new Promise<FeatureQueryPage>((done, fail) => {
    resolve = done
    reject = fail
  }) as RemoteQuery<FeatureQueryPage>
  Object.assign(query, {
    ready: false,
    current: undefined,
    refresh: vi.fn(async () => {}),
  })
  return {
    query,
    reject,
    resolve: (value: FeatureQueryPage) => {
      Object.assign(query, { current: value, ready: true })
      resolve(value)
    },
  }
}

afterEach(() => vi.restoreAllMocks())

describe('composed cached feature matching', () => {
  it('finds translated literal text and uses hierarchy IDs rather than labels or codes', () => {
    const feature = row('a', 'Tea 100%')
    const query = { ...input, q: '100%', prisms: { organisation: ['org'] } }
    expect(matchesFeatureQuery(feature, query)).toBe(false)
    expect(matchesFeatureQuery(feature, query, { organisationCode: () => 'org' })).toBe(
      false,
    )
    expect(
      matchesFeatureQuery(feature, {
        ...query,
        prisms: { organisation: ['organisation-a'] },
      }),
    ).toBe(true)
    expect(
      matchesFeatureQuery(feature, { ...query, prisms: { project: ['project-a'] } }),
    ).toBe(true)
    expect(matchesFeatureQuery(feature, { ...input, q: 'coffee' })).toBe(false)
    expect(
      matchesFeatureQuery(feature, { ...input, prisms: { layer: ['elsewhere'] } }),
    ).toBe(false)
  })

  it('uses the deepest selected child in each branch while keeping independent branches', () => {
    const context = {
      layerProjectId: (id: string) =>
        ({ a1: 'project-a1', a2: 'project-a1', b1: 'project-b1' })[
          id as 'a1' | 'a2' | 'b1'
        ],
      projectOrganisationId: (id: string) =>
        ({ 'project-a1': 'org-a', 'project-a2': 'org-a', 'project-b1': 'org-b' })[
          id as 'project-a1' | 'project-a2' | 'project-b1'
        ],
    }
    const first = {
      ...row('a'),
      layerId: 'a1',
      projectId: 'project-a1',
      organisationId: 'org-a',
    }
    const sibling = { ...first, id: 'sibling', layerId: 'a2' }
    const otherProject = {
      ...first,
      id: 'other-project',
      layerId: 'a3',
      projectId: 'project-a2',
    }
    const independent = {
      ...first,
      id: 'independent',
      layerId: 'b1',
      projectId: 'project-b1',
      organisationId: 'org-b',
    }
    const mixed = {
      ...input,
      prisms: { organisation: ['org-a'], project: ['project-b1'], layer: ['a1'] },
    }
    expect(
      [first, sibling, otherProject, independent]
        .filter(feature => matchesFeatureQuery(feature, mixed, context))
        .map(feature => feature.id),
    ).toEqual(['a', 'independent'])
    const projectNarrowing = {
      ...input,
      prisms: { organisation: ['org-a', 'org-b'], project: ['project-a1'] },
    }
    expect(
      [first, sibling, otherProject, independent]
        .filter(feature => matchesFeatureQuery(feature, projectNarrowing, context))
        .map(feature => feature.id),
    ).toEqual(['a', 'sibling', 'independent'])
    expect(
      matchesFeatureQuery(
        sibling,
        { ...input, prisms: { project: ['project-a1'], layer: ['a1'] } },
        context,
      ),
    ).toBe(false)
    expect(
      matchesFeatureQuery(
        sibling,
        { ...input, prisms: { project: ['project-a1'], layer: ['unknown'] } },
        context,
      ),
    ).toBe(false)
  })

  it('composes category, range, boolean and expanded neighbourhood predicates', () => {
    const feature = row('a')
    feature.properties = [
      { propertyId: 'category', propertyValueId: 'tea' },
      { propertyId: 'range', value: '5' },
      { propertyId: 'flag', value: '1' },
    ] as FeatureFromCollection['properties']
    const query: FeatureQueryInput = {
      ...input,
      filters: {
        divisionIds: ['causeway-bay'],
        properties: {
          'layer-a': {
            category: ['tea', 'coffee'],
            range: { globalMin: 0, globalMax: 10, rangeMin: 4, rangeMax: 6 },
            flag: true,
          },
        },
      },
    }
    expect(matchesFeatureQuery(feature, query)).toBe(true)
    expect(
      matchesFeatureQuery(feature, {
        ...query,
        filters: { ...query.filters, excludeDivisionIds: ['bowrington'] },
      }),
    ).toBe(false)
    feature.properties[1].value = '7'
    expect(matchesFeatureQuery(feature, query)).toBe(false)
    expect(
      matchesFeatureQuery(row('missing'), {
        ...input,
        filters: {
          properties: {
            'layer-a': {
              range: { globalMin: 0, globalMax: 10, rangeMin: 0, rangeMax: 10 },
              category: [],
            },
          },
        },
      }),
    ).toBe(true)
  })

  it('requires known list membership and honors a known negative', () => {
    const query: FeatureQueryInput = {
      ...input,
      filters: { list: { listId: 'wishlist' } },
    }
    expect(matchesFeatureQuery(row('a'), query)).toBe(false)
    expect(matchesFeatureQuery(row('a'), query, { listMembership: () => false })).toBe(
      false,
    )
    expect(matchesFeatureQuery(row('a'), query, { listMembership: () => true })).toBe(
      true,
    )
  })

  it('requires both cell membership and viewport bounds, including antimeridian bounds', () => {
    const feature = row('a')
    const spatial = { resolution: 8, cells: [latLngToCell(22.278, 114.173, 8)] }
    expect(matchesFeatureQuery(feature, { ...input, spatial })).toBe(true)
    expect(
      matchesFeatureQuery(feature, {
        ...input,
        spatial: { ...spatial, bounds: [115, 22, 116, 23] },
      }),
    ).toBe(false)
    feature.geometry = { type: 'Point', coordinates: [179.8, 1] }
    expect(
      matchesFeatureQuery(feature, {
        ...input,
        spatial: {
          resolution: 6,
          cells: [latLngToCell(1, 179.8, 6)],
          bounds: [179, 0, -179, 2],
        },
      }),
    ).toBe(true)
    expect(
      matchesFeatureQuery(feature, { ...input, spatial: { resolution: 6, cells: [] } }),
    ).toBe(false)
  })

  it('retains equivalent object arguments under one query key without losing bounds order', () => {
    expect(
      featureQueryKey({
        ...input,
        q: 'tea',
        filters: { isVisitable: true, isIntangible: false },
      }),
    ).toBe(
      featureQueryKey({
        filters: { isIntangible: false, isVisitable: true },
        q: 'tea',
        ...input,
      }),
    )
  })
})

describe('native feature query retention', () => {
  it('previews cached matches immediately and merges fresh unique server results with authoritative totals', async () => {
    const first = controlledQuery(),
      search = controlledQuery()
    const retained = new FeatureQueryRetention()
    const map = new FeatureQuery(() => first.query, retained)
    const load = map.load(input)
    first.resolve(
      page([row('a', 'Tea old'), row('b', 'Tea nearby'), row('d', 'Coffee')], 50),
    )
    await load
    const results = new FeatureQuery(() => search.query, retained)
    const pending = results.load({ ...input, q: 'Tea' })
    expect(results.rows.map(item => item.id)).toEqual(['a', 'b'])
    expect(results.totalCount).toBeNull()
    expect(results.facets).toBeNull()
    search.resolve(page([row('a', 'Tea updated'), row('c', 'Tea elsewhere')], 123))
    await pending
    expect(results.rows.map(item => item.id)).toEqual(['a', 'c', 'b'])
    expect(results.rows[0].i18n?.en?.title).toBe('Tea updated')
    expect(results.totalCount).toBe(123)
    expect(results.facets).toEqual(page([], 123).facets)
  })

  it('isolates previews across authorization, admin, hub and locale scope changes', () => {
    const retained = new FeatureQueryRetention()
    retained.retain([row('private')], input)
    for (const meta of [
      { ...input.meta, scope: 'user-b:hub-a:en' },
      { ...input.meta, scope: 'user-a:hub-b:en' },
      { ...input.meta, scope: 'user-a:hub-a:zhHant' },
      { ...input.meta, isAdminRequest: true },
    ])
      expect(retained.preview({ meta }, {})).toEqual([])
  })

  it('expires membership on its own freshness clock when another query refreshes the entity', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const retained = new FeatureQueryRetention()
    const list: FeatureQueryInput = {
      ...input,
      filters: { list: { listId: 'wishlist' } },
    }
    retained.retain([row('a')], list)
    expect(retained.preview(list, {})).toHaveLength(1)
    expect(retained.preview(list, { listMembership: () => false })).toHaveLength(0)
    now.mockReturnValue(50_000)
    retained.retain([row('a')], input)
    now.mockReturnValue(62_000)
    expect(retained.preview(input, {})).toHaveLength(1)
    expect(retained.preview(list, {})).toHaveLength(0)
  })

  it('excludes stale entities from new-query previews and bounds retained entities', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const retained = new FeatureQueryRetention()
    retained.retain(
      Array.from({ length: 2_100 }, (_, index) => row(String(index))),
      input,
    )
    expect(retained.preview({ ...input, limit: 3_000 }, {})).toHaveLength(2_000)
    now.mockReturnValue(61_000)
    expect(retained.preview(input, {})).toEqual([])
  })

  it('reflects explicit optimistic membership changes without changing server counts', async () => {
    const first = controlledQuery()
    const retained = new FeatureQueryRetention()
    retained.retain([row('b')], input)
    const results = new FeatureQuery(() => first.query, retained)
    const pending = results.load({
      ...input,
      filters: { list: { listId: 'wishlist' } },
    })
    first.resolve(page([row('a')], 20))
    await pending
    results.setMatchContext({ listMembership: feature => feature.id === 'b' })
    expect(results.rows.map(feature => feature.id)).toEqual(['b'])
    expect(results.totalCount).toBe(20)
    results.setMatchContext({ listMembership: feature => feature.id === 'a' })
    expect(results.rows.map(feature => feature.id)).toEqual(['a'])
  })

  it('ignores an old search completion and does not seed subsequent previews from it', async () => {
    const old = controlledQuery(),
      next = controlledQuery()
    const retained = new FeatureQueryRetention()
    const results = new FeatureQuery(
      vi.fn().mockReturnValueOnce(old.query).mockReturnValueOnce(next.query),
      retained,
    )
    const older = results.load({ ...input, q: 'old' })
    const newer = results.load({ ...input, q: 'new' })
    next.resolve(page([row('new')]))
    await newer
    old.resolve(page([row('old')]))
    await older
    expect(results.rows.map(item => item.id)).toEqual(['new'])
    expect(retained.preview(input, {}).map(entry => entry.row.id)).toEqual(['new'])
  })

  it('fetches one next page for repeated triggers, deduplicates IDs and keeps totalCount unchanged', async () => {
    const first = controlledQuery(),
      second = controlledQuery()
    const fetch = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const results = new FeatureQuery(fetch)
    const initial = results.load(input)
    first.resolve({
      ...page([row('a')], 50),
      nextCursor: { id: 'a', signature: 'signature' },
    })
    await initial
    const more = results.next()
    await results.next()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[1][0].cursor.id).toBe('a')
    second.resolve(page([row('a', 'updated'), row('b')], 50))
    await more
    expect(results.rows.map(item => item.id)).toEqual(['a', 'b'])
    expect(results.rows[0].i18n?.en?.title).toBe('updated')
    expect(results.totalCount).toBe(50)
    expect(results.hasMore).toBe(false)
  })

  it('reuses the same-query count and native handle, then refreshes after one minute', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const first = controlledQuery()
    const fetch = vi.fn(() => first.query)
    const results = new FeatureQuery(fetch)
    const initial = results.load(input)
    first.resolve(page([row('a')], 30))
    await initial
    await results.load(input)
    expect(fetch).toHaveBeenCalledOnce()
    now.mockReturnValue(62_000)
    vi.mocked(first.query.refresh).mockImplementation(async () => {
      Object.assign(first.query, { current: page([row('b')], 40) })
    })
    await results.revalidate()
    expect(first.query.refresh).toHaveBeenCalledOnce()
    expect(results.rows.map(item => item.id)).toEqual(['b'])
    expect(results.totalCount).toBe(40)
  })

  it('does not repopulate cleared views or retention from in-flight pages', async () => {
    const first = controlledQuery()
    const retained = new FeatureQueryRetention()
    const results = new FeatureQuery(() => first.query, retained)
    const pending = results.load(input)
    results.clear()
    first.resolve(page([row('private')]))
    await pending
    expect(results.rows).toEqual([])
    expect(results.loading).toBe(false)
    expect(retained.preview(input, {})).toEqual([])
  })

  it('purges optimistic cached matches when authorization fails', async () => {
    const first = controlledQuery()
    const retained = new FeatureQueryRetention()
    retained.retain([row('a')], input)
    const results = new FeatureQuery(() => first.query, retained)
    const pending = results.load(input)
    expect(results.rows).toHaveLength(1)
    first.reject({ status: 403 })
    await expect(pending).rejects.toEqual({ status: 403 })
    expect(results.rows).toEqual([])
    expect(results.totalCount).toBeNull()
    expect(retained.preview(input, {})).toEqual([])
  })

  it('keeps cached map markers before additional returned matches', async () => {
    const first = controlledQuery()
    const retained = new FeatureQueryRetention()
    retained.retain([row('a'), row('b')], input)
    const results = new FeatureQuery(() => first.query, retained, undefined, true)
    const pending = results.load({ ...input, limit: 2 })
    expect(results.rows).toHaveLength(2)
    first.resolve(page([row('c'), row('d')], 50))
    await pending
    expect(results.rows.map(item => item.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(results.totalCount).toBeNull()
  })
})
