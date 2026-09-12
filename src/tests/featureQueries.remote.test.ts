// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { latLngToCell } from 'h3-js'
import { withRemoteMeta } from './remote-function-mock'

const { ctx, authorize, queryPage, queryConditions } = vi.hoisted(() => ({
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
    facets: { neighbourhoods: { Central: 2 } },
    nextCursor: { id: 'next', signature: '' },
  })),
  queryConditions: vi.fn(() => ({ conditions: ['authorized'] })),
}))
vi.mock('$lib/api/server/remote', () => ({
  guardedQuery: (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (input: unknown) => handler(schema.parse(input), ctx),
      'query',
    ),
}))
vi.mock('$lib/api/services/authz', () => ({
  authorizeFeatureListForContext: authorize,
  toAuthMessage: (message: string) => message,
}))
vi.mock('$lib/api/services/feature', () => ({
  toQueryConditions: queryConditions,
  toRequestedListState: (state: unknown) => state,
}))
vi.mock('$lib/db/services/featureQuery', async original => ({
  ...(await original<object>()),
  queryFeaturePage: queryPage,
}))
import { getFeaturePage } from '$lib/api/server/featureQueries.remote'
import { featureQuerySignature } from '$lib/db/services/featureQuery'

const input = { meta: { isAdminRequest: false, scope: 'cache' } }
beforeEach(() => {
  vi.clearAllMocks()
  ctx.user.superAdmin = false
  authorize.mockReturnValue({ allowed: true, code: undefined })
})

describe('feature page remote boundary', () => {
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
    expect(page.nextCursor?.signature).toBe(featureQuerySignature(request))
    await getFeaturePage({ ...request, cursor: page.nextCursor })
    expect(queryPage).toHaveBeenCalledTimes(2)
  })

  it('rejects a cursor reused after changing filters', async () => {
    await expect(
      getFeaturePage({
        ...input,
        q: 'changed',
        cursor: { id: 'next', signature: featureQuerySignature(input) },
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
