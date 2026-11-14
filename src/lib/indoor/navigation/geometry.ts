import type { Position } from 'geojson'
import type { IndoorFeature } from '../model'
/** Tests polygon interiors, respecting holes. @param point Geographic point. @param feature Polygon. @returns Containment. */
export function contains(point: Position, feature: IndoorFeature): boolean {
  const ring = (r: Position[]): boolean => {
    let inside = false
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const a = r[i],
        b = r[j]
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside
    }
    return inside
  }
  const polygon = (rings: Position[][]): boolean =>
    ring(rings[0]) && !rings.slice(1).some(ring)
  return feature.geometry.type === 'Polygon'
    ? polygon(feature.geometry.coordinates)
    : feature.geometry.type === 'MultiPolygon' &&
        feature.geometry.coordinates.some(polygon)
}

export type Point = [number, number]
/** Measures planar distance. @param a First point. @param b Second point. @returns Metres. */
export const distance = (a: Position, b: Position): number =>
  Math.hypot(a[0] - b[0], a[1] - b[1])
/** Tests closed segment intersection, including touches and collinear overlaps. @param a First start. @param b First end. @param c Second start. @param d Second end. @returns Intersection. */
export function intersects(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): boolean {
  const cross = (p: Position, q: Position, r: Position): number =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const box = (p: Position, q: Position, r: Position): boolean =>
    r[0] >= Math.min(p[0], q[0]) - 1e-9 &&
    r[0] <= Math.max(p[0], q[0]) + 1e-9 &&
    r[1] >= Math.min(p[1], q[1]) - 1e-9 &&
    r[1] <= Math.max(p[1], q[1]) + 1e-9
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b)
  return (
    (abC * abD < 0 && cdA * cdB < 0) ||
    (Math.abs(abC) < 1e-9 && box(a, b, c)) ||
    (Math.abs(abD) < 1e-9 && box(a, b, d)) ||
    (Math.abs(cdA) < 1e-9 && box(c, d, a)) ||
    (Math.abs(cdB) < 1e-9 && box(c, d, b))
  )
}
/** Checks an entire segment against polygon boundaries, including thin holes. @param a Start. @param b End. @param area Polygon. @returns Whether the segment stays strictly inside. */
export function insideSegment(a: Point, b: Point, area: IndoorFeature): boolean {
  if (!contains(a, area) || !contains(b, area)) return false
  const rings =
    area.geometry.type === 'Polygon'
      ? area.geometry.coordinates
      : area.geometry.type === 'MultiPolygon'
        ? area.geometry.coordinates.flat()
        : []
  return !rings.some(ring =>
    ring.some((p, i) => i > 0 && intersects(a, b, ring[i - 1], p)),
  )
}
