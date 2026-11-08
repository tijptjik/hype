// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FirstClassResource } from '#lib/enums.js'
import * as featureRemote from '#lib/api/feature.remote.js'
import * as featureIndexRemote from '#lib/api/featureIndex.remote.js'
// CONTEXT
import { AdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
// NAVIGATION
import { getAdjacentResourceRefs } from '#lib/navigation/admin.js'
// TYPES
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'

const views: ResourceViewCtx[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const view of views.splice(0)) view.dispose()
})

/** Builds records with the fields required by the real admin filter predicates. */
function feature(id: string, title: string, isPublished = true): FeatureFromCollection {
  return {
    id,
    isArchived: false,
    isPublished,
    isPendingReview: false,
    imageCount: 0,
    imagePublishedCount: 0,
    images: [],
    i18n: { en: { title } },
  } as unknown as FeatureFromCollection
}

/** Creates an isolated admin surface with a deliberately non-ID-sorted query. */
function setup(): { admin: AdminCtx; view: ResourceViewCtx } {
  const view = new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    new ResponsiveCtx(),
    undefined,
    'admin',
  )
  views.push(view)
  view.queries.rows.feature = [
    feature('z', 'Tea Zebra'),
    feature('hidden', 'Tea Hidden', false),
    feature('a', 'Tea Apple'),
    feature('other', 'Coffee'),
    feature('m', 'Tea Mango'),
  ]
  view.filters.values.feature.text = 'Tea'
  view.filters.viewFilters.feature.isPublished = true
  return { admin: new AdminCtx(view), view }
}

describe('admin Feature list traversal', () => {
  it('uses text and view filters with the loaded sort order on a direct visit', () => {
    const { admin } = setup()
    expect(admin.featureNavigationRows.map(row => row.id)).toEqual(['z', 'a', 'm'])
    expect(getAdjacentResourceRefs(admin.featureNavigationRows, 'a')).toEqual({
      currentIndex: 1,
      previousRef: 'z',
      nextRef: 'm',
    })
    expect(getAdjacentResourceRefs(admin.featureNavigationRows, 'hidden')).toEqual({
      currentIndex: -1,
      previousRef: null,
      nextRef: null,
    })
  })

  it('retains the exact index order and remote matches absent from the base query', () => {
    const { admin, view } = setup()
    const matches = [{ id: 'remote-z' }, { id: 'a' }, { id: 'remote-a' }]
    admin.rememberFeatureIndex(matches)
    matches.reverse()
    // Detail hydration or a refreshed modifiedAt sort must not reshuffle a traversal.
    view.queries.rows.feature = [...view.queries.rows.feature].reverse()
    expect(getAdjacentResourceRefs(admin.featureNavigationRows, 'a')).toEqual({
      currentIndex: 1,
      previousRef: 'remote-z',
      nextRef: 'remote-a',
    })
  })

  it('stops at both ends and respects an empty matching list', () => {
    const { admin } = setup()
    admin.rememberFeatureIndex([{ id: 'z' }, { id: 'a' }])
    expect(
      getAdjacentResourceRefs(admin.featureNavigationRows, 'z').previousRef,
    ).toBeNull()
    expect(getAdjacentResourceRefs(admin.featureNavigationRows, 'a').nextRef).toBeNull()
    admin.rememberFeatureIndex([])
    expect(admin.featureNavigationRows).toEqual([])
  })

  it('retains all matches beyond the search-focus display cap', () => {
    const { admin } = setup()
    admin.rememberFeatureIndex(
      Array.from({ length: 25 }, (_, index) => ({ id: `${index}` })),
    )
    expect(getAdjacentResourceRefs(admin.featureNavigationRows, '19').nextRef).toBe(
      '20',
    )
  })

  it('invalidates the retained sequence when text or view filters change', () => {
    const { admin, view } = setup()
    admin.rememberFeatureIndex([{ id: 'remote' }])
    view.filters.values.feature.text = 'Coffee'
    expect(admin.featureNavigationRows.map(row => row.id)).toEqual(['other'])
    admin.rememberFeatureIndex([{ id: 'remote' }])
    view.filters.viewFilters.feature.isPublished = false
    expect(admin.featureNavigationRows).toEqual([])
  })

  it('uses the new sort order after a sort change', () => {
    const { admin, view } = setup()
    admin.rememberFeatureIndex([{ id: 'remote' }])
    const sorting = view.filters.sorting.feature
    sorting.sortOrder = sorting.sortOrder === 'asc' ? 'desc' : 'asc'
    view.queries.rows.feature = [...view.queries.rows.feature].reverse()
    expect(admin.featureNavigationRows.map(row => row.id)).toEqual(['m', 'a', 'z'])
  })

  it('discards matches from a different prism scope', () => {
    const { admin, view } = setup()
    admin.rememberFeatureIndex([{ id: 'old-layer' }])
    view.scope.prisms.layer = ['another-layer']
    view.queries.rows.feature = [feature('new-layer', 'Tea New')]
    expect(admin.featureNavigationRows.map(row => row.id)).toEqual(['new-layer'])
  })

  it('discards matches after an account change', () => {
    const { admin, view } = setup()
    admin.rememberFeatureIndex([{ id: 'previous-account' }])
    view.account.syncSession({ id: 'another-user', roles: [] } as never)
    view.syncAccount()
    expect(admin.featureNavigationRows).toEqual([])
  })
})

