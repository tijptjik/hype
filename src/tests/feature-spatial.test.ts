// H3
import { cellToParent, latLngToCell } from 'h3-js'
// VITEST
import { describe, expect, it } from 'vitest'
// MAP
import {
  createFeatureSpatialIndex,
  FEATURE_H3_RESOLUTIONS,
  FEATURE_VIEWPORT_MAX_CELLS,
  getFeatureViewportQuery,
  isFeaturePointWithinBounds,
} from '$lib/map/featureSpatial'

describe('feature H3 membership', () => {
  it('computes every resolution directly even where geometric membership differs from an H3 parent', () => {
    let boundary: [number, number] | undefined
    for (let step = 0; step < 1000; step++) {
      const latitude = 22.3 + step / 100000
      if (
        cellToParent(latLngToCell(latitude, 114.17, 9), 8) !==
        latLngToCell(latitude, 114.17, 8)
      ) {
        boundary = [114.17, latitude]
        break
      }
    }
    expect(boundary).toBeDefined()
    if (!boundary) throw new Error('Expected a point near an H3 cell boundary')
    const index = createFeatureSpatialIndex({ type: 'Point', coordinates: boundary })
    if (!index) throw new Error('Expected a spatial index for the boundary point')
    for (const resolution of FEATURE_H3_RESOLUTIONS)
      expect(index.cells[String(resolution)]).toBe(
        latLngToCell(boundary[1], boundary[0], resolution),
      )
  })

  it('indexes legacy numeric strings without rewriting the source geometry', () => {
    const geometry = { type: 'Point', coordinates: ['114.17', '22.32'] }
    const index = createFeatureSpatialIndex(geometry)
    if (!index) throw new Error('Expected a spatial index for the numeric geometry')
    expect(index.longitude).toBe(114.17)
    expect(index.latitude).toBe(22.32)
    expect(index.geometry).toBe(JSON.stringify(geometry))
  })

  it('rejects non-points, non-finite coordinates and invalid latitude/longitude', () => {
    for (const geometry of [
      { type: 'Polygon', coordinates: [] },
      { type: 'Point', coordinates: [Infinity, 22] },
      { type: 'Point', coordinates: [114, 91] },
      { type: 'Point', coordinates: ['not-a-number', 22] },
      null,
    ])
      expect(createFeatureSpatialIndex(geometry)).toBeNull()
  })
})

describe('feature viewport coverage', () => {
  it('uses exact bounds to exclude points that are only inside the H3 cover buffer', () => {
    const query = getFeatureViewportQuery([114.1, 22.2, 114.3, 22.4], 12)
    expect(query.bounds?.[0]).toBeCloseTo(114.1)
    expect(query.bounds?.[2]).toBeCloseTo(114.3)
    expect(query.bounds?.[1]).toBe(22.2)
    expect(query.bounds?.[3]).toBe(22.4)
    const bounds = query.bounds
    if (!bounds) throw new Error('Expected viewport bounds')
    expect(
      isFeaturePointWithinBounds(
        { type: 'Point', coordinates: [114.09, 22.3] },
        bounds,
      ),
    ).toBe(false)
    expect(
      isFeaturePointWithinBounds({ type: 'Point', coordinates: [114.2, 22.3] }, bounds),
    ).toBe(true)
  })

  it('displays both sides of a wrapped viewport without including the opposite hemisphere', () => {
    const bounds = getFeatureViewportQuery([179, -10, 181, 10], 5).bounds
    if (!bounds) throw new Error('Expected wrapped viewport bounds')
    for (const longitude of [179.5, -179.5])
      expect(
        isFeaturePointWithinBounds(
          { type: 'Point', coordinates: [longitude, 0] },
          bounds,
        ),
      ).toBe(true)
    expect(
      isFeaturePointWithinBounds({ type: 'Point', coordinates: [0, 0] }, bounds),
    ).toBe(false)
  })

  it.each([
    [[114.1, 22.2, 114.3, 22.4], 12],
    [[114.1699, 22.3199, 114.1701, 22.3201], 18],
    [[179.99, 1, -179.99, 2], 12],
    [[179.99, 1, 180.01, 2], 12],
    [[114.1, 84.9, 114.3, 85], 12],
    [[-180, -85, 180, 85], 20],
  ] as Array<[[number, number, number, number], number]>)(
    'includes sampled points and all viewport edges for %j',
    (bounds, zoom) => {
      const query = getFeatureViewportQuery(bounds, zoom)
      expect(query.cells.length).toBeLessThanOrEqual(FEATURE_VIEWPORT_MAX_CELLS)
      expect(new Set(query.cells).size).toBe(query.cells.length)
      const width =
        bounds[2] >= bounds[0] ? bounds[2] - bounds[0] : bounds[2] + 360 - bounds[0]
      for (let x = 0; x <= 20; x++) {
        for (let y = 0; y <= 20; y++) {
          const longitude =
            ((((bounds[0] + (width * x) / 20 + 180) % 360) + 360) % 360) - 180
          const latitude = bounds[1] + ((bounds[3] - bounds[1]) * y) / 20
          expect(query.cells).toContain(
            latLngToCell(latitude, longitude, query.resolution),
          )
        }
      }
    },
  )

  it('uses a finer resolution when zooming into a smaller viewport', () => {
    const broad = getFeatureViewportQuery([114.1, 22.2, 114.3, 22.4], 10)
    const close = getFeatureViewportQuery([114.1699, 22.3199, 114.1701, 22.3201], 18)
    expect(close.resolution).toBeGreaterThan(broad.resolution)
  })

  it('rejects malformed viewport input before invoking H3', () => {
    expect(() => getFeatureViewportQuery([114, 23, 115, 22], 12)).toThrow()
    expect(() => getFeatureViewportQuery([114, 22, Infinity, 23], 12)).toThrow()
  })
})
