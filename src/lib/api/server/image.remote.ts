// REMOTE
import { guardedCommand, guardedQuery } from '$lib/api/server/remote'
import { error, isHttpError } from '@sveltejs/kit'
// DRIZZLE
import { and, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
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
  createUploadedImage,
  createTaskImagesFromImageIds,
  getFeatureCanonicalImageOccupancy as loadFeatureCanonicalImageOccupancy,
  getImageById as loadImageById,
  toImageEnvelope,
  getImageForContextType,
  getImagesByIds,
  toImageEntityResponseShape,
  toImageListResponseShape,
} from '$lib/db/services/image'
import { taskFeatureScopeCondition } from '$lib/db/services/task-scope'
import { updateOrganisationById } from '$lib/db/services/organisation'
import { updateProjectById } from '$lib/db/services/project'
import { getUserById } from '$lib/db/services/user'
// DB SCHEMA
import {
  featureImage,
  feature,
  hub,
  image,
  organisation,
  project,
  task,
  taskImage,
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
import type {
  Database,
  EntityResponse,
  GuardedQueryContext,
  Id,
  UserRoleDisco,
} from '$lib/types'
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
  GetImageMetadataParams,
} from '$lib/db/zod/schema/image.types'
import { createUploadToken, verifyUploadToken } from '$lib/images/auth'
import {
  createPresignedR2UploadUrl,
  getDerivedBucketForStage,
  getOriginalsBucketForStage,
  getOriginalsBucketNameForStage,
  getReadableStages,
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

const FeatureCanonicalImagesSchema = z.object({
  featureIds: z.array(z.string().min(1)).min(1),
  meta: z
    .object({
      isAdminRequest: z.boolean().optional(),
      profile: z.enum(['list', 'card', 'detail', 'admin']).optional(),
    })
    .optional(),
})

const normalizeMetadataPublicId = (publicId: string): string =>
  publicId.trim().replace(/^\/+/, '')

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
// - resolveAuthorizedImageContext
// - authorizeMetadataRead
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
  userRoles: UserRoleDisco[]
  isAuthenticated: true
  isAnonymous: boolean
  isSuperAdmin: boolean
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
  user: { id: Id; isAnonymous: boolean; superAdmin?: boolean },
  userRoles: UserRoleDisco[],
): ImageAccessActor => ({
  userId: user.id,
  userRoles,
  isAuthenticated: true,
  isAnonymous: user.isAnonymous,
  isSuperAdmin: Boolean(user.superAdmin),
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
 * @param params Feature image mutation inputs, including resolved admin intent.
 * @returns Updated image response.
 */
const updateFeatureImageFields = async (params: {
  db: UpdateImageForContextParams['db']
  user: UpdateImageForContextParams['user']
  userId: UpdateImageForContextParams['userId']
  userRoles: UpdateImageForContextParams['userRoles']
  event: UpdateImageForContextParams['event']
  isAdminRequest: UpdateImageForContextParams['isAdminRequest']
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
    isAdminRequest: params.isAdminRequest,
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
 * @param db Database handle used to verify the task's persisted parent.
 * @param params Context query params.
 * @returns Effective context type and id used for the image query.
 * @remarks Narrowing cannot replace the authorized resource with another resource.
 */
const resolveImageQueryContext = async (
  db: Database,
  params: {
    ctxType: ImageContextType
    ctxId: Id
    ctxNarrowingType?: ImageContextResourceExtended
    ctxNarrowingId?: Id
  },
): Promise<{
  ctxType: ImageContextResource | ImageContextResourceExtended
  ctxId: Id
}> => {
  if (params.ctxNarrowingType === undefined && params.ctxNarrowingId === undefined) {
    return { ctxType: params.ctxType, ctxId: params.ctxId }
  }
  if (
    params.ctxType !== ImageContextResource.feature ||
    params.ctxNarrowingType !== ImageContextResourceExtended.task ||
    !params.ctxNarrowingId
  ) {
    throw error(400, 'Task narrowing requires a feature context and task ID')
  }

  // A narrowing task must belong to the feature whose read permission was checked.
  const [parent] = await db
    .select({ featureId: task.featureId })
    .from(task)
    .where(eq(task.id, params.ctxNarrowingId))
    .limit(1)
  if (!parent || parent.featureId !== params.ctxId) {
    throw error(403, 'Task does not belong to the requested feature')
  }
  return { ctxType: ImageContextResourceExtended.task, ctxId: params.ctxNarrowingId }
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
  projectId?: string | null
  organisationId?: string | null
  requestedState: { isPublished?: boolean; isArchived?: boolean }
}> => {
  if (ctxType === ImageContextResource.feature) {
    const [row] = await db
      .select({
        isPublished: feature.isPublished,
        projectId: project.id,
        organisationId: organisation.id,
        isArchived: feature.isArchived,
        resourceHubId: organisation.hubId,
      })
      .from(feature)
      .innerJoin(project, eq(feature.projectId, project.id))
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(feature.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return {
      resourceHubId: row.resourceHubId,
      projectId: row.projectId,
      organisationId: row.organisationId,
      requestedState: row,
    }
  }

  if (ctxType === ImageContextResource.project) {
    const [row] = await db
      .select({
        isPublished: project.isPublished,
        projectId: project.id,
        organisationId: organisation.id,
        isArchived: project.isArchived,
        resourceHubId: organisation.hubId,
      })
      .from(project)
      .innerJoin(organisation, eq(project.organisationId, organisation.id))
      .where(eq(project.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return {
      resourceHubId: row.resourceHubId,
      projectId: row.projectId,
      organisationId: row.organisationId,
      requestedState: row,
    }
  }

  if (ctxType === ImageContextResource.organisation) {
    const [row] = await db
      .select({
        isPublished: organisation.isPublished,
        organisationId: organisation.id,
        isArchived: organisation.isArchived,
        resourceHubId: organisation.hubId,
      })
      .from(organisation)
      .where(eq(organisation.id, ctxId))
      .limit(1)
    if (!row) throw error(404, 'Context resource not found')
    return {
      resourceHubId: row.resourceHubId,
      organisationId: row.organisationId,
      requestedState: row,
    }
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
      projectId: project.id,
      organisationId: organisation.id,
      isArchived: feature.isArchived,
      resourceHubId: organisation.hubId,
    })
    .from(task)
    .innerJoin(feature, eq(task.featureId, feature.id))
    .innerJoin(project, eq(feature.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(and(eq(task.id, ctxId), taskFeatureScopeCondition()))
    .limit(1)

  if (!row) throw error(404, 'Context resource not found')
  return {
    resourceHubId: row.resourceHubId,
    projectId: row.projectId,
    organisationId: row.organisationId,
    requestedState: row,
  }
}

/**
 * Resolves a readable persisted context for an ID-based image result.
 * @param db Database handle.
 * @param row Image and any joined feature assignment.
 * @param actor Current account and roles.
 * @param isAdminRequest Request mode.
 * @returns An authorized context, or null when no context is readable.
 */
const resolveAuthorizedImageContext = async (
  db: Database,
  row: ImageDBFlat,
  actor: ImageAccessActor,
  isAdminRequest: boolean,
): Promise<Pick<ImageContextEnvelope<'detail'>, 'ctxType' | 'ctxId'> | null> => {
  const candidates: Array<Pick<ImageContextEnvelope<'detail'>, 'ctxType' | 'ctxId'>> =
    []
  if (row.featureId) {
    candidates.push({ ctxType: ImageContextResource.feature, ctxId: row.featureId })
  } else {
    // Single-image resources are identified from their stored links, never from the caller.
    for (const [ctxType, table] of [
      [ImageContextResource.project, project],
      [ImageContextResource.organisation, organisation],
      [ImageContextResource.hub, hub],
    ] as const) {
      const parents = await db
        .select({ ctxId: table.id })
        .from(table)
        .where(eq(table.imageId, row.id))
      candidates.push(...parents.map(parent => ({ ctxType, ctxId: parent.ctxId })))
    }
    if (!candidates.length && row.contributorId) {
      candidates.push({ ctxType: ImageContextResource.user, ctxId: row.contributorId })
    }
  }
  for (const candidate of candidates) {
    let context: Awaited<ReturnType<typeof probeContextState>>
    try {
      context = await probeContextState(db, candidate.ctxType, candidate.ctxId)
    } catch (cause) {
      // Concurrent parent removal must not hide unrelated readable images in a batch.
      if (isHttpError(cause, 404)) continue
      throw cause
    }
    const decision = authorizeImageRead(
      actor,
      { ...candidate, ...context },
      {
        ...context.requestedState,
        ...(candidate.ctxType === ImageContextResource.feature &&
        row.isPublished === false
          ? { isPublished: false }
          : {}),
      },
      { isAdminRequest },
    )
    if (decision.allowed) return candidate
  }
  return null
}

/**
 * Authorizes a metadata sidecar against every persisted image assignment.
 *
 * @param params Metadata request parameters.
 * @param ctx Guarded remote context.
 * @returns A promise that resolves when at least one image assignment is readable.
 * @throws 403 when the sidecar exists but no assignment is within the caller's scope.
 * @remarks Full metadata profiles require explicit admin-origin intent; basic metadata
 * follows the same published-resource policy as ordinary image reads.
 */
const authorizeMetadataRead = async (
  params: Pick<GetImageMetadataParams, 'publicId' | 'env' | 'profile'>,
  ctx: GuardedQueryContext,
): Promise<void> => {
  // Full sidecars are an admin-only representation; explicit remote intent is
  // required before any image lookup can disclose whether the sidecar exists.
  if (params.profile !== 'basic' && !ctx.isAdminRequest) {
    throw error(403, 'INSUFFICIENT_ROLE')
  }

  const env = toImageStage(params.env ?? ctx.event.platform?.env.ENVIRONMENT)
  const normalizedPublicId = normalizeMetadataPublicId(params.publicId)
  const imageIdRows = await ctx.db
    .select({ id: image.id })
    .from(image)
    .where(
      and(
        eq(image.publicId, normalizedPublicId),
        inArray(image.env, getReadableStages(env)),
      ),
    )
    .limit(1000)
  const imageIds = imageIdRows.map(row => row.id as Id)
  if (imageIds.length === 0) throw error(404, 'Image metadata not found')

  const imageRows = await getImagesByIds(ctx.db, imageIds)
  const actor = toImageAccessActor(ctx.user, ctx.userRoles)
  for (const imageRow of imageRows) {
    const context = await resolveAuthorizedImageContext(
      ctx.db,
      imageRow,
      actor,
      ctx.isAdminRequest,
    )
    if (context) return
  }

  throw error(403, 'INSUFFICIENT_ROLE')
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

/**
 * Defers metadata sidecar persistence so direct-upload finalization can return
 * as soon as the database state is durable.
 *
 * @param params Metadata persistence parameters.
 * @returns Nothing.
 */
const enqueueMetadataSidecarPersistence = (params: {
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
}): void => {
  const persistenceTask = persistOriginalMetadataSidecars(params).catch(error => {
    console.error(
      '[image.remote.finalizeImageUpload] metadata sidecar persistence failed',
      {
        publicId: params.publicId,
        version: params.version,
        error,
      },
    )
  })

  if (params.event.platform?.context) {
    params.event.platform.context.waitUntil(persistenceTask)
    return
  }

  void persistenceTask
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
    let listed: Awaited<ReturnType<typeof bucket.list>>

    try {
      listed = await bucket.list({
        prefix,
        ...(cursor ? { cursor } : {}),
      })
    } catch (error) {
      console.error('[image.remote.deleteBucketPrefix] list failed', {
        prefix,
        cursor,
        error,
      })
      return
    }

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
 * @remarks Preserve storage assets when the replacement row still uses them.
 */
const cleanupDetachedResourceImage = async (params: {
  db: Database
  platform: App.Platform | undefined
  image: ImageDBFlat
  preserveAssets?: boolean
}): Promise<void> => {
  // Retain the originals if database deletion fails, matching explicit image deletion.
  await params.db.delete(image).where(eq(image.id, params.image.id))

  // Retried confirmation can replace a row while retaining the same storage object.
  if (params.preserveAssets) return

  try {
    await cleanupImageAssets({
      platform: params.platform,
      image: params.image,
    })
  } catch (error) {
    console.error(
      '[image.remote.cleanupDetachedResourceImage] storage cleanup failed',
      {
        imageId: params.image.id,
        publicId: params.image.publicId,
        error,
      },
    )
  }
}

/**
 * Removes originals, intermediate objects, metadata, and derived assets for an image.
 *
 * @param params Cleanup inputs.
 * @returns Nothing.
 */
const cleanupImageAssets = async (params: {
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
  retryableUpload?: boolean
}): Promise<{ data: ImageContextEnvelope<'detail'> }> => {
  const userWithAttribution = await getUserById(params.db, params.userId)
  const createRecord = params.retryableUpload ? createUploadedImage : createImageRecord

  if (params.imageData.ctxType === ImageContextResource.feature) {
    const validatedData = ImageInsertWithFeatureAPI.parse(params.imageData)
    const createdImage = await createRecord(params.db, validatedData)
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
      params.retryableUpload ?? false,
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
    const createdImage = await createRecord(params.db, validatedData)

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
    const createdImage = await createRecord(params.db, validatedData)

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
 *
 * @param params Primary context, optional task narrowing, and collection options.
 * @returns Authorized image collection in the requested response profile.
 * @remarks Task narrowing must remain inside the authorized feature.
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
        projectId: context.projectId,
        organisationId: context.organisationId,
      },
      context.requestedState,
      { isAdminRequest },
    )
    if (!decision.allowed) {
      throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
    }

    // DEPRECATED: Legacy task-as-primary context. Remove after migration to
    // ctxType='feature' + ctxNarrowingType='task' + ctxNarrowingId.
    const queryContext = await resolveImageQueryContext(db, {
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

    // Recheck the authorized parent at query time in case the task was reassigned.
    if (
      params.ctxType === ImageContextResource.feature &&
      queryContext.ctxType === ImageContextResourceExtended.task
    ) {
      conditions.push(eq(task.featureId, params.ctxId))
    }

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
  const readableImages: Image[] = []
  const readableContexts = new Map<
    Image,
    Pick<ImageContextEnvelope<'detail'>, 'ctxType' | 'ctxId'>
  >()
  // A batch of IDs is not a personal collection: authorize each row's actual resource chain.
  for (const imageRow of images) {
    const context = await resolveAuthorizedImageContext(
      db,
      imageRow as ImageDBFlat,
      toImageAccessActor(user, userRoles),
      isAdminRequest,
    )
    if (!context) continue
    readableImages.push(imageRow)
    readableContexts.set(imageRow, context)
  }
  return toImageListResponseShape(
    readableImages,
    imageRow => {
      const context = readableContexts.get(imageRow)
      if (!context) throw error(500, 'Missing authorized image context')
      return context
    },
    profile,
  )
})

export const getImagesForIdsByProfile = getImagesForIds as typeof getImagesForIds &
  (<P extends ImageProfile = 'list'>(
    params: ImagesForIdsParamsByProfile<P>,
  ) => Promise<EntityResponse<Array<ImageContextEnvelope<P>>> & { profile: P }>)

export const getFeatureCanonicalImageOccupancy = guardedQuery(
  FeatureCanonicalImagesSchema,
  async (params, ctx): Promise<{ data: string[] }> => {
    if (!ctx.isAdminRequest) throw error(403, 'INSUFFICIENT_ROLE')

    const actor = toImageAccessActor(ctx.user, ctx.userRoles)
    const featureIds = [...new Set(params.featureIds as Id[])]
    for (const featureId of featureIds) {
      const context = await probeContextState(
        ctx.db,
        ImageContextResource.feature,
        featureId,
      )
      const decision = authorizeImageList(
        actor,
        {
          ctxType: ImageContextResource.feature,
          ctxId: featureId,
          resourceHubId: context.resourceHubId,
          projectId: context.projectId,
          organisationId: context.organisationId,
        },
        context.requestedState,
        { isAdminRequest: true },
      )
      if (!decision.allowed) {
        throw error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
      }
    }

    return {
      data: await loadFeatureCanonicalImageOccupancy(ctx.db, featureIds),
    }
  },
)

/**
 * Returns a single image by ID.
 * @param params Requested image and profile.
 * @param ctx Guarded remote context.
 * @returns An image envelope using an authorized persisted assignment, or an empty result.
 */
export const getImageById = guardedQuery(ImageByIdSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest } = ctx
  const profile = toDetailProfile(params.meta?.profile)
  const { conditions } = getImageEntityQueryContext(user, isAdminRequest, {})
  const candidates = await getImagesByIds(db, [params.id], conditions)
  if (!candidates.length) {
    return toImageEntityResponseShape(
      null,
      {
        ctxType: ImageContextResource.feature,
        ctxId: params.id as Id,
      },
      profile,
    )
  }

  // Shared images may have several assignments; do not let an unreadable first row mask a readable one.
  for (const data of candidates) {
    const context = await resolveAuthorizedImageContext(
      db,
      data,
      toImageAccessActor(user, userRoles),
      isAdminRequest,
    )
    if (context)
      return toImageEntityResponseShape(data as unknown as Image, context, profile)
  }
  throw error(403, 'INSUFFICIENT_ROLE')
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
    await authorizeMetadataRead(params, ctx)
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
    if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')

    if (params.cdn !== 'cloudflareR2') {
      throw error(400, 'Only cloudflareR2 uploads are supported')
    }

    await assertPermissionsToCreateImage(
      db,
      user,
      ctx.isAdminRequest,
      userRoles,
      params.ctxType as ImageContextResource,
      params.ctxId as Id,
      params.links,
    )

    const stage = toImageStage(event.platform?.env.ENVIRONMENT ?? params.env)
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
        ctx.isAdminRequest,
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
    if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    const secret = event.platform?.env.AUTH_SECRET
    if (!secret) throw error(500, 'Upload auth secret not available')

    const payload = await verifyUploadToken(params.token, secret)
    if (!payload) throw error(403, 'Invalid upload token')
    if (payload.uploaderUserId !== user.id) {
      throw error(403, 'Upload token does not belong to the current user')
    }

    const creationAccess = await assertPermissionsToCreateImage(
      db,
      user,
      ctx.isAdminRequest,
      userRoles,
      payload.ctxType as ImageContextResource,
      payload.ctxId as Id,
      params.persist?.links,
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

    // Draft contributors cannot assign publication, reviewer metadata, or another author.
    const featureImageData =
      creationAccess === 'draft-contribution'
        ? {
            featureId: payload.ctxId,
            intent: 'undefined' as const,
            isPublished: false,
            localIsPublished: null,
            publishedAt: null,
            publisherId: null,
          }
        : params.persist?.featureImage
    const imageData: ImageNew = {
      cdn: 'cloudflareR2',
      env: stage,
      cdnId: null,
      publicId: payload.publicId,
      contentHash: params.metadata.contentHash ?? null,
      version,
      contributorId:
        creationAccess === 'draft-contribution'
          ? user.id
          : (params.persist?.contributorId ?? user.id),
      ctxType: payload.ctxType as ImageContextResource,
      ctxId: payload.ctxId,
      ...(featureImageData ? { featureImage: featureImageData } : {}),
    }

    if (payload.replaceImageId) {
      const updated = await updateImageForContext({
        db,
        user,
        userId,
        userRoles,
        event,
        isAdminRequest: ctx.isAdminRequest,
        id: payload.replaceImageId as Id,
        ctxType: payload.ctxType as ImageContextType,
        ctxId: payload.ctxId,
        data: {
          ...imageData,
          ...(payload.ctxType === ImageContextResource.feature && featureImageData
            ? {
                imageId: payload.replaceImageId,
                featureId: featureImageData.featureId,
                intent: featureImageData.intent,
                isPublished: featureImageData.isPublished,
              }
            : {}),
        },
      })
      // Persist metadata sidecars off the critical response path once the image row
      // and links can be committed safely.
      enqueueMetadataSidecarPersistence({
        bucket: originalsBucket,
        publicId: payload.publicId,
        version,
        metadataDocument,
        manifestDocument,
        stage,
        event,
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
      retryableUpload: true,
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

    // A retry reuses the stored row version; never publish a manifest for an uncommitted version.
    const persistedVersion = created.data?.image?.version ?? version
    const persistedTimestamp = new Date(persistedVersion).toISOString()
    const previousMetadata =
      persistedVersion !== version
        ? await readMetadataDocument({
            platform: event.platform,
            env: stage,
            publicId: payload.publicId,
            version: persistedVersion,
            fetchFn: event.fetch,
          })
        : null
    // Recover missing sidecars on retry, but preserve metadata already written for this version.
    if (!previousMetadata?.document) {
      enqueueMetadataSidecarPersistence({
        bucket: originalsBucket,
        publicId: payload.publicId,
        version: persistedVersion,
        metadataDocument: {
          ...metadataDocument,
          sourceVersion: persistedVersion,
          modifiedAt: persistedTimestamp,
        },
        manifestDocument: {
          ...manifestDocument,
          version: persistedVersion,
          updatedAt: persistedTimestamp,
        },
        stage,
        event,
      })
    }

    if (previousResourceImage && previousResourceImage.id !== created.data?.image?.id) {
      event.platform?.context.waitUntil(
        cleanupDetachedResourceImage({
          db,
          platform: event.platform,
          image: previousResourceImage,
          preserveAssets:
            previousResourceImage.publicId === payload.publicId &&
            toImageStage(previousResourceImage.env) === stage,
        }),
      )
    }

    event.platform?.context.waitUntil(
      enqueueDerivedAssetWarmup({
        event,
        env: stage,
        publicId: payload.publicId,
        version: persistedVersion,
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

  const { db, user, userId, userRoles } = ctx
  if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  const imageData: ImageNew = { ...data, contributorId: data.contributorId ?? userId }

  if (!imageData.ctxType || !imageData.ctxId) {
    throw error(400, 'ctxType and ctxId are required')
  }

  await assertPermissionsToCreateImage(
    db,
    user,
    ctx.isAdminRequest,
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
  if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  return updateImageForContext({
    db,
    user,
    userId,
    userRoles,
    event,
    isAdminRequest: ctx.isAdminRequest,
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
    if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    return updateFeatureImageFields({
      db,
      user,
      userId,
      userRoles,
      event,
      isAdminRequest: ctx.isAdminRequest,
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
    if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    return updateFeatureImageFields({
      db,
      user,
      userId,
      userRoles,
      event,
      isAdminRequest: ctx.isAdminRequest,
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
  if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  const existing = await loadImageById(db, [eq(image.id, params.id as Id)])

  if (!existing) {
    throw error(404, 'Image not found')
  }

  await assertPermissionsToUpdateImage(
    db,
    user,
    ctx.isAdminRequest,
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
    isAdminRequest: ctx.isAdminRequest,
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
 * @param params Image identifier and authorization context.
 * @param ctx Guarded remote context.
 * @returns A success response after the database deletion commits.
 * @remarks Association removal is atomic; storage cleanup is scheduled after commit.
 */
export const deleteImage = guardedCommand(DeleteImageSchema, async (params, ctx) => {
  const { db, user, userRoles, event } = ctx
  if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')

  await assertPermissionsToDeleteImage(
    db,
    user,
    ctx.isAdminRequest,
    userRoles,
    params.id as Id,
    params.ctxId as Id,
    params.ctxType as ImageContextResource | ImageContextResourceExtended,
  )

  const imageToDelete = await loadImageById(db, [eq(image.id, params.id as Id)])
  if (!imageToDelete) {
    throw error(404, 'Image not found')
  }

  // Preserve associations if any deletion fails, and only clean assets after commit.
  await db.batch([
    db.delete(taskImage).where(eq(taskImage.imageId, params.id as Id)),
    db.delete(featureImage).where(eq(featureImage.imageId, params.id as Id)),
    db.delete(image).where(eq(image.id, params.id as Id)),
  ])

  event.platform?.context.waitUntil(
    cleanupImageAssets({
      platform: event.platform,
      image: imageToDelete,
    }).catch(cleanupError => {
      console.error('[image.remote.deleteImage] storage cleanup failed', {
        imageId: params.id,
        error: cleanupError,
      })
    }),
  )

  return { type: 'success', message: 'Image deleted successfully' }
})
