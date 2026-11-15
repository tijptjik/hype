import { expect, test } from 'bun:test'
import {
  collection,
  layerNames,
  type IndoorData,
  type IndoorFeature,
} from '../lib/indoor/model'
import { stationProjection } from '../lib/indoor/scene'

for (const coordinateSpace of [undefined, 'image-pixels'] as const) {
  test(`flat floor transforms match projected vertices: ${coordinateSpace ?? 'geographic'}`, () => {
    const floor = {
      type: 'Feature',
      properties: { level_id: 'upper', level_ordinal: 47 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [114.001, 22],
            [114.001, 22.001],
            [114, 22.001],
            [114, 22],
          ],
        ],
      },
    } as IndoorFeature
    const data = {
      ...Object.fromEntries(layerNames.map(name => [name, collection([])])),
      coordinateSpace,
      venue_polygon: collection([floor]),
      level_polygon: collection([
        { ...floor, properties: { level_id: 'ground', level_ordinal: 0 } },
        floor,
      ]),
    } as IndoorData
    const flat = stationProjection(data, false, { bearing: 0, tilt: 0 })
    for (const bearing of [-115, 0, 73]) {
      for (const tilt of [0, 60, 75]) {
        const camera = stationProjection(data, true, { bearing, tilt, spacing: 25 })
        // Floor-flat artwork keeps its fitted width, foreshortens with pitch, and follows the shop centre.
        for (const aspect of [0.5, 1, 3]) {
          const fits = [aspect, 1 / aspect].map(ratio =>
            flat.logo(floor, ratio).slice(7, -1).split(' ').map(Number),
          )
          const areas = fits.map(([a, b, c, d]) => Math.hypot(a, b) * Math.hypot(c, d))
          const fitted = fits[areas[1] > areas[0] ? 1 : 0]
          const upright = camera
            .screenAlignedLogo(floor, aspect)
            .slice(7, -1)
            .split(' ')
            .map(Number)
          const [fa, fb, fc, fd, fx, fy] = fitted
          const [width, skewY, skewX, height, x, y] = upright
          expect(skewX).toBe(0)
          expect(skewY).toBe(0)
          expect(width).toBeGreaterThan(0)
          expect(height).toBeGreaterThan(0)
          expect(width * height).toBeCloseTo(
            Math.max(...areas) * Math.cos((tilt * Math.PI) / 180),
            8,
          )
          expect(width / height).toBeCloseTo(
            aspect / Math.cos((tilt * Math.PI) / 180),
            6,
          )
          const centre = camera.project(
            flat.unproject([fx + (fa + fc) / 2, fy + (fb + fd) / 2], 'upper'),
            'upper',
          )
          expect(x + width / 2).toBeCloseTo(centre[0], 8)
          expect(y + height / 2).toBeCloseTo(centre[1], 8)
        }
        const a = camera.project(flat.unproject([0, 0], 'upper'), 'upper')
        const b = camera.project(flat.unproject([1, 0], 'upper'), 'upper')
        const c = camera.project(flat.unproject([0, 1], 'upper'), 'upper')
        const point = [114.0004, 22.0007]
        const local = flat.project(point, 'upper')
        const expected = camera.project(point, 'upper')
        expect(a[0] + local[0] * (b[0] - a[0]) + local[1] * (c[0] - a[0])).toBeCloseTo(
          expected[0],
          6,
        )
        expect(a[1] + local[0] * (b[1] - a[1]) + local[1] * (c[1] - a[1])).toBeCloseTo(
          expected[1],
          6,
        )
      }
    }
  })
}
