// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/LocationNameFieldsFixture.svelte'
afterEach(cleanup)
beforeEach(() => vi.useRealTimers())

it('edits a name while preserving an existing language outside the app locales', async () => {
  const view = render(Fixture)
  expect(view.getAllByRole('textbox')).toHaveLength(2)
  await fireEvent.input(view.getByRole('textbox', { name: /Name.*English/ }), {
    target: { value: 'New bakery' },
  })
  expect(JSON.parse(view.getByTestId('names').textContent!)).toEqual({
    en: 'New bakery',
    ja: 'パン屋',
  })
  await fireEvent.input(view.getByRole('textbox', { name: /Name.*English/ }), {
    target: { value: '  ' },
  })
  expect(view.getByRole('alert').textContent).toBe('Name is required')
})

it('removes an explicit translation and keeps the final name field', async () => {
  const view = render(Fixture)
  await fireEvent.click(view.getByRole('button', { name: 'Remove · ja' }))
  expect(JSON.parse(view.getByTestId('names').textContent!)).toEqual({ en: 'Bakery' })
  expect(view.queryByRole('button', { name: /Remove/ })).toBeNull()
})
