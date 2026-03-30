import type { Snippet } from 'svelte'
import type { NavigableResource, Resource } from '$lib/types'

export type ResourceIndexProps<T extends Resource> = {
  resource: NavigableResource
  entities: T[]
  card?: Snippet<[T, number]>
  row?: Snippet<[T, number]>
  listContainer?: HTMLElement | null
  isInitialised?: boolean
  applyBottomOverflow?: boolean
}

export type ResourceIndexGridRow<T extends Resource> = {
  id: string
  entities: T[]
  startingIndex: number
}

export type ResourceIndexItem<T extends Resource> = T | ResourceIndexGridRow<T>

export type GroupedResourceIndexGroup<
  T extends Resource,
  G extends Record<string, unknown>,
> = {
  group: G
  entities: T[]
}

export type GroupedResourceIndexProps<
  T extends Resource,
  G extends Record<string, unknown>,
> = {
  resource: NavigableResource
  groupedEntities: GroupedResourceIndexGroup<T, G>[]
  card?: Snippet<[T, number]>
  row?: Snippet<[T, number]>
  listContainer?: HTMLElement | null
  scrollIndexByEntityId?: Map<string, number>
}
