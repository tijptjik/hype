// DOMAIN
import { placeCategoryLabel } from './placeSearchFilters'
import type { PlacePreview } from './sourcePreview'
// TYPES
import type { LocationFacts } from './model'

export type LocationSearchMarker = {
  id: string
  kind?: import('#lib/locations/kinds.js').LocationKind | 'address'
  number: number
  /** Fit this result subset independently of the Feature pin. */
  fitGroup?: string
  /** Context markers must not move the camera as selections change. */
  skipAutoFit?: boolean
  color?: string
  coordinates: [number, number]
  label: string
  hidden?: boolean
  selected?: boolean
  compact?: boolean
  previewOnly?: boolean
  highlighted?: boolean
  /** Explicit review edit; receives draft coordinates without moving the source record. */
  onReposition?: (coordinates: [number, number]) => void
}

/** Resolve the shared theme colour for search controls, result numbers and map markers.
 * @param kind Candidate Location kind.
 * @returns Theme colour variable for the candidate type.
 */
export function locationSearchColor(kind: LocationSearchMarker['kind']): string {
  return kind === 'address'
    ? 'var(--color-tertiary)'
    : kind === 'building' || kind === 'building_part'
      ? 'var(--color-secondary)'
      : 'var(--color-primary)'
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

/** Format publisher taxonomy for discovery without inferring missing ancestry.
 * @param classification Display-only classification from the Place preview.
 * @returns Hierarchy followed by other categories, with duplicate identifiers removed.
 */
export function placeTaxonomyLabel(
  classification: PlacePreview['classification'],
): string {
  const taxonomy = classification?.taxonomy
  const hierarchy = [...new Set((taxonomy?.hierarchy ?? []).filter(Boolean))]
  if (taxonomy?.primary && !hierarchy.includes(taxonomy.primary))
    hierarchy.push(taxonomy.primary)
  const additional = [
    ...new Set(
      [classification?.basicCategory, ...(taxonomy?.alternates ?? [])].filter(
        (value): value is string =>
          typeof value === 'string' && value.length > 0 && !hierarchy.includes(value),
      ),
    ),
  ]
  return [
    hierarchy.map(placeCategoryLabel).join(' › '),
    ...additional.map(placeCategoryLabel),
  ]
    .filter(Boolean)
    .join(' · ')
}
