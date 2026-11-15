import { connectorTravelDirection } from '../lib/indoor/spatial'
import { describe, expect, it } from 'vitest'
import {
  connectorReliefs,
  prepareConnectorReliefs,
} from '../lib/indoor/connectorRelief'
import { stationProjection } from '../lib/indoor/scene'
import {
  collection,
  layerNames,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'

const polygon = (
  id: string,
  category: string,
  x: number,
  y: number,
  w: number,
  h: number,
): IndoorFeature => ({
  type: 'Feature',
  properties: {
    unit_id: id,
    unit_category: category,
    level_id: 'c',
    section_name_en: 'Paid area',
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
      ].map(([a, b]) => [114 + a / 103000, 22 + b / 111320]),
    ],
  },
})
function fixture(): IndoorData {
  const floor = polygon('floor', '', -20, -20, 40, 40)
  floor.properties = { level_id: 'c', level_ordinal: 0 }
  const lower = { ...floor, properties: { level_id: 'p', level_ordinal: -1 } }
  return {
    ...Object.fromEntries(layerNames.map(name => [name, collection([])])),
    retrievedAt: '',
    venue_polygon: collection([floor]),
    level_polygon: collection([floor, lower]),
    unit_polygon: collection([
      polygon('stairs', 'stairs', 0, 0, 10, 2),
      polygon('landing', 'walkway', -4, -2, 4, 6),
      polygon('wall', 'room', 10, -2, 4, 6),
    ]),
    connections: [
      {
        from: 'stairs',
        to: 'lower-stairs',
        fromLevel: 'c',
        toLevel: 'p',
        category: 'stairs',
        enabled: true,
        evidence: 'editor-verified',
      },
    ],
  } as IndoorData
}
describe('connector relief inference', () => {
  it('slopes below the floor from an open paid landing and rejects the room end', () => {
    const data = fixture()
    const projection = stationProjection(data, false, { bearing: 0, tilt: 45 })
    const relief = connectorReliefs(data, projection).get('stairs')
    expect(relief?.descending).toBe(true)
    expect(relief?.surface).not.toBe(projection.path(data.unit_polygon.features[0]))
    expect(relief).toBeDefined()
    if (!relief) return
    // Relief stays shallow and fades away at the flush entrance.
    expect(relief.farEnd[1] - relief.entrance[1]).toBeCloseTo(
      1.8 * Math.sin(Math.PI / 4),
      2,
    )
    expect(relief.depthEdges).toHaveLength(2)
    expect(relief.recessFaces).toHaveLength(3)
    // The entrance remains exactly on the floor while the far end is lowered.
    expect(relief?.surface.split('L')[0]).toBe(
      projection.path(data.unit_polygon.features[0]).split('L')[0],
    )
  })
  it('keeps top-down geometry aligned with the footprint at every bearing', () => {
    const data = fixture()
    for (const bearing of [0, 45, 90, 180]) {
      const projection = stationProjection(data, false, { bearing, tilt: 0 })
      const relief = connectorReliefs(data, projection).get('stairs')
      expect(relief?.surface).toBe(projection.path(data.unit_polygon.features[0]))
      expect(relief?.depthEdges).toEqual([])
    }
  })
  it('keeps only outside depth corners for adjacent descending flights', () => {
    const data = fixture()
    data.unit_polygon.features[1] = polygon('landing', 'walkway', -4, -2, 4, 10)
    data.unit_polygon.features[2] = polygon('wall', 'room', 10, -2, 4, 10)
    data.unit_polygon.features.push(polygon('escalator', 'escalator', 0, 2.2, 10, 2))
    data.connections!.push({
      ...data.connections![0],
      from: 'escalator',
      to: 'lower-escalator',
      category: 'escalator',
    })
    const reliefs = connectorReliefs(
      data,
      stationProjection(data, false, { bearing: 0, tilt: 45 }),
    )
    expect(reliefs.get('stairs')?.depthEdges).toHaveLength(1)
    expect(reliefs.get('escalator')?.depthEdges).toHaveLength(1)
    expect(reliefs.get('stairs')?.recessFaces).toHaveLength(2)
    expect(reliefs.get('escalator')?.recessFaces).toHaveLength(2)
    expect(reliefs.get('stairs')?.bridges).toHaveLength(1)
    expect(reliefs.get('stairs')?.opening).toBe(reliefs.get('escalator')?.opening)
  })
  it('keeps the face beside an incline without an inferred destination', () => {
    const data = fixture()
    data.unit_polygon.features.push(polygon('escalator', 'escalator', 0, 2.8, 10, 2))
    const projection = stationProjection(data, false, { bearing: 0, tilt: 45 })
    const reliefs = connectorReliefs(data, projection)
    expect(reliefs.has('escalator')).toBe(false)
    expect(reliefs.get('stairs')?.recessFaces).toHaveLength(3)
    data.unit_polygon.features[3] = polygon('escalator', 'escalator', 0, 4, 10, 2)
    expect(connectorReliefs(data, projection).get('stairs')?.recessFaces).toHaveLength(
      3,
    )
  })
  it('closes the end of an ascending flight', () => {
    const data = fixture()
    data.level_polygon.features[1].properties.level_ordinal = 1
    const relief = connectorReliefs(
      data,
      stationProjection(data, false, { tilt: 45 }),
    ).get('stairs')
    expect(relief?.descending).toBe(false)
    expect(relief?.recessFaces).toHaveLength(3)
    expect(relief?.recessFaces.every(face => face.endsWith('Z'))).toBe(true)
  })
  it('joins independent inclines at their actual edges, not at floor height', () => {
    const data = fixture()
    data.unit_polygon.features[1] = polygon('landing', 'walkway', -4, -2, 4, 12)
    data.unit_polygon.features[2] = polygon('wall', 'room', 10, -2, 4, 12)
    data.unit_polygon.features.push(polygon('escalator', 'escalator', 0, 2.5, 10, 4))
    data.connections!.push({
      ...data.connections![0],
      from: 'escalator',
      to: 'lower-escalator',
      category: 'escalator',
    })
    const projection = stationProjection(data, false, { bearing: 0, tilt: 45 })
    const reliefs = connectorReliefs(data, projection)
    const stairs = reliefs.get('stairs')!,
      escalator = reliefs.get('escalator')!
    expect(stairs.bridges).toHaveLength(1)
    expect(stairs.farEnd[1] - stairs.entrance[1]).toBeCloseTo(
      escalator.farEnd[1] - escalator.entrance[1],
      6,
    )
    const points = (path: string): number[][] =>
      [...path.matchAll(/[ML]([^ ]+)/g)].map(match =>
        match[1].replace('Z', '').split(',').map(Number),
      )
    const stairRing = (
      data.unit_polygon.features[0].geometry as { coordinates: number[][][] }
    ).coordinates[0]
    const escalatorRing = (
      data.unit_polygon.features[3].geometry as { coordinates: number[][][] }
    ).coordinates[0]
    const edge = (coordinates: number[][]): IndoorFeature => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates },
    })
    const expected = [
      ...points(stairs.line(edge([stairRing[2], stairRing[3]]))),
      ...points(escalator.line(edge([escalatorRing[0], escalatorRing[1]]))),
    ]
    const actual = points(stairs.bridges[0])
    expect(actual).toHaveLength(4)
    for (const point of expected) {
      expect(
        actual.some(
          candidate =>
            Math.hypot(point[0] - candidate[0], point[1] - candidate[1]) < 0.00001,
        ),
      ).toBe(true)
    }
  })
  it('normalizes destination height across flight lengths and widths', () => {
    for (const [length, width] of [
      [6, 1],
      [10, 2],
      [18, 4],
    ]) {
      const data = fixture()
      data.unit_polygon.features[0] = polygon('stairs', 'stairs', 0, 0, length, width)
      data.unit_polygon.features[1] = polygon('landing', 'walkway', -4, -2, 4, 10)
      data.unit_polygon.features[2] = polygon('wall', 'room', length, -2, 4, 10)
      const relief = connectorReliefs(
        data,
        stationProjection(data, false, { bearing: 0, tilt: 45 }),
      ).get('stairs')!
      expect(relief.farEnd[1] - relief.entrance[1]).toBeCloseTo(
        1.8 * Math.sin(Math.PI / 4),
        5,
      )
    }
  })
  it('keeps the far-end wall even when another incline is just beyond it', () => {
    const data = fixture()
    data.unit_polygon.features.push(polygon('nearby-flight', 'stairs', 10.2, 0, 8, 2))
    const relief = connectorReliefs(
      data,
      stationProjection(data, false, { tilt: 45 }),
    ).get('stairs')!
    expect(relief.recessFaces).toHaveLength(3)
  })
  it('closes the uncovered tail when neighbouring flights overlap only partly', () => {
    const data = fixture()
    data.unit_polygon.features[1] = polygon('landing', 'walkway', -4, -2, 6, 12)
    data.unit_polygon.features[2] = polygon('wall', 'room', 10, -2, 4, 12)
    data.unit_polygon.features.push(polygon('escalator', 'escalator', 2, 2.5, 8, 2))
    data.connections!.push({
      ...data.connections![0],
      from: 'escalator',
      to: 'lower-escalator',
      category: 'escalator',
    })
    const reliefs = connectorReliefs(
      data,
      stationProjection(data, false, { bearing: 0, tilt: 45 }),
    )
    expect(reliefs.get('stairs')?.bridges).toHaveLength(1)
    expect(reliefs.get('stairs')?.recessFaces).toHaveLength(3)
  })
  it('keeps equal wall elevations equally shaded across bearings and split tails', () => {
    const data = fixture()
    data.unit_polygon.features[1] = polygon('landing', 'walkway', -4, -2, 6, 12)
    data.unit_polygon.features[2] = polygon('wall', 'room', 10, -2, 4, 12)
    data.unit_polygon.features.push(polygon('escalator', 'escalator', 2, 2.5, 8, 2))
    data.connections!.push({
      ...data.connections![0],
      from: 'escalator',
      to: 'lower-escalator',
    })
    for (const bearing of [30, 120, 210, 300]) {
      const projection = stationProjection(data, false, { bearing, tilt: 45 })
      for (const relief of connectorReliefs(data, projection).values()) {
        relief.visibleFaces.forEach((face, index) => {
          const points = [...face.matchAll(/[ML]([-\d.e]+),([-\d.e]+)/g)].map(match => [
            Number(match[1]),
            Number(match[2]),
          ])
          const { upper, lower } = relief.faceLighting[index]
          const dx = lower[0] - upper[0],
            dy = lower[1] - upper[1]
          const depth = (point: number[]): number =>
            ((point[0] - upper[0]) * dx + (point[1] - upper[1]) * dy) /
            (dx * dx + dy * dy)
          // Every fragment uses the full 1.8 m range, even a tiny uncovered tail.
          for (const point of points.slice(0, 2)) {
            expect(depth(point)).toBeCloseTo(0, 6)
            expect(
              depth([point[0], point[1] + 1.8 * Math.sin(Math.PI / 4)]),
            ).toBeCloseTo(1, 6)
          }
        })
      }
    }
  })
  it('uses reviewed operating direction rather than connection height for travel arrows', () => {
    const link = {
      from: 'a',
      to: 'b',
      fromLevel: 'c',
      toLevel: 'p',
      category: 'escalator',
      evidence: 'editor-verified' as const,
      direction: 'forward' as const,
    }
    expect(connectorTravelDirection('a', [link])).toBe('depart')
    expect(connectorTravelDirection('b', [link])).toBe('arrive')
    expect(connectorTravelDirection('a', [{ ...link, direction: 'both' }])).toBe('both')
    expect(connectorTravelDirection('a', [{ ...link, direction: null }])).toBeNull()
    expect(
      connectorTravelDirection('a', [{ ...link, evidence: 'aligned-footprints' }]),
    ).toBeNull()
  })
  it('keeps equally accessible landings flat', () => {
    const data = fixture()
    data.unit_polygon.features[2] = polygon('other-landing', 'walkway', 10, -2, 4, 6)
    expect(connectorReliefs(data, stationProjection(data, false)).size).toBe(0)
  })
  it('does not invent a destination or slope artwork coordinates', () => {
    const data = fixture()
    data.connections = []
    expect(connectorReliefs(data, stationProjection(data, false)).size).toBe(0)
    const image = fixture()
    image.coordinateSpace = 'image-pixels'
    expect(connectorReliefs(image, stationProjection(image, false)).size).toBe(0)
  })
})

