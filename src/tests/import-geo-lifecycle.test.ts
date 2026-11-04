// @vitest-environment jsdom
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
// SVELTE
import { tick } from 'svelte'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// API
import { geocodeAddress } from '#lib/api/external/geocoding.js'
// FIXTURES
import Fixture from './fixtures/components/ImportGeoLifecycleFixture.svelte'

const mocks = vi.hoisted(() => ({ ctx: null as unknown }))
vi.mock('#lib/context/import.svelte.js', async original => ({
  ...(await original<object>()),
  getImportCtx: () => mocks.ctx,
}))
vi.mock('#lib/api/external/geocoding.js', () => ({ geocodeAddress: vi.fn() }))
beforeEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
  localStorage.clear()
})
afterEach(cleanup)

it.each(['reset', 'unmount'])(
  'does not advance or publish after geocoding %s',
  async action => {
    const ctx = new ImportCtx()
    mocks.ctx = ctx
    ctx.setData([['1 Queen Road, Hong Kong']])
    ctx.setHeaders(['address'])
    ctx.setColumns([
      { header: 'address', modelType: 'Feature', field: 'rawAddress', locale: 'en' },
    ] as never)
    ctx.setCurrentStep('geo-lookup')
    let finish!: (value: unknown) => void
    vi.mocked(geocodeAddress).mockReturnValueOnce(
      new Promise(resolve => {
        finish = resolve
      }) as never,
    )
    const mounted = render(Fixture)
    await fireEvent.click(screen.getByRole('button', { name: 'Start geocoding' }))
    await waitFor(() => expect(geocodeAddress).toHaveBeenCalledOnce())
    if (action === 'reset') ctx.reset()
    else await mounted.unmount()
    const expectedStep = ctx.getCurrentStep()
    finish({ addressMeta: { address: {} }, i18n: { en: { addressProperties: {} } } })
    await tick()
    await Promise.resolve()
    expect(ctx.getCurrentStep()).toBe(expectedStep)
    expect(ctx.getRowEnrichedData(0)).toBeUndefined()
    expect(localStorage.length).toBe(0)
  },
)

it('releases a paused geocoding loop on unmount without starting the next row', async () => {
  const ctx = new ImportCtx()
  mocks.ctx = ctx
  ctx.setData([['1 Queen Road, Hong Kong'], ['2 Queen Road, Hong Kong']])
  ctx.setHeaders(['address'])
  ctx.setColumns([
    { header: 'address', modelType: 'Feature', field: 'rawAddress', locale: 'en' },
  ] as never)
  ctx.setCurrentStep('geo-lookup')
  let finish!: (value: unknown) => void
  vi.mocked(geocodeAddress).mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve
    }) as never,
  )
  const mounted = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Start geocoding' }))
  await waitFor(() => expect(geocodeAddress).toHaveBeenCalledOnce())
  await fireEvent.click(screen.getByRole('button', { name: 'Pause geocoding' }))
  vi.useFakeTimers()
  try {
    finish({ addressMeta: { address: {} }, i18n: { en: { addressProperties: {} } } })
    await vi.advanceTimersByTimeAsync(1100)
    await mounted.unmount()
    await vi.runAllTimersAsync()
    expect(geocodeAddress).toHaveBeenCalledOnce()
    expect(ctx.getCurrentStep()).toBe('geo-lookup')
    expect(ctx.getRowEnrichedData(1)).toBeUndefined()
  } finally {
    vi.useRealTimers()
  }
})
