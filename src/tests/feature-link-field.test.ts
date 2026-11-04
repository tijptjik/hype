// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/svelte/pure'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { translateText } from '#lib/api/translation.remote.js'
import { getLinkTitle } from '#lib/api/link.remote.js'
import Links from '#lib/bits/patterns/forms/formFeatureField/components/FeatureFieldLinks.svelte'

vi.mock('#lib/api/translation.remote.js', () => ({
  translateText: vi.fn(async () => ['Translated']),
}))
vi.mock('#lib/api/link.remote.js', () => ({ getLinkTitle: vi.fn(async () => null) }))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
it('adds, edits translations, reorders and removes links with stable IDs', async () => {
  const onChange = vi.fn()
  const view = render(Links, { value: '', cardinality: 'many', onChange })
  await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
  let value = onChange.mock.lastCall![0]
  const id = JSON.parse(value).items[0].id
  await view.rerender({ value, cardinality: 'many', onChange })
  await fireEvent.input(screen.getByLabelText('URL'), {
    target: { value: 'https://example.org' },
  })
  value = onChange.mock.lastCall![0]
  await view.rerender({ value, cardinality: 'many', onChange })
  await fireEvent.input(screen.getByLabelText('Link text — 繁體中文'), {
    target: { value: '版本' },
  })
  value = onChange.mock.lastCall![0]
  expect(JSON.parse(value).items[0]).toMatchObject({
    id,
    url: 'https://example.org',
    label: { zhHant: '版本' },
  })
  await view.rerender({ value, cardinality: 'many', onChange })
  await fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
  value = onChange.mock.lastCall![0]
  const secondId = JSON.parse(value).items[1].id
  await view.rerender({ value, cardinality: 'many', onChange })
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder link 2' }), {
    key: 'ArrowUp',
    altKey: true,
  })
  value = onChange.mock.lastCall![0]
  expect(JSON.parse(value).items.map((item: { id: string }) => item.id)).toEqual([
    secondId,
    id,
  ])
  await view.rerender({ value, cardinality: 'many', onChange })
  await fireEvent.click(screen.getByRole('button', { name: 'Remove link 1' }))
  expect(JSON.parse(onChange.mock.lastCall![0]).items[0].id).toBe(id)
})
it('keeps unsupported versions read-only without emitting replacement data', () => {
  const onChange = vi.fn()
  render(Links, { value: '{"version":2,"items":[]}', onChange })
  expect(screen.getByRole('status').textContent).toContain('preserved')
  expect(screen.queryByRole('button')).toBeNull()
  expect(onChange).not.toHaveBeenCalled()
})

it('fills an empty label with the fetched title without changing other locales', async () => {
  vi.mocked(getLinkTitle).mockResolvedValueOnce({
    title: 'A book',
    locale: 'en',
  } as never)
  const onChange = vi.fn()
  render(Links, {
    value: JSON.stringify({
      version: 1,
      items: [{ id: 'a', url: 'https://example.org/book', label: { zhHant: '書' } }],
    }),
    onChange,
  })
  await fireEvent.blur(screen.getByLabelText('URL'))
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  expect(JSON.parse(onChange.mock.lastCall![0]).items[0].label).toEqual({
    en: 'A book',
    zhHant: '書',
  })
})
it('does not overwrite text entered while a title request is pending', async () => {
  let finish!: (value: unknown) => void
  vi.mocked(getLinkTitle).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve
      }) as never,
  )
  const onChange = vi.fn()
  const item = { id: 'a', url: 'https://example.org/book', label: { en: '' } }
  const view = render(Links, {
    value: JSON.stringify({ version: 1, items: [item] }),
    onChange,
  })
  await fireEvent.blur(screen.getByLabelText('URL'))
  await view.rerender({
    value: JSON.stringify({
      version: 1,
      items: [{ ...item, label: { en: 'My title' } }],
    }),
    onChange,
  })
  finish({ title: 'Fetched title', locale: 'en' })
  await waitFor(() => expect(screen.queryByText('Looking up page title…')).toBeNull())
  expect(onChange).not.toHaveBeenCalled()
})

