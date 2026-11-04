// @vitest-environment jsdom
// TESTS
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, waitFor } from '@testing-library/svelte/pure'
// SVELTE
import { tick } from 'svelte'
// CONTEXT
import { ImportCtx } from '#lib/context/import.svelte.js'
// API
import { translateText } from '#lib/api/translation.remote.js'
// COMPONENTS
import TranslationStep from '#lib/bits/patterns/import/components/features/steps/translation/TranslationStep.svelte'

vi.mock('#lib/api/translation.remote.js', () => ({ translateText: vi.fn() }))
beforeEach(() => {
  vi.useRealTimers()
  vi.mocked(translateText).mockReset()
})
afterEach(cleanup)

it.each(['resolve', 'reject'])(
  'ignores a late translation %s after unmount and can restart',
  async outcome => {
    const ctx = new ImportCtx()
    ctx.setHeaders(['title'])
    ctx.setData([['A meaningful title']])
    ctx.setColumns([
      { header: 'title', modelType: 'Feature', field: 'title', locale: 'en' },
    ] as never)
    ctx.setCurrentStep('translation')
    let finish!: (value: string[]) => void
    let fail!: (error: Error) => void
    vi.mocked(translateText).mockReturnValueOnce(
      new Promise((resolve, reject) => {
        finish = resolve
        fail = reject
      }) as never,
    )
    const mounted = render(TranslationStep, { importCtx: ctx })
    await waitFor(() => expect(translateText).toHaveBeenCalledOnce())
    await mounted.unmount()
    expect(ctx.getTranslation().status).toBe('idle')
    if (outcome === 'resolve') finish(['Old translation'])
    else fail(new Error('Old failure'))
    await tick()
    await Promise.resolve()
    expect(ctx.getRowEnrichedData(0)).toBeUndefined()
    expect(ctx.getCurrentStep()).toBe('translation')
    expect(ctx.getTranslation().status).toBe('idle')
    expect(translateText).toHaveBeenCalledOnce()

    vi.mocked(translateText).mockResolvedValue(['Fresh translation'])
    render(TranslationStep, { importCtx: ctx })
    await waitFor(() => expect(ctx.getCurrentStep()).toBe('geo-lookup'))
    expect(ctx.getTranslation().status).toBe('complete')
    expect(ctx.getRowEnrichedData(0)).toBeDefined()
  },
)

it('does not repopulate a reset import while the old step is still mounted', async () => {
  const ctx = new ImportCtx()
  ctx.setHeaders(['title'])
  ctx.setData([['A meaningful title']])
  ctx.setColumns([
    { header: 'title', modelType: 'Feature', field: 'title', locale: 'en' },
  ] as never)
  ctx.setCurrentStep('translation')
  let finish!: (value: string[]) => void
  vi.mocked(translateText).mockReturnValueOnce(
    new Promise(resolve => {
      finish = resolve
    }) as never,
  )
  render(TranslationStep, { importCtx: ctx })
  await waitFor(() => expect(translateText).toHaveBeenCalledOnce())
  ctx.reset()
  finish(['Old translation'])
  await tick()
  await Promise.resolve()
  expect(ctx.getRowEnrichedData(0)).toBeUndefined()
  expect(ctx.getCurrentStep()).toBe('column-mapping')
  expect(ctx.getTranslation().status).toBe('idle')
  expect(translateText).toHaveBeenCalledOnce()
})
