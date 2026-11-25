// @vitest-environment node
import { expect, it } from 'vitest'
import {
  floorplanExtractionSchema,
  floorplanBundle,
} from '#lib/indoor/floorplans/extraction.js'
import { places } from '#lib/indoor/model.js'
import { stairTreads } from '#lib/indoor/spatial.js'
const ring = [
  [10, 10],
  [90, 10],
  [90, 90],
  [10, 90],
  [10, 10],
]
const input = {
  warnings: ['Review alignment'],
  floors: [
    {
      id: 'first',
      label: '1/F',
      page: 1,
      width: 100,
      height: 100,
      boundary: ring,
      warnings: [],
      units: [
        {
          id: 'room-a',
          label: 'DOMESTIC',
          category: 'room',
          polygon: ring,
          confidence: 0.7,
          evidence: 'Visible boundary',
        },
      ],
    },
  ],
}
it('produces the existing unpublished image-pixel layer format without inferred routes', () => {
  const bundle = floorplanBundle(input)
  expect(bundle.data.coordinateSpace).toBe('image-pixels')
  expect(bundle.data.connections).toEqual([])
  expect(bundle.data.unit_polygon.features[0].properties.unit_id).toBe('first-room-a')
  expect(bundle.data.unit_polygon.features[0].properties.review_required).toBe(true)
})
it('rejects coordinates outside the source and duplicate floor IDs', () => {
  expect(
    floorplanExtractionSchema.safeParse({
      ...input,
      floors: [input.floors[0], input.floors[0]],
    }).success,
  ).toBe(false)
  expect(
    floorplanExtractionSchema.safeParse({
      ...input,
      floors: [{ ...input.floors[0], width: 20 }],
    }).success,
  ).toBe(false)
})

it('rejects a crossing polygon before saving', () => {
  const crossing = [
    [10, 10],
    [90, 90],
    [90, 10],
    [10, 90],
    [10, 10],
  ]
  expect(
    floorplanExtractionSchema.safeParse({
      ...input,
      floors: [{ ...input.floors[0], boundary: crossing }],
    }).success,
  ).toBe(false)
})

it('retains kitchen, toilet and lavatory compartments and marks uncovered space without inferring corridors', () => {
  const units = ['kitchen', 'toilet', 'lavatory'].map((category, index) => ({
    ...input.floors[0].units[0],
    id: category,
    label: category,
    category,
    polygon: [
      [10 + index * 20, 10],
      [30 + index * 20, 10],
      [30 + index * 20, 50],
      [10 + index * 20, 50],
      [10 + index * 20, 10],
    ],
  }))
  const bundle = floorplanBundle({ ...input, floors: [{ ...input.floors[0], units }] })
  expect(bundle.data.amenity_point.features).toHaveLength(3)
  const indexed = places(bundle.data)
  expect(indexed).toHaveLength(4)
  expect(indexed.filter(place => place.markerFeature)).toHaveLength(3)
  const features = bundle.data.unit_polygon.features
  expect(features.filter(f => f.properties.unit_category === 'corridor')).toHaveLength(
    0,
  )
  expect(features.filter(f => f.properties.extraction_residual)).toHaveLength(1)
  expect(
    features
      .filter(f => !f.properties.extraction_residual)
      .map(f => f.properties.unit_category),
  ).toEqual(['kitchen', 'toilet', 'lavatory'])
  expect(bundle.data.connections).toEqual([])
})

it('preserves a covered compartment as a hole in residual geometry', () => {
  const polygon = [
    [30, 30],
    [60, 30],
    [60, 60],
    [30, 60],
    [30, 30],
  ]
  const bundle = floorplanBundle({
    ...input,
    floors: [{ ...input.floors[0], units: [{ ...input.floors[0].units[0], polygon }] }],
  })
  const residual = bundle.data.unit_polygon.features.find(
    f => f.properties.extraction_residual,
  )!
  expect(residual.geometry.type).toBe('MultiPolygon')
  if (residual.geometry.type === 'MultiPolygon')
    expect(residual.geometry.coordinates[0]).toHaveLength(2)
})

it('preserves a reviewed balcony category in the standard indoor bundle', () => {
  const bundle = floorplanBundle({
    ...input,
    floors: [
      {
        ...input.floors[0],
        units: [
          {
            ...input.floors[0].units[0],
            category: 'balcony',
            label: 'Balcony',
            evidence: 'BAL. and enclosing lines',
          },
        ],
      },
    ],
  })
  expect(bundle.data.unit_polygon.features[0].properties.unit_category).toBe('balcony')
  expect(bundle.data.unit_polygon.features[0].properties.unit_name_en).toBe('Balcony')
})

it('places reviewed tread spans and their labels in aligned map coordinates', () => {
  const stair = {
    ...input.floors[0].units[0],
    category: 'stairs',
    stairFlights: [
      {
        first: [
          [20, 20],
          [30, 20],
        ],
        last: [
          [20, 50],
          [30, 50],
        ],
        count: 3,
        label: 'UP',
      },
    ],
  }
  const floor = {
    ...input.floors[0],
    alignment: { x: 2, y: 4, scale: 2, rotation: 0 },
    units: [stair],
  }
  const { data } = floorplanBundle({ ...input, floors: [floor] })
  const lines = stairTreads(data).features
  expect(lines).toHaveLength(3)
  expect(lines[1].geometry).toEqual({
    type: 'LineString',
    coordinates: [
      [22, 54],
      [42, 54],
    ],
  })
  expect(lines[1].properties.flight_label).toBe('UP')
  expect(data.connections).toEqual([])
  stair.stairFlights[0].last[1] = [99, 99]
  expect(
    floorplanExtractionSchema.safeParse({ ...input, floors: [floor] }).success,
  ).toBe(false)
})

it('does not publish a separate area for a floating-point sliver on a shared wall', () => {
  // Independently clipped points on the same sloping wall of a scanned plan.
  const edge = [
    [11.238095238095237, 592],
    [11.31904761904762, 609],
    [11.719047619047618, 693],
  ]
  const polygon = [edge[0], [30, 592], [30, 693], edge[2], edge[1], edge[0]]
  const floor = {
    ...input.floors[0],
    height: 700,
    boundary: [edge[0], [30, 592], [30, 693], edge[2], edge[0]],
    units: [{ ...input.floors[0].units[0], polygon }],
  }
  expect(
    floorplanBundle({ warnings: [], floors: [floor] }).data.unit_polygon.features,
  ).toHaveLength(1)
})
