import { describe, expect, test } from 'bun:test'
import { cameraTravel, floorInViewport } from '../lib/indoor/cameraTransition'
import type { IndoorFeature } from '../lib/indoor/model'
import type { StationProjection } from '../lib/indoor/scene'

const projection = { project: (p: number[]) => p } as unknown as StationProjection
const floor = (rings: number[][][]): IndoorFeature =>
  ({
    type: 'Feature',
    properties: { level_id: 'floor' },
    geometry: { type: 'Polygon', coordinates: rings },
  }) as IndoorFeature
const rectangle = (x: number, y: number, w: number, h: number): number[][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
]

describe('floor visibility before camera travel', () => {
  test('detects partial overlap, crossing edges, enclosing floors and touching boundaries', () => {
    for (const ring of [
      rectangle(9, 9, 5, 5),
      rectangle(-5, 4, 20, 2),
      rectangle(-5, -5, 20, 20),
      rectangle(10, 2, 5, 5),
    ]) {
      expect(floorInViewport([floor([ring])], projection, [0, 0, 10, 10])).toBe(true)
    }
  })
  test('rejects distant floors and a viewport entirely in a hole', () => {
    expect(
      floorInViewport([floor([rectangle(20, 20, 5, 5)])], projection, [0, 0, 10, 10]),
    ).toBe(false)
    expect(
      floorInViewport(
        [floor([rectangle(-20, -20, 50, 50), rectangle(-5, -5, 20, 20)])],
        projection,
        [0, 0, 10, 10],
      ),
    ).toBe(false)
  })
  test('does not mistake an overlapping bounding box for visible polygon geometry', () => {
    expect(
      floorInViewport(
        [
          floor([
            [
              [0, 20],
              [20, 0],
              [20, 20],
              [0, 20],
            ],
          ]),
        ],
        projection,
        [0, 0, 5, 5],
      ),
    ).toBe(false)
  })
  test('measures geographic distance independently of the rotated screen arrow', () => {
    const travel = cameraTravel([114, 22], [114, 22.001], [10, 0])
    expect(travel).toEqual({ distance: '111 m', direction: 'north', angle: 90 })
  })
})
