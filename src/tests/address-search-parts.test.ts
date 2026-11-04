import { expect, it } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { addressSearchParts } from '#lib/addresses/searchParts.js'

it('groups number and street, deduplicates building names and excludes administrative areas', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = {
    buildingName: 'Market',
    premisesName: 'Market',
    streetName: 'HIGH STREET',
    buildingNumberFrom: '1',
    buildingNumberTo: '3',
  }
  address.source.rawSource = {
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
    { kind: 'locality', text: 'Sai Ying Pun', localityClass: 'neighbourhood' },
  ])
})
it('retains free-form evidence rather than guessing components', () => {
  expect(
    addressSearchParts(emptyFeatureAddress({ en: 'Shop 2, Example Mall' }), 'en'),
  ).toEqual([{ kind: 'address', text: 'Shop 2, Example Mall' }])
})

it('keeps the selected canonical unit type in display blocks when the input stores only its reference', async () => {
  const { setStructuredAddressExpression } = await import(
    '#lib/addresses/addressExpressions.js'
  )
  const address = setStructuredAddressExpression(
    emptyFeatureAddress(),
    'en',
    'unitExpression',
    'Room 3308',
    'R',
  )
  expect(addressSearchParts(address, 'en')).toEqual([{ kind: 'unit', text: 'Rm 3308' }])
})
