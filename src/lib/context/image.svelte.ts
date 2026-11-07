// IMAGE INTENT POLICY
import {
  DEFAULT_IMAGE_INTENTS,
  type ImageIntentDefinition,
} from '#lib/images/intents.js'
import { loadImageIntentOptions } from '#lib/client/services/imageIntentOptions.js'
// SVELTE
import { getContext, setContext } from 'svelte'
import { SvelteSet, SvelteMap } from 'svelte/reactivity'
import { toast } from 'svelte-sonner'
// I18N
import { m } from '#lib/i18n.js'
// SERVICES
import {
  finalizePreparedImageUpload,
  uploadAndProcessImage,
  getURLfromImage,
  prepareImageUpload,
  sortImages,
  uploadPreparedImageObject,
} from '#lib/client/services/image.js'
import { createPreviewableUploadFile } from '#lib/images/upload.js'
import { DEFAULT_UPLOAD_IMAGE_PRESENTATION } from '#lib/images/presentation.js'
import {
  deleteImage as deleteImageRemote,
  getImagesForContext,
  rotateImage as rotateImageRemote,
  setImageIntent,
  setImagePublished,
  updateImage as updateImageRemote,
} from '#lib/api/image.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
import { projectResourcePatch } from '#lib/client/services/optimisticRecords.js'
// CONTEXT
import {
  getSurfaceCtx,
  type ResourceViewCtx,
} from '#lib/context/resourceView.svelte.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { ImageContextResource, ImageContextResourceExtended } from '#lib/enums.js'
import type { Id } from '#lib/types.js'
import type {
  ImageCtxConstructorOptions,
  ImageContextConfig,
} from '#lib/context/imageProvider.types.js'
import type {
  Image,
  ImageCtxEnvelope,
  ImageEditCtx,
  ImageUpload,
  ImageUploadCtx,
  Intent,
  LoadStatus,
  UploadStatus,
} from '#lib/db/zod/schema/image.types.js'
import type { HubDB } from '#lib/db/zod/schema/hub.types.js'
import type { OrganisationDB } from '#lib/db/zod/schema/organisation.types.js'
import type { ProjectDB } from '#lib/db/zod/schema/project.types.js'
import { addParamToUrl } from '#lib/navigation/index.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'

function isAbortedImageLoadError(error: unknown): boolean {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError'
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as { type?: unknown }).type === 'error'
  ) {
    const target = (error as { target?: unknown }).target

    if (
      typeof HTMLImageElement !== 'undefined' &&
      target instanceof HTMLImageElement &&
      target.currentSrc.length > 0
    ) {
      return true
    }
  }

  return false
}

async function createOptimisticPreviewUrl(file: File): Promise<string> {
  try {
    const previewFile = await createPreviewableUploadFile(file)
    return URL.createObjectURL(previewFile)
  } catch {
    return URL.createObjectURL(file)
  }
}

/**
 * Checks whether an entry has an image record with a usable identity.
 * @param image Candidate envelope from preloaded or remote image data.
 * @returns Whether the entry can participate in viewer image lookup and selection.
 */
function isValidImageEnvelope(
  image: ImageCtxEnvelope | null | undefined,
): image is ImageCtxEnvelope {
  return typeof image?.image?.id === 'string' && image.image.id.length > 0
}

function getErrorMessage(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return null
}

type SingleImageResourceCacheEntry = {
  id: Id
  image?: { image: { id: Id } } | null
}

// ═══════════════════════
// TYPES :: ImageCtx
// ═══════════════════════

// ═══════════════════════
// TABLE OF CONTENTS :: ImageCtx Class
// ═══════════════════════
//
// 1. CONSTRUCTOR & SETUP
//    - constructor
//    - setContext
//
// 2. REACTIVE STATE
//    - state (Main reactive state object)

//    - imagesQueryKey ($derived)
//    - isImagesLoading ($derived)
//    - viewerState ($derived, uses determineViewerState)
//
// 3. STATE MANAGEMENT
//    - determineViewerState
//
// 3.1 STATE MANAGEMENT :: CONTEXT
//    - setCtx
//    - getCtx
//
// 3.2 STATE MANAGEMENT :: UPLOAD
//    - getUploadCtx
//    - getUploadQueue
//    - setUploadQueue
//    - resetUploadQueue
//    - addToUploadQueue
//    - removeFromUploadQueue
//    - addToRejected
//    - setUploadStatus
//    - setUploadToRetry
//
// 3.3 STATE MANAGEMENT :: PENDING CONFIRMATION
//    - addToPendingConfirmation
//    - removeFromPendingConfirmation
//    - resetPendingConfirmation
//    - pendingConfirmationHas
//
// 3.4 STATE MANAGEMENT :: DELETION
//    - resetDeletionQueue
//    - addToDeletionQueue
//    - removeFromDeletionQueue
//    - deletionQueueHas
//
// 3.5 STATE MANAGEMENT :: IMAGES
//    - getImage
//    - getImages
//    - setImages
//    - resetImages
//    - removeImage
//    - setForImage
//
// 3.6 STATE MANAGEMENT :: LOAD STATUS
//    - getLoadStatus
//    - setLoadStatus
//    - getLoadStatuses
//    - resetLoadStatus
//
// 3.7 STATE MANAGEMENT :: UPLOAD STATUS
//    - setUploadStatus
//    - getUploadStatus
//    - resetUploadStatus
//
// 3.8 STATE MANAGEMENT :: THUMBNAIL LOAD STATUS
//    - setThumbnailLoadStatus
//    - getThumbnailLoadStatus
//    - resetThumbnailLoadStatus
//
// 3.9 STATE MANAGEMENT :: ACTIVE IMAGE
//    - setActiveImage
//    - resetActiveImage
//    - setActiveImageToFirst
//    - setForActiveImage
//    - toggleForActiveImage
//    - getReplacementUpload
//    - isImageHighlighted
//    - getImageIsPublished
//    - isImageBeingReplaced
//
// 3.10 STATE MANAGEMENT :: ACTIVE PREVIEW
//    - setActivePreview
//    - resetActivePreview
//
// 3.11 STATE MANAGEMENT :: MODE
//    - setMode
//    - getMode
//    - isFullscreen

// 4. Data Fetching & Refreshing
//    - refreshImages
//    - imagesQueryFn
//    - extendedImagesQueryFn
//    - fetchSingleImage
//
// 5. UI Navigation
//    - switchToImage
//
// 6. Upload Handling
//    - handleFilesSelect
//    - uploadConfirmationIdentity (private)
//    - retainUploadConfirmation (private)
//    - retainedUploadConfirmation (private)
//    - processUploadQueue (private)
//    - upload
//    - retryUpload
//    - isReplacementStatus
//
// 7. Image Attribute Updates (Patching)
//    - handleSetIntent
//    - handlePublishToggle
//    - handleRotate
//
// 8. Deletion Handling
//    - handlePreDelete
//    - handleCancelDelete
//    - handleConfirmDelete
//    - processDeletionQueue
//    - delete
//
// 9. Download Functionality
//    - downloadImage
//
// 10. Preloading Utilities
//    - preloadImage
//    - preloadImages
//    - isImagePreloaded
//
// 11. Internal Helper Methods
//    - sortImages (private, for internal array sorting)

/**
 * Central image-viewer state for context-aware image loading, uploads, staging, and mutations.
 */
export class ImageCtx {
  intentOptions = $state<ImageIntentDefinition[]>([...DEFAULT_IMAGE_INTENTS])
  autoPublishUnclassified = $state(true)
  isAdminMode: boolean = false
  readonly appCtx: Pick<
    ResourceViewCtx,
    'cache' | 'resources' | 'getTaskById' | 'invalidateResourceTargeted' | 'isAdmin'
  >

  // Track refresh order as well as context transitions to prevent stale image commits.
  private imageRefreshSerial = 0
  // Queue entries may be observed by overlapping selections and retry clicks.
  private readonly activeUploads = new Set<string>()
  private readonly preparedConfirmations = new Map<
    string,
    {
      file: File
      identity: string
      featureOptions?: { isPublished: boolean; intent: Intent }
      prepared: Awaited<ReturnType<typeof prepareImageUpload>>
    }
  >()
  private uploadEntrySerial = 0
  private readonly imageDeletions = new Map<string, Promise<void>>()

  // ═══════════════════════
  // 1. CONSTRUCTOR & SETUP
  // ═══════════════════════
  constructor(
    options: ImageCtxConstructorOptions,
    resources: Pick<
      ResourceViewCtx,
      'cache' | 'resources' | 'getTaskById' | 'invalidateResourceTargeted' | 'isAdmin'
    >,
  ) {
    this.appCtx = resources
    const {
      isAdminMode = false,
      context,
      image,
      images,
      highlightedIds = [],
      isFullScreen = false,
    } = options

    this.isAdminMode = isAdminMode

    // Listen for publish events to refresh images when related records are published
    this.setupEventListeners()

    this.setContext({ context, image, images, highlightedIds })

    if (isFullScreen) {
      this.setMode('fullscreen')
    }
  }

  private setupEventListeners() {
    // Listen for refresh images events (e.g., when a feature is published)
    if (typeof window === 'undefined') return
    window.addEventListener('refreshImages', this.handleRefreshImagesEvent)
  }

  /** Removes view-owned listeners and supersedes pending reads. @returns Nothing. */
  dispose(): void {
    this.imageRefreshSerial++
    if (typeof window !== 'undefined')
      window.removeEventListener('refreshImages', this.handleRefreshImagesEvent)
  }

  private handleRefreshImagesEvent = (event: Event) => {
    const customEvent = event as CustomEvent
    // Catalogue saves invalidate every mounted gallery, including inherited Project policies.
    if (!customEvent.detail) {
      void this.refreshImages()
      return
    }
    // Only refresh if we have a context that matches the published resource
    if (this.state.context?.ctxType && this.state.context?.ctxId) {
      const { resourceType, resourceId } = customEvent.detail

      // Refresh images if the published resource matches our current context
      if (
        (resourceType === 'feature' &&
          this.state.context.ctxType === 'feature' &&
          this.state.context.ctxId === resourceId) ||
        (resourceType === 'project' &&
          this.state.context.ctxType === 'project' &&
          this.state.context.ctxId === resourceId) ||
        (resourceType === 'organisation' &&
          this.state.context.ctxType === 'organisation' &&
          this.state.context.ctxId === resourceId)
      ) {
        this.refreshImages()
      }
    }
    setTimeout(() => {
      if (!this.state.activeImage) {
        this.setActiveImageToFirst()
      }
    }, 100)
  }

  /**
   * Sets the active resource context and primes local image state for that resource.
   *
   * @param options Context payload plus optional preloaded image data.
   * @returns Resolves after any required image hydration work has completed.
   */
  async setContext(options: {
    context?: ImageContextConfig | null
    image?: ImageCtxEnvelope | null | undefined
    images?: ImageCtxEnvelope[] | null
    highlightedIds?: Id[]
  }) {
    const optionsWithDefaults = {
      context: this.state.context || null,
      image: null,
      images: null,
      highlightedIds: this.state.highlightedIds || [],
      ...options,
    }

    const { context, image, images, highlightedIds } = optionsWithDefaults

    // Check if this is actually a context change to avoid unnecessary resets
    const isContextChange =
      this.state.context?.ctxType !== context?.ctxType ||
      this.state.context?.ctxId !== context?.ctxId ||
      this.state.context?.ctxTypeSecondary !== context?.ctxTypeSecondary ||
      this.state.context?.ctxIdSecondary !== context?.ctxIdSecondary

    // Supersede pending reads even when only secondary or preloaded images change.
    const contextSerial = ++this.imageRefreshSerial
    this.state.isFetchingImages = false

    if (isContextChange) {
      // Reset context-bound transient state before new async loads can write into it.
      this.resetUploadStatus()
      this.resetPendingConfirmation()
      this.resetDeletionQueue()
      this.resetUploadQueue()
      this.resetImages()
      // DO NOT reset the active image to allow for smooth transitions
      // DO reset the target image so we don't have a stale image in the target image state
      // this.resetActiveImage();
      this.resetTargetImage()

      // Mark this as a context change for PhotoFrame transition logic
      this.state.lastChangeType = 'context'
    }

    this.state.context = context
    this.state.highlightedIds = highlightedIds

    // CASE 1 : Images preloaded
    if (images && images.length > 0) {
      const validImages = images.filter(isValidImageEnvelope)
      await this.setImages(validImages)
      if (this.imageRefreshSerial !== contextSerial) return
      // Set active image when we have preloaded images
      this.setActiveImageToTargetOrFirst()
      // CASE 2 : Images not preloaded except for the leading image
    } else if (image) {
      await this.setImages([image])
      if (this.imageRefreshSerial !== contextSerial) return
      this.setActiveImageToTargetOrFirst()
      await this.refreshImages()
      // CASE 3 : Initial Context - we will have an async image set
    } else if (image === undefined) {
      this.refreshImages()
    } else {
      // CASE 4 : Feature has no images, so just clear the image states.
      await this.setImages([])
      if (this.imageRefreshSerial !== contextSerial) return
      this.resetTargetImage()
      this.resetActiveImage()
    }
  }

