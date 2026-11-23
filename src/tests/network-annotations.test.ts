import { networkConnectorPlan, outdoorBoundaryEdge } from '../lib/indoor/exteriorRelief'
import { describe, expect, it } from 'vitest'
import experiment from '../lib/indoor/kennedy-town-connectors.json'
import {
  networkAnnotation,
  networkConnections,
  networkPairDirection,
  unmatchedNetworkConnectors,
} from '../lib/indoor/networkAnnotations'
import { prepareConnectorReliefs } from '../lib/indoor/connectorRelief'
import { stationProjection } from '../lib/indoor/scene'
import {
  collection,
  layerNames,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'

function fixture(): IndoorData {
  const data = Object.fromEntries(
    layerNames.map(name => [name, collection([])]),
  ) as unknown as IndoorData
  data.retrievedAt = '2026-11-16'
  data.connections = []
  for (const [id, a] of Object.entries(experiment.annotations)) {
    const unit: IndoorFeature = {
      type: 'Feature',
      geometry: a.geometry as IndoorFeature['geometry'],
      properties: { unit_id: id, unit_category: a.category, level_id: a.levelId },
    }
    data.unit_polygon.features.push(unit)
    if (!data.level_polygon.features.some(f => f.properties.level_id === a.levelId))
      data.level_polygon.features.push({
        ...unit,
        properties: {
          level_id: a.levelId,
          level_z_value: a.floorZ,
          level_ordinal: a.floorZ,
        },
      })
  }
  data.venue_polygon = collection([
    { ...data.level_polygon.features[0], properties: { venue_id: experiment.venueId } },
  ])
  return data
}
describe('Kennedy Town source geometry experiment', () => {
  it('provides relief for 41 exact matches without invented inter-floor links', () => {
    const data = fixture()
    const reliefs = prepareConnectorReliefs(data)(
      stationProjection(data, false, { bearing: 0, tilt: 50 }),
    )
    expect(reliefs.size).toBe(41)
    expect([...reliefs.values()].filter(r => r.sourceTravel !== 'both')).toHaveLength(
      18,
    )
    expect(data.connections).toEqual([])
  })
  it('fails closed after geometry, elevation or identity changes', () => {
    const data = fixture(),
      unit = data.unit_polygon.features[0]
    expect(networkAnnotation(data, unit)).toBeDefined()
    const changed = structuredClone(unit)
    changed.geometry = { type: 'Point', coordinates: [114, 22] }
    expect(networkAnnotation(data, changed)).toBeUndefined()
    data.level_polygon.features[0].properties.level_z_value = 999
    expect(networkAnnotation(data, unit)).toBeUndefined()
  })
  it('uses explicit travel only for opposite landings on the same network segment', () => {
    const data = fixture()
    const left = data.unit_polygon.features.find(
      f => f.properties.unit_id === '5bb51bb9-0b86-40c8-8b8a-f14daa7886c6',
    )!
    const right = data.unit_polygon.features.find(
      f => f.properties.unit_id === '5612a492-35a4-46ff-923c-269ed7c206ce',
    )!
    expect(networkPairDirection(data, left, right)).toBe('reverse')
    expect(networkPairDirection(data, right, left)).toBe('forward')
    expect(networkPairDirection(data, left, left)).toBeUndefined()
  })
})

describe('boundary and paired source geometry', () => {
  it('keeps exterior relief inside its surveyed footprint', () => {
    const data = fixture()
    const projection = stationProjection(data, false, { bearing: 30, tilt: 55 })
    const reliefs = prepareConnectorReliefs(data)(projection)
    const exterior = [...reliefs.values()].filter(r => r.exterior)
    expect(exterior).toHaveLength(7)
    for (const [id, relief] of reliefs) {
      const unit = data.unit_polygon.features.find(f => f.properties.unit_id === id)!
      if (!relief.exterior) {
        expect(relief.surface).not.toBe(projection.path(unit))
        continue
      }
      expect(relief.surface).not.toBe(projection.path(unit))
      expect(relief.bridges).toEqual([])
      expect(relief.bridgeFaces).toEqual([])
      expect(relief.visibleFaces.length).toBeGreaterThan(0)
      expect(relief.outdoorEdge).toMatch(/^M/)
      expect(relief.depthEdges).toEqual([])
      expect(relief.surfaces).toHaveLength(1)
      expect(relief.surface).not.toMatch(/NaN|Infinity/)
    }
    // In plan view every surface vertex and blue edge must remain on the source footprint.
    const plan = stationProjection(data, false, { bearing: 30, tilt: 0 })
    const planReliefs = prepareConnectorReliefs(data)(plan)
    for (const [id, relief] of planReliefs) {
      if (!relief.exterior) continue
      const unit = data.unit_polygon.features.find(f => f.properties.unit_id === id)!
      expect(relief.surface).toBe(plan.path(unit))
      expect(relief.visibleFaces).toEqual([])
    }
  })
  it('connects unique opposite stair landings and retains explicit disabled pairs', () => {
    const data = fixture()
    const pairs = networkConnections(data)
    expect(pairs).toHaveLength(17)
    const stair = pairs.find(
      c =>
        c.from === 'a9f6b2f6-d90b-445a-b113-11da414ee2c7' ||
        c.to === 'a9f6b2f6-d90b-445a-b113-11da414ee2c7',
    )
    expect(stair?.category).toBe('stairs')
    if (!stair) throw new Error('Missing source stair pair')
    data.connections = [{ ...stair, enabled: false }]
    expect(networkConnections(data)).not.toContainEqual(stair)
  })
})

describe('unmatched connector review queue', () => {
  it('lists current unmatched slopes in stable order without hiding authored connections or including lifts', () => {
    const data = fixture()
    expect(unmatchedNetworkConnectors(data)).toEqual([])
    const changed = data.unit_polygon.features.slice(0, 2)
    for (const unit of changed)
      unit.geometry = {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [114.001, 22],
            [114.001, 22.001],
            [114, 22],
          ],
        ],
      }
    data.unit_polygon.features.push({
      ...structuredClone(changed[0]),
      properties: {
        ...changed[0].properties,
        unit_id: 'lift',
        unit_category: 'elevator',
      },
    })
    const queue = unmatchedNetworkConnectors(data).map(unit => unit.properties.unit_id)
    expect(queue).toHaveLength(2)
    expect(new Set(queue)).toEqual(
      new Set(changed.map(unit => unit.properties.unit_id)),
    )
    data.connections = [
      {
        from: String(queue[0]),
        to: String(queue[1]),
        fromLevel: 'a',
        toLevel: 'b',
        category: 'stairs',
        evidence: 'editor-verified',
        direction: 'both',
        enabled: true,
      },
    ]
    data.unit_polygon.features.reverse()
    expect(
      unmatchedNetworkConnectors(data).map(unit => unit.properties.unit_id),
    ).toEqual(queue)
    expect(data.connections).toHaveLength(1)
  })
})

