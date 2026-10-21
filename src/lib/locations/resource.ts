// TYPES
import type { LocationKind, LocationSourceReference } from '#lib/locations/kinds.js'
import type { LocationFacts } from './model'

/** Standalone Location projection; source payloads and Feature associations stay private. */
export type LocationResource = {
  canEditAddress?: boolean
  id: string
  ssId: string | null
  kind: LocationKind
  sourceReference: LocationSourceReference | null
  state: 'linked' | 'manual' | 'unresolved' | 'redirect'
  sourceAvailability: 'current' | 'missing' | 'review'
  ownerOrganisationId: string | null
  revisionId: string | null
  facts: LocationFacts | null
}
