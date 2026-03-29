// REMOTE
import { guardedCommand, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// AUTHORIZATION
import {
  authorizeImageList,
  authorizeImageRead,
  toAuthMessage,
} from '$lib/api/services/authz'
// API SERVICES
import {
  assertPermissionsToCreateImage,
  assertPermissionsToDeleteImage,
  assertPermissionsToUpdateImage,
  getImageByIdsQueryContext,
  getImageEntityQueryContext,
  getImageQueryContext,
  toImageProfile,
  toResponseShape,
  toResponseShapeProjectOrOrganisation,
  updateImageForContext,
  enqueueDerivedAssetWarmup,
} from '$lib/api/services/image'
// DB SERVICES
import {
  createFeatureImage,
  createImage as createImageRecord,
  createTaskImagesFromImageIds,
  getImageById as loadImageById,
  toImageEnvelope,
  getImageForContextType,
  getImagesByIds,
  toImageEntityResponseShape,
  toImageListResponseShape,
} from '$lib/db/services/image'
import { updateOrganisationById } from '$lib/db/services/organisation'
import { updateProjectById } from '$lib/db/services/project'
import { getUserById } from '$lib/db/services/user'
// DB SCHEMA
import {
  feature,
  hub,
  image,
  organisation,
  project,
  task,
  user as userTable,
} from '$lib/db/schema'
// SCHEMA
import {
  DeleteImageSchema,
  ImageByIdSchema,
  ImageInsertWithHubAPI,
  ImageInsertWithFeatureAPI,
  ImageInsertWithProjectOrOrganisationAPI,
  ImagesByContextSchema,
  ImagesByIdsSchema,
  SetImageIntentSchema,
  SetImagePublishedSchema,
  RotateImageSchema,
  UpdateImageSchema,
  GetImageMetadataSchema,
  AuthImageUploadSchema,
  FinalizeImageUploadSchema,
} from '$lib/db/zod'
// ENUMS
import {
  ImageContextResource,
  ImageContextResourceExtended,
  ImageEnv,
} from '$lib/enums'
// TYPES
import type { Database, Id, EntityResponse } from '$lib/types'
import type {
  CreateImageParams,
  FinalizeImageUploadLink,
  FinalizeImageUploadParams,
  Image,
  ImageByIdParamsByProfile,
  ImageContextEnvelope,
  ImageContextType,
  ImageDBFlat,
  ImageNew,
  ImageProfile,
  ImagesForContextParamsByProfile,
  ImagesForIdsParamsByProfile,
  ImageUploadSession,
  ImageMetadataResponse,
} from '$lib/db/zod/schema/image.types'
import { createUploadToken, verifyUploadToken } from '$lib/images/auth'
import {
  createPresignedR2UploadUrl,
  getDerivedBucketForStage,
  getOriginalsBucketNameForStage,
  getOriginalsBucketForStage,
  readMetadataDocument,
  readR2ObjectViaApi,
  headR2ObjectViaApi,
  putR2ObjectViaApi,
  type ImageMetadataDocument,
  toManifestObjectKey,
  toMetadataObjectKey,
  toImageStage,
  toMetadataProfilePayload,
} from '$lib/images/storage'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. AUTHORIZATION & QUERY HELPERS
// - toImageAccessActor
// - toListProfile
// - toDetailProfile
// - resolveFeatureImageFeatureId
// - updateFeatureImageFields
// - resolveImageQueryContext
// - probeContextState
//
// 2. STORAGE & METADATA HELPERS
// - attachImageLinks
// - safeOriginalsBucketGet
// - safeOriginalsBucketHead
// - waitForOriginalUploadVisibility
// - verifyUploadedOriginal
// - readOriginalObjectViaBindingsOrApi
// - putOriginalObjectViaBindingsOrApi
// - persistOriginalMetadataSidecars
// - deleteBucketKeys
// - deleteBucketPrefix
// - loadCurrentResourceImage
// - cleanupDetachedResourceImage
// - normalizeRotation
// - rotateStoredImageObject
// - rotateDimensionsForRotation
// - toRotatedMetadataDocument
// - buildReplacementMetadataDocument
//
// 3. IMAGE RECORD MUTATIONS
// - createImageInContext
//
// 4. QUERIES
// - getImagesForContext
// - getImagesForIds
// - getImageById
// - getMetadata
//
// 5. COMMANDS
// - authImageUpload
// - finalizeImageUpload
// - createImage
// - updateImage
// - setImageIntent
// - setImagePublished
// - rotateImage
// - deleteImage

type StorageApiCredentials = {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
}

type ImageAccessActor = {
  userId: Id
  userRoles: string[]
  isAuthenticated: true
  isAnonymous: boolean
}

type UpdateImageForContextParams = Parameters<typeof updateImageForContext>[0]

/**
 * Builds the normalized authorization actor shape used by image policy checks.
 *
 * @param user Current authenticated user.
 * @param userRoles Current user roles.
 * @returns Authorization actor payload.
 */
const toImageAccessActor = (
  user: { id: Id; isAnonymous: boolean },
  userRoles: string[],
): ImageAccessActor => ({
  userId: user.id,
  userRoles,
  isAuthenticated: true,
  isAnonymous: user.isAnonymous,
})

/**
 * Resolves the profile for list-oriented image reads.
 *
 * @param profile Requested profile override.
 * @returns Normalized list profile.
 */
const toListProfile = <P extends ImageProfile | undefined>(
  profile: P,
): ReturnType<typeof toImageProfile> => toImageProfile(profile, 'list')

/**
 * Resolves the profile for detail-oriented image reads.
 *
 * @param profile Requested profile override.
 * @returns Normalized detail profile.
 */
const toDetailProfile = <P extends ImageProfile | undefined>(
  profile: P,
): ReturnType<typeof toImageProfile> => toImageProfile(profile, 'detail')

/**
 * Reads direct R2 API credentials from the current worker environment.
 *
 * @param platform Current worker platform.
 * @returns Storage API credentials when configured, otherwise `null`.
 */
const getStorageApiCredentials = (
  platform: App.Platform | undefined,
): StorageApiCredentials | null => {
  const accountId = platform?.env.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = platform?.env.R2_S3_ACCESS_KEY_ID
  const secretAccessKey = platform?.env.R2_S3_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null
  }

  return { accountId, accessKeyId, secretAccessKey }
}

/**
 * Resolves the effective feature id used by feature-image mutations.
 *
 * @param params Feature mutation parameters.
 * @returns Feature id for the mutation.
 */
const resolveFeatureImageFeatureId = (params: {
  featureId?: Id
  ctxType: ImageContextType
  ctxId: Id
}): Id | undefined =>
  params.featureId ??
  (params.ctxType === ImageContextResource.feature ? params.ctxId : undefined)

/**
 * Applies feature-image updates through the shared image context update pipeline.
 *
 * @param params Feature image mutation inputs.
 * @returns Updated image response.
 */
