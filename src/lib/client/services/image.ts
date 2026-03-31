// SVELTE
import { error } from '@sveltejs/kit'
// I18N
import { m } from '$lib/i18n'
// IMAGE
import { toCloudflareImageWorkerPath } from '$lib/images/delivery'
import {
  extractImageUploadMetadata,
  type ExtractedImageUploadMetadata,
} from '$lib/images/metadata'
import { normalizeUploadFileForAssetPipeline } from '$lib/images/upload'
// UTILS
import { resolveAppStage } from '$lib'
// SERVICES
import { adminIntentOrder, intentOrder } from '$lib/api/services/image'
// REMOTE
import {
  authImageUpload as authImageUploadRemote,
  finalizeImageUpload as finalizeImageUploadRemote,
  updateImage as updateImageRemote,
} from '$lib/api/server/image.remote'
// NAVIGATION
import { getUrlForResource } from '$lib/navigation'
import type { OrganisationGetState } from '$lib/db/zod/schema/organisation.types'
import type { ProjectGetState } from '$lib/db/zod/schema/project.types'
import type { HubGetState } from '$lib/db/zod/schema/hub.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
// ENUMS
import { FirstClassResource, ImageContextResource } from '$lib/enums'
// TYPES
import type { AdminCtx } from '$lib/context/admin.svelte'
import type {
  Id,
  ImageCtxConstructorOptions,
  NormalizedImageUploadAsset,
} from '$lib/types'
import type {
  GalleryObjectFit,
  ViewerRenderable,
  ViewerRenderableStatus,
} from '$lib/bits/patterns/images/images.types'
import type {
  Image,
  ImageContextEnvelope,
  ImageCtxEnvelope,
  ImageUploadCtx,
  Intent,
  ImageEditCtx,
  ImageDBFlat,
  ImageDBBasic,
  ImageNew,
  ImageMetadataBasic,
} from '$lib/db/zod/schema/image.types'
// CONTEXT
import type { ImageCtx } from '$lib/context/image.svelte'
import { hashicon } from '@emeraldpay/hashicon'

type FeatureImageProviderOrganisation = {
  id?: string | null
  code?: string | null
}

type FeatureImageProviderProject = {
  id?: string | null
  organisationId?: string | null
  code?: string | null
}

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ORCHESTRATION
//    - uploadAndProcessImage
//
// 3. DELIVERY
//    - getURLfromImage
//
// 4. EXTENSIONS
//    - extendFeatureImage
//    - extendImageWithResource
//
// 5. METADATA
//    - getCoordinatesFromMetadata
//    - getCapturedAtFromMetadata
//    - getCameraFromMetadata
//    - getCreditFromMetadata
//
// 6. UTILS
//    - sortImages
//    - getHashiconUrl
//    - getImageSrcOrHashicon
//    - getFeatureImagesFacetHref
//    - getSafeImageUrl
//    - getFeatureImageProviderOptions
//    - updateImagePresentationMode
//    - setOrganisationImagePresentationMode
//

// ═══════════════════════
// 1. ORCHESTRATION
// ═══════════════════════

/**
 * Prepares an upload by normalizing the file, building metadata, and requesting an upload session.
 *
 * @param file The file to upload.
 * @param uploadCtx Context for the upload (resource type, ID, org, project, imageToReplace).
 * @param extendedFeatureInfo Optional info for feature images (publish status, intent).
 * @returns Prepared upload payload that can be PUT to R2 and later finalized.
 */
