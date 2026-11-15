// TYPES
import type { Position } from 'geojson'
import type { IndoorFeature } from './model'
type XY = [number, number]
export type PolygonLabel = {
  point: XY
  width: number
  clearance: number
  rings: XY[][]
}

/** Intersects a horizontal line with a polygon, respecting holes. @param rings Projected rings. @param y Scan height. @returns Interior spans. */
function spans(rings: XY[][], y: number): XY[] {
  const crossings: number[] = []
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j],
        b = ring[i]
      if (a[1] > y !== b[1] > y)
        crossings.push(a[0] + ((y - a[1]) * (b[0] - a[0])) / (b[1] - a[1]))
    }
  }
  crossings.sort((a, b) => a - b)
  const result: XY[] = []
  for (let i = 0; i + 1 < crossings.length; i += 2)
    result.push([crossings[i], crossings[i + 1]])
  return result
}

/** Measures label room at an interior point. @param rings Projected polygon. @param point Candidate centre. @returns Available width and nearest-edge distance, or null outside. */
function room(rings: XY[][], point: XY): PolygonLabel | null {
  const span = spans(rings, point[1]).find(([a, b]) => a < point[0] && point[0] < b)
  if (!span) return null
  let clearance = Infinity
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[j],
        b = ring[i],
        dx = b[0] - a[0],
        dy = b[1] - a[1]
      const t = Math.max(
        0,
        Math.min(
          1,
          ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
        ),
      )
      clearance = Math.min(
        clearance,
        Math.hypot(point[0] - a[0] - t * dx, point[1] - a[1] - t * dy),
      )
    }
  }
  return {
    rings,
    point,
    width: 2 * Math.min(point[0] - span[0], span[1] - point[0]),
    clearance,
  }
}

/** Places each disconnected polygon's label at its centre of mass. @param feature Source unit. @param project Projection into display coordinates. @returns Interior anchors with available label space. @remarks Holes subtract mass. Concave polygons whose centroid is outside use an interior scanline fallback. Navigation and camera centres are unaffected. */
export function polygonLabels(
  feature: IndoorFeature,
  project: (point: Position) => XY,
): PolygonLabel[] {
  const geometry = feature.geometry
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : []
  return polygons.flatMap(polygon => {
    const rings = polygon.map(ring => ring.map(project))
    const origin = rings[0][0]
    let mass = 0,
      momentX = 0,
      momentY = 0
    // Translate before summing cross products to avoid cancellation in geographic data.
    for (const [index, ring] of rings.entries()) {
      let twiceArea = 0,
        x = 0,
        y = 0
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = ring[j][0] - origin[0],
          ay = ring[j][1] - origin[1]
        const bx = ring[i][0] - origin[0],
          by = ring[i][1] - origin[1]
        const cross = ax * by - bx * ay
        twiceArea += cross
        x += (ax + bx) * cross
        y += (ay + by) * cross
      }
      if (Math.abs(twiceArea) < 1e-12) continue
      const weight = Math.abs(twiceArea) * (index === 0 ? 1 : -1)
      mass += weight
      momentX += (x / (3 * twiceArea) + origin[0]) * weight
      momentY += (y / (3 * twiceArea) + origin[1]) * weight
    }
    if (mass <= 1e-12) return []
    const centroid: XY = [momentX / mass, momentY / mass]
    const candidate = room(rings, centroid)
    if (candidate) return [candidate]
    // Search between vertex heights, where every candidate lies strictly within a span.
    const ys = [...new Set(rings.flat().map(point => point[1]))].sort((a, b) => a - b)
    let best: PolygonLabel | null = null
    for (let i = 1; i < ys.length; i++) {
      const y = (ys[i - 1] + ys[i]) / 2
      for (const [left, right] of spans(rings, y)) {
        const alternative = room(rings, [(left + right) / 2, y])
        if (alternative && (!best || alternative.clearance > best.clearance))
          best = alternative
      }
    }
    return best ? [best] : []
  })
}

/** Fits the complete text rectangle inside its polygon. @param placement Centroid or interior fallback. @param maxSize Preferred font size. @param columns Longest line length. @param lines Number of text lines. @returns A readable interior position and font size. @remarks Prefer the centroid; move to a nearby interior span only when the text would otherwise be substantially reduced. */
export function fitPolygonText(
  placement: PolygonLabel,
  maxSize: number,
  columns: number,
  lines: number,
): { point: XY; size: number } {
  const { rings } = placement
  const ys = [...new Set(rings.flat().map(point => point[1]))].sort((a, b) => a - b)
  const sizeAt = (point: XY): number => {
    let low = 0,
      high = maxSize
    for (let iteration = 0; iteration < 20; iteration++) {
      const size = (low + high) / 2,
        halfWidth = size * columns * 0.35,
        halfHeight = size * lines * 0.7
      const bottom = point[1] - halfHeight,
        top = point[1] + halfHeight
      const heights = [
        bottom,
        top,
        ...ys.filter(y => bottom < y && y < top).flatMap(y => [y - 1e-9, y + 1e-9]),
      ]
      const fits = heights.every(y =>
        spans(rings, y).some(
          ([left, right]) =>
            left < point[0] - halfWidth && point[0] + halfWidth < right,
        ),
      )
      if (fits) low = size
      else high = size
    }
    return low
  }
  let best = { point: placement.point, size: sizeAt(placement.point) }
  if (best.size >= maxSize * 0.85) return best
  // Move within the same component only when its centroid cannot hold readable text.
  for (let i = 1; i < ys.length; i++) {
    const y = (ys[i - 1] + ys[i]) / 2
    for (const [left, right] of spans(rings, y)) {
      for (const x of [
        Math.max(left, Math.min(right, placement.point[0])),
        (left + right) / 2,
      ]) {
        const point: XY = [x, y],
          size = sizeAt(point)
        const distance = Math.hypot(
          point[0] - placement.point[0],
          point[1] - placement.point[1],
        )
        const previousDistance = Math.hypot(
          best.point[0] - placement.point[0],
          best.point[1] - placement.point[1],
        )
        if (
          size > best.size + maxSize * 0.01 ||
          (size >= best.size && distance < previousDistance)
        )
          best = { point, size }
      }
    }
  }
  return best
}
