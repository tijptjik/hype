import { expect, it, vi, afterEach } from 'vitest'
import { searchBuildingNames } from '../lib/locations/buildingSearch'
const source = vi.hoisted(() => ({ names: vi.fn(), details: vi.fn() }))
vi.mock('#lib/sources/saanseoi.js', () => ({
  loadBuildingNames: source.names,
  loadBuildingDetails: source.details,
}))
vi.mock('#lib/addresses/nameCatalogue.js', () => ({
  loadAddressNames: vi
    .fn()
    .mockResolvedValue([
      { id: 'street', names: { en: 'Test Road' }, divisionCodes: [] },
    ]),
}))
afterEach(() => vi.clearAllMocks())
it('matches primary and translated names and retains explicit address alternatives', async () => {
  source.names.mockResolvedValue({
    release: 'r1',
    records: [
      {
        id: 'b',
        name: 'Mixed Tower',
        names: { en: null, 'zh-Hant': '大廈', 'zh-Hans': null },
        divisionCodes: [],
      },
    ],
  })
  source.details.mockResolvedValue({
    id: 'b',
    coordinates: [114, 22],
    addresses: [
      {
        id: 'a',
        snapshotId: 's',
        display: { en: '1 Test Road' },
        match: 'point-in-footprint',
      },
      {
        id: 'c',
        snapshotId: 's',
        display: { en: '2 Test Road' },
        match: 'point-in-footprint',
      },
    ],
  })
  const rows = await searchBuildingNames('mixed', 'en')
  expect(source.details).toHaveBeenCalledWith('b', 'r1')
  expect(rows).toHaveLength(2)
  expect(new Set(rows.map(row => row.id)).size).toBe(2)
  expect(rows[0].kind).toBe('building')
  expect(rows[0].address.overrides.en?.buildingNumberFrom).toBe('1')
  expect(rows[1].address.overrides.en?.buildingNumberFrom).toBe('2')
  expect(await searchBuildingNames('大廈', 'zhHant')).toHaveLength(2)
})
it('does not fetch details for a superseded query', async () => {
  source.names.mockResolvedValue({ release: 'r1', records: [] })
  expect(await searchBuildingNames('tower', 'en', () => false)).toEqual([])
  expect(source.details).not.toHaveBeenCalled()
})
