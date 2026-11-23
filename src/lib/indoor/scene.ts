// DATA
import { centre, value, type IndoorData, type IndoorFeature } from './model'
import { brandFootprint } from './geometry'
import { polygonLabels, fitPolygonText } from './labels'
import type { Position } from 'geojson'
export type Point = [number, number]
export type StationProjection = {
  project: (p: Position, level: string, elevation?: number) => Point
  unproject: (p: Point, level: string) => Point
  path: (feature: IndoorFeature) => string
  box: (features: IndoorFeature[]) => [number, number, number, number]
  anchor: (feature: IndoorFeature) => Point
  screenAlignedLogo: (
    feature: IndoorFeature,
    aspect?: number,
    padding?: number,
  ) => string
  logo: (feature: IndoorFeature, aspect?: number, padding?: number) => string
}
/** Creates an orthographic floor projection with schematic vertical separation.
 * @param data Station snapshot. @param exploded Whether to separate floors vertically. @param camera Camera angles and schematic spacing.
 * @returns Geometry projection helpers. @remarks Source coordinates stay untouched. Paths are cached for this immutable snapshot and camera; recreate the projection when either changes.
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
  // Camera trigonometry is constant across every vertex in a frame.
  const angle = ((camera.bearing ?? 30) * Math.PI) / 180
  const cosBearing = Math.cos(angle),
    sinBearing = Math.sin(angle)
  const tilt = ((camera.tilt ?? (exploded ? 55 : 0)) * Math.PI) / 180
  const cosTilt = Math.cos(tilt),
    sinTilt = Math.sin(tilt)
  const metresX = 111320 * Math.cos((origin[1] * Math.PI) / 180)
  const project = (p: Position, level: string, elevation = 0): Point => {
    // Schematic pixels use an arbitrary display scale; they are never geographic metres.
    const schematic = data.coordinateSpace === 'image-pixels'
    const x = schematic ? (p[0] - origin[0]) * 0.2 : (p[0] - origin[0]) * metresX,
      y = schematic ? -(p[1] - origin[1]) * 0.2 : (p[1] - origin[1]) * 111320
    const rx = x * cosBearing + y * sinBearing,
      ry = -x * sinBearing + y * cosBearing
    return [
      rx,
      -ry * cosTilt -
        (exploded ? (heights.get(level) ?? 0) : 0) -
        // Local relief follows the camera: elevation has no lateral offset from directly above.
        elevation * sinTilt,
    ]
  }
  // Undo floor elevation and camera rotation to preserve the geographic viewport on exit.
  const unproject = (p: Point, level: string): Point => {
    const ry =
      -(p[1] + (exploded ? (heights.get(level) ?? 0) : 0)) / Math.max(0.01, cosTilt)
    const x = p[0] * cosBearing - ry * sinBearing
    const y = p[0] * sinBearing + ry * cosBearing
    return data.coordinateSpace === 'image-pixels'
      ? [origin[0] + x / 0.2, origin[1] - y / 0.2]
      : [
          origin[0] + x / (111320 * Math.cos((origin[1] * Math.PI) / 180)),
          origin[1] + y / 111320,
        ]
  }
  const paths = new WeakMap<IndoorFeature, string>()
  const path = (feature: IndoorFeature): string => {
    const cached = paths.get(feature)
    if (cached !== undefined) return cached
    const result = buildPath(feature)
    paths.set(feature, result)
    return result
  }
  const buildPath = (feature: IndoorFeature): string => {
    const level = value(feature.properties, 'level_id')
    const line = (points: Position[]) =>
      points.map((p, i) => `${i ? 'L' : 'M'}${project(p, level).join(',')}`).join(' ')
    const g = feature.geometry
    if (g.type === 'Polygon') return g.coordinates.map(r => `${line(r)}Z`).join(' ')
    if (g.type === 'MultiPolygon')
      return g.coordinates.flatMap(p => p.map(r => `${line(r)}Z`)).join(' ')
    if (g.type === 'LineString') return line(g.coordinates)
    if (g.type === 'MultiLineString') return g.coordinates.map(line).join(' ')
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
    if (data.coordinateSpace === 'image-pixels') {
      // Fit the entire mark inside a schematic polygon before rotating the floor plane.
      const placement = polygonLabels(feature, p => [p[0], p[1]])[0]
      if (!placement) return ''
      // Use the footprint bounds, not a font-size cap, so artwork scales with the shop.
      const points = placement.rings[0]
      const xs = points.map(point => point[0]),
        ys = points.map(point => point[1])
      const maxHeight = Math.min(
        (Math.max(...xs) - Math.min(...xs)) / aspect,
        Math.max(...ys) - Math.min(...ys),
      )
      const fitted = fitPolygonText(placement, maxHeight, aspect / 0.7, 1 / 1.4)
      const h = fitted.size * Math.min(padding, 0.85),
        w = h * aspect
      const [x, y] = fitted.point
      const level = value(feature.properties, 'level_id')
      const a = project([x - w / 2, y - h / 2], level),
        b = project([x + w / 2, y - h / 2], level),
        d = project([x - w / 2, y + h / 2], level)
      return `matrix(${b[0] - a[0]} ${b[1] - a[1]} ${d[0] - a[0]} ${d[1] - a[1]} ${a[0]} ${a[1]})`
    }
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
  let flat: StationProjection | undefined
  /** Keeps the optimal footprint size and screen-down orientation on the tilted floor.
   * @param feature Shop footprint. @param aspect Artwork width/height. @param padding Artwork inset.
   * @returns Floor-aligned SVG image transform. @remarks Bearing is cancelled before tilt, so the bottom stays screen-down while height foreshortens with the floor.
   */
  const screenAlignedLogo = (
    feature: IndoorFeature,
    aspect = 0.75,
    padding = 0.76,
  ): string => {
    flat ??= stationProjection(data, false, { bearing: 0, tilt: 0 })
    // Compare both footprint orientations before aligning the winning fit to the viewing heading.
    const candidates = [false, true].flatMap(swapped => {
      const fitted = flat.logo(feature, swapped ? 1 / aspect : aspect, padding)
      if (!fitted) return []
      const matrix = fitted.slice(7, -1).split(' ').map(Number)
      const [a, b, c, d] = matrix
      const w = Math.hypot(a, b),
        h = Math.hypot(c, d)
      return [{ matrix, width: swapped ? h : w, height: swapped ? w : h }]
    })
    const best = candidates.sort((a, b) => b.width * b.height - a.width * a.height)[0]
    if (!best) return ''
    const {
      width,
      height,
      matrix: [a, b, c, d, e, f],
    } = best
    const level = value(feature.properties, 'level_id')
    const [x, y] = project(
      flat.unproject([e + (a + c) / 2, f + (b + d) / 2], level),
      level,
    )
    // Counter-rotation in the floor plane removes bearing; pitch still compresses its vertical axis.
    const projectedHeight = height * cosTilt
    return `matrix(${width} 0 0 ${projectedHeight} ${x - width / 2} ${y - projectedHeight / 2})`
  }
  return { project, unproject, path, box, logo, screenAlignedLogo, anchor }
}
/** Maps source classes onto a theme-independent cartographic palette. @param feature Source unit. @param branded Known shop logo. @returns CSS paint value. */
export function stationFill(feature: IndoorFeature, branded = false): string {
  if (branded) return '#fff'
  const p = feature.properties,
    category = value(p, 'unit_category')
  if (['stairs', 'steps', 'escalator', 'elevator', 'ramp'].includes(category))
    return 'var(--station-connector-fill)'
  // Shop categories use the same unit fill as rooms instead of inheriting the concourse fill.
  if (['room', 'foodservice', 'retail'].includes(category)) return 'var(--station-room)'
  const area = value(p, 'section_name_en')
  return area === 'Paid area'
    ? 'var(--station-paid)'
    : area === 'Unpaid area'
      ? 'var(--station-unpaid)'
      : 'var(--station-room)'
}
