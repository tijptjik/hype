// @vitest-environment jsdom
import { render, cleanup, fireEvent } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { setStructuredAddressExpression } from '#lib/addresses/addressExpressions.js'
import Fixture from './fixtures/components/FeatureAddress3dFixture.svelte'

beforeEach(() => vi.useRealTimers())
afterEach(cleanup)

it('edits existing floor and unit fields and retains values across flag changes', async () => {
  const initialAddress = setStructuredAddressExpression(
    setStructuredAddressExpression(
      emptyFeatureAddress({ en: 'Example Road' }),
      'en',
      'floorExpression',
      '2/F',
    ),
    'en',
    'unitExpression',
    'Flat A',
  )
  const view = render(Fixture, { initialAddress })
  const floor = view.container.querySelector<HTMLInputElement>(
    '#address-en-floorExpression',
  )
  const unit = view.container.querySelector<HTMLInputElement>(
    '#address-en-unitExpression',
  )
  expect(view.getByText('Floor type', { exact: true })).toBeTruthy()
  expect(view.getByText('Unit type', { exact: true })).toBeTruthy()
  expect(view.getByLabelText('Floor type')).toBeTruthy()
  expect(view.getByLabelText('Unit type')).toBeTruthy()
  if (!floor || !unit) throw new Error('Expected separate floor and unit inputs')
  await fireEvent.input(floor, { target: { value: '3/F' } })
  await fireEvent.input(unit, { target: { value: 'Flat B' } })
  await view.rerender({ show3dAddressOptions: false })
  expect(view.container.querySelector('#address-en-floorExpression')).toBeNull()
  expect(view.container.querySelector('#address-en-unitExpression')).toBeNull()
  await view.rerender({ show3dAddressOptions: true })
  expect(
    view.container.querySelector<HTMLInputElement>('#address-en-floorExpression')
      ?.value,
  ).toBe('3/F')
  expect(
    view.container.querySelector<HTMLInputElement>('#address-en-unitExpression')?.value,
  ).toBe('Flat B')
})
