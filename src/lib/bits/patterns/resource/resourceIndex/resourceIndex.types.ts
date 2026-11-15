import type { Snippet } from 'svelte'
import type { NavigableResource, Resource } from '#lib/types.js'
import type { ResourceIndexRowSelectionState } from '#lib/client/services/bulkEdit.types.js'

export type ResourceIndexProps<T extends Resource> = {
  resource: NavigableResource
  entities: T[]
  card?: Snippet<[T, number]>
  row?: Snippet<[T, number, ResourceIndexRowSelectionState | null, boolean]>
  listContainer?: HTMLElement | null
  isInitialised?: boolean
  onNearEnd?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  applyBottomOverflow?: boolean
  getRowSelectionState?: (entity: T) => ResourceIndexRowSelectionState | null
  onRowSelectionToggle?: (entity: T) => void
}

export type ResourceIndexGridRow<T extends Resource> = {
  id: string
  entities: T[]
  startingIndex: number
}

export type ResourceIndexItem<T extends Resource> = T | ResourceIndexGridRow<T>

export type GroupedResourceIndexGroup<
  T extends { id: string },
  G extends Record<string, unknown>,
> = {
  group: G
  entities: T[]
}

export type GroupedResourceIndexProps<
  T extends { id: string },
  G extends Record<string, unknown>,
> = {
  resource: NavigableResource
  groupedEntities: GroupedResourceIndexGroup<T, G>[]
  isLoading?: boolean
  failed?: boolean
  card?: Snippet<[T, number]>
  row?: Snippet<[T, number]>
  listContainer?: HTMLElement | null
  scrollIndexByEntityId?: Map<string, number>
}

/** Minimal identity shared by Feature rows and system issue rows. */
export type ResourceIndexEntity = { id: string }