export async function prepareImageUpload(
  file: File,
  uploadCtx: ImageUploadCtx,
  extendedFeatureInfo?: {
    isPublished: boolean
    intent: Intent
  },
): Promise<{
  uploadLabel: string
  uploadStartTime: number
  authCompletedAt: number
  normalizedUpload: NormalizedImageUploadAsset
  metadata: ImageMetadataBasic & { metadata?: Record<string, string> | null }
  auth: Awaited<ReturnType<typeof authImageUploadRemote>>
  isAdminRequest: boolean
  persist: {
    featureImage?: {
      featureId: string
      intent: Intent
      isPublished: boolean
    }
    links?: NonNullable<ImageUploadCtx['links']>
  }
}> {
  const now = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  const uploadStartTime = now()
  const uploadLabel = `${file.name}:${file.size}:${file.lastModified}`
  const extractedMetadata = await extractImageUploadMetadata(file)
  const normalizedUpload = await normalizeUploadFileForAssetPipeline(file)
  const metadata = await buildBasicMetadataDocument(normalizedUpload, extractedMetadata)
  const env = toImageEnv()
  const isAdminRequest = uploadCtx.isAdminRequest ?? true
  const featureImage =
    uploadCtx.ctxType === 'feature'
      ? {
          featureId: uploadCtx.imageToReplace?.ctxId ?? uploadCtx.ctxId,
          intent:
            uploadCtx.imageToReplace?.intent ??
            extendedFeatureInfo?.intent ??
            'undefined',
          isPublished:
            uploadCtx.imageToReplace?.isPublished ??
            extendedFeatureInfo?.isPublished ??
            false,
        }
      : undefined
  const auth = await authImageUploadRemote({
    cdn: 'cloudflareR2',
    env,
    ctxType: uploadCtx.ctxType,
    ctxId: uploadCtx.ctxId,
    organisationId: uploadCtx.organisation?.id ?? undefined,
    projectId: uploadCtx.project?.id ?? undefined,
    filename: normalizedUpload.file.name,
    contentType: normalizedUpload.file.type || 'application/octet-stream',
    size: normalizedUpload.file.size,
    replaceImageId: uploadCtx.imageToReplace?.image.id ?? undefined,
    meta: { isAdminRequest },
  })
  const authAt = now()

  return {
    uploadLabel,
    uploadStartTime,
    authCompletedAt: authAt,
    normalizedUpload,
    metadata,
    auth,
    isAdminRequest,
    persist: {
      ...(uploadCtx.imageToReplace?.image.contributorId
        ? { contributorId: uploadCtx.imageToReplace.image.contributorId }
        : {}),
      ...(featureImage ? { featureImage } : {}),
      ...(uploadCtx.links?.length ? { links: uploadCtx.links } : {}),
    },
  }
}

/**
 * Uploads a prepared image object to the signed R2 destination.
 *
 * @param preparedUpload Prepared upload session returned by `prepareImageUpload`.
 * @param fetchFn Fetch implementation to use for the signed PUT request.
 * @returns Resolves when the object upload completes successfully.
 */
