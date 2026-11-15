import type { Snippet } from 'svelte'
import type { ResourceIndexRowSelectionState } from '#lib/client/services/bulkEdit.types.js'

export type RowImageClickHandler = ((image: unknown) => void) | (() => void)

export type RowVariant = 'feature' | 'task' | 'resource'

export type RowRootProps = {
  index: number
  entityId?: string
  isSelected?: boolean
  selectionState?: ResourceIndexRowSelectionState | null
  /** Whether the row itself is an action; nested buttons remain interactive. */
  interactive?: boolean
  isFocusable?: boolean
  variant?: RowVariant
  onclick: (event: MouseEvent) => void
  onkeydown: (event: KeyboardEvent) => void
  class?: string
  children?: Snippet
}

export type RowThumbnailProps = {
  image?: unknown
  imageInset?: boolean
  imageSrc?: string
  imageFallbackSrcs?: string[]
  imageFallback?: Snippet
  alt?: string
  onClick?: RowImageClickHandler
}

export type RowTitleProps = {
  image?: unknown
  imageInset?: boolean
  imageSrc?: string
  imageFallbackSrcs?: string[]
  imageFallback?: Snippet
  alt?: string
  onImageClick?: RowImageClickHandler
  title?: string
  onTitleClick?: () => void
  description?: string
  onDescriptionClick?: () => void
}

export type RowTitleSectionProps = RowTitleProps

export type RowProps = RowRootProps & RowTitleProps
