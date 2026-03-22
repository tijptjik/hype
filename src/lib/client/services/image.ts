// SVELTE
import { error } from '@sveltejs/kit'
// I18N
import { m } from '$lib/i18n'
// COORDINATES
import Coordinates from 'coordinate-parser'
// UTILS
import { capitalizeFirstLetter } from '$lib'
// SERVICES
import { adminIntentOrder, intentOrder } from '$lib/api/services/image'
// REMOTE
import {
  createImage as createImageRemote,
  getCloudinarySignature as getCloudinarySignatureRemote,
  updateImage as updateImageRemote,
} from '$lib/api/server/image.remote'
import type { OrganisationGetState } from '$lib/db/zod/schema/organisation.types'
import type { ProjectGetState } from '$lib/db/zod/schema/project.types'
import type { HubGetState } from '$lib/db/zod/schema/hub.types'
// ENUMS
import { ImageContextResource } from '$lib/enums'
// TYPES
import type { ParamsToSign } from '$lib/types'
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
  SignData,
  ImageNew,
} from '$lib/db/zod/schema/image.types'
// CONTEXT
import type { ImageCtx } from '$lib/context/image.svelte'
import { hashicon } from '@emeraldpay/hashicon'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. ORCHESTRATION
//    - uploadAndProcessImage
//
// 3. CLOUDINARY :: API
//    - createCloudinaryImage
//
// 4. CLOUDINARY :: UTILS
//    - getCloudinaryUploadEndpoint
//    - getURLfromImage
//    - getImageFromCloudinaryResponse
//    - getPublicPathCloudinaryImage
//
// 5. EXTENSIONS
//    - extendFeatureImage
//    - extendImageWithResource
//
// 6. METADATA
//    - getCoordinatesFromMetadata
//    - getCapturedAtFromMetadata
//    - getCameraFromMetadata
//    - getCreditFromMetadata
//
// 7. UTILS
//    - sortImages
//    - getHashiconUrl
//    - getImageSrcOrHashicon
//    - updateImagePresentationMode
//    - setOrganisationImagePresentationMode
//

// ═══════════════════════
// 1. ORCHESTRATION
// ═══════════════════════

/**
 * Orchestrates the full image upload process: gets path, signs, uploads to Cloudinary,
 * processes response, extends metadata, and saves/updates the image record in the backend.
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
  // 1. Determine public path for Cloudinary
  const { folder, public_id } = getPublicPathCloudinaryImage(uploadCtx)
  const paramsToSign: ParamsToSign = {
    folder,
    media_metadata: 'true',
    ...(uploadCtx.imageToReplace && public_id ? { public_id } : {}),
  }

  // 2. Fetch Cloudinary signature
  const signData = await getCloudinarySignatureRemote({
    paramsToSign: { ...paramsToSign },
    meta: { isAdminRequest: true },
  })

  // 3. Upload file to Cloudinary
  const cloudinaryResponse = await createCloudinaryImage(
    file,
    paramsToSign,
    signData,
    fetchFn,
  )

  // 4. Process Cloudinary response into our image format
  const imageData = getImageFromCloudinaryResponse(cloudinaryResponse)

  // 5. Extend image data with feature/hierarchical info
  extendFeatureImage(
    imageData,
    uploadCtx,
    extendedFeatureInfo ? { featureImage: extendedFeatureInfo } : undefined,
  )
  extendImageWithResource(imageData, uploadCtx)

  // 6. Upsert image in the backend
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
// 3. CLOUDINARY :: API
// ═══════════════════════

/**
 * Uploads a file directly to Cloudinary.
 * @param file - The file to upload.
 * @param paramsToSign - Original parameters that were signed (folder, public_id if replacing).
 * @param signData - The signature data obtained from `serviceFetchCloudinarySignature`.
 * @param fetchFn - The fetch function to use for the API call.
 * @returns The Cloudinary API response.
 */
