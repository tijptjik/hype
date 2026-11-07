import { describe, expect, it } from 'vitest'
import { featureDistance, featurePoint, rankNearbyFeatures } from './nearby'

describe('nearby feature placement', () => {
  it('accepts zero coordinates but rejects absent, invalid and non-point placements', () => {
    expect(featurePoint({ type: 'Point', coordinates: [0, 0] })).toEqual([0, 0])
    expect(featurePoint(null)).toBeNull()
    expect(featurePoint({ type: 'Point', coordinates: [181, 0] })).toBeNull()
    expect(featurePoint({ type: 'Point', coordinates: [NaN, 0] })).toBeNull()
    expect(
      featurePoint({
        type: 'LineString',
        coordinates: [
          [0, 0],
          [1, 1],
        ],
      }),
    ).toBeNull()
  })
  it('measures coincident points, nearby points and date-line crossings', () => {
    expect(featureDistance([114, 22], [114, 22])).toBe(0)
    expect(featureDistance([0, 0], [0, 1])).toBeCloseTo(111195, -1)
    expect(featureDistance([179.999, 0], [-179.999, 0])).toBeCloseTo(222.39, 1)
  })
})

it('ranks before limiting and excludes the source even when it is closest', () => {
  const rows = [6, 5, 4, 3, 2, 1, 0].map(n => ({
    id: String(n),
    geometry: { type: 'Point' as const, coordinates: [0, n / 1000] },
  }))
  expect(
    rankNearbyFeatures(rows, [0, 0], '0')
      .slice(0, 5)
      .map(row => row.id),
  ).toEqual(['1', '2', '3', '4', '5'])
  expect(
    rankNearbyFeatures(
      [
        { id: 'b', geometry: rows[0].geometry },
        { id: 'a', geometry: rows[0].geometry },
      ],
      [0, 0],
    ).map(row => row.id),
  ).toEqual(['a', 'b'])
})
