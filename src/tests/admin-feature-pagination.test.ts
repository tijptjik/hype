// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as featureRemote from '#lib/api/feature.remote.js'
// CONTEXT
import { AdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
// TYPES
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { ListResponse } from '#lib/types.js'

const views: ResourceViewCtx[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const view of views.splice(0)) view.dispose()
})

function setup() {
  const view = new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    new ResponsiveCtx(),
    undefined,
    'admin',
  )
  views.push(view)
  return { view, admin: new AdminCtx(view) }
}

function page(
  ids: string[],
  hasMore = false,
  nextOffset: number | null = null,
): ListResponse<FeatureFromCollection> {
  return {
    data: ids.map(id => ({ id }) as FeatureFromCollection),
    totalCount: ids.length,
    hasMore,
    nextOffset,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('admin Feature collection pagination', () => {
  it('shares the initial request, appends unique rows, and reuses pages on return', async () => {
    const { view, admin } = setup()
    const first = deferred<ListResponse<FeatureFromCollection>>()
    const request = vi
      .spyOn(featureRemote, 'getFeatures')
      .mockReturnValueOnce(first.promise as never)
      .mockResolvedValueOnce(page(['b', 'c']) as never)
    const initial = admin.ensureFeatureIndex()
    const repeated = admin.ensureFeatureIndex()
    expect(request).toHaveBeenCalledTimes(1)
    first.resolve(page(['a', 'b'], true, 2))
    await Promise.all([initial, repeated])
    await admin.loadMoreFeatures()
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['a', 'b', 'c'])
    expect(request.mock.calls.map(([input]) => input.pagination)).toEqual([
      { limit: 50, offset: 0 },
      { limit: 50, offset: 2 },
    ])
    expect(admin.featureHasMore).toBe(false)
    await admin.ensureFeatureIndex()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('does not append two copies when scrolling requests overlap', async () => {
    const { view, admin } = setup()
    const next = deferred<ListResponse<FeatureFromCollection>>()
    const request = vi
      .spyOn(featureRemote, 'getFeatures')
      .mockResolvedValueOnce(page(['a'], true, 1) as never)
      .mockReturnValueOnce(next.promise as never)
    await admin.ensureFeatureIndex()
    const pending = admin.loadMoreFeatures()
    await admin.loadMoreFeatures()
    expect(request).toHaveBeenCalledTimes(2)
    next.resolve(page(['b']))
    await pending
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['a', 'b'])
  })

  it.each(['project', 'organisation', 'sort'] as const)(
    'rejects a late first page after a %s change, even before another request starts',
    async change => {
      const { view, admin } = setup()
      const first = deferred<ListResponse<FeatureFromCollection>>()
      vi.spyOn(featureRemote, 'getFeatures').mockReturnValue(first.promise as never)
      const pending = admin.ensureFeatureIndex()
      if (change === 'sort') view.filters.sorting.feature.sortOrder = 'asc'
      else view.scope.prisms[change] = ['new-scope']
      first.resolve(page(['obsolete'], true, 1))
      await pending
      expect(view.queries.rows.feature).toEqual([])
      expect(admin.featureIndexReady).toBe(false)
      expect(admin.featureHasMore).toBe(false)
    },
  )

  it('keeps new-scope loading state when an old continuation resolves', async () => {
    const { view, admin } = setup()
    const oldNext = deferred<ListResponse<FeatureFromCollection>>()
    const newNext = deferred<ListResponse<FeatureFromCollection>>()
    vi.spyOn(featureRemote, 'getFeatures')
      .mockResolvedValueOnce(page(['old'], true, 1) as never)
      .mockReturnValueOnce(oldNext.promise as never)
      .mockResolvedValueOnce(page(['new'], true, 1) as never)
      .mockReturnValueOnce(newNext.promise as never)
    await admin.ensureFeatureIndex()
    const obsolete = admin.loadMoreFeatures()
    view.scope.prisms.project = ['new-project']
    await admin.ensureFeatureIndex()
    const current = admin.loadMoreFeatures()
    oldNext.resolve(page(['obsolete']))
    await obsolete
    expect(admin.featureLoadingMore).toBe(true)
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['new'])
    newNext.resolve(page(['next']))
    await current
    expect(admin.featureLoadingMore).toBe(false)
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['new', 'next'])
  })

  it('rejects a continuation from before a same-scope refresh', async () => {
    const { view, admin } = setup()
    const next = deferred<ListResponse<FeatureFromCollection>>()
    vi.spyOn(featureRemote, 'getFeatures')
      .mockResolvedValueOnce(page(['a'], true, 1) as never)
      .mockReturnValueOnce(next.promise as never)
      .mockResolvedValueOnce(page(['fresh']) as never)
    await admin.ensureFeatureIndex()
    const obsolete = admin.loadMoreFeatures()
    await view.queries.refreshFeatures(false)
    next.resolve(page(['obsolete']))
    await obsolete
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['fresh'])
    expect(admin.featureHasMore).toBe(false)
  })

  it('retains existing rows after an error and retries the same offset', async () => {
    const { view, admin } = setup()
    const error = new Error('temporary network failure')
    const request = vi
      .spyOn(featureRemote, 'getFeatures')
      .mockResolvedValueOnce(page(['a'], true, 1) as never)
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(page(['b']) as never)
    await admin.ensureFeatureIndex()
    await admin.loadMoreFeatures()
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['a'])
    expect(admin.featurePageError).toBe(error)
    expect(admin.featureHasMore).toBe(true)
    await admin.loadMoreFeatures()
    expect(
      request.mock.calls.slice(1).map(([input]) => input.pagination?.offset),
    ).toEqual([1, 1])
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['a', 'b'])
    expect(admin.featurePageError).toBeNull()
  })

  it('reconciles optimistic first-page rows without discarding later pages or retaining rolled-back creates', async () => {
    const { view, admin } = setup()
    vi.spyOn(featureRemote, 'getFeatures')
      .mockResolvedValueOnce(page(['a'], true, 1) as never)
      .mockResolvedValueOnce(page(['b']) as never)
    await admin.ensureFeatureIndex()
    const query = view.cacheCtx.featureCollection
    await admin.loadMoreFeatures()
    admin.syncFeatureCollection(query, page(['pending:create', 'a'], true, 1))
    expect(view.queries.rows.feature.map(row => row.id)).toEqual([
      'pending:create',
      'a',
      'b',
    ])
    admin.syncFeatureCollection(query, page(['a'], true, 1))
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['a', 'b'])
    admin.syncFeatureCollection(
      Promise.resolve(page(['foreign'])) as never,
      page(['foreign']),
    )
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['a', 'b'])
    view.scope.prisms.project = ['other-project']
    admin.syncFeatureCollection(query, page(['obsolete']))
    expect(view.queries.rows.feature.map(row => row.id)).toEqual(['a', 'b'])
  })
})
