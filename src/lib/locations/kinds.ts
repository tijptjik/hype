// VALIDATION
import { z } from 'zod'

/** Entity kind is independent of whether its identity is manual, unresolved or sourced. */
export const LOCATION_KINDS = [
  'unknown',
  'premises',
  'establishment',
  'building',
  'address',
  'natural',
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
  if (kind === 'address') return ['address']
  if (kind === 'building') return ['building', 'address']
  if (kind === 'natural') return ['natural']
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
