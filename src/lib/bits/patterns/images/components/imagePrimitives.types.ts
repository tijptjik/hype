import type { GalleryIntentChangeHandler } from '../images.types'
import type {
  GalleryImageStatus,
  GalleryObjectFit,
  ViewerRenderable,
} from '../images.types'

export type ImageSurfaceProps = {
  item: ViewerRenderable | null
  fit?: GalleryObjectFit
  class?: string
  isLoading?: boolean
  showBackdrop?: boolean
  enableSourceTransition?: boolean
  isBlurred?: boolean
  isGreyscale?: boolean
  shimmer?: boolean
  rounded?: string
  onLoad?: () => void
  onError?: () => void
}

export type ThumbnailButtonProps = {
  item: ViewerRenderable
  fit?: GalleryObjectFit
  size?: number | string
  isActive?: boolean
  isLoading?: boolean
  isBlurred?: boolean
  isGreyscale?: boolean
  shimmer?: boolean
  onSelect?: (item: ViewerRenderable) => void
  onHover?: (item: ViewerRenderable) => void
  onLoad?: () => void
  onError?: () => void
}

export type ViewerControlsProps = {
  canGoPrev: boolean
  canGoNext: boolean
  canEdit?: boolean
  showEditControls?: boolean
  isEditBusy?: boolean
  onPrev: () => void
  onNext: () => void
  onRotateLeft?: () => void | Promise<void>
  onRotateRight?: () => void | Promise<void>
}

export type EmptyStateProps = {
  title: string
  description?: string
}

export type AdminStateOverlayProps = {
  isUploading?: boolean
  isUploadError?: boolean
  uploadErrorMessage?: string | null
  isUnpublished?: boolean
  isDeleteMode?: boolean
  isConfirmingDelete?: boolean
  onCancelDelete?: () => void
  onConfirmDelete?: () => void | Promise<void>
  onRetryUpload?: () => void | Promise<void>
}

export type ThumbnailIntentSelectorProps = {
  imageId: string
  intent?: string | null
  onIntentChange?: GalleryIntentChangeHandler
}

export type ViewerStageProps = {
  currentItem: ViewerRenderable | null
  activeId?: string | null
  fit?: GalleryObjectFit
  status?: GalleryImageStatus
  class?: string
  rounded?: string
  showBackdrop?: boolean
  viewTransitionName?: string
  onCurrentItemLoad?: (item: ViewerRenderable) => void
}
