import { expect, it } from 'vitest'
import { SourceCache, SOURCE_TTL_MS } from '../lib/sources/cache'

it('coalesces reads, persists across instances, expires daily and isolates origins', async () => {
  let now = 100
  let reads = 0
  const disk = new Map<string, unknown>()
  const storage = {
    read: async (key: string) => disk.get(key),
    write: async (key: string, value: unknown) => {
      disk.set(key, value)
    },
  }
  const parse = (value: unknown) => {
    if (typeof value !== 'number') throw Error('invalid')
    return value
  }
  const loader = async () => ++reads
  const key = ['provider', 'https://one.test/names', 'v1']
  const cache = new SourceCache(storage, () => now)
  expect(
    await Promise.all([cache.load(key, parse, loader), cache.load(key, parse, loader)]),
  ).toEqual([1, 1])
  const restored = new SourceCache(storage, () => now)
  expect(await restored.load(key, parse, loader)).toBe(1)
  now += SOURCE_TTL_MS
  expect(await restored.load(key, parse, loader)).toBe(2)
  expect(
    await restored.load(['provider', 'https://two.test/names', 'v1'], parse, loader),
  ).toBe(3)
})

it('does not retain failures or serve expired data when refresh fails', async () => {
  let now = 0
  const storage = {
    read: async () => undefined,
    write: async () => {
      throw Error('quota')
    },
  }
  const cache = new SourceCache(storage, () => now)
  const parse = (value: unknown) => String(value)
  expect(await cache.load(['one'], parse, async () => 'old')).toBe('old')
  now = SOURCE_TTL_MS
  await expect(
    cache.load(['one'], parse, async () => {
      throw Error('offline')
    }),
  ).rejects.toThrow('offline')
  expect(await cache.load(['one'], parse, async () => 'new')).toBe('new')
})
