import { expect, it } from 'vitest'
import { buildingPartAddress } from '#lib/locations/buildingPartAddress.js'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { localAddressContent } from '#lib/addresses/locationDraft.js'

it('parses the part floor and removes inherited unit corrections', () => {
  const address = {
    ...emptyFeatureAddress(),
    unitDetails: {
      floorRef: '12',
      floorType: 'F' as const,
      unitRef: '99',
      unitType: 'U' as const,
    },
    overrides: { en: { floorExpression: '12/F', unitExpression: 'Unit 99' } },
  }
  const result = buildingPartAddress(address, { en: '1/F' })
  expect(localAddressContent(result).unit?.floorRef).toBe('1')
  expect(localAddressContent(result).unit?.unitRef).not.toBe('99')
  expect(address.unitDetails.unitRef).toBe('99')
})
