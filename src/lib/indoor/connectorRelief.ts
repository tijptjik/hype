// DATA
import { footprintFrame } from './geometry'
import { contains } from './navigation/geometry'
import { connectionCandidates } from './spatial'
import { value, type IndoorData, type IndoorFeature } from './model'
import type { Point, StationProjection } from './scene'
import type { Position } from 'geojson'

export type ConnectorRelief = {
  descending: boolean
  opening: string
  bridges: string[]
  surface: string
  depthEdges: string[]
  recessFaces: string[]
  visibleFaces: string[]
  paintDepth: number
  entrance: Point
  farEnd: Point
  line: (feature: IndoorFeature) => string
}

/** Infers schematic connector slopes from landing access and neighbouring floors.
 * @param data Source map, including floor geometry and access sections.
 * @param projection Current floor camera projection.
 * @returns Relief by source unit ID; ambiguous approaches remain flat.
 * @remarks Visual inference only: never establishes routing or escalator operating direction.
 * Geographic footprints are required; image plans retain their original artwork.
 */
export function connectorReliefs(
  data: IndoorData,
  projection: StationProjection,
): Map<string, ConnectorRelief> {
  return prepareConnectorReliefs(data)(projection)
}

/** Prepare source-only slope inference once for a loaded immutable snapshot.
 * @param data Source map with floor geometry and access sections.
 * @returns A camera projector that preserves independent results for every frame.
 * @remarks Recreate when the snapshot changes; camera movement does not change connectivity.
 */
