// TYPES
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { Task } from '$lib/db/zod'
import type { Hub } from '$lib/db/zod/schema/hub.types'
import type { Id } from '$lib/types'
import type { RangeFilterValue } from '$lib/client/services/propertyFilters.types'
import type { FirstClassResource } from '$lib/enums'

export type ResourceSortItemConfig = {
  value: string
  label: string
}

export type ResourceSortConfig = {
  items: ResourceSortItemConfig[]
}

/* ----------------- */
// FILTERS :: APP
/* -------- */

// Resources constrained by suncast filters
export type FilteredResources = {
  organisation: Organisation[]
  project: Project[]
  layer: Layer[]
  feature: FeatureFromCollection[]
  task: Task[]
  hub: Hub[]
}

type ResourceFilterState = {
  text?: string
  properties?: Record<
    Id,
    string[] | RangeFilterValue | Record<Id, Record<Id, string[] | RangeFilterValue>>
  >
}

export type FilterState = {
  organisation: ResourceFilterState
  project: ResourceFilterState
  layer: ResourceFilterState
  feature: ResourceFilterState
  task: ResourceFilterState
  hub: ResourceFilterState
  property: ResourceFilterState
}

type AdminFilterStates = Record<FirstClassResource, FilterState>

export type ResourceSortState = {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}
