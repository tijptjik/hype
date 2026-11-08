// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { latLngToCell } from 'h3-js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  NearbyPlacesInputSchema,
  scoreDiscovery,
  textAgreement,
} from '#lib/locations/discovery.js'
import {
  nearbyLocationCells,
  searchNearbySaanSeoiPlaces,
} from '#lib/locations/nearbySource.js'
import { LocalLocationInputSchema } from '#lib/locations/local.js'
import {
  ProjectLocationPolicySchema,
  DEFAULT_PROJECT_LOCATION_POLICY,
} from '#lib/locations/model.js'

const input = { coordinates: [114.17, 22.3] as [number, number], radius: 300 }
const row = (id: string, coordinates = input.coordinates) => ({
  placeId: id,
  resourceReleaseId: 'release',
  taxonomy: { primary: 'japanese_restaurant' },
  geometry: { type: 'Point', coordinates },
})
const page = (places: ReturnType<typeof row>[], offset = 0, hasMore = false) =>
  Response.json({ places, meta: { page: { limit: 100, offset, hasMore } } })

describe('nearby Places discovery', () => {
  it('covers the pin and cardinal circle edges, even across cell boundaries', () => {
    const cells = nearbyLocationCells(input)
    for (const [lng, lat] of [
      [114.17, 22.3],
      [114.1729, 22.3],
      [114.1671, 22.3],
      [114.17, 22.30269],
      [114.17, 22.29731],
    ]) {
      expect(cells).toContain(latLngToCell(lat, lng, 9))
    }
    expect(NearbyPlacesInputSchema.safeParse({ ...input, radius: 1001 }).success).toBe(
      false,
    )
  })

  it('paginates, deduplicates and filters actual distance; credentials cannot follow redirects', async () => {
    const fetcher = vi.fn(async (url: URL, init: RequestInit) => {
      expect(init.redirect).toBe('error')
      expect(url.searchParams.get('filter[taxonomyPrimary]')).toBe(
        'japanese_restaurant',
      )
      expect(init.headers).toEqual({ Accept: 'application/json', 'x-api-key': 'test' })
      const offset = Number(url.searchParams.get('offset'))
      return offset === 0
        ? page([row('a'), row('outside', [114.19, 22.3])], 0, true)
        : page([row('a'), row('b', [114.1701, 22.3])], 100)
    })
    const found = await searchNearbySaanSeoiPlaces(
      {
        baseUrl: 'https://example.test',
        apiKey: 'test',
        fetch: fetcher as unknown as typeof fetch,
      },
      { ...input, filters: { taxonomyPrimary: 'japanese_restaurant' } },
    )
    expect(found.candidates.map(item => item.placeId)).toEqual(['a', 'b'])
    expect(found.partial).toBe(false)
    expect(found.limited).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(nearbyLocationCells(input).length * 2)
  })

  it('distinguishes partial coverage and complete upstream failure from no results', async () => {
    let count = 0
    const client = {
      baseUrl: 'https://example.test',
      apiKey: 'test',
      fetch: vi.fn(async () =>
        ++count === 1 ? new Response('', { status: 503 }) : page([]),
      ) as unknown as typeof fetch,
    }
    expect((await searchNearbySaanSeoiPlaces(client, input)).partial).toBe(true)
    client.fetch = vi.fn(
      async () => new Response('', { status: 503 }),
    ) as unknown as typeof fetch
    await expect(searchNearbySaanSeoiPlaces(client, input)).rejects.toThrow(
      'unavailable',
    )
  })

  it('reports bounded pagination rather than silently treating the set as complete', async () => {
    const client = {
      baseUrl: 'https://example.test',
      apiKey: 'test',
      fetch: vi.fn(async (url: URL) =>
        page([], Number(url.searchParams.get('offset')), true),
      ) as unknown as typeof fetch,
    }
    expect((await searchNearbySaanSeoiPlaces(client, input)).limited).toBe(true)
  })
})

describe('discovery ranking and independent preferences', () => {
  it('uses proximity without address evidence and boosts bilingual address agreement', () => {
    const origin = emptyFeatureAddress({
      en: '12 Example Road',
      'zh-hant': '示例道12號',
    })
    const near = {
      ...emptyFeatureAddress(),
      coordinates: [114.1701, 22.3] as [number, number],
    }
    const far = {
      ...emptyFeatureAddress(),
      coordinates: [114.171, 22.3] as [number, number],
    }
    expect(
      scoreDiscovery(origin, near, input.coordinates, input.radius).score,
    ).toBeGreaterThan(
      scoreDiscovery(origin, far, input.coordinates, input.radius).score,
    )
    const same = { ...origin, coordinates: far.coordinates }
    expect(
      scoreDiscovery(origin, same, input.coordinates, input.radius).score,
    ).toBeGreaterThan(
      scoreDiscovery(origin, far, input.coordinates, input.radius).score,
    )
    expect(textAgreement('示例道12號', '示例道12號')).toBe(1)
    expect(textAgreement('', '')).toBe(0)
  })

  it('retains old project policies and validates configurable search bounds', () => {
    expect(ProjectLocationPolicySchema.parse(DEFAULT_PROJECT_LOCATION_POLICY)).toEqual(
      DEFAULT_PROJECT_LOCATION_POLICY,
    )
    expect(
      ProjectLocationPolicySchema.parse({
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        discoveryRadiusMetres: 500,
      }).discoveryRadiusMetres,
    ).toBe(500)
    expect(
      ProjectLocationPolicySchema.safeParse({
        ...DEFAULT_PROJECT_LOCATION_POLICY,
        discoveryRadiusMetres: 0,
      }).success,
    ).toBe(false)
  })

  it('defaults consent to private independently of identity state', () => {
    expect(LocalLocationInputSchema.shape.sharingPreference.parse(undefined)).toBe(
      'private',
    )
    expect(
      LocalLocationInputSchema.shape.sharingPreference.parse('allow-sharing'),
    ).toBe('allow-sharing')
  })
})

it('filters nearby types and status before the nearest-fifty candidate cap', async () => {
  const unrelated = Array.from({ length: 60 }, (_, index) => ({
    ...row(`unrelated-${index}`),
    taxonomy: { primary: 'clothing_store' },
  }))
  const closed = { ...row('closed'), operatingStatus: 'permanently_closed' }
  const matching = row('matching', [114.171, 22.3])
  const client = {
    baseUrl: 'https://example.test',
    apiKey: 'test',
    fetch: vi.fn(async () =>
      page([...unrelated, closed, matching]),
    ) as unknown as typeof fetch,
  }
  const found = await searchNearbySaanSeoiPlaces(client, {
    ...input,
    filters: { taxonomyCategory: 'food_and_drink' },
  })
  expect(found.candidates.map(candidate => candidate.placeId)).toEqual(['matching'])
  expect(found.limited).toBe(false)
  expect(found.partial).toBe(false)
})
