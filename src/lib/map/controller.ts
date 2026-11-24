import {
  buildingStreetsAt,
  buildingNamesAt,
  includedBuildingFootprints,
  streetNumberAt,
  buildingAt,
  type SelectedBuilding,
  type IncludedBuildingPoint,
} from './buildingAddress.js'
import { nearbyStreetHints, type MapStreetHint } from './nearbyStreets.js'
import type {
  CameraOptions,
  FitBoundsOptions,
  LngLatBoundsLike,
  Map as MapLibreMap,
  GeoJSONSource,
  MapSourceDataEvent,
} from 'maplibre-gl'

export type MapController = {
  /** Show saved outlines and display-only footprints containing included building points. */
  showLocationOutlines?: (
    features: import('geojson').FeatureCollection,
    buildingPoints?: IncludedBuildingPoint[],
  ) => () => void
  /** Observe explicit map clicks; returns cleanup for the owning picker. */
  onPointSelect?: (callback: (point: [number, number]) => void) => () => void
  projectToViewport?: (
    coordinates: [number, number],
  ) => { left: number; top: number } | null
  getBuildingStreetsAt?: (point: [number, number]) => Promise<string[]>
  getBuildingNamesAt?: (point: [number, number]) => Promise<string[]>
  getStreetNumberAt?: (point: [number, number]) => Promise<string | null>
  getNearbyStreetHints?: (point: [number, number]) => MapStreetHint[]
  getBuildingAt?: (point: [number, number]) => Promise<SelectedBuilding | null>
  getCamera: () => {
    center: [number, number]
    zoom: number
    bearing: number
    pitch: number
  } | null
  /** Observe rotation and tilt; returns a listener cleanup for the owning surface. */
  onOrientationChange?: (callback: () => void) => () => void
  flyTo: (options: CameraOptions & { duration?: number }) => void
  easeTo: (options: CameraOptions & { duration?: number }) => void
  jumpTo: (options: CameraOptions) => void
  fitBounds: (bounds: LngLatBoundsLike, options?: FitBoundsOptions) => void
  resize: () => void
  stop: () => void
  startOrbit: (options: {
    center: [number, number]
    radiusKm?: number
    durationMs?: number
  }) => (() => void) | undefined
}

/**
 * Creates an instance-scoped camera controller for one rendered MapLibre map.
 *
 * @param getMap - Resolver for the map owned by the consuming component.
 * @returns Camera and lifecycle commands that safely no-op before mount or after teardown.
 */
