// @vitest-environment node
import { expect, it } from 'vitest'
import { ADDRESS_LOCALES, emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import { mapAddressDisagreements } from '#lib/addresses/mapAddressDisagreement.js'
const selected = () => {
  const address = emptyFeatureAddress()
  address.overrides.en = {
    premisesName: 'Hollywood Terrace',
    blockExpression: 'Tower B',
    streetName: 'Hollywood Road',
    buildingNumberExpression: '123',
  }
  return address
}
it('reports a different containing feature without changing the selected address', () => {
  const address = selected(),
    before = structuredClone(address)
  expect(mapAddressDisagreements(address, ['Cat Street Bazaar'], null, [])).toEqual([
    { field: 'building', selected: 'Hollywood Terrace', mapped: 'Cat Street Bazaar' },
  ])
  expect(address).toEqual(before)
})
it('ignores absent and ambiguous map evidence and agrees with the selected tower', () => {
  expect(mapAddressDisagreements(selected(), [], null, [])).toEqual([])
  expect(
    mapAddressDisagreements(selected(), ['Hollywood Terrace Tower B'], '123', [
      'Hollywood Rd',
    ]),
  ).toEqual([])
  expect(
    mapAddressDisagreements(
      selected(),
      ['Cat Street Bazaar', 'Another Building'],
      null,
      [],
    ),
  ).toEqual([])
})
it('reports direct number, street and tower conflicts independently', () => {
  expect(
    mapAddressDisagreements(selected(), ['Hollywood Terrace Tower A'], '125', [
      'Ladder Street',
    ]).map(item => item.field),
  ).toEqual(['block', 'number', 'street'])
})

it('recognizes equivalent suffix pairs while preserving range and pair disagreement', () => {
  const address = selected()
  address.overrides.en.buildingNumberExpression = '124B & 124C'
  expect(mapAddressDisagreements(address, [], '124B/C', [])).toEqual([])
  expect(mapAddressDisagreements(address, [], '124B-124C', [])).toEqual([
    { field: 'number', selected: '124B & 124C', mapped: '124B-124C' },
  ])
  address.overrides.en = {
    buildingNumberFrom: '124B',
    buildingNumberTo: '124C',
    buildingNumberConnector: '/',
  }
  expect(mapAddressDisagreements(address, [], '124B/C', [])).toEqual([])
})

it('matches bilingual map streets in English and both Chinese scripts', () => {
  for (const [locale, streetName] of [
    ['en', 'Hollywood Road'],
    ['zhHant', '荷李活道'],
    ['zhHans', '荷李活道'],
  ] as const) {
    const address = emptyFeatureAddress()
    address.overrides[ADDRESS_LOCALES[locale]] = { streetName }
    expect(
      mapAddressDisagreements(address, [], null, ['荷李活道 Hollywood Road']),
    ).toEqual([])
  }
})

it('keeps genuine bilingual corrections in the selected language', () => {
  expect(
    mapAddressDisagreements(selected(), [], null, ['樓梯街 Ladder Street']),
  ).toEqual([{ field: 'street', selected: 'Hollywood Road', mapped: 'Ladder Street' }])
  const address = emptyFeatureAddress()
  address.overrides['zh-hans'] = { streetName: '荷李活道' }
  expect(mapAddressDisagreements(address, [], null, ['樓梯街 Ladder Street'])).toEqual([
    { field: 'street', selected: '荷李活道', mapped: '楼梯街' },
  ])
  expect(mapAddressDisagreements(address, [], null, ['Hollywood Road'])).toEqual([])
})

it('deduplicates bilingual and English evidence without hiding different streets', () => {
  expect(
    mapAddressDisagreements(selected(), [], null, [
      '荷李活道 Hollywood Road',
      'Hollywood Rd',
    ]),
  ).toEqual([])
  expect(
    mapAddressDisagreements(selected(), [], null, [
      '樓梯街 Ladder Street',
      'Queen Road',
    ]),
  ).toEqual([])
  expect(
    mapAddressDisagreements(
      selected(),
      ['荷李活臺 Hollywood Terrace Tower B'],
      null,
      [],
    ),
  ).toEqual([])
})
