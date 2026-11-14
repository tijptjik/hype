import { describe, expect, it, vi } from 'vitest'
import type { ReconciliationCandidate } from '../lib/locations/reconciliationCache.js'
import { createReconciliationCache } from '../lib/locations/reconciliationCache.js'

const row = (id: string) =>
  ({
    id,
    resourceReleaseId: 'release',
    facts: { location: { geometry: { type: 'Point', coordinates: [114, 22] } } },
  }) as ReconciliationCandidate

describe('reconciliation search cache', () => {
  it('exhausts pages, deduplicates, reports progress and persists across instances', async () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value)
      },
      removeItem: (key: string) => {
        data.delete(key)
      },
    }
    const fetch = vi.fn(async (cursor?: string) => ({
      rows: cursor ? [row('a'), row('b')] : [row('a')],
      nextCursor: cursor ? null : 'next',
      partial: false,
    }))
    const progress = vi.fn()
    const cache = createReconciliationCache(storage)
    expect(await cache.get('admin', 'Brand', fetch, progress)).toHaveLength(2)
    expect(fetch.mock.calls).toEqual([[undefined], ['next']])
    expect(progress).toHaveBeenLastCalledWith(2)
    await createReconciliationCache(storage).get('admin', 'Brand', fetch, progress)
    expect(fetch).toHaveBeenCalledTimes(2)
    await cache.get('other', 'Brand', fetch, progress)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
  it('shares in-flight downloads and never retains partial results', async () => {
    const cache = createReconciliationCache(null)
    const fetch = vi.fn(async () => ({
      rows: [row('a')],
      nextCursor: null,
      partial: true,
    }))
    const results = await Promise.allSettled([
      cache.get('a', 'Brand', fetch, vi.fn()),
      cache.get('a', 'Brand', fetch, vi.fn()),
    ])
    expect(results.every(result => result.status === 'rejected')).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
    await expect(cache.get('a', 'Brand', fetch, vi.fn())).rejects.toThrow('Incomplete')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
