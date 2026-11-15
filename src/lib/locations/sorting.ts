/** Common standalone Location sort keys; SQL expressions are selected from this allowlist. */
export const LOCATION_SORT_KEYS = [
  'name',
  'address',
  'kind',
  'lifecycle',
  'publication',
  'created',
  'updated',
  'id',
] as const
export type LocationSortKey = (typeof LOCATION_SORT_KEYS)[number]
/** Validate a URL sort key without accepting arbitrary SQL identifiers.
 * @param value URL parameter.
 * @returns Known key, defaulting to name.
 */
export function locationSortKey(value: string | null): LocationSortKey {
  return LOCATION_SORT_KEYS.find(key => key === value) ?? 'name'
}
