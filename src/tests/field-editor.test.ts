// @vitest-environment jsdom
// TESTING
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// SVELTEKIT
// @ts-expect-error Exercise the installed remote-form parser.
import { convert_formdata } from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
// COMPONENTS
import Fixture from './fixtures/components/FieldEditorFixture.svelte'
// CONTENT LOCALES
import { contentFormKey, contentMapToStorage } from '#lib/i18n/contentRecords.js'

const originalAnimate = Element.prototype.animate
const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
beforeEach(() => {
  vi.useRealTimers()
  // JSDOM has no font loading API for the section header's layout observer.
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
  // JSDOM cannot animate the field editor's edit-mode transitions.
  Element.prototype.animate = () => ({ cancel() {} }) as Animation
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  }))
})
afterEach(() => {
  cleanup()
  Element.prototype.animate = originalAnimate
  if (originalFonts) Object.defineProperty(document, 'fonts', originalFonts)
  else Reflect.deleteProperty(document, 'fonts')
  vi.unstubAllGlobals()
})

/** Read actual serialized remote-form fields, including hidden locale controls.
 * @param container Rendered fixture. @returns Parsed property form data.
 */
function submitted(container: HTMLElement) {
  const form = container.querySelector<HTMLFormElement>('[data-field-form]')
  if (!form) throw new Error('Missing field form')
  return convert_formdata('field-editor', new FormData(form)).data.properties[0]
}

it('places the shared label error beside the visible Name in UI control', async () => {
  const view = render(Fixture, {
    allIssues: [
      { path: ['data', 'properties', 0, 'i18n'], message: 'Label is required' },
    ],
  })
  const column = view.container.querySelector<HTMLElement>(
    '[data-property-text-column="label"]',
  )
  if (!column) throw new Error('Missing Name in UI column')
  const display = within(column).getByRole('button', {
    name: 'Name in UI en',
  })
  expect(display.getAttribute('aria-invalid')).toBe('true')
  expect(
    document.getElementById(display.getAttribute('aria-describedby') ?? '')
      ?.textContent,
  ).toBe('Label is required')
  expect(within(column).getByRole('alert').textContent).toBe('Label is required')
  expect(screen.getAllByText('Label is required')).toHaveLength(1)
  expect(
    view.container.querySelector('[data-property-text-column="placeholder"]')
      ?.textContent,
  ).not.toContain('Label is required')

  await fireEvent.click(display)
  expect(screen.getAllByText('Label is required')).toHaveLength(1)
  await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name in UI en' }), {
    key: 'Enter',
  })
  expect(within(column).getByRole('alert').textContent).toBe('Label is required')

  await view.rerender({ allIssues: [] })
  expect(screen.queryByText('Label is required')).toBeNull()
  expect(display.hasAttribute('aria-invalid')).toBe(false)
})

