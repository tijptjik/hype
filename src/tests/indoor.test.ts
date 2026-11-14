import { describe, expect, it } from 'vitest'
import {
  bounds,
  collection,
  layerNames,
  matches,
  places,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'
const feature = (properties: Record<string, unknown>): IndoorFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [114.128, 22.281] },
  properties,
})
function dataset(): IndoorData {
  return {
    ...Object.fromEntries(layerNames.map(name => [name, collection([])])),
    retrievedAt: '2026-11-14T00:00:00Z',
  } as IndoorData
}
describe('indoor identities', () => {
  it('joins by unit ID, preserves multiple occupants and leaves missing codes unknown', () => {
    const data = dataset()
    data.unit_polygon = collection([
      feature({ unit_id: 'a', level_id: 'c', unit_name_en: 'KET 3' }),
      feature({ unit_id: 'b', level_id: 'c', unit_name_en: '7-Eleven' }),
      feature({ unit_id: 'd', level_id: 'c', unit_name_en: 'KET 9' }),
    ])
    data.occupant_point = collection([
      feature({ unit_id: 'a', occupant_name_en: '7-Eleven' }),
      feature({ unit_id: 'b', occupant_name_en: '7-Eleven' }),
      feature({ unit_id: 'd', occupant_name_en: 'KET 9' }),
      feature({ unit_id: 'd', occupant_name_en: 'Original Taste Workshop' }),
    ])
    const result = places(data)
    expect(result).toHaveLength(3)
    expect(result.find(p => p.id === 'a')?.code).toBe('KET 3')
    expect(result.find(p => p.id === 'b')?.code).toBe('')
    expect(result.find(p => p.id === 'd')?.occupants).toHaveLength(2)
    const ket3 = result.find(p => p.id === 'a')
    if (!ket3) throw new Error('Missing KET 3')
    expect(matches(ket3, 'ket3')).toBe(true)
    expect(matches(ket3, '7 eleven')).toBe(true)
  })
  it('finds source elevators when searching for a lift', () => {
    const data = dataset()
    data.amenity_point = collection([
      feature({
        amenity_id: 'lift-a',
        level_id: 'c',
        amenity_category: 'elevator',
        amenity_name_en: 'Elevator',
      }),
    ])
    const lift = places(data)[0]
    if (!lift) throw new Error('Missing elevator')
    expect(matches(lift, 'lift')).toBe(true)
  })
  it('calculates longitude/latitude bounds from geometry, not reversed source bbox', () => {
    const f: IndoorFeature = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [115, 22],
            [115, 23],
            [114, 22],
          ],
        ],
      },
      properties: { bbox: [22, 114, 23, 115] },
    }
    expect(bounds(f)).toEqual([114, 22, 115, 23])
  })
})

import {
  accessArea,
  connectionCandidates,
  displayCollection,
  levelOffsets,
} from '../lib/indoor/spatial'
function connector(
  id: string,
  level: string,
  height: number,
  area = 'Unpaid area',
): IndoorFeature {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [114, 22],
          [114.0001, 22],
          [114.0001, 22.0001],
          [114, 22.0001],
          [114, 22],
        ],
      ],
    },
    properties: {
      unit_id: id,
      level_id: level,
      level_z_value: height,
      unit_category: 'elevator',
      section_name_en: area,
    },
  }
}
describe('indoor spatial presentation', () => {
  it('requires different levels, the same area and an unambiguous mutual overlap', () => {
    const data = dataset()
    data.unit_polygon = collection([
      connector('low', 'c', 1),
      connector('high', 'g', 12),
    ])
    expect(connectionCandidates(data)).toHaveLength(1)
    data.unit_polygon.features.push(connector('ambiguous', 'g', 12))
    expect(connectionCandidates(data)).toHaveLength(0)
    data.unit_polygon = collection([
      connector('low', 'c', 1),
      connector('paid', 'g', 12, 'Paid area'),
    ])
    expect(connectionCandidates(data)).toHaveLength(0)
    data.unit_polygon = collection([
      connector('low', 'c', 1),
      connector('same-floor', 'c', 1),
    ])
    expect(connectionCandidates(data)).toHaveLength(0)
  })
  it('keeps entrance levels together without mutating geographic source geometry', () => {
    const data = dataset()
    data.level_polygon = collection([
      feature({ level_id: 'c', level_ordinal: -2 }),
      feature({ level_id: 'a', level_ordinal: 0 }),
      feature({ level_id: 'b', level_ordinal: 0 }),
    ])
    const offsets = levelOffsets(data)
    expect(offsets.get('a')).toBe(offsets.get('b'))
    const original = JSON.stringify(data.level_polygon)
    const displayed = displayCollection(data.level_polygon, offsets, true)
    expect(displayed.features[1]?.geometry).not.toEqual(
      data.level_polygon.features[1]?.geometry,
    )
    expect(JSON.stringify(data.level_polygon)).toBe(original)
    expect(accessArea(feature({}))).toBe('Unknown')
    expect(accessArea(feature({ section_name_en: 'Paid area' }))).toBe('Paid area')
  })
})

