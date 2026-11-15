// SOURCE MODEL
import { bounds, centre, value, type IndoorData, type IndoorFeature } from '../model'
import { connectionCandidates } from '../spatial'
// NAVIGATION MODEL
import { FloorRepository } from './floors'
import { contains, distance, type Point } from './geometry'
import { IndoorRouter } from './router'
import type {
  Access,
  NavigationConnection,
  NavigationFloor,
  RouteEndpoint,
} from './types'

// TOC: Coordinate adapter | Floor modules | Source openings | Evidenced lifts

/** Finds an interior point without assuming a polygon's bounding-box centre lies inside. @param feature Planar polygon. @returns Interior point when one can be sampled. */
function interior(feature: IndoorFeature): Point | undefined {
  const middle = centre(feature)
  if (contains(middle, feature)) return middle
  const [x0, y0, x1, y1] = bounds(feature)
  for (let x = x0 + 0.15; x < x1; x += 0.3)
    for (let y = y0 + 0.15; y < y1; y += 0.3)
      if (contains([x, y], feature)) return [x, y]
  return undefined
}

/** Adapts immutable Lands Department records into independent metre-based floor modules.
 * @param data Complete source snapshot.
 * @returns Floor loader, cached router, source endpoint adapter and geographic output conversion.
 * @remarks Fare-gate points alone never create paid/unpaid transitions. Source opening associations are preview evidence, not verified access permissions.
 */
