import type { NavigableResource, ResourceSortConfig } from '$lib/types'

export type ResourceSortControlProps = {
  resource: NavigableResource
  sortables: ResourceSortConfig
  onOpenChange?: (isOpen: boolean) => void | Promise<void>
  isOpen?: boolean
}