it('uses the shared locale translation action for link labels', async () => {
  const onChange = vi.fn()
  render(Links, {
    value: JSON.stringify({
      version: 1,
      items: [{ id: 'a', url: 'https://example.org', label: { en: 'A book' } }],
    }),
    onChange,
  })
  await fireEvent.focusIn(screen.getByLabelText('Link text — 繁體中文'))
  await fireEvent.click(
    screen.getByRole('button', { name: 'Translate from en to zh-hant' }),
  )
  await waitFor(() => expect(onChange).toHaveBeenCalled())
  expect(translateText).toHaveBeenCalledWith({
    source: 'en',
    target: 'zhHant',
    texts: ['A book'],
  })
  expect(JSON.parse(onChange.mock.lastCall![0]).items[0].label).toEqual({
    en: 'A book',
    zhHant: 'Translated',
  })
})

it('keeps collapsed links reorderable and restores their editable values', async () => {
  const onChange = vi.fn()
  const value = JSON.stringify({
    version: 1,
    items: [
      { id: 'first', url: 'https://example.org/one', label: { en: 'First title' } },
      { id: 'second', url: 'https://example.org/two', label: { en: 'Second title' } },
    ],
  })
  const view = render(Links, { value, cardinality: 'many', collapsed: true, onChange })
  expect(screen.getByText('First title')).toBeTruthy()
  expect(screen.queryByRole('textbox')).toBeNull()
  await fireEvent.keyDown(screen.getByRole('button', { name: 'Reorder link 2' }), {
    key: 'ArrowUp',
    altKey: true,
  })
  const reordered = onChange.mock.lastCall![0]
  expect(JSON.parse(reordered).items.map((item: { id: string }) => item.id)).toEqual([
    'second',
    'first',
  ])
  await view.rerender({
    value: reordered,
    cardinality: 'many',
    collapsed: false,
    onChange,
  })
  expect((screen.getAllByLabelText('URL')[0] as HTMLInputElement).value).toBe(
    'https://example.org/two',
  )
  expect(
    (screen.getAllByLabelText('Link text — English')[0] as HTMLInputElement).value,
  ).toBe('Second title')
})

it('uses a translated untitled label for a collapsed link without text', () => {
  render(Links, {
    value: JSON.stringify({
      version: 1,
      items: [{ id: 'empty', url: 'https://example.org', label: {} }],
    }),
    collapsed: true,
    onChange: vi.fn(),
  })
  expect(screen.getByText('Untitled')).toBeTruthy()
  expect(screen.queryByText('https://example.org')).toBeNull()
})

it('keeps visible link inputs unnamed because the form submits the structured hidden value', () => {
  render(Links, {
    value: JSON.stringify({
      version: 1,
      items: [{ id: 'one', url: 'https://example.org', label: { en: 'Title' } }],
    }),
    onChange: vi.fn(),
  })
  const inputs = screen.getAllByRole('textbox') as HTMLInputElement[]
  expect(inputs).toHaveLength(4)
  expect(inputs.every(input => input.name === '')).toBe(true)
})

it.each([
  ['title', 'unmount'],
  ['title', 'readonly'],
  ['translation', 'unmount'],
  ['translation', 'readonly'],
  ['title', 'reopened'],
  ['translation', 'reopened'],
] as const)('does not apply a delayed %s after %s', async (operation, transition) => {
  let finish!: (value: unknown) => void
  const pending = new Promise(resolve => {
    finish = resolve
  })
  if (operation === 'title')
    vi.mocked(getLinkTitle).mockReturnValueOnce(pending as never)
  else vi.mocked(translateText).mockReturnValueOnce(pending as never)
  const onChange = vi.fn()
  const value = JSON.stringify({
    version: 1,
    items: [
      {
        id: 'a',
        url: 'https://example.org',
        label: operation === 'title' ? {} : { en: 'A book' },
      },
    ],
  })
  const view = render(Links, { value, onChange })
  if (operation === 'title') await fireEvent.blur(screen.getByLabelText('URL'))
  else {
    await fireEvent.focusIn(screen.getByLabelText('Link text — 繁體中文'))
    await fireEvent.click(
      screen.getByRole('button', { name: 'Translate from en to zh-hant' }),
    )
  }
  if (transition === 'unmount') view.unmount()
  else {
    await view.rerender({ value, onChange, isEditing: false })
    if (transition === 'reopened')
      await view.rerender({ value, onChange, isEditing: true })
  }
  finish(
    operation === 'title' ? { title: 'Fetched title', locale: 'en' } : ['Translated'],
  )
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(onChange).not.toHaveBeenCalled()
})
