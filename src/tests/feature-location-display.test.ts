import { describe, expect, it } from 'vitest'
import { featurePlusCode } from '#lib/addresses/plusCode.js'
import {
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressDisplay,
  projectFeatureAddress,
} from '#lib/addresses/featureAddress.js'

describe('Feature location display', () => {
  it('encodes full Open Location Codes with longitude/latitude ordering', () => {
    expect(featurePlusCode([8.524997, 47.36559])).toBe('8FVC9G8F+6X')
    expect(featurePlusCode([0, 0])).toBe('6FG22222+22')
    expect(featurePlusCode([180, 0])).toBe(featurePlusCode([-180, 0]))
    expect(featurePlusCode([0, 91])).toBe('')
    expect(featurePlusCode(null)).toBe('')
  })
  it('uses the Feature marker rather than the associated address position', () => {
    const address = emptyFeatureAddress({ en: '123 Example Road' })
    address.coordinates = [114, 22]
    address.markerCoordinates = [8.524997, 47.36559]
    address.locationDisplayMode = 'plus_code'
    expect(getAddressDisplay(address, 'en')).toBe('8FVC9G8F+6X')
    expect(FeatureAddressSchema.parse(address).locationDisplayMode).toBe('plus_code')
    address.locationDisplayMode = 'automatic'
    expect(getAddressDisplay(address, 'en')).toBe('123 Example Road')
    address.locationDisplayMode = 'address'
    expect(getAddressDisplay(address, 'en')).toBe('123 Example Road')
  })
  it('automatically falls back to the marker and preserves explicit address mode', () => {
    const address = emptyFeatureAddress()
    address.markerCoordinates = [0, 0]
    expect(getAddressDisplay(address, 'en')).toBe('6FG22222+22')
    address.locationDisplayMode = 'address'
    expect(getAddressDisplay(address, 'en')).toBe('')
  })
  it('adds available marker geography without treating it as a precise address', () => {
    const address = emptyFeatureAddress()
    address.markerCoordinates = [0, 0]
    expect(
      getAddressDisplay(address, 'en', [
        {
          id: 'district',
          class: 'district',
          category: 'administrative',
          level: 2,
          names: { en: { name: 'Example District' } },
        },
      ]),
    ).toBe('6FG22222+22 · Example District')
  })
  it('projects marker changes at the write boundary without changing source coordinates', () => {
    const address = emptyFeatureAddress({ en: '123 Example Road' })
    address.coordinates = [114, 22]
    address.locationDisplayMode = 'plus_code'
    const result = projectFeatureAddress({
      addressMeta: { address },
      geometry: { type: 'Point', coordinates: [0, 0] },
      i18n: { en: { displayAddress: 'old label', displayAddressGen: false } },
    })
    expect(result.i18n.en.displayAddress).toBe('6FG22222+22')
    expect(result.addressMeta.address.coordinates).toEqual([114, 22])
    expect(result.addressMeta.address.markerCoordinates).toEqual([0, 0])
    expect(result.addressMeta.address.locationDisplayMode).toBe('plus_code')
  })
})