it('reuses source inference without changing relief or earlier frame callbacks', () => {
  const data = fixture()
  const render = prepareConnectorReliefs(data)
  const firstCamera = stationProjection(data, true, { bearing: -115, tilt: 60 })
  const secondCamera = stationProjection(data, true, { bearing: 45, tilt: 30 })
  const first = render(firstCamera)
  const unit = data.unit_polygon.features[0]
  const firstLine = first.get('stairs')?.line(unit)
  const second = render(secondCamera)
  const fresh = connectorReliefs(data, secondCamera)
  expect([...second.keys()]).toEqual([...fresh.keys()])
  for (const [id, relief] of second) {
    const { line, ...geometry } = relief
    const { line: freshLine, ...freshGeometry } = fresh.get(id)!
    expect(geometry).toEqual(freshGeometry)
    expect(line(unit)).toBe(freshLine(unit))
  }
  expect(first.get('stairs')?.line(unit)).toBe(firstLine)
})

it('culls the hidden faces of raised flights as the camera rotates', () => {
  const data = fixture()
  data.level_polygon.features[1].properties.level_ordinal = 1
  for (const bearing of [30, 120, 210, 300]) {
    const relief = connectorReliefs(
      data,
      stationProjection(data, false, { bearing, tilt: 45 }),
    ).get('stairs')!
    expect(relief.visibleFaces.length).toBeGreaterThan(0)
    expect(relief.visibleFaces.length).toBeLessThan(relief.recessFaces.length)
    for (const face of relief.visibleFaces) expect(relief.recessFaces).toContain(face)
  }
})
