// TYPES
import type { FeatureCollection, Point as GeoJSONPoint } from 'geojson'
import type { GeoJSONSource, Map as MapLibreMap, PointLike } from 'maplibre-gl'

/** One selectable feature identity, independent of the optional rich DOM overlay. */
export type MarkerPoint = {
  id: string
  coordinates: [number, number]
  color: string
  strokeColor: string
  /** Contrasting selection/collection ring; defaults to the point's outline. */
  emphasisColor?: string
  selected?: boolean
  highlighted?: boolean
}

/** Instance-owned GPU markers; camera movement is handled entirely by MapLibre. */
export type MarkerPointLayer = {
  sync: (points: readonly MarkerPoint[]) => void
  getFeatureIdAt: (point: PointLike) => string | null
  clear: () => void
}

type MarkerPointProperties = {
  featureId: string
  color: string
  strokeColor: string
  emphasisColor: string
  selected: boolean
  highlighted: boolean
}

// Independent renderers can share a map without removing each other's sources or layers.
let nextInstanceId = 0
const HIT_PADDING_PX = 8

/**
 * Captures valid, distinct point identities without retaining mutable caller geometry.
 * @param points - Feature identities and their presentation state.
 * @returns A fresh GeoJSON snapshot with one point per identity and no clustering.
 */
function pointCollection(
  points: readonly MarkerPoint[],
): FeatureCollection<GeoJSONPoint, MarkerPointProperties> {
  const distinct = new Map<string, MarkerPoint>()
  for (const point of points) {
    const [longitude, latitude] = point.coordinates
    if (
      !point.id ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      latitude < -90 ||
      latitude > 90
    )
      continue
    distinct.set(point.id, point)
  }
  return {
    type: 'FeatureCollection',
    features: [...distinct.values()].map(point => ({
      type: 'Feature',
      id: point.id,
      geometry: { type: 'Point', coordinates: [...point.coordinates] },
      properties: {
        featureId: point.id,
        color: point.color,
        strokeColor: point.strokeColor,
        emphasisColor: point.emphasisColor ?? point.strokeColor,
        selected: point.selected ?? false,
        highlighted: point.highlighted ?? false,
      },
    })),
  }
}

/**
 * Renders individual feature points beneath optional rich markers without native DOM positioning.
 * @param map - MapLibre map that owns this source and its overlay layers.
 * @returns Snapshot reconciliation, owned-layer hit testing, and permanent disposal.
 * @remarks Sources update only when point data changes or a basemap is replaced.
 * Empty snapshots immediately remove the owned layers, preventing stale scope hits
 * while a source worker is still processing an older snapshot. No camera listeners
 * or per-frame projection loops are installed.
 */
export function createMarkerPointLayer(map: MapLibreMap): MarkerPointLayer {
  const sourceId = `hype-marker-points-${++nextInstanceId}`
  const haloId = `${sourceId}-halo`
  const pointId = `${sourceId}-point`
  const layerIds = [pointId, haloId]
  let data = pointCollection([])
  let signature = JSON.stringify(data)
  let identities = new Set<string>()
  let dirty = false
  let disposed = false

  /** Removes only this instance's layers before its source. @returns Nothing. */
  function removePresentation(): void {
    for (const id of layerIds) if (map.getLayer(id)) map.removeLayer(id)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
  }

  /** Publishes the latest snapshot once its style can accept overlays. @returns Nothing. */
  function render(): void {
    if (disposed || !dirty || !data.features.length) return
    const source = map.getSource(sourceId) as GeoJSONSource | undefined
    // Parsed styles accept overlays before basemap tiles finish; full isStyleLoaded
    // can remain false throughout a long pan or while slow tile requests are pending.
    if (!source && !map.getStyle()) return
    if (source) source.setData(data)
    else map.addSource(sourceId, { type: 'geojson', data, cluster: false })

    // A separate ring preserves selection and collection emphasis at dense zoom levels.
    if (!map.getLayer(haloId))
      map.addLayer({
        id: haloId,
        type: 'circle',
        source: sourceId,
        filter: ['any', ['get', 'selected'], ['get', 'highlighted']],
        paint: {
          'circle-radius': ['case', ['get', 'selected'], 13, 11],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0,
          'circle-stroke-color': ['get', 'emphasisColor'],
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 1,
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
      })
    // Add above basemap labels; every point keeps a fixed CSS-pixel size while zooming.
    if (!map.getLayer(pointId))
      map.addLayer({
        id: pointId,
        type: 'circle',
        source: sourceId,
        layout: {
          'circle-sort-key': [
            'case',
            ['get', 'selected'],
            2,
            ['get', 'highlighted'],
            1,
            0,
          ],
        },
        paint: {
          'circle-radius': 7,
          'circle-color': ['get', 'color'],
          'circle-stroke-color': ['get', 'strokeColor'],
          'circle-stroke-width': 2,
          'circle-pitch-alignment': 'viewport',
          'circle-pitch-scale': 'viewport',
        },
      })
    dirty = false
  }

  /** Restores only the latest nonempty snapshot after style replacement. @returns Nothing. */
  function restore(): void {
    if (disposed || !data.features.length) return
    dirty = true
    render()
  }

  map.on('style.load', restore)
  // Initial style parsing can defer a snapshot; idle only flushes actual changes.
  map.on('idle', render)

  return {
    sync(points): void {
      if (disposed) return
      const nextData = pointCollection(points)
      const nextSignature = JSON.stringify(nextData)
      if (nextSignature === signature) return
      data = nextData
      signature = nextSignature
      identities = new Set(data.features.map(feature => feature.properties.featureId))
      if (!data.features.length) {
        dirty = false
        removePresentation()
        return
      }
      dirty = true
      render()
    },
    getFeatureIdAt(point): string | null {
      if (disposed || !identities.size) return null
      const layers = layerIds.filter(id => map.getLayer(id))
      if (!layers.length) return null
      const [x, y] = Array.isArray(point) ? point : [point.x, point.y]
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null
      // Prefer the directly hit visible point before expanding a mobile tap target.
      const direct = map.queryRenderedFeatures([x, y], { layers })
      const expanded = direct.length
        ? direct
        : map.queryRenderedFeatures(
            [
              [x - HIT_PADDING_PX, y - HIT_PADDING_PX],
              [x + HIT_PADDING_PX, y + HIT_PADDING_PX],
            ],
            { layers },
          )
      for (const feature of expanded) {
        const id = feature.properties?.featureId
        if (typeof id === 'string' && identities.has(id)) return id
      }
      return null
    },
    clear(): void {
      if (disposed) return
      disposed = true
      data = pointCollection([])
      identities.clear()
      map.off('style.load', restore)
      map.off('idle', render)
      removePresentation()
    },
  }
}
