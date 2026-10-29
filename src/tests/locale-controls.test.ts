// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/LocaleControlsFixture.svelte'
import LocaleToolbar from '#lib/bits/custom/localeControls/LocaleToolbar.svelte'
import { contentLocaleOptions } from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleOptions.js'
import { searchLocaleOptions } from '#lib/bits/custom/localeControls/localeControls.js'
import {
  readContentLocaleForm,
  contentLocaleFormIssues,
} from '#lib/bits/patterns/forms/contentLocaleDefaults/contentLocaleForm.js'
import { applyContentLocaleSettingsPatch } from '#lib/content-locales/settings.js'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
beforeEach(() => {
  vi.useRealTimers()
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
  // JSDOM has no Web Animations API; exercise motion in the real-browser checks.
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
const profile = () => within(screen.getByRole('region', { name: 'Profile languages' }))
const state = (): {
  selectedLocales: string[]
  visibleLocales: string[]
  values: Record<string, string>
  changes: number
  override?: string[]
} =>
  JSON.parse(
    document.querySelector('[data-locale-state]')!.getAttribute('data-locale-state')!,
  )

it('finds canonical tags, legacy aliases, localized names and autonyms', () => {
  for (const query of ['zh-Hant', 'zhHant', 'Traditional Chinese', '繁體中文']) {
    expect(
      searchLocaleOptions(contentLocaleOptions('en'), query).map(row => row.tag),
    ).toContain('zh-Hant')
  }
  const chinese = contentLocaleOptions('zh-Hant')
  const japanese = chinese.find(row => row.tag === 'ja')!
  expect(searchLocaleOptions(chinese, japanese.name).map(row => row.tag)).toContain(
    'ja',
  )
})

it('adds by keyboard, returns focus quietly to Add and excludes existing languages', async () => {
  render(Fixture)
  await fireEvent.click(profile().getByRole('button', { name: '+ Add' }))
  // JSDOM has no layout, so Floating UI keeps the overlay visually hidden.
  const input = await screen.findByRole('combobox', { hidden: true })
  expect(document.activeElement).toBe(input)
  await fireEvent.input(input, { target: { value: 'Japanese' } })
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(state().selectedLocales).toEqual(['en', 'zh-Hant', 'zh-Hans', 'ja'])
  expect(document.activeElement).toBe(
    profile().getByRole('button', { name: '+ Add' }),
  )
  await fireEvent.click(profile().getByRole('button', { name: 'Japanese' }))
  expect(state().visibleLocales).not.toContain('ja')
  await fireEvent.click(profile().getByRole('button', { name: '+ Add' }))
  await fireEvent.input(await screen.findByRole('combobox', { hidden: true }), {
    target: { value: '日本語' },
  })
  await fireEvent.keyDown(await screen.findByRole('combobox', { hidden: true }), {
    key: 'Enter',
  })
  expect(state().selectedLocales.filter(tag => tag === 'ja')).toHaveLength(1)
  expect(state().visibleLocales).not.toContain('ja')
  expect(screen.queryAllByRole('option', { hidden: true })).toHaveLength(0)
})

it('prevents zero visible locales and never changes stored values', async () => {
  render(Fixture)
  const initialValues = state().values
  await fireEvent.click(profile().getByRole('button', { name: 'Traditional Chinese' }))
  await fireEvent.click(profile().getByRole('button', { name: 'Simplified Chinese' }))
  await fireEvent.click(profile().getByRole('button', { name: 'English' }))
  expect(state().visibleLocales).toEqual(['en'])
  expect(screen.getByText('Keep at least one language visible.')).toBeTruthy()
  expect(state().values).toEqual(initialValues)
})

it('reorders with keyboard and touch buttons, preserves chip focus and uses first locale when collapsed', async () => {
  render(Fixture)
  const chinese = profile().getByRole('button', { name: 'Traditional Chinese' })
  chinese.focus()
  await fireEvent.keyDown(chinese, { key: 'ArrowLeft', altKey: true })
  expect(state().selectedLocales[0]).toBe('zh-Hant')
  expect(document.activeElement).toBe(chinese)
  await fireEvent.keyDown(profile().getByRole('button', { name: 'English' }), {
    key: 'ArrowRight',
    altKey: true,
  })
  expect(state().selectedLocales).toEqual(['zh-Hant', 'zh-Hans', 'en'])
  await fireEvent.click(profile().getByRole('button', { name: 'Multilingual' }))
  expect(document.querySelectorAll('[data-field-locale]')).toHaveLength(1)
  expect(
    document.querySelector('[data-field-locale]')!.getAttribute('data-field-locale'),
  ).toBe('zh-Hant')
  await fireEvent.click(profile().getByRole('button', { name: 'Multilingual' }))
  expect(state().visibleLocales).toHaveLength(3)
})

it('follows external state updates and does not keep rejected optimistic selection', async () => {
  render(Fixture, { acceptChanges: false })
  await fireEvent.keyDown(profile().getByRole('button', { name: 'English' }), {
    key: 'ArrowRight',
    altKey: true,
  })
  expect(state().selectedLocales[0]).toBe('en')
  expect(state().changes).toBe(1)
  await fireEvent.click(screen.getByRole('button', { name: 'Replace caller state' }))
  expect(
    profile().getByRole('button', { name: 'Japanese' }).getAttribute('aria-pressed'),
  ).toBe('true')
  expect(profile().queryByRole('button', { name: 'Traditional Chinese' })).toBeNull()
})

it('supports arrow navigation, empty results and Escape focus restoration without submitting', async () => {
  render(Fixture)
  const add = profile().getByRole('button', { name: '+ Add' })
  await fireEvent.click(add)
  // JSDOM has no layout, so Floating UI keeps the overlay visually hidden.
  const input = await screen.findByRole('combobox', { hidden: true })
  await fireEvent.keyDown(input, { key: 'ArrowDown' })
  expect(input.getAttribute('aria-activedescendant')).toMatch(/-1$/)
  await fireEvent.input(input, { target: { value: 'no-such-language' } })
  await fireEvent.keyDown(input, { key: 'Enter' })
  expect(state().changes).toBe(0)
  expect(screen.getByText('No languages found')).toBeTruthy()
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect((input as HTMLInputElement).value).toBe('')
  expect(screen.getByRole('combobox', { hidden: true })).toBe(input)
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(screen.queryByRole('combobox', { hidden: true })).toBeNull()
  expect(document.activeElement).toBe(add)
})

it('requires explicit overrides and resets to the live inherited order without materializing defaults', async () => {
  render(Fixture)
  expect(state().changes).toBe(0)
  expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  expect(state().override).toBeUndefined()
  const settings = screen.getAllByRole('region', { name: 'Default Languages' })[0]
  await fireEvent.keyDown(settings.querySelector('[data-locale="en"]')!, {
    key: 'ArrowRight',
    altKey: true,
  })
  expect(state().override).toEqual(['zh-Hant', 'en', 'zh-Hans'])
  await fireEvent.click(
    within(settings).getByRole('button', { name: 'Remove English' }),
  )
  await fireEvent.click(
    within(settings).getByRole('button', { name: 'Remove Simplified Chinese' }),
  )
  await fireEvent.click(
    within(settings).getByRole('button', { name: 'Remove Traditional Chinese' }),
  )
  expect(state().override).toEqual(['zh-Hant'])
  await fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }))
  expect(state().override).toBeUndefined()
  expect(
    within(settings).getByText(
      'Availability and order of languages in the editors used across HKFoodWorks.',
    ),
  ).toBeTruthy()
  await fireEvent.keyDown(
    screen
      .getAllByRole('region', { name: 'Default Languages' })[1]
      .querySelector('[data-locale="en"]')!,
    { key: 'ArrowRight', altKey: true },
  )
  expect(state().override).toBeUndefined()
})