it('submits hyphenated locales and verification flags after editing and hiding their rows', async () => {
  const view = render(Fixture, { extraLocales: ['pt-BR', 'sr-Latn-RS'] })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(screen.getByRole('button', { name: 'Name in UI pt-BR' }))
  const label = screen.getByRole('textbox', { name: 'Name in UI pt-BR' })
  await fireEvent.input(label, { target: { value: 'Religião' } })
  await fireEvent.keyDown(label, { key: 'Enter' })
  const option = screen.getByRole('textbox', { name: 'Option 1 pt-BR' })
  await fireEvent.input(option, { target: { textContent: 'Cristão' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  const result = submitted(view.container)
  expect(contentMapToStorage(result.i18n)).toMatchObject({
    'pt-BR': {
      label: 'Religião',
      labelGen: false,
      placeholder: 'Select pt-BR',
      placeholderGen: false,
    },
    'sr-Latn-RS': { label: 'Religion sr-Latn-RS', labelGen: true },
  })
  expect(contentMapToStorage(result.values[0].i18n)).toMatchObject({
    'pt-BR': { value: 'Cristão', valueGen: false },
    'sr-Latn-RS': { value: 'Christian sr-Latn-RS', valueGen: true },
  })
  expect(result.i18n[contentFormKey('pt-BR')].label).toBe('Religião')
})

it('only offers adding field languages in edit mode and closes an open picker when editing ends', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(
    within(
      screen.getByRole('button', { name: 'Multilingual' }).closest('header')!,
    ).getByRole('button', { name: 'Add' }),
  )
  const search = await screen.findByPlaceholderText('Search languages')
  await fireEvent.input(search, { target: { value: 'Japanese' } })
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  expect(
    within(
      screen.getByRole('button', { name: 'Multilingual' }).closest('header')!,
    ).queryByRole('button', { name: 'Add' }),
  ).toBeNull()
  expect(screen.queryByPlaceholderText('Search languages')).toBeNull()
  expect(screen.getByRole('button', { name: 'Traditional Chinese' })).toBeTruthy()
  expect(submitted(view.container).i18n.ja).toBeUndefined()
  await fireEvent.click(screen.getByRole('button', { name: 'Toggle editing' }))
  expect(
    within(
      screen.getByRole('button', { name: 'Multilingual' }).closest('header')!,
    ).getByRole('button', { name: 'Add' }),
  ).toBeTruthy()
  expect(screen.queryByPlaceholderText('Search languages')).toBeNull()
})

it('shares locale order across text fields and option columns, retaining hidden and missing translations in submission', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  expect(view.container.querySelectorAll('[data-property-settings]')).toHaveLength(1)
  const option = screen.getByRole('textbox', { name: 'Option 1 zh-Hans' })
  expect(option.textContent).toBe('')
  await fireEvent.input(option, { target: { textContent: '基督教' } })
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Simplified Chinese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  const order = Array.from(
    view.container.querySelectorAll(
      '[data-property-text-column="label"] [data-property-locale]',
    ),
  ).map(row => row.getAttribute('data-property-locale'))
  expect(order).toEqual(['en', 'zh-Hans', 'zh-Hant'])
  const firstOption = option.closest('[data-dnd-item]')
  if (!firstOption) throw new Error('Missing option column')
  expect(
    Array.from(firstOption.querySelectorAll('[data-option-locale]')).map(row =>
      row.getAttribute('data-option-locale'),
    ),
  ).toEqual(order)
  await fireEvent.click(screen.getByRole('button', { name: 'Simplified Chinese' }))
  expect(screen.queryByRole('textbox', { name: 'Option 1 zh-Hans' })).toBeNull()
  const result = submitted(view.container)
  expect(result.values[0]).toMatchObject({
    id: 'option-0',
    rank: 0,
    i18n: { zhHans: { value: '基督教', valueGen: false }, en: { value: 'Christian' } },
  })
  expect(result.values[1].i18n.zhHans.value).toBe('')
  expect(result.i18n.zhHant.label).toBe('宗教')
})

it('adds Japanese, edits and cancels individual fields, and preserves option identities during column reordering', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  await fireEvent.click(
    within(
      screen.getByRole('button', { name: 'Multilingual' }).closest('header')!,
    ).getByRole('button', { name: 'Add' }),
  )
  const search = await screen.findByPlaceholderText('Search languages')
  await fireEvent.input(search, { target: { value: 'Japanese' } })
  await fireEvent.keyDown(search, { key: 'Enter' })
  console.log(
    'ADDED LOCALES',
    [...view.container.querySelectorAll('[data-property-locale]')].map(row => ({
      locale: row.getAttribute('data-property-locale'),
      label: row.querySelector('[role=button]')?.getAttribute('aria-label'),
    })),
  )
  const display = await screen.findByRole('button', { name: 'Name in UI ja' })
  await fireEvent.click(display)
  const input = screen.getByRole('textbox', { name: 'Name in UI ja' })
  await fireEvent.input(input, { target: { value: '宗教' } })
  await fireEvent.keyDown(input, { key: 'Escape' })
  expect(submitted(view.container).i18n.ja.label).toBe('')
  await fireEvent.click(display)
  await fireEvent.input(input, { target: { value: '宗教' } })
  await fireEvent.keyDown(input, { key: 'Enter' })
  const japaneseOption = screen.getByRole('textbox', { name: 'Option 1 ja' })
  await fireEvent.input(japaneseOption, { target: { textContent: 'キリスト教' } })
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder option 1' }), {
    key: 'ArrowRight',
    altKey: true,
  })
  expect(submitted(view.container).values[1]).toMatchObject({
    id: 'option-0',
    rank: 1,
    i18n: { ja: { value: 'キリスト教' }, zhHant: { value: '基督教' } },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  expect(submitted(view.container).i18n.ja.label).toBe('宗教')
})

it('keeps canonical dropdown values in one row while labels remain multilingual', async () => {
  const view = render(Fixture, { translatable: false })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  expect(screen.getAllByRole('textbox', { name: /^Option / })).toHaveLength(7)
  const option = screen.getByRole('textbox', { name: 'Option 1 en' })
  await fireEvent.input(option, { target: { textContent: 'Canonical' } })
  expect(submitted(view.container).values[0].value).toBe('Canonical')
})