export function adaptLandsD(data: IndoorData): {
  floors: FloorRepository
  router: IndoorRouter
  connections: NavigationConnection[]
  world: (point: Point) => Point
  endpoint: (feature: IndoorFeature, floorId: string, areaId?: string) => RouteEndpoint
} {
  const origin = centre(data.venue_polygon.features[0]),
    mx = 111320 * Math.cos((origin[1] * Math.PI) / 180)
  const local = (p: number[]): Point => [
    (p[0] - origin[0]) * mx,
    (p[1] - origin[1]) * 111320,
  ]
  const world = (p: Point): Point => [origin[0] + p[0] / mx, origin[1] + p[1] / 111320]
  const transform = (feature: IndoorFeature): IndoorFeature => {
    const visit = (coordinates: unknown): unknown =>
      Array.isArray(coordinates)
        ? typeof coordinates[0] === 'number'
          ? local(coordinates as number[])
          : coordinates.map(visit)
        : coordinates
    return {
      ...feature,
      geometry:
        'coordinates' in feature.geometry
          ? ({
              ...feature.geometry,
              coordinates: visit(feature.geometry.coordinates),
            } as IndoorFeature['geometry'])
          : feature.geometry,
    }
  }
  const walkable = new Set([
    'walkway',
    'lobby',
    'elevator',
    'ramp',
    'stairs',
    'steps',
    'escalator',
    'platform',
    'movingwalkway',
  ])
  const rooms = new Set(
    data.occupant_point.features.map(f => value(f.properties, 'unit_id')),
  )
  const floors = new Map<string, NavigationFloor>()
  for (const source of data.level_polygon.features) {
    const id = value(source.properties, 'level_id')
    floors.set(id, {
      id,
      name: value(source.properties, 'level_name_en'),
      elevation: Number(source.properties.level_z_value),
      areas: [],
      accessPoints: [],
      barriers: [],
    })
  }
  for (const source of data.unit_polygon.features) {
    const id = value(source.properties, 'unit_id'),
      category = value(source.properties, 'unit_category'),
      floor = floors.get(value(source.properties, 'level_id'))
    if (!floor || (!walkable.has(category) && !rooms.has(id))) continue
    const section = value(source.properties, 'section_name_en'),
      access: Access =
        section === 'Unpaid area'
          ? 'unpaid'
          : section === 'Paid area'
            ? 'paid'
            : 'unknown'
    floor.areas.push({
      id,
      geometry: transform(source),
      access,
      transit: walkable.has(category),
    })
  }
  const connections: NavigationConnection[] = []
  // Associate an actual opening line with the polygons on opposite sides of its midpoint.
  // Crossing fare zones requires a separately reviewed faregate connection, never this proximity association.
  for (const source of data.opening_line.features) {
    if (
      !['pedestrian', 'pedestrian.principal'].includes(
        value(source.properties, 'opening_category'),
      )
    )
      continue
    if (source.properties.opening_access_control != null) continue
    const floor = floors.get(value(source.properties, 'level_id')),
      opening = transform(source)
    if (!floor || opening.geometry.type !== 'LineString') continue
    const line = opening.geometry.coordinates,
      a = line[0],
      b = line.at(-1)
    if (!b) continue
    const length = distance(a, b)
    if (length < 0.01) continue
    const middle: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      normal: Point = [-(b[1] - a[1]) / length, (b[0] - a[0]) / length]
    const side = (sign: number) => {
      for (let offset = 0.15; offset <= 1.2; offset += 0.15) {
        const point: Point = [
          middle[0] + normal[0] * offset * sign,
          middle[1] + normal[1] * offset * sign,
        ]
        const areas = floor.areas.filter(area => contains(point, area.geometry))
        if (areas.length === 1) return { point, area: areas[0] }
        if (areas.length > 1) return undefined
      }
      return undefined
    }
    const from = side(-1),
      to = side(1)
    if (
      !from ||
      !to ||
      from.area.id === to.area.id ||
      from.area.access !== to.area.access ||
      from.area.access === 'unknown'
    )
      continue
    const id = value(source.properties, 'opening_id'),
      fromId = `${id}:from`,
      toId = `${id}:to`
    floor.accessPoints.push(
      { id: fromId, areaId: from.area.id, point: from.point },
      { id: toId, areaId: to.area.id, point: to.point },
    )
    connections.push({
      id,
      from: { floorId: floor.id, accessPointId: fromId },
      to: { floorId: floor.id, accessPointId: toId },
      kind: 'door',
      direction: 'both',
      evidence: 'source-opening',
      sourceIds: [id],
      enabled: true,
    })
  }
  // Preserve the existing matching-code and reviewed-layout evidence, separate from display candidates.
  for (const c of connectionCandidates(data)) {
    // The layout establishes escalator destinations, but not operating direction.
    if (
      c.evidence === 'aligned-footprints' ||
      c.enabled === false ||
      c.direction === null ||
      (c.category === 'escalator' && !c.direction)
    )
      continue
    const from = floors.get(c.fromLevel),
      to = floors.get(c.toLevel),
      a = from?.areas.find(x => x.id === c.from),
      b = to?.areas.find(x => x.id === c.to)
    if (!from || !to || !a || !b) continue
    const pa = interior(a.geometry),
      pb = interior(b.geometry)
    if (!pa || !pb) continue
    const id = `${c.from}:${c.to}`
    from.accessPoints.push({ id, areaId: a.id, point: pa })
    to.accessPoints.push({ id, areaId: b.id, point: pb })
    connections.push({
      id,
      from: { floorId: from.id, accessPointId: id },
      to: { floorId: to.id, accessPointId: id },
      kind:
        c.category === 'elevator'
          ? 'lift'
          : c.category === 'escalator'
            ? 'escalator'
            : c.category === 'ramp'
              ? 'ramp'
              : 'stairs',
      direction: c.direction ?? 'both',
      evidence: c.evidence,
      sourceIds: [c.from, c.to],
      enabled: true,
    })
  }
  const repository = new FloorRepository([...floors.keys()], async id => {
    const floor = floors.get(id)
    if (!floor) throw new Error('Unknown source floor')
    return floor
  })
  const endpoint = (
    feature: IndoorFeature,
    floorId: string,
    areaId?: string,
  ): RouteEndpoint => ({
    floorId,
    ...(areaId ? { areaId } : { point: local(centre(feature)) }),
  })
  return {
    floors: repository,
    router: new IndoorRouter(repository, connections),
    connections,
    world,
    endpoint,
  }
}
