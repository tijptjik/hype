import { expect, it, vi } from 'vitest'
import {
  PlaceSearchPageError,
  searchSaanSeoiPlacesPage,
  type PlaceSourceClient,
} from '#lib/locations/sourceClient.js'

const candidate = (id: string) => ({
  placeId: id,
  resourceReleaseId: 'source',
  locale: 'en',
  nameText: id,
  brandText: null,
})
const collection = (ids: string[], offset: number, limit: number, total: number) => ({
  data: ids.map(id => ({
    id,
    attributes: { resourceReleaseId: 'source', i18n: { en: { name: id } } },
  })),
  meta: {
    apiReleaseSet: 'release',
    apiCatalogRevision: 'catalog',
    catalogPublishedAt: '2026-10-18T00:00:00Z',
    page: { offset, limit, total },
  },
})
const client = (
  request: (url: URL, options?: RequestInit) => Promise<Response>,
): PlaceSourceClient => ({
  baseUrl: 'https://source.example',
  apiKey: 'test',
  fetch: Object.assign(
    (input: RequestInfo | URL, options?: RequestInit) =>
      request(
        input instanceof URL
          ? input
          : new URL(input instanceof Request ? input.url : input),
        options,
      ),
    { preconnect: vi.fn() },
  ),
})

it('continues category discovery at the next offset in the same publication and stops exactly at exhaustion', async () => {
  const request = vi.fn(async (url: URL) => {
    const offset = Number(url.searchParams.get('page[offset]'))
    const limit = Number(url.searchParams.get('page[limit]'))
    return Response.json(
      collection(
        Array.from({ length: Math.min(limit, 45 - offset) }, (_, i) =>
          String(offset + i),
        ),
        offset,
        limit,
        45,
      ),
    )
  })
  const input = { q: '', filters: { taxonomyPrimary: 'bakery' }, limit: 20 }
  const first = await searchSaanSeoiPlacesPage(client(request), input)
  const second = await searchSaanSeoiPlacesPage(client(request), {
    ...input,
    cursor: first.nextCursor!,
  })
  const third = await searchSaanSeoiPlacesPage(client(request), {
    ...input,
    cursor: second.nextCursor!,
  })
  expect([
    first.candidates.length,
    second.candidates.length,
    third.candidates.length,
  ]).toEqual([20, 20, 5])
  expect(
    new Set(
      [...first.candidates, ...second.candidates, ...third.candidates].map(
        row => row.placeId,
      ),
    ).size,
  ).toBe(45)
  expect(third.nextCursor).toBeNull()
  const secondUrl = request.mock.calls[1][0]
  expect(secondUrl.searchParams.get('releaseSet')).toBe('release')
  expect(secondUrl.searchParams.get('catalogRevision')).toBe('catalog')
  expect(secondUrl.searchParams.get('knownAt')).toBe('2026-10-18T00:00:00Z')
  expect(secondUrl.searchParams.get('filter[taxonomyPrimary]')).toBe('bakery')
})

it('continues into taxonomy descendants without dropping the unconsumed end of a category', async () => {
  const request = vi.fn(async (url: URL) => {
    const category = url.searchParams.get('filter[taxonomyPrimary]')
    const offset = Number(url.searchParams.get('page[offset]'))
    const limit = Number(url.searchParams.get('page[limit]'))
    const ids = category === 'japanese_restaurant' ? ['j0', 'j1', 'j2'] : ['s0', 's1']
    return Response.json(
      collection(ids.slice(offset, offset + limit), offset, limit, ids.length),
    )
  })
  const input = {
    q: '',
    filters: { taxonomyCategory: 'japanese_restaurant' },
    limit: 2,
  }
  const ids: string[] = []
  let cursor: string | undefined
  do {
    const page = await searchSaanSeoiPlacesPage(client(request), { ...input, cursor })
    ids.push(...page.candidates.map(row => row.placeId))
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  expect(ids).toEqual(['j0', 'j1', 'j2', 's0', 's1'])
})

it('retains a retryable cursor after errors and rejects query/publication changes', async () => {
  const request = vi.fn().mockResolvedValue(Response.json(collection(['a'], 0, 1, 2)))
  const input = { q: '', filters: { taxonomyPrimary: 'bakery' }, limit: 1 }
  const first = await searchSaanSeoiPlacesPage(client(request), input)
  await expect(
    searchSaanSeoiPlacesPage(client(request), {
      ...input,
      filters: { taxonomyPrimary: 'cafe' },
      cursor: first.nextCursor!,
    }),
  ).rejects.toMatchObject({ status: 410 })
  expect(request).toHaveBeenCalledTimes(1)
  request.mockResolvedValueOnce(new Response('', { status: 503 }))
  await expect(
    searchSaanSeoiPlacesPage(client(request), { ...input, cursor: first.nextCursor! }),
  ).rejects.toMatchObject({ status: 503 })
  const changed = collection(['b'], 1, 1, 2)
  changed.meta.apiReleaseSet = 'changed'
  request.mockResolvedValueOnce(Response.json(changed))
  await expect(
    searchSaanSeoiPlacesPage(client(request), { ...input, cursor: first.nextCursor! }),
  ).rejects.toMatchObject({ status: 410 })
  request.mockResolvedValueOnce(Response.json(collection(['b'], 1, 1, 2)))
  expect(
    (
      await searchSaanSeoiPlacesPage(client(request), {
        ...input,
        cursor: first.nextCursor!,
      })
    ).candidates[0].placeId,
  ).toBe('b')
})

it('forwards the upstream text cursor with unchanged filters and rejects expired pages', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ results: [candidate('first')], meta: { nextCursor: 'opaque' } }),
    )
    .mockResolvedValueOnce(
      Response.json({ results: [candidate('second')], meta: { nextCursor: null } }),
    )
    .mockResolvedValueOnce(new Response('', { status: 410 }))
  const input = {
    q: 'shop',
    filters: { taxonomyPrimary: 'bakery' },
    locale: 'en' as const,
  }
  const first = await searchSaanSeoiPlacesPage(client(request), input)
  const second = await searchSaanSeoiPlacesPage(client(request), {
    ...input,
    cursor: first.nextCursor!,
  })
  expect(second.candidates[0].placeId).toBe('second')
  expect(second.nextCursor).toBeNull()
  const url = request.mock.calls[1][0] as URL
  expect(url.searchParams.get('paginate')).toBe('true')
  expect(url.searchParams.get('cursor')).toBe('opaque')
  expect(url.searchParams.get('q')).toBe('shop')
  expect(url.searchParams.get('filter[taxonomyPrimary]')).toBe('bakery')
  await expect(
    searchSaanSeoiPlacesPage(client(request), { ...input, cursor: 'expired' }),
  ).rejects.toBeInstanceOf(PlaceSearchPageError)
})
