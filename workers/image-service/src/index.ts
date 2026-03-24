import { decode as decodeAvif, encode as encodeAvif } from '@jsquash/avif'
import { decode as decodeJpeg, encode as encodeJpeg } from '@jsquash/jpeg'
import { decode as decodeJxl, encode as encodeJxl } from '@jsquash/jxl'
import { decode as decodePng, encode as encodePng } from '@jsquash/png'
import resize from '@jsquash/resize'
import { decode as decodeWebp, encode as encodeWebp } from '@jsquash/webp'
import smartcrop from 'smartcrop'

type ImageStage = 'local' | 'preview' | 'production'
type CropMode = 'c_fill' | 'c_fit' | 'c_thumb'
type GravityMode = 'g_auto' | 'g_center'
type OutputFormat = 'avif' | 'jpeg' | 'jxl' | 'png' | 'svg' | 'webp'
type MetadataProfile = 'admin' | 'auto' | 'basic' | 'full'

type Env = {
  ENVIRONMENT: ImageStage
  IMAGE_PUBLIC_BASE_URL: string
  IMAGE_ORIGINALS_LOCAL: R2Bucket
  IMAGE_ORIGINALS_PREVIEW: R2Bucket
  IMAGE_ORIGINALS_PRODUCTION: R2Bucket
  IMAGE_DERIVED_LOCAL: R2Bucket
  IMAGE_DERIVED_PREVIEW: R2Bucket
  IMAGE_DERIVED_PRODUCTION: R2Bucket
}

type ImageMetadataDocument = {
  originalFilename?: string | null
  originalExtension?: string | null
  originalWidth?: number | null
  originalHeight?: number | null
  cameraModel?: string | null
  capturedAt?: string | null
  credit?: string | null
  latitude?: number | null
  longitude?: number | null
  metadata?: Record<string, string> | null
  [key: string]: unknown
}

type TransformRequest = {
  requestedStage: ImageStage
  publicId: string
  version?: number
  cropMode: CropMode
  gravity: GravityMode
  quality: string
  format: 'auto' | OutputFormat
  width?: number
  height?: number
  effects: string[]
}

type MetadataRequest = {
  requestedStage: ImageStage
  publicId: string
  version?: number
  profile: MetadataProfile
  format: 'json'
}

type SourceAsset = {
  body: ArrayBuffer
  contentType: string
  objectKey: string
  stage: ImageStage
  version?: number
}

type DecodedImage = {
  data: ImageData
  hasAlpha: boolean
  inputFormat: OutputFormat | 'unknown'
}

type SmartCropImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

type SmartCropResult = {
  topCrop?: {
    x: number
    y: number
    width: number
    height: number
  }
}

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, immutable'
const CACHE_CONTROL_SHORT = 'public, max-age=300'
const MANIFEST_SUFFIX = '.manifest.json'
const METADATA_SUFFIX = '.json'
const MAX_TRANSFORM_DIMENSION = 4096
const QUALITY_BY_FORMAT = {
  avif: 45,
  jpeg: 80,
  jxl: 75,
  webp: 75,
} as const

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. FETCH ENTRY
// 2. ROUTE PARSING
// 3. SOURCE RESOLUTION
// 4. METADATA
// 5. TRANSFORM PIPELINE
// 6. FORMATS / CODECS
// 7. BUCKET / CACHE HELPERS

/**
 * Dispatches image delivery and metadata requests for the standalone image worker.
 *
 * @param request Incoming request.
 * @param env Worker bindings.
 * @param ctx Execution context.
 * @returns Worker response.
 */
const handleFetch = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> => {
  const url = new URL(request.url)

  if (request.method === 'GET' && url.pathname === '/health') {
    return Response.json({
      ok: true,
      environment: env.ENVIRONMENT,
      imagePublicBaseUrl: env.IMAGE_PUBLIC_BASE_URL,
    })
  }

  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length < 3) {
    return new Response('Not found', { status: 404 })
  }

  const stage = toStage(segments[0])
  const mediaType = segments[1]
  const serviceType = segments[2]

  if (mediaType !== 'image') {
    return new Response('Not found', { status: 404 })
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  if (serviceType === 'metadata') {
    const parsed = parseMetadataRequest(stage, segments.slice(3))
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    return handleMetadataRequest(request, env, parsed.value)
  }

  if (serviceType === 'upload') {
    const parsed = parseTransformRequest(stage, segments.slice(3))
    if (!parsed.ok) {
      return Response.json({ error: parsed.error }, { status: 400 })
    }
    return handleTransformRequest(request, env, ctx, parsed.value)
  }

  return new Response('Not found', { status: 404 })
}

