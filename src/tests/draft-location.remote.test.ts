// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  nextCursor: null as string | null,
  nearby: vi.fn(),
  preview: vi.fn(),
  context: {
    user: { isAnonymous: false },
    event: {
      locals: { platform: { env: { SAANSEOI_API_KEY: 'test-key' } } },
      fetch: vi.fn(),
    },
  },
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    Object.assign((input: unknown) => handler(schema.parse(input), mocks.context), {
      __: { type: 'query' },
    }),
}))
vi.mock('#lib/locations/sourceClient.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  searchSaanSeoiPlacesPage: async (...args: unknown[]) => ({
    candidates: await mocks.search(...args),
    nextCursor: mocks.nextCursor,
  }),
}))
vi.mock('#lib/locations/sourcePreview.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  readSaanSeoiPlacePreview: mocks.preview,
}))
vi.mock('#lib/locations/nearbySource.js', () => ({
  searchNearbySaanSeoiPlaces: mocks.nearby,
}))
import {
  searchDraftLocations,
  searchNearbyDraftLocations,
} from '#lib/api/draftLocation.remote.js'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.context.user.isAnonymous = false
  mocks.nextCursor = null
})
describe('unsaved Feature Location discovery', () => {
  it('rejects anonymous callers before upstream discovery', async () => {
    mocks.context.user.isAnonymous = true
    await expect(searchDraftLocations({ q: 'Bakery' })).rejects.toMatchObject({
      status: 403,
    })
    expect(mocks.search).not.toHaveBeenCalled()
  })
  it('returns read-only previews without requiring a Feature ID and exposes partial failures', async () => {
    mocks.search.mockResolvedValue([
      { placeId: 'a', resourceReleaseId: 'release' },
      { placeId: 'b', resourceReleaseId: 'release' },
    ])
    mocks.preview
      .mockResolvedValueOnce({ names: { en: 'Bakery' } })
      .mockRejectedValueOnce(new Error('unavailable'))
    const result = await searchDraftLocations({ q: 'Bakery', locale: 'en' })
    expect(result).toEqual({
      rows: [
        { id: 'a', resourceReleaseId: 'release', facts: { names: { en: 'Bakery' } } },
      ],
      partial: true,
      limited: false,
      nextCursor: null,
    })
    expect(mocks.search).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 20 }),
    )
  })
})

it('uses the matched brand when the preview has no name', async () => {
  mocks.search.mockResolvedValue([
    {
      placeId: 'lego',
      resourceReleaseId: 'release',
      locale: 'en',
      nameText: '',
      brandText: 'LEGO',
    },
  ])
  mocks.preview.mockResolvedValue({ names: {} })
  const result = await searchDraftLocations({ q: 'lego', locale: 'en' })
  expect(result.rows[0]?.facts.names.en).toBe('LEGO')
})

it('replaces a whitespace-only preview name with the matched source label', async () => {
  mocks.search.mockResolvedValue([
    {
      placeId: 'lego',
      resourceReleaseId: 'release',
      locale: 'en',
      nameText: '  ',
      brandText: 'LEGO',
    },
  ])
  mocks.preview.mockResolvedValue({ names: { en: '  ' } })
  const result = await searchDraftLocations({ q: 'lego', locale: 'en' })
  expect(result.rows[0]?.facts.names.en).toBe('LEGO')
})

it('bounds nearby preview hydration and reports truncated coverage', async () => {
  mocks.nearby.mockResolvedValue({
    candidates: Array.from({ length: 21 }, (_, index) => ({
      placeId: String(index),
      resourceReleaseId: 'release',
    })),
    partial: false,
    limited: false,
  })
  mocks.preview.mockResolvedValue({ names: { en: 'Place' } })
  const result = await searchNearbyDraftLocations({
    coordinates: [114.15, 22.28],
    radius: 300,
  })
  expect(result.rows).toHaveLength(20)
  expect(result.partial).toBe(false)
  expect(result.limited).toBe(true)
  expect(mocks.preview).toHaveBeenCalledTimes(20)
})
it('rejects anonymous nearby discovery before reading source data', async () => {
  mocks.context.user.isAnonymous = true
  await expect(
    searchNearbyDraftLocations({ coordinates: [114.15, 22.28], radius: 300 }),
  ).rejects.toMatchObject({ status: 403 })
  expect(mocks.nearby).not.toHaveBeenCalled()
})

