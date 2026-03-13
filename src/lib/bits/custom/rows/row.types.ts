import type { Snippet } from 'svelte'

export type RowVariant = 'feature' | 'task'

export type RowRootProps = {
  index: number
  isSelected?: boolean
  variant: RowVariant
  onclick: (event: MouseEvent) => void
  onkeydown: (event: KeyboardEvent) => void
  children?: Snippet
}

export type RowThumbnailProps = {
  image?: unknown
  alt?: string
  onClick?: (image: unknown) => void
}

export type RowTitleProps = {
  image?: unknown
  alt?: string
  onImageClick?: (image: unknown) => void
  title?: string
  onTitleClick?: () => void
  description?: string
  onDescriptionClick?: () => void
}

export type RowTitleSectionProps = RowTitleProps

export type RowProps = RowRootProps & RowTitleProps