/**
 * Resolves metadata sidecars from originals buckets and returns the requested profile.
 *
 * @param request Incoming request.
 * @param env Worker bindings.
 * @param metadataRequest Parsed metadata request.
 * @returns Metadata response.
 */
const handleMetadataRequest = async (
  request: Request,
  env: Env,
  metadataRequest: MetadataRequest,
): Promise<Response> => {
  const resolved = await resolveMetadataDocument(env, metadataRequest.requestedStage, {
    publicId: metadataRequest.publicId,
    version: metadataRequest.version,
  })

  if (!resolved.document) {
    return Response.json({ error: 'Metadata not found' }, { status: 404 })
  }

  if (resolved.stage !== metadataRequest.requestedStage) {
    console.warn(
      JSON.stringify({
        event: 'cross-stage-image-read',
        requestedStage: metadataRequest.requestedStage,
        resolvedStage: resolved.stage,
        publicId: metadataRequest.publicId,
      }),
    )
  }

  const headers = {
    'cache-control': resolved.version ? CACHE_CONTROL_IMMUTABLE : CACHE_CONTROL_SHORT,
    'content-type': 'application/json; charset=utf-8',
    'x-image-source-env': resolved.stage,
    ...(resolved.version ? { 'x-image-version': String(resolved.version) } : {}),
  }

  if (request.method === 'HEAD') {
    return new Response(null, { headers })
  }

  return Response.json(
    toMetadataProfilePayload(resolved.document, metadataRequest.profile),
    {
      headers,
    },
  )
}

/**
 * Resolves or generates a transformed image, then persists the derived variant to R2.
 *
 * @param request Incoming request.
 * @param env Worker bindings.
 * @param ctx Execution context.
 * @param transformRequest Parsed transform request.
 * @returns Image response.
 */
const handleTransformRequest = async (
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  transformRequest: TransformRequest,
): Promise<Response> => {
  const source = await resolveSourceAsset(env, transformRequest.requestedStage, {
    publicId: transformRequest.publicId,
    version: transformRequest.version,
  })
  if (!source) {
    return new Response('Image not found', { status: 404 })
  }

  if (source.stage !== transformRequest.requestedStage) {
    console.warn(
      JSON.stringify({
        event: 'cross-stage-image-read',
        requestedStage: transformRequest.requestedStage,
        resolvedStage: source.stage,
        publicId: transformRequest.publicId,
      }),
    )
  }

  const resolvedVersion =
    source.version ??
    transformRequest.version ??
    (await readManifestVersion(
      getOriginalsBucket(env, source.stage),
      transformRequest.publicId,
    )) ??
    undefined

  const outputFormat = chooseOutputFormat(
    request,
    source.contentType,
    transformRequest.format,
  )
  const canonical = toCanonicalTransformKey({
    ...transformRequest,
    format: outputFormat,
    version: resolvedVersion,
  })
  const derivedKey = toDerivedObjectKey({
    requestedStage: transformRequest.requestedStage,
    publicId: transformRequest.publicId,
    version: resolvedVersion,
    canonicalKey: canonical,
  })
  const derivedBucket = getDerivedBucket(env, transformRequest.requestedStage)

  const cached = await derivedBucket.get(derivedKey)
  if (cached) {
    return toObjectResponse(cached, {
      method: request.method,
      stage: source.stage,
      version: resolvedVersion,
      canonicalKey: canonical,
    })
  }

  const transformed = await transformSourceAsset(source, {
    ...transformRequest,
    version: resolvedVersion,
    format: outputFormat,
  })

  await derivedBucket.put(derivedKey, transformed.body, {
    httpMetadata: {
      contentType: transformed.contentType,
      cacheControl: CACHE_CONTROL_IMMUTABLE,
    },
    customMetadata: {
      sourceStage: source.stage,
      sourceObjectKey: source.objectKey,
      publicId: transformRequest.publicId,
      version: resolvedVersion ? String(resolvedVersion) : 'latest',
      canonicalTransform: canonical,
      generatedAt: new Date().toISOString(),
    },
  })

  ctx.waitUntil(Promise.resolve())

  return new Response(request.method === 'HEAD' ? null : transformed.body, {
    headers: {
      'cache-control': CACHE_CONTROL_IMMUTABLE,
      'content-type': transformed.contentType,
      'x-image-source-env': source.stage,
      'x-image-transform-key': canonical,
      ...(resolvedVersion ? { 'x-image-version': String(resolvedVersion) } : {}),
    },
  })
}

/**
 * Parses the metadata URL family and normalizes aliases into a stable request shape.
 *
 * @param requestedStage Requested environment segment.
 * @param rawSegments Remaining path segments after `/image/metadata/`.
 * @returns Parsed metadata request or an error.
 */
