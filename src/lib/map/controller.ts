import type {
  CameraOptions,
  FitBoundsOptions,
  LngLatBoundsLike,
  Map as MapLibreMap,
} from 'maplibre-gl'

export type MapController = {
  getCamera: () => {
    center: [number, number]
    zoom: number
    bearing: number
    pitch: number
  } | null
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
