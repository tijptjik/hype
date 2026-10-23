import { expect, it } from 'vitest'
import {
  locationDistance,
  placeTaxonomyLabel,
} from '#lib/locations/searchPresentation.js'
import { prepareLocalLocationAddress } from '#lib/addresses/locationDraft.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'

it('measures direct metres without swapping longitude and latitude', () => {
  expect(locationDistance([114, 22], [114, 22])).toBe(0)
  expect(locationDistance([114, 22], [114, 23])).toBeCloseTo(111195, -1)
})
it('copies structured geocoder content without canonical IDs and retains the original unit', () => {
  const original = emptyFeatureAddress({ en: 'Shop 18, G/F, Example Road' })
  const geocoded = emptyFeatureAddress({ en: '12 Example Road' })
  geocoded.source.authored = {
    granularity: 'building',
    i18n: {
      en: {
        formattedAddress: '12 Example Road',
        streetName: 'Example Road',
        buildingNumberFrom: '12',
      },
    },
    unit: null,
    unitI18n: {},
  }
  geocoded.source.address2dId = 'canonical-address'
  const result = prepareLocalLocationAddress(original, geocoded)
  expect(result.i18n.en.streetName).toBe('Example Road')
  expect(result.unit?.unitRef).toBe('18')
  expect(result.unit?.floorType).toBe('G')
  expect(result).not.toHaveProperty('address2dId')
})

it('shows source taxonomy in order and avoids duplicate categories', () => {
  expect(
    placeTaxonomyLabel({
      basicCategory: 'bakery',
      taxonomy: {
        primary: 'bakery',
        hierarchy: ['food_and_drink', 'bakery'],
        alternates: ['cafe', 'bakery', 'cafe'],
      },
    }),
  ).toBe('Food and drink › Bakery · Cafe')
  expect(placeTaxonomyLabel({ basicCategory: 'coffee_shop' })).toBe('Coffee shop')
  expect(placeTaxonomyLabel({ taxonomy: { primary: 'bakery' } })).toBe('Bakery')
  expect(placeTaxonomyLabel(undefined)).toBe('')
  expect(placeTaxonomyLabel({ basicCategory: null, taxonomy: null })).toBe('')
})
