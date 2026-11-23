// DOMAIN
import { value, type IndoorFeature } from './model'
// TYPES
import type { ConnectorRelief } from './connectorRelief'
import type { NetworkAnnotation } from './networkAnnotations'
import type { StationProjection } from './scene'

/** Find the first inside-to-outside crossing of an ordered network path.
 * @param outline Closed connector polygon ring.
 * @param path Network vertices ordered from the station landing toward outside.
 * @returns The crossed edge index, or undefined for absent or ambiguous corner crossings.
 */
export function outdoorBoundaryEdge(
  outline: number[][],
  path: number[][],
): number | undefined {
  const origin = outline[0]
  const mx = Math.cos((origin[1] * Math.PI) / 180)
  const local = (p: number[]): number[] => [(p[0] - origin[0]) * mx, p[1] - origin[1]]
  const ring = outline.map(local),
    route = path.map(local)
  const cross = (a: number[], b: number[]): number => a[0] * b[1] - a[1] * b[0]
  const sub = (a: number[], b: number[]): number[] => [a[0] - b[0], a[1] - b[1]]
  const inside = (p: number[]): boolean => {
    let result = false
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1],
        b = ring[i]
      if (
        a[1] > p[1] !== b[1] > p[1] &&
        p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        result = !result
    }
    return result
  }
  const at = (position: number): number[] => {
    const index = Math.max(0, Math.min(route.length - 2, Math.floor(position)))
    const t = position - index
    return route[index].map((v, j) => v + (route[index + 1][j] - v) * t)
  }
  const hits: { position: number; edge: number }[] = []
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1],
      r = sub(route[i], a)
    for (let j = 1; j < ring.length; j++) {
      const b = ring[j - 1],
        v = sub(ring[j], b),
        denominator = cross(r, v)
      if (Math.abs(denominator) < 1e-20) continue
      const offset = sub(b, a),
        t = cross(offset, v) / denominator,
        u = cross(offset, r) / denominator
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1)
        hits.push({ position: i - 1 + t, edge: j - 1 })
    }
  }
  hits.sort((a, b) => a.position - b.position)
  for (const hit of hits) {
    if (!inside(at(hit.position - 1e-5)) || inside(at(hit.position + 1e-5))) continue
    const edges = new Set(
      hits
        .filter(other => Math.abs(other.position - hit.position) < 1e-7)
        .map(other => other.edge),
    )
    return edges.size === 1 ? hit.edge : undefined
  }
  return undefined
}

/** Draw the surveyed connector footprint while retaining source travel metadata.
 * @param unit Original indoor footprint.
 * @param annotation Source network association and travel direction.
 * @param projection Current floor camera.
 * @returns One sloping surface bounded by the exact source polygon, with an outdoor boundary stroke.
 * @remarks Routing centrelines establish connectivity, not the width, sides or landing geometry
 * of a three-dimensional flight. Rise is schematic within the original polygon, capped at 1.8 metres and a 30-degree
 * angle to the horizontal. This is a display limit, not a surveyed gradient; no exterior footprint is invented.
 */
