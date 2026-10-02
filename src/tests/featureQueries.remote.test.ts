// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { latLngToCell } from 'h3-js'
import { withRemoteMeta } from './remote-function-mock'

const { ctx, authorize, queryPage, queryConditions, batchFactory } = vi.hoisted(() => ({
  ctx: {
    db: {},
    user: { id: 'me', superAdmin: false },
    userRoles: [],
    isAdminRequest: false,
    event: { locals: { hub: { id: 'hub', code: 'test' } } },
  },
  authorize: vi.fn(() => ({ allowed: true, code: undefined as string | undefined })),
  queryPage: vi.fn(async () => ({
    data: [],
    totalCount: 2,
    facets: {
      divisions: {
        central: {
          id: 'central',
          level: 5,
          category: 'hood',
          class: 'neighbourhood',
          count: 2,
          i18n: { en: { name: 'Central' } },
        },
      },
    },
    nextCursor: { id: 'next', signature: '' },
  })),
  queryConditions: vi.fn((..._args: unknown[]) => ({ conditions: ['authorized'] })),
  batchFactory: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedBatchQuery: (
    schema: { parse: (input: unknown) => unknown },
    handler: (inputs: unknown[], ctx: unknown) => Promise<(input: unknown) => unknown>,
  ) => {
    batchFactory.mockImplementation(handler)
    return withRemoteMeta(async (input: unknown) => {
      const parsed = schema.parse(input)
      const resolve = await batchFactory([parsed], ctx)
      return resolve(parsed)
    }, 'query_batch')
  },
}))
vi.mock('#lib/api/services/authz/index.js', () => ({
  authorizeFeatureListForContext: authorize,
  toAuthMessage: (message: string) => message,
}))
vi.mock('#lib/api/services/feature.js', () => ({
  toQueryConditions: queryConditions,
  toRequestedListState: (state: unknown) => state,
}))
vi.mock('#lib/db/services/featureQuery.js', async original => ({
  ...(await original<object>()),
  queryFeaturePage: queryPage,
}))
import { getFeaturePage } from '#lib/api/featureQueries.remote.js'
import { featureQuerySignature } from '#lib/db/services/featureQuery.js'

const input = { meta: { isAdminRequest: false, scope: 'cache' } }
beforeEach(() => {
  vi.clearAllMocks()
  ctx.user.superAdmin = false
  ctx.isAdminRequest = false
  authorize.mockReturnValue({ allowed: true, code: undefined })
})

describe('feature page remote boundary', () => {
  it("keeps each item's admin intent when a native POST batch mixes scopes", async () => {
    const admin = { meta: { isAdminRequest: true, scope: 'admin' } }
    ctx.isAdminRequest = true
    const resolve = await batchFactory([input, admin], ctx)
    await resolve(input)
    await resolve(admin)
    expect(queryConditions.mock.calls.map(call => call[2])).toEqual([false, true])
  })

  it('passes bounded marker exclusions and count omission to the service', async () => {
    const request = {
      ...input,
      includeCounts: false,
      excludeIds: Array.from({ length: 500 }, (_, index) => `feature-${index}`),
    }
    await getFeaturePage(request)
    expect(queryPage).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining(request),
      ['authorized'],
      ctx.event.locals.hub,
      'me',
    )
    await expect(
      getFeaturePage({ ...request, excludeIds: [...request.excludeIds, 'too-many'] }),
    ).rejects.toThrow()
  })

  it('binds cursors to excluded marker identities', async () => {
    const request = { ...input, excludeIds: ['a'] }
    await expect(
      getFeaturePage({
        ...request,
        excludeIds: ['b'],
        cursor: { id: 'next', signature: await featureQuerySignature(request) },
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(queryPage).not.toHaveBeenCalled()
  })
  it('accepts more than 12 active filters and inactive controls', async () => {
    const properties = Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [
        `property-${index}`,
        index % 2 ? ['selected'] : [],
      ]),
    )
    await getFeaturePage({ ...input, filters: { properties: { layer: properties } } })
    expect(queryPage).toHaveBeenCalledOnce()
    expect(queryPage).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining({ filters: { properties: { layer: properties } } }),
      ['authorized'],
      ctx.event.locals.hub,
      'me',
    )
  })
  it('requires a list filter for visited date sorting', async () => {
    await expect(
      getFeaturePage({ ...input, sorting: { sortBy: 'visitedAt', sortOrder: 'desc' } }),
    ).rejects.toMatchObject({ status: 400 })
    expect(queryPage).not.toHaveBeenCalled()
  })
  it('preserves authoritative counts and enriches own-list filters without changing cursor identity', async () => {
    const request = { ...input, filters: { list: { listId: 'wishlist' as const } } }
    const page = await getFeaturePage(request)
    expect(queryPage).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining({
        filters: { list: { userId: 'me', listId: 'wishlist' } },
      }),
      ['authorized'],
      ctx.event.locals.hub,
      'me',
    )
    expect(page.totalCount).toBe(2)
    expect(page.nextCursor?.signature).toBe(await featureQuerySignature(request))
    await getFeaturePage({ ...request, cursor: page.nextCursor })
    expect(queryPage).toHaveBeenCalledTimes(2)
  })

  it('rejects a cursor reused after changing filters', async () => {
    await expect(
      getFeaturePage({
        ...input,
        q: 'changed',
        cursor: { id: 'next', signature: await featureQuerySignature(input) },
      }),
    ).rejects.toMatchObject({ status: 400 })
    expect(queryPage).not.toHaveBeenCalled()
  })

  it('authorizes each page before querying', async () => {
    authorize.mockReturnValue({ allowed: false, code: 'INSUFFICIENT_ROLE' })
    await expect(getFeaturePage(input)).rejects.toMatchObject({ status: 403 })
    expect(queryPage).not.toHaveBeenCalled()
  })

  it('rejects targeting another private list unless the actor is a super-admin', async () => {
    const request = {
      ...input,
      filters: { list: { userId: 'other', listId: 'visited' as const } },
    }
    await expect(getFeaturePage(request)).rejects.toMatchObject({ status: 403 })
    expect(queryPage).not.toHaveBeenCalled()
    ctx.user.superAdmin = true
    await getFeaturePage(request)
    expect(queryPage).toHaveBeenCalledOnce()
  })

  it('rejects invalid/mismatched H3 cells and unbounded page sizes before querying', async () => {
    await expect(
      getFeaturePage({ ...input, spatial: { resolution: 7, cells: ['invalid'] } }),
    ).rejects.toThrow()
    await expect(
      getFeaturePage({
        ...input,
        spatial: { resolution: 8, cells: [latLngToCell(22, 114, 7)] },
      }),
    ).rejects.toThrow()
    await expect(getFeaturePage({ ...input, limit: 10000 })).rejects.toThrow()
    expect(queryPage).not.toHaveBeenCalled()
  })
})
