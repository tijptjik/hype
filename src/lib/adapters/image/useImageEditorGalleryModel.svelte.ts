// SVELTE
import { onDestroy } from 'svelte'
import { toast } from 'svelte-sonner'
// REMOTE
import { getMetadata } from '$lib/api/server/image.remote'
// I18N
import { m } from '$lib/i18n'
// IMAGE
import { IMAGE_RAW_INTERMEDIATE_TRANSFORMATION } from '$lib/images/delivery'
import {
  getGalleryItemTargetImageId,
  getGalleryItemThumbnailStatusId,
  getURLfromImage,
  preloadImageUrl,
  sortGalleryItems,
  updateImagePresentationMode,
  waitForThumbnailReadyEvent,
} from '$lib/client/services/image'
// TYPES
import type {
  ViewerRenderable,
  ViewerRenderableStatus,
} from '$lib/bits/patterns/images'
import type { ImageCtx } from '$lib/context/image.svelte'
import type {
  ImageCtxEnvelope,
  ImageMetadataFull,
  Intent,
  UploadStatus,
} from '$lib/db/zod/schema/image.types'
import type { Id } from '$lib/types'

type ImageEditorGalleryModel = {
  state: {
    items: ViewerRenderable[]
    activeId: string | null
    activeImage: ImageCtxEnvelope | null
    isProcessingUploads: boolean
    isUploadBusy: boolean
    isPublished: boolean
    presentationMode: 'cover' | 'contain'
    canMutateActiveImage: boolean
    canRotateActiveImage: boolean
    canReplaceActiveImage: boolean
    canDownloadActiveImage: boolean
    isRotatePending: boolean
    metadata: ImageMetadataFull | null
    isMetadataLoading: boolean
    hasLoadedMetadata: boolean
  }
  status: {
    isLoading: (item: ViewerRenderable) => boolean
    isUploading: (item: ViewerRenderable) => boolean
  }
  actions: {
    select: (id: string | null) => void
    addFiles: (files: FileList | File[]) => Promise<void>
    replaceFiles: (files: FileList | File[]) => Promise<void>
    deleteItem: (item: ViewerRenderable) => Promise<void>
    retryUpload: (item: ViewerRenderable) => void
    setIntent: (imageId: string, intent: Intent) => Promise<void>
    rotateLeft: () => Promise<void>
    rotateRight: () => Promise<void>
    togglePublished: () => void
    setPresentationMode: (mode: 'cover' | 'contain') => Promise<void>
    downloadActive: () => void
    markThumbnailLoaded: (item: ViewerRenderable) => void
    markThumbnailErrored: (item: ViewerRenderable) => void
    markCurrentItemLoaded: (item: ViewerRenderable) => void
    ensureMetadataLoaded: () => Promise<void>
  }
}

const ROTATION_STEP_MS = 700
const PROMOTION_MAX_ATTEMPTS = 8
const PROMOTION_RETRY_DELAY_MS = 350

function getEditorViewerSrc(
  image: Parameters<typeof getURLfromImage>[0]['image'],
): string {
  return getURLfromImage({
    image,
    raw: true,
    rawTransformation: IMAGE_RAW_INTERMEDIATE_TRANSFORMATION,
  })
}

