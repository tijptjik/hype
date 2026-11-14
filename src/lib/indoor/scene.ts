// DATA
import { centre, value, type IndoorData, type IndoorFeature } from './model'
import { brandFootprint } from './geometry'
import type { Position } from 'geojson'
export type Point = [number, number]
export type StationProjection = {
  project: (p: Position, level: string) => Point
  path: (feature: IndoorFeature) => string
  box: (features: IndoorFeature[]) => [number, number, number, number]
  anchor: (feature: IndoorFeature) => Point
  logo: (feature: IndoorFeature, aspect?: number, padding?: number) => string
}
/** Creates an orthographic floor projection with schematic vertical separation.
 * @param data Station snapshot. @param exploded Whether to separate floors vertically. @param camera Camera angles and schematic spacing.
 * @returns Geometry projection helpers. @remarks Source coordinates stay untouched.
 */
export function stationProjection(
  data: IndoorData,
  exploded: boolean,
  camera: { bearing?: number; tilt?: number; spacing?: number } = {},
): StationProjection {
  const origin = centre(data.venue_polygon.features[0])
  const ordinals = [
    ...new Set(
      data.level_polygon.features.map(f => Number(f.properties.level_ordinal)),
    ),
  ].sort((a, b) => a - b)
  const heights = new Map(
    data.level_polygon.features.map(f => [
      value(f.properties, 'level_id'),
      ordinals.indexOf(Number(f.properties.level_ordinal)) * (camera.spacing ?? 24),
    ]),
  )
  const project = (p: Position, level: string): Point => {
    const x = (p[0] - origin[0]) * 111320 * Math.cos((origin[1] * Math.PI) / 180),
      y = (p[1] - origin[1]) * 111320
    const angle = ((camera.bearing ?? 30) * Math.PI) / 180
    const rx = x * Math.cos(angle) + y * Math.sin(angle),
      ry = -x * Math.sin(angle) + y * Math.cos(angle)
    return [
      rx,
      -ry * Math.cos(((camera.tilt ?? (exploded ? 55 : 0)) * Math.PI) / 180) -
        (exploded ? (heights.get(level) ?? 0) : 0),
    ]
  }
  const path = (feature: IndoorFeature): string => {
    const level = value(feature.properties, 'level_id')
    const line = (points: Position[]) =>
      points.map((p, i) => `${i ? 'L' : 'M'}${project(p, level).join(',')}`).join(' ')
    const g = feature.geometry
    if (g.type === 'Polygon') return g.coordinates.map(r => `${line(r)}Z`).join(' ')
    if (g.type === 'MultiPolygon')
      return g.coordinates.flatMap(p => p.map(r => `${line(r)}Z`)).join(' ')
    if (g.type === 'LineString') return line(g.coordinates)
    return ''
  }
  const projectedPoints = (feature: IndoorFeature): Point[] => {
    const result: Point[] = []
    const visit = (coordinates: unknown): void => {
      if (!Array.isArray(coordinates)) return
      if (typeof coordinates[0] === 'number')
        result.push(
          project(coordinates as Position, value(feature.properties, 'level_id')),
        )
      else coordinates.forEach(visit)
    }
    if ('coordinates' in feature.geometry) visit(feature.geometry.coordinates)
    return result
  }
  const anchor = (feature: IndoorFeature): Point =>
    projectedPoints(feature).reduce((left, point) =>
      point[0] < left[0] ? point : left,
    )
  const box = (features: IndoorFeature[]): [number, number, number, number] => {
    const points = features.flatMap(projectedPoints)
    const x = Math.min(...points.map(p => p[0])),
      y = Math.min(...points.map(p => p[1]))
    return [
      x,
      y,
      Math.max(...points.map(p => p[0])) - x,
      Math.max(...points.map(p => p[1])) - y,
    ]
  }
  const logo = (feature: IndoorFeature, aspect = 0.75, padding = 0.76): string => {
    const corners = brandFootprint(feature, aspect, padding)
    if (!corners) return ''
    // Geographic north becomes SVG up: reverse winding without swapping the logo's axes.
    const projected = corners.map(p =>
      project(p, value(feature.properties, 'level_id')),
    )
    const [a, b, , d] =
      projected[0][0] >= projected[1][0]
        ? [projected[1], projected[0], projected[3], projected[2]]
        : [projected[3], projected[2], projected[1], projected[0]]
    return `matrix(${b[0] - a[0]} ${b[1] - a[1]} ${d[0] - a[0]} ${d[1] - a[1]} ${a[0]} ${a[1]})`
  }
  return { project, path, box, logo, anchor }
}
/** Maps source classes onto a theme-independent cartographic palette. @param feature Source unit. @param branded Known shop logo. @returns CSS paint value. */
export function stationFill(feature: IndoorFeature, branded = false): string {
  if (branded) return '#fff'
  const p = feature.properties,
    category = value(p, 'unit_category')
  if (['stairs', 'steps', 'escalator', 'elevator', 'ramp'].includes(category))
    return 'var(--station-connector-fill)'
  if (category === 'room') return 'var(--station-room)'
  const area = value(p, 'section_name_en')
  return area === 'Paid area'
    ? 'var(--station-paid)'
    : area === 'Unpaid area'
      ? 'var(--station-unpaid)'
      : 'var(--station-room)'
}