describe('feature detail loading priority', () => {
  it('initializes a known feature without requesting its collection', async () => {
    const { admin, view } = setup()
    admin.setResourceRef('a', FirstClassResource.feature)
    const collection = vi.spyOn(view.queries, 'refreshFeatures')
    await admin.init()
    expect(admin.isInitialised).toBe(true)
    expect(collection).not.toHaveBeenCalled()
  })

  it('loads bounded ID pages only until the requested neighbour is known', async () => {
    const { admin, view } = setup()
    view.filters.values.feature.text = ''
    const query = vi
      .spyOn(featureIndexRemote, 'getFeatureIndexPage')
      .mockResolvedValueOnce({
        data: [{ id: 'z' }, { id: 'a' }],
        hasMore: true,
        nextOffset: 2,
      } as never)
      .mockResolvedValueOnce({
        data: [{ id: 'm' }],
        hasMore: false,
        nextOffset: null,
      } as never)
    const full = vi.spyOn(featureRemote, 'getFeatures')
    await admin.ensureFeatureNavigation('a')
    expect(query).toHaveBeenCalledTimes(2)
    expect(query.mock.calls.map(([input]) => input.pagination)).toEqual([
      { limit: 100, offset: 0 },
      { limit: 100, offset: 2 },
    ])
    expect(full).not.toHaveBeenCalled()
    expect(getAdjacentResourceRefs(admin.featureNavigationRows, 'a')).toEqual({
      currentIndex: 1,
      previousRef: 'z',
      nextRef: 'm',
    })
    await admin.ensureFeatureNavigation('m')
    expect(query).toHaveBeenCalledTimes(2)
  })

  it('does not request traversal for a complete retained filtered index', async () => {
    const { admin } = setup()
    admin.rememberFeatureIndex([{ id: 'z' }, { id: 'a' }])
    const query = vi.spyOn(featureIndexRemote, 'getFeatureIndexPage')
    await admin.ensureFeatureNavigation('a')
    expect(query).not.toHaveBeenCalled()
  })

  it('uses server search matches when continuing a partial search index', async () => {
    const { admin } = setup()
    admin.rememberFeatureIndex([{ id: 'remote-match' }], false)
    const query = vi.spyOn(featureIndexRemote, 'getFeatureIndexPage').mockResolvedValueOnce({
      data: [{ id: 'remote-match' }, { id: 'remote-next' }],
      hasMore: false,
    } as never)
    const cards = vi.spyOn(featureRemote, 'getFeatures')
    await admin.ensureFeatureNavigation('remote-match')
    expect(query.mock.calls[0][0].q).toBe('Tea')
    expect(cards).not.toHaveBeenCalled()
    expect(
      getAdjacentResourceRefs(admin.featureNavigationRows, 'remote-match').nextRef,
    ).toBe('remote-next')
  })

  it('uses the same server content filters for ID-only navigation', async () => {
    const { admin, view } = setup()
    view.filters.values.feature.text = ''
    view.filters.viewFilters.feature.hasTitle = true
    const query = vi.spyOn(featureIndexRemote, 'getFeatureIndexPage').mockResolvedValueOnce({
      data: [{ id: 'a' }, { id: 'next' }], hasMore: false, totalCount: null, nextOffset: null,
    } as never)
    await admin.ensureFeatureNavigation('a')
    expect(query.mock.calls[0][0]).toMatchObject({
      filters: { hasTitle: true }, idsOnly: true, includeCount: false,
    })
    expect(admin.featureNavigationRows.map(row => row.id)).toEqual(['a', 'next'])
  })

  it('retires pending navigation IDs after an explicit cache reset', async () => {
    const { admin, view } = setup()
    let resolve!: (value: never) => void
    vi.spyOn(featureIndexRemote, 'getFeatureIndexPage').mockImplementation(
      () =>
        new Promise(done => {
          resolve = done
        }) as never,
    )
    const pending = admin.ensureFeatureNavigation('a')
    view.clearAllCaches()
    resolve({ data: [{ id: 'obsolete' }], hasMore: false } as never)
    await pending
    expect(admin.featureNavigationRows.some(row => row.id === 'obsolete')).toBe(false)
  })

  it('retires remembered navigation order after an explicit cache reset', () => {
    const { admin, view } = setup()
    admin.rememberFeatureIndex([{ id: 'obsolete' }])
    view.clearAllCaches()
    expect(admin.featureNavigationRows.some(row => row.id === 'obsolete')).toBe(false)
  })

  it('discards late navigation IDs after the active filters change', async () => {
    const { admin, view } = setup()
    view.filters.values.feature.text = ''
    let resolve!: (value: never) => void
    vi.spyOn(featureIndexRemote, 'getFeatureIndexPage').mockImplementation(
      () =>
        new Promise(done => {
          resolve = done
        }) as never,
    )
    const pending = admin.ensureFeatureNavigation('a')
    view.filters.values.feature.text = 'Coffee'
    resolve({ data: [{ id: 'old' }], hasMore: false } as never)
    await pending
    expect(admin.featureNavigationRows.map(row => row.id)).toEqual(['other'])
  })
})