  // ═══════════════════════
  // 2. REACTIVE STATE
  // ═══════════════════════
  state = $state({
    // Context configuration
    context: null as ImageContextConfig | null,
    isFetchingImages: false, // Track when we're fetching images from API

    // The IDs of the images to be highlighted
    highlightedIds: [] as Id[],

    // CRUD :: CREATE
    uploadQueue: [] as ImageUpload[],
    stagingQueue: [] as ImageUpload[],
    rejected: [] as File[],

    // CRUD :: READ
    images: new SvelteMap<Id, ImageCtxEnvelope>(),
    activeItemId: null as string | null,
    activeImage: null as ImageCtxEnvelope | null,
    targetImage: null as ImageCtxEnvelope | null, // Image we're transitioning to
    targetImageId: null as Id | null, // Use if we don't have the targetImage, so still need to fetch it.
    isTransitioning: false, // Whether we're smoothly transitioning between images
    activePreview: null as ImageUpload | null,

    // Change tracking for PhotoFrame transition logic
    lastChangeType: null as 'initial' | 'index' | 'target' | 'context' | null,

    // Status tracking
    loadStatus: new SvelteMap<Id, LoadStatus>(),
    uploadStatus: new SvelteMap<Id, UploadStatus>(),
    thumbnailLoadStatus: new SvelteMap<Id, LoadStatus>(),
    preloadedImages: new SvelteSet<string>(),

    // Error tracking
    errorMessages: new SvelteMap<Id, { message: string; timestamp: number }>(),

    // CRUD :: DELETE
    pendingConfirmation: new SvelteSet<Id>(),
    deletionQueue: new SvelteSet<Id>(),

    // MODES
    isFullscreen: false,
  })

  // ═══════════════════════
  // 2,1 DERIVED STATES
  // ═══════════════════════

  imagesQueryKey = $derived([
    'images',
    this.state.context?.ctxType,
    this.state.context?.ctxId,
  ])

  determineViewerState = () => {
    // PRIORITY 0: Check if we're fetching images from API (early loading state)
    if (this.state.isFetchingImages) {
      return 'loading'
    }

    // PRIORITY 1: Check if active image is currently being replaced (uploading)
    if (
      this.state.activeImage &&
      this.isReplacementStatus(this.state.activeImage.image.id, 'uploading')
    ) {
      return 'previewReplacement'
    }

    // PRIORITY 2: Check if active image is being replaced with uploaded content
    if (
      this.state.activeImage &&
      this.isReplacementStatus(this.state.activeImage.image.id, 'uploaded') &&
      this.getLoadStatus(this.state.activeImage.image.id) !== 'loaded'
    ) {
      return 'transition'
    }

    // PRIORITY 3: Check if there's an active preview (fresh upload) that's still uploading
    if (this.state.activePreview && this.state.activePreview.status === 'uploading') {
      return 'previewUploading'
    }

    // PRIORITY 4: Check load status of active image
    if (this.state.activeImage) {
      const loadStatus = this.getLoadStatus(this.state.activeImage.image.id)
      if (loadStatus === 'loading') {
        return 'loading'
      } else if (loadStatus === 'error') {
        return 'error'
      } else if (loadStatus === 'loaded') {
        return 'loaded'
      }
      // If no load status is set, default to loading
      return 'loading'
    }

    // PRIORITY 5: Check if there's an active preview (fresh upload) that's uploaded but no active image yet
    if (this.state.activePreview) {
      return 'previewUploading'
    }

    // Default to empty state
    return 'empty'
  }

  viewerState = $derived.by(() => {
    return this.determineViewerState()
  })

  // ═══════════════════════
  // 3. STATE MANAGEMENT
  // ═══════════════════════

  // ═══════════════════════
  // 3.1 STATE MANAGEMENT :: CONTEXT
  // ═══════════════════════

  /**
   * Returns the current mutation context for image remote calls.
   *
   * @returns The current context type and id.
   */
  getCtx(): ImageEditCtx {
    if (!this.state.context?.ctxType || !this.state.context?.ctxId) {
      throw new Error('No context type or ID available')
    }
    return {
      ctxType: this.state.context.ctxType,
      ctxId: this.state.context.ctxId,
    }
  }

  // ═══════════════════════
  // 3.3 STATE MANAGEMENT :: UPLOAD
  // ═══════════════════════

  /**
   * Builds the upload context required by image upload services.
   *
   * @param imageToReplace Optional image being replaced instead of creating a new record.
   * @returns The upload context for the current resource.
   */
  getUploadCtx(imageToReplace?: ImageCtxEnvelope): ImageUploadCtx {
    if (!this.state.context?.ctxType || !this.state.context?.ctxId) {
      throw new Error('No context available for upload')
    }
    return {
      ctxType: this.state.context.ctxType,
      ctxId: this.state.context.ctxId,
      hub: this.state.context.hub as HubDB,
      organisation: this.state.context.organisation as OrganisationDB,
      project: this.state.context.project as ProjectDB,
      ...(imageToReplace !== undefined ? { imageToReplace } : {}),
    }
  }

  getUploadQueue() {
    return this.state.uploadQueue
  }

  setUploadQueue(uploadQueue: ImageUpload[]) {
    // Removed/replaced entries must not retain signed credentials or normalized file bytes.
    for (const [key, retained] of this.preparedConfirmations) {
      if (
        !uploadQueue.some(
          item => item.optimisticKey === key && item.file === retained.file,
        )
      )
        this.preparedConfirmations.delete(key)
    }
    this.state.uploadQueue = uploadQueue
    // Update active preview
    this.updateActivePreview()
  }

  resetUploadQueue() {
    this.preparedConfirmations.clear()
    this.state.uploadQueue = []
    this.resetActivePreview()
  }

  async addToUploadQueue(
    files: File[],
    imageToReplace?: ImageCtxEnvelope,
  ): Promise<void> {
    const contextAtStart = this.state.context
    if (imageToReplace) {
      this.state.uploadQueue = this.state.uploadQueue.filter(upload => {
        const isReplacementForSameImage =
          upload.imageToReplace?.image.id === imageToReplace.image.id

        if (!isReplacementForSameImage) {
          return true
        }

        if (upload.preview) {
          URL.revokeObjectURL(upload.preview)
        }

        return false
      })
    }

    const queuedAtBase = Date.now()
    const newUploads = await Promise.all(
      files.map(async (file, index) => {
        const preview = await createOptimisticPreviewUrl(file)

        return {
          file,
          status: 'uploading',
          retries: 0,
          queuedAt: queuedAtBase + index,
          optimisticKey: `optimistic-upload-${queuedAtBase}-${index}-${file.name}-${file.lastModified}-${++this.uploadEntrySerial}`,
          imageToReplace,
          preview,
        } as ImageUpload
      }),
    )

    if (this.state.context !== contextAtStart) {
      for (const upload of newUploads)
        if (upload.preview) URL.revokeObjectURL(upload.preview)
      return
    }
    this.state.uploadQueue.push(...newUploads)

    // Update preview URLs for replacing images
    newUploads.forEach(upload => {
      if (imageToReplace && this.state.images.has(imageToReplace.image.id)) {
        const existingImage = this.state.images.get(imageToReplace.image.id)
        if (existingImage) {
          if (existingImage.image.preview) {
            URL.revokeObjectURL(existingImage.image.preview)
          }

          const updatedImage = {
            ...existingImage,
            image: {
              ...existingImage.image,
              preview: upload.preview,
            },
          } satisfies ImageCtxEnvelope

          this.state.images.set(existingImage.image.id, updatedImage)

          if (this.state.activeImage?.image.id === updatedImage.image.id) {
            this.state.activeImage = updatedImage
          }

          if (this.state.targetImage?.image.id === updatedImage.image.id) {
            this.state.targetImage = updatedImage
          }
        }
      }
    })

    this.updateActivePreview()

    if (!imageToReplace && newUploads.length > 0) {
      const latestUpload = newUploads[newUploads.length - 1]
      this.targetItem(latestUpload?.optimisticKey ?? null)
    }
  }

  removeFromUploadQueue(file: File) {
    this.setUploadQueue(this.state.uploadQueue.filter(item => item.file !== file))
  }

  addToRejected(files: File[]) {
    this.state.rejected.push(...files)
  }

  setUploadStatus(fileObject: ImageUpload, status: UploadStatus) {
    // A File can appear in multiple entries; only the queue identity owns this status.
    const upload = this.state.uploadQueue.find(
      item => item.optimisticKey === fileObject.optimisticKey,
    )
    if (upload) {
      upload.status = status
      this.updateActivePreview()
    }
  }

  setUploadToRetry(fileObject: ImageUpload) {
    this.setUploadQueue(
      this.state.uploadQueue.map(item =>
        item.optimisticKey === fileObject.optimisticKey
          ? {
              ...item,
              status: 'uploading',
              retries: item.retries + 1,
              errorMessage: null,
            }
          : item,
      ),
    )
  }

  private setUploadError(fileObject: ImageUpload, errorMessage: string): void {
    this.setUploadQueue(
      this.state.uploadQueue.map(item =>
        item.optimisticKey === fileObject.optimisticKey
          ? {
              ...item,
              status: 'error',
              errorMessage,
            }
          : item,
      ),
    )
  }

  private getUploadErrorMessage(error: unknown): string {
    const fallbackMessage = 'Upload failed'

    if (!(error instanceof Error) || !error.message) {
      return fallbackMessage
    }

    if (
      error.message.includes('SQLITE_BUSY') ||
      error.message.includes('database is locked')
    ) {
      return 'The image uploaded, but saving it hit a temporary database lock. Retry it.'
    }

    return error.message
  }

  private shouldApplyUploadResult(
    fileObject: ImageUpload,
    uploadCtx: ImageUploadCtx,
  ): boolean {
    const queuedUpload = this.state.uploadQueue.find(
      item => item.optimisticKey === fileObject.optimisticKey,
    )

    if (!queuedUpload) {
      return false
    }

    if (!uploadCtx.imageToReplace) {
      return true
    }

    const replacementImageId = uploadCtx.imageToReplace.image.id
    const latestReplacementUpload = [...this.state.uploadQueue]
      .filter(
        upload =>
          upload.imageToReplace?.image.id === replacementImageId &&
          upload.status !== 'invalidated',
      )
      .sort((a, b) => b.queuedAt - a.queuedAt)[0]

    return latestReplacementUpload?.optimisticKey === fileObject.optimisticKey
  }