const updateFeatureImageFields = async (params: {
  db: UpdateImageForContextParams['db']
  user: UpdateImageForContextParams['user']
  userId: UpdateImageForContextParams['userId']
  userRoles: UpdateImageForContextParams['userRoles']
  event: UpdateImageForContextParams['event']
  id: Id
  ctxType: ImageContextType
  ctxId: Id
  featureId?: Id
  data: {
    intent?: 'canonical' | 'closeUp' | 'context' | 'general' | 'undefined'
    isPublished?: boolean
  }
}) => {
  const featureId = resolveFeatureImageFeatureId({
    featureId: params.featureId,
    ctxType: params.ctxType,
    ctxId: params.ctxId,
  })

  if (!featureId) {
    throw error(400, 'featureId is required for feature image updates')
  }

  return updateImageForContext({
    db: params.db,
    user: params.user,
    userId: params.userId,
    userRoles: params.userRoles,
    event: params.event,
    id: params.id,
    ctxType: params.ctxType,
    ctxId: params.ctxId,
    data: {
      id: params.id,
      imageId: params.id,
      featureId,
      ...params.data,
    },
  })
}

/**
 * Resolves whether the primary query should be narrowed to a task-specific image context.
 *
 * @param params Context query params.
 * @returns Effective context type and id used for the image query.
 */
const resolveImageQueryContext = (params: {
  ctxType: ImageContextType
  ctxId: Id
  ctxNarrowingType?: ImageContextResourceExtended
  ctxNarrowingId?: Id
}): {
  ctxType: ImageContextResource | ImageContextResourceExtended
  ctxId: Id
} =>
  params.ctxNarrowingType === ImageContextResourceExtended.task && params.ctxNarrowingId
    ? {
        ctxType: ImageContextResourceExtended.task,
        ctxId: params.ctxNarrowingId,
      }
    : {
        ctxType: params.ctxType,
        ctxId: params.ctxId,
      }

/**
 * Loads publication/archive state for the image context's owning resource.
 *
 * @param db Database handle.
 * @param ctxType Context resource type.
 * @param ctxId Context resource id.
 * @returns Authorization-relevant resource state.
 */
