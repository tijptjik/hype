// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const { load } = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../lib/indoor/model', () => ({
  loadIndoorData: load,
  value: (properties: Record<string, string>, key: string) => properties[key] ?? '',
}))
const data = { level_polygon: { features: [] }, unitArtwork: {} }
beforeEach(() => {
  vi.resetModules()
  load.mockReset().mockResolvedValue(data)
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())

it('shares a visible preload with entry and expires completed results', async () => {
  const { preloadVisibleIndoorMaps, prepareIndoorData } = await import(
    '../lib/indoor/preload'
  )
  preloadVisibleIndoorMaps(['/map/a'])
  expect(await prepareIndoorData('/map/a')).toBe(data)
  expect(load).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(30_001)
  await prepareIndoorData('/map/a')
  expect(load).toHaveBeenCalledTimes(2)
})

it('bounds background concurrency and drops destinations that leave the viewport', async () => {
  const pending: (() => void)[] = []
  load.mockImplementation(
    () => new Promise(resolve => pending.push(() => resolve(data))),
  )
  const { preloadVisibleIndoorMaps } = await import('../lib/indoor/preload')
  preloadVisibleIndoorMaps(['/map/a', '/map/b', '/map/c', '/map/d'])
  expect(load).toHaveBeenCalledTimes(2)
  preloadVisibleIndoorMaps([])
  pending.forEach(resolve => {
    resolve()
  })
  await vi.advanceTimersByTimeAsync(0)
  expect(load).toHaveBeenCalledTimes(2)
})

it('allows a failed speculative load to retry on entry', async () => {
  load.mockRejectedValueOnce(new Error('Offline'))
  const { prepareIndoorData } = await import('../lib/indoor/preload')
  await expect(prepareIndoorData('/map/a')).rejects.toThrow('Offline')
  expect(await prepareIndoorData('/map/a')).toBe(data)
  expect(load).toHaveBeenCalledTimes(2)
})
