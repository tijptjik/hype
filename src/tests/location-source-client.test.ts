import { describe, expect, it, vi } from 'vitest'
import {
  readSaanSeoiPlacePage,
  searchSaanSeoiPlaces,
} from '#lib/locations/sourceClient.js'

const pin = {
  releaseSet: 'publication',
  catalogRevision: 'catalog',
  knownAt: '2026-10-18T00:00:00Z',
}
function document() {
  return {
    data: [
      {
        type: 'places',
        id: 'shop',
        attributes: {
          geometry: { type: 'Point', coordinates: [114, 22] },
          snapshotId: 'snapshot',
          resourceReleaseId: 'source-release',
          addressSnapshotId: null,
          address2dId: null,
          address3dId: null,
          address3dUnitId: null,
          phones: [],
          identifiers: null,
          i18n: { en: { name: 'Shop', brandName: null } },
        },
      },
    ],
    meta: {
      apiReleaseSet: 'publication',
      apiCatalogRevision: 'catalog',
      resolvedApiVersion: 'api-places-v0.1',
      schemaVersion: 'v1',
      page: { offset: 0, limit: 100, total: 2 },
    },
  }
}
function client(value: unknown) {
  const request = vi.fn(async (_url: URL, _options: RequestInit) =>
    Response.json(value),
  )
  return {
    baseUrl: 'https://source.example',
    apiKey: 'test-credential',
    fetch: request as unknown as typeof fetch,
    request,
  }
}
describe('publication-pinned Locations pagination', () => {
  it('pins every request and advances only over returned canonical records', async () => {
    const c = client(document())
    const page = await readSaanSeoiPlacePage(c, pin)
    expect(page.nextOffset).toBe(1)
    expect(page.places[0].ssId).toBe('shop')
    const url = new URL(String(c.request.mock.calls[0][0]))
    expect(url.searchParams.get('releaseSet')).toBe(pin.releaseSet)
    expect(url.searchParams.get('catalogRevision')).toBe(pin.catalogRevision)
    expect(url.searchParams.get('knownAt')).toBe(pin.knownAt)
    const last = document()
    last.meta.page.offset = 1
    expect((await readSaanSeoiPlacePage(client(last), pin, 1)).nextOffset).toBeNull()
  })
  it('continues historical pages without an exact total and rejects unknown completion', async () => {
    const d = document()
    const page = { offset: 0, limit: 100, hasMore: true }
    const historical = { ...d, meta: { ...d.meta, page } }
    expect(await readSaanSeoiPlacePage(client(historical), pin)).toMatchObject({
      total: null,
      nextOffset: 1,
    })
    expect(
      await readSaanSeoiPlacePage(
        client({
          ...historical,
          meta: { ...historical.meta, page: { ...page, hasMore: false } },
        }),
        pin,
      ),
    ).toMatchObject({ total: null, nextOffset: null })
    await expect(
      readSaanSeoiPlacePage(client({ ...historical, data: [] }), pin),
    ).rejects.toThrow('pagination')
    await expect(
      readSaanSeoiPlacePage(
        client({
          ...historical,
          meta: { ...historical.meta, page: { offset: 0, limit: 100 } },
        }),
        pin,
      ),
    ).rejects.toThrow('pagination')
    await expect(
      readSaanSeoiPlacePage(
        client({ ...d, meta: { ...d.meta, page: { ...d.meta.page, hasMore: false } } }),
        pin,
      ),
    ).rejects.toThrow('pagination')
  })
  it.each(['publication', 'catalog', 'offset', 'empty', 'duplicate'])(
    'rejects %s drift or incomplete pagination',
    async kind => {
      const d = document()
      if (kind === 'publication') d.meta.apiReleaseSet = 'other'
      if (kind === 'catalog') d.meta.apiCatalogRevision = 'other'
      if (kind === 'offset') d.meta.page.offset = 10
      if (kind === 'empty') d.data = []
      if (kind === 'duplicate') d.data.push(d.data[0])
      await expect(readSaanSeoiPlacePage(client(d), pin)).rejects.toThrow('checkpoint')
    },
  )
})

describe('latest-source Location discovery', () => {
  const candidate = {
    placeId: 'shop',
    resourceReleaseId: 'release',
    locale: 'zh-hant',
    nameText: '麵包店',
    brandText: null,
  }
  it('preserves ranking and source identities without inventing canonical revisions', async () => {
    const c = client({ results: [candidate], privateMetadata: 'not returned' })
    expect(await searchSaanSeoiPlaces(c, { q: ' 麵包 ', locale: 'zh-hant' })).toEqual([
      candidate,
    ])
    const [url, options] = c.request.mock.calls[0]
    expect(url.pathname).toBe('/places/v0.1/search')
    expect(url.searchParams.get('q')).toBe('麵包')
    expect(url.searchParams.get('region')).toBe('hk')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('locale')).toBe('zh-hant')
    expect(options.redirect).toBe('error')
    expect(options.headers).toEqual({
      Accept: 'application/json',
      'x-api-key': 'test-credential',
    })
  })
  it('bounds input before issuing a request', async () => {
    const c = client({ results: [] })
    for (const q of ['', '  ', 'x'.repeat(201)]) {
      await expect(searchSaanSeoiPlaces(c, { q })).rejects.toThrow()
    }
    await expect(searchSaanSeoiPlaces(c, { q: 'shop', limit: 21 })).rejects.toThrow()
    expect(c.request).not.toHaveBeenCalled()
  })
  it('distinguishes empty results from source failures and malformed responses', async () => {
    expect(await searchSaanSeoiPlaces(client({ results: [] }), { q: 'shop' })).toEqual(
      [],
    )
    const c = client(null)
    c.request.mockResolvedValue(
      new Response('private upstream diagnostic', { status: 503 }),
    )
    await expect(searchSaanSeoiPlaces(c, { q: 'shop' })).rejects.toThrow(
      'search failed (503)',
    )
    await expect(
      searchSaanSeoiPlaces(
        client({ results: [{ ...candidate, resourceReleaseId: '' }] }),
        { q: 'shop' },
      ),
    ).rejects.toThrow()
    await expect(
      searchSaanSeoiPlaces(client({ results: [candidate, candidate] }), {
        q: 'shop',
        limit: 1,
      }),
    ).rejects.toThrow()
  })
})

