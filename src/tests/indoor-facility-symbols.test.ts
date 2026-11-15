import { describe, expect, it } from 'vitest'
import {
  facilityCategory,
  facilitySymbol,
  facilitySymbols,
} from '../lib/indoor/facilities'

describe('map symbol aliases and pictograms', () => {
  it.each([
    ['Bank', 'atm', 'ATM'],
    ['Platform', 'platform', 'Platform'],
    ['restroom.unisex.wheelchair', 'restroom.accessible', 'Accessible toilet'],
    ['restroom.wheelchair', 'restroom.accessible', 'Accessible toilet'],
  ])('resolves %s without changing source data', (source, key, label) => {
    expect(facilityCategory(source)).toBe(key)
    expect(facilitySymbol(source)).toEqual(facilitySymbols[key])
    expect(facilitySymbol(source).label).toBe(label)
  })
  it('gives every audited category a specific pictogram', () => {
    for (const category of [
      'atm',
      'bank',
      'childplayarea',
      'drinkingfountain',
      'fieldofplay',
      'firstaid',
      'foodservice',
      'guestservices',
      'lobby',
      'mailbox',
      'parking.ev',
      'parking.motorcycle',
      'payphone',
      'photobooth',
      'police',
      'publiclibrary',
      'rail.muni',
      'room',
      'seating',
      'security',
      'shower',
      'swimmingpool',
      'taxi',
      'corridor',
      'walkway',
    ]) {
      expect(facilitySymbols[category]).toBeDefined()
      expect(facilitySymbol(category).path).not.toBe(facilitySymbol('unknown').path)
      expect(facilitySymbol(category).label).toMatch(/^[A-Z]/)
    }
  })
})
