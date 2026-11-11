// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fields from '#lib/bits/patterns/forms/formFeatureFields/FormFeatureFields.svelte'

const { translate } = vi.hoisted(() => ({
  translate: vi.fn(async (input: { source: string; target: string; text: string }) => ({
    status: 'translated',
    source: input.source,
    target: input.target,
    text: '提案',
    automatic: {
      value: '提案',
      sourceLocale: input.source,
      sourceText: input.text,
      sourceHash: 'a'.repeat(64),
      receipt: 'b'.repeat(64),
      provider: 'test',
      model: null,
      generatedAt: '2026-11-12T00:00:00Z',
    },
  })),
}))
vi.mock('#lib/api/translation.remote.js', () => ({ translateContentField: translate }))
beforeEach(() => {
  vi.useRealTimers()
  translate.mockClear()
})
afterEach(cleanup)

it('keeps a fourth-language field suggestion unpublished until explicit acceptance', async () => {
  const onTranslation = vi.fn()
  const onValueChange = vi.fn()
  const row = {
    propertyId: 'access',
    i18n: {
      en: { value: 'Step-free entrance', valueGen: false },
      ja: { value: '', valueGen: false },
    },
  }
  render(Fields, {
    localeKey: 'en',
    locales: ['en', 'ja'],
    nonTranslatableItems: [],
    translatableSpecifierItems: [row],
    onTranslation,
    onValueChange,
    onTranslate: async () => false,
    onResetLocale: () => {},
    onToggleGenAI: () => {},
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Translate with AI' }))
  await waitFor(() => expect(onTranslation).toHaveBeenCalledTimes(1))
  expect(translate).toHaveBeenCalledWith({
    source: 'en',
    target: 'ja',
    text: 'Step-free entrance',
  })
  expect(onTranslation.mock.calls[0]).toHaveLength(3)
  expect(onValueChange).not.toHaveBeenCalled()
  expect(row.i18n.ja.value).toBe('')
  await fireEvent.click(screen.getByRole('button', { name: 'Accept translation' }))
  expect(onTranslation.mock.calls[1]).toEqual([
    'access',
    'ja',
    expect.objectContaining({ sourceLocale: 'en' }),
    '提案',
  ])
})
