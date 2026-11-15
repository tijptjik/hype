// TYPES
import type { Place } from './model'

/** Restrict shop presentation to accepted Feature unit identities.
 * @param places Source directory, including facilities.
 * @param featuredUnits Null disables filtering; an empty set hides every shop.
 * @returns Visible directory entries; physical geometry is deliberately untouched.
 */
export function visibleIndoorPlaces(
  places: Place[],
  featuredUnits: ReadonlySet<string> | null,
): Place[] {
  return featuredUnits === null
    ? places
    : places.filter(place => place.kind !== 'shop' || featuredUnits.has(place.id))
}