export function prepareConnectorReliefs(
  data: IndoorData,
): (projection: StationProjection) => Map<string, ConnectorRelief> {
  const builders = new Map<
    string,
    (projection: StationProjection, result: Map<string, ConnectorRelief>) => void
  >()
  const profiles = new Map<
    string,
    {
      unit: IndoorFeature
      descending: boolean
      length: number
      axis: Point
      project: (projection: StationProjection, point: Position) => Point
    }
  >()
  const corners = new Map<string, Position[]>()
  if (data.coordinateSpace === 'image-pixels') return () => new Map()
  const connections = connectionCandidates(data)
  const walkable = new Set(['walkway', 'lobby', 'platform', 'movingwalkway'])
  for (const unit of data.unit_polygon.features) {
    if (
      !['stairs', 'steps', 'escalator', 'ramp'].includes(
        value(unit.properties, 'unit_category'),
      )
    )
      continue
    const frame = footprintFrame(unit)
    if (!frame || unit.geometry.type !== 'Polygon') continue
    const id = value(unit.properties, 'unit_id')
    const levelId = value(unit.properties, 'level_id')
    const floor = data.level_polygon.features.find(
      f => f.properties.level_id === levelId,
    )
    if (!floor) continue
    const neighbours = connections.filter(c => c.from === id || c.to === id)
    const directions = new Set(
      neighbours
        .map(c => {
          const other = data.level_polygon.features.find(
            f => f.properties.level_id === (c.from === id ? c.toLevel : c.fromLevel),
          )
          return Math.sign(
            Number(other?.properties.level_ordinal) -
              Number(floor.properties.level_ordinal),
          )
        })
        .filter(n => Number.isFinite(n) && n !== 0),
    )
    if (directions.size !== 1) continue
    const direction = [...directions][0]
    const peers = data.unit_polygon.features.filter(
      f => f !== unit && f.properties.level_id === levelId,
    )
    const length = frame.maxU - frame.minU
    if (length <= 0) continue
    // Probe across both landing widths and along the approach, not only at one centre point.
    const score = (end: number): number => {
      let total = 0
      for (const distance of [0.25, 0.6, 1]) {
        for (const fraction of [0.25, 0.5, 0.75]) {
          const point = frame.world(
            (end < 0 ? frame.minU : frame.maxU) + end * distance,
            frame.minV + (frame.maxV - frame.minV) * fraction,
          )
          const touching = peers.filter(f => contains(point, f))
          if (
            !contains(point, floor) ||
            touching.some(f =>
              ['room', 'retail', 'foodservice', 'wall', 'restricted'].includes(
                value(f.properties, 'unit_category'),
              ),
            )
          )
            return -Infinity
          const access = touching.filter(f =>
            walkable.has(value(f.properties, 'unit_category')),
          )
          total += access.length ? 1 : 0
          if (access.some(f => value(f.properties, 'section_name_en') === 'Paid area'))
            total +=
              value(unit.properties, 'section_name_en') === 'Unpaid area' ? -2 : 2
        }
      }
      return total
    }
    const start = score(-1),
      end = score(1)
    if (Math.max(start, end) <= 0 || Math.abs(start - end) < 3 || start === end)
      continue
    const entranceAtStart = start > end
    const a = frame.world(frame.minU, (frame.minV + frame.maxV) / 2)
    const b = frame.world(frame.maxU, (frame.minV + frame.maxV) / 2)
    const metresX = 111320 * Math.cos((a[1] * Math.PI) / 180)
    const axis = [(b[0] - a[0]) * metresX, (b[1] - a[1]) * 111320]
    const norm = axis[0] ** 2 + axis[1] ** 2
    // Every schematic flight reaches the same destination height; length only changes its grade.
    const rise = 1.8
    const progress = (point: Position): number => {
      const along = Math.max(
        0,
        Math.min(
          1,
          ((point[0] - a[0]) * metresX * axis[0] +
            (point[1] - a[1]) * 111320 * axis[1]) /
            norm,
        ),
      )
      return entranceAtStart ? along : 1 - along
    }
    const rawProject = (projection: StationProjection, point: Position): Point => {
      return projection.project(point, levelId, direction * rise * progress(point))
    }
    profiles.set(id, {
      unit,
      descending: direction < 0,
      length,
      axis: entranceAtStart ? [axis[0], axis[1]] : [-axis[0], -axis[1]],
      project: rawProject,
    })
    const outline = unit.geometry.coordinates[0]
    builders.set(id, (projection, result) => {
      const project = (point: Position): Point => rawProject(projection, point)
      const line = (feature: IndoorFeature): string => {
        const path = (points: Position[]): string =>
          points.map((p, i) => `${i ? 'L' : 'M'}${project(p).join(',')}`).join(' ')
        if (feature.geometry.type === 'Polygon')
          return feature.geometry.coordinates.map(r => `${path(r)}Z`).join(' ')
        return feature.geometry.type === 'LineString'
          ? path(feature.geometry.coordinates)
          : ''
      }
      // Open corner strokes expose the drop without adding partitions between parallel flights.
      const farCorners = outline.slice(0, -1).filter(point => progress(point) > 0.95)
      corners.set(id, farCorners)
      const depthEdges = farCorners.flatMap(point => {
        const top = projection.project(point, levelId)
        const bottom = project(point)
        if (Math.hypot(bottom[0] - top[0], bottom[1] - top[1]) < 0.001) return []
        return [`M${top.join(',')} L${bottom.join(',')}`]
      })
      // Build only exposed recess edges; a nearby incline leaves the shared side open.
      const visibleFaces: string[] = []
      const projectedOutline = outline.map(point => projection.project(point, levelId))
      const winding = projectedOutline.slice(1).reduce((sum, point, index) => {
        const previous = projectedOutline[index]
        return sum + previous[0] * point[1] - point[0] * previous[1]
      }, 0)
      const recessFaces = outline.slice(1).flatMap((point, index) => {
        const previous = outline[index]
        const dx = point[0] - previous[0],
          dy = point[1] - previous[1]
        const norm = dx * dx + dy * dy
        if (!norm) return []
        const fraction = (p: Position): number =>
          Math.max(
            0,
            Math.min(1, ((p[0] - previous[0]) * dx + (p[1] - previous[1]) * dy) / norm),
          )
        const isFarEnd = progress(previous) > 0.95 && progress(point) > 0.95
        const covered = isFarEnd
          ? []
          : pairs
              .filter(pair => pair.a === id || pair.b === id)
              .flatMap(pair => {
                const edge =
                  pair.a === id ? pair.ring.slice(0, 2) : pair.ring.slice(2, 4)
                // Only the matching parallel side is covered, not the opposite perimeter edge.
                const onEdge = (p: Position): boolean => {
                  const t = fraction(p)
                  return (
                    Math.hypot(
                      (p[0] - previous[0] - t * dx) * metresX,
                      (p[1] - previous[1] - t * dy) * 111320,
                    ) < 0.02
                  )
                }
                if (!edge.every(onEdge)) return []
                return [
                  [Math.min(...edge.map(fraction)), Math.max(...edge.map(fraction))],
                ]
              })
        const cuts = [...new Set([0, 1, ...covered.flat()])].sort((a, b) => a - b)
        return cuts.slice(1).flatMap((end, i) => {
          const start = cuts[i],
            middle = (start + end) / 2
          if (end - start < 1e-8) return []
          if (covered.some(([lo, hi]) => middle >= lo && middle <= hi)) return []
          const from = [previous[0] + start * dx, previous[1] + start * dy]
          const to = [previous[0] + end * dx, previous[1] + end * dy]
          const topA = projection.project(from, levelId),
            topB = projection.project(to, levelId)
          const bottomA = project(from),
            bottomB = project(to)
          if (Math.abs(topA[1] - bottomA[1]) + Math.abs(topB[1] - bottomB[1]) < 0.001)
            return []
          const face =
            [topA, topB, bottomB, bottomA]
              .map((p, i) => `${i ? 'L' : 'M'}${p.join(',')}`)
              .join(' ') + 'Z'
          // A raised solid exposes only perimeter faces pointing toward the camera.
          if (direction < 0 || (topB[0] - topA[0]) * winding < -1e-8) {
            visibleFaces.push(face)
          }
          return [face]
        })
      })
      result.set(id, {
        descending: direction < 0,
        opening: projection.path(unit),
        bridges: [],
        surface: line(unit),
        depthEdges,
        recessFaces,
        visibleFaces,
        paintDepth: projection.project(
          frame.world((frame.minU + frame.maxU) / 2, (frame.minV + frame.maxV) / 2),
          levelId,
        )[1],
        entrance: projection.project(entranceAtStart ? a : b, levelId),
        farEnd: project(entranceAtStart ? b : a),
        line,
      })
    })
  }
  // Group neighbouring parallel flights for occlusion while preserving each independent incline.
  const pairs: { a: string; b: string; ring: Position[] }[] = []
  const ids = [...profiles.keys()]
  const parents = new Map(ids.map(id => [id, id]))
  const root = (id: string): string => {
    while (parents.get(id) !== id) id = parents.get(id)!
    return id
  }
  for (let i = 0; i < ids.length; i++) {
    for (const bId of ids.slice(i + 1)) {
      const aId = ids[i],
        a = profiles.get(aId)!,
        b = profiles.get(bId)!
      if (
        a.descending !== b.descending ||
        a.unit.properties.level_id !== b.unit.properties.level_id
      )
        continue
      const alignment =
        (a.axis[0] * b.axis[0] + a.axis[1] * b.axis[1]) /
        (Math.hypot(...a.axis) * Math.hypot(...b.axis))
      if (alignment < 0.95) continue
      const ring = sharedSide(a.unit, b.unit)
      if (!ring) continue
      pairs.push({ a: aId, b: bId, ring })
      parents.set(root(bId), root(aId))
    }
  }
  return projection => {
    const result = new Map<string, ConnectorRelief>()
    for (const build of builders.values()) build(projection, result)
    // Join actual slope edges: the shared face spans only their elevation difference, never floor height.
    for (const pair of pairs) {
      const profile = profiles.get(pair.a)!
      const neighbour = profiles.get(pair.b)!
      const path = (points: Point[]): string =>
        points.map((point, i) => `${i ? 'L' : 'M'}${point.join(',')}`).join(' ') + 'Z'
      result
        .get(pair.a)!
        .bridges.push(
          path(
            pair.ring.map((point, index) =>
              (index < 2 ? profile : neighbour).project(projection, point),
            ),
          ),
        )
      const gap = path(
        pair.ring.map(point =>
          projection.project(point, value(profile.unit.properties, 'level_id')),
        ),
      )
      for (const id of ids.filter(id => root(id) === root(pair.a)))
        result.get(id)!.opening += ` ${gap}`
    }
    const openings = new Map(ids.map(id => [id, result.get(id)!.opening]))
    for (const id of ids) {
      result.get(id)!.opening = ids
        .filter(other => root(other) === root(id))
        .map(other => openings.get(other))
        .join(' ')
    }
    // Only the outside corners of adjoining descending flights receive vertical depth strokes.
    for (const [id, relief] of result) {
      if (!relief.descending || !relief.depthEdges.length) continue
      const unit = data.unit_polygon.features.find(f => f.properties.unit_id === id)!
      const neighbours = data.unit_polygon.features.filter(
        f =>
          f.properties.level_id === unit.properties.level_id &&
          f.properties.unit_id !== id &&
          pairs.some(
            pair =>
              (pair.a === id && pair.b === value(f.properties, 'unit_id')) ||
              (pair.b === id && pair.a === value(f.properties, 'unit_id')),
          ),
      )
      relief.depthEdges = relief.depthEdges.filter((_, index) => {
        const point = corners.get(id)![index]
        return !neighbours.some(neighbour => nearFootprint(point, neighbour))
      })
    }
    return result
  }
}

