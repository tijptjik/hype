// TYPES
import type { IndoorFeature } from './model'
import type { Point, StationProjection } from './scene'

/** Tests actual floor polygons against the aspect-correct visible SVG rectangle.
 * @param features Destination floor polygons.
 * @param projection Current camera projection.
 * @param view Visible rectangle as x, y, width, height.
 * @returns Whether any filled floor area touches the viewport, including its boundary.
 */
export function floorInViewport(
  features: IndoorFeature[],
  projection: StationProjection,
  view: number[],
): boolean {
  const [x, y, w, h] = view
  const inside = ([px, py]: Point): boolean =>
    px >= x && px <= x + w && py >= y && py <= y + h
  // Clip each boundary segment to the viewport; endpoints alone miss crossing edges.
  const crosses = (a: Point, b: Point): boolean => {
    let low = 0,
      high = 1
    for (const [start, delta, min, max] of [
      [a[0], b[0] - a[0], x, x + w],
      [a[1], b[1] - a[1], y, y + h],
    ]) {
      if (delta === 0) {
        if (start < min || start > max) return false
      } else {
        const first = (min - start) / delta,
          last = (max - start) / delta
        low = Math.max(low, Math.min(first, last))
        high = Math.min(high, Math.max(first, last))
      }
    }
    return low <= high
  }
  return features.some(feature => {
    const geometry = feature.geometry
    const polygons =
      geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon'
          ? geometry.coordinates
          : []
    return polygons.some(polygon => {
      const rings = polygon.map(ring =>
        ring.map(point =>
          projection.project(point, String(feature.properties.level_id)),
        ),
      )
      let contained = false
      for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[j],
            b = ring[i]
          if (inside(b) || crosses(a, b)) return true
          // Even/odd fill accounts for a viewport entirely inside a polygon hole.
          if (
            a[1] > y !== b[1] > y &&
            x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
          )
            contained = !contained
        }
      }
      return contained
    })
  })
}

/** Describes geographic displacement while retaining the screen-relative arrow direction.
 * @param from Source geographic center.
 * @param to Destination geographic center.
 * @param delta Displacement in projected screen coordinates.
 * @returns Distance label, compass direction, and clockwise arrow rotation from up.
 */
export function cameraTravel(
  from: Point,
  to: Point,
  delta: Point,
): { distance: string; direction: string; angle: number } {
  const east =
    (to[0] - from[0]) * 111320 * Math.cos(((from[1] + to[1]) * Math.PI) / 360)
  const north = (to[1] - from[1]) * 111320
  const metres = Math.hypot(east, north)
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
  return {
    distance:
      metres >= 1000
        ? `${(metres / 1000).toFixed(1)} km`
        : `${Math.max(1, Math.round(metres))} m`,
    direction: [
      'north',
      'northeast',
      'east',
      'southeast',
      'south',
      'southwest',
      'west',
      'northwest',
    ][Math.round(bearing / 45) % 8],
    angle: (Math.atan2(delta[0], -delta[1]) * 180) / Math.PI,
  }
}
