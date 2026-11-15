// DOMAIN
import { canonicalFacilityLabel } from '#lib/indoor/facilityLabels.js'
// TYPES
import type { LocationKind } from './kinds'

/** Format building-part names consistently with curated indoor maps.
 * @param kind Location matching kind.
 * @param names Retained locale names.
 * @returns Display names, preserving source objects, non-English labels and unit codes.
 * @remarks Establishment and building names retain their authored brand spelling.
 */
export function locationFacilityNames(
  kind: LocationKind,
  names: Record<string, string>,
): Record<string, string> {
  if (kind !== 'building_part') return names
  return Object.fromEntries(
    Object.entries(names).map(([locale, name]) => [
      locale,
      /^en(?:-|$)/i.test(locale) &&
      !/^[A-Z]{2,6}\s*\d+[A-Z]?(?:\s*[-/&]\s*\d+[A-Z]?)*$/i.test(name.trim())
        ? canonicalFacilityLabel(name)
        : name,
    ]),
  )
}
