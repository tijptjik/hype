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
  isLoading?: boolean
  onSelect?: (item: ViewerRenderable) => void
  onLoad?: () => void
  onError?: () => void
}

export type AdminThumbnailProps = ThumbnailProps & {
  isBlurred?: boolean
  isGreyscale?: boolean
  isUploading?: boolean
  isDeleteMode?: boolean
  onIntentChange?: GalleryIntentChangeHandler
  onDelete?: (item: ViewerRenderable) => void | Promise<void>
  onRetryUpload?: (item: ViewerRenderable) => void | Promise<void>
}

export type ImageProps = {
  item: ViewerRenderable | null
  fit?: GalleryObjectFit
  isLoading?: boolean
}

export type ViewerProps = {
  items: ViewerRenderable[]
  activeId?: string | null
  retainedItem?: ViewerRenderable | null
  isFullscreen?: boolean
  fullscreenRequestKey?: number
  fit?: GalleryObjectFit
  viewerFit?: GalleryObjectFit
  leftRail?: GalleryWidgetRail
  centerRail?: GalleryWidgetRail
  rightRail?: GalleryWidgetRail
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
  onCaptureFiles?: (files: FileList | File[]) => void
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
  getIsBlurred?: (item: ViewerRenderable) => boolean
  getIsGreyscale?: (item: ViewerRenderable) => boolean
  getIsLoading?: (item: ViewerRenderable) => boolean
  getIsUploading?: (item: ViewerRenderable) => boolean
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
  canDownloadActiveImage?: boolean
  isEditBusy?: boolean
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
