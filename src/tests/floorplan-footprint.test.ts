// @vitest-environment node
import { expect, it } from 'vitest'
import { footprintFloorplan } from '#lib/indoor/floorplans/footprint.js'
import { floorplanBundle } from '#lib/indoor/floorplans/extraction.js'
import { contains } from '#lib/indoor/navigation/geometry.js'
import kaiKingMansion from '../../docs/maps/ura-kc-017/extractions/kai-king-mansion.json'
import type { ExteriorFootprint } from '#lib/locations/exterior/footprints.server.js'

const feature: ExteriorFootprint = {
  type: 'Feature',
  properties: {
    csuid: 'test-building',
    name: '<script>not markup</script>',
    nameZh: '',
    geoRef: 'test',
  },
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [114.001, 22],
        [114.001, 22.001],
        [114, 22.001],
        [114, 22],
      ],
      [
        [114.0002, 22.0002],
        [114.0004, 22.0002],
        [114.0004, 22.0004],
        [114.0002, 22.0004],
        [114.0002, 22.0002],
      ],
    ],
  },
}
it('retains courtyards and north-up proportions without inventing rooms or floors', () => {
  const result = footprintFloorplan(feature, 0, 'Ground floor')
  const floor = result.extraction.floors[0]
  expect(result.extraction.floors).toHaveLength(1)
  expect(floor.label).toBe('Ground floor')
  expect(floor.holes).toHaveLength(1)
  expect(floor.units).toEqual([])
  expect(floor.locationId).toBeUndefined()
  expect(floor.boundary[0][1]).toBeGreaterThan(floor.boundary[3][1])
  expect(
    (floor.boundary[1][0] - floor.boundary[0][0]) /
      (floor.boundary[0][1] - floor.boundary[3][1]),
  ).toBeCloseTo(Math.cos((22 * Math.PI) / 180), 4)
  expect(result.source.feature).toEqual(feature)
  expect(result.source.metresPerPixel).toBeGreaterThan(0)
  expect(result.image).not.toContain('<script>')
  const bundle = floorplanBundle(result.extraction)
  expect(bundle.data.level_polygon.features[0].geometry).toMatchObject({
    type: 'Polygon',
    coordinates: expect.any(Array),
  })
  expect(bundle.data.unit_polygon.features).toHaveLength(1)
  expect(bundle.data.unit_polygon.features[0].properties.unit_category).toBe('unknown')
  expect(bundle.data.connections).toEqual([])
})
it('retains seven independently addressable empty Kai King floors in one XY frame', () => {
  const { data } = floorplanBundle(kaiKingMansion)
  const floors = data.level_polygon.features
  expect(floors.map(floor => floor.properties.level_name_en)).toEqual([
    'G/F',
    'Mezzanine',
    '1/F',
    '2/F',
    '3/F',
    '4/F',
    '5/F',
  ])
  expect(new Set(floors.map(floor => floor.properties.level_id)).size).toBe(7)
  for (const floor of floors) {
    expect(floor.geometry).toEqual(floors[0].geometry)
    expect(contains([420, 480], floor)).toBe(true)
    expect(contains([-1, -1], floor)).toBe(false)
  }
  expect(data.unit_polygon.features).toEqual([])
  expect(data.connections).toEqual([])
})
it('uses only the explicitly selected part of a multipart footprint', () => {
  const polygon =
    feature.geometry.type === 'Polygon' ? feature.geometry.coordinates : []
  const other = polygon.map(ring => ring.map(([x, y]) => [x + 0.002, y]))
  const multiple: ExteriorFootprint = {
    ...feature,
    geometry: { type: 'MultiPolygon', coordinates: [polygon, other] },
  }
  const result = footprintFloorplan(multiple, 1, '1/F')
  expect(result.source.polygonIndex).toBe(1)
  expect(result.extraction.floors).toHaveLength(1)
  expect(() => footprintFloorplan(multiple, 2, '1/F')).toThrow()
})
it('rejects invalid coordinates, crossed outlines, and unnamed floors', () => {
  expect(() => footprintFloorplan(feature, 0, ' ')).toThrow()
  const invalid = structuredClone(feature)
  invalid.geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [NaN, 22],
        [114, 22],
        [114, 23],
        [NaN, 22],
      ],
    ],
  }
  expect(() => footprintFloorplan(invalid, 0, 'G/F')).toThrow()
  invalid.geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [114.001, 22.001],
        [114.001, 22],
        [114, 22.001],
        [114, 22],
      ],
    ],
  }
  expect(() => footprintFloorplan(invalid, 0, 'G/F')).toThrow()
})
