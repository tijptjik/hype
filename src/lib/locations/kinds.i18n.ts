// TAXONOMY
import { locationTaxonomyLabel } from './taxonomy.i18n'
import { targetContextLabel } from '#lib/features/locationPolicy.i18n.js'
// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { LocationKind } from './kinds'

/** Describe a Location type using the current interface language.
 * @param kind Stored or draft entity type. @returns Concise localized type label.
 */
export function locationKindLabel(kind: LocationKind): string {
  if (
    [
      'service_point',
      'premises_address',
      'cadastral_address',
      'linear_reference',
    ].includes(kind)
  )
    return locationTaxonomyLabel(kind)
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
