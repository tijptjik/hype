// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { geocodeBuilding } from '#lib/api/external/buildingGeocoding.js'
import {
  containsBuildingPoint,
  selectBuilding,
  buildingAt,
  type SelectedBuilding,
} from '#lib/map/buildingAddress.js'

const pin = { lng: 114.15, lat: 22.285 }
const building: SelectedBuilding = {
  id: 'osm:42',
  source: 'hongkong-latest',
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [114.1499, 22.2849],
        [114.1501, 22.2849],
        [114.1501, 22.2851],
        [114.1499, 22.2851],
        [114.1499, 22.2849],
      ],
    ],
  },
  properties: {
    kind: 'building',
    addr_housenumber: '22-24',
    addr_street: 'Possession Street',
    addr_street_zh: '水坑口街',
  },
}
const body = (type = 'within_footprint', status = 'resolved') => ({
  data: [
    {
      type: 'geocoding-results',
      attributes: { status, match: { type, distanceMetres: 12 } },
      relationships: { address: { data: [{ type: 'addresses', id: 'als-22-24' }] } },
    },
  ],
  included: [
    {
      type: 'addresses',
      id: 'als-22-24',
      attributes: { i18n: { en: { formattedAddress: '22-24 POSSESSION STREET, HK' } } },
    },
  ],
})

describe('building address selection', () => {
  it('uses the full source number range with no reverse lookup and retains the pin and building ID', async () => {
    const fetcher = vi.fn()
    const result = await geocodeBuilding(pin, building, { fetcher })
    expect(fetcher).not.toHaveBeenCalled()
    expect(result?.i18n.en.displayAddress).toBe('22-24 Possession Street')
    expect(result?.i18n.zhHant.displayAddress).toContain('水坑口街')
    expect(result?.addressMeta).toMatchObject({
      longitude: pin.lng,
      latitude: pin.lat,
      buildingSourceId: 'osm:42',
      addressMatch: 'building_address',
    })
  })
  it('does not infer a street from a number alone and constrains the ALS fallback', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(body()))
    const selected = { ...building, properties: { addr_housenumber: '22-24' } }
    const result = await geocodeBuilding(pin, selected, { fetcher })
    const url = fetcher.mock.calls[0][0] as URL
    expect(JSON.parse(url.searchParams.get('footprint')!)).toEqual(building.geometry)
    expect(result?.addressMeta).toMatchObject({
      buildingSourceId: building.id,
      addressMatch: 'within_footprint',
    })
  })
  it('does not accept ambiguous or unconstrained fallback responses', async () => {
    for (const response of [
      body('nearest'),
      body('within_footprint', 'ambiguous'),
      { data: [] },
    ]) {
      const fetcher = vi.fn().mockResolvedValue(Response.json(response))
      expect(
        await geocodeBuilding(pin, { ...building, properties: {} }, { fetcher }),
      ).toBeNull()
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })
  it('marks outdoor nearest-point results as approximate', async () => {
    const result = await geocodeBuilding(pin, null, {
      fetcher: vi.fn().mockResolvedValue(Response.json(body('nearest'))),
    })
    expect(result?.addressMeta.addressMatch).toBe('nearest')
  })
  it('ignores courtyard interiors and rejects overlapping independent buildings', () => {
    const hole = [
      [114.14995, 22.28495],
      [114.15005, 22.28495],
      [114.15005, 22.28505],
      [114.14995, 22.28505],
      [114.14995, 22.28495],
    ]
    expect(
      containsBuildingPoint([pin.lng, pin.lat], {
        type: 'Polygon',
        coordinates: [...(building.geometry.coordinates as number[][][]), hole],
      }),
    ).toBe(false)
    const feature = {
      id: 42,
      source: building.source,
      sourceLayer: 'buildings',
      properties: building.properties,
      geometry: building.geometry,
    }
    expect(selectBuilding([feature, feature] as never, [pin.lng, pin.lat])?.id).toBe(
      '42',
    )
    expect(() =>
      selectBuilding([feature, { ...feature, id: 43 }] as never, [pin.lng, pin.lat]),
    ).toThrow('More than one')
  })
  it('uses source polygons in outline-only styles rather than hit-testing the outline', async () => {
    const query = vi.fn().mockReturnValue([
      {
        id: 42,
        source: building.source,
        sourceLayer: 'buildings',
        properties: building.properties,
        geometry: building.geometry,
      },
    ])
    const map = {
      getZoom: () => 19,
      areTilesLoaded: () => true,
      getStyle: () => ({
        layers: [
          {
            id: 'outline',
            type: 'line',
            source: building.source,
            'source-layer': 'buildings',
          },
        ],
      }),
      querySourceFeatures: query,
    }
    expect((await buildingAt(map as never, [pin.lng, pin.lat]))?.id).toBe('42')
    expect(query).toHaveBeenCalledWith(building.source, {
      sourceLayer: 'buildings',
      filter: ['==', 'kind', 'building'],
    })
  })
})
