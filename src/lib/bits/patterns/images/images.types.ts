import type { Snippet } from 'svelte'
import type { Intent, UploadStatus } from '$lib/db/zod/schema/image.types'

export type GalleryObjectFit = 'fit' | 'cover'
export type GalleryCenterAction = 'none' | 'fullscreen' | 'custom'
export type GalleryUploadSelectionMode = 'single' | 'multiple'

export type GalleryImageStatus =
  | 'idle'
  | 'loading'
  | 'loaded'
  | 'uploading'
  | 'deleting'
  | 'error'

export type ViewerRenderable = {
  id: string
  renderKey?: string
  src?: string | null
  sourceFallbackSrc?: string | null
  thumbnailSrc?: string | null
  blurSrc?: string | null
  alt?: string | null
  fallbackSeed?: string | null
  intent?: string | null
  isPublished?: boolean | null
  rotationDegrees?: number | null
  animateRotation?: boolean | null
  status?: ViewerRenderableStatus | null
  meta?: Record<string, unknown>
}

type ViewerRenderableStatusBase = {
  sortCreatedAt?: string | null
  savedImageId?: string | null
  uploadStatus?: UploadStatus
  uploadErrorMessage?: string | null
}

export type ViewerRenderableStatus =
  | (ViewerRenderableStatusBase & {
      kind: 'persisted'
    })
  | (ViewerRenderableStatusBase & {
      kind: 'optimistic-upload'
      uploadStatus: UploadStatus
    })
  | (ViewerRenderableStatusBase & {
      kind: 'replacement-upload'
      uploadStatus: UploadStatus
    })
  | (ViewerRenderableStatusBase & {
      kind: 'finalized-upload'
      uploadStatus: 'uploaded'
    })

export type GalleryWidgetRail = Snippet<[ViewerRenderable]>

export type GalleryIntentChangeHandler = (
  item: ViewerRenderable,
  intent: Intent,
) => void | Promise<void>

export type ThumbnailProps = {
  item: ViewerRenderable
  fit?: GalleryObjectFit
  size?: number | string
  rounded?: string
  isActive?: boolean
  isHighlighted?: boolean
  highlightClass?: string
  isLoading?: boolean
  onSelect?: (item: ViewerRenderable) => void
  onHover?: (item: ViewerRenderable) => void
  onLoad?: () => void
  onError?: () => void
}

export type AdminThumbnailProps = ThumbnailProps & {
  isBlurred?: boolean
  isGreyscale?: boolean
  isUploading?: boolean
  isDeleteMode?: boolean
  isIntentDisabled?: boolean
  badgeLabel?: string | null
  badgeClass?: string
  intentPopoverSide?: 'top' | 'right' | 'bottom' | 'left'
  onIntentChange?: GalleryIntentChangeHandler
  onDelete?: (item: ViewerRenderable) => void | Promise<void>
  onRetryUpload?: (item: ViewerRenderable) => void | Promise<void>
}

export type RenderableImageProps = {
  item: ViewerRenderable | null
  fit?: GalleryObjectFit
  isLoading?: boolean
}

export type ImageProps = {
  src: string | null
  alt: string
  fit?: GalleryObjectFit
  isLoading?: boolean
  class?: string
}

export type ViewerProps = {
  items: ViewerRenderable[]
  activeId?: string | null
  retainedItem?: ViewerRenderable | null
  isFullscreen?: boolean
  fullscreenRequestKey?: number
  fit?: GalleryObjectFit
  viewerFit?: GalleryObjectFit
  enableStageViewTransitions?: boolean
  wrapNavigation?: boolean
  showNavButtons?: boolean
  railPadding?: number
  leftRail?: GalleryWidgetRail
  centerRail?: GalleryWidgetRail
  rightRail?: GalleryWidgetRail
  emptyState?: Snippet
  centerAction?: GalleryCenterAction
  centerActionLabel?: string
  onCenterAction?: (item: ViewerRenderable) => void | Promise<void>
  onActiveIdChange?: (id: string | null) => void
  onNavigateToItem?: (id: string) => void
  onCurrentItemLoad?: (item: ViewerRenderable) => void
}

