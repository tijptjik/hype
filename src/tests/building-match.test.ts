// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
// ADDRESS
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  matchAddressBuilding,
  resolveAddressBuilding,
} from '#lib/locations/buildingMatch.js'
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
const mocks = vi.hoisted(() => ({ search: vi.fn() }))
vi.mock('#lib/locations/buildingSearch.js', () => ({
  searchBuildingNames: mocks.search,
}))
const address = (): FeatureAddress => ({
  ...emptyFeatureAddress(),
  coordinates: [114.15, 22.3],
  overrides: { en: { buildingName: 'Hollywood Building' } },
})
const building = (id: string, longitude = 114.1501): Result => ({
  id: `building:${id}`,
  kind: 'building',
  names: { en: 'Hollywood Building' },
  buildingSource: { id, release: 'r1' },
  address: { ...address(), coordinates: [longitude, 22.3] },
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.search.mockResolvedValue([])
})

it('uses a nearby exact-name building from cached discovery, even on another street', async () => {
  const candidate = building('known')
  candidate.address.overrides.en!.streetName = 'Secondary Street'
  expect(await resolveAddressBuilding(address(), [candidate], 'en', () => true)).toBe(
    candidate,
  )
  expect(mocks.search).not.toHaveBeenCalled()
})

it('searches the specific building name with a 100 metre constraint when missing from discovery', async () => {
  const candidate = building('hidden')
  mocks.search.mockResolvedValue([
    building('far', 114.2),
    candidate,
    { ...building('partial'), names: { en: 'Hollywood Building Annex' } },
  ])
  expect(await resolveAddressBuilding(address(), [], 'en', () => true)).toBe(candidate)
  expect(mocks.search).toHaveBeenCalledWith(
    'Hollywood Building',
    'en',
    expect.any(Function),
    { exact: true, coordinates: [114.15, 22.3], maxDistance: 100 },
  )
})

it('prefers the canonical Address alternative and refuses ambiguous distinct identities', () => {
  const evidence = address()
  evidence.source.address2dId = 'address-id'
  const first = building('known'),
    second = building('known')
  second.buildingSource!.addressId = 'address-id'
  expect(matchAddressBuilding(evidence, [first, second])).toBe(second)
  expect(matchAddressBuilding(evidence, [first, building('different')])).toBeNull()
})

it('does not match premises-only addresses or accept superseded lookups', async () => {
  const premises = address()
  premises.overrides.en = { premisesName: 'Hollywood Building' }
  expect(await resolveAddressBuilding(premises, [], 'en', () => true)).toBeNull()
  expect(mocks.search).not.toHaveBeenCalled()
  let current = true
  mocks.search.mockImplementation(async () => {
    current = false
    return [building('late')]
  })
  expect(await resolveAddressBuilding(address(), [], 'en', () => current)).toBeNull()
})

it('requires review for ambiguous identities instead of falling back to local creation', async () => {
  await expect(
    resolveAddressBuilding(
      address(),
      [building('one'), building('two')],
      'en',
      () => true,
    ),
  ).rejects.toThrow('BUILDING_MATCH_AMBIGUOUS')
  expect(mocks.search).not.toHaveBeenCalled()
})
