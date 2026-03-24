// SVELTE
import { error } from '@sveltejs/kit'
// I18N
import { m } from '$lib/i18n'
// UTILS
import { resolveAppStage } from '$lib'
import {
  getCameraFromMetadata,
  getCapturedAtFromMetadata,
  getCoordinatesFromMetadata,
  getCreditFromMetadata,
} from '$lib/utils/image-metadata'
// SERVICES
import { adminIntentOrder, intentOrder } from '$lib/api/services/image'
// REMOTE
import {
  authImageUpload as authImageUploadRemote,
  createImage as createImageRemote,
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
import type { Id, ImageCtxConstructorOptions } from '$lib/types'
import type {
  Image,
  ImageContextEnvelope,
  ImageCtxEnvelope,
  ImageUploadCtx,
  Intent,
  ImageEditCtx,
  ImageDBFlat,
  ImageDBBasic,
  Metadata,
  LngLat,
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
 * Orchestrates the full image upload process against the current R2-backed image service.
 * This function does NOT handle frontend state updates (e.g., upload queue status, image list updates).
 *
 * @param file The file to upload.
 * @param uploadCtx Context for the upload (resource type, ID, org, project, imageToReplace).
 * @param extendedFeatureInfo Optional info for feature images (publish status, intent).
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
): Promise<ImageCtxEnvelope> {
  const metadata = await buildBasicMetadataDocument(file)
  const env = toImageEnv()
  const auth = await authImageUploadRemote({
    cdn: 'cloudflareR2',
    env,
    ctxType: uploadCtx.ctxType,
    ctxId: uploadCtx.ctxId,
    organisationId: uploadCtx.organisation?.id ?? undefined,
    projectId: uploadCtx.project?.id ?? undefined,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    replaceImageId: uploadCtx.imageToReplace?.image.id ?? undefined,
    meta: { isAdminRequest: true },
  })

  const uploadResponse = await fetchFn(auth.uploadUrl, {
    method: auth.method,
    headers: auth.headers,
    body: file,
  })

  if (!uploadResponse.ok) {
    throw new Error(`Image upload failed: ${uploadResponse.statusText}`)
  }

  const imageData = (await finalizeImageUploadRemote({
    token: auth.confirmToken,
    metadata,
    meta: { isAdminRequest: true },
  })) as Partial<ImageNew>

  extendFeatureImage(
    imageData,
    uploadCtx,
    extendedFeatureInfo ? { featureImage: extendedFeatureInfo } : undefined,
  )
  extendImageWithResource(imageData, uploadCtx)

  if (uploadCtx.imageToReplace) {
    const result = await updateImageRemote({
      id: uploadCtx.imageToReplace.image.id,
      ctxType: uploadCtx.ctxType,
      ctxId: uploadCtx.ctxId,
      data: imageData as Record<string, unknown>,
      meta: { isAdminRequest: true },
    })
    if (!result?.data) {
      throw new Error('Failed to update image in backend')
    }
    return result.data as ImageCtxEnvelope
  }
  const result = await createImageRemote({
    data: imageData as ImageNew,
    meta: { isAdminRequest: true },
  })
  if (!result?.data) {
    throw new Error('Failed to create new image in backend')
  }
  return result.data as ImageCtxEnvelope
}

// ═══════════════════════
// 3. UPLOAD / URL UTILS
// ═══════════════════════

const resolvePublicImageBaseUrl = (): string => {
  const configuredBaseUrl = import.meta.env.PUBLIC_IMAGE_BASE_URL || ''
  if (configuredBaseUrl) {
    return configuredBaseUrl
  }

  if (typeof window === 'undefined') {
    return ''
  }

  const { protocol, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:8788`
  }

  return window.location.origin
}

const toImageEnv = (): 'local' | 'preview' | 'production' =>
  resolveAppStage(resolvePublicImageBaseUrl())

const getImageDimensions = async (
  file: File,
): Promise<{ width: number | null; height: number | null }> =>
  await new Promise(resolve => {
    const objectUrl = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
      })
      URL.revokeObjectURL(objectUrl)
    }

    image.onerror = () => {
      resolve({ width: null, height: null })
      URL.revokeObjectURL(objectUrl)
    }

    image.src = objectUrl
  })

export async function buildBasicMetadataDocument(
  file: File,
): Promise<ImageMetadataBasic & { metadata?: Record<string, string> | null }> {
  const { width, height } = await getImageDimensions(file)
  return {
    originalFilename: file.name,
    originalExtension: file.name.split('.').pop()?.toLowerCase() ?? null,
    originalWidth: width,
    originalHeight: height,
    cameraModel: null,
    capturedAt: null,
    credit: null,
    latitude: null,
    longitude: null,
    metadata: null,
  }
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
 * @param opts.raw - Whether to return the raw image URL.
 * @returns The generated URL string.
 */
export function getURLfromImage(opts: {
  image: ImageContextEnvelope | ImageCtxEnvelope
  transformation?: string
  raw?: boolean
  gravity?: string
  quality?: string
  format?: string
}): string {
  const {
    image: inputImage,
    transformation = 'c_fit,h_1000,w_1000',
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
  if (image.preview) {
    return image.preview
  }

  const baseUrl = resolvePublicImageBaseUrl()
  const finalTransformation = `${transformation}/g_${gravity}/f_${format}/q_${quality}`

  if (image.cdn === 'cloudflareR2') {
    return raw
      ? `${baseUrl}/${image.env}/image/upload/v${image.version}/${image.publicId}`
      : `${baseUrl}/${image.env}/image/upload/${finalTransformation}/v${image.version}/${image.publicId}`
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

  const transformation = options.transformation ?? 'c_fill,h_96,w_96'

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
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
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