export function networkConnectorPlan(
  unit: IndoorFeature,
  annotation: NetworkAnnotation,
  projection: StationProjection,
): ConnectorRelief {
  const floor = value(unit.properties, 'level_id')
  if (unit.geometry.type !== 'Polygon')
    throw new Error('Connector footprint must be a polygon')
  const outline = unit.geometry.coordinates[0]
  const mx = 111320 * Math.cos((annotation.entrance[1] * Math.PI) / 180)
  const edges = outline.slice(1).map((b, i) => ({ a: outline[i], b }))
  const edgeIndex = outdoorBoundaryEdge(outline, annotation.path)
  const outward = edgeIndex === undefined ? undefined : edges[edgeIndex]
  let axis = [
    (annotation.destination[0] - annotation.entrance[0]) * mx,
    (annotation.destination[1] - annotation.entrance[1]) * 111320,
  ]
  if (outward) {
    // The opening spans the flight width: the fall runs across it, never along it.
    const edgeX = (outward.b[0] - outward.a[0]) * mx
    const edgeY = (outward.b[1] - outward.a[1]) * 111320
    axis = [-edgeY, edgeX]
    const centre = outline
      .slice(0, -1)
      .reduce((sum, p) => [sum[0] + p[0], sum[1] + p[1]], [0, 0])
      .map(v => v / (outline.length - 1))
    const towardOpening = [
      ((outward.a[0] + outward.b[0]) / 2 - centre[0]) * mx,
      ((outward.a[1] + outward.b[1]) / 2 - centre[1]) * 111320,
    ]
    if (axis[0] * towardOpening[0] + axis[1] * towardOpening[1] < 0)
      axis = axis.map(v => -v)
  }
  const along = (p: number[]): number =>
    (p[0] - annotation.entrance[0]) * mx * axis[0] +
    (p[1] - annotation.entrance[1]) * 111320 * axis[1]
  const positions = outline.map(along)
  const minimum = Math.min(...positions),
    maximum = Math.max(...positions)
  const progress = (p: number[]): number =>
    Math.max(0, Math.min(1, (along(p) - minimum) / (maximum - minimum || 1)))
  const axisLength = Math.hypot(...axis)
  const run = axisLength ? (maximum - minimum) / axisLength : 0
  // Bound the displayed drop by the actual footprint run, not the longer network edge.
  const rise =
    Math.sign(annotation.rise) *
    Math.min(Math.abs(annotation.rise), 1.8, run * Math.tan(Math.PI / 6))
  const project = (p: number[]) => projection.project(p, floor, rise * progress(p))
  const line = (points: number[][]): string =>
    points.map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`).join(' ')
  const surface = unit.geometry.coordinates
    .map(ring => `${line(ring.map(project))}Z`)
    .join(' ')
  const surfaces = [surface]
  const visibleFaces: string[] = []
  const faceLighting: ConnectorRelief['faceLighting'] = []
  const outdoorEdge = outward
    ? line([project(outward.a), project(outward.b)])
    : undefined
  // Draw schematic tread contours at equal progress, clipped to the actual polygon.
  const treadLines: string[] = []
  if (annotation.category === 'steps' || annotation.category === 'stairs') {
    const count = Math.min(80, Math.max(2, Math.round(run / 0.3)))
    for (let i = 1; i < count; i++) {
      const target = minimum + ((maximum - minimum) * i) / count
      const intersections: number[][] = []
      for (const ring of unit.geometry.coordinates) {
        for (let j = 1; j < ring.length; j++) {
          const a = ring[j - 1],
            b = ring[j],
            av = along(a),
            bv = along(b)
          if (!((av <= target && bv > target) || (bv <= target && av > target)))
            continue
          const t = (target - av) / (bv - av)
          intersections.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
        }
      }
      intersections.sort(
        (a, b) => -(a[0] - b[0]) * mx * axis[1] + (a[1] - b[1]) * 111320 * axis[0],
      )
      for (let j = 1; j < intersections.length; j += 2)
        treadLines.push(
          line([project(intersections[j - 1]), project(intersections[j])]),
        )
    }
  }
  const near = outline[positions.indexOf(minimum)],
    far = outline[positions.indexOf(maximum)]
  const entrance = project(near),
    farEnd = project(far)
  for (const edge of edges) {
    if (edge === outward) continue
    const baseA = projection.project(edge.a, floor),
      baseB = projection.project(edge.b, floor)
    const topA = project(edge.a),
      topB = project(edge.b)
    if (Math.abs(topA[1] - baseA[1]) + Math.abs(topB[1] - baseB[1]) < 0.001) continue
    visibleFaces.push(`${line([baseA, baseB, topB, topA])}Z`)
    faceLighting.push({ upper: baseA, lower: topB })
  }
  return {
    exterior: annotation.exterior,
    descending: annotation.rise < 0,
    sourceEdge: annotation.edgeId,
    sourceTravel:
      annotation.travel === 'both'
        ? 'both'
        : annotation.travel === 'outward'
          ? 'depart'
          : 'arrive',
    opening: projection.path(unit),
    bridges: [],
    bridgeFaces: [],
    depthEdges: [],
    recessFaces: [],
    visibleFaces,
    faceLighting,
    surface,
    surfaces,
    outdoorEdge,
    exteriorTreads: treadLines.join(' '),
    surfaceLighting:
      annotation.rise < 0
        ? { upper: entrance, lower: farEnd }
        : { upper: farEnd, lower: entrance },
    paintDepth: entrance[1],
    entrance,
    farEnd,
    line: feature => {
      const g = feature.geometry
      if (g.type === 'LineString') return line(g.coordinates.map(project))
      if (g.type === 'Polygon')
        return g.coordinates.map(r => `${line(r.map(project))}Z`).join(' ')
      return projection.path(feature)
    },
  }
}
