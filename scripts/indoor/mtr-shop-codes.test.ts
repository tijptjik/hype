import { expect, test } from 'bun:test'
import { mtrShopUnitKey } from './mtr-shop-codes'

test('equivalent complete combined shop codes identify the same physical polygon', () => {
  expect(mtrShopUnitKey('CHH 18 & 19')).toBe(mtrShopUnitKey('CHH 18-19'))
  expect(mtrShopUnitKey('HOK 5, 6')).toBe(mtrShopUnitKey('HOK 5 & 6'))
  expect(mtrShopUnitKey('TUM 12-13')).not.toBe(mtrShopUnitKey('TUM 12'))
  expect(mtrShopUnitKey('KET 9C')).not.toBe(mtrShopUnitKey('KET 9'))
  expect(mtrShopUnitKey('KOT 1A-1C')).not.toBe(mtrShopUnitKey('KOT 1A & 1B & 1C'))
})
