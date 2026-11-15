import { describe, expect, it } from 'vitest'
import { collection, type IndoorData, type IndoorFeature } from '../lib/indoor/model'
import {
  nearestEntranceSide,
  nextConnectionDirection,
  setConnectionDirection,
  connectionAnchor,
  createEditorConnection,
  suggestConnectionFloor,
} from '../lib/indoor/connectionEditor'

function polygon(
  id: string,
  level: string,
  z: number,
  x = 0,
  category?: string,
): IndoorFeature {
  return {
    type: 'Feature',
    properties: {
      unit_id: id,
      level_id: level,
      level_z_value: z,
      unit_category: category,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, 0],
          [x + 10, 0],
          [x + 10, 10],
          [x, 10],
          [x, 0],
        ],
      ],
    },
  }
}
function map(): IndoorData {
  return {
    retrievedAt: '',
    venue_polygon: collection([polygon('venue', 'a', 0)]),
    level_polygon: collection([
      polygon('a', 'a', 0),
      polygon('b', 'b', 3),
      polygon('c', 'c', 8),
      polygon('remote', 'remote', 1, 50),
    ]),
    unit_polygon: collection([
      polygon('left', 'a', 0, 0, 'escalator'),
      polygon('right', 'b', 3, 0, 'escalator'),
      polygon('upper', 'c', 8, 0, 'escalator'),
    ]),
    opening_line: collection([]),
    amenity_point: collection([]),
    occupant_point: collection([]),
  }
}
describe('paired connection editor', () => {
  it('suggests the nearest covering floor, excluding the current and non-overlapping floors', () => {
    const data = map()
    expect(
      suggestConnectionFloor(data, 'a', [5, 5], data.unit_polygon.features[0]),
    ).toBe('b')
    expect(suggestConnectionFloor(data, 'a', [100, 100])).toBe('')
  })
  it('does not suggest a floor whose hole contains the selected coordinate', () => {
    const data = map()
    data.unit_polygon = collection([])
    const floor = data.level_polygon.features[1]
    if (floor.geometry.type === 'Polygon')
      floor.geometry.coordinates.push([
        [2, 2],
        [8, 2],
        [8, 8],
        [2, 8],
        [2, 2],
      ])
    expect(suggestConnectionFloor(data, 'a', [5, 5])).toBe('c')
  })
  it('prefers a recorded destination without inventing travel direction', () => {
    const data = map()
    const connection = createEditorConnection(
      data.unit_polygon.features[0],
      data.unit_polygon.features[2],
      'unknown',
    )
    expect(
      suggestConnectionFloor(data, 'a', [5, 5], data.unit_polygon.features[0], [
        connection,
      ]),
    ).toBe('c')
    expect(connection.direction).toBeNull()
  })
  it('represents right-to-left travel by reversing endpoints', () => {
    const data = map()
    const connection = createEditorConnection(
      data.unit_polygon.features[0],
      data.unit_polygon.features[1],
      'reverse',
    )
    expect(connection).toMatchObject({
      from: 'right',
      to: 'left',
      fromLevel: 'b',
      toLevel: 'a',
      direction: 'forward',
    })
  })
  it('uses an interior anchor rather than the bounding-box centre of concave geometry', () => {
    const unit = polygon('l', 'a', 0)
    unit.geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 2],
          [2, 2],
          [2, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    }
    const anchor = connectionAnchor(unit)
    expect(anchor[0] < 2 || anchor[1] < 2).toBe(true)
  })
})

describe('published change summaries', () => {
  it('ignores publication evidence but reports travel direction changes', async () => {
    const { publicationChanges } = await import('../lib/indoor/publicationChanges')
    const data = map()
    const pair = createEditorConnection(
      data.unit_polygon.features[0],
      data.unit_polygon.features[1],
      'both',
    )
    const previous = {
      schemaVersion: 1 as const,
      data: { ...data, connections: [pair] },
      documents: [],
    }
    const current = structuredClone(previous)
    current.data.connections[0].evidence = 'editor-verified'
    expect(publicationChanges(current, previous)).toEqual([])
    current.data.connections[0].direction = 'forward'
    expect(publicationChanges(current, previous)).toHaveLength(1)
  })
})

describe('direct connection controls', () => {
  it('cycles both, forward, reverse, unknown and back to both', () => {
    expect(
      ['both', 'forward', 'reverse', 'unknown'].map(direction =>
        nextConnectionDirection(
          direction as 'both' | 'forward' | 'reverse' | 'unknown',
        ),
      ),
    ).toEqual(['forward', 'reverse', 'unknown', 'both'])
  })
  it('preserves physical entrances and metadata when reversing travel', () => {
    const data = map()
    const original = {
      ...createEditorConnection(
        data.unit_polygon.features[0],
        data.unit_polygon.features[1],
        'both',
      ),
      fromEntrance: { polygonIndex: 0, edgeIndex: 1 },
      toEntrance: { polygonIndex: 0, edgeIndex: 3 },
      enabled: false,
    }
    const reversed = setConnectionDirection(original, 'left', 'reverse')
    expect(reversed).toMatchObject({
      from: 'right',
      to: 'left',
      fromLevel: 'b',
      toLevel: 'a',
      fromEntrance: original.toEntrance,
      toEntrance: original.fromEntrance,
      enabled: false,
      evidence: original.evidence,
      direction: 'forward',
    })
    expect(setConnectionDirection(reversed, 'left', 'forward')).toEqual({
      ...original,
      direction: 'forward',
    })
    expect(setConnectionDirection(reversed, 'left', 'unknown').direction).toBeNull()
    expect(original.from).toBe('left')
  })
  it('chooses projected outer edges, ignoring holes', () => {
    const unit = polygon('left', 'a', 0)
    if (unit.geometry.type !== 'Polygon') throw new Error('Expected polygon')
    unit.geometry.coordinates.push([
      [2, 2],
      [8, 2],
      [8, 8],
      [2, 8],
      [2, 2],
    ])
    expect(nearestEntranceSide(unit, [9, 5])).toEqual({ polygonIndex: 0, edgeIndex: 1 })
    expect(nearestEntranceSide(unit, [-5, 9], p => [-p[1], p[0]])).toEqual({
      polygonIndex: 0,
      edgeIndex: 1,
    })
    unit.geometry = {
      type: 'MultiPolygon',
      coordinates: [
        unit.geometry.coordinates,
        [
          [
            [20, 0],
            [30, 0],
            [30, 10],
            [20, 10],
            [20, 0],
          ],
        ],
      ],
    }
    expect(nearestEntranceSide(unit, [29, 5])).toEqual({
      polygonIndex: 1,
      edgeIndex: 1,
    })
  })
})
