// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/AddressNameFocusFixture.svelte'
vi.mock('#lib/addresses/nameCatalogue.js', () => ({
  loadAddressNames: async () => [
    { id: 'other', names: { en: 'Other Building' }, divisionCodes: [] },
  ],
}))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
it('resolves only a committed building selection, not plain blur or cancelled search', async () => {
  const view = render(Fixture)
  const next = view.getByRole('button', { name: 'Next field' })
  const tile = view.getByRole('button', { name: 'Replace: Wah Koon Building' })
  tile.focus()
  next.focus()
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(view.container.querySelector('output')?.textContent).toBe('0')
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Wah Koon Building' }),
  )
  const search = view.getByRole('combobox', { name: 'Building name' })
  await fireEvent.input(view.getByRole('combobox', { name: 'Building name' }), {
    target: { value: 'Other' },
  })
  await fireEvent.keyDown(search, { key: 'Escape' })
  next.focus()
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(view.container.querySelector('output')?.textContent).toBe('0')
  await fireEvent.click(
    view.getByRole('button', { name: 'Replace: Wah Koon Building' }),
  )
  await fireEvent.input(view.getByRole('combobox', { name: 'Building name' }), {
    target: { value: 'Other' },
  })
  await fireEvent.click(await view.findByRole('option', { name: 'Other Building' }))
  await waitFor(() =>
    expect(view.getByRole('button', { name: 'Replace: Other Building' })).toBeTruthy(),
  )
  await new Promise(resolve => setTimeout(resolve, 10))
  view.getByRole('button', { name: 'Replace: Other Building' }).focus()
  next.focus()
  await waitFor(() =>
    expect(view.container.querySelector('output')?.textContent).toBe('1'),
  )
})
