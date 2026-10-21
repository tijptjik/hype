// TYPES
import type { LocationFacts } from './model'

export type LocationSearchMarker = {
  id: string
  kind?: import('#lib/locations/kinds.js').LocationKind | 'address'
  number: number
  coordinates: [number, number]
  label: string
  selected?: boolean
  highlighted?: boolean
}

/** Measure direct distance from the Feature pin, independently of routing.
 * @param from Feature longitude/latitude.
 * @param to Candidate longitude/latitude.
 * @returns Great-circle distance in metres.
 */
export function locationDistance(from: number[], to: number[]): number {
  const radians = Math.PI / 180
  const dLat = (to[1] - from[1]) * radians
  const dLng = (to[0] - from[0]) * radians
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from[1] * radians) * Math.cos(to[1] * radians) * Math.sin(dLng / 2) ** 2
  return 6371008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
}

/** Pick the user's locale before falling back to another retained Location name.
 * @param facts Local or canonical facts.
 * @param locale User's locale tag.
 * @returns Preferred human-readable name.
 */
export function locationName(facts: LocationFacts, locale: string): string {
  return facts.names[locale] || Object.values(facts.names).find(Boolean) || ''
}
