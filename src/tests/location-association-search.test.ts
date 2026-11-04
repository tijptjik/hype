// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  filterAssociationCandidates,
  searchAssociationCandidates,
} from '#lib/locations/associationSearch.js'
import type { AssociationSearchInput } from '#lib/locations/associationSearch.js'
import type { DraftLocationSearchResult as Result } from '#lib/bits/patterns/forms/featureLocation/draftLocationSearch.types.js'
const mocks = vi.hoisted(() => ({
  local: vi.fn(),
  nearby: vi.fn(),
  places: vi.fn(),
  buildings: vi.fn(),
}))
vi.mock('#lib/api/locationAssociation.remote.js', () => ({
  searchDraftAssociationLocations: mocks.local,
}))
vi.mock('#lib/api/draftLocation.remote.js', () => ({
  searchDraftLocations: mocks.places,
  searchNearbyDraftLocations: mocks.nearby,
}))
vi.mock('#lib/locations/buildingSearch.js', () => ({
  searchBuildingNames: mocks.buildings,
}))
const input = (): AssociationSearchInput => ({
  kind: 'establishment',
  names: { en: 'Cafe' },
  coordinates: [114.15, 22.3],
  locale: 'en',
  projectId: 'p',
  cached: [],
})
const row = (id: string): Result => ({
  id,
  kind: 'establishment',
  names: { en: 'Hollywood Cafe' },
  identity: { locationId: id, revisionId: 'r1' },
  address: { ...emptyFeatureAddress(), coordinates: [114.1501, 22.3] },
})
beforeEach(() => {
  vi.resetAllMocks()
  mocks.local.mockResolvedValue({ rows: [], limited: false })
  mocks.nearby.mockResolvedValue({ rows: [], partial: false, limited: false })
  mocks.places.mockResolvedValue({ rows: [], partial: false, limited: false })
  mocks.buildings.mockResolvedValue([])
})

it('requires the requested kind, a partial name, a real identity and a point within 100 metres', () => {
  const valid = row('valid')
  expect(
    filterAssociationCandidates(input(), [
      valid,
      { ...row('wrong-kind'), kind: 'building' },
      { ...row('wrong-name'), names: { en: 'Bakery' } },
      { ...row('evidence'), identity: undefined },
      { ...row('distant'), address: { ...valid.address, coordinates: [114.16, 22.3] } },
    ]),
  ).toEqual([valid])
})

it('prefers an existing local source identity and keeps building address alternatives separate', () => {
  const local = {
    ...row('local'),
    identity: { locationId: 'local', revisionId: 'r1', ssId: 'source' },
  }
  const source = {
    ...row('source'),
    identity: undefined,
    source: { ssId: 'source', resourceReleaseId: 'r1' },
  }
  expect(filterAssociationCandidates(input(), [source, local])).toEqual([local])
  const buildings = ['a', 'b'].map(id => ({
    ...row(id),
    kind: 'building' as const,
    identity: undefined,
    buildingSource: { id: 'building', release: 'r1', addressId: id },
  }))
  expect(
    filterAssociationCandidates({ ...input(), kind: 'building' }, buildings),
  ).toHaveLength(2)
})

it('cross-references hidden providers and distinguishes failure from a complete no-match', async () => {
  expect(await searchAssociationCandidates(input())).toEqual({
    candidates: [],
    incomplete: false,
  })
  expect(mocks.local).toHaveBeenCalledWith({
    projectId: 'p',
    kind: 'establishment',
    coordinates: [114.15, 22.3],
  })
  expect(mocks.nearby).toHaveBeenCalledWith({
    coordinates: [114.15, 22.3],
    radius: 100,
  })
  mocks.local.mockRejectedValueOnce(new Error('offline'))
  expect(
    await searchAssociationCandidates({ ...input(), cached: [row('cached')] }),
  ).toMatchObject({ candidates: [row('cached')], incomplete: true })
  mocks.nearby.mockResolvedValueOnce({ rows: [], partial: false, limited: true })
  expect((await searchAssociationCandidates(input())).incomplete).toBe(true)
})

it('does not reconcile address-only choices or invent matches without coordinates', async () => {
  expect(await searchAssociationCandidates({ ...input(), kind: 'address' })).toEqual({
    candidates: [],
    incomplete: false,
  })
  expect(await searchAssociationCandidates({ ...input(), coordinates: null })).toEqual({
    candidates: [],
    incomplete: true,
  })
  expect(mocks.local).not.toHaveBeenCalled()
  expect(mocks.places).not.toHaveBeenCalled()
})
