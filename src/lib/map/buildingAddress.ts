// TYPES
import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import type { Polygon, MultiPolygon, Position, Point } from 'geojson'

export type SelectedBuilding = {
  id: string
  source: string
  geometry: Polygon | MultiPolygon
  properties: Record<string, unknown>
}

/** Tests one ring including its boundary. @param point Pin. @param ring Ring. @returns Containment. */
function inRing(point: Position, ring: Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j],
      b = ring[i]
    const cross = (point[0] - a[0]) * (b[1] - a[1]) - (point[1] - a[1]) * (b[0] - a[0])
    if (
      Math.abs(cross) < 1e-12 &&
      point[0] >= Math.min(a[0], b[0]) &&
      point[0] <= Math.max(a[0], b[0]) &&
      point[1] >= Math.min(a[1], b[1]) &&
      point[1] <= Math.max(a[1], b[1])
    )
      return true
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside
  }
  return inside
}

/** Checks the actual footprint, excluding courtyards. @param point Pin. @param geometry Building area. @returns Containment. */
export function containsBuildingPoint(
  point: Position,
  geometry: Polygon | MultiPolygon,
): boolean {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some(
    rings =>
      inRing(point, rings[0]) && !rings.slice(1).some(ring => inRing(point, ring)),
  )
}

/** Collects every containing footprint, merging duplicate tile fragments by source identity.
 * @param features Loaded candidates. @param point Pin. @returns All containing buildings, including overlapping podiums and towers.
 */
export function selectBuildings(
  features: Pick<
    MapGeoJSONFeature,
    'id' | 'source' | 'sourceLayer' | 'properties' | 'geometry'
  >[],
  point: [number, number],
): SelectedBuilding[] {
  const buildings = new Map<string, SelectedBuilding>()
  for (const feature of features) {
    if (
      feature.sourceLayer !== 'buildings' ||
      feature.properties.kind !== 'building' ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
    )
      continue
    const geometry = feature.geometry as Polygon | MultiPolygon
    const id = String(feature.properties.source_id ?? feature.id ?? '')
    if (!id) throw new Error('Building identity is unavailable')
    const key = `${feature.source}:${id}`
    const existing = buildings.get(key)
    if (existing) {
      const polygons = (area: Polygon | MultiPolygon): Position[][][] =>
        area.type === 'Polygon' ? [area.coordinates] : area.coordinates
      existing.geometry = {
        type: 'MultiPolygon',
        coordinates: [...polygons(existing.geometry), ...polygons(geometry)],
      }
    } else
      buildings.set(key, {
        id,
        source: feature.source,
        geometry,
        properties: feature.properties,
      })
  }
  for (const [key, building] of buildings)
    if (!containsBuildingPoint(point, building.geometry)) buildings.delete(key)
  return [...buildings.values()]
}

/** Selects a unique containing building. @param features Rendered candidates. @param point Pin. @returns Building or null outdoors. @remarks Overlapping independent footprints require manual resolution. */
export function selectBuilding(
  features: Parameters<typeof selectBuildings>[0],
  point: [number, number],
): SelectedBuilding | null {
  const buildings = selectBuildings(features, point)
  if (buildings.length > 1) throw new Error('More than one building contains this pin')
  return buildings[0] ?? null
}

/** Reads all containing buildings once tiles at the pin are ready.
 * @param map Owning map. @param point Pin. @returns Containing footprints, including podium/tower overlaps.
 */
export async function buildingsAt(
  map: MapLibreMap,
  point: [number, number],
): Promise<SelectedBuilding[]> {
  if (map.getZoom() < 15) throw new Error('Zoom in to identify a building')
  if (!map.areTilesLoaded() || map.isMoving?.()) {
    await new Promise<void>((resolve, reject) => {
      const finish = (): void => {
        clearTimeout(timer)
        map.off('idle', finish)
        resolve()
      }
      const timer = setTimeout(() => {
        map.off('idle', finish)
        reject(new Error('Building tiles are not ready'))
      }, 5000)
      map.once('idle', finish)
    })
  }
  const sources = [
    ...new Set(
      map
        .getStyle()
        .layers.flatMap(layer =>
          'source-layer' in layer &&
          layer['source-layer'] === 'buildings' &&
          'source' in layer
            ? [layer.source]
            : [],
        ),
    ),
  ]
  if (!sources.length) throw new Error('This map style has no building source')
  // Source queries include interiors even when the style only draws building outlines.
  const features = sources.flatMap(source =>
    map
      .querySourceFeatures(source, {
        sourceLayer: 'buildings',
        filter: ['==', 'kind', 'building'],
      })
      .map(feature => ({
        id: feature.id,
        geometry: feature.geometry,
        properties: feature.properties,
        source,
        sourceLayer: 'buildings',
      })),
  )
  return selectBuildings(features, point)
}

