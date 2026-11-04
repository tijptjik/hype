import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// ADDRESS
import * as address from '#lib/addresses/featureAddress.js'
// DOMAIN
import { createDraftSearchFilter } from '#lib/locations/draftSearchFilter.js'
// TYPES
import type { DraftSearchResult } from '#lib/locations/draftSearchGroups.js'

/** Create distinct provider objects so caching cannot hide fresh evidence.
 * @param id Provider identity.
 * @param street Published English street name.
 * @returns A multilingual candidate for optimistic matching.
 */
function row(id: string, street = 'Hollywood Road'): DraftSearchResult {
  return {
    id,
    kind: 'address',
    names: {},
    address: {
      ...address.emptyFeatureAddress(),
      overrides: { en: { streetName: street }, 'zh-hant': { streetName: '荷李活道' } },
    },
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

it('defers address processing to another task and caches text across keystrokes', async () => {
  const display = vi.spyOn(address, 'getAddressDisplay')
  const filter = createDraftSearchFilter()
  const rows = [row('keep'), row('drop', 'Holland Street')]
  const first = filter(rows, 'ＨＯＬＬＹＷＯＯＤ rd.', () => true)
  expect(display).not.toHaveBeenCalled()
  await vi.runAllTimersAsync()
  expect(await first).toEqual([rows[0]])
  const calls = display.mock.calls.length
  expect(calls).toBeGreaterThan(0)
  const next = filter(rows, '荷李活', () => true)
  await vi.runAllTimersAsync()
  expect(await next).toEqual(rows)
  expect(display).toHaveBeenCalledTimes(calls)
  // A fresh object with a reused ID must not inherit cached address text.
  const fresh = filter([row('keep', 'Queen Street')], 'Hollywood', () => true)
  await vi.runAllTimersAsync()
  expect(await fresh).toEqual([])
})

it('yields during a cold scan and abandons it when a newer query takes over', async () => {
  let time = 0
  vi.spyOn(performance, 'now').mockImplementation(() => (time += 5))
  const display = vi.spyOn(address, 'getAddressDisplay')
  const filter = createDraftSearchFilter()
  let current = true
  const pending = filter(
    Array.from({ length: 100 }, (_, index) => row(String(index))),
    'Hollywood',
    () => current,
  )
  // Run one batch, then simulate input arriving before the next batch.
  await vi.advanceTimersToNextTimerAsync()
  expect(display.mock.calls.length).toBeGreaterThan(0)
  expect(display.mock.calls.length).toBeLessThan(100 * 3)
  const calls = display.mock.calls.length
  current = false
  await vi.runAllTimersAsync()
  expect(await pending).toBeNull()
  expect(display).toHaveBeenCalledTimes(calls)
})

it('does no address work when the snapshot is cancelled before its first task', async () => {
  const display = vi.spyOn(address, 'getAddressDisplay')
  const pending = createDraftSearchFilter()([row('old')], 'Hollywood', () => false)
  await vi.runAllTimersAsync()
  expect(await pending).toBeNull()
  expect(display).not.toHaveBeenCalled()
})
