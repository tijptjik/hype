/** Coordinates use GeoJSON longitude/latitude order internally. */
export type CoordinatePair = [number, number]

/** Read a finite decimal, without treating blank text or booleans as zero.
 * @param value Candidate numeric value.
 * @returns A finite decimal or null.
 */
function decimal(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (
    typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  )
    return null
  const result = Number(value)
  return Number.isFinite(result) ? result : null
}

/** Validate a longitude/latitude pair against WGS84 limits.
 * @param longitude Candidate longitude.
 * @param latitude Candidate latitude.
 * @returns A validated pair or null.
 */
function pair(longitude: unknown, latitude: unknown): CoordinatePair | null {
  const lng = decimal(longitude),
    lat = decimal(latitude)
  return lng !== null && lat !== null && Math.abs(lng) <= 180 && Math.abs(lat) <= 90
    ? [lng, lat]
    : null
}

/** Identify the Hong Kong vicinity for otherwise unlabelled coordinate pairs.
 * @param value Validated longitude/latitude pair.
 * @returns Whether the point lies in the Hong Kong vicinity.
 */
function nearHongKong(value: CoordinatePair | null): boolean {
  return (
    value !== null &&
    value[0] >= 113.5 &&
    value[0] <= 114.6 &&
    value[1] >= 22 &&
    value[1] <= 22.7
  )
}

/** Parse pasted coordinate pairs without evaluating clipboard content.
 * @param text A comma/space-separated pair, array, named object, or GeoJSON Point.
 * @returns Validated longitude/latitude coordinates, or null for incomplete/invalid input.
 * @remarks Explicit lat/lng labels and GeoJSON order are authoritative. Unlabelled pairs
 * prefer Hong Kong order, then valid WGS84 order, then longitude/latitude if ambiguous.
 */
export function parseCoordinateInput(text: string): CoordinatePair | null {
  const input = text.trim()
  if (!input || input.length > 4096) return null
  let value: unknown
  try {
    value = JSON.parse(input)
  } catch {
    // Permit common copied JavaScript object keys without executing object expressions.
    if (input.startsWith('{')) {
      try {
        value = JSON.parse(
          input.replace(
            /([{,]\s*)(lat|latitude|lng|lon|long|longitude|coordinates|type)\s*:/gi,
            '$1"$2":',
          ),
        )
      } catch {
        return null
      }
    } else {
      value = input.replace(/^\((.*)\)$/s, '$1').split(/\s*[,;，]\s*|\s+/)
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key.toLowerCase(), item]),
    )
    if ('lat' in entries || 'latitude' in entries) {
      return pair(
        entries.lng ?? entries.lon ?? entries.long ?? entries.longitude,
        entries.lat ?? entries.latitude,
      )
    }
    if (
      !Array.isArray(entries.coordinates) ||
      entries.coordinates.length !== 2 ||
      (entries.type && entries.type !== 'Point')
    )
      return null
    if (entries.type === 'Point')
      return pair(entries.coordinates[0], entries.coordinates[1])
    value = entries.coordinates
  }
  if (!Array.isArray(value) || value.length !== 2) return null
  const direct = pair(value[0], value[1]),
    reversed = pair(value[1], value[0])
  if (nearHongKong(direct)) return direct
  if (nearHongKong(reversed)) return reversed
  return direct ?? reversed
}