export async function uploadPreparedImageObject(
  preparedUpload: Awaited<ReturnType<typeof prepareImageUpload>>,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const uploadResponse = await fetchFn(preparedUpload.auth.uploadUrl, {
    method: preparedUpload.auth.method,
    headers: preparedUpload.auth.headers,
    body: preparedUpload.normalizedUpload.file,
  })
  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed: ${uploadResponse.statusText}`)
  }
}

/**
 * Finalizes a prepared upload by persisting image metadata and context links in the backend.
 *
 * @param preparedUpload Prepared upload session returned by `prepareImageUpload`.
 * @returns Persisted image envelope.
 * @remarks Retries transient local D1 lock failures before surfacing an error.
 */
export async function finalizePreparedImageUpload(
  preparedUpload: Awaited<ReturnType<typeof prepareImageUpload>>,
): Promise<ImageCtxEnvelope> {
  const now = (): number =>
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  const retryAttempts = 4
  const retryBaseDelayMs = 180

  for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
    try {
      const savedImage = await finalizeImageUploadRemote({
        token: preparedUpload.auth.confirmToken,
        metadata: preparedUpload.metadata,
        persist: preparedUpload.persist,
        meta: { isAdminRequest: preparedUpload.isAdminRequest },
      })
      if (!savedImage?.data) {
        throw new Error('Failed to persist finalized image in backend')
      }

      return savedImage.data as ImageCtxEnvelope
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      const isRetryableLockError =
        message.includes('SQLITE_BUSY') ||
        message.includes('database is locked') ||
        message.includes('internal error; reference =')

      if (!isRetryableLockError || attempt === retryAttempts - 1) {
        throw error
      }

      const retryDelayMs = retryBaseDelayMs * (attempt + 1)
      await new Promise(resolve => setTimeout(resolve, retryDelayMs))
    }
  }

  throw new Error('Failed to persist finalized image in backend')
}

/**
 * Orchestrates the full image upload process against the current R2-backed image service.
 * This function does NOT handle frontend state updates (e.g., upload queue status, image list updates).
 *
 * @param file The file to upload.
 * @param uploadCtx Context for the upload (resource type, ID, org, project, imageToReplace).
 * @param extendedFeatureInfo Optional info for feature images (publish status, intent).
 * @param fetchFn Fetch implementation to use for the signed PUT request.
 * @param options Lifecycle hooks for object-upload completion.
 * @returns The saved/updated image data from the backend.
 */
export async function uploadAndProcessImage(
  file: File,
  uploadCtx: ImageUploadCtx,
  extendedFeatureInfo?: {
    isPublished: boolean
    intent: Intent
  },
  fetchFn: typeof fetch = fetch,
  options: {
    onObjectUploaded?: () => void
  } = {},
): Promise<ImageCtxEnvelope> {
  const preparedUpload = await prepareImageUpload(file, uploadCtx, extendedFeatureInfo)
  await uploadPreparedImageObject(preparedUpload, fetchFn)
  options.onObjectUploaded?.()
  return finalizePreparedImageUpload(preparedUpload)
}

// ═══════════════════════
// 3. UPLOAD / URL UTILS
// ═══════════════════════

const DEFAULT_PUBLIC_ASSET_BASE_URL = 'https://assets.hype.hk'

const resolveConfiguredPublicAssetBaseUrl = (): string =>
  import.meta.env.PUBLIC_ASSET_BASE_URL || ''

const resolvePublicAssetBaseUrl = (): string => {
  const configuredBaseUrl = resolveConfiguredPublicAssetBaseUrl()
  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  if (typeof window === 'undefined') {
    return DEFAULT_PUBLIC_ASSET_BASE_URL
  }

  return DEFAULT_PUBLIC_ASSET_BASE_URL
}

const toImageEnv = (): 'local' | 'preview' | 'production' =>
  resolveAppStage(resolvePublicAssetBaseUrl())

export async function buildBasicMetadataDocument(
  normalizedUpload: NormalizedImageUploadAsset,
  extractedMetadata: ExtractedImageUploadMetadata,
): Promise<ImageMetadataBasic & { metadata?: Record<string, string> | null }> {
  const metadataEntries: Record<string, string> = {}

  if (normalizedUpload.uploadedWidth !== null) {
    metadataEntries.uploadedWidth = String(normalizedUpload.uploadedWidth)
  }
  if (normalizedUpload.uploadedHeight !== null) {
    metadataEntries.uploadedHeight = String(normalizedUpload.uploadedHeight)
  }
  if (normalizedUpload.wasResized) {
    metadataEntries.clientResizeApplied = 'true'
    metadataEntries.clientResizeMaxDimension = '2048'
  }
  if (extractedMetadata.editorTool) {
    metadataEntries.editorTool = extractedMetadata.editorTool
  }

  return {
    originalFilename: normalizedUpload.originalFilename,
    originalExtension: normalizedUpload.originalExtension,
    originalWidth: normalizedUpload.originalWidth,
    originalHeight: normalizedUpload.originalHeight,
    rotation: 0,
    cameraModel: extractedMetadata.cameraModel,
    capturedAt: extractedMetadata.capturedAt,
    credit: extractedMetadata.credit,
    latitude: extractedMetadata.latitude,
    longitude: extractedMetadata.longitude,
    metadata: Object.keys(metadataEntries).length > 0 ? metadataEntries : null,
  }
}

/**
 * Preloads an image URL and waits for decode when supported so later swaps paint cleanly.
 *
 * @param url Image URL to preload.
 * @returns Resolves once the URL is paintable, rejects on a real image load failure.
 */
export async function preloadImageUrl(url: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = async () => {
      try {
        if (typeof image.decode === 'function') {
          await image.decode()
        }
      } catch {
        // Firefox can reject decode() even when the image is already paintable.
      }
      resolve()
    }
    image.onerror = event => reject(event)
    image.src = url
  })
}

/**
 * Waits for the server to confirm that the warmed admin thumbnail is available.
 *
 * @param params Image identifier inputs.
 * @returns `true` when the thumbnail-ready event arrives before timeout, else `false`.
 */
export async function waitForThumbnailReadyEvent(params: {
  publicId: string
  version?: number | null
  timeoutMs?: number
}): Promise<boolean> {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return false
  }

  const searchParams = new URLSearchParams({ publicId: params.publicId })

  if (typeof params.version === 'number') {
    searchParams.set('version', String(params.version))
  }

  const url = `/api/images/thumbnail-ready?${searchParams.toString()}`

  return await new Promise<boolean>(resolve => {
    const eventSource = new EventSource(url)
    let settled = false

    const settle = (value: boolean): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      eventSource.close()
      resolve(value)
    }

    const timeoutId = window.setTimeout(() => {
      settle(false)
    }, params.timeoutMs ?? 20_000)

    eventSource.addEventListener('thumbnail-ready', () => {
      settle(true)
    })
    eventSource.addEventListener('thumbnail-timeout', () => {
      settle(false)
    })
    eventSource.onerror = () => {
      settle(false)
    }
  })
}

/**
 * Sorts gallery items so unpublished/no-intent uploads stay prominent while preserving
 * the existing editorial intent ordering for persisted images.
 *
 * @param itemsToSort Gallery items to sort for the editor rail.
 * @returns Sorted gallery items.
 */
export function sortGalleryItems(itemsToSort: ViewerRenderable[]): ViewerRenderable[] {
  return [...itemsToSort].sort((a, b) => {
    const aIsUnpublishedNoIntent =
      !a.isPublished && (!a.intent || a.intent === 'undefined')
    const bIsUnpublishedNoIntent =
      !b.isPublished && (!b.intent || b.intent === 'undefined')

    if (aIsUnpublishedNoIntent && !bIsUnpublishedNoIntent) return -1
    if (!aIsUnpublishedNoIntent && bIsUnpublishedNoIntent) return 1

    if (a.isPublished !== b.isPublished) {
      return a.isPublished ? -1 : 1
    }

    const intentOrder = [
      'undefined',
      'canonical',
      'general',
      'context',
      'research',
      'closeUp',
    ] as const
    const aIntent = intentOrder.indexOf(
      (a.intent ?? 'undefined') as (typeof intentOrder)[number],
    )
    const bIntent = intentOrder.indexOf(
      (b.intent ?? 'undefined') as (typeof intentOrder)[number],
    )

    if (aIntent !== bIntent) {
      return aIntent - bIntent
    }

    return (
      new Date(String(b.status?.sortCreatedAt ?? '')).getTime() -
      new Date(String(a.status?.sortCreatedAt ?? '')).getTime()
    )
  })
}

function getViewerRenderableStatus(
  item: ViewerRenderable | null | undefined,
): ViewerRenderableStatus | null {
  return item?.status ?? null
}

/**
 * Resolves the persisted image id carried on an optimistic gallery row, if one exists.
 *
 * @param item Gallery item to inspect.
 * @returns Saved image id or `null`.
 */
export function getGalleryItemSavedImageId(
  item: ViewerRenderable | null | undefined,
): string | null {
  return getViewerRenderableStatus(item)?.savedImageId ?? null
}

/**
 * Resolves the image id used for metadata/edit actions when the visible gallery row may still
 * be the optimistic upload wrapper.
 *
 * @param itemId Current gallery item id.
 * @param items Gallery items available in the editor.
 * @returns Persisted image id when available, otherwise `null`.
 */
export function getGalleryItemTargetImageId(
  itemId: string | null | undefined,
  items: ViewerRenderable[],
): string | null {
  if (!itemId) return null

  const item = items.find(candidate => candidate.id === itemId)
  if (!item) return null

  return getGalleryItemSavedImageId(item) ?? item.id
}

/**
 * Resolves the thumbnail load-status key for a gallery row, preferring the persisted image id
 * once an optimistic upload has been promoted.
 *
 * @param itemId Current gallery item id.
 * @param items Gallery items available in the editor.
 * @returns Image id used for thumbnail load tracking.
 */
export function getGalleryItemThumbnailStatusId(
  itemId: string | null | undefined,
  items: ViewerRenderable[],
): string | null {
  if (!itemId) return null

  const item = items.find(candidate => candidate.id === itemId)
  if (!item) return itemId

  return getGalleryItemSavedImageId(item) ?? itemId
}

/**
 * Builds a stable viewer scene key so optimistic and finalized versions of the same image can
 * reuse the scene when a render key is available.
 *
 * @param item Current viewer item.
 * @param selectedId Current selection id.
 * @returns Stable scene key or `null`.
 */
export function getGallerySceneKey(
  item: ViewerRenderable | null,
  selectedId: string | null,
): string | null {
  if (!item) return null
  return item.renderKey ?? selectedId ?? item.id
}

/**
 * Resolves the blurred backdrop source for a viewer/gallery item.
 *
 * @param item Current gallery item.
 * @returns Backdrop image source or `null`.
 */
export function getGalleryBackgroundSrc(item: ViewerRenderable | null): string | null {
  if (!item) return null
  return item.blurSrc ?? item.sourceFallbackSrc ?? item.src ?? null
}

/**
 * Resolves the primary foreground source for a viewer/gallery item.
 *
 * @param item Current gallery item.
 * @returns Foreground source.
 */
export function getGalleryForegroundSrc(item: ViewerRenderable | null): string {
  return (
    item?.src ??
    item?.sourceFallbackSrc ??
    getFeatureIdenticonUrl(item?.fallbackSeed ?? item?.id ?? 'gallery-fallback')
  )
}

/**
 * Builds the inline rotation style used for viewer-stage foreground images.
 *
 * @param item Current gallery item.
 * @returns Inline transform style or `undefined`.
 */
export function getGalleryForegroundRotationStyle(
  item: ViewerRenderable | null,
): string | undefined {
  const rotationDegrees = item?.rotationDegrees ?? 0
  return rotationDegrees !== 0 ? `transform: rotate(${rotationDegrees}deg);` : undefined
}

/**
 * Determines whether the viewer can render the scene directly without using the image-surface
 * source transition layer.
 *
 * @param item Current gallery item.
 * @returns `true` when the direct viewer scene is appropriate.
 */
export function shouldUseDirectGalleryScene(item: ViewerRenderable | null): boolean {
  const hasUploadStatus = Boolean(getViewerRenderableStatus(item)?.uploadStatus)
  const forceSourceTransition = item?.meta?.forceSourceTransition === true

  return (
    !forceSourceTransition &&
    (hasUploadStatus || !item?.sourceFallbackSrc || item.sourceFallbackSrc === item.src)
  )
}

/**
 * Lists the image URLs that must be ready before a viewer scene crossfade can start.
 *
 * @param item Current gallery item.
 * @param fitMode Viewer fit mode.
 * @returns Unique scene asset URLs.
 */
export function buildGallerySceneAssetUrls(
  item: ViewerRenderable | null,
  fitMode: GalleryObjectFit,
): string[] {
  if (!item) return []

  const urls = new Set<string>()
  const foregroundSrc = getGalleryForegroundSrc(item)
  if (foregroundSrc) {
    urls.add(foregroundSrc)
  }

  if (fitMode === 'fit') {
    const backgroundSrc = getGalleryBackgroundSrc(item)
    if (backgroundSrc) {
      urls.add(backgroundSrc)
    }
  }

  return Array.from(urls)
}

/**
 * Generates a URL for an image backed by the current image service.
 * @remarks
 * - If the image has a preview URL, return the preview URL.
 * - If the image has a CDN, return the URL from the CDN.
 * - If the image has no CDN, throw an error.
 * @param opts - Options for generating the URL.
 * @param opts.image - The image data.
 * @param opts.transformation - The transformation to apply to the image.
 * @param opts.raw - Whether to return the normalized intermediate image URL.
 * @returns The generated URL string.
 */
export function getURLfromImage(opts: {
  image: ImageContextEnvelope | ImageCtxEnvelope
  transformation?: string
  raw?: boolean
  rawTransformation?: string | null
  gravity?: string
  quality?: string
  format?: string
}): string {
  const {
    image: inputImage,
    transformation = 'c_fit,h_1024,w_1024',
    rawTransformation,
    gravity = 'auto',
    format = 'auto',
    quality = 'auto',
    raw = false,
  } = opts

  if (!inputImage || typeof inputImage !== 'object' || !('image' in inputImage)) {
    throw error(404, 'Deprecated image payload: expected image envelope')
  }

  const image = inputImage.image

  // Handle staged images with preview URLs
  if ('preview' in image && typeof image.preview === 'string' && image.preview) {
    return image.preview
  }

  if (image.cdn === 'cloudflareR2') {
    const imageBaseUrl = resolvePublicAssetBaseUrl()

    return `${imageBaseUrl}${toCloudflareImageWorkerPath({
      publicId: image.publicId,
      version: image.version,
      raw,
      rawTransformation,
      transformation,
      gravity,
      quality,
      format,
    })}`
  }

  throw error(404, `Image CDN <code>${image.cdn}</code> not supported`)
}

/**
 * Safely resolves a display URL from mixed image payload shapes.
 * Accepts plain URL strings, image envelopes, or bare image objects.
 */
export function getImageSrc(
  input: unknown,
  options: { transformation?: string } = {},
): string | null {
  if (!input) return null
  if (typeof input === 'string') return input

  const transformation = options.transformation ?? 'c_fill,h_256,w_256'

  try {
    const imageEnvelope =
      input && typeof input === 'object' && 'image' in input
        ? (input as ImageContextEnvelope | ImageCtxEnvelope)
        : ({
            image: input,
          } as ImageContextEnvelope)

    return getURLfromImage({
      image: imageEnvelope,
      transformation,
    })
  } catch {
    return null
  }
}

export function getImageSrcOrHashicon(
  input: unknown,
  fallbackId: string,
  options: { transformation?: string; hashiconSize?: number } = {},
): string | null {
  const imageSrc = getImageSrc(input, {
    transformation: options.transformation,
  })
  if (imageSrc) return imageSrc
  if (!fallbackId) return null
  return getHashiconUrl(fallbackId, options.hashiconSize)
}

/**
 * Resolves the admin images facet URL for a feature when the feature id is known.
 *
 * @param adminCtx Admin context used to resolve resource URLs.
 * @param featureId Feature id to target.
 * @returns The images facet URL or `undefined` when the feature id is unavailable.
 */
export function getFeatureImagesFacetHref(
  adminCtx: AdminCtx,
  featureId?: Id | null,
): string | undefined {
  if (!featureId) return undefined

  return (
    getUrlForResource(adminCtx, FirstClassResource.feature, featureId, 'images') ??
    undefined
  )
}

/**
 * Safely resolves a display URL for an image envelope.
 *
 * @param image Image envelope to resolve.
 * @returns The resolved URL or `null` when no image is available or URL generation fails.
 */
export function getSafeImageUrl(
  image: ImageCtxEnvelope | null | undefined,
): string | null {
  if (!image) return null

  try {
    return getURLfromImage({ image })
  } catch {
    return null
  }
}

/**
 * Builds image-provider options for the admin feature editor.
 *
 * @param params Feature image provider inputs.
 * @returns Normalized image-provider options for the feature editor provider.
 */
export function getFeatureImageProviderOptions(params: {
  featureRef: string
  isNewFeatureRef: boolean
  feature: Feature | null | undefined
  organisation: FeatureImageProviderOrganisation | null
  project: FeatureImageProviderProject | null
}): ImageCtxConstructorOptions {
  const { featureRef, isNewFeatureRef, feature, organisation, project } = params
  const isValid =
    !isNewFeatureRef &&
    feature?.id === featureRef &&
    Boolean(organisation?.id) &&
    Boolean(project?.id)

  return {
    isAdminMode: true,
    isValid,
    image: isValid ? ((feature?.image as ImageCtxEnvelope | null) ?? null) : undefined,
    images: isValid
      ? ((feature?.images as ImageCtxEnvelope[] | null) ?? null)
      : undefined,
    context:
      isValid && feature && organisation && project
        ? ({
            ctxType: ImageContextResource.feature,
            ctxId: feature.id as Id,
            organisation: {
              id: organisation.id,
              code: organisation.code,
            },
            project: {
              id: project.id,
              organisationId: project.organisationId,
              code: project.code,
            },
          } as never)
        : undefined,
  }
}

// ═══════════════════════
// 5. EXTENSIONS
// ═══════════════════════

/**
 * Extends the image data with feature image information.
 * @param image - The image data to extend.
 * @param ctx - The upload context containing resource type, entity, organisation, project, and imageToReplace.
 * @param extended - Optional extended information for feature image.
 * @returns The extended image data.
 */
export function extendFeatureImage(
  image: Partial<ImageNew>,
  ctx: ImageUploadCtx,
  extended?: {
    featureImage?: {
      isPublished: boolean
      intent: string
    }
  },
) {
  if (ctx.ctxType === 'feature') {
    image.featureImage = {
      featureId: ctx.imageToReplace ? ctx.imageToReplace.ctxId : ctx.ctxId,
      intent: ctx.imageToReplace
        ? (ctx.imageToReplace.intent ?? extended?.featureImage?.intent ?? 'undefined')
        : (extended?.featureImage?.intent ?? 'undefined'),
      isPublished: ctx.imageToReplace
        ? (ctx.imageToReplace.isPublished ??
          extended?.featureImage?.isPublished ??
          false)
        : (extended?.featureImage?.isPublished ?? false),
    }
  }
}

/**
 * Extends the image data with resource information.
 * @param image - The image data to extend.
 * @param ctx - The upload context containing resource type, entity, organisation, project, and imageToReplace.
 * @returns The extended image data.
 */
export function extendImageWithResource(image: Partial<ImageNew>, ctx: ImageUploadCtx) {
  if (
    Object.values(ImageContextResource).includes(ctx.ctxType as ImageContextResource)
  ) {
    image.ctxType = ctx.ctxType as ImageContextResource
    image.ctxId = ctx.ctxId
  }
}

// ═══════════════════════
// 6. METADATA
// ═══════════════════════

// ═══════════════════════
// 7. UTILS
// ═══════════════════════

export function sortImages(images: Image[] | ImageDBFlat[], isAdmin: boolean = false) {
  const intentOrderToUse = isAdmin ? adminIntentOrder : intentOrder
  const sortedImages = images.sort((a, b) => {
    if (isAdmin) {
      // Priority 1: Unpublished with no intent (undefined) come first
      const aIsUnpublishedNoIntent =
        !a.isPublished && (!a.intent || a.intent === 'undefined')
      const bIsUnpublishedNoIntent =
        !b.isPublished && (!b.intent || b.intent === 'undefined')

      if (aIsUnpublishedNoIntent && !bIsUnpublishedNoIntent) return -1
      if (!aIsUnpublishedNoIntent && bIsUnpublishedNoIntent) return 1

      // Priority 2: Published vs unpublished (published first among remaining)
      if (a.isPublished !== b.isPublished) {
        return a.isPublished ? -1 : 1
      }
    }
    // Priority 3: Intent order within same publish status
    if (a.intent && b.intent) {
      const intentCompare =
        intentOrderToUse.indexOf(a.intent as Intent) -
        intentOrderToUse.indexOf(b.intent as Intent)
      if (intentCompare !== 0) {
        return intentCompare
      }
    }

    // Priority 4: Creation date (newest first)
    return (
      new Date(b.createdAt as string).getTime() -
      new Date(a.createdAt as string).getTime()
    )
  })

  return sortedImages
}

// Generate hashicon URL for fallback
export function getHashiconUrl(id: string, size: number = 256): string {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  hashicon(id, { size, createCanvas: () => canvas })
  return canvas.toDataURL()
}

function hashString(value: string): number {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export function getFeatureIdenticonUrl(seed: string): string {
  const hash = hashString(seed)
  const palette = ['#1f6b5f', '#2e6fbb', '#b86b2b', '#7f4fa5', '#c44d5d']
  const backgroundPalette = ['#f4efe6', '#ecf4f2', '#eef3f8', '#f5eef8', '#f8eeef']
  const foreground = palette[hash % palette.length]
  const background = backgroundPalette[(hash >>> 3) % backgroundPalette.length]
  const gridSize = 5
  const cellSize = 10
  const offset = 7
  const cells: string[] = []

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < Math.ceil(gridSize / 2); column += 1) {
      const bitIndex = row * Math.ceil(gridSize / 2) + column
      const isFilled = ((hash >>> (bitIndex % 24)) & 1) === 1
      if (!isFilled) continue

      const mirroredColumn = gridSize - 1 - column
      const x = offset + column * cellSize
      const y = offset + row * cellSize
      cells.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${foreground}"/>`,
      )

      if (mirroredColumn !== column) {
        cells.push(
          `<rect x="${offset + mirroredColumn * cellSize}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${foreground}"/>`,
        )
      }
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none"><rect width="64" height="64" rx="12" fill="${background}"/><rect x="4" y="4" width="56" height="56" rx="10" fill="rgba(255,255,255,0.38)"/>${cells.join('')}</svg>`

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}

