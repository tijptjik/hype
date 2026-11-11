// TYPES
import type { RevisionDifference } from './diff'
import type { RevisionSlot } from './value'

type Coordinates = [number, number]

/** Read only explicit geographic coordinate fields from authorized revision values.
 * @param path Historical field path.
 * @param slot Before or after value.
 * @returns Valid longitude/latitude pair, or null for non-point/missing values.
 */
export function revisionCoordinates(
  path: string[],
  slot: RevisionSlot,
): Coordinates | null {
  if (
    !['coordinates', 'markerCoordinates'].includes(path.at(-1) ?? '') ||
    !slot.present
  )
    return null
  const value = slot.value
  if (!Array.isArray(value) || value.length !== 2) return null
  const [lng, lat] = value
  return typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    Math.abs(lng) <= 180 &&
    Math.abs(lat) <= 90
    ? [lng, lat]
    : null
}

/** Project latitude into the bounded Web Mercator world used by the map renderer.
 * @param latitude Geographic latitude in degrees.
 * @returns Normalized vertical world coordinate.
 */
function mercatorY(latitude: number): number {
  const radians = (Math.max(-85.051129, Math.min(85.051129, latitude)) * Math.PI) / 180
  return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2
}

/** Fit both historical positions into an identical padded viewport for each map.
 * @param change Authorized historical difference.
 * @param width Available map width in pixels.
 * @param height Available map height in pixels.
 * @returns Shared camera, including short-path wrapping across the date line.
 * @remarks Coincident points use street-level zoom; absent sides use the remaining point.
 */
export function coordinateChangeCamera(
  change: RevisionDifference,
  width: number,
  height: number,
): { center: Coordinates; zoom: number } | null {
  const before = revisionCoordinates(change.path, change.before)
  const after = revisionCoordinates(change.path, change.after)
  const first = before ?? after
  const second = after ?? before
  if (!first || !second) return null
  const dx = (((second[0] - first[0] + 540) % 360) - 180) / 360
  const y1 = mercatorY(first[1]),
    y2 = mercatorY(second[1])
  const longitude = ((first[0] + dx * 180 + 540) % 360) - 180
  const latitude = (Math.atan(Math.sinh(Math.PI * (1 - y1 - y2))) * 180) / Math.PI
  const scale = Math.max(
    Math.abs(dx) / Math.max(1, width - 96),
    Math.abs(y2 - y1) / Math.max(1, height - 96),
  )
  return {
    center: [longitude, latitude],
    zoom: Math.max(0, Math.min(20, scale ? Math.log2(1 / (512 * scale)) : 19)),
  }
}
