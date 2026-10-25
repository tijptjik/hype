// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  parseFloor,
  parseUnit,
  formatFloor,
  formatUnit,
} from '#lib/addresses/address3d.js'
import {
  emptyFeatureAddress,
  getAddressDisplay,
  getAddressLocale,
  AddressMetaSchema,
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
import {
  EDITABLE_ADDRESS_FIELDS,
  setStructuredAddressExpression,
  setAddressExpression,
} from '#lib/addresses/addressExpressions.js'

describe('structured SaanSeoi address entry', () => {
  it.each([
    ['12', 'F', '12', '12/F', '12樓'],
    ['B', 'F', 'B', 'B', 'B樓'],
    ['ground floor', 'G', '', 'G/F', '地下'],
    ['地下', 'G', '', 'G/F', '地下'],
    ['mezzanine', 'M', '', 'M', '閣樓'],
    ['lower ground', 'LG', '', 'LG', '下層地下'],
    ['B2', 'B', '2', 'B2', '地庫2樓'],
    ['12樓', 'F', '12', '12/F', '12樓'],
    ['Lift 17/18', 'X', 'Lift 17/18', 'Lift 17/18', 'Lift 17/18'],
  ])('parses %s without losing its meaning', (input, type, ref, en, zh) => {
    const parsed = parseFloor(input)
    expect(parsed).toEqual({ floorType: type, floorRef: ref })
    expect(formatFloor(parsed, 'en')).toBe(en)
    expect(formatFloor(parsed, 'zhHant')).toBe(zh)
  })
  it('formats each selected unit type and supports Chinese entry', () => {
    expect(parseUnit('12', 'S')).toEqual({ unitRef: '12', unitType: 'S' })
    expect(formatUnit(parseUnit('12', 'S'), 'zhHans')).toBe('12铺')
    expect(parseUnit('A室')).toEqual({ unitRef: 'A', unitType: 'F' })
    expect(formatUnit(parseUnit('A室'), 'en')).toBe('Flat A')
    expect(parseFloor('', 'G')).toEqual({ floorRef: '', floorType: 'G' })
  })
  it('retains entered expressions and saves shared parsed parts with translated display', () => {
    let address = emptyFeatureAddress({
      en: '70 Example St',
      'zh-hant': '例街70號',
      'zh-hans': '例街70号',
    })
    address = setStructuredAddressExpression(address, 'en', 'floorExpression', '12')
    address = setStructuredAddressExpression(address, 'en', 'unitExpression', 'A', 'F')
    expect(address.unitDetails).toEqual({
      floorRef: '12',
      floorType: 'F',
      unitRef: 'A',
      unitType: 'F',
    })
    expect(address.overrides.en.floorExpression).toBe('12')
    expect(getAddressLocale(address, 'zhHant').floorExpression).toBe('12樓')
    expect(getAddressDisplay(address, 'en')).toBe('Flat A, 12/F, 70 Example St')
    expect(getAddressDisplay(address, 'zhHant')).toBe('例街70號12樓A室')
    expect(getAddressDisplay(address, 'zhHans')).toBe('例街70号12楼A室')
    expect(
      AddressMetaSchema.parse({ address: JSON.stringify(address) }).address,
    ).toEqual(address)
    expect(address.source.address3dUnitId).toBeNull()
    const reset = setStructuredAddressExpression(
      address,
      'zhHans',
      'floorExpression',
      undefined,
    )
    expect(reset.unitDetails).toEqual({ unitRef: 'A', unitType: 'F' })
    expect(getAddressDisplay(reset, 'en')).toBe('Flat A, 70 Example St')
  })
  it('preserves a complete custom display address and keeps access hints separate', () => {
    let address = setAddressOverride(
      emptyFeatureAddress(),
      'en',
      'formattedAddress',
      'Custom building',
    )
    address = setStructuredAddressExpression(address, 'en', 'floorExpression', '12')
    address = setAddressExpression(address, 'en', 'accessHint', 'Use the rear entrance')
    expect(getAddressDisplay(address, 'en')).toBe('Custom building')
    expect(address.accessHints).toEqual({ en: 'Use the rear entrance' })
    expect(address.overrides.en).not.toHaveProperty('accessHint')
    expect(
      AddressMetaSchema.parse({ address: JSON.stringify(address) }).address,
    ).toEqual(address)
  })
  it('places optional details from unit portion through street before access guidance', () => {
    expect(EDITABLE_ADDRESS_FIELDS).toEqual([
      'formattedAddress',
      'unitPortion',
      'unitExpression',
      'floorExpression',
      'blockExpression',
      'buildingName',
      'phaseExpression',
      'premisesName',
      'buildingNumberExpression',
      'streetName',
      'accessHint',
    ])
  })
})

it('stores room as a unit type and a portion as unitPortion, independently of the floor', () => {
  let address = emptyFeatureAddress({ en: 'Building' })
  address = setStructuredAddressExpression(address, 'en', 'floorExpression', '12', 'F')
  address = setStructuredAddressExpression(address, 'en', 'unitExpression', 'B', 'R')
  address = setStructuredAddressExpression(address, 'en', 'unitPortion', 'Rear part')
  const saved = AddressMetaSchema.parse({ address: JSON.stringify(address) }).address
  if (!saved) throw new Error('Expected a parsed address')
  expect(saved.unitDetails).toEqual({
    floorRef: '12',
    floorType: 'F',
    unitRef: 'B',
    unitType: 'R',
  })
  expect(saved.overrides.en.unitPortion).toBe('Rear part')
  expect(saved.overrides['zh-hant']?.unitPortion).toBeUndefined()
  expect(saved.source.address3dUnitId).toBeNull()
  expect(getAddressDisplay(saved, 'en')).toBe('Rear part, Room B, 12/F, Building')
  const withoutFloor = setStructuredAddressExpression(
    saved,
    'en',
    'floorExpression',
    undefined,
  )
  expect(withoutFloor.unitDetails).toEqual({
    unitRef: 'B',
    unitType: 'R',
  })
})

it('rejects invented local IDs, room hierarchy levels and cross-domain type codes', () => {
  const address = emptyFeatureAddress()
  for (const unitDetails of [
    { id: 'invented' },
    { granularity: 'room' },
    { room_part: 'rear' },
    { room: 'B' },
    { unitType: 'G' },
    { floorType: 'SU' },
  ]) {
    expect(
      AddressMetaSchema.safeParse({ address: { ...address, unitDetails } }).success,
    ).toBe(false)
  }
  // R means Roof for floors and Room for units; the fields are never interchangeable.
  expect(formatFloor({ floorType: 'R', floorRef: '' }, 'en')).toBe('R')
  expect(formatUnit({ unitType: 'R', unitRef: 'B' }, 'en')).toBe('Room B')
})

it('does not repeat named floor codes from source-parser references', () => {
  expect(formatFloor({ floorType: 'G', floorRef: 'G' }, 'en')).toBe('G/F')
  expect(formatFloor({ floorType: 'G', floorRef: 'G' }, 'zhHant')).toBe('地下')
  expect(formatFloor({ floorType: 'UG', floorRef: 'UG' }, 'en')).toBe('UG')
  expect(formatFloor({ floorType: 'B', floorRef: '2' }, 'en')).toBe('B2')
})