it('filters verified previews when upstream search ignores category or status filters', async () => {
  mocks.search.mockResolvedValue(
    ['match', 'wrong-type', 'closed'].map(placeId => ({
      placeId,
      resourceReleaseId: 'release',
    })),
  )
  mocks.preview.mockImplementation(async (_client, input) => ({
    names: { en: input.ssId },
    searchClassification: {
      taxonomyPrimary: input.ssId === 'wrong-type' ? 'restaurant' : 'abortion_clinic',
      operatingStatus: input.ssId === 'closed' ? 'permanently_closed' : null,
    },
  }))
  const result = await searchDraftLocations({
    q: 'Clinic',
    filters: { taxonomyPrimary: 'abortion_clinic' },
  })
  expect(result.rows.map(row => row.id)).toEqual(['match'])
})

it('accepts category-only discovery while keeping verified category and status filtering', async () => {
  mocks.search.mockResolvedValue(
    ['bakery', 'unrelated', 'closed'].map(placeId => ({
      placeId,
      resourceReleaseId: 'release',
    })),
  )
  mocks.preview.mockImplementation(async (_client, input) => ({
    names: { en: input.ssId },
    searchClassification: {
      taxonomyPrimary: input.ssId === 'unrelated' ? 'restaurant' : 'bakery',
      operatingStatus: input.ssId === 'closed' ? 'permanently_closed' : 'open',
    },
  }))
  const result = await searchDraftLocations({
    q: '  ',
    filters: { taxonomyPrimary: 'bakery' },
  })
  expect(result.rows.map(row => row.id)).toEqual(['bakery'])
  expect(mocks.search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ q: '', limit: 20 }),
  )
})

it('returns continuation even when previews fail or all rows are filtered out', async () => {
  mocks.nextCursor = 'next-page'
  mocks.search.mockResolvedValue([
    { placeId: 'wrong-type', resourceReleaseId: 'release', locale: 'en' },
    { placeId: 'failed', resourceReleaseId: 'release', locale: 'en' },
  ])
  mocks.preview
    .mockResolvedValueOnce({
      names: {},
      searchClassification: { taxonomyPrimary: 'cafe' },
    })
    .mockRejectedValueOnce(new Error('unavailable'))
  const result = await searchDraftLocations({
    q: '',
    filters: { taxonomyPrimary: 'bakery' },
    cursor: 'previous',
  })
  expect(result).toMatchObject({
    rows: [],
    partial: true,
    limited: false,
    nextCursor: 'next-page',
  })
  expect(mocks.search).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ cursor: 'previous', limit: 20 }),
  )
})

it('returns a full embedded-preview page without any per-place detail requests', async () => {
  const candidates = Array.from({ length: 20 }, (_, i) => ({
    placeId: `bakery-${i}`,
    resourceReleaseId: 'release',
    locale: 'en',
    nameText: `Bakery ${i}`,
    brandText: null,
    preview: {
      place: {
        id: `bakery-${i}`,
        resourceReleaseId: 'release',
        geometry: { type: 'Point', coordinates: [114.15, 22.28] },
        taxonomy: { primary: 'bakery', hierarchy: ['food_and_drink', 'bakery'] },
        operatingStatus: 'open',
      },
      i18n: { en: { name: `Bakery ${i}`, freeformAddress: 'Sheung Wan' } },
    },
  }))
  mocks.search.mockResolvedValue(candidates)
  mocks.nextCursor = 'next'
  const result = await searchDraftLocations({
    q: 'sheung wan',
    locale: 'en',
    filters: { taxonomyCategory: 'food_and_drink' },
  })
  expect(result.rows).toHaveLength(20)
  expect(result.nextCursor).toBe('next')
  expect(result.partial).toBe(false)
  expect(mocks.preview).not.toHaveBeenCalled()
  expect(result.rows[0]?.facts.location.address.fallbackDisplay?.en).toBe('Sheung Wan')
  candidates[0].preview.place.id = 'wrong-identity'
  const partial = await searchDraftLocations({ q: 'sheung wan' })
  expect(partial.rows).toHaveLength(19)
  expect(partial.partial).toBe(true)
  expect(mocks.preview).not.toHaveBeenCalled()
})