  private applySuccessfulUploadResult(
    fileObject: ImageUpload,
    uploadCtx: ImageUploadCtx,
    savedImage: ImageCtxEnvelope,
  ): ImageCtxEnvelope {
    if (savedImage.revisionDraft) {
      // Saving a replacement or upload must not replace the accepted image in the gallery.
      this.setUploadQueue(
        this.state.uploadQueue.filter(
          item => item.optimisticKey !== fileObject.optimisticKey,
        ),
      )
      if (fileObject.preview) URL.revokeObjectURL(fileObject.preview)
      this.updateActivePreview()
      toast.success('Photo saved with the contribution for review.')
      return savedImage
    }
    const savedEnvelope = {
      ...savedImage,
      image: uploadCtx.imageToReplace
        ? savedImage.image
        : {
            ...savedImage.image,
            createdAt: new Date(fileObject.queuedAt).toISOString(),
          },
    }

    if (!this.shouldApplyUploadResult(fileObject, uploadCtx)) {
      return (
        (uploadCtx.imageToReplace
          ? this.getImage(uploadCtx.imageToReplace.image.id)
          : this.getImage(savedEnvelope.image.id)) ?? savedEnvelope
      )
    }

    // Preserve optimistic selection until the final asset has fully replaced the preview.
    if (uploadCtx.imageToReplace) {
      this.state.images.set(savedEnvelope.image.id, savedEnvelope)
      this.setUploadQueue(
        this.state.uploadQueue.map(item =>
          item.optimisticKey === fileObject.optimisticKey
            ? {
                ...item,
                status: 'uploaded',
                savedImage: savedEnvelope,
                errorMessage: null,
              }
            : item,
        ),
      )

      if (this.state.activeImage?.image.id === uploadCtx.imageToReplace.image.id) {
        this.state.lastChangeType = 'target'
        this.setActiveImage(savedEnvelope)
      }
    } else {
      this.state.images.set(savedEnvelope.image.id, savedEnvelope)
      this.setUploadQueue(
        this.state.uploadQueue.map(item =>
          item.optimisticKey === fileObject.optimisticKey
            ? {
                ...item,
                status: 'uploaded',
                savedImage: savedEnvelope,
                errorMessage: null,
              }
            : item,
        ),
      )

      const hasOtherPendingAdditiveUploads = this.state.uploadQueue.some(
        upload =>
          upload.optimisticKey !== fileObject.optimisticKey &&
          !upload.imageToReplace &&
          (upload.status === 'uploading' || upload.status === 'finalizing'),
      )

      const shouldPromoteFinalizedImage =
        !hasOtherPendingAdditiveUploads &&
        (this.state.activeItemId === fileObject.optimisticKey ||
          !this.state.activeImage)

      if (shouldPromoteFinalizedImage) {
        this.setActiveImage(savedEnvelope, false, fileObject.optimisticKey)
      }
    }

    this.setLoadStatus(savedImage.image.id, 'loading')
    return savedEnvelope
  }

  // ═══════════════════════
  // 3.3 STATE MANAGEMENT :: STAGING
  // ═══════════════════════

  /**
   * Converts staged files to temporary Image objects with preview URLs
   */
  private async createStagedImagesFromFiles(
    files: File[],
  ): Promise<ImageCtxEnvelope[]> {
    const ctxType = this.state.context?.ctxType ?? ('feature' as ImageContextResource)
    const ctxId = this.state.context?.ctxId ?? ''
    return await Promise.all(
      files.map(async (file, index) => {
        const tempId = `staged-${Date.now()}-${index}-${++this.uploadEntrySerial}`
        const preview = await createOptimisticPreviewUrl(file)

        return {
          ctxType,
          ctxId,
          intent: 'undefined',
          isPublished: false,
          publishedAt: null,
          image: {
            id: tempId,
            isArchived: false,
            localIsArchived: null,
            presentationMode: DEFAULT_UPLOAD_IMAGE_PRESENTATION,
            createdAt: new Date().toISOString(),
            contributorId: null,
            cdn: 'preview',
            env: 'local',
            cdnId: null,
            publicId: tempId,
            version: null,
            modifiedAt: new Date().toISOString(),
            preview,
            file,
          } as Image & { preview: string; file: File },
        }
      }),
    )
  }

  /**
   * Adds selected files as staged preview-only images before they are uploaded.
   *
   * @param acceptedFiles Files accepted by the picker.
   * @param fileRejections Files rejected by validation.
   * @returns Resolves after staged images and staging queue entries have been created.
   */
  async handleStagedFilesSelect(acceptedFiles: File[], fileRejections: File[]) {
    const contextAtStart = this.state.context
    const existingImages = this.getImages()
    const hasApiImages = existingImages.some(img => !this.isImageStaged(img))

    // Only reset if we're replacing API images with staged images
    if (hasApiImages) {
      this.resetImages()
      this.resetActiveImage()
    }

    // Convert files to staged Image objects
    const stagedImages = await this.createStagedImagesFromFiles(acceptedFiles)

    if (this.state.context !== contextAtStart) {
      for (const staged of stagedImages)
        if (staged.image.preview) URL.revokeObjectURL(staged.image.preview)
      return
    }

    // Add staged images to existing images (or set if we just reset)
    if (hasApiImages) {
      await this.setImages(stagedImages)
    } else {
      // Add to existing staged images
      const allImages = [...existingImages, ...stagedImages]
      await this.setImages(allImages)
    }

    if (this.state.context !== contextAtStart) return

    // Set the active image to the LATEST (last) staged image
    if (stagedImages.length > 0) {
      const latestImage = stagedImages[stagedImages.length - 1]
      this.setActiveImage(latestImage)
    }

    // Handle rejected files
    this.addToRejected(fileRejections)

    // Update staging queue for upload tracking
    await this.addToStagingQueue(acceptedFiles)
  }

  /**
   * Uploads all staged images and replaces them with real images
   */
  async uploadStagedImages(
    config: {
      onSuccess?: (savedImage: ImageCtxEnvelope) => void
      onError?: () => void
    } = {},
  ) {
    const contextAtStart = this.state.context
    const stagedImages = this.getImages().filter(img => img.image.cdn === 'preview')

    if (stagedImages.length === 0) {
      return
    }

    // Convert staged images to uploads
    const uploads = stagedImages.map(img => {
      const file = img.image.file
      return {
        file,
        status: 'uploading',
        retries: 0,
        queuedAt: new Date(img.image.createdAt).getTime(),
        optimisticKey: img.image.id,
        preview: img.image.preview,
      } as ImageUpload
    })

    // Clear staged images from main array
    this.resetImages()
    this.resetActiveImage()

    // Add to upload queue
    this.state.uploadQueue.push(...uploads)

    // Process uploads
    await this.processUploadQueue(config)

    // Clean up staging queue
    if (this.state.context === contextAtStart) this.state.stagingQueue = []
  }

  async addToStagingQueue(files: File[]): Promise<void> {
    const contextAtStart = this.state.context
    const queuedAtBase = Date.now()
    const newStaged = await Promise.all(
      files.map(async (file, index) => {
        const preview = await createOptimisticPreviewUrl(file)

        return {
          file,
          status: 'staged',
          retries: 0,
          queuedAt: queuedAtBase + index,
          optimisticKey: `staged-upload-${queuedAtBase}-${index}-${file.name}-${file.lastModified}-${++this.uploadEntrySerial}`,
          preview,
        } as ImageUpload
      }),
    )

    if (this.state.context !== contextAtStart) {
      for (const upload of newStaged)
        if (upload.preview) URL.revokeObjectURL(upload.preview)
      return
    }
    this.state.stagingQueue.push(...newStaged)

    this.updateActivePreview()
  }

  /**
   * Removes a staged image from the images array and cleans up its preview URL
   */
  unstageImage(imageId: Id) {
    const image = this.getImage(imageId)
    if (!image || !this.isImageStaged(image)) {
      return
    }

    // Prevent multiple simultaneous unstaging of the same image
    if (this.state.pendingConfirmation.has(imageId)) {
      return
    }

    // Mark as being processed to prevent race conditions
    this.addToPendingConfirmation(imageId)

    const imageIndex = this.getImages().findIndex(img => img.image.id === imageId)
    const indexSize = this.getImages().length

    // Clean up the preview URL immediately
    if (image.image.preview) {
      URL.revokeObjectURL(image.image.preview)
    }

    // Store file name for staging queue cleanup before removing from images
    const fileName = image.image.file?.name

    // Remove from both data structures immediately to keep them in sync
    this.removeImage(imageId)

    // Remove from staging queue by file name (only if it has a file)
    if (fileName) {
      this.state.stagingQueue = this.state.stagingQueue.filter(
        staged => staged.file.name !== fileName,
      )
    }

    // Handle navigation after data cleanup
    let isDelayRequired = false
    if (imageIndex !== -1 && imageIndex < indexSize - 1) {
      isDelayRequired = true
      this.next()
    } else if (indexSize > 1) {
      isDelayRequired = true
      this.prev()
    }

    // If this was the active image, set a new active image
    if (this.state.activeImage?.image.id === imageId) {
      this.setActiveImageToFirst()
    }

    // Update preview and remove from pending (with delay only for UI transitions)
    if (isDelayRequired) {
      setTimeout(() => {
        this.updateActivePreview()
        this.removeFromPendingConfirmation(imageId)
      }, 300)
    } else {
      this.updateActivePreview()
      this.removeFromPendingConfirmation(imageId)
    }
  }

  // ═══════════════════════
  // 3.4 STATE MANAGEMENT :: PENDING CONFIRMATION
  // ═══════════════════════

  addToPendingConfirmation(imageId: Id) {
    this.state.pendingConfirmation.add(imageId)
  }

  removeFromPendingConfirmation(imageId: Id) {
    this.state.pendingConfirmation.delete(imageId)
  }

  resetPendingConfirmation() {
    this.state.pendingConfirmation = new SvelteSet<Id>()
  }

  pendingConfirmationHas(imageId: Id) {
    return this.state.pendingConfirmation.has(imageId)
  }

  // ═══════════════════════
  // 3.5 STATE MANAGEMENT :: DELETION
  // ═══════════════════════

  resetDeletionQueue() {
    this.state.deletionQueue = new SvelteSet<Id>()
  }

  addToDeletionQueue(imageId: Id) {
    this.state.deletionQueue.add(imageId)
  }

  removeFromDeletionQueue(imageId: Id) {
    this.state.deletionQueue.delete(imageId)
  }

  deletionQueueHas(imageId: Id) {
    return this.state.deletionQueue.has(imageId)
  }

  // ═══════════════════════
  // 3.6 STATE MANAGEMENT :: IMAGES
  // ═══════════════════════

  getImage(imageId: Id): ImageCtxEnvelope | undefined {
    return this.state.images.get(imageId)
  }

  getImages(): ImageCtxEnvelope[] {
    return Array.from(this.state.images.values())
  }

  /**
   * Replaces the current image collection while preserving staged-image ordering.
   *
   * @param images Candidate images for the current context.
   * @returns Resolves after state and preload bookkeeping are updated.
   */
  async setImages(images: ImageCtxEnvelope[]) {
    const validImages = images.filter(isValidImageEnvelope)

    if (validImages.length === 0) {
      this.state.images.clear()
      this.resetActiveImage()
      this.resetTargetImage()
      return
    }

    const { map: newImages, sortedApiImages } = this.createSortedImageState(validImages)
    this.state.images = newImages

    if (this.state.activeImage?.image.id) {
      const refreshedActiveImage = newImages.get(this.state.activeImage.image.id)
      if (refreshedActiveImage) {
        this.state.activeImage = refreshedActiveImage
        this.state.activeItemId = this.getSelectionIdForImage(
          refreshedActiveImage,
          this.state.activeItemId,
        )
      } else {
        this.state.activeImage = null
      }
    }

    // Only preload non-preview images
    if (sortedApiImages.length > 0) {
      await this.preloadImages()
    }
  }

  resetImages() {
    // Clean up preview URLs before clearing
    this.cleanupStagedImages()
    this.resetUploadQueue()
    this.resetActiveImage()
    this.resetTargetImage()
    this.resetActivePreview()
    this.state.loadStatus.clear()
    this.state.thumbnailLoadStatus.clear()
    this.state.errorMessages.clear()
    this.state.images.clear()
  }

  removeImage(imageId: Id) {
    this.state.images.delete(imageId)

    if (this.state.activeImage?.image.id === imageId) {
      this.resetActiveImage()
    } else if (this.state.activeItemId === imageId) {
      this.state.activeItemId = null
    }

    if (this.state.targetImage?.image.id === imageId) {
      this.resetTargetImage()
    } else if (this.state.targetImageId === imageId) {
      this.resetTargetImageId()
    }
  }

