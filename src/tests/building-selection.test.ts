import { expect, it } from 'vitest'
import { fillBuildingDetails } from '../lib/addresses/buildingSelection'
import {
  emptyFeatureAddress,
  getAddressLocale,
  getAddressDisplay,
  setAddressOverride,
} from '../lib/addresses/featureAddress'
const building = { id: 'b1', names: { en: 'Example Tower' }, divisionCodes: [] }
const candidate = {
  id: 'a1',
  snapshotId: 's1',
  display: { en: "12 Queen's Road Central" },
  match: 'point-in-footprint' as const,
}
const details = {
  id: 'b1',
  coordinates: [114.1, 22.3] as [number, number],
  addresses: [candidate],
}
it('fills a missing point and parses building address components without minting identity', () => {
  const result = fillBuildingDetails(
    emptyFeatureAddress(),
    building,
    details,
    candidate,
    false,
    'en',
    [{ id: 'street', names: { en: "Queen's Road Central" }, divisionCodes: [] }],
  )
  expect(result.coordinates).toEqual(details.coordinates)
  expect(getAddressLocale(result, 'en')).toMatchObject({
    buildingName: 'Example Tower',
    streetName: "Queen's Road Central",
    buildingNumberFrom: '12',
  })
  expect(result.source.address2dId).toBeFalsy()
})
it('preserves the existing point, authored street and unlocked display', () => {
  let original = emptyFeatureAddress()
  original.coordinates = [114.2, 22.4]
  original = setAddressOverride(original, 'en', 'streetName', 'My Street')
  original = setAddressOverride(original, 'en', 'formattedAddress', 'My custom label')
  const result = fillBuildingDetails(original, building, details, candidate, true, 'en')
  expect(result.coordinates).toEqual(original.coordinates)
  expect(getAddressLocale(result, 'en').streetName).toBe('My Street')
  expect(getAddressDisplay(result, 'en')).toBe('My custom label')
})
it('does not choose an address when multiple alternatives await a decision', () => {
  const result = fillBuildingDetails(
    emptyFeatureAddress(),
    building,
    details,
    undefined,
    false,
    'en',
    [{ id: 'street', names: { en: "Queen's Road Central" }, divisionCodes: [] }],
  )
  expect(getAddressLocale(result, 'en').streetName).toBeFalsy()
  expect(getAddressLocale(result, 'zhHant').buildingName).toBeFalsy()
})
it('preserves explicit clears and unparsed address text', () => {
  const original = setAddressOverride(emptyFeatureAddress(), 'en', 'streetName', null)
  const result = fillBuildingDetails(
    original,
    building,
    details,
    { ...candidate, display: { en: 'Beside the old pier' } },
    true,
    'en',
  )
  expect(getAddressLocale(result, 'en').streetName).toBeFalsy()
  expect(getAddressDisplay(result, 'en')).toBe('Beside the old pier')
})

it('does not mix a previously edited building number with source number components', () => {
  const original = setAddressOverride(
    emptyFeatureAddress(),
    'en',
    'buildingNumberExpression',
    '999',
  )
  const result = fillBuildingDetails(
    original,
    building,
    details,
    candidate,
    true,
    'en',
    [{ id: 's', names: { en: "Queen's Road Central" }, divisionCodes: [] }],
  )
  expect(getAddressLocale(result, 'en').buildingNumberExpression).toBe('999')
  expect(getAddressLocale(result, 'en').buildingNumberFrom).toBeFalsy()
})

it('recognizes the selected Chinese building name instead of parsing it as a block', () => {
  const selected = {
    id: 'golden',
    names: { en: 'Golden Gate Commercial Building', 'zh-Hant': '金門商業大廈' },
    divisionCodes: [],
  }
  const addressCandidate = { ...candidate, display: { 'zh-hant': '金門商業大廈' } }
  const result = fillBuildingDetails(
    emptyFeatureAddress(),
    selected,
    details,
    addressCandidate,
    false,
    'en',
  )
  expect(getAddressLocale(result, 'zhHant').buildingName).toBe('金門商業大廈')
  expect(getAddressLocale(result, 'zhHant').blockRef).toBeFalsy()
  expect(getAddressLocale(result, 'zhHant').blockExpression).toBeFalsy()
})