describe('outdoor boundary crossing', () => {
  const ring = [
    [0, 0],
    [4, 0],
    [4, 2],
    [0, 2],
    [0, 0],
  ]
  it('uses the crossed side even when the path turns toward another side outside', () => {
    expect(
      outdoorBoundaryEdge(ring, [
        [2, 1],
        [2, 3],
        [9, 1],
      ]),
    ).toBe(2)
  })
  it('does not guess from the endpoint when there is no crossing', () => {
    expect(
      outdoorBoundaryEdge(ring, [
        [1, 1],
        [3, 1],
      ]),
    ).toBeUndefined()
  })
  it('leaves an ambiguous corner unmarked', () => {
    expect(
      outdoorBoundaryEdge(ring, [
        [2, 1],
        [6, 3],
      ]),
    ).toBeUndefined()
  })
})

it('keeps both ends of each outdoor opening at the same elevation', () => {
  const data = fixture()
  const projection = stationProjection(data, false)
  for (const unit of data.unit_polygon.features) {
    const annotation = networkAnnotation(data, unit)
    if (!annotation?.exterior) continue
    const relief = networkConnectorPlan(unit, annotation, {
      ...projection,
      project: (p, _level, elevation = 0) => [p[0], elevation],
    })
    const values = relief
      .outdoorEdge!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!
      .map(Number)
    expect(values[1]).toBeCloseTo(values[3], 6)
    expect(values[1]).toBeLessThan(0)
    if (annotation.category === 'steps' || annotation.category === 'stairs') {
      const treads = relief
        .exteriorTreads!.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!
        .map(Number)
      expect(treads.length).toBeGreaterThan(0)
      for (let i = 0; i < treads.length; i += 4)
        expect(treads[i + 1]).toBeCloseTo(treads[i + 3], 6)
    }
  }
})

it('caps short exterior footprints at 30 degrees without changing source rise', () => {
  const data = fixture()
  const projection = stationProjection(data, false)
  const original = Object.values(experiment.annotations).find(a => a.exterior)!
  const run = 0.2
  const unit: IndoorFeature = {
    type: 'Feature',
    properties: { level_id: original.levelId },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [run / 111320, 0],
          [run / 111320, 1 / 111320],
          [0, 1 / 111320],
          [0, 0],
        ],
      ],
    },
  }
  for (const sourceRise of [-1.8, 1.8, -0.01, 0]) {
    const annotation = {
      ...original,
      rise: sourceRise,
      entrance: [0, 0.5 / 111320],
      destination: [1 / 111320, 0.5 / 111320],
      path: [
        [0.1 / 111320, 0.5 / 111320],
        [1 / 111320, 0.5 / 111320],
      ],
    }
    const relief = networkConnectorPlan(unit, annotation, {
      ...projection,
      project: (p, _level, elevation = 0) => [p[0], elevation],
    })
    const drop = relief.farEnd[1] - relief.entrance[1]
    expect(Math.abs(drop)).toBeLessThanOrEqual(run * Math.tan(Math.PI / 6))
    expect(drop).toBeCloseTo(
      Math.sign(sourceRise) *
        Math.min(Math.abs(sourceRise), run * Math.tan(Math.PI / 6)),
      8,
    )
    expect(annotation.rise).toBe(sourceRise)
  }
})
