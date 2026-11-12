// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { PlaceSearchFilters } from '#lib/locations/placeSearchFilters.js'

export type DraftLocationSearchResult = {
  id: string
  kind:
    | 'establishment'
    | 'premises'
    | 'building'
    | 'building_part'
    | 'infrastructure'
    | 'built'
    | 'structure'
    | 'landform'
    | 'coastal_feature'
    | 'water_feature'
    | 'service_point'
    | 'street'
    | 'natural'
    | 'address'
  names: Record<string, string>
  /** Record provenance for search presentation, independent of Feature association intent. */
  recordMode?: 'manual' | 'unlinked' | 'linked'
  taxonomyLabel?: string
  source?: { ssId: string; resourceReleaseId: string }
  buildingSource?: { id: string; release: string; addressId?: string }
  localKind?:
    | 'address'
    | 'premises'
    | 'building'
    | 'building_part'
    | 'infrastructure'
    | 'built'
    | 'structure'
    | 'landform'
    | 'coastal_feature'
    | 'water_feature'
    | 'service_point'
    | 'street'
    | 'natural'
    | 'establishment'
  identity?: { locationId: string; revisionId: string; ssId?: string }
  associationConfirmed?: boolean
  nameMode?: 'independent' | 'inherit'
  address: FeatureAddress
}
/** Serializable discovery state, excluding callbacks, DOM and in-flight requests. */
export type DraftLocationSearchProgress = {
  /** Versioned provider choices distinguish explicit choices from legacy all-provider defaults. */
  providerDefaultsVersion?: 1
  query: string
  nearbyFilter?: string
  findMode: 'search' | 'pin'
  filters: PlaceSearchFilters
  radius: number
  nearbyMode: boolean
  includeShops: boolean
  includeAddresses: boolean
  includeBuildings: boolean
  associationOrigin?: DraftLocationSearchResult | null
  associationOpen?: boolean
  selected: DraftLocationSearchResult | null
  selectedResultNumber?: number
  accepted: boolean
  linked: boolean
  expandedGroup: string | null
  receivedRows: DraftLocationSearchResult[]
  previousRows: DraftLocationSearchResult[]
  previousQuery: string
  previousScrollTop: number
  searched: boolean
  addressPaging?: {
    near?: { coordinates: [number, number]; radius: number }
    query: string
    total: number
    nextCursor: string | null
    releaseSet: string
  } | null
  placePaging?: {
    near?: { coordinates: [number, number]; radius: number }
    query: string
    filters: PlaceSearchFilters
    locale: 'en' | 'zh-hant' | 'zh-hans'
    nextCursor: string | null
  } | null
  buildingPaging?: {
    query: string
    locale: import('#lib/types.js').LocaleKey
    total: number
    nextCursor: string | null
  } | null
}