function normalizeRotation(rotation: number | null | undefined): 0 | 90 | 180 | 270 {
  const normalized = (((rotation ?? 0) % 360) + 360) % 360

  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }

  return 0
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractVersionFromUrl(url: string | null | undefined): number | null {
  if (!url) return null

  const match = url.match(/\/v(\d+)\//)
  if (!match) return null

  const parsed = Number.parseInt(match[1] ?? '', 10)
  return Number.isFinite(parsed) ? parsed : null
}

function getDisplayedItemVersion(
  item: ViewerRenderable | null | undefined,
): number | null {
  return (
    extractVersionFromUrl(item?.src) ??
    extractVersionFromUrl(item?.sourceFallbackSrc) ??
    null
  )
}

function buildUploadStatus(input: {
  kind: 'optimistic-upload' | 'replacement-upload' | 'finalized-upload'
  savedImageId: string | null
  uploadStatus: UploadStatus
  uploadErrorMessage: string | null
  sortCreatedAt: string
}): ViewerRenderableStatus {
  if (input.kind === 'finalized-upload') {
    return {
      kind: 'finalized-upload',
      savedImageId: input.savedImageId,
      uploadStatus: 'uploaded',
      uploadErrorMessage: input.uploadErrorMessage,
      sortCreatedAt: input.sortCreatedAt,
    }
  }

  return {
    kind: input.kind,
    savedImageId: input.savedImageId,
    uploadStatus: input.uploadStatus,
    uploadErrorMessage: input.uploadErrorMessage,
    sortCreatedAt: input.sortCreatedAt,
  }
}

function buildPersistedStatus(input: {
  kind: 'persisted' | 'finalized-upload'
  savedImageId: string
  sortCreatedAt: string
}): ViewerRenderableStatus {
  if (input.kind === 'finalized-upload') {
    return {
      kind: 'finalized-upload',
      savedImageId: input.savedImageId,
      uploadStatus: 'uploaded',
      sortCreatedAt: input.sortCreatedAt,
    }
  }

  return {
    kind: 'persisted',
    savedImageId: input.savedImageId,
    sortCreatedAt: input.sortCreatedAt,
  }
}

/**
 * Adapter that projects `ImageCtx` state and actions into the contract consumed by `ImageEditor`.
 *
 * @param imageCtx Domain image store backing the current feature editor.
 * @returns Editor-facing gallery model with normalized items, derived status, and actions.
 */
export function useImageEditorGalleryModel(
  imageCtx: ImageCtx,
): ImageEditorGalleryModel {
  const metadataRequests = new Map<string, Promise<ImageMetadataFull | null>>()
  const rotationTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const optimisticRenderKeyCache = new Map<string, string>()
  const optimisticPreviewCache = new Map<string, string>()
  const pendingPromotionKeys = new Set<string>()

  let rotationRequestSequence = 0
  let metadataByImageId = $state<Record<string, ImageMetadataFull | null>>({})
  let metadataStatusByImageId = $state<Record<string, 'idle' | 'loading' | 'loaded'>>(
    {},
  )
  let promotedAssetUrlByImageId = $state<
    Record<string, { mainSrc?: string; thumbnailSrc?: string }>
  >({})
  let isPresentationModePending = $state(false)
  let optimisticRotationByImageId = $state<
    Record<
      string,
      {
        baseRotation: 0 | 90 | 180 | 270
        rotation: number
        version: number | null
        pendingVersion: number | null
      }
    >
  >({})
  let isRotatePending = $state(false)

  function getPersistedRotation(
    imageId: string | null | undefined,
  ): 0 | 90 | 180 | 270 {
    if (!imageId) return 0
    return normalizeRotation(metadataByImageId[imageId]?.rotation)
  }

  function getEffectiveRotationForSource(
    imageId: string | null | undefined,
    sourceUrl: string | null | undefined,
  ): number {
    if (!imageId) return 0
    const optimisticRotation = optimisticRotationByImageId[imageId]
    if (!optimisticRotation) return 0

    const displayedVersion = extractVersionFromUrl(sourceUrl)
    if (
      optimisticRotation.pendingVersion != null &&
      displayedVersion === optimisticRotation.pendingVersion
    ) {
      return 0
    }

    return optimisticRotation.rotation
  }

  function getSourceBaseRotation(
    imageId: string | null | undefined,
    sourceUrl: string | null | undefined,
  ): 0 | 90 | 180 | 270 {
    if (!imageId) return 0

    const optimisticRotation = optimisticRotationByImageId[imageId]
    if (!optimisticRotation) {
      return getPersistedRotation(imageId)
    }

    const displayedVersion = extractVersionFromUrl(sourceUrl)
    if (
      optimisticRotation.pendingVersion != null &&
      displayedVersion === optimisticRotation.pendingVersion
    ) {
      return getPersistedRotation(imageId)
    }

    return optimisticRotation.baseRotation
  }

  function getShouldAnimateRotation(imageId: string | null | undefined): boolean {
    if (!imageId) return false
    const optimisticRotation = optimisticRotationByImageId[imageId]
    if (!optimisticRotation) return false

    return optimisticRotation.pendingVersion === null
  }

  function getShouldForceSourceTransition(imageId: string | null | undefined): boolean {
    if (!imageId) return false
    return Boolean(optimisticRotationByImageId[imageId])
  }

  function getLatestReplacementUpload(imageId: string) {
    return imageCtx
      .getUploadQueue()
      .filter(
        upload =>
          upload.imageToReplace?.image.id === imageId &&
          upload.status !== 'invalidated',
      )
      .sort((a, b) => b.queuedAt - a.queuedAt)[0]
  }

  function getPromotionToken(
    imageId: string,
    kind: 'mainSrc' | 'thumbnailSrc',
  ): string {
    const persistedVersion = imageCtx.getImage(imageId)?.image.version ?? null
    const replacementUpload = getLatestReplacementUpload(imageId)

    return [
      kind,
      persistedVersion ?? 'null',
      replacementUpload?.optimisticKey ?? 'none',
      replacementUpload?.status ?? 'idle',
    ].join(':')
  }

  async function promoteProcessedAsset(
    image: ImageCtxEnvelope,
    kind: 'mainSrc' | 'thumbnailSrc',
    url: string,
  ): Promise<void> {
    const imageId = image.image.id
    const promotionKey = `${imageId}:${kind}`
    const expectedToken = getPromotionToken(imageId, kind)
    if (pendingPromotionKeys.has(promotionKey)) {
      return
    }

    pendingPromotionKeys.add(promotionKey)

    try {
      if (kind === 'thumbnailSrc') {
        await waitForThumbnailReadyEvent({
          publicId: image.image.publicId,
          version: image.image.version ?? null,
        })
      }

      // Warm the finalized asset URL before swapping away from the optimistic preview.
      for (let attempt = 0; attempt < PROMOTION_MAX_ATTEMPTS; attempt += 1) {
        try {
          await preloadImageUrl(url)
          if (getPromotionToken(imageId, kind) !== expectedToken) {
            return
          }
          promotedAssetUrlByImageId = {
            ...promotedAssetUrlByImageId,
            [imageId]: {
              ...promotedAssetUrlByImageId[imageId],
              [kind]: url,
            },
          }
          return
        } catch (_error) {
          if (attempt === PROMOTION_MAX_ATTEMPTS - 1) {
            return
          }
          await sleep(PROMOTION_RETRY_DELAY_MS)
        }
      }
    } finally {
      pendingPromotionKeys.delete(promotionKey)
    }
  }

  const activeImage = $derived(imageCtx.activeImage)
  const activeId = $derived(imageCtx.getActiveItemId())

  $effect(() => {
    for (const upload of imageCtx.getUploadQueue()) {
      const savedImage = upload.savedImage
      const savedImageId = savedImage?.image.id
      if (!savedImage || !savedImageId || upload.status !== 'uploaded') continue

      const promotedAssets = promotedAssetUrlByImageId[savedImageId]

      if (
        (savedImageId === activeId || upload.optimisticKey === activeId) &&
        !promotedAssets?.mainSrc
      ) {
        void promoteProcessedAsset(
          savedImage,
          'mainSrc',
          getEditorViewerSrc(savedImage),
        )
      }

      if (!promotedAssets?.thumbnailSrc) {
        void promoteProcessedAsset(
          savedImage,
          'thumbnailSrc',
          getURLfromImage({
            image: savedImage,
            transformation: 'c_fill,h_256,w_256',
          }),
        )
      }
    }
  })

  $effect(() => {
    const nextOptimisticRotationByImageId = { ...optimisticRotationByImageId }
    let hasChanges = false

    for (const item of items) {
      const imageId = getGalleryItemTargetImageId(item.id, items) ?? item.id
      const optimisticRotation = nextOptimisticRotationByImageId[imageId]

      if (!optimisticRotation?.pendingVersion) {
        continue
      }

      const displayedVersion = getDisplayedItemVersion(item)

      if (displayedVersion !== optimisticRotation.pendingVersion) {
        continue
      }

      delete nextOptimisticRotationByImageId[imageId]
      hasChanges = true
    }

    if (hasChanges) {
      optimisticRotationByImageId = nextOptimisticRotationByImageId
    }
  })

  const items = $derived.by<ViewerRenderable[]>(() => {
    const uploadQueue = imageCtx.getUploadQueue()
    const activePromotionImageIds = new Set(
      uploadQueue
        .filter(upload => !upload.imageToReplace && upload.savedImage)
        .map(upload => upload.savedImage?.image.id)
        .filter((imageId): imageId is string => Boolean(imageId)),
    )

    for (const upload of uploadQueue) {
      const savedImageId = upload.savedImage?.image.id
      if (!savedImageId) continue
      optimisticRenderKeyCache.set(savedImageId, upload.optimisticKey)
      if (upload.preview) {
        optimisticPreviewCache.set(savedImageId, upload.preview)
      }
    }

    for (const imageId of Array.from(optimisticPreviewCache.keys())) {
      if (!activePromotionImageIds.has(imageId)) {
        optimisticPreviewCache.delete(imageId)
      }
    }

    const optimisticSavedImageIds = activePromotionImageIds
    const replacementUploadsByImageId = new Map(
      uploadQueue
        .filter(
          upload =>
            !!upload.imageToReplace &&
            upload.status !== 'invalidated' &&
            !!upload.imageToReplace.image.id,
        )
        .sort((a, b) => b.queuedAt - a.queuedAt)
        .map(upload => [upload.imageToReplace?.image.id, upload] as const),
    )
    const queueItems: ViewerRenderable[] = uploadQueue
      .filter(
        upload => !upload.imageToReplace && (!!upload.preview || !!upload.savedImage),
      )
      .map(upload => {
        const savedImage = upload.savedImage
        const persistedImage = savedImage
          ? imageCtx.getImage(savedImage.image.id)
          : null
        const resolvedImage = persistedImage ?? savedImage ?? null
        const isSettled = upload.status === 'uploaded' && !!savedImage
        const previewSrc = upload.preview ?? null
        const replacementUpload = resolvedImage
          ? replacementUploadsByImageId.get(resolvedImage.image.id)
          : undefined
        const replacementPreviewSrc = replacementUpload?.preview ?? null
        const isReplacementUploading =
          replacementUpload?.status === 'uploading' ||
          replacementUpload?.status === 'finalizing'
        const promotedAssets = resolvedImage
          ? promotedAssetUrlByImageId[resolvedImage.image.id]
          : undefined
        const promotedMainSrc = promotedAssets?.mainSrc ?? null
        const promotedThumbnailSrc = promotedAssets?.thumbnailSrc ?? null
        const resolvedSrc =
          replacementPreviewSrc ??
          (isSettled ? (promotedMainSrc ?? previewSrc) : previewSrc)
        const resolvedThumbnailSrc =
          replacementPreviewSrc ??
          (isSettled ? (promotedThumbnailSrc ?? previewSrc) : previewSrc)

        return {
          id: upload.optimisticKey,
          renderKey: upload.optimisticKey,
          src: resolvedSrc,
          sourceFallbackSrc: replacementPreviewSrc ?? previewSrc,
          thumbnailSrc: resolvedThumbnailSrc,
          blurSrc: replacementPreviewSrc ?? previewSrc,
          alt: resolvedImage?.intent ?? upload.file.name,
          fallbackSeed: resolvedImage?.image.publicId ?? upload.file.name,
          intent: resolvedImage?.intent ?? ('undefined' as const),
          isPublished: resolvedImage?.isPublished ?? false,
          rotationDegrees: resolvedImage
            ? getEffectiveRotationForSource(resolvedImage.image.id, resolvedSrc)
            : null,
          animateRotation: resolvedImage
            ? getShouldAnimateRotation(resolvedImage.image.id)
            : false,
          meta: resolvedImage
            ? {
                forceSourceTransition: getShouldForceSourceTransition(
                  resolvedImage.image.id,
                ),
              }
            : undefined,
          status: buildUploadStatus({
            kind: isReplacementUploading
              ? 'replacement-upload'
              : upload.imageToReplace
                ? 'replacement-upload'
                : isSettled
                  ? 'finalized-upload'
                  : 'optimistic-upload',
            savedImageId: resolvedImage?.image.id ?? null,
            uploadStatus: isReplacementUploading
              ? (replacementUpload?.status ?? 'uploading')
              : upload.status,
            uploadErrorMessage: isReplacementUploading
              ? (replacementUpload?.errorMessage ?? null)
              : (upload.errorMessage ?? null),
            sortCreatedAt: new Date(upload.queuedAt).toISOString(),
          }),
        } satisfies ViewerRenderable
      })

    const imageItems: ViewerRenderable[] = imageCtx
      .getImages()
      .filter(image => !optimisticSavedImageIds.has(image.image.id))
      .map(image => {
        const replacementUpload = replacementUploadsByImageId.get(image.image.id)
        const resolvedImage = replacementUpload?.savedImage ?? image
        const replacementPreviewSrc = replacementUpload?.preview ?? null
        const isReplacementUploading =
          replacementUpload?.status === 'uploading' ||
          replacementUpload?.status === 'finalizing'
        const resolvedSrc =
          replacementPreviewSrc ??
          promotedAssetUrlByImageId[resolvedImage.image.id]?.mainSrc ??
          getEditorViewerSrc(resolvedImage)
        const resolvedThumbnailSrc =
          replacementPreviewSrc ??
          promotedAssetUrlByImageId[resolvedImage.image.id]?.thumbnailSrc ??
          getURLfromImage({
            image: resolvedImage,
            transformation: 'c_fill,h_256,w_256',
          })

        return {
          id: resolvedImage.image.id,
          renderKey: optimisticRenderKeyCache.get(resolvedImage.image.id),
          src: resolvedSrc,
          sourceFallbackSrc:
            replacementPreviewSrc ??
            (activePromotionImageIds.has(resolvedImage.image.id)
              ? (optimisticPreviewCache.get(resolvedImage.image.id) ?? null)
              : null),
          thumbnailSrc: resolvedThumbnailSrc,
          blurSrc: replacementPreviewSrc ?? getEditorViewerSrc(resolvedImage),
          alt: resolvedImage.intent ?? m.admin__project_license_media_image(),
          fallbackSeed: resolvedImage.image.publicId ?? resolvedImage.image.id,
          intent: resolvedImage.intent ?? 'undefined',
          isPublished: resolvedImage.isPublished ?? false,
          rotationDegrees: getEffectiveRotationForSource(
            resolvedImage.image.id,
            resolvedSrc,
          ),
          animateRotation: getShouldAnimateRotation(resolvedImage.image.id),
          meta: {
            forceSourceTransition: getShouldForceSourceTransition(
              resolvedImage.image.id,
            ),
          },
          status: isReplacementUploading
            ? buildUploadStatus({
                kind: 'replacement-upload',
                savedImageId: resolvedImage.image.id,
                uploadStatus: replacementUpload?.status ?? 'uploading',
                uploadErrorMessage: replacementUpload?.errorMessage ?? null,
                sortCreatedAt: resolvedImage.image.createdAt,
              })
            : buildPersistedStatus({
                kind: activePromotionImageIds.has(resolvedImage.image.id)
                  ? 'finalized-upload'
                  : 'persisted',
                savedImageId: resolvedImage.image.id,
                sortCreatedAt: resolvedImage.image.createdAt,
              }),
        } satisfies ViewerRenderable
      })

    return sortGalleryItems([...queueItems, ...imageItems])
  })

  const isProcessingUploads = $derived.by(() =>
    imageCtx
      .getUploadQueue()
      .some(
        upload =>
          !upload.imageToReplace &&
          (upload.status === 'uploading' || upload.status === 'finalizing'),
      ),
  )
  const isUploadBusy = $derived.by(() =>
    imageCtx
      .getUploadQueue()
      .some(upload => upload.status === 'uploading' || upload.status === 'finalizing'),
  )
  const latestQueuedUploadId = $derived.by(() => {
    const additiveUploads = imageCtx
      .getUploadQueue()
      .filter(upload => !upload.imageToReplace && upload.status === 'uploading')
      .sort((a, b) => b.queuedAt - a.queuedAt)

    return additiveUploads[0]?.optimisticKey ?? null
  })

  $effect(() => {
    if (!latestQueuedUploadId || activeId === latestQueuedUploadId) {
      return
    }

    imageCtx.targetItem(latestQueuedUploadId)
  })

  const activeMetadataImageId = $derived(getGalleryItemTargetImageId(activeId, items))
  const metadata = $derived(
    activeMetadataImageId ? (metadataByImageId[activeMetadataImageId] ?? null) : null,
  )
  const isMetadataLoading = $derived(
    activeMetadataImageId
      ? metadataStatusByImageId[activeMetadataImageId] === 'loading'
      : false,
  )
  const hasLoadedMetadata = $derived(
    activeMetadataImageId
      ? metadataStatusByImageId[activeMetadataImageId] === 'loaded'
      : false,
  )
  const isPublished = $derived.by(() => {
    if (!activeMetadataImageId) return false
    return imageCtx.getImage(activeMetadataImageId)?.isPublished ?? false
  })
  const canMutateActiveImage = $derived.by(() => {
    if (!activeId || !activeMetadataImageId) return false

    const activeItem = items.find(item => item.id === activeId) ?? null
    if (!activeItem) return false

    const uploadStatus = activeItem.status?.uploadStatus
    const isBlockedByUpload =
      uploadStatus === 'uploading' || uploadStatus === 'finalizing'

    return !isBlockedByUpload && !imageCtx.isImageBeingReplaced(activeMetadataImageId)
  })
  const canRotateActiveImage = $derived.by(() => {
    return canMutateActiveImage
  })
  const canReplaceActiveImage = $derived.by(() => {
    return canMutateActiveImage
  })
  const canDownloadActiveImage = $derived.by(() => canMutateActiveImage)
  const presentationMode = $derived.by<'cover' | 'contain'>(() => {
    if (!activeMetadataImageId) return 'contain'
    return imageCtx.getImage(activeMetadataImageId)?.image.presentationMode === 'cover'
      ? 'cover'
      : 'contain'
  })

  async function addFiles(files: FileList | File[]): Promise<void> {
    const acceptedFiles = Array.from(files)
    if (acceptedFiles.length === 0) return
    await imageCtx.handleFilesSelect(acceptedFiles, [])
  }

  function resetMetadataForImage(imageId: Id): void {
    metadataRequests.delete(imageId)
    metadataByImageId = {
      ...metadataByImageId,
      [imageId]: null,
    }
    metadataStatusByImageId = {
      ...metadataStatusByImageId,
      [imageId]: 'idle',
    }
  }

  async function replaceFiles(files: FileList | File[]): Promise<void> {
    const acceptedFiles = Array.from(files)
    const imageToReplace = activeMetadataImageId
      ? (imageCtx.getImage(activeMetadataImageId) ?? null)
      : null

    if (acceptedFiles.length === 0 || !imageToReplace) return
    resetMetadataForImage(imageToReplace.image.id)
    await imageCtx.handleFilesSelect(acceptedFiles, [], {}, imageToReplace)
  }

  async function ensureMetadataLoadedForImage(
    imageId: Id,
  ): Promise<ImageMetadataFull | null> {
    const currentStatus = metadataStatusByImageId[imageId] ?? 'idle'

    if (currentStatus === 'loading') {
      return (await metadataRequests.get(imageId)) ?? metadataByImageId[imageId] ?? null
    }

    if (currentStatus === 'loaded') {
      return metadataByImageId[imageId] ?? null
    }

    const currentImage = imageCtx.getImage(imageId)?.image

    if (!currentImage?.publicId) {
      metadataStatusByImageId = {
        ...metadataStatusByImageId,
        [imageId]: 'loaded',
      }
      metadataByImageId = {
        ...metadataByImageId,
        [imageId]: null,
      }
      return null
    }

    metadataStatusByImageId = {
      ...metadataStatusByImageId,
      [imageId]: 'loading',
    }

    const request = getMetadata({
      publicId: currentImage.publicId,
      env: currentImage.env ?? undefined,
      version: currentImage.version ?? undefined,
      profile: 'admin',
      meta: imageCtx.appCtx.isAdmin() ? { isAdminRequest: true } : undefined,
    }).then(response => (response?.data as ImageMetadataFull | null) ?? null)
    metadataRequests.set(imageId, request)

    try {
      const result = await request

      if (!imageCtx.getImage(imageId)) {
        return null
      }

      metadataByImageId = {
        ...metadataByImageId,
        [imageId]: result,
      }
      metadataStatusByImageId = {
        ...metadataStatusByImageId,
        [imageId]: 'loaded',
      }

      return result
    } catch (error) {
      if (!imageCtx.getImage(imageId)) {
        return null
      }

      console.error('[ImageEditorGalleryModel] Metadata lazy-load error', {
        imageId,
        error,
      })
      metadataByImageId = {
        ...metadataByImageId,
        [imageId]: null,
      }
      metadataStatusByImageId = {
        ...metadataStatusByImageId,
        [imageId]: 'loaded',
      }

      return null
    } finally {
      metadataRequests.delete(imageId)
    }
  }

  async function flushRotation(
    imageId: Id,
    rotation: 0 | 90 | 180 | 270,
  ): Promise<void> {
    const requestId = ++rotationRequestSequence
    isRotatePending = true

    try {
      await imageCtx.handleRotate(rotation, imageId)
      const optimisticRotation = optimisticRotationByImageId[imageId]
      const nextVersion = imageCtx.getImage(imageId)?.image.version ?? null

      if (optimisticRotation) {
        optimisticRotationByImageId = {
          ...optimisticRotationByImageId,
          [imageId]: {
            ...optimisticRotation,
            pendingVersion: nextVersion,
          },
        }
      }

      metadataByImageId = {
        ...metadataByImageId,
        [imageId]: {
          ...(metadataByImageId[imageId] ?? {}),
          rotation,
        },
      }
    } finally {
      rotationTimers.delete(imageId)

      if (requestId === rotationRequestSequence) {
        isRotatePending = false
      }
    }
  }

  async function handleRotate(direction: 'left' | 'right'): Promise<void> {
    if (!activeImage) return

    const imageId = activeImage.image.id
    await ensureMetadataLoadedForImage(imageId)

    const activeItem = items.find(item => item.id === activeId) ?? null
    const activeSrc = activeItem?.src ?? null
    const activeSrcVersion = extractVersionFromUrl(activeSrc)
    const existingOptimisticRotation = optimisticRotationByImageId[imageId]
    const persistedVersion = imageCtx.getImage(imageId)?.image.version ?? null

    if (
      existingOptimisticRotation &&
      activeSrcVersion != null &&
      persistedVersion != null &&
      activeSrcVersion === persistedVersion &&
      activeSrcVersion !== existingOptimisticRotation.version
    ) {
      optimisticRotationByImageId = Object.fromEntries(
        Object.entries(optimisticRotationByImageId).filter(([id]) => id !== imageId),
      ) as typeof optimisticRotationByImageId
    }

    const baseRotation = getSourceBaseRotation(imageId, activeSrc)
    const currentDisplayRotation = getEffectiveRotationForSource(imageId, activeSrc)
    const nextDisplayRotation =
      currentDisplayRotation + (direction === 'left' ? -90 : 90)
    const nextRotation = normalizeRotation(baseRotation + nextDisplayRotation)
    optimisticRotationByImageId = {
      ...optimisticRotationByImageId,
      [imageId]: {
        baseRotation,
        rotation: nextDisplayRotation,
        version: activeImage.image.version ?? null,
        pendingVersion: null,
      },
    }

    const existingTimer = rotationTimers.get(imageId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    rotationTimers.set(
      imageId,
      setTimeout(() => {
        void flushRotation(imageId, nextRotation).catch(error => {
          toast.error('Failed to rotate image')
          console.error('[ImageEditorGalleryModel] Rotate error', { imageId, error })
        })
      }, ROTATION_STEP_MS),
    )
  }

  async function setPresentationMode(nextMode: 'cover' | 'contain'): Promise<void> {
    const currentImage = activeImage?.image ?? null
    const ctx = imageCtx.getCtx()

    if (
      !currentImage?.id ||
      nextMode === (currentImage.presentationMode ?? 'contain')
    ) {
      return
    }

    isPresentationModePending = true

    try {
      await updateImagePresentationMode({
        currentImage,
        nextMode,
        ctx,
        onSuccess: mode => {
          imageCtx.setForImage(currentImage.id, 'presentationMode', mode)
        },
        onFailure: error => {
          console.error('[ImageEditorGalleryModel] Presentation mode update error', {
            imageId: currentImage.id,
            error,
          })
          toast.error('Failed to update image fit mode')
        },
      })
    } finally {
      isPresentationModePending = false
    }
  }

  async function ensureMetadataLoaded(): Promise<void> {
    const imageId = activeImage?.image.id

    if (!imageId) {
      return
    }

    await ensureMetadataLoadedForImage(imageId)
  }

  function markThumbnailLoaded(item: ViewerRenderable): void {
    if (item.status?.kind !== 'persisted' && item.status?.kind !== 'finalized-upload') {
      return
    }

    const imageId = getGalleryItemThumbnailStatusId(item.id, items) ?? item.id
    imageCtx.setThumbnailLoadStatus(imageId, 'loaded')
  }

  function markThumbnailErrored(item: ViewerRenderable): void {
    if (item.status?.kind !== 'persisted' && item.status?.kind !== 'finalized-upload') {
      return
    }

    const imageId = getGalleryItemThumbnailStatusId(item.id, items) ?? item.id
    imageCtx.setThumbnailLoadStatus(imageId, 'error')
  }

  function markCurrentItemLoaded(item: ViewerRenderable): void {
    const imageId = getGalleryItemTargetImageId(item.id, items) ?? item.id
    imageCtx.setLoadStatus(imageId, 'loaded')
    const optimisticRotation = optimisticRotationByImageId[imageId]

    if (!optimisticRotation) {
      return
    }

    const loadedVersion =
      extractVersionFromUrl(item.src) ??
      extractVersionFromUrl(item.sourceFallbackSrc) ??
      null

    if (loadedVersion !== optimisticRotation.pendingVersion) {
      return
    }

    optimisticRotationByImageId = Object.fromEntries(
      Object.entries(optimisticRotationByImageId).filter(([id]) => id !== imageId),
    ) as typeof optimisticRotationByImageId
  }

  onDestroy(() => {
    metadataRequests.clear()
    for (const timer of rotationTimers.values()) {
      clearTimeout(timer)
    }
    rotationTimers.clear()
  })

  return {
    state: {
      get items() {
        return items
      },
      get activeId() {
        return activeId
      },
      get activeImage() {
        return activeImage
      },
      get isProcessingUploads() {
        return isProcessingUploads
      },
      get isUploadBusy() {
        return isUploadBusy
      },
      get isPublished() {
        return isPublished
      },
      get presentationMode() {
        return presentationMode
      },
      get canMutateActiveImage() {
        return canMutateActiveImage
      },
      get canRotateActiveImage() {
        return canRotateActiveImage
      },
      get canReplaceActiveImage() {
        return canReplaceActiveImage
      },
      get canDownloadActiveImage() {
        return canDownloadActiveImage
      },
      get isRotatePending() {
        return isRotatePending || isPresentationModePending
      },
      get metadata() {
        return metadata
      },
      get isMetadataLoading() {
        return isMetadataLoading
      },
      get hasLoadedMetadata() {
        return hasLoadedMetadata
      },
    },
    status: {
      isLoading(item: ViewerRenderable): boolean {
        const imageId = getGalleryItemThumbnailStatusId(item.id, items) ?? item.id
        return imageCtx.getThumbnailLoadStatus(imageId) === 'loading'
      },
      isUploading(item: ViewerRenderable): boolean {
        return (
          item.status?.uploadStatus === 'uploading' ||
          item.status?.uploadStatus === 'finalizing' ||
          imageCtx.isImageBeingReplaced(item.id, 'uploading') ||
          imageCtx.isImageBeingReplaced(item.id, 'finalizing')
        )
      },
    },
    actions: {
      select(id: string | null): void {
        imageCtx.targetItem(id)
      },
      addFiles,
      replaceFiles,
      async deleteItem(item: ViewerRenderable): Promise<void> {
        const imageId = getGalleryItemTargetImageId(item.id, items) ?? item.id
        await imageCtx.delete(imageId, imageCtx.getCtx())
      },
      retryUpload(item: ViewerRenderable): void {
        const upload = imageCtx
          .getUploadQueue()
          .find(candidate => candidate.optimisticKey === item.id)

        if (!upload) return

        imageCtx.targetItem(item.id)
        imageCtx.retryUpload(upload)
      },
      async setIntent(imageId: string, intent: Intent): Promise<void> {
        await imageCtx.handleSetIntent(imageId, intent)
      },
      async rotateLeft(): Promise<void> {
        await handleRotate('left')
      },
      async rotateRight(): Promise<void> {
        await handleRotate('right')
      },
      togglePublished(): void {
        void imageCtx.handlePublishToggle()
      },
      setPresentationMode,
      downloadActive(): void {
        if (!activeImage) return
        void imageCtx.downloadImage(new MouseEvent('click'), activeImage)
      },
      markThumbnailLoaded,
      markThumbnailErrored,
      markCurrentItemLoaded,
      ensureMetadataLoaded,
    },
  }
}