it('sends exact Places filters to upstream search before its result limit', async () => {
  const c = client({ results: [] })
  await searchSaanSeoiPlaces(c, {
    q: 'Japanese',
    limit: 5,
    filters: {
      basicCategory: 'restaurant',
      taxonomyPrimary: 'japanese_restaurant',
      operatingStatus: 'open',
    },
  })
  const url = new URL(String(c.request.mock.calls[0][0]))
  expect(url.searchParams.get('filter[basicCategory]')).toBe('restaurant')
  expect(url.searchParams.get('filter[taxonomyPrimary]')).toBe('japanese_restaurant')
  // Open also includes unknown status; verified previews apply that local policy.
  expect(url.searchParams.get('filter[operatingStatus]')).toBeNull()
  expect(url.searchParams.get('limit')).toBe('5')
})

it.each([{ basicCategory: 'restaurant' }, { taxonomyPrimary: 'bakery' }])(
  'uses filtered collection discovery for empty text with %j',
  async filters => {
    const c = client({
      data: [{ id: 'shop', attributes: { resourceReleaseId: 'release' } }],
      meta: {
        apiReleaseSet: 'release',
        apiCatalogRevision: 'catalog',
        catalogPublishedAt: '2026-10-18T00:00:00Z',
        page: { offset: 0, limit: 5, total: 1 },
      },
    })
    expect(
      await searchSaanSeoiPlaces(c, { q: '  ', filters, locale: 'zh-hant', limit: 5 }),
    ).toEqual([
      {
        placeId: 'shop',
        resourceReleaseId: 'release',
        locale: 'zh-hant',
        nameText: null,
        brandText: null,
      },
    ])
    const [url, options] = c.request.mock.calls[0]
    expect(url.pathname).toBe('/places/v0.1')
    expect(url.searchParams.has('q')).toBe(false)
    for (const [key, value] of Object.entries(filters))
      expect(url.searchParams.get(`filter[${key}]`)).toBe(value)
    expect(url.searchParams.get('page[limit]')).toBe('5')
    expect(url.searchParams.get('region')).toBe('hk')
    expect(options.redirect).toBe('error')
  },
)

it('includes descendant primary categories and bounds the combined results', async () => {
  const c = client({ data: [] })
  c.request.mockImplementation(async (url: URL) => {
    const category = url.searchParams.get('filter[taxonomyPrimary]')
    return Response.json({
      data:
        category === 'sushi_restaurant'
          ? [{ id: 'ramen', attributes: { resourceReleaseId: 'release' } }]
          : [],
      meta: {
        apiReleaseSet: 'release',
        apiCatalogRevision: 'catalog',
        catalogPublishedAt: '2026-10-18T00:00:00Z',
        page: { offset: 0, limit: 1, total: category === 'sushi_restaurant' ? 1 : 0 },
      },
    })
  })
  const results = await searchSaanSeoiPlaces(c, {
    q: '',
    filters: { taxonomyCategory: 'japanese_restaurant' },
    limit: 1,
  })
  expect(results.map(row => row.placeId)).toEqual(['ramen'])
  expect(
    c.request.mock.calls.some(
      ([url]) =>
        url.searchParams.get('filter[taxonomyPrimary]') === 'japanese_restaurant',
    ),
  ).toBe(true)
})

it('rejects empty status-only searches and malformed category collections', async () => {
  const c = client({ data: [] })
  for (const operatingStatus of [
    'open',
    'any',
    'temporarily_closed',
    'permanently_closed',
  ] as const) {
    await expect(
      searchSaanSeoiPlaces(c, { q: ' ', filters: { operatingStatus } }),
    ).rejects.toThrow()
  }
  expect(c.request).not.toHaveBeenCalled()
  await expect(
    searchSaanSeoiPlaces(
      client({ data: [{ id: 'shop', attributes: { resourceReleaseId: '' } }] }),
      {
        q: '',
        filters: { taxonomyPrimary: 'bakery' },
      },
    ),
  ).rejects.toThrow()
  c.request.mockResolvedValue(new Response('Unavailable', { status: 503 }))
  await expect(
    searchSaanSeoiPlaces(c, { q: '', filters: { taxonomyPrimary: 'bakery' } }),
  ).rejects.toThrow('search failed (503)')
})

it('retains category collection coordinates and translated addresses for map previews', async () => {
  const geometry = { type: 'Point', coordinates: [114.18, 22.28] }
  const i18n = { en: { name: 'Bakery', freeformAddress: '8 Test Street' } }
  const c = client({
    data: [
      { id: 'shop', attributes: { resourceReleaseId: 'release', geometry, i18n } },
    ],
    meta: {
      apiReleaseSet: 'release',
      apiCatalogRevision: 'catalog',
      catalogPublishedAt: '2026-10-18T00:00:00Z',
      page: { offset: 0, limit: 5, total: 1 },
    },
  })
  const result = await searchSaanSeoiPlaces(c, {
    q: '',
    filters: { taxonomyPrimary: 'bakery' },
    limit: 5,
  })
  expect(result[0].preview).toEqual({
    place: { id: 'shop', resourceReleaseId: 'release', geometry, i18n },
    i18n,
  })
})
