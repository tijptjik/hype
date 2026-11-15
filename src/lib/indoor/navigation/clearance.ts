// MODEL
import { distance, intersects, type Point } from './geometry'
import type { NavigationArea, NavigationFloor } from './types'

// TOC: Boundary distances | Preferred clearance | Shortcut cost

type Segment = { from: Point; to: Point }
export type Clearance = {
  at: (point: Point) => number
  weight: (clearance: number) => number
  along: (a: Point, b: Point) => number
  cost: (a: Point, b: Point) => number
}
const preferred = 3

/** Measures the shortest distance to a closed segment. @param p Point. @param a Segment start. @param b Segment end. @returns Metres. */
function pointDistance(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1]
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)),
  )
  return distance(p, [a[0] + t * dx, a[1] + t * dy])
}

/** Prepares wall and polygon boundary clearance in local metres. @param floor Floor barriers. @param area Walkable polygon including holes. @returns Clearance measurements and soft routing costs. @remarks Three metres is preferred, not required: narrow corridors and door approaches remain reachable. */
export function areaClearance(floor: NavigationFloor, area: NavigationArea): Clearance {
  const rings =
    area.geometry.geometry.type === 'Polygon'
      ? area.geometry.geometry.coordinates
      : area.geometry.geometry.type === 'MultiPolygon'
        ? area.geometry.geometry.coordinates.flat()
        : []
  const boundaries: Segment[] = [...floor.barriers]
  for (const ring of rings) {
    for (let i = 1; i < ring.length; i++)
      boundaries.push({ from: ring[i - 1] as Point, to: ring[i] as Point })
  }
  const at = (p: Point): number =>
    boundaries.reduce(
      (nearest, wall) => Math.min(nearest, pointDistance(p, wall.from, wall.to)),
      preferred,
    )
  const weight = (clearance: number): number =>
    1 + 8 * (1 - Math.min(preferred, clearance) / preferred) ** 2
  // Exact segment clearance prevents smoothing across thin obstacles or clipping a preferred wall margin.
  const along = (a: Point, b: Point): number =>
    boundaries.reduce(
      (nearest, wall) =>
        Math.min(
          nearest,
          intersects(a, b, wall.from, wall.to)
            ? 0
            : Math.min(
                pointDistance(a, wall.from, wall.to),
                pointDistance(b, wall.from, wall.to),
                pointDistance(wall.from, a, b),
                pointDistance(wall.to, a, b),
              ),
        ),
      preferred,
    )
  const cost = (a: Point, b: Point): number => {
    const length = distance(a, b),
      count = Math.max(1, Math.ceil(length / 0.375))
    let total = (weight(at(a)) + weight(at(b))) / 2
    for (let i = 1; i < count; i++)
      total += weight(
        at([a[0] + ((b[0] - a[0]) * i) / count, a[1] + ((b[1] - a[1]) * i) / count]),
      )
    return (length * total) / count
  }
  return { at, weight, along, cost }
}
