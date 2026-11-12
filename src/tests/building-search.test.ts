import { expect, it, vi, afterEach } from 'vitest'
import { getAddressLocale } from '#lib/addresses/featureAddress.js'
import {
  resetAddressComponent,
  clearAddressComponent,
} from '#lib/addresses/addressExpressions.js'
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
  expect(getAddressLocale(rows[0].address, 'en').buildingNumberFrom).toBe('1')
  expect(getAddressLocale(rows[1].address, 'en').buildingNumberFrom).toBe('2')
  expect(await searchBuildingNames('大廈', 'zhHant')).toHaveLength(2)
})
it('does not fetch details for a superseded query', async () => {
  source.names.mockResolvedValue({ release: 'r1', records: [] })
  expect(await searchBuildingNames('tower', 'en', () => false)).toEqual([])
  expect(source.details).not.toHaveBeenCalled()
})

it('treats a building without an address as source data that can be removed and reset', async () => {
  source.names.mockResolvedValue({
    release: 'r1',
    records: [
      {
        id: 'martin',
        name: 'Martin Hostel',
        names: { en: 'Martin Hostel' },
        divisionCodes: [],
      },
    ],
  })
  source.details.mockResolvedValue({
    id: 'martin',
    coordinates: [114.21707, 22.216],
    addresses: [],
  })
  const [{ address }] = await searchBuildingNames('Martin', 'en')
  expect(address.overrides).toEqual({})
  expect(getAddressLocale(address, 'en').buildingName).toBe('Martin Hostel')
  const omitted = clearAddressComponent(address, 'buildingName')
  expect(getAddressLocale(omitted, 'en').buildingName).toBeNull()
  expect(
    getAddressLocale(resetAddressComponent(omitted, 'buildingName'), 'en').buildingName,
  ).toBe('Martin Hostel')
  expect(address.source.address2dId).toBeNull()
})

it('bounds partial-name detail requests and reports incomplete coverage', async () => {
  source.names.mockResolvedValue({
    release: 'r1',
    records: Array.from({ length: 60 }, (_, index) => ({
      id: `tower-${index}`,
      name: `Tower ${index}`,
      names: {},
      divisionCodes: [],
    })),
  })
  source.details.mockImplementation(async (id: string) => ({
    id,
    coordinates: [114, 22],
    addresses: [],
  }))
  const limited = vi.fn()
  const result = await searchBuildingNames('Tower', 'en', () => true, {
    coordinates: [114, 22],
    maxDistance: 100,
    candidateLimit: 50,
    onLimited: limited,
  })
  expect(limited).toHaveBeenCalledOnce()
  expect(source.details).toHaveBeenCalledTimes(50)
  expect(result).toHaveLength(50)
})

it('paginates detail reads without splitting alternatives or revisiting previous buildings', async () => {
  const { searchBuildingNamesPage } = await import('../lib/locations/buildingSearch')
  source.names.mockResolvedValue({
    release: 'r1',
    records: Array.from({ length: 23 }, (_, i) => ({
      id: `b${i}`,
      name: `Tower ${i}`,
      names: {},
      divisionCodes: [],
    })),
  })
  source.details.mockImplementation(async (id: string) => ({
    id,
    coordinates: [114, 22],
    addresses: [
      {
        id: `${id}-a`,
        snapshotId: 's',
        display: { en: '1 Test Road' },
        match: 'point-in-footprint',
      },
      {
        id: `${id}-b`,
        snapshotId: 's',
        display: { en: '2 Test Road' },
        match: 'point-in-footprint',
      },
    ],
  }))
  const first = await searchBuildingNamesPage('Tower', 'en')
  expect(first.rows).toHaveLength(20)
  expect(source.details).toHaveBeenCalledTimes(10)
  const second = await searchBuildingNamesPage(
    'Tower',
    'en',
    () => true,
    first.nextCursor!,
  )
  const third = await searchBuildingNamesPage(
    'Tower',
    'en',
    () => true,
    second.nextCursor!,
  )
  expect([
    second.rows.length,
    third.rows.length,
    third.total,
    third.nextCursor,
  ]).toEqual([20, 6, 23, null])
  expect(
    new Set([...first.rows, ...second.rows, ...third.rows].map(row => row.id)).size,
  ).toBe(46)
  expect(source.details).toHaveBeenCalledTimes(23)
  await expect(
    searchBuildingNamesPage('Other', 'en', () => true, first.nextCursor!),
  ).rejects.toMatchObject({ status: 410 })
  source.names.mockResolvedValue({ release: 'r2', records: [] })
  await expect(
    searchBuildingNamesPage('Tower', 'en', () => true, first.nextCursor!),
  ).rejects.toMatchObject({ status: 410 })
})

it('does not turn the combined building title into an undetermined locale', async () => {
  source.names.mockResolvedValue({
    release: 'r1',
    records: [
      {
        id: 'golden',
        name: '金門商業大廈 Golden Gate Commercial Building',
        names: { en: 'Golden Gate Commercial Building', 'zh-Hant': '金門商業大廈' },
        divisionCodes: [],
      },
    ],
  })
  source.details.mockResolvedValue({
    id: 'golden',
    coordinates: [114, 22],
    addresses: [],
  })
  const [row] = await searchBuildingNames('Golden Gate', 'en')
  expect(row.names).toEqual({
    en: 'Golden Gate Commercial Building',
    'zh-hant': '金門商業大廈',
    'zh-hans': '金门商业大厦',
  })
})

it('finds nearby named buildings beyond the initial detail slice', async () => {
  source.names.mockResolvedValue({
    release: 'r1',
    records: Array.from({ length: 45 }, (_, index) => ({
      id: `tower-${index}`,
      name: `Tower ${index}`,
      names: {},
      divisionCodes: [],
    })),
  })
  source.details.mockImplementation(async (id: string) => ({
    id,
    coordinates: id === 'tower-44' ? [114, 22] : [115, 23],
    addresses: [],
  }))
  const result = await searchBuildingNames('Tower', 'en', () => true, {
    coordinates: [114, 22],
    maxDistance: 300,
  })
  expect(result.map(row => row.buildingSource.id)).toEqual(['tower-44'])
})
