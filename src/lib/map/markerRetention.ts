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
 * Tests the viewport plus two MapLibre tile widths on every edge in screen space.
 * @param map - Owning map, including its current bearing, pitch, and world wrap.
 * @param coordinates - Marker longitude and latitude.
 * @returns Whether the closest wrapped copy is inside the 1,024 CSS pixel perimeter.
 * @remarks The perimeter prioritizes retention of already loaded markers; it never
 * expands the API query or prefetches features outside the visible viewport.
 */
export function isWithinMarkerRetentionPerimeter(
  map: MapLibreMap,
  coordinates: [number, number],
): boolean {
  const container = map.getContainer()
  const margin = 2 * 512
  const longitude =
    coordinates[0] + Math.round((map.getCenter().lng - coordinates[0]) / 360) * 360
  return [-360, 0, 360].some(offset => {
    const point = map.project([longitude + offset, coordinates[1]])
    return (
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= -margin &&
      point.x <= container.clientWidth + margin &&
      point.y >= -margin &&
      point.y <= container.clientHeight + margin
    )
  })
}
