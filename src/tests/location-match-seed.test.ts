import { expect, it } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { locationMatchSeed } from '#lib/locations/matchSeed.js'

it('prefers an establishment name over its host building', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = { buildingName: 'Por Mee Factory Building' }
  expect(locationMatchSeed('Clockwork Cat', address, 'en')).toEqual({
    kind: 'establishment',
    query: 'Clockwork Cat',
  })
})
it('uses meaningful structured components without unit or floor', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = {
    floorExpression: '4',
    unitExpression: 'C12',
    buildingName: 'Por Mee Factory Building',
    premisesName: 'Test Complex',
    streetName: 'Castle Peak Road',
    buildingNumberExpression: '500',
  }
  expect(locationMatchSeed('', address, 'en').query).toBe('Por Mee Factory Building')
  delete address.overrides.en.buildingName
  expect(locationMatchSeed('', address, 'en').query).toBe('Test Complex')
  delete address.overrides.en.premisesName
  expect(locationMatchSeed('', address, 'en').query).toBe('500 Castle Peak Road')
})
it('recovers legacy components for a search without mutating the address', () => {
  const address = emptyFeatureAddress()
  address.legacy = {
    i18n: { en: { addressProperties: { buildingName: 'Por Mee Factory Building' } } },
  }
  const before = JSON.stringify(address)
  expect(locationMatchSeed('Untitled feature', address, 'en').query).toBe(
    'Por Mee Factory Building',
  )
  expect(JSON.stringify(address)).toBe(before)
})
it('does not seed a search with only floor and unit information', () => {
  const address = emptyFeatureAddress()
  address.overrides.en = { floorExpression: '4', unitExpression: 'C12' }
  expect(locationMatchSeed('', address, 'en').query).toBe('')
})

it('extracts meaningful components from display-only legacy addresses', () => {
  const address = emptyFeatureAddress({
    en: 'C12, 4/F, Por Mee Factory Building, 500 Castle Peak Rd, Cheung Sha Wan',
  })
  expect(locationMatchSeed('', address, 'en')).toEqual({
    kind: 'building',
    query: 'Por Mee Factory Building',
  })
  const floor = emptyFeatureAddress({ 'zh-hant': '4樓, 500 Castle Peak Road' })
  expect(locationMatchSeed('', floor, 'zhHant')).toEqual({
    kind: 'address',
    query: '500 Castle Peak Road',
  })
})

it('extracts the building from an unpunctuated Chinese display address', () => {
  const address = emptyFeatureAddress({
    'zh-hant': '長沙灣工業區深水埗區青山道500號百美工業大廈',
  })
  expect(locationMatchSeed('', address, 'zhHant')).toEqual({
    kind: 'building',
    query: '百美工業大廈',
  })
})