const parseMetadataRequest = (
  requestedStage: ImageStage,
  rawSegments: string[],
): { ok: true; value: MetadataRequest } | { ok: false; error: string } => {
  if (rawSegments.length === 0) {
    return { ok: false, error: 'Missing metadata path' }
  }

  let version: number | undefined
  let profile: MetadataProfile = 'full'
  let format: 'json' = 'json'
  const publicIdSegments: string[] = []

  for (const segment of rawSegments) {
    if (segment.startsWith('v') && isIntegerString(segment.slice(1))) {
      version = Number(segment.slice(1))
      continue
    }

    if (segment.startsWith('p_')) {
      profile = toMetadataProfile(segment)
      continue
    }

    if (segment.startsWith('f_')) {
      format = toMetadataFormat(segment)
      continue
    }

    publicIdSegments.push(segment)
  }

  const publicId = publicIdSegments.join('/')
  if (!publicId) {
    return { ok: false, error: 'Missing publicId' }
  }

  return {
    ok: true,
    value: {
      requestedStage,
      publicId,
      version,
      profile,
      format,
    },
  }
}

/**
 * Parses Cloudinary-compatible image delivery paths and applies v1 defaults.
 *
 * @param requestedStage Requested environment segment.
 * @param rawSegments Remaining path segments after `/image/upload/`.
 * @returns Parsed transform request or an error.
 */
const parseTransformRequest = (
  requestedStage: ImageStage,
  rawSegments: string[],
): { ok: true; value: TransformRequest } | { ok: false; error: string } => {
  if (rawSegments.length === 0) {
    return { ok: false, error: 'Missing image path' }
  }

  let version: number | undefined
  let cropMode: CropMode = 'c_fit'
  let gravity: GravityMode = 'g_auto'
  let quality = 'q_auto'
  let format: 'auto' | OutputFormat = 'auto'
  let width: number | undefined
  let height: number | undefined
  const effects: string[] = []
  const publicIdSegments: string[] = []
  let modifiersComplete = false

  for (const segment of rawSegments) {
    if (modifiersComplete) {
      publicIdSegments.push(segment)
      continue
    }

    if (segment.startsWith('v') && isIntegerString(segment.slice(1))) {
      version = Number(segment.slice(1))
      continue
    }

    if (looksLikeModifierSegment(segment)) {
      const parts = segment.split(',')

      for (const part of parts) {
        if (part.startsWith('c_')) {
          cropMode = toCropMode(part)
          continue
        }

        if (part.startsWith('g_')) {
          gravity = toGravityMode(part)
          continue
        }

        if (part.startsWith('f_')) {
          format = toExplicitFormat(part)
          continue
        }

        if (part.startsWith('q_')) {
          quality = part
          continue
        }

        if (part.startsWith('w_')) {
          width = clampDimension(part.slice(2))
          continue
        }

        if (part.startsWith('h_')) {
          height = clampDimension(part.slice(2))
          continue
        }

        if (part.startsWith('e_')) {
          effects.push(part)
        }
      }
      continue
    }

    modifiersComplete = true
    publicIdSegments.push(segment)
  }

  if (publicIdSegments.length === 0) {
    return { ok: false, error: 'Missing publicId' }
  }

  const publicId = publicIdSegments.join('/')
  const explicitExtension = extractExtension(publicId)
  if (format === 'auto' && explicitExtension) {
    format = explicitExtension
  }

  return {
    ok: true,
    value: {
      requestedStage,
      publicId: stripKnownExtension(publicId),
      version,
      cropMode,
      gravity,
      quality,
      format,
      width,
      height,
      effects,
    },
  }
}

/**
 * Resolves a source asset from the readable stages for the requested environment.
 *
 * @param env Worker bindings.
 * @param requestedStage Requested stage from the URL.
 * @param lookup Public id and optional version.
 * @returns Source asset or null when missing.
 */
const resolveSourceAsset = async (
  env: Env,
  requestedStage: ImageStage,
  lookup: { publicId: string; version?: number },
): Promise<SourceAsset | null> => {
  for (const stage of getReadableStages(requestedStage)) {
    const bucket = getOriginalsBucket(env, stage)
    const version =
      lookup.version ??
      (await readManifestVersion(bucket, lookup.publicId)) ??
      undefined
    const object = await bucket.get(lookup.publicId)
    if (!object) {
      continue
    }

    return {
      body: await object.arrayBuffer(),
      contentType:
        object.httpMetadata?.contentType ?? inferContentTypeFromKey(lookup.publicId),
      objectKey: lookup.publicId,
      stage,
      version,
    }
  }

  return null
}

