// @vitest-environment node
// TESTS
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withRemoteMeta, mockedRemoteModule } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  baseline: vi.fn(),
  publication: vi.fn(),
  find: vi.fn(),
  capture: vi.fn(),
  ctx: {
    isAdminRequest: true,
    user: { id: 'admin', superAdmin: true, isAnonymous: false },
    db: { get: vi.fn(), all: vi.fn() },
    event: {
      locals: { platform: { env: { SAANSEOI_API_KEY: 'test-key' } } },
      fetch: vi.fn(),
    },
  },
}))
vi.mock('#lib/api/server/guarded', () => {
  const wrap = (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, ctx: unknown) => Promise<unknown>,
  ) =>
    withRemoteMeta(
      async (input: unknown) => handler(schema.parse(input), mocks.ctx),
      'command',
    )
  return { guardedQuery: wrap, guardedCommand: wrap }
})
vi.mock('#lib/db/services/locationDirectory.js', () => ({
  listLocationResources: mocks.list,
}))
vi.mock('#lib/db/services/locationIdentityReview.js', () => ({
  readLocationIdentityBaseline: mocks.baseline,
  captureLocationIdentityReview: mocks.capture,
}))
vi.mock('#lib/locations/publication.js', () => ({
  discoverLocationPublication: mocks.publication,
}))
vi.mock('#lib/locations/sourceLookup.js', () => ({ findSaanSeoiPlace: mocks.find }))
vi.mock('#lib/locations/sourceEndpoint.server.js', () => ({
  locationSourceEndpoint: (apiKey: string) => ({
    apiKey,
    baseUrl: 'http://example.test',
  }),
}))
import evidence from '#lib/locations/mtrMatchEvidence.json'
import * as module from '#lib/api/locationMatcher.remote.js'
const remote = mockedRemoteModule(module)
const meta = { isAdminRequest: true }
const input = {
  locationId: 'local-shop',
  expectedSourceHash: 'hash',
  ssId: 'ss-shop',
  resourceReleaseId: 'release',
  meta,
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.ctx.db.all.mockResolvedValue([
    {
      id: 'local-shop',
      sourceKey: evidence.rows.find(row => row.category === 'exact')!.sourceKey,
      ssId: null,
    },
  ])
  mocks.ctx.isAdminRequest = true
  mocks.ctx.user.superAdmin = true
  mocks.ctx.user.isAnonymous = false
  mocks.list.mockResolvedValue({
    data: [{ id: 'local-shop', draftVersion: 'hash' }],
    nextCursor: null,
    totalCount: 1,
  })
  mocks.baseline.mockResolvedValue({
    locationId: 'local-shop',
    expectedLatestContentHash: 'hash',
  })
  mocks.publication.mockResolvedValue({ pin: { releaseSet: 'release-set' } })
  mocks.find.mockResolvedValue({
    projection: { ssId: 'ss-shop', releaseId: 'release' },
  })
  mocks.capture.mockResolvedValue('review')
})
describe('application Location matcher', () => {
  it.each(['anonymous', 'non-super-admin', 'non-admin-request'])(
    'denies %s before reading shared drafts or fetching candidates',
    async role => {
      if (role === 'anonymous') mocks.ctx.user.isAnonymous = true
      if (role === 'non-super-admin') mocks.ctx.user.superAdmin = false
      if (role === 'non-admin-request') mocks.ctx.isAdminRequest = false
      await expect(remote.getLocationMatcherQueue({ meta })).rejects.toMatchObject({
        status: 403,
      })
      await expect(remote.prepareLocationMatcherReview(input)).rejects.toMatchObject({
        status: 403,
      })
      expect(mocks.list).not.toHaveBeenCalled()
      expect(mocks.find).not.toHaveBeenCalled()
    },
  )
  it('queries the shared MTR evidence cohort without organisation or Feature scope', async () => {
    const result = await remote.getLocationMatcherQueue({ q: 'KOT 122', meta })
    expect(result.counts).toEqual({
      all: 1,
      matched: 0,
      exact: 1,
      code: 0,
      name: 0,
      none: 0,
    })
    expect(mocks.list).toHaveBeenCalledWith(
      mocks.ctx.db,
      expect.objectContaining({
        publication: 'all',
        searchAddress: true,
        q: 'KOT 122',
      }),
    )
    expect(mocks.list.mock.calls[0][1]).not.toHaveProperty('organisationId')
  })
  it('filters the selected evidence bucket before directory pagination and counts independently of search', async () => {
    const sourceKey = evidence.rows.find(row => row.category === 'exact')!.sourceKey
    mocks.ctx.db.all.mockResolvedValue([
      { id: 'accepted', sourceKey, ssId: 'ss-accepted' },
    ])
    const result = await remote.getLocationMatcherQueue({
      category: 'exact',
      q: 'KOT',
      meta,
    })
    expect(result.counts.matched).toBe(1)
    expect(result.counts.exact).toBe(0)
    expect(mocks.list).toHaveBeenCalledWith(
      mocks.ctx.db,
      expect.objectContaining({ ids: [], q: 'KOT' }),
    )
  })
  it('rejects injected organisation scope instead of changing the global queue', async () => {
    await expect(
      remote.getLocationMatcherQueue({ meta, organisationId: 'private' } as never),
    ).rejects.toThrow()
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('rejects an unavailable or private target before upstream discovery', async () => {
    mocks.list.mockResolvedValue({ data: [] })
    await expect(remote.prepareLocationMatcherReview(input)).rejects.toMatchObject({
      status: 409,
    })
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('rejects a draft edited between directory lookup and baseline capture', async () => {
    mocks.baseline.mockResolvedValue({ expectedLatestContentHash: 'new-hash' })
    await expect(remote.prepareLocationMatcherReview(input)).rejects.toMatchObject({
      status: 409,
    })
    expect(mocks.find).not.toHaveBeenCalled()
  })
  it('rejects a changed source release without capturing a review', async () => {
    mocks.find.mockResolvedValue({ projection: { releaseId: 'other-release' } })
    await expect(remote.prepareLocationMatcherReview(input)).rejects.toMatchObject({
      status: 409,
    })
    expect(mocks.capture).not.toHaveBeenCalled()
  })
  it('captures exact server-fetched evidence without accepting an identity', async () => {
    expect(await remote.prepareLocationMatcherReview(input)).toEqual({
      reviewId: 'review',
    })
    expect(mocks.baseline).toHaveBeenCalledWith(mocks.ctx.db, 'local-shop', null)
    expect(mocks.capture).toHaveBeenCalledWith(
      mocks.ctx.db,
      expect.objectContaining({ expectedLatestContentHash: 'hash' }),
      { ssId: 'ss-shop', releaseId: 'release' },
      'admin',
    )
  })
})
