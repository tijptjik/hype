// ENUMS
import { ImageEnv } from '$lib/enums'
import { AwsClient } from 'aws4fetch'
// TYPES
import type {
  ImageMetadataBasic,
  ImageMetadataFull,
  ImageMetadataProfile,
} from '$lib/db/zod/schema/image.types'
import { error } from '@sveltejs/kit'

type ImageStage = `${ImageEnv}`
type ImageBucket = App.Platform['env']['ASSET_RAW_DEV']
type ImageObjectBody = Awaited<ReturnType<ImageBucket['get']>>
type R2Method = 'GET' | 'HEAD' | 'PUT'
type R2RequestParams = {
  accountId: string
  bucket: string
  objectKey: string
  accessKeyId: string
  secretAccessKey: string
}
type R2FetchParams = R2RequestParams & {
  fetchFn?: typeof fetch
}

export type ImageMetadataDocument = ImageMetadataFull

const IMAGE_METADATA_SUFFIX = '.json'
const IMAGE_MANIFEST_SUFFIX = '.manifest.json'
const IMAGE_BUCKET_BY_STAGE = {
  [ImageEnv.local]: 'hype-assets-raw-dev',
  [ImageEnv.preview]: 'hype-assets-raw-preview',
  [ImageEnv.production]: 'hype-assets-raw-prod',
} as const

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. TYPES AND CONSTANTS
// - ImageMetadataDocument
//
// 1. STAGE AND KEY HELPERS
// - toImageStage
// - getOriginalsBucketForStage
// - getDerivedBucketForStage
// - getReadableStages
// - toMetadataObjectKey
// - toManifestObjectKey
// - getOriginalsBucketNameForStage
// - toPublicAssetBaseUrl
// - normalizePublicId
//
// 2. BINDING READ HELPERS
// - readJson
// - safeBucketGet
// - readJsonViaBindingsOrApi
//
// 3. DIRECT R2 API HELPERS
// - encodeObjectKeyPath
// - createR2Client
// - createR2ObjectUrl
// - signR2Request
// - executeR2Request
// - throwR2RequestError
// - createPresignedR2UploadUrl
// - headR2ObjectViaApi
// - putR2ObjectViaApi
// - readR2JsonViaApi
// - readR2ObjectViaApi
//
// 4. METADATA READS AND SHAPING
// - readManifestVersion
// - readMetadataDocument
// - toMetadataProfilePayload
//
// ---

// ---
/********************
 *  1. STAGE AND KEY HELPERS
 ************/
// +++ Stage And Key Helpers

const normalizePublicId = (publicId: string): string =>
  publicId.trim().replace(/^\/+/, '')

/**
 * Normalises an unknown environment value into a valid image storage stage.
 *
 * @param value Runtime environment value from params, config, or persisted image data.
 * @returns Valid image stage, defaulting to `local` for unknown input.
 */
export const toImageStage = (value: unknown): ImageStage => {
  if (
    value === ImageEnv.local ||
    value === ImageEnv.preview ||
    value === ImageEnv.production
  ) {
    return value
  }
  return ImageEnv.local
}

/**
 * Resolves the R2 bucket that stores original uploads for a given stage.
 *
 * @param platform Cloudflare platform bindings from the current request context.
 * @param stage Normalised image stage.
 * @returns Originals bucket bound for the requested stage.
 * @throws 500 error when platform bindings are unavailable.
 */
export const getOriginalsBucketForStage = (
  platform: App.Platform | undefined,
  stage: ImageStage,
): ImageBucket => {
  if (!platform) throw error(500, 'Platform not available')

  switch (stage) {
    case ImageEnv.production:
      return platform.env.ASSET_RAW_PRODUCTION
    case ImageEnv.preview:
      return platform.env.ASSET_RAW_PREVIEW
    default:
      return platform.env.ASSET_RAW_DEV
  }
}

/**
 * Resolves the R2 bucket that stores derived image assets for a given stage.
 *
 * @param platform Cloudflare platform bindings from the current request context.
 * @param stage Normalised image stage.
 * @returns Derived-assets bucket bound for the requested stage.
 * @throws 500 error when platform bindings are unavailable.
 */
export const getDerivedBucketForStage = (
  platform: App.Platform | undefined,
  stage: ImageStage,
): ImageBucket => {
  if (!platform) throw error(500, 'Platform not available')

  switch (stage) {
    case ImageEnv.production:
      return platform.env.ASSET_PUBLIC_PRODUCTION
    case ImageEnv.preview:
      return platform.env.ASSET_PUBLIC_PREVIEW
    default:
      return platform.env.ASSET_PUBLIC_DEV
  }
}

