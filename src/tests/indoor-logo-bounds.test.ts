import { expect, test } from 'vitest'
import {
  collection,
  layerNames,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'
import { stationProjection } from '../lib/indoor/scene'

test('schematic logos scale with their shop bounds beyond 200 source pixels', () => {
  const widths = [400, 1600].map(size => {
    const shop: IndoorFeature = {
      type: 'Feature',
      properties: { level_id: 'ground' },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [size, 0],
            [size, size],
            [0, size],
            [0, 0],
          ],
        ],
      },
    }
    const data = {
      ...Object.fromEntries(layerNames.map(name => [name, collection([])])),
      coordinateSpace: 'image-pixels',
      venue_polygon: collection([shop]),
      level_polygon: collection([shop]),
    } as IndoorData
    const projection = stationProjection(data, false, { bearing: 0, tilt: 0 })
    const matrix = projection.logo(shop, 1, 0.8).slice(7, -1).split(' ').map(Number)
    const left = projection.project([0, 0], 'ground')
    const right = projection.project([size, 0], 'ground')
    const fraction =
      Math.hypot(matrix[0], matrix[1]) /
      Math.hypot(right[0] - left[0], right[1] - left[1])
    expect(fraction).toBeCloseTo(0.8, 4)
    return fraction
  })
  expect(widths[0]).toBeCloseTo(widths[1], 5)
})
