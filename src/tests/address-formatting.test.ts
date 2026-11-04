// @vitest-environment node
import { expect, it } from 'vitest'
import {
  streetDisplayName,
  applyAddressAbbreviations,
} from '#lib/addresses/formatting.js'
import { unitDisplayExpression } from '#lib/addresses/address3d.js'

it.each([
  ['HING FONG ROAD', 'Hing Fong Road'],
  ["KING'S ROAD", "King's Road"],
  ["D'AGUILAR STREET", "D'Aguilar Street"],
  ['A-B ROAD 12A 1ST', 'A-B Road 12A 1st'],
])('title-cases street %s', (source, display) => {
  expect(streetDisplayName(source, 'en')).toBe(display)
})
it('preserves Chinese streets and retains the canonical abbreviation table', () => {
  expect(streetDisplayName('橫窩仔街', 'zhHant')).toBe('橫窩仔街')
  expect(applyAddressAbbreviations('Room 3308, Example Road')).toBe(
    'Rm 3308, Example Rd',
  )
})
it('canonicalizes recognized source units without inventing labels for bare identifiers', () => {
  expect(unitDisplayExpression('Room Room 3308', 'en')).toBe('Rm 3308')
  expect(unitDisplayExpression('Rear part, Room 3308, 12/F', 'en')).toBe(
    'Rear part, Rm 3308, 12/F',
  )
  expect(unitDisplayExpression('3308', 'en')).toBe('3308')
  expect(unitDisplayExpression('Rear section', 'en')).toBe('Rear section')
})

it('abbreviates canonical block and unit displays without rewriting editable expressions', async () => {
  const { emptyFeatureAddress, getAddressDisplay } = await import(
    '#lib/addresses/featureAddress.js'
  )
  const address = emptyFeatureAddress()
  address.overrides.en = {
    premisesName: 'Hollywood Terrace',
    blockType: 'tower',
    blockRef: 'B',
    blockExpression: 'Tower B',
  }
  expect(getAddressDisplay(address, 'en')).toBe('Twr B, Hollywood Terrace')
  expect(address.overrides.en.blockExpression).toBe('Tower B')
  expect(unitDisplayExpression('Office 12', 'en')).toBe('Off 12')
  expect(unitDisplayExpression('Off 12', 'en')).toBe('Off 12')
  expect(unitDisplayExpression('Unit 12', 'en')).toBe('Unit 12')
})