/**
 * Returns the fallback read order for metadata lookups.
 *
 * @param stage Requested image stage.
 * @returns Ordered list of stages that are safe to read from for the request.
 * @remarks Local can read preview and production assets, preview can read production assets,
 * and production is restricted to production only.
 */
export const getReadableStages = (stage: ImageStage): ImageStage[] => {
  switch (stage) {
    case ImageEnv.local:
      return [ImageEnv.local, ImageEnv.preview, ImageEnv.production]
    case ImageEnv.preview:
      return [ImageEnv.preview, ImageEnv.production]
    default:
      return [ImageEnv.production]
  }
}

/**
 * Builds the metadata object key for an image, optionally targeting a specific version.
 *
 * @param publicId Canonical image public identifier.
 * @param version Optional metadata version suffix.
 * @returns Object key used to store the metadata document in R2.
 */
export const toMetadataObjectKey = (publicId: string, version?: number): string =>
  version
    ? `${normalizePublicId(publicId)}.v${version}${IMAGE_METADATA_SUFFIX}`
    : `${normalizePublicId(publicId)}${IMAGE_METADATA_SUFFIX}`

/**
 * Builds the manifest object key for an image metadata manifest.
 *
 * @param publicId Canonical image public identifier.
 * @returns Object key used to store the manifest document in R2.
 */
export const toManifestObjectKey = (publicId: string): string =>
  `${normalizePublicId(publicId)}${IMAGE_MANIFEST_SUFFIX}`

/**
 * Resolves the canonical R2 originals bucket name for a stage.
 *
 * @param stage Normalised image stage.
 * @returns Bucket name used by direct browser uploads and migration tooling.
 */
export const getOriginalsBucketNameForStage = (stage: ImageStage): string =>
  IMAGE_BUCKET_BY_STAGE[stage]

/**
 * Reads the public asset base URL configured for the current build.
 *
 * @returns Configured public base URL for CDN-served assets, or an empty string when unset.
 */
export const toPublicAssetBaseUrl = (): string =>
  import.meta.env.PUBLIC_ASSET_BASE_URL || ''

// ---
/********************
 *  2. BINDING READ HELPERS
 ************/
// +++ Binding Read Helpers

/**
 * Parses a JSON object body from R2 when present.
 *
 * @param object R2 object body returned from a bucket read.
 * @returns Parsed JSON payload, or `null` when the object does not exist.
 */
const readJson = async <T>(object: ImageObjectBody): Promise<T | null> => {
  if (!object) return null
  return (await object.json()) as T
}

const safeBucketGet = async (
  bucket: ImageBucket,
  key: string,
): Promise<ImageObjectBody> => {
  try {
    return await bucket.get(key)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isLocalReadFailure = message.includes('get: Unspecified error (0)')

    if (!isLocalReadFailure) {
      console.error('[images.storage.safeBucketGet] get failed', {
        key,
        error,
      })
    }

    return null
  }
}

const readJsonViaBindingsOrApi = async <T>(params: {
  platform: App.Platform | undefined
  stage: ImageStage
  bucket: ImageBucket
  key: string
  fetchFn?: typeof fetch
}): Promise<T | null> => {
  const bindingObject = await safeBucketGet(params.bucket, params.key)
  const bindingDocument = await readJson<T>(bindingObject)

  if (bindingDocument) {
    return bindingDocument
  }

  const accountId = params.platform?.env.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = params.platform?.env.R2_S3_ACCESS_KEY_ID
  const secretAccessKey = params.platform?.env.R2_S3_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null
  }

  return readR2JsonViaApi<T>({
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: getOriginalsBucketNameForStage(params.stage),
    objectKey: params.key,
    fetchFn: params.fetchFn,
  })
}

// ---
/********************
 *  3. DIRECT R2 API HELPERS
 ************/
// +++ Direct R2 Api Helpers

const encodeObjectKeyPath = (objectKey: string): string =>
  objectKey
    .split('/')
    .map(segment => encodeURIComponent(segment))
    .join('/')

const createR2Client = (params: R2RequestParams): AwsClient =>
  new AwsClient({
    accessKeyId: params.accessKeyId,
    secretAccessKey: params.secretAccessKey,
    service: 's3',
    region: 'auto',
  })

