// GEOMETRY
import clipping, { type MultiPolygon } from 'polygon-clipping'
// DOMAIN
import {
  floorplanExtractionSchema,
  floorplanUnclassified,
  type FloorplanExtraction,
} from './extraction.js'

type Floor = FloorplanExtraction['floors'][number]
type Unit = Floor['units'][number]
/** Measure polygon area with interior rings removed. @param polygons Geometry. @returns Pixel area. */
function area(polygons: MultiPolygon): number {
  return polygons.reduce(
    (sum, polygon) =>
      sum +
      polygon.reduce((subtotal, ring, index) => {
        const signed = ring
          .slice(0, -1)
          .reduce((n, p, i) => n + p[0] * ring[i + 1][1] - ring[i + 1][0] * p[1], 0)
        return subtotal + Math.abs(signed / 2) * (index === 0 ? 1 : -1)
      }, 0),
    0,
  )
}
/** Audit gaps, overlaps and outside compartments without inventing room semantics.
 * @param floor Reviewed floor. @returns Coverage percentage and actionable geometry issues.
 */
export function auditFloor(floor: Floor): { coverage: number; issues: string[] } {
  const total = area([[floor.boundary, ...(floor.holes ?? [])]])
  const issues: string[] = []
  for (let i = 0; i < floor.units.length; i++) {
    const unit = floor.units[i]
    if (
      area(
        clipping.difference(
          [unit.polygon, ...(unit.holes ?? [])],
          [floor.boundary, ...(floor.holes ?? [])],
        ),
      ) > 1
    )
      issues.push(`${unit.label || unit.id} extends outside the floor boundary`)
    for (const other of floor.units.slice(i + 1))
      if (
        area(
          clipping.intersection(
            [unit.polygon, ...(unit.holes ?? [])],
            [other.polygon, ...(other.holes ?? [])],
          ),
        ) > 1
      )
        issues.push(`${unit.label || unit.id} overlaps ${other.label || other.id}`)
  }
  return {
    coverage: total ? 100 * (1 - area(floorplanUnclassified(floor)) / total) : 0,
    issues,
  }
}
/** Merge adjacent compartments while retaining the first identity and both evidence records.
 * @param left First compartment. @param right Adjacent compartment. @returns A single valid compartment.
 */
export function mergeUnits(left: Unit, right: Unit): Unit {
  if (left.locationId && right.locationId && left.locationId !== right.locationId)
    throw new Error(
      'Resolve the two canonical Unit identities before merging their polygons.',
    )
  const merged = clipping.union(
    [left.polygon, ...(left.holes ?? [])],
    [right.polygon, ...(right.holes ?? [])],
  )
  if (merged.length !== 1 || merged[0].length !== 1)
    throw new Error('Choose adjacent spaces whose union has no internal hole.')
  return {
    ...left,
    locationId: left.locationId ?? right.locationId,
    holes: [],
    polygon: merged[0][0] as [number, number][],
    confidence: Math.min(left.confidence, right.confidence),
    evidence: `${left.evidence}\nMerged with ${right.id}: ${right.evidence}`.slice(
      0,
      2000,
    ),
  }
}
/** Split a compartment along a chosen horizontal or vertical source-page coordinate.
 * @param unit Existing compartment. @param axis Cut orientation. @param coordinate Source pixels. @returns Two simple compartments.
 */
export function splitUnit(
  unit: Unit,
  axis: 'x' | 'y',
  coordinate: number,
): [Unit, Unit] {
  const box = (a: number, b: number, c: number, d: number): [number, number][][] => [
    [
      [a, b],
      [c, b],
      [c, d],
      [a, d],
      [a, b],
    ],
  ]
  const masks =
    axis === 'x'
      ? [box(0, 0, coordinate, 10000), box(coordinate, 0, 10000, 10000)]
      : [box(0, 0, 10000, coordinate), box(0, coordinate, 10000, 10000)]
  const parts = masks.map(mask =>
    clipping.intersection([unit.polygon, ...(unit.holes ?? [])], mask),
  )
  if (parts.some(part => part.length !== 1 || part[0].length !== 1 || area(part) <= 1))
    throw new Error('The cut must produce two simple spaces.')
  const result: Unit[] = parts.map((part, index) => ({
    ...unit,
    id: index ? `part-${crypto.randomUUID()}` : unit.id,
    locationId: index ? undefined : unit.locationId,
    holes: [],
    polygon: part[0][0] as [number, number][],
    evidence: `${unit.evidence}\nManually split for review.`.slice(0, 2000),
  }))
  return [result[0], result[1]]
}
/** Create a compartment from manually selected vertices, validated before insertion.
 * @param floor Source floor. @param vertices Ordered vertices. @returns Valid new unknown compartment.
 */
