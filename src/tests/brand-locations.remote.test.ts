// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
import { withRemoteMeta } from './remote-function-mock'
const mocks = vi.hoisted(() => ({
  catalogue: vi.fn(),
  list: vi.fn(),
  search: vi.fn(),
  persist: vi.fn(),
  publication: vi.fn(),
  find: vi.fn(),
  authorize: vi.fn(),
  probe: vi.fn(),
  baseline: vi.fn(),
  capture: vi.fn(),
  ctx: {
    user: { isAnonymous: false, superAdmin: true, id: 'admin' },
    db: { get: vi.fn() },
    event: {
      locals: { platform: { env: { SAANSEOI_API_KEY: 'test' } } },
      fetch: vi.fn(),
    },
  },
}))
vi.mock('#lib/api/server/guarded.js', () => {
  const wrap =
    (kind: 'query' | 'command') =>
    (
      schema: { parse: (input: unknown) => unknown },
      handler: (input: unknown, ctx: unknown) => Promise<unknown>,
    ) =>
      withRemoteMeta(
        async (input: unknown) => handler(schema.parse(input), mocks.ctx),
        kind,
      )
  return { guardedQuery: wrap('query'), guardedCommand: wrap('command') }
})
vi.mock('#lib/api/services/locationOwnership', () => ({
  requireLocationOrganisationManager: mocks.authorize,
}))
vi.mock('#lib/db/services/identityCatalogue.js', () => ({
  readIdentityCatalogue: mocks.catalogue,
}))
vi.mock('#lib/db/services/locationDirectory.js', () => ({
  listLocationResources: mocks.list,
}))
vi.mock('#lib/db/services/locationSource.js', () => ({
  persistSaanSeoiPlace: mocks.persist,
}))
vi.mock('#lib/db/services/locationIdentityReview.js', () => ({
  probeLocationIdentityScope: mocks.probe,
  readLocationIdentityBaseline: mocks.baseline,
  captureLocationIdentityReview: mocks.capture,
}))
vi.mock('#lib/locations/sourceClient.js', () => ({
  searchSaanSeoiPlacesPage: mocks.search,
}))
vi.mock('#lib/locations/publication.js', () => ({
  discoverLocationPublication: mocks.publication,
}))
vi.mock('#lib/locations/sourceLookup.js', () => ({ findSaanSeoiPlace: mocks.find }))
import {
  discoverBrandLocations,
  getBrandLocations,
  addBrandLocationCandidate,
} from '#lib/api/brandLocations.remote.js'
const input = { brandId: 'brand', q: 'AROME', locale: 'en' as const }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.ctx.user.isAnonymous = false
  mocks.ctx.user.superAdmin = true
  mocks.catalogue.mockResolvedValue({ kind: 'brand' })
  mocks.search.mockResolvedValue({
    candidates: [
      {
        placeId: 'ss-one',
        resourceReleaseId: 'r',
        nameText: 'AROME Central',
        brandText: 'AROME',
      },
      {
        placeId: 'ss-two',
        resourceReleaseId: 'r',
        nameText: 'AROME Cafe',
        brandText: null,
      },
    ],
    nextCursor: 'next',
  })
  mocks.publication.mockResolvedValue({ pin: {} })
  mocks.find.mockResolvedValue({ projection: { ssId: 'ss-one', releaseId: 'r' } })
})
it('keeps source names as candidates and never imports during discovery', async () => {
  const result = await discoverBrandLocations(input)
  expect(result.rows.map(row => row.match)).toEqual(['name', 'name'])
  expect(result.nextCursor).toBe('next')
  expect(mocks.persist).not.toHaveBeenCalled()
})
it('filters Hype presence and linked Features independently and retains an empty-page cursor', async () => {
  mocks.ctx.db.get
    .mockResolvedValueOnce({ id: 'local', linked: 1, brandId: 'brand' })
    .mockResolvedValueOnce(null)
  const result = await discoverBrandLocations({
    ...input,
    hype: false,
    linkedFeatures: true,
  })
  expect(result.rows).toEqual([])
  expect(result.nextCursor).toBe('next')
})
it('labels only a curated catalogue link as a brand match', async () => {
  mocks.ctx.db.get.mockResolvedValueOnce({ id: 'local', linked: 0, brandId: 'brand' })
  const result = await discoverBrandLocations(input)
  expect(result.rows.map(row => row.match)).toEqual(['brand', 'name'])
})
it('requires a managed organisation scope for non-admin discovery', async () => {
  mocks.ctx.user.superAdmin = false
  await expect(discoverBrandLocations(input)).rejects.toMatchObject({ status: 403 })
  expect(mocks.search).not.toHaveBeenCalled()
})
it('forwards local filters before paging rather than filtering the returned slice', async () => {
  await getBrandLocations({
    brandId: 'brand',
    taxonomyCategory: 'bakery',
    upstream: false,
    linkedFeatures: true,
    after: 'cursor',
  })
  expect(mocks.list).toHaveBeenCalledWith(
    mocks.ctx.db,
    expect.objectContaining({
      brandId: 'brand',
      taxonomyCategory: 'bakery',
      upstream: false,
      linkedFeatures: true,
      after: 'cursor',
    }),
  )
})
it('rejects changed source evidence before any import', async () => {
  await expect(
    addBrandLocationCandidate({
      brandId: 'brand',
      ssId: 'ss-one',
      resourceReleaseId: 'old',
    }),
  ).rejects.toMatchObject({ status: 409 })
  expect(mocks.persist).not.toHaveBeenCalled()
})
it('prepares an explicit identity review instead of silently relinking', async () => {
  mocks.probe.mockResolvedValue({ ownerOrganisationId: null, state: 'unresolved' })
  mocks.baseline.mockResolvedValue({ locationId: 'target' })
  mocks.capture.mockResolvedValue('review')
  expect(
    await addBrandLocationCandidate({
      brandId: 'brand',
      ssId: 'ss-one',
      resourceReleaseId: 'r',
      locationId: 'target',
    }),
  ).toEqual({ locationId: 'target', reviewId: 'review' })
  expect(mocks.persist).not.toHaveBeenCalled()
})