/**
 * Updates an image presentation mode with optional context inference from `imageCtx`.
 *
 * @param options.currentImage Explicit image target. Falls back to `imageCtx.activeImage`.
 * @param options.nextChecked Switch-like checked value. Used only when `nextMode` is not provided.
 * @param options.nextMode Explicit target mode (`cover` or `contain`).
 * @param options.ctx Explicit image edit context. Falls back to `imageCtx.getCtx()`.
 * @param options.imageCtx Image context used to infer `currentImage` and `ctx` when omitted.
 * @param options.onSuccess Callback invoked after a successful update.
 * @param options.onFailure Callback invoked when the update request fails.
 * @returns `true` when a backend update ran successfully, otherwise `false`.
 * @remarks If required inputs are missing, or the target mode matches current mode, the function no-ops and returns `false`.
 */
export async function updateImagePresentationMode(options: {
  currentImage?: Pick<Image, 'id' | 'presentationMode'> | ImageDBBasic | null
  nextChecked?: boolean | null
  nextMode?: 'cover' | 'contain'
  ctx?: ImageEditCtx
  imageCtx?: ImageCtx | null
  onSuccess?: (nextMode: 'cover' | 'contain') => void
  onFailure?: (error: unknown) => void
}): Promise<boolean> {
  const currentImageFromCtx = options.imageCtx?.activeImage?.image ?? null
  const currentImage = options.currentImage ?? currentImageFromCtx ?? null
  if (!currentImage?.id) return false

  const nextMode =
    options.nextMode ??
    (options.nextChecked === null || options.nextChecked === undefined
      ? undefined
      : options.nextChecked
        ? 'cover'
        : 'contain')

  const currentMode = currentImage.presentationMode ?? 'contain'
  if (!nextMode) return false
  if (nextMode === currentMode) return false

  let ctx = options.ctx
  if (!ctx && options.imageCtx) {
    try {
      ctx = options.imageCtx.getCtx()
    } catch {
      ctx = undefined
    }
  }
  if (!ctx?.ctxType || !ctx?.ctxId) return false

  try {
    await updateImageRemote({
      id: currentImage.id,
      ctxType: ctx.ctxType,
      ctxId: ctx.ctxId,
      data: { presentationMode: nextMode },
      meta: { isAdminRequest: true },
    })
    options.onSuccess?.(nextMode)
    return true
  } catch (error) {
    options.onFailure?.(error)
    return false
  }
}

