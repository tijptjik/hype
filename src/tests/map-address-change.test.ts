// TESTS
import { expect, it } from 'vitest'
// ADDRESS
import {
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
import {
  applyMapAddressChange,
  customMapAddressChange,
  exactAddressChangeMatch,
} from '#lib/addresses/mapAddressChange.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'

function address(number = '238', street = 'Hollywood Road'): FeatureAddress {
  return {
    ...emptyFeatureAddress(),
    coordinates: [114.15, 22.3],
    overrides: { en: { buildingNumberExpression: number, streetName: street } },
  }
}

it('applies the accepted number across languages without mutating retained source evidence', () => {
  const original = address()
  const updated = applyMapAddressChange(original, [
    { field: 'number', selected: '238', mapped: '242-244' },
  ])
  expect(getAddressLocale(original, 'en').buildingNumberExpression).toBe('238')
  for (const locale of ['en', 'zhHant', 'zhHans'] as const)
    expect(getAddressLocale(updated, locale)).toMatchObject({
      buildingNumberExpression: '242-244',
      buildingNumberFrom: '242',
      buildingNumberTo: '244',
    })
  expect(updated.source).toBe(original.source)
  expect(updated.coordinates).toEqual(original.coordinates)
})

it('rebuilds an obsolete display correction when accepting structured changes', () => {
  const original = address()
  original.overrides.en.formattedAddress = '238 Hollywood Road'
  const updated = applyMapAddressChange(original, [
    { field: 'number', selected: '238', mapped: '242-244' },
  ])
  expect(getAddressDisplay(updated, 'en')).toContain('242-244')
  expect(getAddressDisplay(updated, 'en')).not.toContain('238')
})

it('requires the full address, including ranges, blocks and units, rather than a nearby number', () => {
  const expected = address('242-244')
  expect(exactAddressChangeMatch(expected, address('242–244', 'Hollywood Rd'))).toBe(
    true,
  )
  expect(exactAddressChangeMatch(expected, address('242/244'))).toBe(false)
  expect(exactAddressChangeMatch(expected, address('242'))).toBe(false)
  expect(exactAddressChangeMatch(expected, address('242-244', 'Ladder Street'))).toBe(
    false,
  )
  const unit = address('242-244')
  unit.overrides.en.unitExpression = 'Flat A'
  expect(exactAddressChangeMatch(expected, unit)).toBe(false)
  const block = address('242-244')
  block.overrides.en.blockExpression = 'Tower B'
  expect(exactAddressChangeMatch(expected, block)).toBe(false)
  expect(
    exactAddressChangeMatch(
      emptyFeatureAddress({ en: '242-244 Hollywood Road' }),
      expected,
    ),
  ).toBe(false)
})

it('creates a custom authored address without claiming the old canonical record', () => {
  const original = address('242-244')
  original.source.address2dId = 'old-address'
  original.source.snapshotId = 'old-snapshot'
  original.accessHints = { en: 'Side entrance' }
  const custom = customMapAddressChange(original)
  expect(custom.source.address2dId).toBeNull()
  expect(custom.canonical).toBeUndefined()
  expect(custom.source.authored?.i18n.en.buildingNumberExpression).toBe('242-244')
  expect(custom.legacy?.previousAddressSource).toBe(original.source)
  expect(custom.accessHints).toEqual({ en: 'Side entrance' })
  expect(custom.coordinates).toEqual(original.coordinates)
})

it('matches canonical suffix-pair spellings without conflating them with ranges', () => {
  expect(exactAddressChangeMatch(address('124B/C'), address('124B & 124C'))).toBe(true)
  expect(exactAddressChangeMatch(address('124B/C'), address('124B,124C'))).toBe(true)
  expect(exactAddressChangeMatch(address('124B/C'), address('124B/124C'))).toBe(true)
  expect(exactAddressChangeMatch(address('124B/C'), address('124B-124C'))).toBe(false)
})
