// TOC: Surface contracts | Polygon containment | Marker resolution
// TYPES
import type { Point3 } from './facades'

/** A versioned planar part of a building, expressed in model metres.
 * Interior plans use a horizontal frame; exterior façades use a vertical frame.
 * Ring coordinates are fractions of the frame, including holes after the outer ring.
 */
export type BuildingSurface = {
  id: string
  /** Changes whenever the polygon, floor alignment or coordinate frame changes. */
  revisionId: string
  modelAssetId: string
  buildingPartId: string
  realm: 'interior' | 'exterior'
  floorId?: string
  unitId?: string
  /** Geographic outward bearing, only when north alignment is known. */
  bearingDegrees?: number
  frame: { origin: Point3; right: Point3; up: Point3; width: number; height: number }
  polygon: [number, number][][]
}
export type SurfaceMarker = {
  surfaceId: string
  surfaceRevisionId: string
  modelAssetId: string
  buildingPartId: string
  realm: 'interior' | 'exterior'
  /** Fractions in [0,1], shown as percentages in the interface. Origin is bottom-left. */
  u: number
  v: number
}

/** Test a point against a ring, including the boundary. @param ring Closed or open ring. @param point Normalized position. @returns Containment. */
function inRing(ring: [number, number][], point: [number, number]): boolean {
  let inside = false
  const [x, y] = point
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i]
    const cross = (x - a[0]) * (b[1] - a[1]) - (y - a[1]) * (b[0] - a[0])
    if (
      Math.abs(cross) < 1e-9 &&
      x >= Math.min(a[0], b[0]) &&
      x <= Math.max(a[0], b[0]) &&
      y >= Math.min(a[1], b[1]) &&
      y <= Math.max(a[1], b[1])
    )
      return true
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

/** Resolve a normalized marker against its exact, versioned surface.
 * @param surface Associated part and frame. @param marker Normalized position and provenance.
 * @returns Position in model coordinates.
 * @remarks A bounding box is a coordinate frame, not a containment test: holes and nonrectangular outlines remain authoritative.
 */
export function surfaceMarkerPosition(
  surface: BuildingSurface,
  marker: SurfaceMarker,
): Point3 {
  if (
    marker.surfaceId !== surface.id ||
    marker.surfaceRevisionId !== surface.revisionId ||
    marker.modelAssetId !== surface.modelAssetId ||
    marker.buildingPartId !== surface.buildingPartId ||
    marker.realm !== surface.realm
  )
    throw new Error('Marker belongs to another surface or model revision.')
  if (
    ![marker.u, marker.v].every(
      value => Number.isFinite(value) && value >= 0 && value <= 1,
    )
  )
    throw new Error('Marker percentages must be between 0 and 100.')
  const { origin, right, up, width, height } = surface.frame
  if (
    origin.length !== 3 ||
    right.length !== 3 ||
    up.length !== 3 ||
    ![...origin, ...right, ...up, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    Math.abs(Math.hypot(...right) - 1) > 1e-6 ||
    Math.abs(Math.hypot(...up) - 1) > 1e-6 ||
    Math.abs(right.reduce((sum, v, i) => sum + v * up[i], 0)) > 1e-6
  )
    throw new Error('Invalid surface frame.')
  if (
    !surface.polygon.length ||
    surface.polygon.some(
      ring =>
        ring.length < 3 ||
        ring.some(
          point =>
            point.length !== 2 ||
            !point.every(value => Number.isFinite(value) && value >= 0 && value <= 1),
        ),
    )
  )
    throw new Error('Invalid surface polygon.')
  const point: [number, number] = [marker.u, marker.v]
  if (
    !inRing(surface.polygon[0], point) ||
    surface.polygon.slice(1).some(ring => inRing(ring, point))
  )
    throw new Error('Marker falls outside the associated surface.')
  return origin.map(
    (value, i) => value + right[i] * width * marker.u + up[i] * height * marker.v,
  ) as Point3
}
