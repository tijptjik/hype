import { describe, expect, it } from 'vitest'
import { featurePlusCode } from '#lib/addresses/plusCode.js'
import { featureHkgcode } from '#lib/addresses/hkgcode.js'
import {
  emptyFeatureAddress,
  FeatureAddressSchema,
  getAddressDisplay,
  projectFeatureAddress,
} from '#lib/addresses/featureAddress.js'

describe('Feature location display', () => {
  it('uses the actual Feature marker for offline HKGeocode display in every locale', () => {
    const address = emptyFeatureAddress({ en: '123 Example Road' })
    address.coordinates = [114, 22]
    address.locationDisplayMode = 'hkgcode'
    const source = structuredClone(address.source)
    for (const locale of ['en', 'zhHant', 'zhHans'] as const)
      expect(
        getAddressDisplay(address, locale, [], undefined, [114.20839, 22.29241]),
      ).toBe('K8FA3B')
    expect(FeatureAddressSchema.parse(address).locationDisplayMode).toBe('hkgcode')
    expect(address.source).toEqual(source)
    expect(address.coordinates).toEqual([114, 22])
  })
  it('does not mislabel an unavailable HKGeocode as a Plus Code or source address', () => {
    const address = emptyFeatureAddress({ en: '123 Example Road' })
    address.locationDisplayMode = 'hkgcode'
    for (const coordinates of [
      null,
      [],
      [0, 0],
      [NaN, 22],
      [114, Infinity],
      [181, 22],
    ]) {
      expect(featureHkgcode(coordinates)).toBe('')
      expect(getAddressDisplay(address, 'en', [], undefined, coordinates)).toBe('')
    }
  })
  it('reprojects HKGeocode when the marker moves and retains locality context', () => {
    const address = emptyFeatureAddress({ en: '123 Example Road' })
    address.locationDisplayMode = 'hkgcode'
    address.coordinates = [114.20839, 22.29241]
    const result = projectFeatureAddress({
      addressMeta: { address },
      geometry: { type: 'Point', coordinates: [114.1589, 22.2819] },
      i18n: { en: { displayAddress: 'K8FA3B', displayAddressGen: false } },
    })
    expect(result.i18n.en.displayAddress).toBe('H74J3J')
    expect(result.addressMeta.address.coordinates).toEqual([114.20839, 22.29241])
    expect(result.addressMeta.address.locationDisplayMode).toBe('hkgcode')
    expect(
      getAddressDisplay(
        address,
        'en',
        [
          {
            id: 'north-point',
            class: 'neighbourhood',
            category: 'hood',
            level: 5,
            names: { en: { name: 'North Point' } },
          },
        ],
        undefined,
        [114.20839, 22.29241],
      ),
    ).toBe('K8FA3B · North Point')
  })
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
    const coordinates = [8.524997, 47.36559]
    address.locationDisplayMode = 'plus_code'
    expect(getAddressDisplay(address, 'en', [], undefined, coordinates)).toBe(
      '8FVC9G8F+6X',
    )
    expect(FeatureAddressSchema.parse(address).locationDisplayMode).toBe('plus_code')
    address.locationDisplayMode = 'automatic'
    expect(getAddressDisplay(address, 'en', [], undefined, coordinates)).toBe(
      '123 Example Road',
    )
    address.locationDisplayMode = 'address'
    expect(getAddressDisplay(address, 'en', [], undefined, coordinates)).toBe(
      '123 Example Road',
    )
  })
  it('automatically falls back to the marker and preserves explicit address mode', () => {
    const address = emptyFeatureAddress()
    const coordinates = [0, 0]
    expect(getAddressDisplay(address, 'en', [], undefined, coordinates)).toBe(
      '6FG22222+22',
    )
    address.locationDisplayMode = 'address'
    expect(getAddressDisplay(address, 'en', [], undefined, coordinates)).toBe('')
  })
  it('adds available marker geography without treating it as a precise address', () => {
    const address = emptyFeatureAddress()
    const coordinates = [0, 0]
    expect(
      getAddressDisplay(
        address,
        'en',
        [
          {
            id: 'district',
            class: 'district',
            category: 'administrative',
            level: 2,
            names: { en: { name: 'Example District' } },
          },
        ],
        undefined,
        coordinates,
      ),
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
    expect(result.addressMeta.address).not.toHaveProperty('markerCoordinates')
    expect(result.addressMeta.address.locationDisplayMode).toBe('plus_code')
  })
})