const createR2ObjectUrl = (
  params: Pick<R2RequestParams, 'accountId' | 'bucket' | 'objectKey'>,
): URL =>
  new URL(
    `https://${params.accountId}.r2.cloudflarestorage.com/${params.bucket}/${encodeObjectKeyPath(params.objectKey)}`,
  )

const signR2Request = async (
  params: R2RequestParams,
  request: {
    method: R2Method
    headers?: HeadersInit
    signQuery?: boolean
  },
): Promise<Request> =>
  createR2Client(params).sign(createR2ObjectUrl(params), {
    method: request.method,
    headers: request.headers,
    aws: request.signQuery
      ? {
          signQuery: true,
        }
      : undefined,
  })

const executeR2Request = async (
  params: R2FetchParams,
  request: {
    method: R2Method
    headers?: HeadersInit
    body?: BodyInit
  },
): Promise<Response> => {
  const signedRequest = await signR2Request(params, request)

  return (params.fetchFn ?? fetch)(signedRequest.url, {
    method: request.method,
    headers: signedRequest.headers,
    body: request.body,
  })
}

const throwR2RequestError = (operation: string, response: Response): never => {
  throw new Error(
    `Remote R2 ${operation} failed: ${response.status} ${response.statusText}`,
  )
}

/**
 * Creates a presigned direct-upload URL for an R2 object.
 *
 * @param params Presign parameters.
 * @returns Presigned `PUT` URL for the target object.
 */
export const createPresignedR2UploadUrl = async (params: {
  accountId: string
  bucket: string
  objectKey: string
  accessKeyId: string
  secretAccessKey: string
  expiresInSeconds?: number
}): Promise<string> => {
  const targetUrl = createR2ObjectUrl(params)
  if (params.expiresInSeconds) {
    targetUrl.searchParams.set('X-Amz-Expires', String(params.expiresInSeconds))
  }
  const signedRequest = await createR2Client(params).sign(targetUrl, {
    method: 'PUT',
    headers: {
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    },
    aws: {
      signQuery: true,
    },
  })

  return signedRequest.url.toString()
}

/**
 * Reads object metadata directly from the R2 S3 API.
 *
 * @param params Remote head parameters.
 * @returns Minimal object metadata when the object exists, otherwise `null`.
 */
export const headR2ObjectViaApi = async (params: {
  accountId: string
  bucket: string
  objectKey: string
  accessKeyId: string
  secretAccessKey: string
  fetchFn?: typeof fetch
}): Promise<{ size: number; contentType: string | null } | null> => {
  const response = await executeR2Request(params, { method: 'HEAD' })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throwR2RequestError('head', response)
  }

  return {
    size: Number(response.headers.get('content-length') ?? 0),
    contentType: response.headers.get('content-type'),
  }
}

/**
 * Writes an object directly to the R2 S3 API.
 *
 * @param params Remote put parameters.
 * @returns Nothing.
 */
export const putR2ObjectViaApi = async (params: {
  accountId: string
  bucket: string
  objectKey: string
  accessKeyId: string
  secretAccessKey: string
  body: BodyInit
  contentType: string
  fetchFn?: typeof fetch
}): Promise<void> => {
  const response = await executeR2Request(params, {
    method: 'PUT',
    headers: {
      'content-type': params.contentType,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    },
    body: params.body,
  })

  if (!response.ok) {
    throwR2RequestError('put', response)
  }
}

/**
 * Reads a JSON object directly from the R2 S3 API.
 *
 * @param params Remote get parameters.
 * @returns Parsed JSON payload when the object exists, otherwise `null`.
 */
export const readR2JsonViaApi = async <T>(params: {
  accountId: string
  bucket: string
  objectKey: string
  accessKeyId: string
  secretAccessKey: string
  fetchFn?: typeof fetch
}): Promise<T | null> => {
  const response = await executeR2Request(params, { method: 'GET' })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throwR2RequestError('get', response)
  }

  return (await response.json()) as T
}

/**
 * Reads a binary object directly from the R2 S3 API.
 *
 * @param params Remote get parameters.
 * @returns Object bytes plus content type when the object exists, otherwise `null`.
 */
