// @vitest-environment node
import { expect, it } from 'vitest'
import { structurePlaceAddress, setAddressName } from '#lib/addresses/nameCatalogue.js'
import {
  emptyFeatureAddress,
  getAddressLocale,
  getAddressDisplay,
  setAddressOverride,
} from '#lib/addresses/featureAddress.js'
import {
  setAddressBlock,
  setStructuredAddressExpression,
} from '#lib/addresses/addressExpressions.js'
const street = {
  id: 'street-1',
  names: { en: 'LYNDHURST TERRACE', 'zh-Hant': '擺花街' },
  divisionCodes: ['CW'],
}
it('structures a number and exact catalogue street while retaining source evidence', () => {
  const original = emptyFeatureAddress({ en: '25 Lyndhurst Terrace' })
  const next = structurePlaceAddress(original, [street])
  expect(getAddressLocale(next, 'en')).toMatchObject({
    buildingNumberFrom: '25',
    streetName: 'LYNDHURST TERRACE',
  })
  expect(getAddressDisplay(next, 'en')).toBe('25 LYNDHURST TERRACE')
  expect(next.source.fallbackDisplay).toEqual(original.source.fallbackDisplay)
  expect(next.source.address2dId).toBeNull()
  expect(
    structurePlaceAddress(emptyFeatureAddress({ en: '25 Made Up Lane' }), [street])
      .source.authored,
  ).toBeUndefined()
})
it('leaves associated addresses intact and copies only catalogue translations', () => {
  const address = emptyFeatureAddress()
  address.source.address2dId = 'canonical'
  expect(structurePlaceAddress(address, [street])).toBe(address)
  const next = setAddressName(address, 'streetName', street)
  expect(getAddressLocale(next, 'zhHant').streetName).toBe('擺花街')
  expect(getAddressLocale(next, 'zhHans').streetName).toBeNull()
  expect(next.source.address2dId).toBe('canonical')
})
it('keeps custom complete display text unchanged until re-locked', () => {
  let address = structurePlaceAddress(
    emptyFeatureAddress({ en: '25 Lyndhurst Terrace' }),
    [street],
  )
  address = setAddressOverride(address, 'en', 'formattedAddress', 'My complete address')
  address = setStructuredAddressExpression(address, 'en', 'floorExpression', '', 'UG')
  expect(getAddressDisplay(address, 'en')).toBe('My complete address')
  address = setAddressOverride(address, 'en', 'formattedAddress', undefined)
  expect(getAddressDisplay(address, 'en')).toBe('UG, 25 LYNDHURST TERRACE')
})
it('does not copy a descriptive portion across languages and respects block order', () => {
  let address = setStructuredAddressExpression(
    emptyFeatureAddress(),
    'en',
    'unitPortion',
    'Rear portion',
  )
  expect(getAddressLocale(address, 'zhHant').unitPortion).toBeUndefined()
  address = setStructuredAddressExpression(address, 'zhHant', 'unitPortion', '後方部分')
  expect(getAddressDisplay(address, 'en')).toBe('Rear portion')
  expect(getAddressDisplay(address, 'zhHant')).toBe('後方部分')
  address = setAddressBlock(address, 'en', 'tower', '2', false)
  expect(getAddressLocale(address, 'en')).toMatchObject({
    blockType: 'tower',
    blockRef: '2',
    blockTypeBeforeNumber: false,
    blockExpression: '2 Tower',
  })
})