/**
 * Resolves a metadata document from readable stages, preferring versioned sidecars.
 *
 * @param env Worker bindings.
 * @param requestedStage Requested environment.
 * @param lookup Public id and optional version.
 * @returns Metadata document, stage, and resolved version.
 */
const resolveMetadataDocument = async (
  env: Env,
  requestedStage: ImageStage,
  lookup: { publicId: string; version?: number },
): Promise<{
  document: ImageMetadataDocument | null
  stage: ImageStage
  version?: number
}> => {
  for (const stage of getReadableStages(requestedStage)) {
    const bucket = getOriginalsBucket(env, stage)
    const version =
      lookup.version ??
      (await readManifestVersion(bucket, lookup.publicId)) ??
      undefined
    const versioned = version
      ? await bucket.get(toMetadataObjectKey(lookup.publicId, version))
      : null
    const fallback =
      versioned ?? (await bucket.get(toMetadataObjectKey(lookup.publicId)))

    if (!fallback) {
      continue
    }

    return {
      document: (await fallback.json()) as ImageMetadataDocument,
      stage,
      version,
    }
  }

  return { document: null, stage: requestedStage, version: lookup.version }
}

/**
 * Executes the decode, crop, resize, and encode pipeline for a source image.
 *
 * @param source Source object bytes and metadata.
 * @param request Parsed transform request with resolved output format.
 * @returns Encoded derived image.
 */
const transformSourceAsset = async (
  source: SourceAsset,
  request: TransformRequest & { format: OutputFormat },
): Promise<{ body: ArrayBuffer; contentType: string }> => {
  if (source.contentType === 'image/svg+xml') {
    if (request.format !== 'svg') {
      return {
        body: source.body,
        contentType: 'image/svg+xml',
      }
    }

    return {
      body: source.body,
      contentType: 'image/svg+xml',
    }
  }

  const decoded = await decodeSourceImage(source)
  const transformed = await applyTransforms(decoded.data, request)
  const encoded = await encodeOutput(
    transformed,
    request.format,
    request.quality,
    decoded.hasAlpha,
  )

  return {
    body: encoded.body,
    contentType: encoded.contentType,
  }
}

/**
 * Decodes a raster source image into RGBA pixel data.
 *
 * @param source Source object bytes and content type.
 * @returns Decoded image and alpha metadata.
 */
const decodeSourceImage = async (source: SourceAsset): Promise<DecodedImage> => {
  const format = inferInputFormat(source.contentType, source.objectKey)
  const buffer = source.body
  const data =
    format === 'jpeg'
      ? await decodeJpeg(buffer, { preserveOrientation: true })
      : format === 'png'
        ? await decodePng(buffer)
        : format === 'webp'
          ? await decodeWebp(buffer)
          : format === 'avif'
            ? await decodeAvif(buffer)
            : format === 'jxl'
              ? await decodeJxl(buffer)
              : await decodeJpeg(buffer, { preserveOrientation: true })

  return {
    data,
    hasAlpha: imageDataHasAlpha(data),
    inputFormat: format,
  }
}

/**
 * Applies crop and resize semantics for the supported Cloudinary-compatible modes.
 *
 * @param image Input image pixels.
 * @param request Parsed transform request.
 * @returns Transformed image pixels.
 */
const applyTransforms = async (
  image: ImageData,
  request: TransformRequest,
): Promise<ImageData> => {
  const target = resolveTargetDimensions(image, request)
  if (!target) {
    return image
  }

  if (request.cropMode === 'c_fit') {
    return resize(image, {
      width: target.width,
      height: target.height,
      method: 'lanczos3',
    })
  }

  const crop = await resolveCropRect(image, target, request.gravity)
  const cropped = cropImageData(image, crop.x, crop.y, crop.width, crop.height)

  return resize(cropped, {
    width: target.width,
    height: target.height,
    method: 'lanczos3',
  })
}

/**
 * Resolves the best crop rectangle for fill/thumb behavior.
 *
 * @param image Source image data.
 * @param target Target output dimensions.
 * @param gravity Gravity mode.
 * @returns Crop rectangle in source pixel coordinates.
 */
