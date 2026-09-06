// @vitest-environment node
// TESTING
import { describe, expect, it } from 'vitest'

// UTILS
import {
  getAddressForQuery,
  getNormalisedArea,
  getNormalisedCountry,
  getNormalisedDistrict,
  removeArea,
  removeCountry,
  removeDistrict,
} from '$lib/utils/geocoding'

describe('address component normalization', () => {
  it.each(['Hong Kong', 'H.K.', 'H.K.S.A.R.', '香港特區'])(
    'recognizes and removes country alias %s',
    country => {
      expect(getNormalisedCountry(country)).toBe('HKSAR')
      expect(removeCountry(`12 Test Road, ${country}`)).toBe('12 Test Road')
    },
  )

  it.each(['Hong Kong Island', '香港島', 'HK', 'Hong\tKong Island'])(
    'recognizes and removes area alias %s',
    area => {
      expect(getNormalisedArea(area)).toBe('HK')
      expect(removeArea(`12 Test Road, ${area}`)).toBe('12 Test Road')
    },
  )

  it.each([
    ['Central and Western District', 'CW'],
    ['Central & Western District', 'CW'],
    ['大埔区', 'TP'],
    ['Wong Tai Sin District', 'WTS'],
  ])('recognizes and removes district alias %s', (district, code) => {
    expect(getNormalisedDistrict(district)).toBe(code)
    expect(removeDistrict(`12 Test Road, ${district}`)).toBe('12 Test Road')
  })

  it('retains unrecognized components and localized output', () => {
    expect(getNormalisedCountry('unknown')).toBeNull()
    expect(getNormalisedArea('unknown')).toBeNull()
    expect(getNormalisedDistrict('unknown')).toBeNull()
    expect(removeCountry('12 Test Road, Hong Kong Building')).toBe(
      '12 Test Road, Hong Kong Building',
    )
    expect(removeArea('12 Test Road, unknown')).toBe('12 Test Road, unknown')
    expect(removeDistrict('12 Test Road, unknown')).toBe('12 Test Road, unknown')
    expect(getNormalisedDistrict('CW', 'zhHant')).toBe('中西區')
  })

  it.each([
    '12 Test Road, Central & Western District, Hong Kong Island, H.K.S.A.R.',
    'H.K.S.A.R., Hong Kong Island, Central & Western District, 12 Test Road',
  ])('extracts components and strips them from the street: %s', address => {
    const parsed = getAddressForQuery(address)
    expect(parsed.addressProperties.country).toBe('Hong Kong')
    expect(parsed.district).toBe('Central & Western')
    expect(parsed.area).toBe('Hong Kong Island')
    expect(parsed.streetAddress).toBe('12 Test Road')
  })

  it.each([
    '12 Test Road, Kowloon, Hong Kong',
    'Hong Kong, Kowloon, 12 Test Road',
    '12 Test Road, New Territories, Hong Kong',
    'Hong Kong, New Territories, 12 Test Road',
  ])('does not mistake the country for Hong Kong Island: %s', address => {
    const parsed = getAddressForQuery(address)
    expect(parsed.area).toBe(
      address.includes('Kowloon') ? 'Kowloon' : 'New Territories',
    )
    expect(parsed.addressProperties.country).toBe('Hong Kong')
    expect(parsed.streetAddress).toBe('12 Test Road')
  })
})
