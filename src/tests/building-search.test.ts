import { expect, it, vi, afterEach } from 'vitest'
import { getAddressLocale } from '#lib/addresses/featureAddress.js'
import {
  resetAddressComponent,
  clearAddressComponent,
} from '#lib/addresses/addressExpressions.js'
import {
  searchBuildingNames,
  searchBuildingNamesPage,
} from '../lib/locations/buildingSearch'
const source = vi.hoisted(() => ({
  names: vi.fn(),
  details: vi.fn(),
  addresses: vi.fn().mockResolvedValue([]),
}))
vi.mock('#lib/sources/saanseoi.js', () => ({
  loadBuildingNames: source.names,
  loadBuildingDetails: source.details,
  loadBuildingAddresses: source.addresses,
}))
vi.mock('#lib/addresses/nameCatalogue.js', () => ({
  loadAddressNames: vi
    .fn()
    .mockResolvedValue([
      { id: 'street', names: { en: 'Test Road' }, divisionCodes: [] },
    ]),
}))
afterEach(() => {
  vi.clearAllMocks()
  source.addresses.mockReset().mockResolvedValue([])
})
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

it('finds named and unnamed buildings by published street and number without changing name-only matching', async () => {
  source.names.mockResolvedValue({
    release: 'r1',
    records: [
      { id: 'named', name: 'Example House', names: {} },
      { id: 'unnamed', name: null, names: {} },
      { id: 'substation', name: 'Hollywood Road 32 Substation', names: {} },
    ],
  })
  const addresses = [
    {
      id: 'named',
      addresses: [
        {
          id: 'a32',
          snapshotId: 's1',
          display: { en: '32 Hollywood Road', 'zh-Hant': '荷李活道32號' },
          match: 'point-in-footprint',
        },
        {
          id: 'a34',
          snapshotId: 's1',
          display: { en: '34 Hollywood Road', 'zh-Hant': '荷李活道34號' },
          match: 'point-in-footprint',
        },
        {
          id: 'side-street',
          snapshotId: 's1',
          display: { en: '1 Side Street' },
          match: 'point-in-footprint',
        },
      ],
    },
    {
      id: 'unnamed',
      addresses: [
        {
          id: 'a36',
          snapshotId: 's1',
          display: { en: '36 Hollywood Road', 'zh-Hant': '荷李活道36號' },
          match: 'point-in-footprint',
        },
      ],
    },
  ]
  source.addresses.mockResolvedValue(addresses)
  source.details.mockImplementation(async (id: string) => ({
    id,
    coordinates: [114, 22],
    addresses: addresses.find(row => row.id === id)?.addresses ?? [],
  }))

  const page = await searchBuildingNamesPage('hollywood road', 'en')
  expect(page.total).toBe(3)
  expect(page.rows.map(row => row.buildingSource.addressId)).toEqual([
    'a32',
    'a34',
    'a36',
    undefined,
  ])
  expect(source.addresses).toHaveBeenCalledWith('r1')
  expect(page.rows[2].names).toEqual({})
  expect(page.rows[2].address.source.address2dId).toBeNull()
  expect(page.nextCursor).toBeNull()

  const chinese = await searchBuildingNamesPage('荷李活道', 'zhHant')
  expect(chinese.total).toBe(2)
  expect(chinese.rows).toHaveLength(3)
  const numbered = await searchBuildingNamesPage('32 Hollywood Road', 'en')
  expect(numbered.rows.map(row => row.buildingSource.addressId)).toEqual(['a32'])

  source.addresses.mockClear()
  const namesOnly = await searchBuildingNames('Hollywood Road', 'en')
  expect(namesOnly.map(row => row.buildingSource.id)).toEqual(['substation'])
  expect(source.addresses).not.toHaveBeenCalled()
})

it('pages street matches across the whole inventory while bounding detail reads', async () => {
  const records = Array.from({ length: 13 }, (_, index) => ({
    id: `building-${index}`,
    name: null,
    names: {},
  }))
  source.names.mockResolvedValue({ release: 'street-release', records })
  const addresses = records.map((row, index) => ({
    id: row.id,
    addresses: [
      {
        id: `address-${index}`,
        snapshotId: 'snapshot',
        display: { en: `${index + 1} Hollywood Road` },
        match: 'point-in-footprint',
      },
    ],
  }))
  source.addresses.mockResolvedValue(addresses)
  source.details.mockImplementation(async (id: string) => ({
    ...addresses.find(row => row.id === id),
    coordinates: [114, 22],
  }))
  const first = await searchBuildingNamesPage('Hollywood Road', 'en')
  expect(first.total).toBe(13)
  expect(first.rows).toHaveLength(10)
  expect(source.details).toHaveBeenCalledTimes(10)
  if (!first.nextCursor) throw new Error('Expected another page of street matches')
  const second = await searchBuildingNamesPage(
    'Hollywood Road',
    'en',
    () => true,
    first.nextCursor,
  )
  expect(second.rows).toHaveLength(3)
  expect(second.nextCursor).toBeNull()
  expect(new Set([...first.rows, ...second.rows].map(row => row.id)).size).toBe(13)
  expect(source.details).toHaveBeenCalledTimes(13)
})

it('reports unavailable address discovery and discards superseded inventory reads', async () => {
  source.names.mockResolvedValue({ release: 'r1', records: [] })
  source.addresses.mockRejectedValueOnce(new Error('Source release mismatch'))
  await expect(searchBuildingNamesPage('Hollywood Road', 'en')).rejects.toThrow(
    'Source release mismatch',
  )
  let current = true
  source.addresses.mockImplementationOnce(async () => {
    current = false
    return []
  })
  expect(
    (await searchBuildingNamesPage('Hollywood Road', 'en', () => current)).rows,
  ).toEqual([])
  expect(source.details).not.toHaveBeenCalled()
})

it('expires name-only cursors whose offsets refer to a different result set', async () => {
  const cursor = encodeURIComponent(
    JSON.stringify({
      query: 'Hollywood Road',
      locale: 'en',
      release: 'r1',
      offset: 10,
    }),
  )
  await expect(
    searchBuildingNamesPage('Hollywood Road', 'en', () => true, cursor),
  ).rejects.toMatchObject({ status: 410 })
  expect(source.names).not.toHaveBeenCalled()
})