export const readR2ObjectViaApi = async (params: {
  accountId: string
  bucket: string
  objectKey: string
  accessKeyId: string
  secretAccessKey: string
  fetchFn?: typeof fetch
}): Promise<{ body: Uint8Array; contentType: string | null } | null> => {
  const response = await executeR2Request(params, { method: 'GET' })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    throwR2RequestError('get', response)
  }

  return {
    body: new Uint8Array(await response.arrayBuffer()),
    contentType: response.headers.get('content-type'),
  }
}

// ---
/********************
 *  4. METADATA READS AND SHAPING
 ************/
// +++ Metadata Reads And Shaping

/**
 * Reads the latest metadata version from an image manifest.
 *
 * @param bucket Originals bucket for the current readable stage.
 * @param publicId Canonical image public identifier.
 * @returns Manifest version when available, otherwise `null`.
 */
export const readManifestVersion = async (
  bucket: ImageBucket,
  publicId: string,
): Promise<number | null> => {
  const manifest = await readJson<{ version?: number }>(
    await safeBucketGet(bucket, toManifestObjectKey(publicId)),
  )
  return typeof manifest?.version === 'number' ? manifest.version : null
}

/**
 * Reads the best available metadata document for an image across readable stages.
 *
 * @param params Metadata lookup parameters.
 * @param params.platform Cloudflare platform bindings from the current request context.
 * @param params.env Requested image stage.
 * @param params.publicId Canonical image public identifier.
 * @param params.version Optional explicit metadata version to read.
 * @returns Metadata document plus the stage and version that resolved successfully.
 * @remarks When a versioned metadata object is missing, this falls back to the unversioned key
 * for the same stage before continuing to the next readable stage.
 */
export const readMetadataDocument = async ({
  platform,
  env,
  publicId,
  version,
  fetchFn,
}: {
  platform: App.Platform | undefined
  env: ImageStage
  publicId: string
  version?: number
  fetchFn?: typeof fetch
}): Promise<{
  document: ImageMetadataDocument | null
  resolvedEnv: ImageStage
  resolvedVersion?: number
}> => {
  const normalizedPublicId = normalizePublicId(publicId)

  for (const readableStage of getReadableStages(env)) {
    const bucket = getOriginalsBucketForStage(platform, readableStage)
    const resolvedVersion =
      typeof version === 'number'
        ? version
        : ((
            await readJsonViaBindingsOrApi<{ version?: number }>({
              platform,
              stage: readableStage,
              bucket,
              key: toManifestObjectKey(normalizedPublicId),
              fetchFn,
            })
          )?.version ?? null)
    const versionedKey = toMetadataObjectKey(
      normalizedPublicId,
      resolvedVersion ?? undefined,
    )
    const unversionedKey = toMetadataObjectKey(normalizedPublicId)
    const document = await readJsonViaBindingsOrApi<ImageMetadataDocument>({
      platform,
      stage: readableStage,
      bucket,
      key: versionedKey,
      fetchFn,
    })

    if (!document && resolvedVersion !== undefined) {
      const fallback = await readJsonViaBindingsOrApi<ImageMetadataDocument>({
        platform,
        stage: readableStage,
        bucket,
        key: unversionedKey,
        fetchFn,
      })
      if (fallback) {
        return {
          document: fallback,
          resolvedEnv: readableStage,
          resolvedVersion: resolvedVersion ?? undefined,
        }
      }
      continue
    }

    if (document) {
      return {
        document,
        resolvedEnv: readableStage,
        resolvedVersion: resolvedVersion ?? undefined,
      }
    }
  }

  return { document: null, resolvedEnv: env, resolvedVersion: version }
}

/**
 * Shapes a metadata document for the requested response profile.
 *
 * @param document Full metadata document read from storage.
 * @param profile Metadata profile requested by the caller.
 * @returns Full metadata for admin/full profiles, otherwise the public basic subset.
 */
export const toMetadataProfilePayload = (
  document: ImageMetadataDocument,
  profile: ImageMetadataProfile,
): ImageMetadataBasic | ImageMetadataFull => {
  if (profile === 'full' || profile === 'auto' || profile === 'admin') {
    return document
  }

  return {
    originalFilename: document.originalFilename ?? null,
    originalExtension: document.originalExtension ?? null,
    originalWidth: document.originalWidth ?? null,
    originalHeight: document.originalHeight ?? null,
    rotation: document.rotation ?? 0,
    cameraModel: document.cameraModel ?? null,
    capturedAt: document.capturedAt ?? null,
    credit: document.credit ?? null,
    latitude: document.latitude ?? null,
    longitude: document.longitude ?? null,
  }
}