/** Checks whether a corner adjoins another flight, allowing a narrow source-survey gap.
 * @param point Source corner in geographic coordinates.
 * @param feature Neighbouring connector footprint.
 * @returns Whether the corner lies within 1.2 metres of the footprint.
 */
function nearFootprint(point: Position, feature: IndoorFeature): boolean {
  if (contains(point, feature)) return true
  if (feature.geometry.type !== 'Polygon') return false
  const scaleX = 111320 * Math.cos((point[1] * Math.PI) / 180)
  const local = (p: Position): Point => [
    (p[0] - point[0]) * scaleX,
    (p[1] - point[1]) * 111320,
  ]
  return feature.geometry.coordinates[0].some((p, index, ring) => {
    if (!index) return false
    const a = local(ring[index - 1]),
      b = local(p)
    const dx = b[0] - a[0],
      dy = b[1] - a[1]
    const lengthSquared = dx * dx + dy * dy
    const t = lengthSquared
      ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / lengthSquared))
      : 0
    return Math.hypot(a[0] + t * dx, a[1] + t * dy) <= 1.2
  })
}

/** Finds nearby parallel long sides for a continuous shared slope.
 * @param a First footprint. @param b Second footprint.
 * @returns A source-space bridge polygon, or null when the flights are not alongside each other.
 */