/**
 * Mutates an organisation response state in place to update image presentation mode.
 * Returns `true` when an image exists and was updated.
 */
export function setEntityImagePresentationMode<
  TState extends {
    data?: {
      image?: {
        image?: {
          presentationMode?: 'cover' | 'contain'
        } | null
      } | null
    } | null
  } | null,
>(state: TState, mode: 'cover' | 'contain'): boolean {
  if (!state?.data?.image?.image) return false
  state.data.image.image.presentationMode = mode
  return true
}

/**
 * Mutates an organisation response state in place to update image presentation mode.
 * Returns `true` when an image exists and was updated.
 */
export function setOrganisationImagePresentationMode(
  state: OrganisationGetState,
  mode: 'cover' | 'contain',
): boolean {
  return setEntityImagePresentationMode(state, mode)
}

/**
 * Mutates a project response state in place to update image presentation mode.
 * Returns `true` when an image exists and was updated.
 */
export function setProjectImagePresentationMode(
  state: ProjectGetState,
  mode: 'cover' | 'contain',
): boolean {
  return setEntityImagePresentationMode(state, mode)
}

/**
 * Mutates a hub response state in place to update image presentation mode.
 * Returns `true` when an image exists and was updated.
 */
export function setHubImagePresentationMode(
  state: HubGetState,
  mode: 'cover' | 'contain',
): boolean {
  return setEntityImagePresentationMode(state, mode)
}

/**
 * Checks if the device has camera access available
 */
export async function checkCameraAvailability() {
  try {
    // Check if MediaDevices API is available
    if (!navigator.mediaDevices?.enumerateDevices) {
      return false
    }

    // Check for video input devices
    const devices = await navigator.mediaDevices.enumerateDevices()
    const hasVideoInput = devices.some(device => device.kind === 'videoinput')

    if (!hasVideoInput) {
      return false
    }

    // Test camera access (will prompt user for permission if needed)
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    })

    // If we get here, camera access is available
    stream.getTracks().forEach(track => {
      track.stop()
    }) // Clean up
    return true
  } catch {
    // Camera access denied or not available
    return false
  }
}

export const intentDisplay: Record<Intent, string> = {
  canonical: m.intent__canonical(),
  closeUp: m.intent__closeUp(),
  context: m.intent__context(),
  general: m.intent__general(),
  research: m.intent__research(),
  undefined: m.intent__undefined(),
}
