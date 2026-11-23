import type { Position } from 'geojson'
import { centre, type IndoorFeature } from './model'
type XY = [number, number]
type FootprintFrame = {
  minU: number
  maxU: number
  minV: number
  maxV: number
  world: (u: number, v: number) => XY
  spans: (position: number, across?: boolean) => XY[]
}
/** Works in local metres so rooms retain their aspect ratio. @param feature Source polygon. @param direction Optional source XY travel axis. @returns Its oriented frame or null for other geometries. */
export function footprintFrame(
  feature: IndoorFeature,
  direction?: [number, number],
): FootprintFrame | null {
  if (feature.geometry.type !== 'Polygon') return null
  const origin = centre(feature)
  const metresX = 111320 * Math.cos((origin[1] * Math.PI) / 180)
  const local = (p: Position): XY => [
    (p[0] - origin[0]) * metresX,
    (p[1] - origin[1]) * 111320,
  ]
  const rings = feature.geometry.coordinates.map(r => r.map(local))
  const outer = rings[0]
  let axis: XY = [1, 0],
    longest = 0
  for (let i = 1; i < outer.length; i++) {
    const dx = outer[i][0] - outer[i - 1][0],
      dy = outer[i][1] - outer[i - 1][1]
    const length = Math.hypot(dx, dy)
    if (length > longest) {
      longest = length
      axis = [dx / length, dy / length]
    }
  }
  if (direction) {
    const dx = direction[0] * metresX,
      dy = direction[1] * 111320
    const norm = Math.hypot(dx, dy)
    if (norm > 0) axis = [dx / norm, dy / norm]
  }
  const uv = rings.map(r =>
    r.map(([x, y]): XY => [x * axis[0] + y * axis[1], -x * axis[1] + y * axis[0]]),
  )
  const points = uv[0]
  const minU = Math.min(...points.map(p => p[0])),
    maxU = Math.max(...points.map(p => p[0]))
  const minV = Math.min(...points.map(p => p[1])),
    maxV = Math.max(...points.map(p => p[1]))
  const world = (u: number, v: number): XY => [
    origin[0] + (u * axis[0] - v * axis[1]) / metresX,
    origin[1] + (u * axis[1] + v * axis[0]) / 111320,
  ]
  /** Even/odd intersections clip to the actual perimeter, including holes. */
  const spans = (position: number, across = true): XY[] => {
    const intersections: number[] = []
    for (const ring of uv)
      for (let i = 1; i < ring.length; i++) {
        const a = ring[i - 1],
          b = ring[i],
          fixed = across ? 0 : 1,
          variable = across ? 1 : 0
        if (a[fixed] > position === b[fixed] > position) continue
        const t = (position - a[fixed]) / (b[fixed] - a[fixed])
        intersections.push(a[variable] + t * (b[variable] - a[variable]))
      }
    intersections.sort((a, b) => a - b)
    const result: XY[] = []
    for (let i = 0; i + 1 < intersections.length; i += 2)
      result.push([intersections[i], intersections[i + 1]])
    return result
  }
  return { minU, maxU, minV, maxV, world, spans }
}
/** Centres artwork within the footprint. @param feature Source shop polygon. @returns Interior image corners or null. @remarks Occupant survey points never position artwork. */
export function brandFootprint(
  feature: IndoorFeature,
  aspect = 0.75,
  padding = 0.76,
): [XY, XY, XY, XY] | null {
  const f = footprintFrame(feature)
  if (!f) return null
  const u = (f.minU + f.maxU) / 2,
    v = (f.minV + f.maxV) / 2
  let height = Math.min(
    (f.maxU - f.minU) * padding,
    ((f.maxV - f.minV) * padding) / aspect,
  )
  // The mark's portrait axis runs along the room's long axis.
  for (let attempt = 0; attempt < 30; attempt++) {
    const halfU = height / 2,
      halfV = (height * aspect) / 2
    if (
      padding > 1 ||
      [-1, -0.5, 0, 0.5, 1].every(t =>
        f.spans(u + t * halfU).some(([lo, hi]) => lo <= v - halfV && hi >= v + halfV),
      )
    )
      return [
        f.world(u - halfU, v + halfV),
        f.world(u - halfU, v - halfV),
        f.world(u + halfU, v - halfV),
        f.world(u + halfU, v + halfV),
      ]
    height *= 0.85
  }
  return null
}
