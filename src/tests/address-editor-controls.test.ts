// @vitest-environment jsdom
import { render, cleanup, fireEvent } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Fixture from './fixtures/components/AddressDetailsFixture.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { structurePlaceAddress } from '#lib/addresses/nameCatalogue.js'
vi.mock('#lib/addresses/nameCatalogue.js', async original => ({
  ...(await original<object>()),
  loadAddressNames: async () => [
    {
      id: 'street',
      names: { en: 'LYNDHURST TERRACE', 'zh-Hant': '擺花街' },
      divisionCodes: ['CW'],
    },
  ],
}))
beforeEach(() => vi.useRealTimers())
afterEach(cleanup)
it('always exposes the display address, unlocks custom text and regenerates on relock', async () => {
  const view = render(Fixture, {
    initialAddress: structurePlaceAddress(
      emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
      [{ id: 'street', names: { en: 'LYNDHURST TERRACE' }, divisionCodes: ['CW'] }],
    ),
  })
  const display = view.getByRole('textbox', {
    name: 'Display address',
  }) as HTMLInputElement
  expect(display.readOnly).toBe(true)
  expect(display.value).toBe('25 LYNDHURST TERRACE')
  await fireEvent.click(
    view.getByRole('button', { name: 'Write a custom display address' }),
  )
  expect(display.readOnly).toBe(false)
  await fireEvent.input(display, { target: { value: 'Custom entrance' } })
  expect(display.value).toBe('Custom entrance')
  await fireEvent.click(view.getByRole('button', { name: 'Generate from components' }))
  expect(display.value).toBe('25 LYNDHURST TERRACE')
  expect(display.readOnly).toBe(true)
})
it('selects a controlled street rather than accepting the search text as an address', async () => {
  const view = render(Fixture, { initialAddress: emptyFeatureAddress() })
  await fireEvent.click(view.getByRole('button', { name: 'Street name' }))
  await fireEvent.click(view.getByRole('button', { name: 'Street name' }))
  const search = view.getByRole('textbox', { name: 'Street name: Search names' })
  await fireEvent.input(search, { target: { value: 'Invented street' } })
  expect(
    (view.getByRole('textbox', { name: 'Display address' }) as HTMLInputElement).value,
  ).toBe('')
  await fireEvent.input(search, { target: { value: 'Lyndhurst' } })
  await fireEvent.click(await view.findByRole('button', { name: /LYNDHURST TERRACE/ }))
  expect(
    (view.getByRole('textbox', { name: 'Display address' }) as HTMLInputElement).value,
  ).toBe('LYNDHURST TERRACE')
})
