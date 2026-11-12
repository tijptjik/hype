import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emptyFeatureAddress } from '#lib/addresses/featureAddress.js'
import {
  suggestAddressBuildings,
  buildingHasAddress,
} from '#lib/locations/buildingSuggestions.js'
import {
  loadBuildingDetails,
  loadBuildingNames,
  loadBuildingPoints,
} from '#lib/sources/saanseoi.js'
vi.mock('#lib/sources/saanseoi.js', () => ({
  loadBuildingNames: vi.fn(),
  loadBuildingPoints: vi.fn(),
  loadBuildingDetails: vi.fn(),
}))
vi.mock('#lib/addresses/nameCatalogue.js', () => ({
  loadAddressNames: async () => [
    {
      id: 'street-1',
      name: 'Hollywood Road',
      names: { en: 'Hollywood Road' },
      divisionCodes: [],
    },
  ],
}))
const address = () => ({
  ...emptyFeatureAddress(),
  coordinates: [114.15, 22.3] as [number, number],
  overrides: { en: { streetName: 'Hollywood Road', buildingNumberExpression: '208' } },
})
beforeEach(() => {
  vi.mocked(loadBuildingNames).mockResolvedValue({ release: 'r1', records: [] })
  vi.mocked(loadBuildingPoints).mockResolvedValue([
    { id: 'near', coordinates: [114.1501, 22.3] },
    { id: 'outside-fallback', coordinates: [114.1506, 22.3] },
    { id: 'far', coordinates: [114.16, 22.3] },
  ])
  vi.mocked(loadBuildingDetails).mockImplementation(async id => ({
    id,
    coordinates: id === 'near' ? [114.1501, 22.3] : [114.1506, 22.3],
    addresses: [],
  }))
})
describe('building suggestions', () => {
  it('includes unnamed nearby buildings and excludes points outside the fallback radius', async () => {
    const result = await suggestAddressBuildings(address(), 'en', () => true)
    expect(result.exact).toBe(false)
    expect(result.rows.map(row => row.buildingSource.id)).toEqual(['near'])
    expect(loadBuildingDetails).not.toHaveBeenCalledWith('far', expect.anything())
  })
  it('prefers a canonical address match over a closer unrelated building', async () => {
    vi.mocked(loadBuildingDetails).mockImplementation(async id => ({
      id,
      coordinates: id === 'near' ? [114.1501, 22.3] : [114.1506, 22.3],
      addresses:
        id === 'near'
          ? []
          : [
              {
                id: 'address-208',
                snapshotId: 's1',
                display: { en: '208 Hollywood Road' },
                match: 'point-in-footprint',
              },
            ],
    }))
    const input = address()
    input.source.address2dId = 'address-208'
    input.overrides = {} as typeof input.overrides
    const result = await suggestAddressBuildings(input, 'en', () => true)
    expect(result.exact).toBe(true)
    expect(result.rows.map(row => row.buildingSource.id)).toEqual(['outside-fallback'])
  })
  it('matches street and number without a canonical ID', async () => {
    vi.mocked(loadBuildingDetails).mockImplementation(async id => ({
      id,
      coordinates: [114.1501, 22.3],
      addresses: [
        {
          id: 'address-208',
          snapshotId: 's1',
          display: { en: '208 Hollywood Road' },
          match: 'point-in-footprint',
        },
      ],
    }))
    const result = await suggestAddressBuildings(address(), 'en', () => true)
    expect(result.exact).toBe(true)
  })
  it('does not let a retained source ID override an edited street number', () => {
    const input = address()
    input.source.address2dId = 'same-id'
    const other = address()
    other.overrides.en.buildingNumberExpression = '210'
    expect(
      buildingHasAddress(input, {
        id: 'building',
        kind: 'building',
        names: {},
        address: other,
        buildingSource: { id: 'building', release: 'r1', addressId: 'same-id' },
      }),
    ).toBe(false)
  })
  it('never treats proximity or a street without a number as an address match', () => {
    const input = address()
    const candidate = {
      id: 'near',
      kind: 'building' as const,
      names: {},
      address: { ...address(), overrides: { en: { streetName: 'Hollywood Road' } } },
      buildingSource: { id: 'near', release: 'r1' },
    }
    expect(buildingHasAddress(input, candidate)).toBe(false)
  })
  it('surfaces source failure instead of reporting no matches', async () => {
    vi.mocked(loadBuildingPoints).mockRejectedValue(new Error('source offline'))
    await expect(suggestAddressBuildings(address(), 'en', () => true)).rejects.toThrow(
      'source offline',
    )
  })
})
