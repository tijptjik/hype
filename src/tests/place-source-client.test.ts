import { describe, expect, it, vi } from 'vitest'
import { readSaanSeoiPlacePage } from '#lib/places/sourceClient.js'

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
