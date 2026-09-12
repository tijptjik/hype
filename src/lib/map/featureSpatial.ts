// H3
import {
  getHexagonAreaAvg,
  getRes0Cells,
  latLngToCell,
  polygonToCellsExperimental,
  POLYGON_TO_CELLS_FLAGS,
  UNITS,
} from 'h3-js'
// TYPES
import type { FeatureSpatialIndex, FeatureSpatialQuery } from '$lib/types'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. STORED POINT MEMBERSHIP
// - getFeaturePointCoordinates
// - isFeaturePointWithinBounds
// - createFeatureSpatialIndex
// 2. VIEWPORT QUERIES
// - normalizeLongitude
// - getFeatureViewportQuery
// ---

/** Every supported resolution is computed directly from the point, never from its parent cell. */
export const FEATURE_H3_RESOLUTIONS = Array.from(
  { length: 13 },
  (_, resolution) => resolution,
)
/** Limits query payload and polygon-cover work, including a whole-world overview. */
export const FEATURE_VIEWPORT_MAX_CELLS = 256

// ---
/********************
 *  1. STORED POINT MEMBERSHIP
 ************/
// +++ Stored Point Membership

/**
 * Reads valid marker coordinates from a GeoJSON point.
 * @param geometry Canonical feature geometry.
 * @returns Longitude/latitude or null for unsupported or invalid marker geometry.
 */
export function getFeaturePointCoordinates(geometry: unknown): [number, number] | null {
  if (
    !geometry ||
    typeof geometry !== 'object' ||
    !('type' in geometry) ||
    geometry.type !== 'Point'
  )
    return null
  if (!('coordinates' in geometry) || !Array.isArray(geometry.coordinates)) return null
  // Legacy imports retained numeric strings; normalize only the derived coordinates.
  const values = geometry.coordinates
    .slice(0, 2)
    .map(value =>
      typeof value === 'string' && value.trim() !== '' ? Number(value) : value,
    )
  const [longitude, latitude] = values
  if (
    typeof longitude !== 'number' ||
    typeof latitude !== 'number' ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  )
    return null
  return [longitude, latitude]
}

/**
 * Checks whether an individual marker is inside the current geographic viewport.
 * @param geometry - Feature point geometry, including legacy numeric coordinates.
 * @param bounds - Normalized west/south/east/north viewport bounds.
 * @returns Whether the point is visible, including edges and antimeridian crossings.
 */
export function isFeaturePointWithinBounds(
  geometry: unknown,
  bounds: NonNullable<FeatureSpatialQuery['bounds']>,
): boolean {
  const point = getFeaturePointCoordinates(geometry)
  if (!point) return false
  const [longitude, latitude] = point
  const [west, south, east, north] = bounds
  return (
    latitude >= south &&
    latitude <= north &&
    (west <= east
      ? longitude >= west && longitude <= east
      : longitude >= west || longitude <= east)
  )
}

/**
 * Precomputes the point's H3 membership for an atomic geometry write.
 * @param geometry Canonical GeoJSON geometry being persisted in the same statement.
 * @returns Derived point index, or null when the feature has no valid point marker.
 * @remarks H3 parents are hierarchical, not exact geographic containers; computing
 * each resolution directly prevents boundary points disappearing during zoom.
 */
export function createFeatureSpatialIndex(
  geometry: unknown,
): FeatureSpatialIndex | null {
  const coordinates = getFeaturePointCoordinates(geometry)
  if (!coordinates) return null
  const [longitude, latitude] = coordinates
  return {
    geometry: JSON.stringify(geometry),
    longitude,
    latitude,
    cells: Object.fromEntries(
      FEATURE_H3_RESOLUTIONS.map(resolution => [
        String(resolution),
        latLngToCell(latitude, longitude, resolution),
      ]),
    ),
  }
}

// ---
/********************
 *  2. VIEWPORT QUERIES
 ************/
// +++ Viewport Queries

/**
 * Normalizes wrapped longitudes without rounding already normalized coordinates.
 * @param longitude Possibly wrapped map longitude.
 * @returns Longitude in the interval [-180, 180).
 */
