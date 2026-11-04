// TESTS
import { expect, it, vi } from 'vitest'
// SERVICES
import {
  processFeatureTranslations,
  type FeatureTranslationAnalysis,
} from '#lib/client/services/import/features/translation.js'

it('stops later translation directions and status publication after cancellation', async () => {
  let current = true
  let finish!: (value: string[]) => void
  const translate = vi.fn(
    () =>
      new Promise<string[]>(resolve => {
        finish = resolve
      }),
  )
  const status = vi.fn()
  const analysis = {
    scenarios: [
      {
        rowIndex: 0,
        scenario: 1,
        sourceLocale: 'en',
        targetLocales: ['zhHant', 'zhHans'],
        missingLocales: ['zhHant', 'zhHans'],
        sourceText: 'Title',
        field: 'title',
      },
    ],
  } as FeatureTranslationAnalysis
  const pending = processFeatureTranslations({
    analysis,
    translationResults: new Map(),
    translateText: translate,
    onBatchStatus: status,
    isCurrent: () => current,
  })
  current = false
  status.mockClear()
  finish(['Old translation'])
  // A second request would remain pending and make this test time out.
  expect(await pending).toEqual(new Map())
  expect(translate).toHaveBeenCalledOnce()
  expect(status).not.toHaveBeenCalled()
})

it('completes all translation directions while the work remains current', async () => {
  const analysis = {
    scenarios: [
      {
        rowIndex: 0,
        scenario: 1,
        sourceLocale: 'en',
        targetLocales: ['zhHant', 'zhHans'],
        missingLocales: ['zhHant', 'zhHans'],
        sourceText: 'Title',
        field: 'title',
      },
    ],
  } as FeatureTranslationAnalysis
  const translate = vi
    .fn()
    .mockResolvedValueOnce(['傳統'])
    .mockResolvedValueOnce(['简体'])
  const results = await processFeatureTranslations({
    analysis,
    translationResults: new Map(),
    translateText: translate,
  })
  expect(results.get(0)).toEqual({ zhHant: '傳統', zhHans: '简体' })
  expect(translate).toHaveBeenCalledTimes(2)
})

it('does not mutate the caller result records while processing additional locales', async () => {
  const initial = new Map([[0, { zhHant: 'Existing' }]])
  const analysis = {
    scenarios: [
      {
        rowIndex: 0,
        scenario: 1,
        sourceLocale: 'en',
        targetLocales: ['zhHans'],
        missingLocales: ['zhHans'],
        sourceText: 'Title',
        field: 'title',
      },
    ],
  } as FeatureTranslationAnalysis
  const results = await processFeatureTranslations({
    analysis,
    translationResults: initial,
    translateText: async () => ['简体'],
  })
  expect(initial.get(0)).toEqual({ zhHant: 'Existing' })
  expect(results.get(0)).toEqual({ zhHant: 'Existing', zhHans: '简体' })
})
