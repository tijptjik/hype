import { describe, expect, it, vi } from 'vitest'
import {
  readSaanSeoiPlacePage,
  searchSaanSeoiPlaces,
} from '#lib/places/sourceClient.js'

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
describe('publication-pinned Places pagination', () => {
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

describe('latest-source Place discovery', () => {
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
