// TYPES
import type { LocationKind, LocationSourceReference } from '#lib/locations/kinds.js'
import type { LocationFacts } from './model'

/** Standalone Location projection; source payloads and Feature associations stay private. */
export type LocationResource = {
  buildingConstituents?: import('./physicalBuilding').PhysicalBuildingMember[]
  buildingRoles?: { physical: boolean; constituent: boolean }
  canEditBuildingStreets?: boolean
  buildingStreets?: import('./buildingStreetAddresses').BuildingStreet[]
  linkedAddresses?: string[]
  catalogueBuildingId?: string | null
  /** Explicit, accessible current parent; absent when containment is ambiguous. */
  parentLocation?: {
    id: string
    names: Record<string, string>
    displayAddress: Record<string, string>
  } | null
  /** Retained upstream polygon identity, independent of the local Location ID. */
  indoorSource?: {
    category?: string | null
    provider: string
    layer: string
    polygonId: string
    sourceKey: string
    mapId: string
    href: string | null
  } | null
  premisesMapId?: string | null
  premisesMap?: { id: string; href: string } | null
  /** Explicit operating body; independent of brand identity and access ownership. */
  operator?: import('./operator').LocationOperator | null
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
  /** Organisation-scoped association presence, when requested by a directory read. */
  hasLinkedFeatures?: boolean
  canManageCommunityLocks?: boolean
  communityLocks?: import('./curationLocks').CurationLocks
  canEditShared?: boolean
  sharedFacts?: LocationFacts
  sharedRevision?: string | null
  /** Permission to delete this local identity, subject to a fresh dependency check. */
  canDelete?: boolean
  canEditAddress?: boolean
  editingOrganisationId?: string | null
  organisationRevision?: string | null
  id: string
  ssId: string | null
  /** Compatibility matching discriminator; taxonomy carries the canonical kind/class pair. */
  kind: LocationKind
  taxonomy?: import('./taxonomy').LocationTaxonomy
  sourceReference: LocationSourceReference | null
  state: 'linked' | 'manual' | 'unresolved' | 'redirect'
  sourceAvailability: 'current' | 'missing' | 'review'
  ownerOrganisationId: string | null
  ownerOrganisationNames?: Record<string, string>
  editingOrganisationNames?: Record<string, string>
  /** Mutable draft concurrency token; absent after upstream publication. */
  draftVersion?: string | null
  revisionId: string | null
  facts: LocationFacts | null
}
