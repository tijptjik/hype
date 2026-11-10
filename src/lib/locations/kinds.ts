// VALIDATION
import { z } from 'zod'

/** Compatibility discriminators used by matching, v1 facts and retained policies.
 * New identity storage uses LocationTaxonomy (kind/class); these tokens are derived,
 * never a second independently authored classification. Infrastructure is legacy-only.
 */
export const LOCATION_KINDS = [
  'unknown',
  'built',
  'building_part',
  'structure',
  'building',
  'premises',
  'street',
  'natural',
  'landform',
  'coastal_feature',
  'water_feature',
  'establishment',
  'service_point',
  'address',
  'premises_address',
  'cadastral_address',
  'linear_reference',
  'infrastructure',
] as const
export const LocationKindSchema = z.enum(LOCATION_KINDS)
export type LocationKind = z.infer<typeof LocationKindSchema>

/** Unsupported source families remain visible but disabled; local authoring is independent. */
export const LOCATION_DISCOVERY_TYPES = [
  { type: 'establishment', available: true },
  { type: 'address', available: true },
  { type: 'building', available: false },
  { type: 'natural', available: false },
] as const
export type LocationDiscoveryType = (typeof LOCATION_DISCOVERY_TYPES)[number]['type']
export const AvailableDiscoveryTypeSchema = z.enum(['establishment', 'address'])
export type AvailableDiscoveryType = z.infer<typeof AvailableDiscoveryTypeSchema>
export const DEFAULT_DISCOVERY_TYPES: AvailableDiscoveryType[] = [
  'establishment',
  'address',
]

/** Select discovery families from the entity being authored, independently of matching state.
 * @param kind Authored Location type. @returns Ordered search families, including unavailable adapters.
 * @remarks A building/address result supplies address evidence for an establishment, never its identity.
 */
export function locationDiscoveryTypes(kind: LocationKind): LocationDiscoveryType[] {
  if (
    ['address', 'premises_address', 'cadastral_address', 'linear_reference'].includes(
      kind,
    )
  )
    return ['address']
  if (kind === 'building_part') return ['address']
  if (
    ['building', 'built', 'premises', 'structure', 'street', 'infrastructure'].includes(
      kind,
    )
  )
    return ['building', 'address']
  if (['natural', 'landform', 'coastal_feature', 'water_feature'].includes(kind))
    return ['natural']
  return ['establishment', 'building', 'address']
}

/** Only the existing SaanSeoi Places adapter can currently supply canonical identities. */
export type LocationSourceReference = {
  provider: 'saanseoi'
  family: 'places'
  id: string
}

/** Qualify the existing source identity without changing the publisher's resource vocabulary.
 * @param ssId Accepted SaanSeoi Places identity, absent for local records.
 * @returns A typed source reference, or null for an independent local identity.
 * @remarks Buildings and natural features require their own adapters before this union expands.
 */
export function locationSourceReference(
  ssId: string | null,
): LocationSourceReference | null {
  return ssId ? { provider: 'saanseoi', family: 'places', id: ssId } : null
}
