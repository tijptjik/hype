import { describe, expect, it } from 'vitest'
import { exposedIndoorPlaces, exposedIndoorUnits } from '../lib/indoor/exposure'
import {
  collection,
  places,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'

function rectangle(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  level = 'one',
): IndoorFeature {
  return {
    type: 'Feature',
    properties: {
      unit_id: id,
      level_id: level,
      unit_category: 'room',
      unit_name_en: id,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + w, y],
          [x + w, y + h],
          [x, y + h],
          [x, y],
        ],
      ],
    },
  }
}
function snapshot(units: IndoorFeature[]): IndoorData {
  return {
    unit_polygon: collection(units),
    amenity_point: collection([]),
    occupant_point: collection([]),
    level_polygon: collection([]),
    venue_polygon: collection([]),
    opening_line: collection([]),
    retrievedAt: '',
  }
}
describe('exposed indoor destinations', () => {
  it('removes a polygon covered by the union of later units, without changing source geometry', () => {
    const data = snapshot([
      rectangle('covered', 0, 0, 2, 2),
      rectangle('left', 0, 0, 1, 2),
      rectangle('right', 1, 0, 1, 2),
    ])
    const original = JSON.stringify(data)
    expect([...exposedIndoorUnits(data).keys()]).toEqual(['left', 'right'])
    expect(exposedIndoorPlaces(data, places(data)).map(p => p.id)).toEqual([
      'left',
      'right',
    ])
    expect(JSON.stringify(data)).toBe(original)
  })
  it('keeps partial exposure and excludes covered regions from click geometry', () => {
    const data = snapshot([
      rectangle('partial', 0, 0, 2, 2),
      rectangle('top', 1, 0, 2, 2),
    ])
    const shape = exposedIndoorUnits(data).get('partial')
    expect(shape?.geometry).toEqual({
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [1, 0],
            [1, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      ],
    })
  })
  it('respects holes, other floors, and point amenities', () => {
    const cover = rectangle('cover', 0, 0, 4, 4)
    if (cover.geometry.type === 'Polygon')
      cover.geometry.coordinates.push([
        [1, 1],
        [1, 3],
        [3, 3],
        [3, 1],
        [1, 1],
      ])
    const data = snapshot([
      rectangle('through-hole', 1, 1, 2, 2),
      cover,
      rectangle('other-floor', 0, 0, 4, 4, 'two'),
    ])
    data.amenity_point.features.push({
      type: 'Feature',
      properties: {
        amenity_id: 'point',
        level_id: 'one',
        unit_id: 'cover',
        amenity_category: 'information',
      },
      geometry: { type: 'Point', coordinates: [0.5, 0.5] },
    })
    expect(
      exposedIndoorPlaces(data, places(data))
        .map(p => p.id)
        .sort(),
    ).toEqual(['cover', 'other-floor', 'point', 'through-hole'])
  })
  it('omits duplicate schematic hotspots that the renderer does not paint', () => {
    const blank = rectangle('blank', 0, 0, 2, 2)
    const tenant = rectangle('tenant', 0, 0, 2, 2)
    blank.properties.source_shop_id = 'shop_'
    tenant.properties.source_shop_id = 'shop_1'
    blank.properties.source_coords = tenant.properties.source_coords = 'same-footprint'
    const data = snapshot([tenant, blank])
    data.coordinateSpace = 'image-pixels'
    expect(exposedIndoorPlaces(data, places(data)).map(p => p.id)).toEqual(['tenant'])
  })
})
