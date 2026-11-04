// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import AddressSearchParts from '#lib/bits/patterns/forms/featureLocation/AddressSearchParts.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionLabel: ({ id }: { id: string }) => ({
    current: {
      id,
      class: id === 'broad' ? 'macrohood' : 'neighbourhood',
      names: { en: { name: id === 'broad' ? 'Sheung Wan' : 'Tai Ping Shan' } },
    },
  }),
}))
afterEach(cleanup)
it('adds resolved localities but omits administrative memberships', () => {
  const address = emptyFeatureAddress()
  address.coordinates = [114.142, 22.285]
  address.source.rawSource = {
    data: {
      attributes: {
        divisionRelationships: [
          { role: 'neighbourhood', divisionId: 'hood' },
          { role: 'district', divisionId: 'district' },
        ],
      },
    },
  }
  address.overrides.en = { buildingNumberExpression: '9', streetName: 'Hospital Road' }
  const view = render(AddressSearchParts, { address })
  expect(
    view.getByText('9 Hospital Road', { selector: ':not([aria-hidden="true"])' }),
  ).toBeTruthy()
  expect(view.getByText('Tai Ping Shan')).toBeTruthy()
  expect(view.queryByText('Central and Western')).toBeNull()
})

it('orders resolved divisions from smallest to largest and omits missing street cells', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = { buildingName: 'TAI HING HSE' }
  address.source.rawSource = {
    data: {
      attributes: {
        divisionRelationships: [
          { role: 'macrohood', divisionId: 'broad' },
          { role: 'neighbourhood', divisionId: 'small' },
        ],
      },
    },
  }
  const view = render(AddressSearchParts, { address })
  expect(
    [...view.container.querySelectorAll('[data-address-part="locality"]')].map(node =>
      node.textContent?.trim(),
    ),
  ).toEqual(['Tai Ping Shan', 'Sheung Wan'])
  expect(view.container.querySelector('[data-address-part="street"]')).toBeNull()
})

it('shows establishment taxonomy and separates unit details from the street', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = {
    unitExpression: 'Shop 26',
    floorExpression: 'G/F',
    buildingName: 'Charming Garden',
    streetName: 'Hoi Ting Road',
    buildingNumberExpression: '8',
  }
  const view = render(AddressSearchParts, {
    address,
    establishmentTitle: 'Tai Hing',
    taxonomyLabel: 'Food and drink › Restaurant',
  })
  expect(
    view.getAllByText('Tai Hing', { selector: ':not([aria-hidden="true"])' }),
  ).toHaveLength(1)
  expect(view.getByText('Food and drink › Restaurant')).toBeTruthy()
  expect(
    view.container.querySelector('[data-address-part="unit"]')?.textContent,
  ).toContain('Shop 26')
  expect(
    view.container.querySelector('[data-address-part="street"]')?.textContent,
  ).toContain('8 Hoi Ting Road')
})

// JSDOM lacks the observer used by the shared Firefox-safe text viewport.
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
      unobserve(): void {}
    },
  )
})
afterEach(() => vi.unstubAllGlobals())
