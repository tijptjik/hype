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
import { tick } from 'svelte'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// API
import { translateText } from '#lib/api/translation.remote.js'
// COMPONENTS
import PropertyDataEnrichment from '#lib/bits/patterns/import/components/features/steps/properties/PropertyDataEnrichment.svelte'

const mocks = vi.hoisted(() => ({ ctx: null as unknown }))
vi.mock('#lib/context/import.svelte.js', async original => ({
  ...(await original<object>()),
  getImportCtx: () => mocks.ctx,
}))
vi.mock('#lib/api/translation.remote.js', () => ({ translateText: vi.fn() }))
beforeEach(() => {
  vi.useRealTimers()
  vi.mocked(translateText).mockReset()
})
afterEach(cleanup)

it.each(['reset', 'unmount', 'failure'])(
  'does not publish incomplete property enrichment after %s',
  async action => {
    const ctx = new ImportCtx()
    mocks.ctx = ctx
    ctx.setData([['Original note']])
    ctx.setHeaders(['note'])
    ctx.setCurrentStep('property-matching')
    let finish!: (value: string[]) => void
    let fail!: (error: Error) => void
    vi.mocked(translateText)
      .mockReturnValueOnce(
        new Promise((resolve, reject) => {
          finish = resolve
          fail = reject
        }) as never,
      )
      .mockResolvedValue(['Later translation'])
    const mounted = render(PropertyDataEnrichment, {
      property: {
        key: 'note',
        scenario: 3,
        columns: [
          {
            header: 'note',
            sampleValues: ['Original note'],
            modelType: 'Property',
            field: 'value',
            locale: 'en',
          },
        ],
      },
      onActionComplete: vi.fn(),
    })
    await waitFor(() => expect(translateText).toHaveBeenCalledOnce())
    if (action === 'reset') ctx.reset()
    if (action === 'unmount') await mounted.unmount()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      if (action === 'failure') fail(new Error('Translation unavailable'))
      else finish(['Old translation'])
      await tick()
      await Promise.resolve()
      if (action === 'failure')
        await waitFor(() =>
          expect(screen.getByText('Translation unavailable')).toBeTruthy(),
        )
      expect(ctx.getPropertyEnrichedData('note')).toBeUndefined()
      expect(translateText).toHaveBeenCalledOnce()
    } finally {
      log.mockRestore()
    }
  },
)

it('retries a failed translation and publishes only the completed enrichment', async () => {
  const ctx = new ImportCtx()
  mocks.ctx = ctx
  ctx.setData([['Original note']])
  ctx.setHeaders(['note'])
  ctx.setCurrentStep('property-matching')
  vi.mocked(translateText)
    .mockRejectedValueOnce(new Error('Try again'))
    .mockResolvedValue(['Translated'])
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    render(PropertyDataEnrichment, {
      property: {
        key: 'note',
        scenario: 3,
        columns: [
          {
            header: 'note',
            sampleValues: ['Original note'],
            modelType: 'Property',
            field: 'value',
            locale: 'en',
          },
        ],
      },
      onActionComplete: vi.fn(),
    })
    await waitFor(() => expect(screen.getByText('Try again')).toBeTruthy())
    expect(ctx.getPropertyEnrichedData('note')).toBeUndefined()
    await fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(ctx.getPropertyEnrichedData('note')).toBeDefined())
    expect(ctx.getPropertyEnrichedData('note')!.enrichedData!.get(0)).toMatchObject({
      en: 'Original note',
      'zh-hant': 'Translated',
      'zh-hans': 'Translated',
    })
  } finally {
    log.mockRestore()
  }
})
