import type { NavigableResource } from '#lib/types.js'
import type { ResourceSortConfig } from '#lib/client/services/filters.types.js'

export type ResourceSortControlProps = {
  resource?: NavigableResource
  sorting?: { sortBy: string; sortOrder: 'asc' | 'desc' }
  onSortingChange?: (sorting: { sortBy: string; sortOrder: 'asc' | 'desc' }) => void
  sortables: ResourceSortConfig
  onOpenChange?: (isOpen: boolean) => void | Promise<void>
  isOpen?: boolean
}
