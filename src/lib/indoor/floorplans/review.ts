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
  const total = area([[floor.boundary]])
  const issues: string[] = []
  for (let i = 0; i < floor.units.length; i++) {
    const unit = floor.units[i]
    if (area(clipping.difference([unit.polygon], [floor.boundary])) > 1)
      issues.push(`${unit.label || unit.id} extends outside the floor boundary`)
    for (const other of floor.units.slice(i + 1))
      if (area(clipping.intersection([unit.polygon], [other.polygon])) > 1)
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
  const merged = clipping.union([left.polygon], [right.polygon])
  if (merged.length !== 1 || merged[0].length !== 1)
    throw new Error('Choose adjacent spaces whose union has no internal hole.')
  return {
    ...left,
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
  const parts = masks.map(mask => clipping.intersection([unit.polygon], mask))
  if (parts.some(part => part.length !== 1 || part[0].length !== 1 || area(part) <= 1))
    throw new Error('The cut must produce two simple spaces.')
  return parts.map((part, index) => ({
    ...unit,
    id: index ? `part-${crypto.randomUUID()}` : unit.id,
    polygon: part[0][0] as [number, number][],
    evidence: `${unit.evidence}\nManually split for review.`.slice(0, 2000),
  })) as [Unit, Unit]
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
