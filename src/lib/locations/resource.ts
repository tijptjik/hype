// TYPES
import type { LocationKind, LocationSourceReference } from '#lib/locations/kinds.js'
import type { LocationFacts } from './model'

/** Standalone Location projection; source payloads and Feature associations stay private. */
export type LocationResource = {
  /** Public provenance metadata; raw source payloads remain private. */
  metadata?: {
    createdAt: string
    revisionCreatedAt: string | null
    origin: 'saanseoi' | 'local' | null
    version: number | null
    apiVersion: string | null
    releaseId: string | null
    snapshotId: string | null
  }
  canEditShared?: boolean
  sharedFacts?: LocationFacts
  sharedRevision?: string | null
  canEditAddress?: boolean
  editingOrganisationId?: string | null
  organisationRevision?: string | null
  id: string
  ssId: string | null
  kind: LocationKind
  sourceReference: LocationSourceReference | null
  state: 'linked' | 'manual' | 'unresolved' | 'redirect'
  sourceAvailability: 'current' | 'missing' | 'review'
  ownerOrganisationId: string | null
  ownerOrganisationNames?: Record<string, string>
  editingOrganisationNames?: Record<string, string>
  revisionId: string | null
  facts: LocationFacts | null
}
