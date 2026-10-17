// TYPES
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { FirstClassResource } from '#lib/enums.js'
import type { Resource, Id } from '#lib/types.js'
import type { DivisionFacet } from '#lib/api/services/featureQuery.types.js'

// Define a type for the function argument to avoid self-reference
interface SelectedResourcesProps {
  appCtx: ResourceViewCtx
  resourceType: FirstClassResource | 'neighbourhood'
  resources: Resource[] | DivisionFacet[]
  selectedIds: Id[] | string[]
  colorClass?: string
}
