// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/svelte/pure'
import { afterEach, expect, it, vi } from 'vitest'
import AddressSearchParts from '#lib/bits/patterns/forms/featureLocation/AddressSearchParts.svelte'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

vi.mock('#lib/api/division.remote.js', () => ({
  getAddressDivisionLabel: () => ({
    current: {
      id: 'hood',
      class: 'neighbourhood',
      names: { en: { name: 'Sai Ying Pun' } },
    },
  }),
}))
afterEach(cleanup)
it('adds resolved localities but omits administrative memberships', () => {
  const address = emptyFeatureAddress()
  address.coordinates = [114.142, 22.285]
  address.source.records = {
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
  expect(view.getByText('9 Hospital Road')).toBeTruthy()
  expect(view.getByText('Sai Ying Pun')).toBeTruthy()
  expect(view.queryByText('Central and Western')).toBeNull()
})
