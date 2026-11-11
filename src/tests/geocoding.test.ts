// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
// API
import {
  geocodeAddress,
  geocodeAddressCandidates,
  geocodeAddressPage,
  GeocodeRequestError,
  parseGeocodeResult,
} from '#lib/api/external/geocoding.js'

const pin = { lng: 114.1588, lat: 22.2788 }
const response = (
  formattedAddress = 'MAIN WING, JUSTICE PLACE, 18 LOWER ALBERT ROAD, CENTRAL & WESTERN DISTRICT, HK',
) => ({
  data: [
    {
      type: 'geocoding-results',
      attributes: {
        status: 'resolved',
        coordinates: [0, 0],
        match: { distanceMetres: 20 },
      },
      relationships: { address: { data: [{ type: 'addresses', id: 'correct' }] } },
    },
  ],
  included: [
    { type: 'addresses', id: 'unrelated', attributes: {} },
    {
      type: 'addresses',
      id: 'correct',
      attributes: {
        geometry: { type: 'Point', coordinates: [114.15862, 22.27886] },
        i18n: {
          en: {
            formattedAddress,
            buildingName: 'MAIN WING',
            premisesName: 'JUSTICE PLACE',
            buildingNumberFrom: '18',
            buildingNumberExpression: '18',
            streetName: 'LOWER ALBERT ROAD',
          },
          'zh-hant': {
            formattedAddress: '中座律政中心18下亞厘畢道中西區香港',
            buildingName: '中座',
            premisesName: '律政中心',
            buildingNumberExpression: '18',
            streetName: '下亞厘畢道',
          },
        },
      },
    },
  ],
})

describe('SaanSeoi geocoding', () => {
  it('follows the address relationship, trims urban divisions, and preserves the selected pin', () => {
    const result = parseGeocodeResult(response(), pin)!
    expect(result.i18n.en.displayAddress).toBe(
      'Main Wing, Justice Place, 18 Lower Albert Rd',
    )
    expect(result.i18n.zhHant.displayAddress).toBe('下亞厘畢道18號律政中心中座')
    expect(result.i18n.zhHans.displayAddress).toBe(result.i18n.zhHant.displayAddress)
    expect(result.addressMeta).toMatchObject({
      longitude: pin.lng,
      latitude: pin.lat,
      saanseoiAddressId: 'correct',
      addressReverseGeocoder: 'saanseoi',
      distanceFromPoint: 20,
    })
    expect(result.i18n.en.addressProperties.district).toBeUndefined()
  })

  it('trims Kowloon labels and retains New Territories locality context', () => {
    expect(
      parseGeocodeResult(
        response('18 LOWER ALBERT ROAD, YAU TSIM MONG DISTRICT, KLN'),
        pin,
      )!.i18n.en.displayAddress,
    ).not.toContain('District')
    expect(
      parseGeocodeResult(response('18 LOWER ALBERT ROAD, SHA TIN DISTRICT, NT'), pin)!
        .i18n.en.displayAddress,
    ).toContain('Sha Tin District')
  })

  it('preserves number suffixes/ranges and prefers native Simplified Chinese when supplied', () => {
    const body = response()
    const values = body.included[1].attributes.i18n!
    values.en.buildingNumberExpression = '18A-20B'
    Object.assign(values, {
      'zh-hans': {
        formattedAddress: '简体地址',
        streetName: '下亚厘毕道',
        buildingNumberExpression: '18A-20B',
      },
    })
    const result = parseGeocodeResult(body, pin)!
    expect(result.i18n.en.displayAddress).toContain('18A-20B')
    expect(result.i18n.zhHans.displayAddress).toBe('下亚厘毕道18A-20B号')
  })

  it('uses actual candidate geometry for forward geocoding, never echoed result coordinates', () => {
    const result = parseGeocodeResult(response(), { address: '18 Lower Albert Road' })!
    expect(result.addressMeta).toMatchObject({
      longitude: 114.15862,
      latitude: 22.27886,
      addressForwardGeocoder: 'saanseoi',
    })
    expect(result.addressMeta.address?.query).toBe('18 Lower Albert Road')
    expect(result.i18n.en.addressProperties).toEqual({})
  })

  it('distinguishes no match from malformed or failed responses', async () => {
    expect(parseGeocodeResult({ data: [] }, pin)).toBeNull()
    const incomplete = response()
    incomplete.data[0].attributes.status = 'incomplete'
    expect(parseGeocodeResult(incomplete, pin)).toBeNull()
    expect(() => parseGeocodeResult({ unrelated: true }, pin)).toThrow()
    const fetcher = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    await expect(
      geocodeAddress(pin, { baseUrl: 'https://api.saanseoi.hk', fetcher }),
    ).rejects.toThrow('503')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('calls SaanSeoi directly without keys, cookies or a manually supplied Origin', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(response()))
    await geocodeAddress(pin, {
      baseUrl: 'https://api.saanseoi.hk',
      fetcher,
    })
    const [url, init] = fetcher.mock.calls[0]
    expect(url.origin + url.pathname).toBe(
      'https://api.saanseoi.hk/addresses/v1/geocode',
    )
    expect(url.searchParams.get('lng')).toBe(String(pin.lng))
    expect(url.searchParams.get('profile')).toBe('full')
    expect(url.toString()).not.toContain('test-key')
    expect(init.headers['x-api-key']).toBeUndefined()
    expect(init.headers.Origin).toBeUndefined()
    expect(init.credentials).toBe('omit')
  })
})

