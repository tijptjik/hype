// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import Field from '#lib/bits/patterns/forms/localLocationAddress/LocationLocaleField.svelte'
import { normalizeContentLocales } from '#lib/content-locales/model.js'
const localeState = {
  selectedLocales: normalizeContentLocales(['en', 'zh-Hant', 'zh-Hans']),
  visibleLocales: normalizeContentLocales(['en', 'zh-Hant']),
  expanded: true,
}
beforeEach(() => {
  vi.useRealTimers()
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
it('follows visible locales and retains hidden translations when editing a legacy locale tag', async () => {
  const onChange = vi.fn()
  render(Field, {
    label: 'Branch',
    value: { en: 'Central', 'zh-hant': '中環', 'zh-Hans': '中环', ja: '中央' },
    localeState,
    translations: true,
    onChange,
  })
  expect(screen.queryByRole('button', { name: 'Branch · 简中' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Branch · 日' })).toBeTruthy()
  await fireEvent.click(screen.getByRole('button', { name: 'Branch · 繁中' }))
  await fireEvent.input(screen.getByRole('textbox', { name: 'Branch · 繁中' }), {
    target: { value: '上環' },
  })
  expect(onChange).toHaveBeenLastCalledWith({
    en: 'Central',
    'zh-Hant': '上環',
    'zh-Hans': '中环',
    ja: '中央',
  })
  await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Branch · 繁中' }), {
    key: 'Escape',
  })
  expect(onChange).toHaveBeenLastCalledWith({
    en: 'Central',
    'zh-Hant': '中環',
    'zh-Hans': '中环',
    ja: '中央',
  })
})
it('collapses to the first locale and prevents editing locked fields', () => {
  const onChange = vi.fn()
  render(Field, {
    label: 'Format',
    value: { en: 'Cafe', 'zh-Hant': '咖啡店' },
    localeState,
    translations: false,
    disabled: true,
    onChange,
  })
  expect(screen.getByText('Cafe').textContent).toContain('Cafe')
  expect(screen.queryByRole('button')).toBeNull()
  expect(screen.queryByText('咖啡店')).toBeNull()
  expect(onChange).not.toHaveBeenCalled()
})