it('previews a drag locally and commits its final order without revealing hidden locales', async () => {
  const view = render(Fixture)
  await fireEvent.click(profile().getByRole('button', { name: 'English' }))
  const zone = view.container.querySelector('[data-locale-dnd-zone]')!
  const items = ['zh-Hant', 'zh-Hans', 'en'].map(tag => ({ id: tag, tag }))
  await fireEvent(
    zone,
    new CustomEvent('consider', {
      detail: {
        items,
        info: { id: 'en', source: 'pointer', trigger: 'draggedOverIndex' },
      },
    }),
  )
  expect(state().selectedLocales).toEqual(['en', 'zh-Hant', 'zh-Hans'])
  await fireEvent(
    zone,
    new CustomEvent('finalize', {
      detail: {
        items,
        info: { id: 'en', source: 'pointer', trigger: 'droppedIntoZone' },
      },
    }),
  )
  expect(state().selectedLocales).toEqual(['zh-Hant', 'zh-Hans', 'en'])
  expect(state().visibleLocales).not.toContain('en')
})

it('retains unknown saved tags and disables all editing when read-only', async () => {
  const onChange = vi.fn()
  render(LocaleToolbar, {
    selectedLocales: ['haw', 'en'],
    visibleLocales: ['haw'],
    expanded: true,
    options: contentLocaleOptions('en'),
    onExpandedChange: vi.fn(),
    onChange,
    disabled: true,
  })
  const hawaiian = screen.getByRole('button', { name: 'haw' }) as HTMLButtonElement
  expect(hawaiian.getAttribute('aria-disabled')).toBe('true')
  expect(hawaiian.draggable).toBe(false)
  await fireEvent.keyDown(hawaiian, { key: 'ArrowRight', altKey: true })
  expect(onChange).not.toHaveBeenCalled()
})

it('uses the backend patch contract without writing inherited defaults and retains nested errors', () => {
  const stored = { otherSetting: true }
  expect(readContentLocaleForm(undefined)).toEqual({})
  expect(applyContentLocaleSettingsPatch(stored, readContentLocaleForm('{}'))).toEqual(
    stored,
  )
  const patch = readContentLocaleForm(JSON.stringify({ contentLocales: ['ja', 'en'] }))
  const saved = applyContentLocaleSettingsPatch(stored, patch)
  expect(saved.contentLocales).toEqual(['ja', 'en'])
  expect(
    applyContentLocaleSettingsPatch(
      saved,
      readContentLocaleForm('{"contentLocales":null}'),
    ),
  ).toEqual(stored)
  expect(
    contentLocaleFormIssues([
      { path: ['data', 'settings', 'contentLocales', 0], message: 'Choose a language' },
      { path: ['data', 'flags'], message: 'Other field' },
    ]),
  ).toEqual(['Choose a language'])
})

it('tabs from search to the result after its highlight and keeps Close out of the tab order', async () => {
  render(Fixture)
  await fireEvent.click(profile().getByRole('button', { name: '+ Add' }))
  const input = await screen.findByRole('combobox', { hidden: true })
  const results = screen.getAllByRole('option', { hidden: true })
  expect(input.parentElement?.querySelector('button')?.tabIndex).toBe(-1)
  await fireEvent.keyDown(input, { key: 'Tab' })
  expect(document.activeElement).toBe(results[1])
  input.focus()
  await fireEvent.keyDown(input, { key: 'ArrowDown' })
  await fireEvent.keyDown(input, { key: 'Tab' })
  expect(document.activeElement).toBe(results[3])
})