import { footprintFrame, brandFootprint } from '../lib/indoor/geometry'
import { stairTreads } from '../lib/indoor/spatial'
describe('station drawing geometry', () => {
  it('clips stair treads inside a skewed footprint and separates escalator rails', () => {
    const data = dataset()
    const stairs = connector('stairs', 'c', 1)
    stairs.properties.unit_category = 'stairs'
    stairs.geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [114, 22],
          [114.0002, 22.0001],
          [114.00018, 22.00014],
          [113.99998, 22.00004],
          [114, 22],
        ],
      ],
    }
    data.unit_polygon = collection([stairs])
    const original = JSON.stringify(stairs)
    const treadLines = stairTreads(data)
    expect(treadLines.features.length).toBeGreaterThan(5)
    // Every endpoint must be inside the source polygon, not merely its bbox.
    const ring = stairs.geometry.coordinates[0]
    const inside = ([x, y]: number[]) => {
      let result = false
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i],
          b = ring[j]
        if (
          a[1] > y !== b[1] > y &&
          x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
        )
          result = !result
      }
      return result
    }
    for (const line of treadLines.features)
      if (line.geometry.type === 'LineString')
        for (const p of line.geometry.coordinates) expect(inside(p)).toBe(true)
    expect(JSON.stringify(stairs)).toBe(original)
    stairs.properties.unit_category = 'escalator'
    expect(stairTreads(data).features).toHaveLength(4)
    expect(brandFootprint(stairs)?.every(inside)).toBe(true)
    expect(footprintFrame(stairs)).not.toBeNull()
  })
})

import { premisesPath, searchStations, stations } from '../lib/indoor/registry'
import { readFileSync } from 'node:fs'
import { stationProjection } from '../lib/indoor/scene'
describe('premises navigation and logos', () => {
  it('searches all official stations by name, Chinese name and code', () => {
    expect(stations).toHaveLength(98)
    for (const term of ['Kennedy Town', 'KET', '堅尼地城'])
      expect(searchStations(term).some(s => s.id === 'KET')).toBe(true)
    expect(premisesPath('KET', 'unit-id')).toBe('/premises/mtr-ket/places/unit-id')
  })
  it('retains every source unit as a distinct selectable space', () => {
    const data = dataset()
    data.unit_polygon = collection([
      feature({ unit_id: 'empty-room', level_id: 'c', unit_category: 'room' }),
    ])
    expect(places(data)[0]).toMatchObject({ id: 'empty-room', name: { en: 'room' } })
  })
})

it('keeps real shop logos upright and unmirrored in both projections', () => {
  const data = dataset()
  for (const layer of layerNames)
    data[layer] = JSON.parse(
      readFileSync(`static/indoor/kennedy-town/${layer}.json`, 'utf8'),
    )
  const shops = places(data).filter(p => p.name.en === '7-Eleven')
  expect(shops).toHaveLength(2)
  for (const exploded of [false, true])
    for (const shop of shops) {
      const matrix = stationProjection(data, exploded).logo(shop.feature)
      const [a, b, c, d] = matrix.slice(7, -1).split(' ').map(Number)
      expect(a * d - b * c).toBeGreaterThan(0)
      expect(a).toBeGreaterThan(0)
    }
})

it('keeps distinct lift identities and restores the reviewed Exit B continuation', () => {
  const data = dataset()
  for (const layer of layerNames)
    data[layer] = JSON.parse(
      readFileSync(`static/indoor/kennedy-town/${layer}.json`, 'utf8'),
    )
  const links = connectionCandidates(data)
  expect(links.filter(c => c.evidence === 'matching-lift-code')).toHaveLength(4)
  expect(links.find(c => c.evidence === 'reviewed-layout')).toMatchObject({
    from: 'c1769bda-5a37-4043-bbf0-4d3352bb9841',
    to: '5dc92c22-09a9-46ff-a049-4f7e4c438a5a',
  })
  const floor = data.level_polygon.features
  const normal = stationProjection(data, true)
  const wide = stationProjection(data, true, { spacing: 65 })
  expect(normal.box(floor)[3]).toBeLessThan(wide.box(floor)[3])
  const rotated = stationProjection(data, true, { bearing: 90 })
  expect(rotated.path(floor[0])).not.toBe(normal.path(floor[0]))
})
