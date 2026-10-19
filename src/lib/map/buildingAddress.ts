// TYPES
import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl'
import type { Polygon, MultiPolygon, Position } from 'geojson'

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

/** Selects a unique containing building. @param features Rendered candidates. @param point Pin. @returns Building or null outdoors. @remarks Overlapping independent footprints require manual resolution. */
export function selectBuilding(
  features: Pick<
    MapGeoJSONFeature,
    'id' | 'source' | 'sourceLayer' | 'properties' | 'geometry'
  >[],
  point: [number, number],
): SelectedBuilding | null {
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
  if (buildings.size > 1) throw new Error('More than one building contains this pin')
  return buildings.values().next().value ?? null
}

/** Reads buildings only once the tiles at the pin are ready. @param map Owning map. @param point Pin. @returns A containing building, or null outdoors. */
export async function buildingAt(
  map: MapLibreMap,
  point: [number, number],
): Promise<SelectedBuilding | null> {
  if (map.getZoom() < 15) throw new Error('Zoom in to identify a building')
  if (!map.areTilesLoaded()) {
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
  return selectBuilding(features, point)
}