it('nearby Address discovery uses candidate coordinates and configurable bounds', async () => {
  const fetcher = vi.fn(async (request: RequestInfo | URL) => {
    const url = new URL(String(request))
    expect(url.searchParams.get('maxDistance')).toBe('250')
    expect(url.searchParams.get('limit')).toBe('50')
    return Response.json(response())
  })
  const results = await geocodeAddressCandidates(pin, {
    maxDistance: 250,
    limit: 50,
    candidateCoordinates: true,
    fetcher,
  })
  expect(results[0].addressMeta.address?.coordinates).toEqual([114.15862, 22.27886])
  expect(parseGeocodeResult(response(), pin)?.addressMeta.address?.coordinates).toEqual(
    [114.15862, 22.27886],
  )
})

it('uses local Atlas in development and preserves caller cancellation', async () => {
  vi.stubEnv('DEV', true)
  vi.stubEnv('PUBLIC_SAANSEOI_API_URL', undefined)
  const controller = new AbortController()
  const fetcher = Object.assign(
    vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(response())),
    ),
    { preconnect: vi.fn() },
  )
  try {
    await geocodeAddressCandidates(
      { address: 'Central' },
      { fetcher, signal: controller.signal },
    )
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      'http://api.atlas.localhost/addresses/v1/geocode',
    )
    const signal = (fetcher.mock.calls[0] as unknown as [URL, RequestInit])[1].signal!
    controller.abort()
    expect(signal.aborted).toBe(true)
  } finally {
    vi.unstubAllEnvs()
  }
})

it('loads Address pages with a stable query, exact total and pinned continuation release', async () => {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input))
    expect(url.searchParams.get('paginate')).toBe('true')
    expect(url.searchParams.get('locatedOnly')).toBe('true')
    expect(url.searchParams.get('address')).toBe('holly')
    expect(url.searchParams.get('limit')).toBe('20')
    const next = url.searchParams.get('cursor')
    expect(url.searchParams.get('releaseSet')).toBe(next ? 'address-release' : null)
    return Response.json({
      ...response(),
      meta: {
        total: 278,
        nextCursor: next ? null : 'opaque-next',
        release: { apiReleaseSet: 'address-release' },
      },
    })
  })
  const first = await geocodeAddressPage({ address: 'holly' }, { fetcher })
  expect(first).toMatchObject({
    total: 278,
    nextCursor: 'opaque-next',
    releaseSet: 'address-release',
  })
  expect(first.rows).toHaveLength(1)
  const next = await geocodeAddressPage(
    { address: 'holly' },
    { fetcher, cursor: first.nextCursor!, releaseSet: first.releaseSet },
  )
  expect(next.nextCursor).toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(2)
})

it('exposes expired search sessions and refuses a changed continuation publication', async () => {
  const expired = vi.fn(async () => new Response('', { status: 410 }))
  await expect(
    geocodeAddressPage(
      { address: 'holly' },
      { fetcher: expired, cursor: 'opaque-next' },
    ),
  ).rejects.toMatchObject({ status: 410 })
  expect(new GeocodeRequestError(410)).toBeInstanceOf(Error)
  const changed = vi.fn(async () =>
    Response.json({
      ...response(),
      meta: { total: 1, nextCursor: null, release: { apiReleaseSet: 'other' } },
    }),
  )
  await expect(
    geocodeAddressPage(
      { address: 'holly' },
      { fetcher: changed, releaseSet: 'pinned' },
    ),
  ).rejects.toThrow('publication changed')
})

it('normalizes uppercase components independently while preserving mixed-case branding and source evidence', () => {
  const body = response()
  body.included[1].attributes.i18n!.en.buildingName = 'iSQUARE'
  body.included[1].attributes.i18n!.en.premisesName = 'PHASE IV'
  const original = structuredClone(body)
  const result = parseGeocodeResult(body, pin)!
  expect(result.i18n.en.displayAddress).toBe('iSQUARE, Phase IV, 18 Lower Albert Rd')
  expect(body).toEqual(original)
  expect(result.addressMeta.address?.source.rawSource).toMatchObject({
    data: original.included[1],
  })
})