export const createMapController = (
  getMap: () => MapLibreMap | null,
): MapController => {
  const run = (callback: (map: MapLibreMap) => void): void => {
    const map = getMap()
    if (map) callback(map)
  }

  return {
    showLocationOutlines: (features, buildingPoints = []) => {
      const map = getMap()
      if (!map) return () => {}
      const sourceId = 'included-location-outlines'
      const fillId = sourceId + '-fill'
      const lineId = sourceId + '-line'
      let dirty = true
      const invalidate = (): void => {
        dirty = true
      }
      const tilesChanged = (event: MapSourceDataEvent): void => {
        if (event.source.type === 'vector' && event.sourceDataType === 'content')
          invalidate()
      }
      /** Restore the overlay after a style change and resolve new visible tiles. @returns Nothing. */
      const draw = (): void => {
        if (!dirty || !map.isStyleLoaded()) return
        dirty = false
        const data: typeof features = {
          type: 'FeatureCollection',
          features: [
            ...features.features,
            ...includedBuildingFootprints(map, buildingPoints).map(building => ({
              type: 'Feature' as const,
              properties: {},
              geometry: building.geometry,
            })),
          ],
        }
        if (!map.getSource(sourceId)) map.addSource(sourceId, { type: 'geojson', data })
        else (map.getSource(sourceId) as GeoJSONSource).setData(data)
        if (!map.getLayer(fillId))
          map.addLayer({
            id: fillId,
            type: 'fill',
            source: sourceId,
            paint: { 'fill-color': '#14b8a6', 'fill-opacity': 0.4 },
          })
        if (!map.getLayer(lineId))
          map.addLayer({
            id: lineId,
            type: 'line',
            source: sourceId,
            paint: { 'line-color': '#14b8a6', 'line-width': 3 },
          })
      }
      map.on('style.load', invalidate)
      map.on('sourcedata', tilesChanged)
      map.on('moveend', invalidate)
      map.on('idle', draw)
      draw()
      return () => {
        map.off('idle', draw)
        map.off('moveend', invalidate)
        map.off('sourcedata', tilesChanged)
        map.off('style.load', invalidate)
        if (map.getLayer(lineId)) map.removeLayer(lineId)
        if (map.getLayer(fillId)) map.removeLayer(fillId)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }
    },
    onPointSelect: callback => {
      const map = getMap()
      if (!map) return () => {}
      const click = (event: import('maplibre-gl').MapMouseEvent): void =>
        callback([event.lngLat.lng, event.lngLat.lat])
      map.on('click', click)
      return () => {
        map.off('click', click)
      }
    },
    /** Projects a geographic marker into viewport pixels. @param coordinates Marker longitude and latitude. @returns Position including the map element offset, or null before mount. */
    projectToViewport: coordinates => {
      const map = getMap()
      if (!map) return null
      const point = map.project(coordinates)
      const rect = map.getContainer().getBoundingClientRect()
      return { left: rect.left + point.x, top: rect.top + point.y }
    },
    getBuildingStreetsAt: async point => {
      const map = getMap()
      return map ? buildingStreetsAt(map, point) : []
    },
    getBuildingNamesAt: async point => {
      const map = getMap()
      return map ? buildingNamesAt(map, point) : []
    },
    getStreetNumberAt: async point => {
      const map = getMap()
      return map ? streetNumberAt(map, point) : null
    },
    getNearbyStreetHints: point => {
      const map = getMap()
      return map ? nearbyStreetHints(map, point) : []
    },
    getBuildingAt: async point => {
      const map = getMap()
      if (!map) throw new Error('Map unavailable')
      return buildingAt(map, point)
    },
    getCamera: () => {
      const map = getMap()
      if (!map) return null
      const center = map.getCenter()
      return {
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      }
    },
    onOrientationChange: callback => {
      const map = getMap()
      if (!map) return () => {}
      map.on('rotate', callback)
      map.on('pitch', callback)
      return () => {
        map.off('rotate', callback)
        map.off('pitch', callback)
      }
    },
    flyTo: options => run(map => map.flyTo(options)),
    easeTo: options => run(map => map.easeTo(options)),
    jumpTo: options => run(map => map.jumpTo(options)),
    fitBounds: (bounds, options) => run(map => map.fitBounds(bounds, options)),
    resize: () => run(map => map.resize()),
    stop: () => run(map => map.stop()),
    startOrbit: ({ center, radiusKm = 5, durationMs = 120000 }) => {
      const map = getMap()
      if (!map) return undefined

      const totalDuration = durationMs > 0 ? durationMs : 120000
      const longitudeRadius = radiusKm / 111.32
      const latitudeRadius = longitudeRadius / Math.cos((center[1] * Math.PI) / 180)
      const bearingDegreesPerRadian = 180 / Math.PI
      let startTime: number | null = null
      let animationId: number | null = null
      let stopped = false

      const animate = (currentTime: number): void => {
        if (stopped || getMap() !== map) return
        startTime ??= currentTime
        const elapsed = (currentTime - startTime) % totalDuration
        const angle = (elapsed / totalDuration) * 2 * Math.PI
        map.jumpTo({
          center: [
            center[0] + longitudeRadius * Math.cos(angle),
            center[1] + latitudeRadius * Math.sin(angle),
          ],
          zoom: 14,
          bearing: (angle + Math.PI / 2) * bearingDegreesPerRadian,
          pitch: 45,
        })
        animationId = requestAnimationFrame(animate)
      }

      const start = (): void => {
        if (!stopped) animationId = requestAnimationFrame(animate)
      }

      if (map.loaded()) start()
      else map.once('load', start)

      return () => {
        stopped = true
        map.off('load', start)
        if (animationId !== null) cancelAnimationFrame(animationId)
      }
    },
  }
}
