// I18N
import { m } from '#lib/i18n.js'
// TYPES
import type { LocationKind } from './kinds'

/** Describe a Location type using the current interface language.
 * @param kind Stored or draft entity type. @returns Concise localized type label.
 */
export function locationKindLabel(kind: LocationKind): string {
  if (kind === 'establishment') return m.location_type_establishment()
  if (kind === 'premises') return m.location_type_premises()
  if (kind === 'building') return m.location_type_building()
  if (kind === 'address') return m.location_type_address()
  if (kind === 'natural') return m.location_type_natural()
  return m.location_type_unknown()
}
