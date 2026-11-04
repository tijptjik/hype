// TESTS
import { afterEach, describe, expect, it, vi } from 'vitest'
// API
import * as featureRemote from '#lib/api/feature.remote.js'
// CONTEXT
import { AdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
// SERVICES
import { createScopedFeatureView } from '#lib/client/services/scopedFeatureView.js'
import {
  getAdminFacetTabsForResource,
  getSupportedFacetForResource,
} from '#lib/navigation/facets.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'

const views: ResourceViewCtx[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const view of views.splice(0)) view.dispose()
})

describe('entity feature tabs', () => {
  it.each(['organisation', 'project', 'layer'] as const)(
    'pages only the %s ID without inheriting or modifying global selections',
    async resource => {
      const parent = new ResourceViewCtx(
        new DivisionCtx(),
        new AccountState(),
        new ResponsiveCtx(),
        undefined,
        'admin',
      )
      views.push(parent)
      const globalPrisms = {
        organisation: ['other-org'],
        project: ['other-project'],
        layer: ['other-layer'],
      }
      parent.scope.prisms = structuredClone(globalPrisms)
      parent.filters.values.feature.text = 'global search'
      const scoped = createScopedFeatureView(parent, resource, 'target-id')
      views.push(scoped)
      const admin = new AdminCtx(scoped)
      const request = vi
        .spyOn(featureRemote, 'getFeatures')
        .mockResolvedValueOnce({
          data: [{ id: 'a' }],
          totalCount: 2,
          hasMore: true,
          nextOffset: 1,
        } as never)
        .mockResolvedValueOnce({
          data: [{ id: 'b' }],
          totalCount: 2,
          hasMore: false,
        } as never)

      expect(scoped.getListQueryMeta(scoped.featuresQueryKey())).toBeNull()
      await admin.ensureFeatureIndex()
      expect(scoped.getListQueryMeta(scoped.featuresQueryKey())?.totalCount).toBe(2)
      // Changing unrelated global prisms while this tab is open cannot change its next page.
      parent.scope.prisms.layer.push('another-layer')
      await admin.loadMoreFeatures()
      expect(request.mock.calls.map(([input]) => input.prisms)).toEqual([
        { organisation: [], project: [], layer: [], [resource]: ['target-id'] },
        { organisation: [], project: [], layer: [], [resource]: ['target-id'] },
      ])
      expect(scoped.queries.rows.feature.map(row => row.id)).toEqual(['a', 'b'])
      expect(parent.queries.rows.feature).toEqual([])
      expect(parent.cacheCtx.featureCollection).not.toBe(
        scoped.cacheCtx.featureCollection,
      )
      expect(parent.filters.values.feature.text).toBe('global search')
      expect(scoped.filters.values.feature.text || '').toBe('')
      expect(parent.scope.prisms).toEqual({
        ...globalPrisms,
        layer: ['other-layer', 'another-layer'],
      })
      expect(scoped.account).toBe(parent.account)
      expect(
        getSupportedFacetForResource(FirstClassResource[resource], 'features'),
      ).toBe('features')
      expect(
        getAdminFacetTabsForResource(FirstClassResource[resource]).has('features'),
      ).toBe(true)
      expect(
        getAdminFacetTabsForResource(FirstClassResource[resource], {
          coreOnly: true,
        }).has('features'),
      ).toBe(false)
    },
  )
})

/** Creates an admin index owner registered for teardown. */
function createIndex() {
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

it('starts a new first-page request after reset instead of joining an obsolete read', async () => {
  const { view, admin } = createIndex()
  let resolve!: (value: unknown) => void
  const pending = new Promise(resolvePromise => {
    resolve = resolvePromise
  })
  const request = vi
    .spyOn(featureRemote, 'getFeatures')
    .mockReturnValueOnce(pending as never)
    .mockResolvedValueOnce({
      data: [{ id: 'new' }],
      totalCount: 1,
      hasMore: false,
    } as never)
  const older = admin.ensureFeatureIndex()
  view.clearAllCaches()
  const replacement = admin.ensureFeatureIndex()
  // Settle the obsolete request even on failure so the test leaves no pending reads.
  const calls = request.mock.calls.length
  resolve({ data: [{ id: 'old' }], totalCount: 99, hasMore: true })
  await Promise.all([older, replacement])
  expect(calls).toBe(2)
  expect(view.queries.rows.feature.map(row => row.id)).toEqual(['new'])
  expect(view.getListQueryMeta(view.featuresQueryKey())?.totalCount).toBe(1)
})

it('does not restore first-page metadata after reset without a replacement', async () => {
  const { view, admin } = createIndex()
  let resolve!: (value: unknown) => void
  const pending = new Promise(resolvePromise => {
    resolve = resolvePromise
  })
  vi.spyOn(featureRemote, 'getFeatures').mockReturnValueOnce(pending as never)
  const read = admin.ensureFeatureIndex()
  view.clearAllCaches()
  resolve({ data: [{ id: 'old' }], totalCount: 99, hasMore: true })
  await read
  expect(view.getListQueryMeta(view.featuresQueryKey())).toBeNull()
  expect(admin.featureIndexReady).toBe(false)
})

it('reloads a previously ready index after cache reset', async () => {
  const { view, admin } = createIndex()
  const request = vi
    .spyOn(featureRemote, 'getFeatures')
    .mockResolvedValueOnce({ data: [{ id: 'old' }], hasMore: false } as never)
    .mockResolvedValueOnce({ data: [{ id: 'new' }], hasMore: false } as never)
  await admin.ensureFeatureIndex()
  view.clearAllCaches()
  await admin.ensureFeatureIndex()
  expect(request).toHaveBeenCalledTimes(2)
  expect(view.queries.rows.feature.map(row => row.id)).toEqual(['new'])
})

it('rejects a continuation page that finishes after cache reset', async () => {
  const { view, admin } = createIndex()
  let resolve!: (value: unknown) => void
  const pending = new Promise(resolvePromise => {
    resolve = resolvePromise
  })
  vi.spyOn(featureRemote, 'getFeatures')
    .mockResolvedValueOnce({
      data: [{ id: 'first' }],
      hasMore: true,
      nextOffset: 1,
    } as never)
    .mockReturnValueOnce(pending as never)
  await admin.ensureFeatureIndex()
  const more = admin.loadMoreFeatures()
  view.clearAllCaches()
  resolve({ data: [{ id: 'obsolete' }], hasMore: false })
  await more
  expect(view.cache.feature.has('obsolete')).toBe(false)
  expect(view.queries.rows.feature.some(row => row.id === 'obsolete')).toBe(false)
})
