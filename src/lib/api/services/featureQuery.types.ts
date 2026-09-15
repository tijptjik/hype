// TYPES
import type { RangeFilterValue } from '$lib/client/services/propertyFilters.types'
import type { Prisms } from '$lib/types'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

/** Geographic membership for a bounded feature query; bounds use GeoJSON axis order. */
export type FeatureSpatialQuery = {
  resolution: number
  cells: string[]
  bounds?: [number, number, number, number]
}

/** Filters compose identically for map, search, neighbourhood and user-list views. */
export type FeatureQueryFilters = {
  properties?: Record<string, Record<string, string[] | RangeFilterValue | boolean>>
  /** Stable SaanSeoi IDs at any level, including landform; matches any selected membership. */
  divisionIds?: string[]
  neighbourhoods?: string[]
  excludeNeighbourhoods?: string[]
  list?: { userId?: string; listId: 'wishlist' | 'visited' }
  isVisitable?: boolean
  isIntangible?: boolean
}

/** Complete feature query identity; the server derives authorization independently of scope. */
export type FeatureQueryInput = {
  q?: string
  prisms?: Partial<Prisms>
  filters?: FeatureQueryFilters
  spatial?: FeatureSpatialQuery
  /** Already retained map markers omitted from this page, without changing query totals. */
  excludeIds?: string[]
  /** Map discovery can omit all count/revision/cache work while loading additional markers. */
  includeCounts?: boolean
  limit?: number
  sorting?: { sortBy: 'id' | 'visitedAt'; sortOrder: 'asc' | 'desc' }
  cursor?: { id: string; signature: string; value?: string | null } | null
  meta: { isAdminRequest: boolean; scope: string }
}

/** Counts cover the entire filtered query, independently of page traversal. */
export type FeatureQueryPage = {
  data: FeatureFromCollection[]
  totalCount: number | null
  nextCursor: { id: string; signature: string; value?: string | null } | null
  facets: { neighbourhoods: Record<string, number> } | null
  /** Current actor's membership state for returned features, including rows beyond bootstrap. */
  userFeatures?: import('$lib/db/zod/schema/user.types').UserFeature[]
}
