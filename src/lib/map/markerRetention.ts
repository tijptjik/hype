// TYPES
import type { Map as MapLibreMap } from 'maplibre-gl'

/** Browser hints are optional and intentionally used only for conservative cache sizing. */
export type MarkerDeviceHints = {
  deviceMemory?: number
  hardwareConcurrency?: number
}

/**
 * Chooses a bounded marker/image retention budget from available device hints.
 * @param hints - Coarsened memory and logical processor hints; neither measures GPU speed.
 * @returns Total active plus cached markers: 750, 1,000, or 1,500.
 * @remarks Missing hints use 1,000. This budget never increases network page size or
 * the active query limit, and does not claim to detect browser memory pressure.
 */
export function getMarkerRetentionBudget(hints: MarkerDeviceHints = {}): number {
  const memory = hints.deviceMemory
  const cores = hints.hardwareConcurrency
  if (
    (memory !== undefined && memory > 0 && memory <= 4) ||
    (cores !== undefined && cores > 0 && cores <= 4)
  )
    return 750
  if (memory !== undefined && memory >= 8 && cores !== undefined && cores >= 8)
    return 1500
  return 1000
}

/**
 * Captures camera dimensions once for a batch of marker visibility checks.
 * @param map - Owning map, including bearing, pitch, and world wrap.
 * @returns A predicate for the viewport plus a small screen-relative overscan.
 * @remarks Detached markers keep their decoded image nodes. This perimeter controls
 * live MapLibre work only; it does not expand network queries or evict the cache.
 */
export function createMarkerVisibilityTest(
  map: MapLibreMap,
): (coordinates: [number, number]) => boolean {
  const container = map.getContainer()
  const width = container.clientWidth
  const height = container.clientHeight
  const margin = Math.max(96, Math.min(192, width / 4))
  const centerLongitude = map.getCenter().lng
  return coordinates => {
    const longitude =
      coordinates[0] + Math.round((centerLongitude - coordinates[0]) / 360) * 360
    // Try the nearest world first; ordinary views need only one projection.
    return [0, -360, 360].some(offset => {
      const point = map.project([longitude + offset, coordinates[1]])
      return (
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        point.x >= -margin &&
        point.x <= width + margin &&
        point.y >= -margin &&
        point.y <= height + margin
      )
    })
  }
}

/**
 * Tests whether a marker needs live positioning near the viewport.
 * @param map - Owning map.
 * @param coordinates - Marker longitude and latitude.
 * @returns Whether a wrapped copy is within the visible area and overscan.
 */
export function isWithinMarkerRetentionPerimeter(
  map: MapLibreMap,
  coordinates: [number, number],
): boolean {
  return createMarkerVisibilityTest(map)(coordinates)
}
