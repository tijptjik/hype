import type { Snippet } from 'svelte'
import type { NavigableResource, Resource } from '$lib/types'
export type { ResourceIndexProps } from '$lib/bits/custom/index/resourceIndex.types'

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
}
