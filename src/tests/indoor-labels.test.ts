import { existsSync } from 'node:fs'
// TESTS
import { expect, it } from 'vitest'
// DATA
import { polygonLabels, fitPolygonText } from '../lib/indoor/labels'
import type { IndoorFeature } from '../lib/indoor/model'
import { readFileSync } from 'node:fs'
const project = (p: number[]): [number, number] => [p[0], p[1]]
const polygon = (coordinates: number[][][]): IndoorFeature => ({
  type: 'Feature',
  properties: {},
  geometry: { type: 'Polygon', coordinates },
})
it('uses area-weighted centroids, not the bounds or vertex average', () => {
  const triangle = polygon([
    [
      [0, 0],
      [12, 0],
      [0, 6],
      [0, 0],
    ],
  ])
  expect(polygonLabels(triangle, project)[0].point).toEqual([4, 2])
  const reversed = polygon([
    triangle.geometry.type === 'Polygon'
      ? [...triangle.geometry.coordinates[0]].reverse()
      : [],
  ])
  expect(polygonLabels(reversed, project)[0].point).toEqual([4, 2])
})
it('subtracts holes regardless of winding and falls back when the centroid is in a hole', () => {
  const outer = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ]
  const offset = polygon([
    outer,
    [
      [6, 2],
      [8, 2],
      [8, 4],
      [6, 4],
      [6, 2],
    ],
  ])
  expect(polygonLabels(offset, project)[0].point[0]).toBeCloseTo(472 / 96)
  const donut = polygon([
    outer,
    [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ],
  ])
  const { point, clearance } = polygonLabels(donut, project)[0]
  expect(point[0] < 3 || point[0] > 7 || point[1] < 3 || point[1] > 7).toBe(true)
  expect(clearance).toBeGreaterThan(0)
})
it.skipIf(!existsSync('.research/indoor/tko-plaza/manifest.json'))(
  'puts a label inside each disconnected 005 area and respects the combined shop notch',
  () => {
    const data = JSON.parse(
      readFileSync('.research/indoor/tko-plaza/unit_polygon.json', 'utf8'),
    )
    const unit = (code: string): IndoorFeature =>
      data.features.find(
        (f: IndoorFeature) => f.properties.unit_unitnumbername === code,
      )
    const labels = polygonLabels(unit('L1-005'), project)
    expect(labels).toHaveLength(2)
    expect(labels.some(label => label.point[1] < 100)).toBe(true)
    expect(labels.some(label => label.point[1] > 112 && label.point[1] < 171)).toBe(
      true,
    )
    const combined = polygonLabels(unit('L1-133 - L1-134 - L1-135'), project)
    expect(combined).toHaveLength(1)
    expect(combined[0].point[1]).toBeGreaterThan(548)
    expect(combined[0].clearance).toBeGreaterThan(0)
  },
)

it.skipIf(!existsSync('.research/indoor/tko-plaza/manifest.json'))(
  'keeps a fitting centroid and moves a long label clear of a concave notch',
  () => {
    const rectangle = polygon([
      [
        [0, 0],
        [100, 0],
        [100, 40],
        [0, 40],
        [0, 0],
      ],
    ])
    const placement = polygonLabels(rectangle, project)[0]
    expect(fitPolygonText(placement, 10, 5, 1).point).toEqual(placement.point)
    const data = JSON.parse(
      readFileSync('.research/indoor/tko-plaza/unit_polygon.json', 'utf8'),
    )
    const combined = data.features.find(
      (f: IndoorFeature) =>
        f.properties.unit_unitnumbername === 'L1-133 - L1-134 - L1-135',
    )
    const anchor = polygonLabels(combined, project)[0]
    const fitted = fitPolygonText(anchor, 8, 11, 1)
    expect(fitted.size).toBeGreaterThan(7)
    expect(fitted.point[1] - fitted.size * 0.7).toBeGreaterThan(548)
  },
)
