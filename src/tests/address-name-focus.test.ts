// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/AddressNameFocusFixture.svelte'
import { fetchNameSuggestions } from '#lib/addresses/nameSuggestions.js'
vi.mock('#lib/addresses/nameSuggestions.js', () => ({ fetchNameSuggestions: vi.fn() }))
beforeEach(() => {
  vi.useRealTimers()
  vi.mocked(fetchNameSuggestions)
    .mockReset()
    .mockResolvedValue([
      { id: 'other', names: { en: 'Other Building' }, divisionCodes: [] },
    ])
})
afterEach(cleanup)

it('does not search on mount or empty focus, and searches bounded suggestions after typing', async () => {
  const view = render(Fixture)
  expect(fetchNameSuggestions).not.toHaveBeenCalled()
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Wah Koon Building' }),
  )
  const input = view.getByRole('combobox', { name: 'Building name' })
  expect(fetchNameSuggestions).not.toHaveBeenCalled()
  await fireEvent.input(input, { target: { value: 'Other' } })
  await fireEvent.click(await view.findByRole('option', { name: 'Other Building' }))
  expect(view.getByRole('button', { name: 'Replace: Other Building' })).toBeTruthy()
  expect(fetchNameSuggestions).toHaveBeenCalledWith(
    'buildings',
    'Other',
    'en',
    expect.any(AbortSignal),
  )
})

it('allows custom text and cancellation before the API returns', async () => {
  vi.mocked(fetchNameSuggestions).mockImplementation(
    (_family, _query, _locale, signal) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () =>
          reject(new DOMException('Aborted', 'AbortError')),
        ),
      ),
  )
  const view = render(Fixture)
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Wah Koon Building' }),
  )
  const input = view.getByRole('combobox', {
    name: 'Building name',
  }) as HTMLInputElement
  await fireEvent.input(input, { target: { value: 'My building' } })
  expect(view.getByText('Searching building names…').getAttribute('role')).toBe(
    'status',
  )
  await waitFor(() => expect(fetchNameSuggestions).toHaveBeenCalledTimes(1))
  await fireEvent.click(
    view.getByRole('button', { name: 'Use “My building” as a custom name' }),
  )
  expect(view.getByRole('button', { name: 'Replace: My building' })).toBeTruthy()
  expect(vi.mocked(fetchNameSuggestions).mock.calls[0][3].aborted).toBe(true)
  await fireEvent.click(view.getByRole('button', { name: 'Replace: My building' }))
  await fireEvent.input(view.getByRole('combobox'), { target: { value: 'Discard' } })
  await fireEvent.click(view.getByRole('button', { name: 'Cancel' }))
  expect(view.getByRole('button', { name: 'Replace: My building' })).toBeTruthy()
})

it('ignores a late response from an obsolete query', async () => {
  let first!: (rows: Awaited<ReturnType<typeof fetchNameSuggestions>>) => void
  vi.mocked(fetchNameSuggestions).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        first = resolve
      }),
  )
  const view = render(Fixture)
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Wah Koon Building' }),
  )
  const input = view.getByRole('combobox')
  await fireEvent.input(input, { target: { value: 'Old' } })
  await waitFor(() => expect(first).toBeTypeOf('function'))
  await fireEvent.input(input, { target: { value: 'Other' } })
  await view.findByRole('option', { name: 'Other Building' })
  first([{ id: 'old', names: { en: 'Old Building' }, divisionCodes: [] }])
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(view.queryByRole('option', { name: 'Old Building' })).toBeNull()
  expect(view.getByRole('option', { name: 'Other Building' })).toBeTruthy()
})

it('keeps custom entry available when suggestions fail', async () => {
  vi.mocked(fetchNameSuggestions).mockRejectedValue(new Error('offline'))
  const view = render(Fixture)
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Wah Koon Building' }),
  )
  await fireEvent.input(view.getByRole('combobox'), {
    target: { value: 'Unknown building' },
  })
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Retry search' })).toBeTruthy(),
  )
  await fireEvent.click(
    view.getByRole('button', { name: 'Use “Unknown building” as a custom name' }),
  )
  expect(view.getByRole('button', { name: 'Replace: Unknown building' })).toBeTruthy()
})
