// DOMAIN
import { centre, value, type IndoorData, type IndoorFeature } from './model'
import { contains } from './navigation/geometry'
import { polygonLabels } from './labels'
import { isConnector } from './spatial'
import { entranceEdges } from './connectionCorrections'
import type { EntranceSide, MapConnection } from './releases'

/** Find a point inside a facility, including concave footprints.
 * @param feature Source polygon. @returns Interior source XY coordinate.
 */
export function connectionAnchor(feature: IndoorFeature): [number, number] {
  return (
    polygonLabels(feature, point => [point[0], point[1]])[0]?.point ?? centre(feature)
  )
}

/** Read a comparable floor height without treating missing values as ground level.
 * @param level Source floor. @returns Elevation or ordinal, when present.
 */
function height(level: IndoorFeature): number | null {
  for (const key of ['level_z_value', 'level_ordinal']) {
    const raw = level.properties[key]
    if (raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw)))
      return Number(raw)
  }
  return null
}

/** Suggest another floor containing geometry at the selected source coordinate.
 * @param data Source map. @param leftFloor Origin floor ID. @param point Source XY.
 * @param source Optional selected facility. @param connections Current draft pairs.
 * @returns Ranked floor ID, or an empty selection when geometry does not overlap.
 * @remarks Existing destinations take precedence, then matching facilities, then floor geometry.
 * Elevation ranks candidates but never asserts escalator operating direction.
 */
export function suggestConnectionFloor(
  data: IndoorData,
  leftFloor: string,
  point: [number, number],
  source?: IndoorFeature,
  connections: MapConnection[] = [],
): string {
  const levels = data.level_polygon.features
  const origin = levels.find(level => value(level.properties, 'level_id') === leftFloor)
  const originHeight = origin ? height(origin) : null
  const sourceId = source ? value(source.properties, 'unit_id') : ''
  const existingFloors = new Set(
    connections
      .filter(c => c.enabled && (c.from === sourceId || c.to === sourceId))
      .map(c => (c.from === sourceId ? c.toLevel : c.fromLevel)),
  )
  const candidates = levels
    .filter(level => value(level.properties, 'level_id') !== leftFloor)
    .map(level => {
      const id = value(level.properties, 'level_id')
      const matching = data.unit_polygon.features.some(
        unit =>
          value(unit.properties, 'level_id') === id &&
          isConnector(value(unit.properties, 'unit_category')) &&
          (!source ||
            unit.properties.unit_category === source.properties.unit_category) &&
          contains(point, unit),
      )
      const z = height(level)
      return {
        id,
        matching,
        existing: existingFloors.has(id),
        covering: contains(point, level),
        distance:
          z !== null && originHeight !== null ? Math.abs(z - originHeight) : Infinity,
      }
    })
    .filter(candidate => candidate.matching || candidate.covering || candidate.existing)
  candidates.sort(
    (a, b) =>
      Number(b.existing) - Number(a.existing) ||
      Number(b.matching) - Number(a.matching) ||
      a.distance - b.distance ||
      a.id.localeCompare(b.id),
  )
  return candidates[0]?.id ?? ''
}

/** Build an explicit pair with storage-compatible travel direction.
 * @param left Selected left facility. @param right Selected right facility.
 * @param direction Travel relative to the two panes.
 * @returns Unpublished pair. @remarks Right-to-left travel reverses endpoints, not source geometry.
 */
export function createEditorConnection(
  left: IndoorFeature,
  right: IndoorFeature,
  direction: 'unknown' | 'both' | 'forward' | 'reverse',
): MapConnection {
  const reverse = direction === 'reverse'
  const from = reverse ? right : left,
    to = reverse ? left : right
  return {
    from: value(from.properties, 'unit_id'),
    to: value(to.properties, 'unit_id'),
    fromLevel: value(from.properties, 'level_id'),
    toLevel: value(to.properties, 'level_id'),
    category: value(left.properties, 'unit_category') as MapConnection['category'],
    evidence: 'aligned-footprints',
    enabled: true,
    direction:
      direction === 'unknown' ? null : direction === 'both' ? 'both' : 'forward',
  }
}

export type EditorDirection = 'both' | 'forward' | 'reverse' | 'unknown'

/** Cycle the editor's four travel states. @param direction Current pane-relative direction. @returns Next state. */
export function nextConnectionDirection(direction: EditorDirection): EditorDirection {
  const order: EditorDirection[] = ['both', 'forward', 'reverse', 'unknown']
  return order[(order.indexOf(direction) + 1) % order.length]
}

/** Change travel direction while retaining each physical endpoint's entrance.
 * @param connection Stored pair. @param leftId Left pane endpoint. @param direction New pane-relative travel.
 * @returns Updated draft pair without mutating the original.
 */
export function setConnectionDirection(
  connection: MapConnection,
  leftId: string,
  direction: EditorDirection,
): MapConnection {
  const reverse =
    direction === 'forward'
      ? connection.from !== leftId
      : direction === 'reverse'
        ? connection.from === leftId
        : false
  return {
    ...connection,
    ...(reverse
      ? {
          from: connection.to,
          to: connection.from,
          fromLevel: connection.toLevel,
          toLevel: connection.fromLevel,
          fromEntrance: connection.toEntrance,
          toEntrance: connection.fromEntrance,
        }
      : {}),
    direction:
      direction === 'unknown' ? null : direction === 'both' ? 'both' : 'forward',
  }
}

/** Find the nearest outer edge in the same coordinate plane as the pointer.
 * @param feature Facility polygon. @param point Pointer XY in projected coordinates.
 * @param project Source-to-view transform. @returns Stable exterior edge identity, or null for non-polygons.
 * @remarks Segment distance respects rotated geometry and never chooses hole boundaries.
 */
export function nearestEntranceSide(
  feature: IndoorFeature,
  point: [number, number],
  project: (point: number[]) => [number, number] = point => [point[0], point[1]],
): EntranceSide | null {
  let nearest: EntranceSide | null = null
  let distance = Infinity
  for (const edge of entranceEdges(feature)) {
    const a = project(edge.start),
      b = project(edge.end)
    const dx = b[0] - a[0],
      dy = b[1] - a[1]
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1),
      ),
    )
    const d = (point[0] - a[0] - t * dx) ** 2 + (point[1] - a[1] - t * dy) ** 2
    if (d < distance) {
      distance = d
      nearest = edge.side
    }
  }
  return nearest
}
