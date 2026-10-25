import { expect, it } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  groupDraftSearchResults,
  type DraftSearchResult,
} from '#lib/locations/draftSearchGroups.js'

function row(number: string, longitude = 114.15): DraftSearchResult {
  const address = emptyFeatureAddress()
  address.coordinates = [longitude, 22.3]
  address.overrides.en = {
    premisesName: 'Curios Court',
    streetName: 'Queen Road',
    buildingNumberExpression: number,
  }
  return { id: number, kind: 'address', names: {}, address }
}
it('groups the premises, retaining the real range first and natural number order', () => {
  const rows = [row('219'), row('215'), row('209–223'), row('217')]
  const grouped = groupDraftSearchResults(rows)
  expect(grouped).toHaveLength(1)
  expect(grouped[0].members.map(row => row.id)).toEqual([
    '209–223',
    '215',
    '217',
    '219',
  ])
  expect(grouped[0].representative).toBe(rows[2])
})
it('does not group distant namesakes, other streets or establishments', () => {
  const distant = row('5', 114.2)
  const otherStreet = row('6')
  otherStreet.address.overrides.en!.streetName = 'Other Road'
  const place = { ...row('7'), kind: 'establishment' as const }
  expect(groupDraftSearchResults([row('1'), distant, otherStreet, place])).toHaveLength(
    4,
  )
})
it('does not manufacture a range option when only individual numbers exist', () => {
  const rows = [row('11'), row('2')]
  const result = groupDraftSearchResults(rows)[0]
  expect(result.members.map(row => row.id)).toEqual(['2', '11'])
  expect(result.representative).toBe(rows[1])
})

it('summarises collapsed addresses as a range without changing expanded records', () => {
  const rows = [row('3'), row('1')]
  const group = groupDraftSearchResults(rows)[0]
  expect(group.numberRange).toBe('1-3')
  expect(
    group.members.map(member => member.address.overrides.en?.buildingNumberExpression),
  ).toEqual(['1', '3'])
  expect(group.representative.address.overrides.en?.buildingNumberExpression).toBe('1')
})
it('includes existing range endpoints and sorts suffixes naturally', () => {
  expect(groupDraftSearchResults([row('10'), row('2-4')])[0].numberRange).toBe('2-10')
  expect(groupDraftSearchResults([row('1B'), row('1A')])[0].numberRange).toBe('1A-1B')
})
it('does not invent a span for missing or nonnumeric source expressions', () => {
  expect(groupDraftSearchResults([row(''), row('3')])[0].numberRange).toBeUndefined()
  expect(
    groupDraftSearchResults([row('1 & 3'), row('5')])[0].numberRange,
  ).toBeUndefined()
})

it('groups blocks and buildings under their premises, keeping singleton premises direct', () => {
  const first = row('1')
  const second = row('3')
  first.address.overrides.en!.blockExpression = 'Block 1'
  second.address.overrides.en!.blockExpression = 'Block 2'
  first.address.overrides.en!.buildingName = 'First House'
  second.address.overrides.en!.buildingName = 'Second House'
  expect(groupDraftSearchResults([first, second])).toHaveLength(1)
  expect(groupDraftSearchResults([first])[0].expandable).toBe(false)
})

it('keeps singleton buildings direct while grouping multiple building addresses', () => {
  const first = row('1')
  const second = row('3')
  for (const candidate of [first, second]) {
    candidate.address.overrides.en!.premisesName = ''
    candidate.address.overrides.en!.buildingName = 'Tai Hing Building'
  }
  expect(groupDraftSearchResults([first])[0].expandable).toBe(false)
  expect(groupDraftSearchResults([first, second])[0].expandable).toBe(true)
})
