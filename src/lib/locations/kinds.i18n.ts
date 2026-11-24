// TAXONOMY
import { locationTaxonomyLabel } from './taxonomy.i18n'
import { targetContextLabel } from '#lib/features/locationPolicy.i18n.js'
// I18N
import { getLocale, m } from '#lib/i18n.js'
// TYPES
import type { LocationKind } from './kinds'

/** Describe a Location type using the current interface language.
 * @param kind Stored or draft entity type. @returns Concise localized type label.
 */
export function locationKindLabel(kind: LocationKind): string {
  if (['service_point'].includes(kind)) return locationTaxonomyLabel(kind)
  if (kind === 'street') return locationTaxonomyLabel('thoroughfare')
  if (
    ['built', 'structure', 'landform', 'coastal_feature', 'water_feature'].includes(
      kind,
    )
  )
    return locationTaxonomyLabel(kind)
  if (kind === 'infrastructure' || kind === 'building_part' || kind === 'premises')
    return targetContextLabel(kind)
  if (kind === 'establishment') return m.location_type_establishment()
  if (kind === 'building') return m.location_type_building()
  if (kind === 'address') return m.location_type_address()
  if (kind === 'natural') return locationTaxonomyLabel('geographic')
  return m.location_type_unknown()
}

/** Select a recorded building name for display or search.
 * @param names Recorded translations. @param locale Preferred storage locale.
 * @returns The preferred nonblank name, or an empty string if none is recorded.
 */
export function recordedBuildingName(
  names: Record<string, string>,
  locale = getLocale().toLowerCase(),
): string {
  return (
    names[locale]?.trim() ||
    names.en?.trim() ||
    Object.values(names)
      .find(name => name.trim())
      ?.trim() ||
    ''
  )
}

/** Display a building identity without interpreting authored names as status labels.
 * @param names Recorded translations. @param confirmedUnnamed Explicit naming decision.
 * @param locale Preferred storage locale. @returns A name or the localized naming status.
 */
export function buildingNameLabel(
  names: Record<string, string>,
  confirmedUnnamed: boolean | undefined,
  locale = getLocale().toLowerCase(),
): string {
  return (
    recordedBuildingName(names, locale) ||
    (confirmedUnnamed ? m.building_name_unnamed() : m.building_name_unknown())
  )
}
