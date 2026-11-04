// @vitest-environment jsdom
import { render, cleanup, fireEvent } from '@testing-library/svelte/pure'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { setStructuredAddressExpression } from '#lib/addresses/addressExpressions.js'
import Fixture from './fixtures/components/FeatureAddress3dFixture.svelte'

vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionContext: () =>
    Promise.resolve({ memberships: [], options: [], available: false }),
}))

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
  expect(view.queryByText('Floor type', { exact: true })).toBeNull()
  expect(view.queryByText('Unit type', { exact: true })).toBeNull()
  expect(view.getByLabelText('Floor type')).toBeTruthy()
  expect(view.getByLabelText('Unit type')).toBeTruthy()
  if (!floor || !unit) throw new Error('Expected separate floor and unit inputs')
  await fireEvent.input(floor, { target: { value: '3/F' } })
  await fireEvent.input(unit, { target: { value: 'Flat B' } })
  await fireEvent.blur(floor)
  await fireEvent.blur(unit)
  await view.rerender({ show3dAddressOptions: false })
  expect(view.container.querySelector('#address-en-floorExpression')).toBeNull()
  expect(view.container.querySelector('#address-en-unitExpression')).toBeNull()
  await view.rerender({ show3dAddressOptions: true })
  expect(
    view.container.querySelector<HTMLInputElement>('#address-en-floorExpression')
      ?.value,
  ).toBe('3')
  expect(
    view.container.querySelector<HTMLInputElement>('#address-en-unitExpression')?.value,
  ).toBe('B')
})

it('normalizes pasted unit labels on blur and infers the named type', async () => {
  const initialAddress = setStructuredAddressExpression(
    emptyFeatureAddress({ en: 'Building' }),
    'en',
    'unitExpression',
    'Room 3308',
    'R',
  )
  const view = render(Fixture, { initialAddress })
  const unit = view.container.querySelector<HTMLInputElement>(
    '#address-en-unitExpression',
  )!
  const display = view.getByRole('textbox', {
    name: 'Display address',
  }) as HTMLTextAreaElement
  expect(unit.value).toBe('3308')
  expect(view.getByLabelText('Unit type').textContent).toContain('Room')
  await fireEvent.input(unit, { target: { value: 'Room Rm 3308' } })
  expect(unit.value).toBe('Room Rm 3308')
  await fireEvent.blur(unit)
  expect(unit.value).toBe('3308')
  expect(display.value).toBe('Rm 3308, Building')
  expect(view.getByText('Selected Room and kept only the reference here.')).toBeTruthy()
  await fireEvent.input(unit, { target: { value: 'Shop 3309' } })
  await fireEvent.blur(unit)
  expect(unit.value).toBe('3309')
  expect(display.value).toBe('Shop 3309, Building')
  await fireEvent.input(unit, { target: { value: '3310' } })
  await fireEvent.blur(unit)
  expect(view.getByLabelText('Unit type').textContent).toContain('Shop')
  expect(display.value).toBe('Shop 3310, Building')
})

it.each(['Longitude', 'Latitude'])(
  'pastes a coordinate pair atomically into %s',
  async label => {
    const onCoordinateChange = vi.fn()
    const view = render(Fixture, { onCoordinateChange })
    const field = view.container.querySelector<HTMLInputElement>(
      `input[aria-label="${label}"]`,
    )!
    await fireEvent.paste(field, {
      clipboardData: { getData: () => '[22.28334,114.15221]' },
    })
    expect(onCoordinateChange).toHaveBeenCalledExactlyOnceWith([114.15221, 22.28334])
    await view.rerender({ coordinates: [114.15221, 22.28334], onCoordinateChange })
    await fireEvent.blur(field)
    expect(onCoordinateChange).toHaveBeenCalledTimes(1)
  },
)

it('commits typed coordinates on blur and rejects invalid pairs', async () => {
  const onCoordinateChange = vi.fn()
  const view = render(Fixture, { onCoordinateChange })
  const lng = view.container.querySelector<HTMLInputElement>(
    'input[aria-label="Longitude"]',
  )!
  const lat = view.container.querySelector<HTMLInputElement>(
    'input[aria-label="Latitude"]',
  )!
  await fireEvent.input(lng, { target: { value: '114.155' } })
  await fireEvent.blur(lng)
  expect(onCoordinateChange).toHaveBeenLastCalledWith([114.155, 22.31872])
  await view.rerender({ coordinates: [114.155, 22.31872], onCoordinateChange })
  onCoordinateChange.mockClear()
  await fireEvent.input(lat, { target: { value: '999' } })
  await fireEvent.blur(lat)
  expect(onCoordinateChange).not.toHaveBeenCalled()
  expect(lat.getAttribute('aria-invalid')).toBe('true')
  await fireEvent.paste(lat, {
    clipboardData: { getData: () => '{"lat":22.28,"lng":114.16}' },
  })
  expect(onCoordinateChange).toHaveBeenCalledExactlyOnceWith([114.16, 22.28])
})