  setForImage(imageId: Id, key: string, value: unknown) {
    const image = this.getImage(imageId)
    if (!image) return

    const updatedImage: ImageCtxEnvelope =
      key === 'intent' || key === 'isPublished' || key === 'publishedAt'
        ? ({ ...image, [key]: value } as ImageCtxEnvelope)
        : ({ ...image, image: { ...image.image, [key]: value } } as ImageCtxEnvelope)
    this.state.images.set(imageId, updatedImage)

    // Also update activeImage if it's the same image
    if (this.state.activeImage?.image.id === imageId) {
      this.state.activeImage = updatedImage
      this.state.activeItemId = this.getSelectionIdForImage(
        updatedImage,
        this.state.activeItemId,
      )
    }
  }

  /**
   * Saves image metadata with shared optimistic projections and isolated rollback.
   * @param imageId Image whose metadata changes.
   * @param data Metadata fields accepted by the update command.
   * @returns Resolves after persistence and affected collection reconciliation.
   * @remarks Captures the initiating context so navigation cannot update another viewer.
   */
  async updateMetadata(
    imageId: Id,
    data: Parameters<typeof updateImageRemote>[0]['data'],
  ): Promise<'draft' | 'saved'> {
    const ctx = this.getCtx()
    const contextAtStart = this.state.context
    const displayedRevisionId = this.getImage(imageId)?.image.imageRevisionId
    // An enrolled gallery keeps showing its accepted pin until the metadata draft is published.
    if (displayedRevisionId) {
      const response = await updateImageRemote({
        id: imageId,
        imageRevisionId: displayedRevisionId,
        ctxType: ctx.ctxType,
        ctxId: ctx.ctxId,
        data,
        meta: { isAdminRequest: true },
      })
      if ('revisionDraft' in response) {
        toast.success('Image changes saved for review.')
        return 'draft'
      }
      // Immediate logo saves advance the displayed pin; the next replacement must use that revision.
      if (this.state.context === contextAtStart && response.data) {
        const saved = response.data as ImageCtxEnvelope
        this.state.images.set(imageId, saved)
        if (this.state.activeImage?.image.id === imageId) this.state.activeImage = saved
      }
      await this.reconcileImageMutation(contextAtStart)
      if (this.state.context === contextAtStart) await this.refreshImages()
      return 'saved'
    }
    const mutation = this.appCtx.resources.beginMutation(
      'image',
      { meta: { id: imageId }, data },
      [['image', this.state.images as Map<string, unknown>]],
    )
    const syncActive = (): void => {
      if (
        this.state.context === contextAtStart &&
        this.state.activeImage?.image.id === imageId
      )
        this.state.activeImage = this.getImage(imageId) ?? null
    }
    syncActive()
    try {
      await updateImageRemote({
        id: imageId,
        ctxType: ctx.ctxType,
        ctxId: ctx.ctxId,
        data,
        meta: { isAdminRequest: true },
      }).updates(
        ...mutation.updates,
        getImagesForContext({
          ctxType: ctx.ctxType,
          ctxId: ctx.ctxId,
          meta: this.isAdminMode ? { isAdminRequest: true } : undefined,
        }).withOverride(current => ({
          ...current,
          data: projectResourcePatch(
            current.data,
            'image',
            { meta: { id: imageId }, data },
            'image',
          ),
        })),
      )
      mutation.settle(true)
    } catch (error) {
      mutation.settle(false)
      throw error
    } finally {
      syncActive()
    }
    await this.appCtx.resources.reconcile('image')
    return 'saved'
  }

  // ═══════════════════════
  // 3.7 STATE MANAGEMENT :: LOAD STATUS
  // ═══════════════════════

  getLoadStatus(imageId: Id): LoadStatus | undefined {
    return this.state.loadStatus.get(imageId)
  }

  setLoadStatus(imageId: Id, status: LoadStatus) {
    // Guard against redundant updates
    if (this.state.loadStatus.get(imageId) === status) {
      return
    }

    this.state.loadStatus.set(imageId, status)

    if (status === 'loaded') {
      this.maybeCleanupSettledUpload(imageId)
    }
  }

  getLoadStatuses() {
    return this.state.loadStatus
  }

  resetLoadStatus(imageId?: Id) {
    if (imageId) {
      this.state.loadStatus.delete(imageId)
    } else {
      this.state.loadStatus.clear()
    }
  }

  // ═══════════════════════
  // 3.8 STATE MANAGEMENT :: UPLOAD STATUS
  // ═══════════════════════

  setUploadStatusById(imageId: Id, status: UploadStatus) {
    this.state.uploadStatus.set(imageId, status)
  }

  getUploadStatus(imageId: Id): UploadStatus | undefined {
    return this.state.uploadStatus.get(imageId)
  }

  resetUploadStatus(imageId?: Id) {
    if (imageId) {
      this.state.uploadStatus.delete(imageId)
    } else {
      this.state.uploadStatus.clear()
    }
  }

  // ═══════════════════════
  // 3.9 STATE MANAGEMENT :: THUMBNAIL LOAD STATUS
  // ═══════════════════════

  setThumbnailLoadStatus(imageId: Id, status: LoadStatus) {
    this.state.thumbnailLoadStatus.set(imageId, status)

    if (status === 'loaded') {
      this.maybeCleanupSettledUpload(imageId)
    }
  }

  getThumbnailLoadStatus(imageId: Id): LoadStatus | undefined {
    return this.state.thumbnailLoadStatus.get(imageId)
  }
  // TODO Ensure that this is called as part of the refreshImages and setContext
  resetThumbnailLoadStatus(imageId?: Id) {
    if (imageId) {
      this.state.thumbnailLoadStatus.delete(imageId)
    } else {
      this.state.thumbnailLoadStatus.clear()
    }
  }

  // ═══════════════════════
  // 3.10 STATE MANAGEMENT :: ERROR MESSAGES
  // ═══════════════════════

  setErrorMessage(imageId: Id, message: string) {
    this.state.errorMessages.set(imageId, {
      message,
      timestamp: Date.now(),
    })

    // Auto-clear after 5 seconds
    setTimeout(() => {
      this.clearErrorMessage(imageId)
    }, 5000)
  }

  getErrorMessage(imageId: Id): { message: string; timestamp: number } | undefined {
    return this.state.errorMessages.get(imageId)
  }

  clearErrorMessage(imageId: Id) {
    this.state.errorMessages.delete(imageId)
  }

  hasErrorMessage(imageId: Id): boolean {
    return this.state.errorMessages.has(imageId)
  }

  // ═══════════════════════
  // 3.11 STATE MANAGEMENT :: ACTIVE IMAGE
  // ═══════════════════════

  get activeImage(): ImageCtxEnvelope | null {
    return this.state.activeImage
  }

  private hasResolvedActiveImage(): boolean {
    const activeImageId = this.state.activeImage?.image.id
    return activeImageId ? this.state.images.has(activeImageId) : false
  }

  get activeItemId(): string | null {
    return this.getActiveItemId()
  }

  private getUploadByOptimisticKey(itemId: string): ImageUpload | undefined {
    return this.state.uploadQueue.find(
      upload => upload.optimisticKey === itemId && upload.status !== 'invalidated',
    )
  }

  private getUploadBySavedImageId(imageId: Id): ImageUpload | undefined {
    return this.state.uploadQueue.find(
      upload =>
        !upload.imageToReplace &&
        upload.savedImage?.image.id === imageId &&
        upload.status !== 'invalidated',
    )
  }

  private getDisplayItemIdForImageId(imageId: Id | null | undefined): string | null {
    if (!imageId) return null

    const upload = this.getUploadBySavedImageId(imageId)
    if (upload) {
      return upload.optimisticKey
    }

    if (this.state.images.has(imageId)) {
      return imageId
    }

    return null
  }

  private getSelectionIdForImage(
    image: ImageCtxEnvelope | null,
    selectionId?: string | null,
  ): string | null {
    if (selectionId !== undefined) {
      return selectionId
    }

    return this.getDisplayItemIdForImageId(image?.image.id) ?? image?.image.id ?? null
  }

  getActiveItemId(): string | null {
    const activeItemId = this.state.activeItemId

    if (activeItemId) {
      const upload = this.getUploadByOptimisticKey(activeItemId)
      if (upload) {
        return upload.optimisticKey
      }

      const uploadDisplayId = this.getDisplayItemIdForImageId(activeItemId)
      if (uploadDisplayId) {
        return uploadDisplayId
      }

      if (this.state.images.has(activeItemId)) {
        return activeItemId
      }
    }

    return this.getDisplayItemIdForImageId(this.state.activeImage?.image.id) ?? null
  }

  setActiveImage(
    image: ImageCtxEnvelope | null,
    isLoading: boolean = false,
    selectionId?: string | null,
  ) {
    const nextSelectionId = this.getSelectionIdForImage(image, selectionId)

    // Prevent redundant calls - if we're trying to set the same image that's already active
    if (
      image &&
      this.state.activeImage &&
      image.image.id === this.state.activeImage.image.id &&
      nextSelectionId === this.state.activeItemId
    ) {
      return
    }

    // Also prevent setting to the same null state
    if (!image && !this.state.activeImage) {
      return
    }

    // Set Active Image
    this.state.activeImage = image
    this.state.activeItemId = nextSelectionId

    if (image && isLoading) {
      this.setLoadStatus(image.image.id, 'loading')
    }

    // If lastChangeType is null, it means this is likely a context change
    if (this.state.lastChangeType === null) {
      this.state.lastChangeType = 'context'
    }
  }

  resetActiveImage(clearSelection: boolean = true) {
    this.state.activeImage = null
    if (clearSelection) {
      this.state.activeItemId = null
    }
  }

  get targetImage(): ImageCtxEnvelope | null {
    return this.state.targetImage
  }

  get targetImageId(): Id | null {
    return this.state.targetImageId
  }

  // Smooth transition methods
  setTargetImage(image: ImageCtxEnvelope | null) {
    this.state.targetImage = image
  }

  setTargetImageId(imageId: Id | null) {
    this.state.targetImageId = imageId
  }

  resetTargetImage() {
    this.state.targetImage = null
    this.resetTargetImageId()
  }

  resetTargetImageId() {
    this.state.targetImageId = null
  }

  // Preload an image without switching to it
  async preloadImageForTransition(targetImage: ImageCtxEnvelope): Promise<boolean> {
    // If the image is already loaded, return immediately
    if (this.getLoadStatus(targetImage.image.id) === 'loaded') {
      return true
    }

    // Set loading status
    this.setLoadStatus(targetImage.image.id, 'loading')

    try {
      // Actually preload the image using the browser's Image API
      const imageUrl = getURLfromImage({ image: targetImage })
      await this.preloadImage(imageUrl)

      // Mark as loaded
      this.setLoadStatus(targetImage.image.id, 'loaded')
      this.state.preloadedImages.add(imageUrl)

      return true
    } catch (_error) {
      this.setLoadStatus(targetImage.image.id, 'error')
      return false
    }
  }

  // Smoothly switch to a new image (preload then switch)
  async switchToImageSmooth(
    targetImage: ImageCtxEnvelope,
    selectionId?: string | null,
  ) {
    // If we're already transitioning to this image, do nothing
    if (this.state.targetImage?.image.id === targetImage.image.id) {
      return
    }

    // Set transition state to prevent loading overlay
    this.state.isTransitioning = true
    this.setTargetImage(targetImage)

    // Preload the image first
    await this.preloadImageForTransition(targetImage)

    // Now switch to the image
    this.setActiveImage(targetImage, false, selectionId)
    this.resetTargetImage()
    this.state.isTransitioning = false
  }

  targetItem(itemId: string | null): ImageCtxEnvelope | undefined {
    if (!itemId) {
      this.resetTargetImage()
      this.resetActiveImage()
      return undefined
    }

    const upload = this.getUploadByOptimisticKey(itemId)
    if (upload) {
      this.state.activeItemId = upload.optimisticKey

      const savedImageId = upload.savedImage?.image.id ?? null
      const savedEnvelope = savedImageId
        ? (this.getImage(savedImageId) ?? upload.savedImage ?? null)
        : null

      if (savedEnvelope) {
        if (!this.state.activeImage) {
          this.state.lastChangeType = 'initial'
          this.setActiveImage(savedEnvelope, false, upload.optimisticKey)
        } else if (this.state.activeImage.image.id !== savedEnvelope.image.id) {
          this.state.lastChangeType = 'target'
          void this.switchToImageSmooth(savedEnvelope, upload.optimisticKey)
        } else {
          this.setActiveImage(savedEnvelope, false, upload.optimisticKey)
        }

        return savedEnvelope
      }

      this.resetTargetImage()
      this.resetActiveImage(false)
      return upload.imageToReplace
    }

    return this.target(itemId)
  }

