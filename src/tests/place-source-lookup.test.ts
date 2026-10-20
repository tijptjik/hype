import { describe, expect, it, vi } from 'vitest'
import { findSaanSeoiPlace } from '#lib/places/sourceLookup.js'

const pin = {
  releaseSet: 'publication',
  catalogRevision: 'catalog',
  knownAt: '2026-10-18T00:00:00Z',
}
function document(historical = false) {
  return {
    data: [
      {
        type: 'places',
        id: 'canonical-shop',
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
      apiReleaseSet: pin.releaseSet,
      apiCatalogRevision: pin.catalogRevision,
      resolvedApiVersion: 'api-places-v0.1',
      schemaVersion: 'v1',
      filters: { id: 'canonical-shop' } as { id?: string },
      page: {
        offset: 0,
        limit: 100,
        ...(historical ? { hasMore: false } : { total: 1 }),
      } as { offset: number; limit: number; hasMore?: boolean; total?: number },
    },
  }
}
function client(value: unknown) {
  const request = vi.fn(async (_url: URL, _options?: RequestInit) =>
    Response.json(value),
  )
  return {
    baseUrl: 'https://source.example',
    apiKey: 'test',
    fetch: request as unknown as typeof fetch,
    request,
  }
}

describe('exact publication-pinned canonical Place lookup', () => {
  it.each([false, true])(
    'uses one full-profile request (historical=%s)',
    async historical => {
      const c = client(document(historical))
      expect(await findSaanSeoiPlace(c, pin, 'canonical-shop')).toMatchObject({
        projection: { ssId: 'canonical-shop' },
        offset: 0,
      })
      expect(c.request).toHaveBeenCalledTimes(1)
      const [url, options] = c.request.mock.calls[0]
      for (const [key, value] of Object.entries(pin))
        expect(url.searchParams.get(key)).toBe(value)
      expect(url.searchParams.get('filter[id]')).toBe('canonical-shop')
      expect(url.searchParams.get('profile')).toBe('full')
      expect(options?.redirect).toBe('error')
      expect(options?.signal).toBeInstanceOf(AbortSignal)
    },
  )
  it.each([false, true])(
    'returns an acknowledged empty selection (historical=%s)',
    async historical => {
      const d = document(historical)
      d.data = []
      if (!historical) d.meta.page.total = 0
      expect(await findSaanSeoiPlace(client(d), pin, 'canonical-shop')).toBeNull()
    },
  )
  it.each([
    'missing-echo',
    'wrong-echo',
    'wrong-id',
    'multiple',
    'incomplete',
    'publication',
    'snapshot',
  ])('rejects %s contract drift', async kind => {
    const d = document()
    if (kind === 'missing-echo') delete d.meta.filters.id
    if (kind === 'wrong-echo') d.meta.filters.id = 'other'
    if (kind === 'wrong-id') d.data[0].id = 'other'
    if (kind === 'multiple') {
      d.data.push({ ...d.data[0], id: 'other' })
      d.meta.page.total = 2
    }
    if (kind === 'incomplete') d.meta.page.total = 2
    if (kind === 'publication') d.meta.apiCatalogRevision = 'other'
    if (kind === 'snapshot') d.data[0].attributes.snapshotId = ''
    await expect(findSaanSeoiPlace(client(d), pin, 'canonical-shop')).rejects.toThrow()
  })
  it('rejects invalid IDs before transport and preserves upstream failures', async () => {
    const c = client(document())
    for (const id of ['', 'has space', 'x'.repeat(201)]) {
      await expect(findSaanSeoiPlace(c, pin, id)).rejects.toThrow('identity')
    }
    expect(c.request).not.toHaveBeenCalled()
    c.request.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(findSaanSeoiPlace(c, pin, 'canonical-shop')).rejects.toThrow('503')
  })
})
