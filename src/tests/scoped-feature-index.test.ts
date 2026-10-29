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
