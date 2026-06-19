import { useImageEditorGalleryModel } from './useImageEditorGalleryModel.svelte'
import {
  extractVersionFromImageUrl,
  getGalleryItemTargetImageId,
} from '$lib/client/services/image'
import type { ImageCtx } from '$lib/context/image.svelte'
import type { ImageMetadataBasic } from '$lib/db/zod/schema/image.types'
import type { ViewerRenderable } from '$lib/bits/patterns/images'

type EntityImageViewerModel = {
  state: {
    items: ViewerRenderable[]
    activeId: string | null
    activeImage: ImageCtx['activeImage']
    canMutateActiveImage: boolean
    canEditActiveImage: boolean
    canRotateActiveImage: boolean
    canReplaceActiveImage: boolean
    canDeleteActiveImage: boolean
    canDownloadActiveImage: boolean
    presentationMode: 'cover' | 'contain'
    isEditBusy: boolean
    isUploadBusy: boolean
    isMetadataLoading: boolean
    hasLoadedMetadata: boolean
    metadata: ImageMetadataBasic | null
  }
  actions: {
    select: (id: string | null) => void
    addFiles: (files: FileList | File[], fileRejections?: File[]) => Promise<void>
    replaceFiles: (files: FileList | File[], fileRejections?: File[]) => Promise<void>
    rotateLeft: () => Promise<void>
    rotateRight: () => Promise<void>
    deleteActive: () => Promise<void>
    markCurrentItemLoaded: (item: ViewerRenderable) => void
    setPresentationMode: (mode: 'cover' | 'contain') => Promise<void>
    downloadActive: () => void
    ensureMetadataLoaded: () => Promise<void>
  }
}

/**
 * Adapter that narrows the full gallery editor model down to the single-image
 * resource facet contract while preserving upload queue, preview, and metadata state.
 *
 * @param imageCtx Domain image store backing the current resource image facet.
 * @param options Optional callbacks for keeping route-local resource state in sync.
 * @returns Single-image viewer model backed by the shared editor adapter.
 */
export function useEntityImageViewerModel(
  imageCtx: ImageCtx,
  options: {
    onPresentationModeCommitted?: (nextMode: 'cover' | 'contain') => void
  } = {},
): EntityImageViewerModel {
  const galleryModel = useImageEditorGalleryModel(imageCtx)
  const items = $derived.by(() => {
    const allItems = galleryModel.state.items
    if (allItems.length === 0) return [] as ViewerRenderable[]

    const activeImageId = galleryModel.state.activeImage?.image.id ?? null
    if (activeImageId) {
      const exactPersistedItem =
        allItems.find(candidate => candidate.id === activeImageId) ?? null

      if (exactPersistedItem) {
        return [exactPersistedItem]
      }

      const matchingTargetItem =
        allItems.find(
          candidate =>
            getGalleryItemTargetImageId(candidate.id, allItems) === activeImageId,
        ) ?? null

      if (matchingTargetItem) {
        return [matchingTargetItem]
      }
    }

    return [allItems[0]]
  })
  const canEditActiveImage = $derived(Boolean(galleryModel.state.activeImage?.image.id))
  const canMutateActiveImage = $derived.by(() => {
    if (galleryModel.state.canMutateActiveImage) {
      return true
    }

    const activeId = galleryModel.state.activeId
    const activeImage = galleryModel.state.activeImage

    if (!activeId || !activeImage?.image.id) {
      return false
    }

    const activeItem = items.find(candidate => candidate.id === activeId) ?? null

    return (
      Boolean(activeItem?.status?.savedImageId) &&
      activeItem?.status?.uploadStatus === 'uploaded'
    )
  })

  async function addFiles(
    files: FileList | File[],
    fileRejections: File[] = [],
  ): Promise<void> {
    const acceptedFiles = Array.from(files)
    if (!acceptedFiles.length && !fileRejections.length) return
    await imageCtx.handleFilesSelect(acceptedFiles, fileRejections)
  }

  async function replaceFiles(
    files: FileList | File[],
    fileRejections: File[] = [],
  ): Promise<void> {
    const acceptedFiles = Array.from(files)
    const activeImage = galleryModel.state.activeImage
    if (!activeImage) {
      await addFiles(acceptedFiles, fileRejections)
      return
    }

    if (!acceptedFiles.length && !fileRejections.length) return
    await imageCtx.handleFilesSelect(acceptedFiles, fileRejections, {}, activeImage)
  }

  async function setPresentationMode(mode: 'cover' | 'contain'): Promise<void> {
    const previousMode = galleryModel.state.presentationMode

    await galleryModel.actions.setPresentationMode(mode)

    if (previousMode !== mode && galleryModel.state.presentationMode === mode) {
      options.onPresentationModeCommitted?.(mode)
    }
  }

  async function deleteActive(): Promise<void> {
    const activeId = galleryModel.state.activeId
    if (!activeId) return

    const activeItem = items.find(candidate => candidate.id === activeId) ?? null

    if (!activeItem) return

    await galleryModel.actions.deleteItem(activeItem)
  }

  function markCurrentItemLoaded(item: ViewerRenderable): void {
    galleryModel.actions.markCurrentItemLoaded(item)

    const targetImageId =
      getGalleryItemTargetImageId(item.id, items) ??
      galleryModel.state.activeImage?.image.id
    const targetImage = targetImageId ? imageCtx.getImage(targetImageId) : null
    const displayedVersion =
      extractVersionFromImageUrl(item.src) ??
      extractVersionFromImageUrl(item.sourceFallbackSrc) ??
      null
    const persistedVersion = targetImage?.image.version ?? null

    // ResourceViewer has no thumbnail rail, so only satisfy the thumbnail-loaded
    // cleanup gate once the displayed asset is the finalized, versioned image.
    if (
      displayedVersion !== null &&
      persistedVersion !== null &&
      displayedVersion === persistedVersion
    ) {
      galleryModel.actions.markThumbnailLoaded(item)
    }
  }

  return {
    state: {
      get items() {
        return items
      },
      get activeId() {
        return items[0]?.id ?? galleryModel.state.activeId
      },
      get activeImage() {
        return galleryModel.state.activeImage
      },
      get canMutateActiveImage() {
        return canMutateActiveImage
      },
      get canEditActiveImage() {
        return canEditActiveImage
      },
      get canRotateActiveImage() {
        return galleryModel.state.canRotateActiveImage
      },
      get canReplaceActiveImage() {
        return canMutateActiveImage
      },
      get canDeleteActiveImage() {
        return canMutateActiveImage
      },
      get canDownloadActiveImage() {
        return galleryModel.state.canDownloadActiveImage
      },
      get presentationMode() {
        return galleryModel.state.presentationMode
      },
      get isEditBusy() {
        return galleryModel.state.isRotatePending
      },
      get isUploadBusy() {
        return galleryModel.state.isUploadBusy
      },
      get isMetadataLoading() {
        return galleryModel.state.isMetadataLoading
      },
      get hasLoadedMetadata() {
        return galleryModel.state.hasLoadedMetadata
      },
      get metadata() {
        return galleryModel.state.metadata
      },
    },
    actions: {
      select: galleryModel.actions.select,
      addFiles,
      replaceFiles,
      rotateLeft: galleryModel.actions.rotateLeft,
      rotateRight: galleryModel.actions.rotateRight,
      deleteActive,
      markCurrentItemLoaded,
      setPresentationMode,
      downloadActive: galleryModel.actions.downloadActive,
      ensureMetadataLoaded: galleryModel.actions.ensureMetadataLoaded,
    },
  }
}
