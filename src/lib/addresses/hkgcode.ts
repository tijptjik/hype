// GEOCODING
import { HKGeoCodeError } from '@saanseoi/hkgcode'
import { wgs84ToHkgcode } from '@saanseoi/hkgcode/wgs84'

/** Encodes the Feature marker as a six-character Hong Kong GeoCode.
 * @param coordinates Longitude and latitude from the Feature geometry.
 * @returns HKGCode, or an empty string for missing, invalid or out-of-coverage markers.
 * @remarks Address source coordinates must never substitute for the Feature marker.
 */
export function featureHkgcode(coordinates?: readonly number[] | null): string {
  if (!coordinates || coordinates.length < 2) return ''
  try {
    return wgs84ToHkgcode([coordinates[0], coordinates[1]])
  } catch (error) {
    if (error instanceof HKGeoCodeError) return ''
    throw error
  }
}
