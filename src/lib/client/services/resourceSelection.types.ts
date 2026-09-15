// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { FirstClassResource } from '$lib/enums'
import type { Resource, Id } from '$lib/types'
import type { Neighbourhood } from '$lib/utils/geocoding.types'

// Define a type for the function argument to avoid self-reference
interface SelectedResourcesProps {
  appCtx: AppCtx
  resourceType: FirstClassResource | 'neighbourhood'
  resources: Resource[] | Neighbourhood[]
  selectedIds: Id[] | string[]
  colorClass?: string
}