it('displays the original source label without search aliases or empty brand separators', async () => {
  mocks.search.mockResolvedValue({
    candidates: [
      {
        placeId: 'ss-one',
        resourceReleaseId: 'r',
        nameText: 'Arome Bakery\u001farome bakery',
        brandText: '\u001f',
      },
    ],
    nextCursor: null,
  })
  const result = await discoverBrandLocations(input)
  expect(result.rows[0]).toMatchObject({
    name: 'Arome Bakery',
    brand: null,
    ssId: 'ss-one',
    match: 'name',
  })
})

it('uses embedded branch addresses only when their identity and release match', async () => {
  const preview = {
    place: {
      id: 'ss-one',
      resourceReleaseId: 'r',
      geometry: { type: 'Point', coordinates: [114.1, 22.3] },
    },
    i18n: { en: { name: 'AROME Central', freeformAddress: '10 Example Street' } },
  }
  mocks.search.mockResolvedValue({
    candidates: [
      {
        placeId: 'ss-one',
        resourceReleaseId: 'r',
        nameText: 'Search name',
        brandText: null,
        preview,
      },
      {
        placeId: 'ss-two',
        resourceReleaseId: 'r',
        nameText: 'Other branch',
        brandText: null,
        preview,
      },
    ],
    nextCursor: null,
  })
  const result = await discoverBrandLocations(input)
  expect(result.rows[0]).toMatchObject({
    name: 'AROME Central',
    address: '10 Example Street',
    coordinates: [114.1, 22.3],
  })
  expect(result.rows[1]).toMatchObject({
    name: 'Other branch',
    address: null,
    coordinates: null,
  })
})

it('allows category-only discovery and forwards category pagination', async () => {
  const result = await discoverBrandLocations({
    ...input,
    q: '  ',
    filters: { taxonomyCategory: 'bakery' },
    cursor: 'category-page',
  })
  expect(mocks.search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      q: '',
      filters: { taxonomyCategory: 'bakery' },
      cursor: 'category-page',
    }),
  )
  expect(result.rows).toHaveLength(2)
})

it('rejects discovery without either a term or category', async () => {
  await expect(discoverBrandLocations({ ...input, q: '  ' })).rejects.toThrow(
    'Enter a search term or select a category',
  )
  expect(mocks.search).not.toHaveBeenCalled()
})