it.each(['ids', 'cards'])(
  'refreshes retained %s before selecting neighbours',
  async mode => {
    const { admin, view } = setup()
    view.filters.values.feature.text = ''
    if (mode === 'cards') view.filters.viewFilters.feature.hasTitle = true
    const old = {
      data: [feature('a', 'Anchor'), feature('obsolete', 'Old')],
      hasMore: false,
    }
    const current = {
      data: [feature('a', 'Anchor'), feature('current', 'Current')],
      hasMore: false,
    }
    const query = Object.assign(Promise.resolve(old), {
      current: old,
      refresh: vi.fn(async () => {
        query.current = current
      }),
    })
    vi.spyOn(featureIndexRemote, 'getFeatureIndexPage').mockReturnValueOnce(query as never)
    await admin.ensureFeatureNavigation('a')
    expect(query.refresh).toHaveBeenCalledOnce()
    expect(getAdjacentResourceRefs(admin.featureNavigationRows, 'a').nextRef).toBe(
      'current',
    )
  },
)

it('rejects a non-advancing navigation page before dispatching another read', async () => {
  const { admin } = setup()
  const query = vi
    .spyOn(featureIndexRemote, 'getFeatureIndexPage')
    .mockResolvedValueOnce({
      data: [{ id: 'unrelated' }],
      hasMore: true,
      nextOffset: 0,
    } as never)
    .mockRejectedValueOnce(new Error('unexpected repeated read'))
  await expect(admin.ensureFeatureNavigation('a')).rejects.toThrow(
    'Feature navigation pagination did not advance',
  )
  expect(query).toHaveBeenCalledOnce()
})
