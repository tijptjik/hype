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
