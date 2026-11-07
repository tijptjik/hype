import { afterEach, expect, it, vi } from 'vitest'
import { createBoundedDebounce } from '#lib/utils/boundedDebounce.js'

afterEach(() => vi.useRealTimers())

it('runs the latest draft after a short pause', () => {
  vi.useFakeTimers()
  const scheduler = createBoundedDebounce()
  const first = vi.fn()
  const latest = vi.fn()
  scheduler.schedule(first)
  vi.advanceTimersByTime(100)
  scheduler.schedule(latest)
  vi.advanceTimersByTime(149)
  expect(latest).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(latest).toHaveBeenCalledOnce()
  expect(first).not.toHaveBeenCalled()
})

it('publishes regularly during continuous typing and still submits the final draft', () => {
  vi.useFakeTimers()
  const scheduler = createBoundedDebounce()
  const published: number[] = []
  for (let i = 0; i < 12; i++) {
    scheduler.schedule(() => published.push(i))
    vi.advanceTimersByTime(100)
  }
  expect(published).toEqual([4, 9])
  vi.advanceTimersByTime(50)
  expect(published).toEqual([4, 9, 11])
})

it('cancels pending work when the search is cleared or closed', () => {
  vi.useFakeTimers()
  const scheduler = createBoundedDebounce()
  const publish = vi.fn()
  scheduler.schedule(publish)
  vi.advanceTimersByTime(100)
  scheduler.cancel()
  vi.advanceTimersByTime(500)
  expect(publish).not.toHaveBeenCalled()
  scheduler.schedule(publish)
  vi.advanceTimersByTime(150)
  expect(publish).toHaveBeenCalledOnce()
})
