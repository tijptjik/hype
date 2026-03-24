// ENUMS
import { ImageEnv } from '$lib/enums'
// TYPES
import type {
  ImageMetadataBasic,
  ImageMetadataFull,
  ImageMetadataProfile,
} from '$lib/db/zod/schema/image.types'
import { error } from '@sveltejs/kit'

type ImageStage = `${ImageEnv}`

export type ImageMetadataDocument = ImageMetadataFull

const IMAGE_METADATA_SUFFIX = '.json'
const IMAGE_MANIFEST_SUFFIX = '.manifest.json'

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
): R2Bucket => {
  if (!platform) throw error(500, 'Platform not available')

  switch (stage) {
    case ImageEnv.production:
      return platform.env.IMAGE_ORIGINALS_PRODUCTION
    case ImageEnv.preview:
      return platform.env.IMAGE_ORIGINALS_PREVIEW
    case ImageEnv.local:
    default:
      return platform.env.IMAGE_ORIGINALS_LOCAL
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
): R2Bucket => {
  if (!platform) throw error(500, 'Platform not available')

  switch (stage) {
    case ImageEnv.production:
      return platform.env.IMAGE_DERIVED_PRODUCTION
    case ImageEnv.preview:
      return platform.env.IMAGE_DERIVED_PREVIEW
    case ImageEnv.local:
    default:
      return platform.env.IMAGE_DERIVED_LOCAL
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
    case ImageEnv.production:
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
    ? `${publicId}.v${version}${IMAGE_METADATA_SUFFIX}`
    : `${publicId}${IMAGE_METADATA_SUFFIX}`

/**
 * Builds the manifest object key for an image metadata manifest.
 *
 * @param publicId Canonical image public identifier.
 * @returns Object key used to store the manifest document in R2.
 */
export const toManifestObjectKey = (publicId: string): string =>
  `${publicId}${IMAGE_MANIFEST_SUFFIX}`

/**
 * Reads the public image base URL configured for the current build.
 *
 * @returns Configured public base URL, or an empty string when unset.
 */
export const toPublicImageBaseUrl = (): string =>
  import.meta.env.PUBLIC_IMAGE_BASE_URL || ''

/**
 * Parses a JSON object body from R2 when present.
 *
 * @param object R2 object body returned from a bucket read.
 * @returns Parsed JSON payload, or `null` when the object does not exist.
 */
const readJson = async <T>(object: R2ObjectBody | null): Promise<T | null> => {
  if (!object) return null
  return (await object.json()) as T
}

/**
 * Reads the latest metadata version from an image manifest.
 *
 * @param bucket Originals bucket for the current readable stage.
 * @param publicId Canonical image public identifier.
 * @returns Manifest version when available, otherwise `null`.
 */
export const readManifestVersion = async (
  bucket: R2Bucket,
  publicId: string,
): Promise<number | null> => {
  const manifest = await readJson<{ version?: number }>(
    await bucket.get(toManifestObjectKey(publicId)),
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
}: {
  platform: App.Platform | undefined
  env: ImageStage
  publicId: string
  version?: number
}): Promise<{
  document: ImageMetadataDocument | null
  resolvedEnv: ImageStage
  resolvedVersion?: number
}> => {
  for (const readableStage of getReadableStages(env)) {
    const bucket = getOriginalsBucketForStage(platform, readableStage)
    const resolvedVersion =
      typeof version === 'number'
        ? version
        : await readManifestVersion(bucket, publicId)
    const object = await bucket.get(
      toMetadataObjectKey(publicId, resolvedVersion ?? undefined),
    )

    if (!object && resolvedVersion !== undefined) {
      const fallback = await bucket.get(toMetadataObjectKey(publicId))
      const document = await readJson<ImageMetadataDocument>(fallback)
      if (document) {
        return { document, resolvedEnv: readableStage, resolvedVersion }
      }
      continue
    }

    const document = await readJson<ImageMetadataDocument>(object)
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
    cameraModel: document.cameraModel ?? null,
    capturedAt: document.capturedAt ?? null,
    credit: document.credit ?? null,
    latitude: document.latitude ?? null,
    longitude: document.longitude ?? null,
  }
}
