import type { Snippet } from 'svelte'

export type RowImageClickHandler = ((image: unknown) => void) | (() => void)

export type RowVariant = 'feature' | 'task' | 'resource'

export type RowRootProps = {
  index: number
  isSelected?: boolean
  variant?: RowVariant
  onclick: (event: MouseEvent) => void
  onkeydown: (event: KeyboardEvent) => void
  class?: string
  children?: Snippet
}

export type RowThumbnailProps = {
  image?: unknown
  imageSrc?: string
  alt?: string
  onClick?: RowImageClickHandler
}

export type RowTitleProps = {
  image?: unknown
  imageSrc?: string
  alt?: string
  onImageClick?: RowImageClickHandler
  title?: string
  onTitleClick?: () => void
  description?: string
  onDescriptionClick?: () => void
}

export type RowTitleSectionProps = RowTitleProps

export type RowProps = RowRootProps & RowTitleProps
