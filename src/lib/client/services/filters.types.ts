// TYPES
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { Task } from '#lib/db/zod/index.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { Id } from '#lib/types.js'
import type { RangeFilterValue } from '#lib/client/services/propertyFilters.types.js'

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
  properties?: Record<Id, Record<Id, string[] | RangeFilterValue>>
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

export type ResourceSortState = {
  sortBy: string
  sortOrder: 'asc' | 'desc'
}
