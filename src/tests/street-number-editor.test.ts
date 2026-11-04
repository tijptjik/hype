// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { setAddressExpression } from '#lib/addresses/addressExpressions.js'
import Fixture from './fixtures/components/AddressDetailsFixture.svelte'
vi.mock('#lib/addresses/nameCatalogue.js', async original => ({
  ...(await original<object>()),
  loadAddressNames: async () => [],
}))
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
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('warns and blocks invalid ranges, clears stale validity, and canonicalizes a pair on blur', async () => {
  const initialAddress = setAddressExpression(
    emptyFeatureAddress(),
    'en',
    'buildingNumberExpression',
    '128',
  )
  const view = render(Fixture, { initialAddress })
  const input = view.getByRole('textbox', { name: 'Street number' }) as HTMLInputElement
  await fireEvent.input(input, { target: { value: '132-128' } })
  expect(view.getByRole('alert').textContent).toContain('must not be lower')
  expect(input.checkValidity()).toBe(false)
  expect(input.getAttribute('aria-invalid')).toBe('true')
  await fireEvent.input(input, { target: { value: '124B & 124C' } })
  expect(view.queryByRole('alert')).toBeNull()
  expect(input.checkValidity()).toBe(true)
  await fireEvent.blur(input)
  await waitFor(() => expect(input.value).toBe('124B/C'))
  await fireEvent.input(input, { target: { value: '124-' } })
  expect(input.checkValidity()).toBe(false)
  await fireEvent.input(input, { target: { value: '' } })
  expect(input.checkValidity()).toBe(true)
})
