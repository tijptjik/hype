// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const { ctx, authorize, query, conditions } = vi.hoisted(() => ({
  ctx: {
    db: {},
    user: { id: 'user', isAnonymous: false },
    userRoles: [],
    isAdminRequest: true,
    event: { locals: { hub: { id: 'hub' } } },
  },
  authorize: vi.fn(() => ({ allowed: true, code: undefined as string | undefined })),
  query: vi.fn(async () => ({
    data: [],
    totalCount: 12,
    hasMore: false,
    nextOffset: null,
  })),
  conditions: vi.fn(() => ({ conditions: ['trusted-scope'] })),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    withRemoteMeta(
      async (input: unknown) => handler(schema.parse(input), ctx),
      'query',
    ),
}))
vi.mock('#lib/api/services/authz/feature.js', () => ({
  authorizeFeatureListForContext: authorize,
}))
vi.mock('#lib/api/services/authz/index.js', () => ({
  toAuthMessage: (value: string) => value,
}))
vi.mock('#lib/api/services/feature.js', () => ({
  toQueryConditions: conditions,
  toRequestedListState: (value: unknown) => value,
}))
vi.mock('#lib/db/services/featureIndex.js', () => ({ queryFeatureIndex: query }))
import { getFeatureIndexPage } from '#lib/api/featureIndex.remote.js'
beforeEach(() => {
  vi.clearAllMocks()
  ctx.user.isAnonymous = false
  ctx.isAdminRequest = true
  authorize.mockReturnValue({ allowed: true, code: undefined })
})

describe('filtered feature query authorization', () => {
  it('passes the complete filter contract alongside trusted scope and hub predicates', async () => {
    const input = {
      filters: { isArchived: false, hasImage: true },
      q: 'signage',
      prisms: { organisation: ['org'] },
      includeCount: false,
    }
    await getFeatureIndexPage(input)
    expect(query).toHaveBeenCalledWith(
      ctx.db,
      expect.objectContaining(input),
      ['trusted-scope'],
      ctx.event.locals.hub,
      expect.any(String),
    )
  })
  it('denies unauthorized counts before calling the database service', async () => {
    authorize.mockReturnValue({ allowed: false, code: 'INSUFFICIENT_ROLE' })
    await expect(
      getFeatureIndexPage({ filters: { isArchived: false } }),
    ).rejects.toMatchObject({ status: 403 })
    expect(query).not.toHaveBeenCalled()
  })
  it('rejects anonymous reads and invalid filter names', async () => {
    ctx.user.isAnonymous = true
    await expect(getFeatureIndexPage({})).rejects.toMatchObject({ status: 403 })
    ctx.user.isAnonymous = false
    await expect(
      getFeatureIndexPage({ filters: { invented: true } } as never),
    ).rejects.toThrow()
    expect(query).not.toHaveBeenCalled()
  })
})
