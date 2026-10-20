import { describe, expect, it, vi } from 'vitest'
import { findSaanSeoiPlace } from '#lib/places/sourceLookup.js'

const pin = {
  releaseSet: 'publication',
  catalogRevision: 'catalog',
  knownAt: '2026-10-18T00:00:00Z',
}
const id = (index: number): string => `place-${String(index * 2).padStart(9, '0')}`

type FixturePage = {
  data: Array<{
    type: string
    id: string
    attributes: {
      geometry: { type: string; coordinates: number[] }
      snapshotId: string
      resourceReleaseId: string
      addressSnapshotId: null
      address2dId: null
      address3dId: null
      address3dUnitId: null
      phones: never[]
      identifiers: null
      i18n: { en: { name: string; brandName: null } }
    }
  }>
  meta: {
    apiReleaseSet: string
    apiCatalogRevision: string
    resolvedApiVersion: string
    schemaVersion: string
    page: { offset: number; limit: number; total?: number; hasMore?: boolean }
  }
}

function fixture(
  count: number,
  historical = false,
  corrupt?: (page: FixturePage) => void,
) {
  const request = vi.fn(async (input: URL | RequestInfo, options?: RequestInit) => {
    expect(options?.signal).toBeInstanceOf(AbortSignal)
    expect(options?.redirect).toBe('error')
    const url = new URL(String(input))
    const offset = Number(url.searchParams.get('page[offset]'))
    const size = Math.min(100, Math.max(0, count - offset))
    const document: FixturePage = {
      data: Array.from({ length: size }, (_, i) => ({
        type: 'places',
        id: id(offset + i),
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
      })),
      meta: {
        apiReleaseSet: pin.releaseSet,
        apiCatalogRevision: pin.catalogRevision,
        resolvedApiVersion: 'api-places-v0.1',
        schemaVersion: 'v1',
        page: {
          offset,
          limit: 100,
          ...(historical ? { hasMore: offset + size < count } : { total: count }),
        },
      },
    }
    corrupt?.(document)
    return Response.json(document)
  })
  return {
    baseUrl: 'https://source.example',
    apiKey: 'test',
    fetch: request as unknown as typeof fetch,
    request,
  }
}

describe('bounded canonical Place lookup', () => {
  it.each([false, true])(
    'finds boundary and middle records (historical=%s)',
    async historical => {
      for (const index of [0, 99, 100, 1250, 2506]) {
        const client = fixture(2507, historical)
        const result = await findSaanSeoiPlace(client, pin, id(index))
        expect(result?.projection.ssId).toBe(id(index))
        expect(result?.offset).toBe(Math.floor(index / 100) * 100)
        expect(client.request.mock.calls.length).toBeLessThanOrEqual(12)
        for (const [input] of client.request.mock.calls) {
          const url = new URL(String(input))
          for (const [key, value] of Object.entries(pin))
            expect(url.searchParams.get(key)).toBe(value)
        }
      }
    },
  )
  it.each([false, true])(
    'returns null for absent records (historical=%s)',
    async historical => {
      for (const target of ['aaa', 'place-000000201', id(3000)]) {
        expect(
          await findSaanSeoiPlace(fixture(2507, historical), pin, target),
        ).toBeNull()
      }
      expect(await findSaanSeoiPlace(fixture(0, historical), pin, id(0))).toBeNull()
    },
  )
  it.each(['order', 'overlap', 'sparse', 'total', 'snapshot'])(
    'rejects %s drift',
    async kind => {
      const client = fixture(2507, false, page => {
        if (kind === 'order') page.data.reverse()
        if (kind === 'sparse') page.data.pop()
        if (page.meta.page.offset === 0) return
        if (kind === 'overlap') page.data[0].id = id(0)
        if (kind === 'total') page.meta.page.total = 2508
        if (kind === 'snapshot') page.data[0].attributes.snapshotId = 'changed'
      })
      await expect(findSaanSeoiPlace(client, pin, id(1250))).rejects.toThrow()
    },
  )
  it('keeps a large current collection logarithmic', async () => {
    const client = fixture(200_001)
    expect((await findSaanSeoiPlace(client, pin, id(199_999)))?.projection.ssId).toBe(
      id(199_999),
    )
    expect(client.request.mock.calls.length).toBeLessThanOrEqual(13)
  })
  it('rejects short nonterminal historical pages and changed publication pins', async () => {
    const sparse = fixture(2507, true, page => {
      page.data.pop()
    })
    await expect(findSaanSeoiPlace(sparse, pin, id(1250))).rejects.toThrow('dense')
    const changed = fixture(2507, false, page => {
      page.meta.apiCatalogRevision = 'other'
    })
    await expect(findSaanSeoiPlace(changed, pin, id(1250))).rejects.toThrow(
      'checkpoint',
    )
  })
  it('bounds historical discovery and rejects invalid IDs before transport', async () => {
    const client = fixture(1_000_000_000, true)
    await expect(findSaanSeoiPlace(client, pin, 'z')).rejects.toThrow('budget')
    expect(client.request).toHaveBeenCalledTimes(24)
    client.request.mockClear()
    await expect(findSaanSeoiPlace(client, pin, '')).rejects.toThrow('identity')
    expect(client.request).not.toHaveBeenCalled()
  })
})