function sharedSide(a: IndoorFeature, b: IndoorFeature): Position[] | null {
  if (a.geometry.type !== 'Polygon' || b.geometry.type !== 'Polygon') return null
  const frame = footprintFrame(a)
  if (!frame) return null
  const ringA = a.geometry.coordinates[0],
    ringB = b.geometry.coordinates[0]
  const scaleX = 111320 * Math.cos((ringA[0][1] * Math.PI) / 180)
  const distance = (p: Position, q: Position): number =>
    Math.hypot((p[0] - q[0]) * scaleX, (p[1] - q[1]) * 111320)
  for (let i = 1; i < ringA.length; i++) {
    const p = ringA[i - 1],
      q = ringA[i]
    if (distance(p, q) < (frame.maxU - frame.minU) * 0.7) continue
    for (let j = 1; j < ringB.length; j++) {
      let r = ringB[j - 1],
        s = ringB[j]
      if (distance(p, r) + distance(q, s) > distance(p, s) + distance(q, r))
        [r, s] = [s, r]
      const length = distance(p, q)
      const dx = ((q[0] - p[0]) * scaleX) / length,
        dy = ((q[1] - p[1]) * 111320) / length
      const along = (point: Position): number =>
        (point[0] - p[0]) * scaleX * dx + (point[1] - p[1]) * 111320 * dy
      const across = (point: Position): number =>
        Math.abs(-(point[0] - p[0]) * scaleX * dy + (point[1] - p[1]) * 111320 * dx)
      const rAlong = along(r),
        sAlong = along(s)
      const start = Math.max(0, rAlong),
        end = Math.min(length, sAlong)
      if (
        sAlong <= rAlong ||
        across(r) > 1.2 ||
        across(s) > 1.2 ||
        end - start < Math.min(length, distance(r, s)) * 0.6
      )
        continue
      const interpolate = (a: Position, b: Position, t: number): Position => [
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
      ]
      return [
        interpolate(p, q, start / length),
        interpolate(p, q, end / length),
        interpolate(r, s, (end - rAlong) / (sAlong - rAlong)),
        interpolate(r, s, (start - rAlong) / (sAlong - rAlong)),
      ]
    }
  }
  return null
}