const resolveCropRect = async (
  image: ImageData,
  target: { width: number; height: number },
  gravity: GravityMode,
): Promise<{ x: number; y: number; width: number; height: number }> => {
  const imageRatio = image.width / image.height
  const targetRatio = target.width / target.height
  const cropWidth =
    imageRatio > targetRatio ? Math.round(image.height * targetRatio) : image.width
  const cropHeight =
    imageRatio > targetRatio ? image.height : Math.round(image.width / targetRatio)

  if (gravity === 'g_center') {
    return {
      x: Math.max(0, Math.round((image.width - cropWidth) / 2)),
      y: Math.max(0, Math.round((image.height - cropHeight) / 2)),
      width: cropWidth,
      height: cropHeight,
    }
  }

  try {
    const result = (await smartcrop.crop(
      {
        width: image.width,
        height: image.height,
        data: image.data,
      } as unknown as CanvasImageSource,
      {
        width: cropWidth,
        height: cropHeight,
        imageOperations: createSmartCropOperations(),
      },
    )) as SmartCropResult

    if (result.topCrop) {
      return {
        x: clampInt(result.topCrop.x, 0, image.width - cropWidth),
        y: clampInt(result.topCrop.y, 0, image.height - cropHeight),
        width: cropWidth,
        height: cropHeight,
      }
    }
  } catch (error) {
    console.warn('smartcrop failed; falling back to center crop', { error })
  }

  return {
    x: Math.max(0, Math.round((image.width - cropWidth) / 2)),
    y: Math.max(0, Math.round((image.height - cropHeight) / 2)),
    width: cropWidth,
    height: cropHeight,
  }
}

/**
 * Encodes transformed pixels to the requested delivery format.
 *
 * @param image Image pixels to encode.
 * @param format Output format.
 * @param quality Raw quality token from the request.
 * @param hasAlpha Whether the input pixels contain transparency.
 * @returns Encoded output bytes and content type.
 */
const encodeOutput = async (
  image: ImageData,
  format: OutputFormat,
  quality: string,
  hasAlpha: boolean,
): Promise<{ body: ArrayBuffer; contentType: string }> => {
  if (format === 'svg') {
    throw new Error('SVG output is only supported as a passthrough for SVG sources')
  }

  if (format === 'png') {
    return {
      body: await encodePng(image),
      contentType: 'image/png',
    }
  }

  if (format === 'webp') {
    return {
      body: await encodeWebp(image, { quality: resolveQuality(quality, 'webp') }),
      contentType: 'image/webp',
    }
  }

  if (format === 'avif') {
    return {
      body: await encodeAvif(image, { quality: resolveQuality(quality, 'avif') }),
      contentType: 'image/avif',
    }
  }

  if (format === 'jxl') {
    return {
      body: await encodeJxl(image, { quality: resolveQuality(quality, 'jxl') }),
      contentType: 'image/jxl',
    }
  }

  return {
    body: await encodeJpeg(hasAlpha ? flattenAlpha(image) : image, {
      quality: resolveQuality(quality, 'jpeg'),
    }),
    contentType: 'image/jpeg',
  }
}

/**
 * Creates a smartcrop image-operations adapter backed by jSquash resize rather than canvas.
 *
 * @returns Adapter object compatible with smartcrop.
 */
const createSmartCropOperations = (): {
  open(image: SmartCropImage): Promise<SmartCropImage>
  resample(
    image: SmartCropImage,
    width: number,
    height: number,
  ): Promise<SmartCropImage>
  getData(
    image: SmartCropImage,
  ): Promise<{ width: number; height: number; data: Uint8ClampedArray }>
} => ({
  async open(image: SmartCropImage): Promise<SmartCropImage> {
    return image
  },

  async resample(
    image: SmartCropImage,
    width: number,
    height: number,
  ): Promise<SmartCropImage> {
    const resized = await resize(new ImageData(image.data, image.width, image.height), {
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      method: 'triangle',
    })

    return {
      width: resized.width,
      height: resized.height,
      data: resized.data,
    }
  },

  async getData(image: SmartCropImage): Promise<{
    width: number
    height: number
    data: Uint8ClampedArray
  }> {
    return image
  },
})

/**
 * Crops a source image in-memory by copying rows into a new pixel buffer.
 *
 * @param image Source image data.
 * @param x Left crop origin.
 * @param y Top crop origin.
 * @param width Crop width.
 * @param height Crop height.
 * @returns Cropped image data.
 */
const cropImageData = (
  image: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
): ImageData => {
  const output = new Uint8ClampedArray(width * height * 4)

  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((y + row) * image.width + x) * 4
    const sourceEnd = sourceStart + width * 4
    const targetStart = row * width * 4
    output.set(image.data.subarray(sourceStart, sourceEnd), targetStart)
  }

  return new ImageData(output, width, height)
}

/**
 * Resolves output dimensions for fit/fill requests while keeping aspect ratio intact.
 *
 * @param image Input image data.
 * @param request Parsed transform request.
 * @returns Target dimensions or null when no resize was requested.
 */
