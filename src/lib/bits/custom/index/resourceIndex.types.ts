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