  setActiveImageToFirst() {
    const images = this.getImages()
    if (images.length > 0) {
      const firstImage = images[0] as ImageCtxEnvelope
      // Only set if it's different from the current active image
      if (
        !this.state.activeImage ||
        this.state.activeImage.image.id !== firstImage.image.id
      ) {
        this.setActiveImage(firstImage, true)
      }
    } else {
      this.resetActiveImage()
    }
  }

  setActiveImageToTargetOrFirst() {
    if (this.state.targetImageId) {
      const targetImage = this.getImage(this.state.targetImageId)
      if (targetImage) {
        this.setActiveImage(targetImage, true)
        this.resetTargetImageId()
      }
    } else {
      if (this.state.activeImage) {
        return
      }
      this.setActiveImageToFirst()
    }
  }

  setForActiveImage(key: string, value: unknown) {
    if (!this.state.activeImage) return
    this.setForImage(this.state.activeImage.image.id, key, value)
  }

  toggleForActiveImage(key: string) {
    if (!this.state.activeImage) return
    const currentImage = this.state.activeImage as Record<string, unknown>
    this.setForImage(this.state.activeImage.image.id, key, !currentImage[key])
  }

  getReplacementUpload(imageId: Id): ImageUpload | undefined {
    return [...this.state.uploadQueue]
      .filter(
        upload =>
          upload.imageToReplace?.image.id === imageId &&
          upload.status !== 'invalidated',
      )
      .sort((a, b) => b.queuedAt - a.queuedAt)[0]
  }

  isImageHighlighted(imageId: Id): boolean {
    return this.state.highlightedIds.includes(imageId)
  }

  getImageIsPublished(imageId: Id): boolean {
    return this.getImage(imageId)?.isPublished ?? false
  }

  isImageBeingReplaced(imageId: Id, status?: UploadStatus): boolean {
    return this.state.uploadQueue.some(
      upload =>
        upload.imageToReplace?.image.id === imageId &&
        upload.status !== 'invalidated' &&
        upload.status !== 'uploaded' &&
        (status ? upload.status === status : true),
    )
  }

  // ═══════════════════════
  // 3.12 STATE MANAGEMENT :: ACTIVE PREVIEW
  // ═══════════════════════

  get activePreview(): ImageUpload | null {
    return this.state.activePreview
  }

  setActivePreview(upload: ImageUpload | null) {
    this.state.activePreview = upload
  }

  resetActivePreview() {
    this.state.activePreview = null
  }

  private maybeCleanupSettledUpload(imageId: Id): void {
    if (this.state.loadStatus.get(imageId) !== 'loaded') {
      return
    }

    if (this.state.thumbnailLoadStatus.get(imageId) !== 'loaded') {
      return
    }

    const hasSettledUpload = this.state.uploadQueue.some(
      upload =>
        (upload.imageToReplace?.image.id === imageId &&
          (upload.status === 'uploaded' || upload.status === 'finalizing')) ||
        (!upload.imageToReplace &&
          upload.savedImage?.image.id === imageId &&
          (upload.status === 'uploaded' || upload.status === 'finalizing')),
    )

    if (!hasSettledUpload) {
      return
    }

    // Let the thumbnail finish its preview->final source transition before removing the queue row.
    const delay = 420

    setTimeout(() => {
      const selectedUpload = this.state.activeItemId
        ? this.getUploadByOptimisticKey(this.state.activeItemId)
        : undefined

      this.state.uploadQueue = this.state.uploadQueue
        .map(upload => {
          if (
            upload.imageToReplace?.image.id === imageId &&
            (upload.status === 'uploaded' || upload.status === 'finalizing')
          ) {
            URL.revokeObjectURL(upload.preview ?? '')
            return { ...upload, status: 'invalidated' as UploadStatus }
          }
          if (
            !upload.imageToReplace &&
            upload.savedImage?.image.id === imageId &&
            (upload.status === 'uploaded' || upload.status === 'finalizing')
          ) {
            URL.revokeObjectURL(upload.preview ?? '')
            return { ...upload, status: 'invalidated' as UploadStatus }
          }
          return upload
        })
        .filter(upload => upload.status !== 'invalidated')

      if (selectedUpload?.savedImage) {
        const savedImageId = selectedUpload.savedImage.image.id
        const nextSelectionId =
          this.getDisplayItemIdForImageId(savedImageId) ?? savedImageId
        const savedImage = this.getImage(savedImageId) ?? selectedUpload.savedImage

        this.setActiveImage(savedImage, false, nextSelectionId)
      }

      this.updateActivePreview()

      if (this.state.lastChangeType !== 'context') {
        this.state.lastChangeType = null
      }
    }, delay)
  }

  private updateActivePreview() {
    const activeUpload =
      this.state.uploadQueue
        .filter(upload => upload.status !== 'invalidated')
        .sort((a, b) => b.queuedAt - a.queuedAt)[0] ?? null
    this.setActivePreview(activeUpload)
  }

  // ═══════════════════════
  // 3.13 STATE MANAGEMENT :: MODE
  // ═══════════════════════

  setMode(mode: 'fullscreen' | 'normal') {
    if (mode === 'fullscreen') {
      this.state.isFullscreen = true
    } else {
      this.state.isFullscreen = false
    }
  }

  getMode(): 'fullscreen' | 'normal' {
    return this.state.isFullscreen ? 'fullscreen' : 'normal'
  }

  isFullscreen: boolean = $derived(this.state.isFullscreen)

  // ═══════════════════════
  // 4. Data Fetching & Refreshing
  // ═══════════════════════

  private async fetchImagesFromCache(
    ctxType: ImageContextResource | ImageContextResourceExtended,
    ctxId: Id,
    includeSingleImage = true,
  ): Promise<ImageCtxEnvelope[]> {
    if (this.isAdminMode && ctxType === 'feature') {
      return this.fetchImagesFromAPI(ctxType, ctxId, includeSingleImage)
    }

    // Try to get images from ResourceViewCtx cache first
    if (ctxType === 'feature') {
      const feature = this.appCtx.cache.feature.get(ctxId) as Feature | undefined

      if (feature) {
        // If we have feature.images array, use it
        if (feature.images && feature.images.length > 0) {
          return feature.images as ImageCtxEnvelope[]
        }

        // If feature.images is undefined/null, this is likely a FeatureFromCollection
        // Fall back to API to get the full images array
        if (feature.images === undefined || feature.images === null) {
          return this.fetchImagesFromAPI(ctxType, ctxId, includeSingleImage)
        }

        // If we have feature.image but empty images array, use the single image
        if (feature.image && includeSingleImage) {
          return [feature.image as ImageCtxEnvelope]
        }
      }
    }

    // For projects, organisations, layers, etc., we could extend this logic
    // For now, if we don't have a cache hit, fall back to API
    return this.fetchImagesFromAPI(ctxType, ctxId, includeSingleImage)
  }

  private async fetchImagesFromAPI(
    ctxType: ImageContextResource | ImageContextResourceExtended,
    ctxId: Id,
    _includeSingleImage = true,
  ): Promise<ImageCtxEnvelope[]> {
    // A mutation refresh must bypass the native query cache, including task images.
    const result = await refreshRemoteQuery(
      getImagesForContext({
        ctxType,
        ctxId,
        meta: this.isAdminMode ? { isAdminRequest: true } : undefined,
      }),
    )

    return (result?.data ?? []).map(item => ({
      ...item,
      image: item.image as Image,
    })) as ImageCtxEnvelope[]
  }

  /**
   * Refreshes images for the current context and merges any configured secondary resource.
   *
   * @param targetImageId Optional image to re-target after refresh completes.
   * @returns Resolves after refreshed images have been applied to state.
   */
  async refreshImages(targetImageId?: Id) {
    if (!this.state.context) {
      return
    }

    // Capture this request's position so older reads cannot overwrite newer results.
    const refreshSerial = ++this.imageRefreshSerial
    // Set fetching state to show loading immediately
    this.state.isFetchingImages = true

    try {
      // Get the primary gallery when present; proposal-only tasks have secondary evidence only.
      const [images, extendedImages] = await Promise.all([
        this.state.context.ctxType && this.state.context.ctxId
          ? this.imagesQueryFn()
          : [],
        this.state.context.ctxTypeSecondary ? this.extendedImagesQueryFn() : [],
      ])

      // Validate context hasn't changed during async operation
      if (this.imageRefreshSerial !== refreshSerial) {
        return
      }

      // Filter out null/undefined images before processing
      const validImages = images.filter(isValidImageEnvelope)
      const imageIds = validImages.map((image: ImageCtxEnvelope) => image.image.id)

      // Merge the secondary resource after both reads pass the context validation above.
      if (this.state.context.ctxTypeSecondary) {
        // Filter out null/undefined extended images too
        const validExtendedImages = extendedImages.filter(isValidImageEnvelope)

        // Merge only secondary-only images so the primary resource remains the canonical ordering source.
        // Typically there will be an overlap of images between the primary and secondary resources, so we only add the images that are not already in the primary resource,
        // A scenario where this is not true is when the secondary resource is a task and the images have been rejected (i.e. deleted from the primary resource). We would still want to show the rejected images in the task viewer. To give context for the decision.
        validExtendedImages.forEach((image: ImageCtxEnvelope) => {
          if (!imageIds.includes(image.image.id)) {
            validImages.push(image)
          }
        })

        if (
          this.state.context.ctxTypeSecondary === 'task' &&
          this.state.highlightedIds.length > 0
        ) {
          const secondaryTaskId = this.state.context.ctxIdSecondary
          const secondaryTask = secondaryTaskId
            ? await this.appCtx.getTaskById(secondaryTaskId)
            : undefined

          // Only new-feature review flows should collapse to task-highlighted images.
          if (secondaryTask?.type === 'newFeature') {
            const highlightedIds = new Set(this.state.highlightedIds)
            const taskScopedImages = validImages.filter(image =>
              highlightedIds.has(image.image.id),
            )

            validImages.length = 0
            validImages.push(...taskScopedImages)
          }
        }
      }

      // Final context validation before applying results
      if (this.imageRefreshSerial !== refreshSerial) {
        return
      }

      await this.setImages(validImages)
      if (this.imageRefreshSerial !== refreshSerial) return

      // Set active image with loading state immediately to maintain loading display
      if (validImages.length > 0 && !this.hasResolvedActiveImage() && !targetImageId) {
        this.setActiveImageToTargetOrFirst()
      } else if (targetImageId) {
        this.target(targetImageId)
      }

      // Don't set loading status here - let Picture.svelte handle it via onLoad callbacks
      // This prevents premature transitions before images are actually ready

      // Set appropriate loading status based on mode
      validImages.forEach((image: ImageCtxEnvelope) => {
        const currentThumbnailStatus = this.getThumbnailLoadStatus(image.image.id)
        if (currentThumbnailStatus !== 'loaded') {
          this.setThumbnailLoadStatus(image.image.id, 'loading')
        }
      })
    } finally {
      // Only the owning request may clear loading, including after a failed read.
      if (this.imageRefreshSerial === refreshSerial) {
        this.state.isFetchingImages = false
      }
    }
  }

  /**
   * Loads images for the primary context.
   *
   * @returns The current context's image envelopes.
   */
  async imagesQueryFn() {
    if (!this.state.context?.ctxType || !this.state.context?.ctxId) {
      throw new Error('No context type or ID provided')
    }

    const context = this.state.context
    const scope = this.appCtx.resources.scopeKey
    // Catalogue reads never delay image data; the session cache is shared by project.
    void loadImageIntentOptions(
      this.appCtx,
      {
        ctxType: context.ctxType!,
        ctxId: context.ctxId!,
      },
      context.project?.id,
    )
      .then(policy => {
        if (this.state.context !== context || this.appCtx.resources.scopeKey !== scope)
          return
        this.intentOptions = policy.intents
        this.autoPublishUnclassified = policy.autoPublishUnclassified
      })
      .catch(cause => console.warn('Could not load image intent options', cause))
    const result = await this.fetchImagesFromCache(
      this.state.context.ctxType,
      this.state.context.ctxId,
      true,
    )

    return result
  }

