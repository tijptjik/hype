import type { NavigableResource } from '$lib/types'
import type { ResourceSortConfig } from '$lib/client/services/filters.types'

export type ResourceSortControlProps = {
  resource: NavigableResource
  sortables: ResourceSortConfig
  onOpenChange?: (isOpen: boolean) => void | Promise<void>
  isOpen?: boolean
}