const resolveTargetDimensions = (
  image: ImageData,
  request: TransformRequest,
): { width: number; height: number } | null => {
  const requestedWidth = request.width
  const requestedHeight = request.height

  if (!requestedWidth && !requestedHeight) {
    return null
  }

  if (request.cropMode === 'c_fill' || request.cropMode === 'c_thumb') {
    return {
      width: requestedWidth ?? requestedHeight ?? image.width,
      height: requestedHeight ?? requestedWidth ?? image.height,
    }
  }

  const widthRatio = requestedWidth
    ? requestedWidth / image.width
    : Number.POSITIVE_INFINITY
  const heightRatio = requestedHeight
    ? requestedHeight / image.height
    : Number.POSITIVE_INFINITY
  const ratio = Math.min(widthRatio, heightRatio)

  if (!Number.isFinite(ratio)) {
    if (requestedWidth) {
      return {
        width: requestedWidth,
        height: Math.max(1, Math.round((image.height * requestedWidth) / image.width)),
      }
    }

    return {
      width: Math.max(
        1,
        Math.round((image.width * (requestedHeight ?? image.height)) / image.height),
      ),
      height: requestedHeight ?? image.height,
    }
  }

  return {
    width: Math.max(1, Math.round(image.width * ratio)),
    height: Math.max(1, Math.round(image.height * ratio)),
  }
}

/**
 * Chooses a delivery format from the request and client `Accept` preferences.
 *
 * @param request Original request.
 * @param sourceContentType Source object content type.
 * @param requestedFormat Explicit requested format or `auto`.
 * @returns Output format.
 */
const chooseOutputFormat = (
  request: Request,
  sourceContentType: string,
  requestedFormat: 'auto' | OutputFormat,
): OutputFormat => {
  if (requestedFormat !== 'auto') {
    return requestedFormat
  }

  if (sourceContentType === 'image/svg+xml') {
    return 'svg'
  }

  const accept = request.headers.get('accept') ?? ''
  if (accept.includes('image/avif')) return 'avif'
  if (accept.includes('image/webp')) return 'webp'
  if (accept.includes('image/jxl')) return 'jxl'
  if (accept.includes('image/png')) return 'png'
  return 'jpeg'
}

/**
 * Converts an R2 object body into a response with cache and provenance headers.
 *
 * @param object Existing R2 object body.
 * @param options Response metadata.
 * @returns HTTP response.
 */
const toObjectResponse = (
  object: R2ObjectBody,
  options: {
    method: string
    stage: ImageStage
    version?: number
    canonicalKey: string
  },
): Response =>
  new Response(options.method === 'HEAD' ? null : object.body, {
    headers: {
      'cache-control': object.httpMetadata?.cacheControl ?? CACHE_CONTROL_IMMUTABLE,
      'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      etag: object.httpEtag,
      'x-image-source-env': options.stage,
      'x-image-transform-key': options.canonicalKey,
      ...(options.version ? { 'x-image-version': String(options.version) } : {}),
    },
  })

/**
 * Maps metadata profiles onto the subset returned to callers.
 *
 * @param document Metadata sidecar document.
 * @param profile Requested metadata profile.
 * @returns Profile payload.
 */
const toMetadataProfilePayload = (
  document: ImageMetadataDocument,
  profile: MetadataProfile,
): ImageMetadataDocument => {
  if (profile === 'full' || profile === 'admin' || profile === 'auto') {
    return document
  }

  return {
    originalFilename: document.originalFilename ?? null,
    originalExtension: document.originalExtension ?? null,
    originalWidth: document.originalWidth ?? null,
    originalHeight: document.originalHeight ?? null,
    cameraModel: document.cameraModel ?? null,
    capturedAt: document.capturedAt ?? null,
    credit: document.credit ?? null,
    latitude: document.latitude ?? null,
    longitude: document.longitude ?? null,
  }
}

/**
 * Builds the stable derived-cache key for a transformed asset.
 *
 * @param request Parsed request with normalized options.
 * @returns Canonical transform key.
 */
const toCanonicalTransformKey = (
  request: TransformRequest & { format: OutputFormat },
): string => {
  const parts = [
    request.cropMode,
    request.width ? `w_${request.width}` : null,
    request.height ? `h_${request.height}` : null,
    request.gravity,
    request.quality,
    `f_${request.format}`,
  ].filter(Boolean)

  return parts.join(',')
}

/**
 * Creates the derived object path inside the derived-cache bucket.
 *
 * @param params Derived object parameters.
 * @returns Derived bucket object key.
 */
const toDerivedObjectKey = (params: {
  requestedStage: ImageStage
  publicId: string
  version?: number
  canonicalKey: string
}): string =>
  `${params.requestedStage}/${params.publicId}/${params.version ? `v${params.version}` : 'latest'}/${params.canonicalKey}`