export async function createCloudinaryImage(
  file: File,
  paramsToSign: ParamsToSign, // folder, public_id (if any)
  signData: SignData,
  fetchFn: typeof fetch = fetch,
): Promise<any> {
  const url = getCloudinaryUploadEndpoint(signData.cloudname)
  const formData = new FormData()

  formData.append('file', file)
  formData.append('folder', paramsToSign.folder)
  formData.append('api_key', signData.apikey)
  formData.append('timestamp', signData.timestamp)
  formData.append('signature', signData.signature)
  formData.append('media_metadata', 'true')

  if (paramsToSign.public_id) {
    formData.append('public_id', paramsToSign.public_id)
  }

  const response = await fetchFn(url, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.text()
    console.error('Cloudinary upload failed:', errorData)
    throw new Error(`Cloudinary upload failed: ${response.statusText}`)
  }
  return response.json()
}

// ═══════════════════════
// 4. CLOUDINARY :: UTILS
// ═══════════════════════

/**
 * Generates the Cloudinary upload endpoint URL.
 * @param cloudname - The Cloudinary cloud name.
 * @returns The upload URL string.
 */
export function getCloudinaryUploadEndpoint(cloudname: string): string {
  return `https://api.cloudinary.com/v1_1/${cloudname}/auto/upload`
}

/**
 * Generates a URL for a Cloudinary image based on the image data.
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
  if ((image).preview) {
    return (image).preview
  }

  const finalTransformation = `${transformation}/g_${gravity}/f_${format}/q_${quality}`

  if (image.cdn === 'cloudinary') {
    return raw
      ? `https://res.cloudinary.com/${image.env}/image/upload/fl_attachment/${image.publicId}`
      : `https://res.cloudinary.com/${image.env}/image/upload/${finalTransformation}/v${image.version}/${image.publicId}`
  } else {
    throw error(404, `Image CDN <code>${image.cdn}</code> not supported`)
  }
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
 * Transforms a Cloudinary API response into a partial NewImageAPI object.
 * @param response - The raw Cloudinary API response.
 * @returns A partial NewImageAPI object.
 */
export function getImageFromCloudinaryResponse(response: any): Partial<ImageNew> {
  const metadata = response.image_metadata || {} // Ensure metadata is an object
  return {
    cdn: 'cloudinary' as const,
    env: response.env,
    cdnId: response.asset_id,
    publicId: response.public_id,
    version: response.version,
    originalFilename: response.original_filename,
    originalExtension: response.format,
    originalWidth: response.width,
    originalHeight: response.height,
    metadata: metadata,
    cameraModel: getCameraFromMetadata(metadata),
    capturedAt: getCapturedAtFromMetadata(metadata),
    credit: getCreditFromMetadata(metadata),
    ...getCoordinatesFromMetadata(metadata),
  }
}

/**
 * Fetches the signature required for Cloudinary upload from the backend.
 * @param paramsToSign - Parameters to be signed for the Cloudinary upload.
 * @returns The signature data from the backend.
 */
/**
 * Determines the public path for Cloudinary upload based on resource type.
 * @param ctx - The upload context containing resource type, IDs and optional parent entities.
 * @returns An object with folder and public_id (which can be null).
 * @throws Error if ctx are invalid for determining path.
 */
