import type { FirstClassResource } from '$lib/enums'
import type { ResourceSortConfig } from '$lib/types'

export type ResourceSortControlProps = {
  resource: FirstClassResource
  sortables: ResourceSortConfig
  onOpenChange?: (isOpen: boolean) => void | Promise<void>
  isOpen?: boolean
}