export function drawnUnit(floor: Floor, vertices: [number, number][]): Unit {
  const unit: Unit = {
    id: `part-${crypto.randomUUID()}`,
    label: '',
    category: 'unknown',
    polygon: [...vertices, vertices[0]],
    confidence: 0,
    evidence: 'Manually traced against the original source page.',
  }
  floorplanExtractionSchema.parse({
    warnings: [],
    floors: [{ ...floor, units: [unit] }],
  })
  return unit
}

/** Register two source anchors to two shared-scene anchors with a similarity transform.
 * @param floor Source diagram. @param source Two original-page points. @param target Corresponding scene points.
 * @returns Explicit translation, rotation and uniform scale; no geographic precision is inferred.
 */
export function alignFloorAnchors(
  floor: Floor,
  source: [[number, number], [number, number]],
  target: [[number, number], [number, number]],
): NonNullable<Floor['alignment']> {
  const dx = source[1][0] - source[0][0],
    dy = source[1][1] - source[0][1]
  const tx = target[1][0] - target[0][0],
    ty = target[1][1] - target[0][1]
  const distance = Math.hypot(dx, dy),
    targetDistance = Math.hypot(tx, ty)
  if (distance < 1 || targetDistance < 1)
    throw new Error('Choose two distinct anchors in both coordinate systems.')
  const scale = targetDistance / distance
  const angle = Math.atan2(ty, tx) - Math.atan2(dy, dx)
  const left = Math.min(...floor.boundary.map(p => p[0])),
    top = Math.min(...floor.boundary.map(p => p[1]))
  const x = (source[0][0] - left) * scale,
    y = (source[0][1] - top) * scale
  const alignment = {
    x: target[0][0] - x * Math.cos(angle) + y * Math.sin(angle),
    y: target[0][1] - x * Math.sin(angle) - y * Math.cos(angle),
    scale,
    rotation: (((angle * 180) / Math.PI + 540) % 360) - 180,
  }
  floorplanExtractionSchema.parse({ warnings: [], floors: [{ ...floor, alignment }] })
  return alignment
}

/** Replace an outline or add a true void, rejecting holes outside their enclosing outline.
 * @param floor Source diagram. @param vertices Traced vertices. @param target Outline being edited. @param unit Optional compartment.
 * @returns Nothing; mutates only the reviewed outline after validation.
 */
export function editOutline(
  floor: Floor,
  vertices: [number, number][],
  target: 'boundary' | 'floor-hole' | 'unit-hole',
  unit?: Unit,
): void {
  const ring = drawnUnit(floor, vertices).polygon
  if (target === 'boundary') {
    if (
      (floor.holes ?? []).some(hole => area(clipping.difference([hole], [ring])) > 0.01)
    )
      throw new Error('The boundary must contain every existing void.')
    floor.boundary = ring
    return
  }
  const owner = target === 'floor-hole' ? floor : unit
  if (!owner) throw new Error('Select a space first.')
  const boundary = 'boundary' in owner ? owner.boundary : owner.polygon
  if (
    area(clipping.difference([ring], [boundary])) > 0.01 ||
    (owner.holes ?? []).some(hole => area(clipping.intersection([hole], [ring])) > 0.01)
  )
    throw new Error(
      'A void must be inside its outline and must not overlap another void.',
    )
  owner.holes = [...(owner.holes ?? []), ring]
}
