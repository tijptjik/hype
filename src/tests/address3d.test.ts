// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  parseFloor,
  parseFloorReference,
  parseUnitReference,
  parseUnit,
  formatFloor,
  formatUnit,
} from '#lib/addresses/address3d.js'

it('extracts floor terms while preserving selected types for numeric references', () => {
  expect(parseFloorReference('floor', 'UG')).toEqual({
    floorType: 'F',
    floorRef: '',
    extracted: true,
  })
  expect(parseFloorReference('Upper ground', 'F')).toEqual({
    floorType: 'UG',
    floorRef: '',
    extracted: true,
  })
  expect(parseFloorReference('Basement 2', 'F')).toEqual({
    floorType: 'B',
    floorRef: '2',
    extracted: true,
  })
  expect(parseFloorReference('88/F', 'UG')).toEqual({
    floorType: 'F',
    floorRef: '88',
    extracted: true,
  })
  expect(parseFloorReference('地庫2', 'F')).toEqual({
    floorType: 'B',
    floorRef: '2',
    extracted: true,
  })
  expect(parseFloorReference('88', 'UG')).toEqual({
    floorType: 'UG',
    floorRef: '88',
    extracted: false,
  })
  expect(parseFloorReference('UG3', 'F')).toEqual({
    floorType: 'UG',
    floorRef: '3',
    extracted: true,
  })
})
it('infers unit types without changing bare references', () => {
  expect(parseUnitReference('Office 2', 'R')).toEqual({
    unitRef: '2',
    unitType: 'O',
    extracted: true,
  })
  expect(parseUnitReference('Room 2', 'X')).toMatchObject({
    unitRef: '2',
    extracted: true,
  })
  expect(parseUnitReference('3B', 'X')).toEqual({
    unitRef: '3B',
    unitType: 'X',
    extracted: false,
  })
})
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
  setAddressBlock,
  parseBlockReference,
} from '#lib/addresses/addressExpressions.js'

it('extracts block types from complete labels and expressions', () => {
  expect(parseBlockReference('Block', 'apartment')).toEqual({
    blockType: 'block',
    blockRef: '',
    extracted: true,
  })
  expect(parseBlockReference('Tower A', 'block')).toEqual({
    blockType: 'tower',
    blockRef: 'A',
    extracted: true,
  })
  expect(parseBlockReference('A座', 'tower')).toEqual({
    blockType: 'block',
    blockRef: 'A',
    extracted: true,
  })
  expect(parseBlockReference('Bloc', 'apartment')).toEqual({
    blockType: 'apartment',
    blockRef: 'Bloc',
    extracted: false,
  })
})

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
      'buildingName',
      'blockExpression',
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
  expect(getAddressDisplay(saved, 'en')).toBe('Rear part, Rm B, 12/F, Building')
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
  expect(formatUnit({ unitType: 'R', unitRef: 'B' }, 'en')).toBe('Rm B')
})

it('does not repeat named floor codes from source-parser references', () => {
  expect(formatFloor({ floorType: 'G', floorRef: '' }, 'en')).toBe('G/F')
  expect(formatFloor({ floorType: 'G', floorRef: '' }, 'zhHant')).toBe('地下')
  expect(formatFloor({ floorType: 'UG', floorRef: '' }, 'en')).toBe('UG')
  expect(formatFloor({ floorType: 'B', floorRef: '2' }, 'en')).toBe('B2')
})

it.each([
  ['Room Room 3308', undefined, '3308', 'R', 'Rm 3308'],
  ['Rm 3308', undefined, '3308', 'R', 'Rm 3308'],
  ['Suite St 3308', undefined, '3308', 'SU', 'St 3308'],
  ['Shop 3308', 'R', '3308', 'R', 'Rm 3308'],
  ['3308套房', undefined, '3308', 'SU', 'St 3308'],
  ['ROOM-A', undefined, 'ROOM-A', 'U', 'Unit ROOM-A'],
] as const)(
  'normalizes %s while preserving the selected type',
  (input, type, ref, code, display) => {
    const parsed = parseUnit(input, type)
    expect(parsed).toEqual({ unitRef: ref, unitType: code })
    expect(formatUnit(parsed, 'en')).toBe(display)
  },
)

it('stores only the reference while composing canonical units in every language', () => {
  const address = setStructuredAddressExpression(
    emptyFeatureAddress({ en: 'Building' }),
    'en',
    'unitExpression',
    'Room Rm 3308',
    'R',
  )
  expect(address.overrides.en.unitExpression).toBe('3308')
  expect(address.unitDetails).toMatchObject({ unitRef: '3308', unitType: 'R' })
  expect(getAddressDisplay(address, 'en')).toBe('Rm 3308, Building')
  expect(formatUnit(address.unitDetails!, 'zhHant')).toBe('3308房')
})

it('shares block references between Chinese scripts while preserving local type and order', () => {
  let address = emptyFeatureAddress()
  address = setAddressBlock(address, 'en', 'block', 'A', true)
  address = setAddressOverride(address, 'zhHans', 'blockType', 'tower')
  address = setAddressOverride(address, 'zhHans', 'blockTypeBeforeNumber', true)
  address = setAddressBlock(address, 'zhHant', 'block', '2', false)
  expect(getAddressLocale(address, 'zhHant')).toMatchObject({
    blockRef: '2',
    blockExpression: '2座',
  })
  expect(getAddressLocale(address, 'zhHans')).toMatchObject({
    blockRef: '2',
    blockType: 'tower',
    blockTypeBeforeNumber: true,
  })
  address = setAddressBlock(address, 'zhHans', 'tower', '3', true)
  expect(getAddressLocale(address, 'zhHant')).toMatchObject({
    blockRef: '3',
    blockExpression: '3座',
  })
  expect(getAddressLocale(address, 'en').blockRef).toBe('A')
})