function normalizeLongitude(longitude: number): number {
  if (longitude >= -180 && longitude < 180) return longitude
  return ((((longitude + 180) % 360) + 360) % 360) - 180
}

/**
 * Covers the complete viewport with H3 cells while retaining exact display bounds.
 * @param bounds Viewport bounds in west/south/east/north order, including wrapped worlds.
 * @param zoom MapLibre zoom; two map zoom levels request the next H3 resolution.
 * @returns A bounded spatial query with all potentially intersecting cells.
 * @remarks Buffered cells protect coverage at cell edges; the server applies the
 * exact viewport bounds to the stored point coordinates. No
 * marker clustering or per-cell feature budget is introduced.
 */
export function getFeatureViewportQuery(
  bounds: [number, number, number, number],
  zoom: number,
): FeatureSpatialQuery {
  if (!bounds.every(Number.isFinite) || !Number.isFinite(zoom))
    throw new Error('Invalid feature viewport')
  const [rawWest, rawSouth, rawEast, rawNorth] = bounds
  if (rawNorth < rawSouth || rawSouth < -90 || rawNorth > 90)
    throw new Error('Invalid feature viewport latitude')
  const rawWidth = rawEast - rawWest
  const width = Math.abs(rawWidth) >= 360 ? 360 : ((rawWidth % 360) + 360) % 360
  const longitudeBuffer = Math.max(width * 0.1, 0.00001)
  const latitudeBuffer = Math.max((rawNorth - rawSouth) * 0.1, 0.00001)
  const south = Math.max(-90, rawSouth - latitudeBuffer)
  const north = Math.min(90, rawNorth + latitudeBuffer)
  const bufferedWidth = Math.min(360, width + longitudeBuffer * 2)
  const west =
    bufferedWidth === 360 ? -180 : normalizeLongitude(rawWest - longitudeBuffer)
  const queryBounds: [number, number, number, number] = [
    width === 360 ? -180 : normalizeLongitude(rawWest),
    rawSouth,
    width === 360 ? 180 : normalizeLongitude(rawWest + width),
    rawNorth,
  ]
  let resolution = Math.max(0, Math.min(12, Math.floor((zoom + 2) / 2)))

  // Estimate area before covering so zoomed-in inputs cannot allocate a world of tiny cells.
  const radians = Math.PI / 180
  const areaKm2 =
    6371.0088 ** 2 *
    bufferedWidth *
    radians *
    (Math.sin(north * radians) - Math.sin(south * radians))
  while (
    resolution > 0 &&
    areaKm2 / getHexagonAreaAvg(resolution, UNITS.km2) > FEATURE_VIEWPORT_MAX_CELLS / 4
  )
    resolution--

  for (;;) {
    // Resolution zero has only 122 cells and safely includes polar and world-spanning views.
    if (resolution === 0)
      return { resolution, cells: getRes0Cells().sort(), bounds: queryBounds }
    const cells = new Set<string>()
    let segmentWest = west
    const end = west + bufferedWidth
    // Split at the antimeridian and every 90 degrees to avoid ambiguous large polygons.
    while (segmentWest < end) {
      const normalizedWest = normalizeLongitude(segmentWest)
      const segmentWidth = Math.min(90, end - segmentWest, 180 - normalizedWest)
      const segmentEast = normalizedWest + segmentWidth
      const polygon = [
        [normalizedWest, south],
        [segmentEast, south],
        [segmentEast, north],
        [normalizedWest, north],
        [normalizedWest, south],
      ]
      for (const cell of polygonToCellsExperimental(
        polygon,
        resolution,
        POLYGON_TO_CELLS_FLAGS.containmentOverlappingBbox,
        true,
      ))
        cells.add(cell)
      segmentWest += segmentWidth
    }
    if (cells.size > 0 && cells.size <= FEATURE_VIEWPORT_MAX_CELLS)
      return { resolution, cells: [...cells].sort(), bounds: queryBounds }
    resolution--
  }
}
// ---