/**
 * Creates the metadata sidecar key next to the original object.
 *
 * @param publicId Canonical public id.
 * @param version Optional version.
 * @returns Metadata object key.
 */
const toMetadataObjectKey = (publicId: string, version?: number): string =>
  version
    ? `${publicId}.v${version}${METADATA_SUFFIX}`
    : `${publicId}${METADATA_SUFFIX}`

/**
 * Creates the manifest sidecar key used to resolve the latest version.
 *
 * @param publicId Canonical public id.
 * @returns Manifest object key.
 */
const toManifestObjectKey = (publicId: string): string =>
  `${publicId}${MANIFEST_SUFFIX}`

/**
 * Reads the manifest version for a public id.
 *
 * @param bucket Originals bucket to inspect.
 * @param publicId Public id.
 * @returns Manifest version or null.
 */
const readManifestVersion = async (
  bucket: R2Bucket,
  publicId: string,
): Promise<number | null> => {
  const manifest = await bucket.get(toManifestObjectKey(publicId))
  if (!manifest) {
    return null
  }

  const json = (await manifest.json()) as { version?: number }
  return typeof json.version === 'number' ? json.version : null
}

/**
 * Returns the originals bucket binding for a stage.
 *
 * @param env Worker bindings.
 * @param stage Logical image stage.
 * @returns R2 originals bucket.
 */
const getOriginalsBucket = (env: Env, stage: ImageStage): R2Bucket => {
  if (stage === 'production') return env.IMAGE_ORIGINALS_PRODUCTION
  if (stage === 'preview') return env.IMAGE_ORIGINALS_PREVIEW
  return env.IMAGE_ORIGINALS_LOCAL
}

/**
 * Returns the derived bucket binding for a stage.
 *
 * @param env Worker bindings.
 * @param stage Logical image stage.
 * @returns R2 derived bucket.
 */
const getDerivedBucket = (env: Env, stage: ImageStage): R2Bucket => {
  if (stage === 'production') return env.IMAGE_DERIVED_PRODUCTION
  if (stage === 'preview') return env.IMAGE_DERIVED_PREVIEW
  return env.IMAGE_DERIVED_LOCAL
}

/**
 * Returns the readable source stages for a given request stage.
 *
 * @param requestedStage Requested stage.
 * @returns Ordered readable stages.
 */
const getReadableStages = (requestedStage: ImageStage): ImageStage[] => {
  if (requestedStage === 'local') return ['local', 'preview', 'production']
  if (requestedStage === 'preview') return ['preview', 'production']
  return ['production']
}

/**
 * Coerces a URL env segment into the supported stage enum.
 *
 * @param value URL segment.
 * @returns Normalized stage.
 */
const toStage = (value: string): ImageStage =>
  value === 'preview' || value === 'production' ? value : 'local'

/**
 * Identifies whether a path segment is a recognized modifier segment.
 *
 * @param segment Path segment.
 * @returns Whether the segment contains transform modifiers.
 */
const looksLikeModifierSegment = (segment: string): boolean =>
  ['c_', 'g_', 'f_', 'q_', 'e_', 'w_', 'h_'].some(prefix => segment.startsWith(prefix))

/**
 * Normalizes supported crop mode aliases.
 *
 * @param value Crop token.
 * @returns Supported crop mode.
 */
const toCropMode = (value: string): CropMode =>
  value === 'c_fill' || value === 'c_thumb' ? value : 'c_fit'

/**
 * Normalizes supported gravity tokens.
 *
 * @param value Gravity token.
 * @returns Supported gravity.
 */
const toGravityMode = (value: string): GravityMode =>
  value === 'g_center' ? 'g_center' : 'g_auto'

/**
 * Maps format tokens onto supported output formats.
 *
 * @param value Format token.
 * @returns Explicit output format or `auto`.
 */
const toExplicitFormat = (value: string): 'auto' | OutputFormat => {
  if (value === 'f_auto') return 'auto'
  if (value === 'f_avif') return 'avif'
  if (value === 'f_jxl') return 'jxl'
  if (value === 'f_png') return 'png'
  if (value === 'f_svg') return 'svg'
  if (value === 'f_webp') return 'webp'
  return 'jpeg'
}

/**
 * Normalizes metadata profile aliases.
 *
 * @param value Metadata profile token.
 * @returns Supported metadata profile.
 */
const toMetadataProfile = (value: string): MetadataProfile => {
  if (value === 'p_basic') return 'basic'
  if (value === 'p_full' || value === 'p_admin' || value === 'p_auto') return 'full'
  return 'full'
}

/**
 * Normalizes metadata format aliases.
 *
 * @param value Metadata format token.
 * @returns Supported metadata format.
 */