export type AdminViewerProps = ViewerProps & {
  isEmptyUploadEnabled?: boolean
  isEmptyDropzoneEnabled?: boolean
  isEmptyUploadDisabled?: boolean
  uploadSelectionMode?: GalleryUploadSelectionMode
  onUploadFiles?: (files: FileList | File[]) => void
}

export type CameraViewerProps = AdminViewerProps & {
  emptyDescription?: string | null
  onCaptureFiles?: (files: FileList | File[]) => void
  onDeleteItem?: (item: ViewerRenderable) => void | Promise<void>
}

export type ThumbnailWrapperProps = {
  items: ViewerRenderable[]
  activeId?: string | null
  followActiveIdRequestKey?: number
  followActiveIdRequestId?: string | null
  fit?: GalleryObjectFit
  prefetchFit?: GalleryObjectFit
  variant?: 'default' | 'admin'
  class?: string
  size?: number | string
  orientation?: 'horizontal' | 'vertical'
  isDeleteMode?: boolean
  flipMode?: boolean
  getIsHighlighted?: (item: ViewerRenderable) => boolean
  highlightClass?: string
  getBadgeLabel?: (item: ViewerRenderable) => string | null
  getBadgeClass?: (item: ViewerRenderable) => string | undefined
  getIsBlurred?: (item: ViewerRenderable) => boolean
  getIsGreyscale?: (item: ViewerRenderable) => boolean
  getIsLoading?: (item: ViewerRenderable) => boolean
  getIsUploading?: (item: ViewerRenderable) => boolean
  isIntentDisabled?: boolean
  onIntentChange?: GalleryIntentChangeHandler
  onDelete?: (item: ViewerRenderable) => void | Promise<void>
  onRetryUpload?: (item: ViewerRenderable) => void | Promise<void>
  onSelect?: (item: ViewerRenderable) => void
  onHover?: (item: ViewerRenderable) => void
  onLoad?: (item: ViewerRenderable) => void
  onError?: (item: ViewerRenderable) => void
  footer?: Snippet
}

export type ImageEditorProps = {
  items: ViewerRenderable[]
  class?: string
  activeId?: string | null
  isFullscreen?: boolean
  fullscreenRequestKey?: number
  fit?: GalleryObjectFit
  uploadSelectionMode?: GalleryUploadSelectionMode
  disableHoverPreview?: boolean
  isProcessingUploads?: boolean
  lockActiveIdWhileItemsSettle?: boolean
  leftRail?: GalleryWidgetRail
  rightRail?: GalleryWidgetRail
  isPublished?: boolean
  presentationMode?: 'cover' | 'contain'
  canMutateActiveImage?: boolean
  canRotateActiveImage?: boolean
  canEditActiveImage?: boolean
  canReplaceActiveImage?: boolean
  canDeleteActiveImage?: boolean
  canDownloadActiveImage?: boolean
  isEditBusy?: boolean
  isReadonly?: boolean
  isIntentDisabled?: boolean
  viewerControlsOffsetClass?: string
  getIsHighlighted?: (item: ViewerRenderable) => boolean
  highlightClass?: string
  getBadgeLabel?: (item: ViewerRenderable) => string | null
  getBadgeClass?: (item: ViewerRenderable) => string | undefined
  getIsBlurred?: (item: ViewerRenderable) => boolean
  getIsGreyscale?: (item: ViewerRenderable) => boolean
  getIsLoading?: (item: ViewerRenderable) => boolean
  getIsUploading?: (item: ViewerRenderable) => boolean
  onActiveIdChange?: (id: string | null) => void
  onCurrentItemLoad?: (item: ViewerRenderable) => void
  onRotateLeft?: () => void | Promise<void>
  onRotateRight?: () => void | Promise<void>
  onTogglePublished?: () => void
  onPresentationModeChange?: (mode: 'cover' | 'contain') => void | Promise<void>
  onReplaceFiles?: (files: FileList | File[]) => void
  onToggleFullscreen?: () => void | Promise<void>
  onAddFiles?: (files: FileList | File[]) => void
  onDownload?: () => void
  onIntentChange?: GalleryIntentChangeHandler
  onDelete?: (item: ViewerRenderable) => void | Promise<void>
  onRetryUpload?: (item: ViewerRenderable) => void | Promise<void>
  onThumbnailLoad?: (item: ViewerRenderable) => void
  onThumbnailError?: (item: ViewerRenderable) => void
}