export function getPublicPathCloudinaryImage(ctx: ImageUploadCtx): {
  folder: string
  public_id: string | null
} {
  if (ctx.ctxType === ImageContextResource.hub) {
    if (!ctx.hub?.code) {
      console.error('Missing hub code for hub image path:', ctx)
      throw new Error('Missing hub code for hub image path')
    }
    return {
      folder: `/+/hubs/${ctx.hub.code}`,
      public_id: ctx.ctxId,
    }
  } else if (ctx.ctxType === ImageContextResource.organisation && ctx.organisation) {
    return {
      folder: `/${ctx.organisation.code}`,
      public_id: ctx.ctxId,
    }
  } else if (
    ctx.ctxType === ImageContextResource.project &&
    ctx.project &&
    ctx.organisation
  ) {
    return {
      folder: `/${ctx.organisation.code}/${ctx.project.code}`,
      public_id: ctx.ctxId,
    }
  } else if (
    ctx.ctxType === ImageContextResource.feature &&
    ctx.project &&
    ctx.organisation &&
    ctx.imageToReplace
  ) {
    return {
      folder: `/${ctx.organisation.code}/${ctx.project.code}`,
      public_id: ctx.imageToReplace.image.publicId.split('/').pop()!,
    }
  } else if (
    ctx.ctxType === ImageContextResource.feature &&
    ctx.project &&
    ctx.organisation
  ) {
    // New feature image, no public_id for replacement
    return {
      folder: `/${ctx.organisation.code}/${ctx.project.code}`,
      public_id: null,
    }
  }
  console.error('Invalid ctx for getPublicPath:', ctx)
  throw new Error('Invalid ctx for getPublicPath')
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

/**
 * Converts GPS metadata to latitude and longitude.
 * @param metadata - The image metadata object.
 * @returns An object containing latitude and longitude strings, or undefined if parsing fails.
 */
export function getCoordinatesFromMetadata(metadata: Metadata): LngLat {
  try {
    const coordinates = new Coordinates(
      `${metadata.GPSLatitude.replace(' deg', '°')} ${metadata.GPSLongitude.replace(' deg', '°')}`,
    )
    return {
      latitude: coordinates.getLatitude().toString(),
      longitude: coordinates.getLongitude().toString(),
    }
  } catch {
    console.warn('Failed to parse coordinates with coordinate-parser') // Fallback or simplified parsing if direct fields are available
    if (metadata.GPSLatitude && metadata.GPSLongitude) {
      return {
        latitude: String(metadata.GPSLatitude),
        longitude: String(metadata.GPSLongitude),
      }
    }
    return { latitude: undefined, longitude: undefined }
  }
}

/**
 * Extracts and parses the capture date from metadata.
 * @param metadata - The image metadata object.
 * @returns An ISO string of the capture date, or the current date as a fallback.
 */
export function getCapturedAtFromMetadata(metadata: Metadata): string {
  const parseExifDate = (dateStr: string): string => {
    const normalized = dateStr.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
    return new Date(normalized).toISOString()
  }

  const possibleFields = ['DateTimeOriginal', 'CreateDate', 'ModifyDate']
  for (const field of possibleFields) {
    if (metadata[field]) {
      try {
        return parseExifDate(metadata[field])
      } catch {
        console.warn(`Failed to parse ${field}:`, metadata[field])
      }
    }
  }

  if (metadata.DateCreated && metadata.TimeCreated) {
    try {
      return parseExifDate(`${metadata.DateCreated} ${metadata.TimeCreated}`)
    } catch {
      console.warn(
        'Failed to parse DateCreated/TimeCreated:',
        metadata.DateCreated,
        metadata.TimeCreated,
      )
    }
  }

  return new Date().toISOString()
}

/**
 * Extracts and formats the camera model from metadata.
 * @param metadata - The image metadata object.
 * @returns The camera model string, or undefined.
 */
export function getCameraFromMetadata(metadata: Metadata): string | undefined {
  const make = capitalizeFirstLetter(metadata.Make) ?? ''
  const model = capitalizeFirstLetter(metadata.Model) ?? ''
  const hasCamera = model.includes(make)
  return hasCamera ? model.trim() : `${make} ${model}`.trim() || undefined
}

/**
 * Extracts credit/copyright information from metadata.
 * @param metadata - The image metadata object.
 * @returns The credit string, or undefined.
 */
export function getCreditFromMetadata(metadata: Metadata): string | undefined {
  const possibleFields = ['CopyrightNotice', 'Credit', 'By-line']
  for (const field of possibleFields) {
    if (metadata[field]) {
      return metadata[field]
    }
  }
  return undefined
}

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
