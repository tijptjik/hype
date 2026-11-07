// TYPES
import type { GeometryObject } from 'geojson'

/** Read a usable point without inventing a location for non-point geometry.
 * @param geometry Feature placement.
 * @returns Valid longitude/latitude, or null when nearby discovery is unavailable.
 */
export function featurePoint(
  geometry: GeometryObject | null | undefined,
): [number, number] | null {
  if (geometry?.type !== 'Point') return null
  const [lng, lat] = geometry.coordinates
  return Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
    ? [lng, lat]
    : null
}

/** Measure great-circle distance, including across the date line.
 * @param origin Source longitude/latitude.
 * @param target Candidate longitude/latitude.
 * @returns Distance in metres.
 */
export function featureDistance(
  origin: [number, number],
  target: [number, number],
): number {
  const rad = Math.PI / 180
  const a =
    Math.sin(((target[1] - origin[1]) * rad) / 2) ** 2 +
    Math.cos(origin[1] * rad) *
      Math.cos(target[1] * rad) *
      Math.sin(((target[0] - origin[0]) * rad) / 2) ** 2
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, a)))
}

/** Rank usable placements and exclude the contribution itself before limiting results.
 * @param rows Authorized candidate placements.
 * @param origin Source longitude/latitude.
 * @param excludeId Existing source identity, when present.
 * @returns Nearest-first identities with deterministic ordering for shared coordinates.
 */
export function rankNearbyFeatures(
  rows: { id: string; geometry: GeometryObject }[],
  origin: [number, number],
  excludeId?: string,
): { id: string; distance: number }[] {
  return rows
    .flatMap(row => {
      const point = featurePoint(row.geometry)
      return point && row.id !== excludeId
        ? [{ id: row.id, distance: featureDistance(origin, point) }]
        : []
    })
    .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id))
}