  /**
   * Loads images for the secondary context, when configured.
   *
   * @returns The secondary context's image envelopes.
   */
  async extendedImagesQueryFn() {
    if (!this.state.context?.ctxTypeSecondary || !this.state.context?.ctxIdSecondary) {
      throw new Error('No secondary context type or ID provided')
    }

    return this.fetchImagesFromCache(
      this.state.context.ctxTypeSecondary,
      this.state.context.ctxIdSecondary,
      false,
    )
  }

  async fetchSingleImage() {
    if (!this.state.context) return

    try {
      // First try to get images array
      const images = await this.imagesQueryFn()
      if (images && images.length > 0) {
        // Filter out null/undefined images
        const validImages = images.filter(isValidImageEnvelope)

        if (validImages.length > 0) {
          await this.setImages(validImages)
          this.setActiveImage(validImages[0])
          // Don't set loading status - let Picture.svelte handle it via onLoad
          return
        }
      }

      // If no images in array, try to get single image from .image property
      // This would require a separate API call or different service method
      // For now, just set empty state
      await this.setImages([])
      this.resetActiveImage()
    } catch {
      await this.setImages([])
      this.resetActiveImage()
    }
  }

  // ═══════════════════════
  // 5. UI Navigation
  // ═══════════════════════
  switchToImage(e: MouseEvent, direction: 'prev' | 'next') {
    e.preventDefault()
    if (direction === 'next') {
      this.next()
    } else {
      this.prev()
    }
  }

  // ═══════════════════════
  // 5.1 UI Navigation :: Index-based navigation
  // ═══════════════════════

  next() {
    const images = this.getImages()
    // Return early if there is no images
    if (images.length === 0) return
    // Return early if there is no active image
    const currentActiveImage = this.state.activeImage
    if (!currentActiveImage) return

    const currentIndex = images.findIndex(
      img => img.image.id === currentActiveImage.image.id,
    )

    // If the current active image is not in the images array, fall-back to the first image
    if (currentIndex === -1) {
      const firstImage = images[0]
      if (firstImage) {
        // Only add to URL if not a staged image
        if (!this.isImageStaged(firstImage)) {
          addParamToUrl('imageId', firstImage.image.id, {}, true)
        } else {
          // Only set active image for stages images as they don't have valid Ids
          this.setActiveImage(firstImage)
        }
        this.state.lastChangeType = 'index'
      }
    }

    const newIndex = (currentIndex + 1) % images.length
    const newImage = images[newIndex]

    if (newImage) {
      // Signal this was an index-based change for PhotoFrame transition logic
      this.state.lastChangeType = 'index'
      // Only add to URL if not a staged image
      if (!this.isImageStaged(newImage)) {
        addParamToUrl('imageId', newImage.image.id, {}, true)
      } else {
        // Only set active image for stages images as they don't have valid Ids
        this.setActiveImage(newImage)
      }
    }
  }

  prev() {
    const images = this.getImages()
    // Return early if there is no images
    if (images.length === 0) return
    // Return early if there is no active image
    const currentActiveImage = this.state.activeImage
    if (!currentActiveImage) return

    const currentIndex = images.findIndex(
      img => img.image.id === currentActiveImage.image.id,
    )

    // If the current active image is not in the images array, fall-back to the first image
    if (currentIndex === -1) {
      const firstImage = images[0]
      if (firstImage) {
        // Only add to URL if not a staged image
        if (!this.isImageStaged(firstImage)) {
          addParamToUrl('imageId', firstImage.image.id, {}, true)
        } else {
          // Only set active image for stages images as they don't have valid Ids
          this.setActiveImage(firstImage)
        }
        this.state.lastChangeType = 'index'
      }
    }

    const newIndex = (currentIndex - 1 + images.length) % images.length
    const newImage = images[newIndex]

    if (newImage) {
      // Signal this was an index-based change for PhotoFrame transition logic
      this.state.lastChangeType = 'index'
      // Only add to URL if not a staged image
      if (!this.isImageStaged(newImage)) {
        addParamToUrl('imageId', newImage.image.id, {}, true)
      } else {
        // Only set active image for stages images as they don't have valid Ids
        this.setActiveImage(newImage)
      }
    }
  }

  target(imageId: Id) {
    // Prevent redundant calls
    if (this.state.activeImage && this.state.activeImage.image.id === imageId) {
      return this.state.activeImage
    }

    const image = this.getImage(imageId)

    // No need to transition if there isn't an active image
    if (!this.state.activeImage && image) {
      this.state.lastChangeType = 'initial'
      this.setActiveImage(image)
    } else if (image) {
      this.state.lastChangeType = 'target'
      void this.switchToImageSmooth(image)
    } else {
      this.state.activeItemId = imageId
      this.setTargetImageId(imageId)
    }
  }

  // ═══════════════════════
  // 6. Upload Handling
  // ═══════════════════════
  /**
   * Queues accepted files for upload and processes them against the current context.
   *
   * @param acceptedFiles Files accepted by the picker.
   * @param fileRejections Files rejected by validation.
   * @param config Optional upload callbacks.
   * @param imageToReplace Optional existing image being replaced.
   * @returns Resolves after queued uploads have been processed.
   */
  async handleFilesSelect(
    acceptedFiles: File[],
    fileRejections: File[],
    config: {
      onSuccess?: (savedImage: ImageCtxEnvelope) => void
      onError?: () => void
    } = {},
    imageToReplace?: ImageCtxEnvelope,
  ) {
    if (acceptedFiles.length > 1 && imageToReplace) {
      throw new Error('Cannot replace multiple images')
    }

    const contextAtStart = this.state.context
    const initialActiveImageId = this.state.activeImage?.image.id ?? null

    // Add to upload queue
    await this.addToUploadQueue(acceptedFiles, imageToReplace)
    if (this.state.context !== contextAtStart) return
    this.addToRejected(fileRejections)

    if (imageToReplace) {
      this.resetLoadStatus(imageToReplace.image.id)
      this.resetThumbnailLoadStatus(imageToReplace.image.id)
    }

    await this.processUploadQueue(config)
    // Completion may belong to a viewer that has since navigated elsewhere.
    if (this.state.context === contextAtStart) {
      this.sortImagesInternal() // Calls the private sortImages method
      // Only auto-select a fresh image when there wasn't already an active image.
      if (!imageToReplace && !initialActiveImageId) this.setActiveImageToTargetOrFirst()
    }
    // Invalidate the resource with the new image, not the newly selected viewer.
    if (contextAtStart?.ctxType && contextAtStart.ctxId) {
      await this.invalidateResource(contextAtStart.ctxType, contextAtStart.ctxId)
    }
  }

  /**
   * Targeted invalidation for image uploads - only invalidates and refreshes the specific resource
   * without triggering cascading refreshes. Updates the cache for that resource.
   * @param ctxType - The resource type
   * @param ctxId - The resource ID
   */
  invalidateResource = async (
    ctxType: ImageContextResource,
    ctxId: Id,
  ): Promise<void> => {
    // Map image context resource types to FirstClassResource
    const resourceMap: Partial<Record<ImageContextResource, FirstClassResource>> = {
      hub: FirstClassResource.hub,
      organisation: FirstClassResource.organisation,
      project: FirstClassResource.project,
      feature: FirstClassResource.feature,
    }

    const resource = resourceMap[ctxType]
    if (!resource) {
      return
    }

    // Use the new targeted invalidation method
    await this.appCtx.invalidateResourceTargeted(
      ctxType as unknown as FirstClassResource,
      ctxId,
    )
  }

  /**
   * Clears the cached single-image resource envelope before the remote delete
   * completes so route preload state cannot flash a soon-to-be-deleted image.
   *
   * @param imageId Persisted image id being deleted.
   * @returns Rollback callback when a matching cache entry was updated.
   */
  private optimisticallyClearSingleResourceImageCache(
    imageId: Id,
  ): (() => void) | null {
    const context = this.state.context
    const resourceId = context?.ctxId

    if (!context?.ctxType || !resourceId) {
      return null
    }

    const updateCacheEntry = <TResource extends SingleImageResourceCacheEntry>(
      cache: Map<Id, TResource>,
    ): (() => void) | null => {
      const cachedResource = cache.get(resourceId)

      if (!cachedResource?.image || cachedResource.image.image.id !== imageId) {
        return null
      }

      const optimisticResource = { ...cachedResource, image: null }
      cache.set(resourceId, optimisticResource)

      return () => {
        // A newer portrait, resource edit or identity clear supersedes this rollback.
        if (cache.get(resourceId) === optimisticResource)
          cache.set(resourceId, cachedResource)
      }
    }

    if (context.ctxType === 'organisation') {
      return updateCacheEntry(this.appCtx.cache.organisation)
    }

    if (context.ctxType === 'project') {
      return updateCacheEntry(this.appCtx.cache.project)
    }

    if (context.ctxType === 'hub') {
      return updateCacheEntry(this.appCtx.cache.hub)
    }

    return null
  }

  /**
   * Reconciles shared resource queries after an image mutation without native updates.
   * @param context Resource context captured before the mutation.
   * @returns Completion of active-query refreshes; inactive snapshots are invalidated.
   * @remarks Clearing entity images alone leaves native Feature pages and map rows stale.
   */
  private async reconcileImageMutation(
    context: Partial<Pick<ImageUploadCtx, 'ctxType' | 'ctxId'>> | null = this.state
      .context,
  ): Promise<void> {
    if (!context?.ctxType || !context.ctxId) return
    if (context.ctxType === 'feature' && context.ctxId) {
      const feature = this.appCtx.cache.feature.get(context.ctxId) as
        | Feature
        | undefined
      if (feature)
        this.appCtx.cache.feature.set(context.ctxId, { ...feature, images: undefined })
    }
    // Resource portraits also appear in hierarchy pages; Feature queries contain canonical assets.
    await this.appCtx.resources.reconcile(
      context.ctxType === 'project' || context.ctxType === 'organisation'
        ? context.ctxType
        : 'feature',
    )
  }

  /**
   * Identifies the account scope, destination and submitted options of a prepared upload.
   * @param context Captured upload destination and replacement identity.
   * @param extended Explicit Feature metadata, if supplied.
   * @returns Stable retry identity within this viewer lifetime.
   */
  private uploadConfirmationIdentity(
    context: ImageUploadCtx,
    extended?: { isPublished: boolean; intent: Intent },
  ): string {
    return JSON.stringify([
      this.appCtx.resources.scopeKey,
      context.ctxType,
      context.ctxId,
      context.hub?.id,
      context.organisation?.id,
      context.project?.id,
      context.imageToReplace?.image.id,
      extended ? [extended.isPublished, extended.intent] : null,
    ])
  }

  /**
   * Retains a completed PUT for confirmation replay while its queue entry still exists.
   * @param entry Queue identity and original File.
   * @param identity Scope captured before upload started.
   * @param prepared Immutable signed confirmation and metadata.
   * @param featureOptions Explicit Feature options to preserve for the retry button.
   * @returns Nothing; removed entries never regain retained credentials.
   */
  private retainUploadConfirmation(
    entry: ImageUpload,
    identity: string,
    prepared: Awaited<ReturnType<typeof prepareImageUpload>>,
    featureOptions?: { isPublished: boolean; intent: Intent },
  ): void {
    if (
      this.state.uploadQueue.some(
        item => item.optimisticKey === entry.optimisticKey && item.file === entry.file,
      )
    )
      this.preparedConfirmations.set(entry.optimisticKey, {
        file: entry.file,
        identity,
        prepared,
        featureOptions: featureOptions ? { ...featureOptions } : undefined,
      })
  }

