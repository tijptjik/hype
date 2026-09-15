// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { FirstClassResource } from '$lib/enums'
import type { Resource, Id } from '$lib/types'
import type { DivisionFacet } from '$lib/api/services/featureQuery.types'

// Define a type for the function argument to avoid self-reference
interface SelectedResourcesProps {
  appCtx: AppCtx
  resourceType: FirstClassResource | 'neighbourhood'
  resources: Resource[] | DivisionFacet[]
  selectedIds: Id[] | string[]
  colorClass?: string
}
