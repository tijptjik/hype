// TYPES
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'

import type { FeatureQueryFilters } from '#lib/api/services/featureQuery.types.js'

/** Independent views share retained entities without replacing each other's membership. */
export type FeatureQueryChannel =
  | 'map'
  | 'search'
  | 'searchWishlist'
  | 'collection'
  | 'facets'
  | 'wishlist'
  | 'visited'

/** Known local membership facts used for immediate previews of a new query. */
export type FeatureQueryMatchContext = {
  listMembership?: (
    row: FeatureFromCollection,
    list: NonNullable<FeatureQueryFilters['list']>,
  ) => boolean | undefined
  organisationCode?: (id: string) => string | undefined
  projectCode?: (id: string) => string | undefined
  layerProjectId?: (id: string) => string | undefined
  projectOrganisationId?: (id: string) => string | undefined
}

/** Native active admin feature collection retained for reactive mutation reconciliation. */
export type FeatureCollectionHandle = import('$app/server').RemoteQuery<{
  data: FeatureFromCollection[]
}>

export type ResourceDetailHandle = {
  snapshot?: unknown
  query: Promise<{ data?: unknown }> & {
    refresh?: () => Promise<void>
    current?: { data?: unknown }
  }
  fetchedAt: number
}

export type ResourceOptimisticInput = {
  meta?: { id?: string; mode?: string }
  data?: Record<string, unknown>
}
