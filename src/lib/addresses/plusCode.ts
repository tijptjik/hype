const ALPHABET = '23456789CFGHJMPQRVWX'

/** Encode a Feature marker as a full ten-digit Open Location Code (about 14 metres).
 * @param coordinates Longitude, latitude in WGS84 order.
 * @returns Full Plus Code, or an empty string for an invalid/missing marker.
 */
export function featurePlusCode(coordinates?: readonly number[] | null): string {
  if (!coordinates || coordinates.length < 2) return ''
  const [longitude, latitude] = coordinates
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  )
    return ''
  // Integer cells avoid floating-point drift at pair boundaries; the north pole uses the last cell.
  let lat = Math.min(1439999, Math.floor((latitude + 90) * 8000))
  let lng = Math.floor(((((longitude + 180) % 360) + 360) % 360) * 8000)
  let code = ''
  for (const divisor of [160000, 8000, 400, 20, 1]) {
    code += ALPHABET[Math.floor(lat / divisor)] + ALPHABET[Math.floor(lng / divisor)]
    lat %= divisor
    lng %= divisor
  }
  return `${code.slice(0, 8)}+${code.slice(8)}`
}