const probeContextState = async (
  db: Database,
  ctxType: ImageContextType,
  ctxId: Id,
): Promise<{
  resourceHubId?: string | null
  requestedState: { isPublished?: boolean; isArchived?: boolean }
}> => {
  if (ctxType === ImageContextResource.feature) {
    const [row] = await db
      .select({
        isPublished: feature.isPublished,
        isArchived: feature.isArchived,
        resourceHubId: organisation.hubId,
      })
      .from(feature)
      .innerJoin(project, eq(feature.projectId, project.id))
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(feature.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return { resourceHubId: row.resourceHubId, requestedState: row }
  }

  if (ctxType === ImageContextResource.project) {
    const [row] = await db
      .select({
        isPublished: project.isPublished,
        isArchived: project.isArchived,
        resourceHubId: organisation.hubId,
      })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(project.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return { resourceHubId: row.resourceHubId, requestedState: row }
  }

  if (ctxType === ImageContextResource.organisation) {
    const [row] = await db
      .select({
        isPublished: organisation.isPublished,
        isArchived: organisation.isArchived,
        resourceHubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return { resourceHubId: row.resourceHubId, requestedState: row }
  }

  if (ctxType === ImageContextResource.hub) {
    const [row] = await db
      .select({ isPublished: hub.isPublished, isArchived: hub.isArchived })
      .from(hub)
      .where(eq(hub.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return {
      resourceHubId: ctxId,
      requestedState: { isPublished: row.isPublished, isArchived: row.isArchived },
    }
  }

  if (ctxType === ImageContextResource.user) {
    const [row] = await db
      .select({ isArchived: userTable.isArchived })
      .from(userTable)
      .where(eq(userTable.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return { requestedState: { isPublished: true, isArchived: row.isArchived } }
  }

  const [row] = await db
    .select({
      isPublished: feature.isPublished,
      isArchived: feature.isArchived,
      resourceHubId: organisation.hubId,
    })
    .from(task)
    .innerJoin(feature, eq(task.featureId, feature.id))
    .innerJoin(project, eq(feature.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(eq(task.id, ctxId))
    .limit(1)

  if (!row) throw error(404, 'Context resource not found')
  return { resourceHubId: row.resourceHubId, requestedState: row }
}

/**
 * Attaches secondary links, such as task-image relations, after image creation.
 *
 * @param params Attachment parameters.
 * @returns Nothing.
 */
const attachImageLinks = async (params: {
  db: Database
  imageId: Id
  links?: FinalizeImageUploadLink[]
}): Promise<void> => {
  for (const link of params.links ?? []) {
    if (link.type === 'taskImage') {
      await createTaskImagesFromImageIds(params.db, link.taskId, [params.imageId])
    }
  }
}

const loadSharp = async (): Promise<typeof import('sharp').default> => {
  const module = await import('sharp')
  return module.default
}

const decodeXmlEntities = (value: string): string =>
  value
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')

const normalizeEditorTool = (value: string | null | undefined): string | null => {
  if (!value) return null

  const normalized = decodeXmlEntities(value).replace(/\s+/gu, ' ').trim()

  return normalized.length > 1 ? normalized : null
}

/**
 * Reads an originals-bucket object while tolerating provider-level get errors.
 *
 * @param bucket Bound raw/originals bucket.
 * @param key Object key to read.
 * @returns The object when available, otherwise `null`.
 */
const safeOriginalsBucketGet = async (
  bucket: ReturnType<typeof getOriginalsBucketForStage>,
  key: string,
): Promise<
  Awaited<ReturnType<ReturnType<typeof getOriginalsBucketForStage>['get']>>
> => {
  try {
    return await bucket.get(key)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const isLocalReadFailure = message.includes('get: Unspecified error (0)')

    if (!isLocalReadFailure) {
      console.error('[image.remote.safeOriginalsBucketGet] get failed', {
        key,
        cause,
      })
    }

    return null
  }
}

/**
 * Reads originals-bucket object metadata while tolerating provider-level head errors.
 *
 * @param bucket Bound raw/originals bucket.
 * @param key Object key to inspect.
 * @returns The object metadata when available, otherwise `null`.
 */
const safeOriginalsBucketHead = async (
  bucket: ReturnType<typeof getOriginalsBucketForStage>,
  key: string,
): Promise<
  Awaited<ReturnType<ReturnType<typeof getOriginalsBucketForStage>['head']>>
> => {
  try {
    return await bucket.head(key)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    const isLocalReadFailure = message.includes('head: Unspecified error (0)')

    if (!isLocalReadFailure) {
      console.error('[image.remote.safeOriginalsBucketHead] head failed', {
        key,
        cause,
      })
    }

    return null
  }
}

/**
 * Retries the originals-bucket `head` check briefly after a direct upload so
 * finalize does not fail on transient storage visibility lag.
 *
 * @param bucket Bound originals bucket.
 * @param key Uploaded object key to probe.
 * @returns Object metadata once visible, otherwise `null`.
 */
const waitForOriginalUploadVisibility = async (
  bucket: ReturnType<typeof getOriginalsBucketForStage>,
  key: string,
): Promise<
  Awaited<ReturnType<ReturnType<typeof getOriginalsBucketForStage>['head']>>
> => {
  const maxAttempts = 5
  const baseDelayMs = 120

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const uploadedObject = await safeOriginalsBucketHead(bucket, key)

    if (uploadedObject) {
      return uploadedObject
    }

    if (attempt === maxAttempts - 1) {
      return null
    }

    await new Promise(resolve => setTimeout(resolve, baseDelayMs * (attempt + 1)))
  }

  return null
}

/**
 * Verifies an uploaded original through the Worker bucket binding first, then
 * falls back to a direct R2 API `HEAD` when local/dev bindings cannot see the
 * remotely uploaded object yet.
 *
 * @param params Visibility probe parameters.
 * @returns Minimal uploaded-object metadata or `null`.
 */
const verifyUploadedOriginal = async (params: {
  bucket: ReturnType<typeof getOriginalsBucketForStage>
  key: string
  stage: ReturnType<typeof toImageStage>
  event: {
    platform: App.Platform | undefined
    fetch: typeof fetch
  }
}): Promise<{ size: number; contentType: string | null } | null> => {
  const bucketObject = await waitForOriginalUploadVisibility(params.bucket, params.key)

  if (bucketObject) {
    return {
      size: bucketObject.size,
      contentType: bucketObject.httpMetadata?.contentType ?? null,
    }
  }

  const credentials = getStorageApiCredentials(params.event.platform)

  if (!credentials) {
    return null
  }

  return headR2ObjectViaApi({
    ...credentials,
    bucket: getOriginalsBucketNameForStage(params.stage),
    objectKey: params.key,
    fetchFn: params.event.fetch,
  })
}

/**
 * Reads an original image object through the binding first, then falls back to
 * the direct R2 API when the local/dev binding cannot see the remote object.
 *
 * @param params Read parameters.
 * @returns Original bytes plus content type, or `null` when the object does not exist.
 */
const readOriginalObjectViaBindingsOrApi = async (params: {
  bucket: ReturnType<typeof getOriginalsBucketForStage>
  key: string
  stage: ReturnType<typeof toImageStage>
  event: {
    platform: App.Platform | undefined
    fetch: typeof fetch
  }
}): Promise<{ body: Uint8Array; contentType: string | null } | null> => {
  const bucketObject = await safeOriginalsBucketGet(params.bucket, params.key)

  if (bucketObject) {
    return {
      body: new Uint8Array(await bucketObject.arrayBuffer()),
      contentType: bucketObject.httpMetadata?.contentType ?? null,
    }
  }

  const credentials = getStorageApiCredentials(params.event.platform)

  if (!credentials) {
    return null
  }

  return readR2ObjectViaApi({
    ...credentials,
    bucket: getOriginalsBucketNameForStage(params.stage),
    objectKey: params.key,
    fetchFn: params.event.fetch,
  })
}

/**
 * Writes an original image object through the binding first, then falls back to
 * the direct R2 API when the binding cannot write to the same remote bucket.
 *
 * @param params Write parameters.
 * @returns Nothing.
 */
const putOriginalObjectViaBindingsOrApi = async (params: {
  bucket: ReturnType<typeof getOriginalsBucketForStage>
  key: string
  body: Uint8Array
  contentType: string
  stage: ReturnType<typeof toImageStage>
  event: {
    platform: App.Platform | undefined
    fetch: typeof fetch
  }
}): Promise<void> => {
  try {
    await params.bucket.put(params.key, params.body, {
      httpMetadata: {
        contentType: params.contentType,
      },
    })
    return
  } catch (cause) {
    const credentials = getStorageApiCredentials(params.event.platform)

    if (!credentials) {
      throw cause
    }

    console.warn(
      '[image.remote.rotateImage] bucket original put failed; falling back to direct R2 API',
      {
        key: params.key,
        cause,
      },
    )

    await putR2ObjectViaApi({
      ...credentials,
      bucket: getOriginalsBucketNameForStage(params.stage),
      objectKey: params.key,
      body: params.body,
      contentType: params.contentType,
      fetchFn: params.event.fetch,
    })
  }
}

/**
 * Persists metadata sidecars beside the original upload, using the Worker
 * bucket binding first and falling back to direct R2 API writes in local/dev
 * environments where the binding cannot write to the same remote bucket.
 *
 * @param params Metadata persistence parameters.
 * @returns Nothing.
 */
const persistOriginalMetadataSidecars = async (params: {
  bucket: ReturnType<typeof getOriginalsBucketForStage>
  publicId: string
  version: number
  metadataDocument: ImageMetadataDocument
  manifestDocument: { publicId: string; version: number; updatedAt: string }
  stage: ReturnType<typeof toImageStage>
  event: {
    platform: App.Platform | undefined
    fetch: typeof fetch
  }
}): Promise<void> => {
  const writes = [
    {
      key: toMetadataObjectKey(params.publicId),
      body: JSON.stringify(params.metadataDocument),
    },
    {
      key: toMetadataObjectKey(params.publicId, params.version),
      body: JSON.stringify(params.metadataDocument),
    },
    {
      key: toManifestObjectKey(params.publicId),
      body: JSON.stringify(params.manifestDocument),
    },
  ] as const

  try {
    for (const write of writes) {
      await params.bucket.put(write.key, write.body, {
        httpMetadata: { contentType: 'application/json' },
      })
    }
    return
  } catch (cause) {
    const credentials = getStorageApiCredentials(params.event.platform)

    if (!credentials) {
      throw cause
    }

    console.warn(
      '[image.remote.finalizeImageUpload] bucket metadata put failed; falling back to direct R2 API',
      {
        publicId: params.publicId,
        cause,
      },
    )

    for (const write of writes) {
      await putR2ObjectViaApi({
        ...credentials,
        bucket: getOriginalsBucketNameForStage(params.stage),
        objectKey: write.key,
        body: write.body,
        contentType: 'application/json',
        fetchFn: params.event.fetch,
      })
    }
  }
}

const deleteBucketKeys = async (
  bucket: ReturnType<typeof getOriginalsBucketForStage>,
  keys: string[],
): Promise<void> => {
  const uniqueKeys = Array.from(new Set(keys.filter(Boolean)))
  if (uniqueKeys.length === 0) return

  try {
    await bucket.delete(uniqueKeys)
  } catch (error) {
    console.error('[image.remote.deleteBucketKeys] delete failed', {
      keys: uniqueKeys,
      error,
    })
  }
}

const deleteBucketPrefix = async (
  bucket: ReturnType<typeof getOriginalsBucketForStage>,
  prefix: string,
): Promise<void> => {
  let cursor: string | undefined

  do {
    const listed = await bucket.list({
      prefix,
      ...(cursor ? { cursor } : {}),
    })
    const keys = listed.objects.map(object => object.key)

    await deleteBucketKeys(bucket, keys)
    cursor = listed.truncated ? listed.cursor : undefined
  } while (cursor)
}

/**
 * Loads the currently linked image for single-image resources before replacement.
 *
 * @param db Database handle.
 * @param ctxType Single-image resource type.
 * @param ctxId Resource id.
 * @returns Linked image record when present.
 */
const loadCurrentResourceImage = async (
  db: Database,
  ctxType: ImageContextResource,
  ctxId: Id,
): Promise<ImageDBFlat | null> => {
  if (ctxType === ImageContextResource.project) {
    const row = await db
      .select({ imageId: project.imageId })
      .from(project)
      .where(eq(project.id, ctxId))
      .limit(1)
    const imageId = row[0]?.imageId
    return imageId ? ((await loadImageById(db, [eq(image.id, imageId)])) ?? null) : null
  }

  if (ctxType === ImageContextResource.organisation) {
    const row = await db
      .select({ imageId: organisation.imageId })
      .from(organisation)
      .where(eq(organisation.id, ctxId))
      .limit(1)
    const imageId = row[0]?.imageId
    return imageId ? ((await loadImageById(db, [eq(image.id, imageId)])) ?? null) : null
  }

  if (ctxType === ImageContextResource.hub) {
    const row = await db
      .select({ imageId: hub.imageId })
      .from(hub)
      .where(eq(hub.id, ctxId))
      .limit(1)
    const imageId = row[0]?.imageId
    return imageId ? ((await loadImageById(db, [eq(image.id, imageId)])) ?? null) : null
  }

  return null
}

/**
 * Deletes a detached single-resource image plus any originals and derived sidecars.
 *
 * @param params Cleanup inputs.
 * @returns Nothing.
 */
const cleanupDetachedResourceImage = async (params: {
  db: Database
  platform: App.Platform | undefined
  image: ImageDBFlat
}): Promise<void> => {
  const stage = toImageStage(params.image.env)
  const originalsBucket = getOriginalsBucketForStage(params.platform, stage)
  const derivedBucket = getDerivedBucketForStage(params.platform, stage)

  await Promise.all([
    deleteBucketKeys(originalsBucket, [
      params.image.publicId,
      toMetadataObjectKey(params.image.publicId),
      toManifestObjectKey(params.image.publicId),
      ...(typeof params.image.version === 'number'
        ? [toMetadataObjectKey(params.image.publicId, params.image.version)]
        : []),
    ]),
    deleteBucketPrefix(originalsBucket, `${params.image.publicId}.v`),
    deleteBucketPrefix(derivedBucket, `${params.image.publicId}/`),
  ])

  await params.db.delete(image).where(eq(image.id, params.image.id))
}

/**
 * Normalizes a rotation value into the quarter-turn values supported by the editor.
 *
 * @param rotation Rotation value to normalize.
 * @returns Rotation modulo 360 constrained to supported quarter turns.
 */
const normalizeRotation = (rotation: number | null | undefined): 0 | 90 | 180 | 270 => {
  const normalized = (((rotation ?? 0) % 360) + 360) % 360

  if (normalized === 90 || normalized === 180 || normalized === 270) {
    return normalized
  }

  return 0
}

/**
 * Rotates a stored image object relative to its displayed orientation.
 *
 * @param params Rotation inputs for a single R2 object body.
 * @returns The rotated bytes plus the content type that should be persisted.
 */
const rotateStoredImageObject = async (params: {
  body: ArrayBuffer
  contentType?: string | null
  rotation: 0 | 90 | 180 | 270
}): Promise<{
  body: Uint8Array
  contentType: string
  sourceOrientation: number | null
  sourceWidth: number | null
  sourceHeight: number | null
}> => {
  const input = new Uint8Array(params.body)
  const sharp = await loadSharp()
  const source = sharp(input, {
    animated: false,
    limitInputPixels: false,
  })
  const metadata = await source.metadata()

  if ((metadata.pages ?? 1) > 1) {
    throw error(400, 'Animated images cannot be rotated in-place')
  }

  let pipeline = sharp(input, {
    animated: false,
    limitInputPixels: false,
  }).rotate(params.rotation)

  if (metadata.format === 'jpeg') {
    pipeline = pipeline.jpeg({ mozjpeg: true, quality: 90 })
  } else if (metadata.format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9 })
  } else if (metadata.format === 'webp') {
    pipeline = pipeline.webp({ quality: 90 })
  } else if (metadata.format === 'tiff') {
    pipeline = pipeline.tiff({ compression: 'lzw', quality: 90 })
  }

  const rotated = await pipeline.toBuffer()

  const contentType =
    metadata.format === 'jpeg'
      ? 'image/jpeg'
      : metadata.format === 'png'
        ? 'image/png'
        : metadata.format === 'webp'
          ? 'image/webp'
          : metadata.format === 'tiff'
            ? 'image/tiff'
            : params.contentType || 'application/octet-stream'

  return {
    body: new Uint8Array(rotated),
    contentType,
    sourceOrientation: metadata.orientation ?? null,
    sourceWidth: metadata.width ?? null,
    sourceHeight: metadata.height ?? null,
  }
}

/**
 * Applies an absolute quarter-turn rotation to image dimensions.
 *
 * @param width Existing width value.
 * @param height Existing height value.
 * @returns Rotated width/height pair.
 */
const rotateDimensionsForRotation = (
  width: number | null | undefined,
  height: number | null | undefined,
  rotation: 0 | 90 | 180 | 270,
): {
  width: number | null | undefined
  height: number | null | undefined
} =>
  rotation === 90 || rotation === 270
    ? {
        width: height ?? null,
        height: width ?? null,
      }
    : {
        width: width ?? null,
        height: height ?? null,
      }

/**
 * Updates the persisted metadata document to reflect an in-place rotation.
 *
 * @param params Current metadata document and new manifest version metadata.
 * @returns Rotated metadata document for unversioned and versioned sidecars.
 */
const toRotatedMetadataDocument = (params: {
  document: ImageMetadataDocument
  rotation: 0 | 90 | 180 | 270
  version: number
  timestamp: string
}): ImageMetadataDocument => {
  const originalDimensions = rotateDimensionsForRotation(
    params.document.originalWidth,
    params.document.originalHeight,
    params.rotation,
  )
  const metadataEntries = params.document.metadata
    ? { ...params.document.metadata }
    : null

  if (metadataEntries) {
    const uploadedDimensions = rotateDimensionsForRotation(
      metadataEntries.uploadedWidth
        ? Number.parseInt(metadataEntries.uploadedWidth, 10)
        : null,
      metadataEntries.uploadedHeight
        ? Number.parseInt(metadataEntries.uploadedHeight, 10)
        : null,
      params.rotation,
    )

    if (uploadedDimensions.width !== null && !Number.isNaN(uploadedDimensions.width)) {
      metadataEntries.uploadedWidth = String(uploadedDimensions.width)
    }
    if (
      uploadedDimensions.height !== null &&
      !Number.isNaN(uploadedDimensions.height)
    ) {
      metadataEntries.uploadedHeight = String(uploadedDimensions.height)
    }
  }

  return {
    ...params.document,
    originalWidth: originalDimensions.width ?? null,
    originalHeight: originalDimensions.height ?? null,
    rotation: params.rotation,
    metadata: metadataEntries,
    sourceVersion: params.version,
    modifiedAt: params.timestamp,
  }
}

const buildReplacementMetadataDocument = (params: {
  existingDocument: ImageMetadataDocument | null
  incomingDocument: ImageMetadataDocument
  version: number
  timestamp: string
  editorUserId: string
  editorName: string | null
  editorAttribution: string | null
}): ImageMetadataDocument => {
  const existingMetadataEntries = params.existingDocument?.metadata
    ? { ...params.existingDocument.metadata }
    : {}
  const incomingMetadataEntries = params.incomingDocument.metadata
    ? { ...params.incomingDocument.metadata }
    : {}

  const mergedMetadataEntries = {
    ...existingMetadataEntries,
    ...incomingMetadataEntries,
    replacementEditedAt: params.timestamp,
    replacementEditedByUserId: params.editorUserId,
    replacementEditedWith:
      normalizeEditorTool(incomingMetadataEntries.editorTool) ?? 'Admin replace flow',
  }

  if (params.editorName) {
    mergedMetadataEntries.replacementEditedByName = params.editorName
  }

  if (params.editorAttribution) {
    mergedMetadataEntries.replacementEditedByAttribution = params.editorAttribution
  }

  if (params.existingDocument) {
    mergedMetadataEntries.originalMetadataSnapshot = JSON.stringify(
      params.existingDocument,
    )
  }

  return {
    ...params.incomingDocument,
    cameraModel:
      params.incomingDocument.cameraModel ??
      params.existingDocument?.cameraModel ??
      null,
    capturedAt:
      params.incomingDocument.capturedAt ?? params.existingDocument?.capturedAt ?? null,
    credit: params.incomingDocument.credit ?? params.existingDocument?.credit ?? null,
    latitude:
      params.incomingDocument.latitude ?? params.existingDocument?.latitude ?? null,
    longitude:
      params.incomingDocument.longitude ?? params.existingDocument?.longitude ?? null,
    metadata:
      Object.keys(mergedMetadataEntries).length > 0 ? mergedMetadataEntries : null,
    sourceVersion: params.version,
    uploadedAt: params.incomingDocument.uploadedAt ?? params.timestamp,
    modifiedAt: params.timestamp,
  }
}

/**
 * Creates an image record and any resource-specific linking rows for the given context.
 *
 * @param params Creation inputs.
 * @returns Created image envelope.
 */
const createImageInContext = async (params: {
  db: Database
  userId: Id
  imageData: ImageNew
}): Promise<{ data: ImageContextEnvelope<'detail'> }> => {
  const userWithAttribution = await getUserById(params.db, params.userId)

  if (params.imageData.ctxType === ImageContextResource.feature) {
    const validatedData = ImageInsertWithFeatureAPI.parse(params.imageData)
    const createdImage = await createImageRecord(params.db, validatedData)
    const createdFeatureImage = await createFeatureImage(
      params.db,
      {
        ...validatedData.featureImage,
        imageId: createdImage.id,
        featureId: validatedData.ctxId,
        localIsPublished: validatedData.featureImage.localIsPublished ?? null,
        publishedAt: validatedData.featureImage.publishedAt ?? null,
        publisherId: validatedData.featureImage.publisherId ?? null,
      },
      createdImage.id,
    )

    const responseData = await toResponseShape(
      createdImage,
      createdFeatureImage,
      userWithAttribution?.attribution ?? undefined,
    )
    return {
      data: toImageEnvelope(
        responseData as unknown as Image,
        'detail',
        ImageContextResource.feature,
        validatedData.ctxId,
      ),
    }
  }

  if (
    params.imageData.ctxType === ImageContextResource.project ||
    params.imageData.ctxType === ImageContextResource.organisation
  ) {
    const validatedData = ImageInsertWithProjectOrOrganisationAPI.parse(
      params.imageData,
    )
    const createdImage = await createImageRecord(params.db, validatedData)

    if (validatedData.ctxType === ImageContextResource.project) {
      await updateProjectById(
        params.db,
        { imageId: createdImage.id },
        validatedData.ctxId,
      )
    } else {
      await updateOrganisationById(
        params.db,
        { imageId: createdImage.id },
        validatedData.ctxId,
      )
    }

    const responseData = await toResponseShapeProjectOrOrganisation(
      createdImage,
      userWithAttribution?.attribution ?? undefined,
    )
    return {
      data: toImageEnvelope(
        responseData,
        'detail',
        validatedData.ctxType as ImageContextType,
        validatedData.ctxId,
      ),
    }
  }

  if (params.imageData.ctxType === ImageContextResource.hub) {
    const validatedData = ImageInsertWithHubAPI.parse(params.imageData)
    const createdImage = await createImageRecord(params.db, validatedData)

    await params.db
      .update(hub)
      .set({ imageId: createdImage.id })
      .where(eq(hub.id, validatedData.ctxId))

    const responseData = await toResponseShapeProjectOrOrganisation(
      createdImage,
      userWithAttribution?.attribution ?? undefined,
    )
    return {
      data: toImageEnvelope(
        responseData,
        'detail',
        validatedData.ctxType as ImageContextType,
        validatedData.ctxId,
      ),
    }
  }

  throw error(400, `Unsupported image context: ${params.imageData.ctxType}`)
}

/**
 * Returns image collections in context.
 */
export const getImagesForContext = guardedQuery(
  ImagesByContextSchema,
  async (params, ctx) => {
    const { db, user, userRoles, isAdminRequest } = ctx
    const profile = toListProfile(params.meta?.profile)
    const context = await probeContextState(
      db,
      params.ctxType as ImageContextType,
      params.ctxId as Id,
    )

    const decision = authorizeImageList(
      toImageAccessActor(user, userRoles),
      {
        ctxType: params.ctxType as ImageContextType,
        ctxId: params.ctxId,
        resourceHubId: context.resourceHubId,
      },
      context.requestedState,
      { isAdminRequest },
    )
    if (!decision.allowed) {
      throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
    }

    // DEPRECATED: Legacy task-as-primary context. Remove after migration to
    // ctxType='feature' + ctxNarrowingType='task' + ctxNarrowingId.
    const queryContext = resolveImageQueryContext({
      ctxType: params.ctxType as ImageContextType,
      ctxId: params.ctxId as Id,
      ctxNarrowingType: params.ctxNarrowingType as ImageContextResourceExtended,
      ctxNarrowingId: params.ctxNarrowingId as Id | undefined,
    })

    const { conditions } = getImageQueryContext(
      user,
      isAdminRequest,
      {},
      queryContext.ctxId,
      queryContext.ctxType,
    )

    const images = (await getImageForContextType(
      db,
      queryContext.ctxType,
      conditions,
      params.pagination,
      params.sorting,
      isAdminRequest,
    )) as Image[]

    return toImageListResponseShape(
      images,
      {
        ctxType: params.ctxType as ImageContextType,
        ctxId: params.ctxId as Id,
      },
      profile,
    )
  },
)

export const getImagesForContextByProfile =
  getImagesForContext as typeof getImagesForContext &
    (<P extends ImageProfile = 'list'>(
      params: ImagesForContextParamsByProfile<P>,
    ) => Promise<EntityResponse<Array<ImageContextEnvelope<P>>> & { profile: P }>)

/**
 * Returns a collection of images by IDs.
 */
export const getImagesForIds = guardedQuery(ImagesByIdsSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest } = ctx
  const profile = toListProfile(params.meta?.profile)
  // TODO(image/getImagesForIds): Transitional cache backfill endpoint.
  // Remove when cache is keyed by { featureId, imageId } and context-aware fetches replace ids lookup.
  const listDecision = authorizeImageList(
    toImageAccessActor(user, userRoles),
    {
      ctxType: ImageContextResource.user,
      ctxId: user.id,
    },
    { isPublished: true, isArchived: false },
    { isAdminRequest },
  )
  if (!listDecision.allowed) {
    throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const { conditions } = getImageByIdsQueryContext(user, isAdminRequest)
  const images = (await getImagesByIds(db, params.ids, conditions)) as Image[]
  return toImageListResponseShape(
    images,
    imageRow => ({
      ctxType: (imageRow as Partial<ImageDBFlat>).featureId
        ? ImageContextResource.feature
        : ImageContextResource.user,
      ctxId:
        ((imageRow as Partial<ImageDBFlat>).featureId as Id | undefined) ??
        (user.id as Id),
    }),
    profile,
  )
})

export const getImagesForIdsByProfile = getImagesForIds as typeof getImagesForIds &
  (<P extends ImageProfile = 'list'>(
    params: ImagesForIdsParamsByProfile<P>,
  ) => Promise<EntityResponse<Array<ImageContextEnvelope<P>>> & { profile: P }>)

/**
 * Returns a single image by ID.
 */
export const getImageById = guardedQuery(ImageByIdSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest } = ctx
  const profile = toDetailProfile(params.meta?.profile)
  const { conditions } = getImageEntityQueryContext(user, isAdminRequest, {})
  conditions.push(eq(image.id, params.id))
  const data = (await loadImageById(db, conditions)) as ImageDBFlat | undefined
  if (!data) {
    return toImageEntityResponseShape(
      null,
      {
        ctxType: ImageContextResource.feature,
        ctxId: params.id as Id,
      },
      profile,
    )
  }

  const resolvedCtxType = (
    data.featureId ? ImageContextResource.feature : ImageContextResource.user
  ) as ImageContextType
  const resolvedCtxId =
    (data.featureId as Id | undefined) ??
    (data.contributorId as Id | undefined) ??
    (params.id as Id)

  const context = await probeContextState(db, resolvedCtxType, resolvedCtxId)
  const readDecision = authorizeImageRead(
    toImageAccessActor(user, userRoles),
    {
      ctxType: resolvedCtxType as ImageContextType,
      ctxId: resolvedCtxId,
      resourceHubId: context.resourceHubId,
    },
    context.requestedState,
    { isAdminRequest },
  )
  if (!readDecision.allowed) {
    throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  return toImageEntityResponseShape(
    data as unknown as Image,
    { ctxType: resolvedCtxType, ctxId: resolvedCtxId },
    profile,
  )
})

export const getImageByIdByProfile = getImageById as typeof getImageById &
  (<P extends ImageProfile = 'detail'>(
    params: ImageByIdParamsByProfile<P>,
  ) => Promise<EntityResponse<ImageContextEnvelope<P> | null> & { profile: P }>)

/**
 * Returns image metadata from R2 sidecars instead of the database payload.
 */
export const getMetadata = guardedQuery(
  GetImageMetadataSchema,
  async (params, ctx): Promise<ImageMetadataResponse> => {
    const startedAt = Date.now()
    const env = toImageStage(
      params.env ?? ctx.event.platform?.env.ENVIRONMENT ?? ImageEnv.local,
    )

    try {
      const { document } = await readMetadataDocument({
        platform: ctx.event.platform,
        env,
        publicId: params.publicId,
        version: params.version,
        fetchFn: ctx.event.fetch,
      })

      return {
        data: document ? toMetadataProfilePayload(document, params.profile) : null,
        durationMs: Date.now() - startedAt,
      }
    } catch (error) {
      console.error('[image.remote.getMetadata] failed', {
        publicId: params.publicId,
        env,
        version: params.version ?? null,
        error,
      })

      return {
        data: null,
        durationMs: Date.now() - startedAt,
      }
    }
  },
)

/**
 * Issues a short-lived direct-to-R2 upload session.
 */
export const authImageUpload = guardedCommand(
  AuthImageUploadSchema,
  async (params, ctx): Promise<ImageUploadSession> => {
    const { db, user, userRoles, event } = ctx

    if (params.cdn !== 'cloudflareR2') {
      throw error(400, 'Only cloudflareR2 uploads are supported')
    }

    await assertPermissionsToCreateImage(
      db,
      user,
      event.request,
      userRoles,
      params.ctxType as ImageContextResource,
      params.ctxId as Id,
    )

    const stage = toImageStage(params.env)
    const bucket = getOriginalsBucketForStage(event.platform, stage)
    const bucketName = getOriginalsBucketNameForStage(stage)
    const credentials = getStorageApiCredentials(event.platform)
    const authSecret = event.platform?.env.AUTH_SECRET
    let publicId = `h/${params.ctxType}s/${params.ctxId}/${nanoid(16)}`

    if (!credentials || !authSecret) {
      throw error(500, 'R2 direct upload credentials are not configured')
    }

    if (params.replaceImageId) {
      const existing = await loadImageById(db, [eq(image.id, params.replaceImageId)])
      if (!existing) throw error(404, 'Replacement image not found')

      await assertPermissionsToDeleteImage(
        db,
        user,
        event.request,
        userRoles,
        params.replaceImageId as Id,
        params.ctxId as Id,
        params.ctxType as ImageContextResource,
      )

      publicId = existing.publicId
    } else {
      while (await safeOriginalsBucketHead(bucket, publicId)) {
        publicId = `h/${params.ctxType}s/${params.ctxId}/${nanoid(16)}`
      }
    }

    const expiresAtMs = Date.now() + 5 * 60 * 1000
    const token = await createUploadToken(
      {
        publicId,
        env: stage,
        ctxType: params.ctxType,
        ctxId: params.ctxId,
        filename: params.filename,
        replaceImageId: params.replaceImageId,
        contentType: params.contentType,
        size: params.size,
        uploaderUserId: user.id,
        exp: expiresAtMs,
      },
      authSecret,
    )
    const uploadUrl = await createPresignedR2UploadUrl({
      accountId: credentials.accountId,
      bucket: bucketName,
      objectKey: publicId,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      expiresInSeconds: 5 * 60,
    })

    return {
      cdn: 'cloudflareR2',
      env: stage,
      publicId,
      uploadUrl,
      method: 'PUT',
      headers: {
        'content-type': params.contentType,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      confirmToken: token,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ...(params.replaceImageId ? { replaceImageId: params.replaceImageId } : {}),
    }
  },
)

/**
 * Confirms a completed direct R2 upload and writes metadata sidecars.
 */
export const finalizeImageUpload = guardedCommand(
  FinalizeImageUploadSchema,
  async (params: FinalizeImageUploadParams, ctx) => {
    const { db, user, userId, userRoles, event } = ctx
    const secret = event.platform?.env.AUTH_SECRET
    if (!secret) throw error(500, 'Upload auth secret not available')

    const payload = await verifyUploadToken(params.token, secret)
    if (!payload) throw error(403, 'Invalid upload token')
    if (payload.uploaderUserId !== user.id) {
      throw error(403, 'Upload token does not belong to the current user')
    }

    await assertPermissionsToCreateImage(
      db,
      user,
      event.request,
      userRoles,
      payload.ctxType as ImageContextResource,
      payload.ctxId as Id,
    )

    const previousResourceImage =
      !payload.replaceImageId &&
      (payload.ctxType === ImageContextResource.project ||
        payload.ctxType === ImageContextResource.organisation ||
        payload.ctxType === ImageContextResource.hub)
        ? await loadCurrentResourceImage(
            db,
            payload.ctxType as ImageContextResource,
            payload.ctxId as Id,
          )
        : null

    const stage = toImageStage(payload.env)
    const originalsBucket = getOriginalsBucketForStage(event.platform, stage)
    // Verify the upload through the binding first, then fall back to the
    // direct R2 API for local/dev setups where the binding and signed upload
    // target can diverge.
    const uploadedObject = await verifyUploadedOriginal({
      bucket: originalsBucket,
      key: payload.publicId,
      stage,
      event,
    })
    const verifiedStorageAt = Date.now()

    if (!uploadedObject) {
      throw error(404, 'Uploaded image not found in storage')
    }
    if (uploadedObject.size !== payload.size) {
      throw error(400, 'Uploaded image size does not match the authorized upload')
    }

    const uploadedContentType = uploadedObject.contentType
    if (uploadedContentType && uploadedContentType !== payload.contentType) {
      throw error(
        400,
        'Uploaded image content type does not match the authorized upload',
      )
    }

    const version = Date.now()
    const timestamp = new Date(version).toISOString()
    const baseMetadataDocument = {
      ...params.metadata,
      originalFilename: params.metadata.originalFilename ?? payload.filename,
      originalExtension:
        params.metadata.originalExtension ??
        payload.filename.split('.').pop()?.toLowerCase() ??
        null,
      sourceVersion: version,
      uploadedAt: params.metadata.uploadedAt ?? timestamp,
      modifiedAt: timestamp,
    }
    const editorUser = await getUserById(db, user.id as Id)
    let metadataDocument = baseMetadataDocument
    const manifestDocument = {
      publicId: payload.publicId,
      version,
      updatedAt: timestamp,
    }

    if (payload.replaceImageId) {
      const existing = await loadImageById(db, [eq(image.id, payload.replaceImageId)])
      if (!existing) {
        throw error(404, 'Replacement image not found')
      }

      const { document: existingDocument } = await readMetadataDocument({
        platform: event.platform,
        env: stage,
        publicId: existing.publicId,
        version: existing.version ?? undefined,
        fetchFn: event.fetch,
      })

      metadataDocument = buildReplacementMetadataDocument({
        existingDocument,
        incomingDocument: baseMetadataDocument,
        version,
        timestamp,
        editorUserId: user.id,
        editorName: editorUser?.name ?? null,
        editorAttribution: editorUser?.attribution ?? null,
      })
    }

    // Keep metadata sidecars adjacent to the stable source object key.
    await persistOriginalMetadataSidecars({
      bucket: originalsBucket,
      publicId: payload.publicId,
      version,
      metadataDocument,
      manifestDocument,
      stage,
      event,
    })

    const imageData: ImageNew = {
      cdn: 'cloudflareR2',
      env: stage,
      cdnId: null,
      publicId: payload.publicId,
      version,
      contributorId: params.persist?.contributorId ?? user.id,
      ctxType: payload.ctxType as ImageContextResource,
      ctxId: payload.ctxId,
      ...(params.persist?.featureImage
        ? { featureImage: params.persist.featureImage }
        : {}),
    }

    if (payload.replaceImageId) {
      const updated = await updateImageForContext({
        db,
        user,
        userId,
        userRoles,
        event,
        id: payload.replaceImageId as Id,
        ctxType: payload.ctxType as ImageContextType,
        ctxId: payload.ctxId,
        data: {
          ...imageData,
          ...(payload.ctxType === ImageContextResource.feature &&
          params.persist?.featureImage
            ? {
                imageId: payload.replaceImageId,
                featureId: params.persist.featureImage.featureId,
                intent: params.persist.featureImage.intent,
                isPublished: params.persist.featureImage.isPublished,
              }
            : {}),
        },
      })
      event.platform?.context.waitUntil(
        enqueueDerivedAssetWarmup({
          event,
          env: stage,
          publicId: payload.publicId,
          version,
        }),
      )
      return updated
    }

    const created = await createImageInContext({
      db,
      userId,
      imageData:
        payload.ctxType === ImageContextResource.feature
          ? {
              ...imageData,
              featureImage: imageData.featureImage ?? {
                featureId: payload.ctxId,
                intent: 'undefined',
                isPublished: false,
              },
            }
          : imageData,
    })

    if (created.data?.image?.id) {
      await attachImageLinks({
        db,
        imageId: created.data.image.id,
        links: params.persist?.links,
      })
    }

    if (previousResourceImage && previousResourceImage.id !== created.data?.image?.id) {
      event.platform?.context.waitUntil(
        cleanupDetachedResourceImage({
          db,
          platform: event.platform,
          image: previousResourceImage,
        }),
      )
    }

    event.platform?.context.waitUntil(
      enqueueDerivedAssetWarmup({
        event,
        env: stage,
        publicId: payload.publicId,
        version,
      }),
    )
    return created
  },
)

/**
 * Creates a new image in context.
 */
export const createImage = guardedCommand(async (input, ctx) => {
  const params = (input ?? {}) as Record<string, unknown>
  const data = params.data as CreateImageParams['data'] | undefined

  if (!data) {
    throw error(400, 'Missing image payload')
  }

  const { db, user, userId, userRoles, event } = ctx
  const imageData: ImageNew = { ...data, contributorId: data.contributorId ?? userId }

  if (!imageData.ctxType || !imageData.ctxId) {
    throw error(400, 'ctxType and ctxId are required')
  }

  await assertPermissionsToCreateImage(
    db,
    user,
    event.request,
    userRoles,
    imageData.ctxType as ImageContextResource,
    imageData.ctxId as Id,
  )
  return createImageInContext({ db, userId, imageData })
})

/**
 * Updates an existing image in context.
 */
export const updateImage = guardedCommand(UpdateImageSchema, async (params, ctx) => {
  const { db, user, userId, userRoles, event } = ctx
  return updateImageForContext({
    db,
    user,
    userId,
    userRoles,
    event,
    id: params.id,
    ctxType: params.ctxType as ImageContextType,
    ctxId: params.ctxId,
    data: params.data,
  })
})

/**
 * Sets image intent for feature images.
 */
export const setImageIntent = guardedCommand(
  SetImageIntentSchema,
  async (params, ctx) => {
    const { db, user, userId, userRoles, event } = ctx
    return updateFeatureImageFields({
      db,
      user,
      userId,
      userRoles,
      event,
      id: params.id,
      ctxType: params.ctxType as ImageContextType,
      ctxId: params.ctxId,
      featureId: params.featureId,
      data: {
        intent: params.intent,
        ...(params.isPublished !== undefined
          ? { isPublished: params.isPublished }
          : {}),
      },
    })
  },
)

/**
 * Sets image publish status for feature images.
 */
export const setImagePublished = guardedCommand(
  SetImagePublishedSchema,
  async (params, ctx) => {
    const { db, user, userId, userRoles, event } = ctx
    return updateFeatureImageFields({
      db,
      user,
      userId,
      userRoles,
      event,
      id: params.id,
      ctxType: params.ctxType as ImageContextType,
      ctxId: params.ctxId,
      featureId: params.featureId,
      data: {
        isPublished: params.isPublished,
      },
    })
  },
)

/**
 * Rotates an image and refreshes its normalized intermediate and standard derivatives.
 */
export const rotateImage = guardedCommand(RotateImageSchema, async (params, ctx) => {
  const { db, user, userId, userRoles, event } = ctx
  const existing = await loadImageById(db, [eq(image.id, params.id as Id)])

  if (!existing) {
    throw error(404, 'Image not found')
  }

  await assertPermissionsToUpdateImage(
    db,
    user,
    event.request,
    { id: params.id } as ImageDBFlat,
    userRoles,
    params.id as Id,
    params.ctxId as Id,
    params.ctxType as ImageContextResource | ImageContextResourceExtended,
  )

  const env = toImageStage(
    existing.env ?? event.platform?.env.ENVIRONMENT ?? ImageEnv.local,
  )
  const { document, resolvedEnv } = await readMetadataDocument({
    platform: event.platform,
    env,
    publicId: existing.publicId,
    version: existing.version ?? undefined,
    fetchFn: event.fetch,
  })

  if (!document) {
    throw error(404, 'Image metadata not found')
  }

  const originalsBucket = getOriginalsBucketForStage(event.platform, resolvedEnv)
  const originalObject = await readOriginalObjectViaBindingsOrApi({
    bucket: originalsBucket,
    key: existing.publicId,
    stage: resolvedEnv,
    event,
  })

  if (!originalObject) {
    throw error(404, 'Stored image original not found or unreadable')
  }

  const currentRotation = normalizeRotation(document.rotation)
  const targetRotation = normalizeRotation(params.rotation)
  const sourceRotation = normalizeRotation(targetRotation - currentRotation)

  const rotatedIntermediate = await rotateStoredImageObject({
    body: originalObject.body.buffer.slice(
      originalObject.body.byteOffset,
      originalObject.body.byteOffset + originalObject.body.byteLength,
    ),
    contentType: originalObject.contentType,
    rotation: sourceRotation,
  })
  console.info('[image.remote.rotateImage] applying rotation', {
    imageId: existing.id,
    publicId: existing.publicId,
    resolvedEnv,
    requestedRotation: targetRotation,
    currentRotation,
    appliedDeltaRotation: sourceRotation,
    sourceOrientation: rotatedIntermediate.sourceOrientation,
    sourceWidth: rotatedIntermediate.sourceWidth,
    sourceHeight: rotatedIntermediate.sourceHeight,
    previousVersion: existing.version ?? null,
  })
  await putOriginalObjectViaBindingsOrApi({
    bucket: originalsBucket,
    key: existing.publicId,
    body: rotatedIntermediate.body,
    contentType: rotatedIntermediate.contentType,
    stage: resolvedEnv,
    event,
  })

  const version = Date.now()
  const timestamp = new Date(version).toISOString()
  const metadataDocument = toRotatedMetadataDocument({
    document,
    rotation: targetRotation,
    version,
    timestamp,
  })
  const manifestDocument = {
    publicId: existing.publicId,
    version,
    updatedAt: timestamp,
  }

  await persistOriginalMetadataSidecars({
    bucket: originalsBucket,
    publicId: existing.publicId,
    version,
    metadataDocument,
    manifestDocument,
    stage: resolvedEnv,
    event,
  })

  const updated = await updateImageForContext({
    db,
    user,
    userId,
    userRoles,
    event,
    id: params.id,
    ctxType: params.ctxType as ImageContextType,
    ctxId: params.ctxId,
    data: {
      env: resolvedEnv,
      version,
    },
  })

  event.platform?.context.waitUntil(
    enqueueDerivedAssetWarmup({
      event,
      env: resolvedEnv,
      publicId: existing.publicId,
      version,
    }),
  )

  return updated
})

/**
 * Deletes an image in context.
 */
export const deleteImage = guardedCommand(DeleteImageSchema, async (params, ctx) => {
  const { db, user, userRoles, event } = ctx

  await assertPermissionsToDeleteImage(
    db,
    user,
    event.request,
    userRoles,
    params.id as Id,
    params.ctxId as Id,
    params.ctxType as ImageContextResource | ImageContextResourceExtended,
  )

  const imageToDelete = await loadImageById(db, [eq(image.id, params.id as Id)])
  if (!imageToDelete) {
    throw error(404, 'Image not found')
  }

  await db.delete(image).where(eq(image.id, params.id as Id))

  return { type: 'success', message: 'Image deleted successfully' }
})