  /**
   * Looks up confirmation work without issuing a fresh upload grant.
   * @param entry Queue identity and current File.
   * @param identity Current account/destination/options identity.
   * @returns Matching prepared upload, or undefined after changed input invalidates it.
   * @remarks Expired grants are replayed and rejected by the server, never silently replaced.
   */
  private retainedUploadConfirmation(
    entry: ImageUpload,
    identity: string,
  ): Awaited<ReturnType<typeof prepareImageUpload>> | undefined {
    const retained = this.preparedConfirmations.get(entry.optimisticKey)
    if (retained?.file === entry.file && retained.identity === identity)
      return retained.prepared
    this.preparedConfirmations.delete(entry.optimisticKey)
    return undefined
  }

  /**
   * Uploads queued objects and finalizes them sequentially before shared reconciliation.
   * @param config Per-entry completion callbacks.
   * @returns Completion of the batch and its shared-query refresh.
   * @remarks Callback failures are reported after remaining entries finish; committed uploads stay successful.
   */
  private async processUploadQueue(config: {
    onSuccess?: (savedImage: ImageCtxEnvelope) => void
    onError?: () => void
  }) {
    const completionErrors: unknown[] = []
    const pendingUploads = this.state.uploadQueue.filter(
      item =>
        item.status === 'uploading' && !this.activeUploads.has(item.optimisticKey),
    )

    for (const upload of pendingUploads) this.activeUploads.add(upload.optimisticKey)
    try {
      const preparedUploads = await Promise.all(
        pendingUploads.map(async fileObject => {
          try {
            const uploadCtx = this.getUploadCtx(fileObject.imageToReplace)
            const identity = this.uploadConfirmationIdentity(uploadCtx)
            let preparedUpload = this.retainedUploadConfirmation(fileObject, identity)
            if (!preparedUpload) {
              preparedUpload = await prepareImageUpload(fileObject.file, uploadCtx)
              await uploadPreparedImageObject(preparedUpload)
              this.retainUploadConfirmation(fileObject, identity, preparedUpload)
            }
            this.setUploadStatus(fileObject, 'finalizing')

            return { fileObject, uploadCtx, preparedUpload }
          } catch (error) {
            const errorMessage = this.getUploadErrorMessage(error)
            this.setUploadError(fileObject, errorMessage)
            this.updateActivePreview()

            try {
              config.onError?.()
            } catch (callbackError) {
              completionErrors.push(callbackError)
            }

            return null
          }
        }),
      )

      const changedContexts = new Map<string, ImageUploadCtx>()
      // Finalize sequentially to avoid D1 SQLITE_BUSY lock contention during persistence.
      for (const preparedEntry of preparedUploads) {
        if (!preparedEntry) continue

        let savedImage: ImageCtxEnvelope
        try {
          savedImage = await finalizePreparedImageUpload(preparedEntry.preparedUpload)
        } catch (error) {
          const errorMessage = this.getUploadErrorMessage(error)
          console.error('[ImageCtx] upload finalize failed', {
            optimisticKey: preparedEntry.fileObject.optimisticKey,
            fileName: preparedEntry.fileObject.file.name,
            imageToReplaceId: preparedEntry.uploadCtx.imageToReplace?.image.id ?? null,
            error,
          })
          this.setUploadError(preparedEntry.fileObject, errorMessage)
          this.updateActivePreview()

          try {
            config.onError?.()
          } catch (callbackError) {
            completionErrors.push(callbackError)
          }
          continue
        }
        this.preparedConfirmations.delete(preparedEntry.fileObject.optimisticKey)
        // Persistence has committed; local callbacks cannot turn this entry into a failed upload.
        changedContexts.set(
          JSON.stringify([
            preparedEntry.uploadCtx.ctxType,
            preparedEntry.uploadCtx.ctxId,
          ]),
          preparedEntry.uploadCtx,
        )
        try {
          const savedEnvelope = this.applySuccessfulUploadResult(
            preparedEntry.fileObject,
            preparedEntry.uploadCtx,
            savedImage,
          )
          config.onSuccess?.(savedEnvelope)
        } catch (completionError) {
          completionErrors.push(completionError)
        }
      }
      // Refresh each committed resource once, outside upload failure/retry handling.
      await Promise.all(
        [...changedContexts.values()].map(context =>
          this.reconcileImageMutation(context),
        ),
      )
      if (completionErrors.length)
        throw new AggregateError(
          completionErrors,
          changedContexts.size
            ? 'Images saved, but local completion failed'
            : 'Upload completion callbacks failed',
        )
    } finally {
      for (const upload of pendingUploads)
        this.activeUploads.delete(upload.optimisticKey)
    }
  }

  async upload(args: {
    fileObject: ImageUpload
    event?: { fetch: typeof fetch }
    extended?: {
      featureImage?: {
        isPublished: boolean
        intent: Intent
      }
    }
  }) {
    const { fileObject, event, extended } = args
    if (this.activeUploads.has(fileObject.optimisticKey))
      throw new Error('Upload already in progress')
    this.activeUploads.add(fileObject.optimisticKey)
    try {
      const localFetch = event?.fetch ?? fetch

      let savedImage: ImageCtxEnvelope
      let uploadCtx: ImageUploadCtx
      try {
        uploadCtx = this.getUploadCtx(fileObject.imageToReplace)
        const previous = this.preparedConfirmations.get(fileObject.optimisticKey)
        const featureOptions =
          extended?.featureImage ??
          (previous?.file === fileObject.file &&
          previous.identity ===
            this.uploadConfirmationIdentity(uploadCtx, previous.featureOptions)
            ? previous.featureOptions
            : undefined)
        const identity = this.uploadConfirmationIdentity(uploadCtx, featureOptions)
        const retained = this.retainedUploadConfirmation(fileObject, identity)
        if (retained) this.setUploadStatus(fileObject, 'finalizing')
        savedImage = retained
          ? await finalizePreparedImageUpload(retained)
          : await uploadAndProcessImage(
              fileObject.file,
              uploadCtx,
              featureOptions,
              localFetch,
              {
                onObjectUploaded: prepared => {
                  this.retainUploadConfirmation(
                    fileObject,
                    identity,
                    prepared,
                    featureOptions,
                  )
                  this.setUploadStatus(fileObject, 'finalizing')
                },
              },
            )
      } catch (error) {
        const errorMessage = this.getUploadErrorMessage(error)
        console.error('[ImageCtx] upload failed', {
          optimisticKey: fileObject.optimisticKey,
          fileName: fileObject.file.name,
          imageToReplaceId: fileObject.imageToReplace?.image.id ?? null,
          error,
        })
        this.setUploadError(fileObject, errorMessage)
        this.updateActivePreview()
        throw error // Re-throw to allow calling code to handle
      }
      this.preparedConfirmations.delete(fileObject.optimisticKey)
      // The upload is committed; refresh failure must not turn it into a retryable upload error.
      try {
        return this.applySuccessfulUploadResult(fileObject, uploadCtx, savedImage)
      } finally {
        await this.reconcileImageMutation(uploadCtx)
      }
    } finally {
      this.activeUploads.delete(fileObject.optimisticKey)
    }
  }

  retryUpload(fileObject: ImageUpload) {
    if (this.activeUploads.has(fileObject.optimisticKey)) return
    this.setUploadToRetry(fileObject)
    void this.upload({ fileObject }).catch(() => {})
  }

  isReplacementStatus(imageId: Id, status: UploadStatus) {
    return this.state.uploadQueue.some(
      upload => upload.imageToReplace?.image.id === imageId && upload.status === status,
    )
  }

  // Organisation images are stored in
  // - /{organsation.code}/organsation.id
  // There can be only 1 linked image per organisation. Standard uploads create a new
  // image record and repoint the resource; explicit replacement reuses the existing image.
  //
  // Project images are stored in
  // - {organsation.code}/{project.code}/project.id
  // There can be only 1 linked image per project. Standard uploads create a new image
  // record and repoint the resource; explicit replacement reuses the existing image.

  // Feature images are stored in
  // - {organsation.code}/{project.code}/{image.image.publicId}
  // There can be multiple images per feature, so by default uploads create a new asset path.
  // A replace flow keeps the image row identity but selects a fresh source object after confirmation.
  // Admins can drop images into the viewer to replace the existing image from the Feature Image section.

  // Task images are stored in
  // - {organsation.code}/{project.code}/{image.image.publicId}
  // There can be multiple images per task, however, these images are used in review and will often require postprocessing. So uploads against these items are considered replacements.
  // Admins can drop images into the task viewer to replace the existing image in the Review Queue.

  // ═══════════════════════
  // 7. Image Attribute Updates (Patching)
  // ═══════════════════════
  /**
   * Updates an image intent and maintains canonical-image exclusivity.
   *
   * @param imageId The image being updated.
   * @param newIntent The new intent value to persist.
   * @param publishFromIntent Whether intent also controls publication; task classification preserves it.
   * @returns Resolves after local state has been refreshed.
   */
  async handleSetIntent(
    imageId: Id,
    newIntent: Intent,
    publishFromIntent = true,
  ): Promise<void> {
    const isPublished = publishFromIntent
      ? this.intentOptions.find(intent => intent.id === newIntent)?.isPublished
      : undefined
    const ctx = this.getCtx()
    const featureId = ctx.ctxType === 'feature' ? ctx.ctxId : undefined
    const contextAtStart = this.state.context

    try {
      // Canonical is exclusive: the server clears any competing assignment in the
      // same transaction as promotion, so a failed save retains the previous image.

      // Update the intent of the image
      await setImageIntent({
        id: imageId,
        ctxType: ctx.ctxType,
        ctxId: ctx.ctxId,
        intent: newIntent,
        featureId,

        meta: { isAdminRequest: true },
      })
      // Navigation must not redirect this mutation's refresh into another resource.
      await this.reconcileImageMutation(contextAtStart)
      if (this.state.context !== contextAtStart) return
      this.setForImage(imageId, 'intent', newIntent)
      if (isPublished !== undefined)
        this.setForImage(imageId, 'isPublished', isPublished)
      await this.refreshImages()
      if (this.state.context !== contextAtStart) return
      this.sortImagesInternal() // Calls the private sortImages method
    } catch (error) {
      console.error('[ImageCtx.handleSetIntent] failed to persist intent', {
        imageId,
        newIntent,
        error,
      })
      throw error
    }
  }

  // NOTE: This is currently only used for Images belonging to a feature.
  /**
   * Toggles publish state for the active image and refreshes ordering-sensitive state.
   *
   * @returns Resolves after the active image has been updated and refreshed.
   */
  async handlePublishToggle() {
    if (!this.state.activeImage) return
    const ctx = this.getCtx()
    const contextAtStart = this.state.context
    const imageId = this.state.activeImage.image.id
    const isPublished = !this.state.activeImage.isPublished

    const updatedImage = await setImagePublished({
      id: imageId,
      ctxType: ctx.ctxType,
      ctxId: ctx.ctxId,
      featureId: ctx.ctxType === 'feature' ? ctx.ctxId : undefined,
      isPublished,
      meta: { isAdminRequest: true },
    })
    if (updatedImage?.data?.image?.id) {
      // Invalidate the mutated resource before refetching its image collection.
      await this.reconcileImageMutation(contextAtStart)
      if (this.state.context !== contextAtStart) return
      this.setForImage(imageId, 'isPublished', isPublished)
      await this.refreshImages()
      if (this.state.context !== contextAtStart) return
      // Re-sort images when publish status changes
      this.sortImagesInternal()
    }
  }

  /**
   * Rotates an image in the current context and reloads the refreshed asset metadata.
   *
   * @param rotation The clockwise rotation to apply.
   * @param imageId Optional image id; defaults to the active image.
   * @returns Resolves after the rotation mutation and refresh complete.
   */
  async handleRotate(
    rotation: 0 | 90 | 180 | 270,
    imageId: Id | null = this.state.activeImage?.image.id ?? null,
  ): Promise<'draft' | 'saved' | undefined> {
    if (!imageId) return

    const ctx = this.getCtx()
    const contextAtStart = this.state.context

    try {
      const result = await rotateImageRemote({
        id: imageId,
        imageRevisionId: this.getImage(imageId)?.image.imageRevisionId,
        ctxType: ctx.ctxType,
        ctxId: ctx.ctxId,
        rotation,
        meta: { isAdminRequest: true },
      })

      if (result && 'revisionDraft' in result) {
        if (this.state.context === contextAtStart)
          toast.success('Rotation saved as a draft. Review and publish it in Updates.')
        return 'draft'
      }

      // Refresh fresh metadata only in the viewer that initiated the rotation.
      await this.reconcileImageMutation(contextAtStart)
      if (this.state.context !== contextAtStart) return
      await this.refreshImages()
      return 'saved'
    } catch (error) {
      toast.error('Failed to rotate image')
      throw error
    }
  }

