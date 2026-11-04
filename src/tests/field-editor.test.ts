// @vitest-environment jsdom
// TESTING
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
// SVELTEKIT
// @ts-expect-error Exercise the installed remote-form parser.
import { convert_formdata } from '../../node_modules/@sveltejs/kit/src/runtime/form-utils.js'
// COMPONENTS
import Fixture from './fixtures/components/FieldEditorFixture.svelte'

beforeEach(() => {
  vi.useRealTimers()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  if (!Element.prototype.getAnimations) Element.prototype.getAnimations = () => []
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

/** Read actual serialized remote-form fields, including hidden locale controls.
 * @param container Rendered fixture. @returns Parsed property form data.
 */
function submitted(container: HTMLElement) {
  const form = container.querySelector<HTMLFormElement>('[data-field-form]')
  if (!form) throw new Error('Missing field form')
  return convert_formdata('field-editor', new FormData(form)).data.properties[0]
}

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
  await fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
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
  await fireEvent.click(screen.getByRole('button', { name: '+ Add' }))
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