/** Reads buildings only once the tiles at the pin are ready. @param map Owning map. @param point Pin. @returns A containing building, or null outdoors. */
export async function buildingAt(
  map: MapLibreMap,
  point: [number, number],
): Promise<SelectedBuilding | null> {
  const buildings = await buildingsAt(map, point)
  if (buildings.length > 1) throw new Error('More than one building contains this pin')
  return buildings[0] ?? null
}

/** Finds an unambiguous number on the footprint or its contained address labels.
 * @param building Unique building containing the pin.
 * @param labels Address-point features from the same map source.
 * @returns A literal number or range, or null when missing or conflicting.
 * @remarks Never substitutes a nearby label or a building name for address evidence.
 */
export function buildingStreetNumber(
  building: SelectedBuilding,
  labels: Pick<MapGeoJSONFeature, 'geometry' | 'properties'>[],
): string | null {
  const numbers = new Set<string>()
  const collect = (properties: Record<string, unknown>): void => {
    for (const key of ['addr_housenumber', 'addr:housenumber']) {
      const value = properties[key]
      if (
        (typeof value === 'string' || typeof value === 'number') &&
        String(value).trim()
      )
        numbers.add(String(value).trim())
    }
  }
  collect(building.properties)
  for (const label of labels) {
    if (
      label.properties.kind === 'address' &&
      label.geometry.type === 'Point' &&
      containsBuildingPoint(label.geometry.coordinates, building.geometry)
    )
      collect(label.properties)
  }
  return numbers.size === 1 ? [...numbers][0] : null
}

/** Looks up a street number using the pin's unique containing footprint.
 * @param map Owning map. @param point Current pin. @returns A suggested number or null.
 */
export async function streetNumberAt(
  map: MapLibreMap,
  point: [number, number],
): Promise<string | null> {
  const building = await buildingAt(map, point)
  if (!building) return null
  return buildingStreetNumber(
    building,
    map.querySourceFeatures(building.source, {
      sourceLayer: 'buildings',
      filter: ['==', 'kind', 'address'],
    }),
  )
}

/** Read names on every containing footprint and their interior label points.
 * @param map Owning map. @param point Dropped pin. @returns Contained names, never nearby outside labels.
 */
export async function buildingNamesAt(
  map: MapLibreMap,
  point: [number, number],
): Promise<string[]> {
  const buildings = await buildingsAt(map, point)
  if (!buildings.length) return []
  const properties = buildings.map(building => building.properties)
  if (map.getSource('building-labels')) {
    for (const label of map.querySourceFeatures('building-labels')) {
      if (
        label.geometry.type === 'Point' &&
        buildings.some(building =>
          containsBuildingPoint(
            (label.geometry as Point).coordinates,
            building.geometry,
          ),
        )
      )
        properties.push(label.properties)
    }
  }
  return [
    ...new Set(
      properties.flatMap(values =>
        Object.entries(values).flatMap(([key, value]) =>
          /^(name|name:en|name_en)$/.test(key) &&
          typeof value === 'string' &&
          value.trim()
            ? [value.trim()]
            : [],
        ),
      ),
    ),
  ]
}

/** Read explicit street names attached to containing footprints.
 * @param map Owning map. @param point Dropped pin. @returns Source street names, excluding mere nearby roads.
 */
export async function buildingStreetsAt(
  map: MapLibreMap,
  point: [number, number],
): Promise<string[]> {
  const buildings = await buildingsAt(map, point)
  return [
    ...new Set(
      buildings.flatMap(building =>
        ['addr_street', 'addr:street'].flatMap(key => {
          const value = building.properties[key]
          return typeof value === 'string' && value.trim() ? [value.trim()] : []
        }),
      ),
    ),
  ]
}
