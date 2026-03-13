import type { Snippet } from 'svelte'
import type { KeyMap, Resource, Task } from '$lib/types'

export type EntityCardEntity<T extends Exclude<Resource, Task>> = T & {
  image?: unknown
}

export type EntityCardProps<T extends Exclude<Resource, Task>> = {
  entity: EntityCardEntity<T>
  keyMap: KeyMap
  header?: Snippet
  content?: Snippet
  actions?: Snippet
  footer?: Snippet
  onImageClick?: (entity: T) => void
}

export type EntityCardRootProps = {
  onclick?: (event: MouseEvent | KeyboardEvent) => void
  onkeydown?: (event: KeyboardEvent) => void
  children?: Snippet
  class?: string
}

export type EntityCardHeaderProps = {
  imageSrc: string
  imageAlt: string
  imageLayout: 'cover' | 'contain'
  onImageClick?: (event: MouseEvent) => void
}

export type EntityCardBodyProps = {
  subtitle?: string
  title: string
  description: string
  actions?: Snippet
}

export type EntityCardFooterBreadcrumb = {
  kind: 'organisation' | 'project' | 'layer'
  label: string
}

export type EntityCardFooterProps = {
  publicationState?: boolean | null
  shortLabel?: string
  breadcrumbs?: EntityCardFooterBreadcrumb[]
  cardWidth?: number
}
