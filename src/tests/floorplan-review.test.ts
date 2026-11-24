// @vitest-environment node
import { publicationChanges } from '#lib/indoor/publicationChanges.js'
import { expect, it } from 'vitest'
import type { Geometry } from 'geojson'
/** Narrow asserted polygon output for coordinate regression checks. */
function coordinates(geometry: Geometry): number[][][] {
  if (geometry.type !== 'Polygon') throw new Error('Expected polygon')
  return geometry.coordinates
}
import {
  auditFloor,
  editOutline,
  alignFloorAnchors,
  drawnUnit,
  mergeUnits,
  splitUnit,
} from '#lib/indoor/floorplans/review.js'
import {
  floorplanBundle,
  type FloorplanExtraction,
} from '#lib/indoor/floorplans/extraction.js'
const floor: FloorplanExtraction['floors'][number] = {
  id: 'first',
  label: 'First',
  page: 1,
  width: 100,
  height: 100,
  boundary: [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
    [0, 0],
  ],
  warnings: [],
  units: [],
}
it('draws, splits and merges without losing coverage or the retained identity', () => {
  const unit = drawnUnit(floor, [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ])
  const parts = splitUnit(unit, 'x', 40)
  expect(parts[0].id).toBe(unit.id)
  expect(parts[1].id).not.toBe(unit.id)
  expect(auditFloor({ ...floor, units: parts })).toEqual({ coverage: 100, issues: [] })
  expect(mergeUnits(...parts).id).toBe(unit.id)
})
it('rejects a cut outside the room and non-adjacent merges', () => {
  const a = drawnUnit(floor, [
    [0, 0],
    [20, 0],
    [20, 20],
    [0, 20],
  ])
  const b = drawnUnit(floor, [
    [80, 80],
    [100, 80],
    [100, 100],
    [80, 100],
  ])
  expect(() => splitUnit(a, 'x', 50)).toThrow()
  expect(() => mergeUnits(a, b)).toThrow()
})
it('reports overlaps and outside areas separately from gaps', () => {
  const a = drawnUnit(floor, [
    [0, 0],
    [60, 0],
    [60, 60],
    [0, 60],
  ])
  const b = drawnUnit(floor, [
    [40, 40],
    [90, 40],
    [90, 90],
    [40, 90],
  ])
  expect(auditFloor({ ...floor, units: [a, b] }).issues[0]).toContain('overlaps')
  expect(auditFloor({ ...floor, units: [a] }).coverage).toBe(36)
})
it('applies explicit alignment while retaining source coordinates and template provenance', () => {
  const aligned = {
    ...floor,
    sourceFloorId: 'typical',
    alignment: { x: 10, y: 20, scale: 2, rotation: 0 },
  }
  const bundle = floorplanBundle({ warnings: [], floors: [aligned] })
  expect(coordinates(bundle.data.level_polygon.features[0].geometry)[0][0]).toEqual([
    10, 20,
  ])
  expect(bundle.data.level_polygon.features[0].properties.source_floor_id).toBe(
    'typical',
  )
  expect(aligned.boundary[0]).toEqual([0, 0])
})

it('surfaces geometry and category changes in publication review', () => {
  const room = drawnUnit(floor, [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ])
  const previous = floorplanBundle({
    warnings: [],
    floors: [{ ...floor, units: [room] }],
  })
  const next = floorplanBundle({
    warnings: [],
    floors: [{ ...floor, units: [{ ...room, category: 'balcony' }] }],
  })
  expect(
    publicationChanges(next, previous).find(change => change.label === 'Spaces')?.after,
  ).toContain('1 changed')
})

it('preserves true floor voids and rejects an external void', () => {
  const next = structuredClone(floor)
  editOutline(
    next,
    [
      [10, 10],
      [20, 10],
      [20, 20],
      [10, 20],
    ],
    'floor-hole',
  )
  const bundle = floorplanBundle({ warnings: [], floors: [next] })
  expect(coordinates(bundle.data.level_polygon.features[0].geometry)).toHaveLength(2)
  expect(() =>
    editOutline(
      next,
      [
        [90, 90],
        [100, 90],
        [110, 110],
        [90, 100],
      ],
      'floor-hole',
    ),
  ).toThrow()
})
it('registers rotated anchors without changing original vertices', () => {
  const next = structuredClone(floor)
  next.alignment = alignFloorAnchors(
    next,
    [
      [0, 0],
      [100, 0],
    ],
    [
      [10, 20],
      [10, 220],
    ],
  )
  expect(next.alignment.scale).toBe(2)
  expect(next.alignment.rotation).toBe(90)
  const bundle = floorplanBundle({ warnings: [], floors: [next] })
  expect(
    coordinates(bundle.data.level_polygon.features[0].geometry)[0][1][0],
  ).toBeCloseTo(10)
  expect(
    coordinates(bundle.data.level_polygon.features[0].geometry)[0][1][1],
  ).toBeCloseTo(220)
  expect(() =>
    alignFloorAnchors(
      next,
      [
        [0, 0],
        [0, 0],
      ],
      [
        [0, 0],
        [1, 1],
      ],
    ),
  ).toThrow()
})
it('retains canonical Floor and Unit references, clearing a split new identity', () => {
  const room = {
    ...drawnUnit(floor, [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ]),
    locationId: 'unit-identity',
  }
  const bundle = floorplanBundle({
    warnings: [],
    floors: [{ ...floor, locationId: 'floor-identity', units: [room] }],
  })
  expect(bundle.data.level_polygon.features[0].properties.canonical_location_id).toBe(
    'floor-identity',
  )
  expect(bundle.data.unit_polygon.features[0].properties.canonical_location_id).toBe(
    'unit-identity',
  )
  expect(splitUnit(room, 'x', 50)[1].locationId).toBeUndefined()
})
