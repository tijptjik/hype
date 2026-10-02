import type { NavigableResource } from '#lib/types.js'
import type { ResourceSortConfig } from '#lib/client/services/filters.types.js'

export type ResourceSortControlProps = {
  resource: NavigableResource
  sortables: ResourceSortConfig
  onOpenChange?: (isOpen: boolean) => void | Promise<void>
  isOpen?: boolean
}