const toMetadataFormat = (_value: string): 'json' => 'json'

/**
 * Extracts a known output format from a public id extension.
 *
 * @param publicId Public id or filename.
 * @returns Format or null.
 */
const extractExtension = (publicId: string): OutputFormat | null => {
  const extension = publicId.split('.').pop()?.toLowerCase()
  if (!extension) return null
  if (extension === 'avif') return 'avif'
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'jxl') return 'jxl'
  if (extension === 'png') return 'png'
  if (extension === 'svg') return 'svg'
  if (extension === 'webp') return 'webp'
  return null
}

/**
 * Removes a known image extension from a public id.
 *
 * @param publicId Public id.
 * @returns Extensionless public id.
 */
const stripKnownExtension = (publicId: string): string =>
  publicId.replace(/\.(avif|jpe?g|jxl|png|svg|webp)$/i, '')

/**
 * Infers a source image format from object metadata and fallback key hints.
 *
 * @param contentType Source content type.
 * @param objectKey Source object key.
 * @returns Input format.
 */
const inferInputFormat = (
  contentType: string,
  objectKey: string,
): OutputFormat | 'unknown' => {
  if (contentType === 'image/avif') return 'avif'
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpeg'
  if (contentType === 'image/jxl') return 'jxl'
  if (contentType === 'image/png') return 'png'
  if (contentType === 'image/svg+xml') return 'svg'
  if (contentType === 'image/webp') return 'webp'
  return extractExtension(objectKey) ?? 'unknown'
}

/**
 * Infers a content type from an object key when R2 metadata is missing.
 *
 * @param objectKey Object key.
 * @returns Best-effort content type.
 */
const inferContentTypeFromKey = (objectKey: string): string => {
  const extension = extractExtension(objectKey)
  if (extension === 'avif') return 'image/avif'
  if (extension === 'jpeg') return 'image/jpeg'
  if (extension === 'jxl') return 'image/jxl'
  if (extension === 'png') return 'image/png'
  if (extension === 'svg') return 'image/svg+xml'
  if (extension === 'webp') return 'image/webp'
  return 'application/octet-stream'
}

/**
 * Resolves an encoder quality from a raw request token.
 *
 * @param rawQuality Raw `q_*` token.
 * @param format Output format.
 * @returns Numeric encoder quality.
 */
const resolveQuality = (
  rawQuality: string,
  format: keyof typeof QUALITY_BY_FORMAT,
): number => {
  if (rawQuality.startsWith('q_') && isIntegerString(rawQuality.slice(2))) {
    return clampInt(Number(rawQuality.slice(2)), 1, 100)
  }
  return QUALITY_BY_FORMAT[format]
}

/**
 * Detects whether an RGBA image contains any transparency.
 *
 * @param image Image data.
 * @returns Whether any pixel alpha is below 255.
 */
const imageDataHasAlpha = (image: ImageData): boolean => {
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] < 255) {
      return true
    }
  }
  return false
}

/**
 * Flattens transparency onto a white background for JPEG output.
 *
 * @param image Source image data.
 * @returns Opaque image data.
 */
const flattenAlpha = (image: ImageData): ImageData => {
  const output = new Uint8ClampedArray(image.data.length)

  for (let index = 0; index < image.data.length; index += 4) {
    const alpha = image.data[index + 3] / 255
    output[index] = Math.round(image.data[index] * alpha + 255 * (1 - alpha))
    output[index + 1] = Math.round(image.data[index + 1] * alpha + 255 * (1 - alpha))
    output[index + 2] = Math.round(image.data[index + 2] * alpha + 255 * (1 - alpha))
    output[index + 3] = 255
  }

  return new ImageData(output, image.width, image.height)
}

/**
 * Clamps a user-provided dimension token to the supported transform range.
 *
 * @param value Raw dimension token.
 * @returns Clamped dimension or undefined.
 */
const clampDimension = (value: string): number | undefined => {
  if (!isIntegerString(value)) {
    return undefined
  }

  return clampInt(Number(value), 1, MAX_TRANSFORM_DIMENSION)
}

/**
 * Clamps a numeric value to an inclusive range.
 *
 * @param value Input number.
 * @param min Minimum allowed value.
 * @param max Maximum allowed value.
 * @returns Clamped integer.
 */
const clampInt = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(value)))

/**
 * Checks whether a string contains only base-10 digits.
 *
 * @param value Candidate string.
 * @returns Whether the string is an integer representation.
 */
const isIntegerString = (value: string): boolean => /^\d+$/.test(value)

export default {
  fetch: handleFetch,
} satisfies ExportedHandler<Env>