it('uses one header language strip to add, hide and reorder languages across every field', async () => {
  const view = render(Fixture, { fieldCount: 2 })
  const toggle = screen.getByRole('button', { name: 'Multilingual' })
  expect(toggle.closest('header')).not.toBeNull()
  expect(view.container.querySelectorAll('[data-locale-toolbar]')).toHaveLength(1)
  const editors = Array.from(view.container.querySelectorAll('[data-property-editor]'))
  expect(editors).toHaveLength(2)
  expect(editors.every(editor => !editor.querySelector('[data-locale-toolbar]'))).toBe(
    true,
  )
  await fireEvent.click(toggle)
  await fireEvent.click(screen.getByRole('button', { name: 'Simplified Chinese' }))
  for (const editor of editors) {
    expect(editor.querySelector('[data-property-locale="zh-Hans"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  }
  await fireEvent.click(
    within(
      screen.getByRole('button', { name: 'Multilingual' }).closest('header')!,
    ).getByRole('button', { name: 'Add' }),
  )
  const search = await screen.findByPlaceholderText('Search languages')
  await fireEvent.input(search, { target: { value: 'Japanese' } })
  await fireEvent.keyDown(search, { key: 'Enter' })
  expect(await screen.findAllByRole('button', { name: 'Name in UI ja' })).toHaveLength(
    2,
  )
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Japanese' }), {
    key: 'ArrowLeft',
    altKey: true,
  })
  for (const editor of editors) {
    const order = Array.from(
      editor.querySelectorAll(
        '[data-property-text-column="label"] [data-property-locale]',
      ),
    ).map(row => row.getAttribute('data-property-locale'))
    expect(order).toEqual(['en', 'zh-Hant', 'ja', 'zh-Hans'])
  }
  await fireEvent.click(toggle)
  await fireEvent.click(toggle)
  expect(view.container.querySelectorAll('[data-locale-dnd-zone]')).toHaveLength(1)
  expect(submitted(view.container).i18n.zhHans.label).toBe('宗教')
})

it('places translation controls in the option header and scopes requests to that option', async () => {
  const translate = vi.fn(async () => true)
  const view = render(Fixture, { translate })
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  const option = view.container.querySelector('[data-dnd-item]') as HTMLElement
  const header = option.querySelector('[data-option-header]') as HTMLElement
  await fireEvent.click(
    within(header).getByRole('button', { name: 'Translate empty values from English' }),
  )
  await waitFor(() => expect(translate).toHaveBeenCalledTimes(2))
  expect(translate.mock.calls).toEqual([
    ['religion', 'en', 'zh-Hant', { type: 'value', valueId: 'option-0' }],
    ['religion', 'en', 'zh-Hans', { type: 'value', valueId: 'option-0' }],
  ])
  expect(screen.getAllByRole('heading', { name: 'Options' })).toHaveLength(1)
  expect(submitted(view.container).values[1].i18n.zhHans.value).toBe('')
})

it('clears one generated option locale without removing the option or changing sibling values', async () => {
  const view = render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Multilingual' }))
  const before = submitted(view.container)
  const editor = screen.getByRole('textbox', { name: 'Option 1 zh-Hant' })
  await fireEvent.click(screen.getByRole('button', { name: 'Clear Option 1 zh-Hant' }))
  await waitFor(() => expect(document.activeElement).toBe(editor))
  const after = submitted(view.container)
  expect(after.values).toHaveLength(before.values.length)
  expect(after.values[0]).toMatchObject({
    id: 'option-0',
    rank: 0,
    i18n: { zhHant: { value: '', valueGen: false }, en: { value: 'Christian' } },
  })
  expect(after.values[1]).toEqual(before.values[1])
  expect(after.i18n).toEqual(before.i18n)
  expect(editor.textContent).toBe('')
  expect(screen.queryByRole('button', { name: 'Clear Option 1 zh-Hant' })).toBeNull()
})

it('clears a canonical option value without deleting its option or stored translations', async () => {
  const view = render(Fixture, { translatable: false })
  const before = submitted(view.container)
  await fireEvent.click(screen.getByRole('button', { name: 'Clear Option 1 en' }))
  const after = submitted(view.container)
  expect(after.values).toHaveLength(before.values.length)
  expect(after.values[0].value).toBe('')
  expect(after.values[0].i18n).toEqual(before.values[0].i18n)
  expect(after.values[1]).toEqual(before.values[1])
})

it('tabs from a cleared option to the next visible option when languages are collapsed', async () => {
  render(Fixture)
  await fireEvent.click(screen.getByRole('button', { name: 'Clear Option 1 en' }))
  const first = screen.getByRole('textbox', { name: 'Option 1 en' })
  await waitFor(() => expect(document.activeElement).toBe(first))
  await fireEvent.keyDown(first, { key: 'Tab' })
  expect(document.activeElement).toBe(
    screen.getByRole('textbox', { name: 'Option 2 en' }),
  )
})