  // ═══════════════════════
  // 8. Deletion Handling
  // ═══════════════════════
  handlePreDelete(e: MouseEvent, image: ImageCtxEnvelope) {
    e.stopPropagation()
    e.preventDefault()
    this.addToPendingConfirmation(image.image.id)
  }

  handleCancelDelete(e: MouseEvent, image: ImageCtxEnvelope) {
    e.stopPropagation()
    e.preventDefault()
    this.removeFromPendingConfirmation(image.image.id)
  }

  handleConfirmDelete(e: MouseEvent, image: ImageCtxEnvelope) {
    e.stopPropagation()
    e.preventDefault()
    this.addToDeletionQueue(image.image.id)
    this.processDeletionQueue()
  }

  async processDeletionQueue() {
    await Promise.all(
      Array.from(this.state.deletionQueue).map(async imageId => {
        await this.delete(imageId, this.getCtx())
      }),
    )
  }

  /**
   * Deletes an image and reconciles local selection, queues, and thumbnail state.
   *
   * @param imageId The image to delete.
   * @param ctx Mutation context to send to the server.
   * @returns Resolves after deletion-side effects have settled.
   */
  delete(imageId: Id, ctx: ImageEditCtx): Promise<void> {
    const key = JSON.stringify([ctx.ctxType, ctx.ctxId, imageId])
    const pending = this.imageDeletions.get(key)
    if (pending) return pending
    const operation = this.performDelete(imageId, ctx).finally(() => {
      if (this.imageDeletions.get(key) === operation) this.imageDeletions.delete(key)
    })
    this.imageDeletions.set(key, operation)
    return operation
  }

  /**
   * Performs one deletion with a rollback limited to its own image and uploads.
   * @param imageId Image identity.
   * @param ctx Authorization context for the mutation.
   * @returns Completion of the mutation and shared reconciliation.
   */
  private async performDelete(imageId: Id, ctx: ImageEditCtx): Promise<void> {
    const contextAtStart = this.state.context
    const imagesBeforeDelete = this.getImages()
    const removedUploads = this.state.uploadQueue.filter(
      upload => !upload.imageToReplace && upload.savedImage?.image.id === imageId,
    )
    const deletedImage = imagesBeforeDelete.find(image => image.image.id === imageId)
    let selectionAfterDelete: ImageCtxEnvelope | null = null
    let itemAfterDelete: string | null = null
    const activeImageBeforeDelete = this.state.activeImage
    const activeItemIdBeforeDelete = this.state.activeItemId
    const rollbackSingleResourceImageCache =
      this.optimisticallyClearSingleResourceImageCache(imageId)
    const deletedIndex = imagesBeforeDelete.findIndex(
      image => image.image.id === imageId,
    )
    const nextActiveImage =
      deletedIndex >= 0
        ? (imagesBeforeDelete[deletedIndex + 1] ??
          imagesBeforeDelete[deletedIndex - 1] ??
          null)
        : null

    let deleted = false
    try {
      this.removeImage(imageId)
      this.setUploadQueue(
        this.state.uploadQueue.filter(upload => {
          const isDeletedSavedUpload =
            !upload.imageToReplace && upload.savedImage?.image.id === imageId

          return !isDeletedSavedUpload
        }),
      )

      if (activeImageBeforeDelete?.image.id === imageId) {
        if (nextActiveImage) {
          this.setActiveImage(nextActiveImage)
        } else {
          this.resetActiveImage()
        }
      }

      selectionAfterDelete = this.state.activeImage
      itemAfterDelete = this.state.activeItemId
      await deleteImageRemote({
        id: imageId,
        ctxType: ctx.ctxType,
        ctxId: ctx.ctxId,
        meta: { isAdminRequest: true },
      })
      deleted = true
      // Release removed previews only after commit; failed deletions still need them.
      for (const upload of removedUploads)
        if (upload.preview) URL.revokeObjectURL(upload.preview)
    } catch (error: unknown) {
      rollbackSingleResourceImageCache?.()
      // Navigation can replace the viewer while this deletion is pending.
      if (this.state.context !== contextAtStart) return
      // Restore only our removed entry; other deletions, additions and edits remain authoritative.
      if (deletedImage && !this.state.images.has(imageId)) {
        this.state.images.set(imageId, deletedImage)
        this.sortImagesInternal()
      }
      const currentKeys = new Set(
        this.state.uploadQueue.map(upload => upload.optimisticKey),
      )
      this.setUploadQueue(
        [
          ...this.state.uploadQueue,
          ...removedUploads.filter(upload => !currentKeys.has(upload.optimisticKey)),
        ].sort((a, b) => a.queuedAt - b.queuedAt),
      )
      if (
        activeImageBeforeDelete?.image.id === imageId &&
        this.state.activeImage === selectionAfterDelete &&
        this.state.activeItemId === itemAfterDelete
      ) {
        const restored = this.getImage(imageId)
        if (restored) this.setActiveImage(restored, false, activeItemIdBeforeDelete)
      }

      // Extract error message from the server response
      let errorMessage = 'Failed to delete image'
      const errorMessageText = getErrorMessage(error)
      if (errorMessageText) {
        // Parse the error message from deleteImage service
        if (errorMessageText.includes('Cannot delete image. It belongs to a Task')) {
          errorMessage = m.quaint_quaint_fly_zap()
        } else if (errorMessageText.includes('Failed to delete image:')) {
          // Extract the part after "Failed to delete image: "
          errorMessage = errorMessageText.replace('Failed to delete image: ', '')
        }
      }

      // Show error message on the thumbnail for 5 seconds
      this.setErrorMessage(imageId, errorMessage)
    } finally {
      // Cleanup belongs only to the viewer that initiated the deletion.
      if (this.state.context === contextAtStart) {
        this.removeFromPendingConfirmation(imageId)
        this.removeFromDeletionQueue(imageId)
        this.resetLoadStatus(imageId)
        this.resetUploadStatus(imageId)
        this.resetThumbnailLoadStatus(imageId)
      }
    }
    // Reconcile only committed deletions and never roll them back on a refresh failure.
    if (deleted) await this.reconcileImageMutation(ctx)
  }

  // ═══════════════════════
  // 9. Download Functionality
  // ═══════════════════════
  /**
   * Starts a full-resolution browser download with the image's saved orientation.
   *
   * @param _e Click event placeholder for template compatibility.
   * @param image Optional image to download; defaults to the active image.
   * @returns Resolves after the browser download has been triggered.
   */
  async downloadImage(_e: MouseEvent, image?: ImageCtxEnvelope) {
    image ??= this.state.activeImage ?? undefined
    if (!image) return
    let downloadUrl = ''

    if (image.image.cdn.toLowerCase() === 'cloudflarer2') {
      downloadUrl = getURLfromImage({
        image,
        raw: true,
        rawTransformation: '',
      })
      // Avoid reusing a cached original from before raw downloads applied saved orientation.
      downloadUrl += '?download=1'
    } else {
      throw new Error('Unsupported CDN')
    }

    try {
      const link = document.createElement('a')
      link.style.display = 'none'
      link.href = downloadUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      link.download = image.image.publicId.split('/').pop() ?? image.image.id

      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      toast.success('Download started')
    } catch (err) {
      toast.error(`Failed to download image: ${err}`)
    }
  }

  // ═══════════════════════
  // 10. Preloading Utilities
  // ═══════════════════════
  preloadImage = (src: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve()
      img.onerror = event => {
        if (img.currentSrc === '' || img.currentSrc !== src) {
          resolve()
          return
        }

        reject(event)
      }
      img.src = src
    })
  }

  async preloadImages() {
    const images = this.getImages()
    const imagesToPreload = images
      .map(image => getURLfromImage({ image }))
      .filter(url => !this.state.preloadedImages.has(url))

    // Preload all images concurrently
    await Promise.all(
      imagesToPreload.map(async url => {
        try {
          await this.preloadImage(url)
          this.state.preloadedImages.add(url)
        } catch (error) {
          if (isAbortedImageLoadError(error)) {
            return
          }
        }
      }),
    )
  }

  isImagePreloaded(image: ImageCtxEnvelope): boolean {
    const url = getURLfromImage({ image })
    return this.state.preloadedImages.has(url)
  }

  // ═══════════════════════
  // 11. Internal Helper Methods
  // ═══════════════════════

  /**
   * Checks if an image is staged (has a preview URL)
   */
  isImageStaged(image: ImageCtxEnvelope): boolean {
    return image.image.cdn === 'preview' && Boolean(image.image.preview)
  }

  /**
   * Gets staged images from the main images array
   */
  getStagedImages(): ImageCtxEnvelope[] {
    return this.getImages().filter(img => this.isImageStaged(img))
  }

  getStagedQueue(): ImageUpload[] {
    return this.state.stagingQueue
  }

  /**
   * Cleans up preview URLs for staged images
   */
  cleanupStagedImages() {
    this.state.stagingQueue = []
    const stagedImages = this.getStagedImages()
    stagedImages.forEach(img => {
      if (img.image.preview) {
        URL.revokeObjectURL(img.image.preview)
      }
    })
  }

  private sortImagesInternal = () => {
    const images = this.getImages()
    const { map } = this.createSortedImageState(images)
    this.state.images = map
  }

  private toSortableImage(image: ImageCtxEnvelope): Image & {
    intent?: Intent | 'undefined'
    isPublished?: boolean
    publishedAt?: string | null
  } {
    return {
      ...image.image,
      intent: image.intent ?? undefined,
      isPublished: image.isPublished ?? undefined,
      publishedAt: image.publishedAt ?? undefined,
    }
  }

  private sortImageEnvelopes(images: ImageCtxEnvelope[]): {
    sortedApiImages: ImageCtxEnvelope[]
    stagedImages: ImageCtxEnvelope[]
  } {
    const stagedImages = images.filter(img => this.isImageStaged(img))
    const apiImages = images.filter(img => !this.isImageStaged(img))
    const sortedApiImages = sortImages(
      apiImages.map(image => this.toSortableImage(image)),
      this.isAdminMode,
      this.intentOptions.map(intent => intent.id),
    )
      .map(sorted => apiImages.find(item => item.image.id === sorted.id))
      .filter(isValidImageEnvelope)

    return { sortedApiImages, stagedImages }
  }

  private createSortedImageState(images: ImageCtxEnvelope[]): {
    map: SvelteMap<Id, ImageCtxEnvelope>
    sortedApiImages: ImageCtxEnvelope[]
  } {
    const { sortedApiImages, stagedImages } = this.sortImageEnvelopes(images)
    const map = new SvelteMap<Id, ImageCtxEnvelope>()

    for (const image of [...sortedApiImages, ...stagedImages]) {
      map.set(image.image.id, {
        ...image,
        intentLabel:
          this.intentOptions.find(intent => intent.id === image.intent)?.label ??
          image.intent ??
          undefined,
      })
    }

    return { map, sortedApiImages }
  }
}

// ═══════════════════════
// SERVICE SETUP
// ═══════════════════════

const IMAGE_STATE_KEY = Symbol('IMAGE_STATE_KEY')

/**
 * Creates and registers an `ImageCtx` instance in Svelte context.
 *
 * @param options Initial image-context options.
 * @returns The registered `ImageCtx` instance.
 */
export const setImageCtx = (options: ImageCtxConstructorOptions) =>
  setContext(IMAGE_STATE_KEY, new ImageCtx(options, getSurfaceCtx()))

/**
 * Reads the current `ImageCtx` from Svelte context.
 *
 * @returns The current `ImageCtx`.
 */
export const getImageCtx = (): ImageCtx => {
  const ctx = getContext<ImageCtx | undefined>(IMAGE_STATE_KEY)
  if (!ctx) {
    throw new Error(
      'ImageCtx context is missing. Ensure setImageCtx() is called before using getImageCtx().',
    )
  }
  return ctx
}
