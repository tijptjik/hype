import type { Snippet } from 'svelte'
import type { ResourceIndexRowSelectionState } from '#lib/client/services/bulkEdit.types.js'

export type RowImageClickHandler = ((image: unknown) => void) | (() => void)

export type RowVariant = 'feature' | 'task' | 'resource'

export type RowRootProps = {
  index: number
  entityId?: string
  isSelected?: boolean
  selectionState?: ResourceIndexRowSelectionState | null
  isFocusable?: boolean
  variant?: RowVariant
  class?: string
  children?: Snippet
} & /** An inert row can contain interactive descendants without its own handlers. */
(
  | {
      interactive: false
      onclick?: (event: MouseEvent) => void
      onkeydown?: (event: KeyboardEvent) => void
    }
  | {
      interactive?: boolean
      onclick: (event: MouseEvent) => void
      onkeydown: (event: KeyboardEvent) => void
    }
)

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
