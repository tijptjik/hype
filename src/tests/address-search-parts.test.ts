import { expect, it } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { addressSearchParts } from '#lib/addresses/searchParts.js'

it('groups number and street, deduplicates building names and excludes administrative areas', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = {
    buildingName: 'Market',
    premisesName: 'Market',
    streetName: 'High Street',
    buildingNumberFrom: '1',
    buildingNumberTo: '3',
  }
  address.source.records = {
    data: {
      relationships: {
        divisions: {
          data: [
            { id: 'hood', meta: { role: 'locality' } },
            { id: 'district', meta: { role: 'district' } },
          ],
        },
      },
    },
    included: [
      {
        type: 'divisions',
        id: 'hood',
        attributes: { class: 'neighbourhood', i18n: { en: { name: 'Sai Ying Pun' } } },
      },
      {
        type: 'divisions',
        id: 'district',
        attributes: {
          class: 'district',
          i18n: { en: { name: 'Central and Western' } },
        },
      },
    ],
  }
  expect(addressSearchParts(address, 'en')).toEqual([
    { kind: 'building', text: 'Market' },
    { kind: 'street', text: '1-3 High Street' },
    { kind: 'locality', text: 'Sai Ying Pun' },
  ])
})
it('retains free-form evidence rather than guessing components', () => {
  expect(
    addressSearchParts(emptyFeatureAddress({ en: 'Shop 2, Example Mall' }), 'en'),
  ).toEqual([{ kind: 'address', text: 'Shop 2, Example Mall' }])
})
