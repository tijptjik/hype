// IMAGE INTENTS
import { DEFAULT_IMAGE_INTENTS, ImageIntentIdSchema } from '#lib/images/intents.js'
import { readImageIntentPolicy } from '#lib/db/services/imageIntentPolicy.js'
// CREATION CONTRIBUTIONS
import { saveFeatureCreationUpload } from '#lib/db/services/featureLifecycleCreationUpload.js'
// SVELTEKIT
import { error, isHttpError } from '@sveltejs/kit'
// DRIZZLE / VALIDATION
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
// API SERVICES
import { completeSingleImageUpload } from './services/singleImageUpload.js'
import {
  isLogoContext,
  readLogoEvidence,
  ensureLogoBaseline,
  authorizeLogoOwners,
} from './services/resourceLogoEditing.js'
import { getStorageApiCredentials } from '#lib/images/storageCredentials.js'
import { readResourceLogoPreview } from './services/resourceLogoPreview'
// LOGO REVISIONS
import { equalRevisionValue } from '#lib/revisions/merge.js'
import {
  readResourceLogoHead,
  reconcileLogoPresentation,
} from '#lib/db/services/resourceLogoRevision.js'
import type {
  LogoRevisionEvidence,
  ResourceLogoHead,
} from '#lib/db/services/resourceLogoRevision.js'
import { hasResourceLogoStorage } from '#lib/db/services/resourceLogoSnapshot.js'
// DB
import { imageUpload } from '#lib/db/schema/imageUpload.js'
import {
  isSingleImageContext,
  stageImageUpload,
  discardStagedImageUpload,
  getUserImageUploadSnapshot,
  listImageUploadsForCleanup,
  type StagedImageUpload,
} from '#lib/db/services/singleImageUpload.js'
import { removeAcceptedFeatureImage } from '#lib/db/services/featureGalleryCommands.js'
import { saveFeatureImageMetadata } from '#lib/db/services/featureImageMetadataRevision.js'
import {
  hasFeatureRevisionHead,
  saveFeatureImageUploadDraft,
} from '#lib/db/services/featureImageUploadRevision.js'
import { probeFeatureForCommand } from '#lib/db/services/feature.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import { readFeatureImageRevisionPreview } from './services/imageRevisionPreview'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import {
  authorizeImageList,
  authorizeImageRead,
  toAuthMessage,
} from '#lib/api/services/authz/index.js'
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
} from '#lib/api/services/image.js'
// DB SERVICES
import { readImageRevisionDelivery } from '#lib/db/services/imageRevisionDelivery.js'
import {
  getFeatureCanonicalImageOccupancy as loadFeatureCanonicalImageOccupancy,
  getImageById as loadImageById,
  toImageEnvelope,
  getImageForContextType,
  getImagesByIds,
  toImageEntityResponseShape,
  toImageListResponseShape,
} from '#lib/db/services/image.js'
import {
  createUploadedResourceImage,
  getResourceUploadSnapshot,
} from '#lib/db/services/resourceImageUpload.js'
import {
  getImageMutationSnapshot,
  createImageMutationGuards,
} from '#lib/db/services/imageMutationScope.js'
import { removeAdminResourceImage } from '#lib/db/services/adminResourceImage.js'
import { removeOrganisationImage } from '#lib/db/services/organisationImage.js'
import { deleteImageWithEvidence } from '#lib/db/services/imageDeletion.js'
import {
  deleteDetachedImage,
  hasImageStorageReference,
} from '#lib/db/services/imageCleanup.js'
import {
  createUploadedFeatureImage,
  getFeatureImageCreationScope,
  type FeatureImageCreationScope,
} from '#lib/db/services/imageUpload.js'
import { taskLifecycleScopeCondition } from '#lib/db/services/task-scope.js'
import { getUserById } from '#lib/db/services/user.js'
// DB SCHEMA
import {
  featureImage,
  feature,
  hub,
  image,
  organisation,
  project,
  task,
  user as userTable,
} from '#lib/db/schema/index.js'
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
  ImageMetadataFullSchema,
  AuthImageUploadSchema,
  FinalizeImageUploadSchema,
} from '#lib/db/zod/index.js'
// ENUMS
import {
  ImageContextResource,
  ImageContextResourceExtended,
  ImageEnv,
} from '#lib/enums.js'
// IMAGE PRESENTATION
import {
  DEFAULT_UPLOAD_IMAGE_PRESENTATION,
  IMAGE_PRESENTATION_MODES,
} from '#lib/images/presentation.js'
// TYPES
import type { ResourceUploadType } from '#lib/db/services/resourceImageUpload.js'
import type { ResourceUploadSnapshot } from '#lib/images/uploadContext.js'
import type { Database, EntityResponse, Id, UserRoleDisco } from '#lib/types.js'
import type { GuardedQueryContext } from '#lib/api/guarded.types.js'
import type {
  CreateImageParams,
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
} from '#lib/db/zod/schema/image.types.js'
import { createUploadToken, verifyUploadToken } from '#lib/images/auth.js'
import {
  createPresignedR2UploadUrl,
  getDerivedBucketForStage,
  getOriginalsBucketForStage,
  getOriginalsBucketNameForStage,
  getReadableStages,
  readMetadataDocument,
  readR2JsonViaApi,
  readR2ObjectViaApi,
  headR2ObjectViaApi,
  putR2ObjectViaApi,
  type ImageMetadataDocument,
  toManifestObjectKey,
  toMetadataObjectKey,
  toImageStage,
  toMetadataProfilePayload,
} from '#lib/images/storage.js'

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
// - safeOriginalsBucketGet
// - safeOriginalsBucketHead
// - waitForOriginalUploadVisibility
// - verifyUploadedOriginal
// - persistOriginalMetadataSidecars
// - deleteBucketKeys
// - deleteBucketPrefix
// - loadCurrentResourceImage
// - cleanupDetachedResourceImage
// - normalizeRotation
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
    intent?: string
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
      isPublished: sql<boolean>`0`,
      projectId: project.id,
      organisationId: organisation.id,
      isArchived: sql<boolean>`0`,
      resourceHubId: organisation.hubId,
    })
    .from(task)
    .innerJoin(project, eq(task.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(and(eq(task.id, ctxId), await taskLifecycleScopeCondition(db)))
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

  const env = toImageStage(params.env ?? ctx.event.locals.platform?.env.ENVIRONMENT)
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
    locals: Pick<App.Locals, 'platform'>
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

  const credentials = getStorageApiCredentials(params.event.locals.platform)

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
  immutableOnly?: boolean
  stage: ReturnType<typeof toImageStage>
  event: {
    locals: Pick<App.Locals, 'platform'>
    fetch: typeof fetch
  }
}): Promise<void> => {
  const canonicalKey = toMetadataObjectKey(params.publicId, params.version)
  const credentials = getStorageApiCredentials(params.event.locals.platform)
  const remoteParams = credentials
    ? {
        ...credentials,
        bucket: getOriginalsBucketNameForStage(params.stage),
        fetchFn: params.event.fetch,
      }
    : null

  // Elect one immutable document; all concurrent retries publish that same content.
  let created: boolean
  try {
    created =
      (await params.bucket.put(canonicalKey, JSON.stringify(params.metadataDocument), {
        onlyIf: { etagDoesNotMatch: '*' },
        httpMetadata: { contentType: 'application/json' },
      })) !== null
  } catch (cause) {
    if (!remoteParams) throw cause
    created = await putR2ObjectViaApi({
      ...remoteParams,
      objectKey: canonicalKey,
      body: JSON.stringify(params.metadataDocument),
      contentType: 'application/json',
      createOnly: true,
    })
  }
  let document = params.metadataDocument
  if (!created) {
    let stored: ImageMetadataDocument | null = null
    try {
      const object = await params.bucket.get(canonicalKey)
      if (object) stored = await object.json<ImageMetadataDocument>()
    } catch (cause) {
      if (!remoteParams) throw cause
    }
    if (!stored && remoteParams)
      stored = await readR2JsonViaApi<ImageMetadataDocument>({
        ...remoteParams,
        objectKey: canonicalKey,
      })
    if (!stored || stored.sourceVersion !== params.version)
      throw new Error(
        'Committed image metadata is missing or has a conflicting version',
      )
    if (
      params.immutableOnly &&
      JSON.stringify(stored) !== JSON.stringify(params.metadataDocument)
    )
      throw error(409, 'STALE_IMAGE_METADATA_VERSION')
    document = stored
  }
  if (params.immutableOnly) return

  // Repair mirrors even when the immutable document survived an earlier partial failure.
  const writes = [
    { key: toMetadataObjectKey(params.publicId), body: JSON.stringify(document) },
    {
      key: toManifestObjectKey(params.publicId),
      body: JSON.stringify(params.manifestDocument),
    },
  ]
  for (const write of writes) {
    try {
      await params.bucket.put(write.key, write.body, {
        httpMetadata: { contentType: 'application/json' },
      })
    } catch (cause) {
      if (!remoteParams) throw cause
      await putR2ObjectViaApi({
        ...remoteParams,
        objectKey: write.key,
        body: write.body,
        contentType: 'application/json',
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
    locals: Pick<App.Locals, 'platform'>
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

  if (params.event.locals.platform?.context) {
    params.event.locals.platform.context.waitUntil(persistenceTask)
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

/**
 * Deletes listed keys within a prefix that also satisfy the ownership filter.
 * @param bucket Storage bucket to clean.
 * @param prefix Namespace to enumerate.
 * @param includeKey Optional exact-format filter for namespaces sharing a textual prefix.
 * @returns Completion of best-effort deletion across all listed pages.
 */
const deleteBucketPrefix = async (
  bucket: ReturnType<typeof getOriginalsBucketForStage>,
  prefix: string,
  includeKey: (key: string) => boolean = () => true,
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

    const keys = listed.objects.map(object => object.key).filter(includeKey)

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
  if (!(await deleteDetachedImage(params.db, params.image.id))) return

  // Retried confirmation can replace a row while retaining the same storage object.
  if (params.preserveAssets) return

  try {
    await cleanupImageAssets({
      db: params.db,
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
  db: Database
  platform: App.Platform | undefined
  image: ImageDBFlat
}): Promise<void> => {
  // Another image row may share this object key even after the deleted row is gone.
  if (await hasImageStorageReference(params.db, params.image)) return
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
    deleteBucketPrefix(originalsBucket, `${params.image.publicId}.v`, key => {
      // A textual prefix also matches unrelated originals; only numeric metadata revisions belong here.
      const suffix = key.slice(`${params.image.publicId}.v`.length)
      return /^\d+\.json$/.test(suffix)
    }),
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
 * Updates delivery metadata while preserving the source pixel orientation.
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
    normalizeRotation(params.rotation - (params.document.rotation ?? 0)),
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
      normalizeRotation(params.rotation - (params.document.rotation ?? 0)),
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
    sourceRotation: params.document.sourceRotation ?? params.document.rotation ?? 0,
    renderRotation: normalizeRotation(
      params.rotation -
        (params.document.sourceRotation ?? params.document.rotation ?? 0),
    ),
    metadata: metadataEntries,
    sourceVersion: params.version,
    modifiedAt: params.timestamp,
  }
}

/**
 * Preserves source metadata and records provenance for an isolated replacement object.
 * @param params Original metadata, incoming upload fields and editor/source identities.
 * @returns Replacement sidecar document with the retained source location.
 */
const buildReplacementMetadataDocument = (params: {
  existingDocument: ImageMetadataDocument | null
  incomingDocument: ImageMetadataDocument
  version: number
  timestamp: string
  editorUserId: string
  editorName: string | null
  editorAttribution: string | null
  source: { publicId: string; env: string; version: number | null }
}): ImageMetadataDocument => {
  const existingMetadataEntries = params.existingDocument?.metadata
    ? { ...params.existingDocument.metadata }
    : {}
  const incomingMetadataEntries = params.incomingDocument.metadata
    ? { ...params.incomingDocument.metadata }
    : {}

  const mergedMetadataEntries: Record<string, string> = {
    ...existingMetadataEntries,
    ...incomingMetadataEntries,
    replacementSourcePublicId: params.source.publicId,
    replacementSourceEnv: params.source.env,
    replacementSourceVersion:
      params.source.version === null ? 'unversioned' : String(params.source.version),
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
    // Description-derived capture evidence survives non-destructive image replacement.
    capture:
      params.incomingDocument.capture ?? params.existingDocument?.capture ?? null,
    captureSources:
      params.incomingDocument.captureSources ??
      params.existingDocument?.captureSources ??
      null,
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
  featureScope?: FeatureImageCreationScope
  resourceSnapshot?: ResourceUploadSnapshot
  taskIds?: string[]
  draftContributorId?: string
  logoEvidence?: LogoRevisionEvidence
}): Promise<{ data: ImageContextEnvelope<'detail'> }> => {
  const userWithAttribution = await getUserById(params.db, params.userId)

  if (params.imageData.ctxType === ImageContextResource.feature) {
    if (!params.featureScope) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
    const validatedData = ImageInsertWithFeatureAPI.parse(params.imageData)
    // Creation commits the image and every evidence link under live task predicates.
    const uploaded = await createUploadedFeatureImage(
      params.db,
      validatedData,
      params.taskIds ?? [],
      params.draftContributorId,
      params.retryableUpload ? undefined : nanoid(),
      params.featureScope,
    )
    if (!uploaded) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
    const createdImage = uploaded.image
    const createdFeatureImage = uploaded.featureImage

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
    const createdImage =
      params.resourceSnapshot &&
      (await createUploadedResourceImage(
        params.db,
        validatedData.ctxType,
        validatedData.ctxId,
        validatedData,
        params.resourceSnapshot,
        params.retryableUpload ? undefined : nanoid(),
        { actorId: params.userId, reason: 'Resource image updated' },
        params.logoEvidence,
      ))
    if (!createdImage) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')

    const responseData = await toResponseShapeProjectOrOrganisation(
      createdImage,
      userWithAttribution?.attribution ?? undefined,
    )
    if (params.logoEvidence) {
      const head = await readResourceLogoHead(params.db, createdImage.id)
      if (head) Object.assign(responseData, { imageRevisionId: head.imageRevisionId })
    }
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
    const createdImage =
      params.resourceSnapshot &&
      (await createUploadedResourceImage(
        params.db,
        'hub',
        validatedData.ctxId,
        validatedData,
        params.resourceSnapshot,
        params.retryableUpload ? undefined : nanoid(),
        { actorId: params.userId, reason: 'Hub image updated' },
        params.logoEvidence,
      ))
    if (!createdImage) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')

    const responseData = await toResponseShapeProjectOrOrganisation(
      createdImage,
      userWithAttribution?.attribution ?? undefined,
    )
    if (params.logoEvidence) {
      const head = await readResourceLogoHead(params.db, createdImage.id)
      if (head) Object.assign(responseData, { imageRevisionId: head.imageRevisionId })
    }
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

    // Creation contributions use their task as context until an accepted Feature exists.
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

    if (queryContext.ctxType === ImageContextResourceExtended.task) {
      conditions.push(await taskLifecycleScopeCondition(db))
      conditions.push(or(eq(task.isDraft, false), eq(task.contributorId, user.id))!)
      conditions.push(eq(task.projectId, context.projectId!))
      conditions.push(eq(task.organisationId, context.organisationId!))
    }
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

    if (isLogoContext(params.ctxType) && (await hasResourceLogoStorage(db))) {
      for (const row of images) {
        const head = await readResourceLogoHead(db, row.id)
        if (head) Object.assign(row, { imageRevisionId: head.imageRevisionId })
      }
    }
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

/**
 * Returns the effective intent catalogue for an authorized gallery, including empty galleries.
 * @param params Persisted image context and request metadata.
 * @returns Ordered intent choices and the Project upload default.
 * @remarks Scope is resolved server-side; task evidence never grants access to unrelated galleries.
 */
export const getImageIntentOptions = guardedQuery(
  ImagesByContextSchema,
  async (params, ctx) => {
    const context = await probeContextState(
      ctx.db,
      params.ctxType as ImageContextType,
      params.ctxId,
    )
    const decision = authorizeImageList(
      toImageAccessActor(ctx.user, ctx.userRoles),
      {
        ctxType: params.ctxType as ImageContextType,
        ctxId: params.ctxId,
        resourceHubId: context.resourceHubId,
        projectId: context.projectId,
        organisationId: context.organisationId,
      },
      context.requestedState,
      { isAdminRequest: ctx.isAdminRequest },
    )
    if (!decision.allowed)
      error(403, toAuthMessage(decision.code ?? 'INSUFFICIENT_ROLE'))
    const scope = context.projectId
      ? { type: 'project' as const, id: context.projectId }
      : context.resourceHubId
        ? { type: 'hub' as const, id: context.resourceHubId }
        : null
    const policy = scope ? await readImageIntentPolicy(ctx.db, scope) : null
    return {
      intents: policy?.intents ?? [...DEFAULT_IMAGE_INTENTS],
      autoPublishUnclassified: policy?.autoPublishUnclassified ?? true,
    }
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
    if (isLogoContext(context.ctxType)) {
      const head = await readResourceLogoHead(db, imageRow.id)
      if (head) Object.assign(imageRow, { imageRevisionId: head.imageRevisionId })
    }
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
    if (context) {
      if (isLogoContext(context.ctxType)) {
        const head = await readResourceLogoHead(db, data.id)
        if (head) Object.assign(data, { imageRevisionId: head.imageRevisionId })
      }
      return toImageEntityResponseShape(data as unknown as Image, context, profile)
    }
  }
  throw error(403, 'INSUFFICIENT_ROLE')
})

export const getImageByIdByProfile = getImageById as typeof getImageById &
  (<P extends ImageProfile = 'detail'>(
    params: ImageByIdParamsByProfile<P>,
  ) => Promise<EntityResponse<ImageContextEnvelope<P> | null> & { profile: P }>)

/**
 * Returns exact retained metadata for revision pins, or the authorized legacy R2 sidecar.
 * @param params Image locator, metadata profile and optional immutable revision.
 * @returns Authorized metadata without falling back from a missing revision to current data.
 */
export const getMetadata = guardedQuery(
  GetImageMetadataSchema,
  async (params, ctx): Promise<ImageMetadataResponse> => {
    const startedAt = Date.now()
    if (params.imageRevisionId) {
      if (params.profile !== 'basic' && !ctx.isAdminRequest)
        throw error(403, 'INSUFFICIENT_ROLE')
      let pin = params.featureId
        ? await readFeatureImageRevisionPreview(
            ctx.db,
            params.imageRevisionId,
            params.featureId,
            { user: ctx.user, userRoles: ctx.userRoles },
            params.profile !== 'basic',
          )
        : await readImageRevisionDelivery(ctx.db, params.imageRevisionId)
      if (ctx.isAdminRequest && !params.featureId) {
        // Admin preview still needs a currently readable assignment carrying this exact accepted pin.
        const identity = await ctx.db.get<{ imageId: string }>(
          sql`SELECT imageId FROM imageRevision WHERE id=${params.imageRevisionId}`,
        )
        if (!identity) throw error(404, 'Image revision not available')
        pin = await readResourceLogoPreview(ctx.db, params.imageRevisionId, {
          user: ctx.user,
          userRoles: ctx.userRoles,
        })
        const candidates = await getImagesByIds(ctx.db, [identity.imageId])
        for (const imageRow of candidates) {
          if (pin) break
          const context = await resolveAuthorizedImageContext(
            ctx.db,
            imageRow,
            toImageAccessActor(ctx.user, ctx.userRoles),
            true,
          )
          if (context && isLogoContext(context.ctxType)) {
            pin = await readResourceLogoPreview(ctx.db, params.imageRevisionId, {
              user: ctx.user,
              userRoles: ctx.userRoles,
            })
            if (pin) break
          }
          if (!context || context.ctxType !== ImageContextResource.feature) continue
          pin = await readImageRevisionDelivery(
            ctx.db,
            params.imageRevisionId,
            sql`EXISTS (
            SELECT 1 FROM featureRevisionHead h JOIN featureRevisionImage fp ON fp.featureRevisionId=h.publishedRevisionId
            WHERE h.featureId=${context.ctxId} AND h.state='active' AND fp.imageId=i.id AND fp.imageRevisionId=${params.imageRevisionId})`,
          )
          if (pin) break
        }
      }
      if (
        !pin ||
        pin.storageKey !== normalizeMetadataPublicId(params.publicId) ||
        (params.env && pin.storageNamespace !== params.env)
      )
        throw error(404, 'Image revision not available')
      const metadata = ImageMetadataFullSchema.safeParse(pin.metadata)
      return {
        data: metadata.success
          ? toMetadataProfilePayload(metadata.data, params.profile)
          : null,
        durationMs: Date.now() - startedAt,
      }
    }
    await authorizeMetadataRead(params, ctx)
    // Current logo metadata comes from its immutable journal, even if a compatibility mirror is delayed.
    if (await hasResourceLogoStorage(ctx.db)) {
      const selected = await ctx.db.get<{
        imageId: string
      }>(sql`SELECT i.id imageId FROM image i JOIN resourceLogoImageHead h ON h.imageId=i.id
        WHERE i.publicId=${normalizeMetadataPublicId(params.publicId)} AND (${params.env ?? null} IS NULL OR i.env=${params.env ?? null}) AND (${params.version ?? null} IS NULL OR i.version=${params.version ?? null})`)
      if (selected) {
        const head = await readResourceLogoHead(ctx.db, selected.imageId)
        if (head)
          return {
            data: toMetadataProfilePayload(
              ImageMetadataFullSchema.parse(head.metadata),
              params.profile,
            ),
            durationMs: Date.now() - startedAt,
          }
      }
    }

    const env = toImageStage(
      params.env ?? ctx.event.locals.platform?.env.ENVIRONMENT ?? ImageEnv.local,
    )

    try {
      const { document } = await readMetadataDocument({
        platform: ctx.event.locals.platform,
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
 * @param params Upload identity, context and expected object properties.
 * @returns Signed upload grant and storage destination.
 * @remarks Single-resource grants bind the original resource revision and scope.
 */
export const authImageUpload = guardedCommand(
  AuthImageUploadSchema,
  async (params, ctx): Promise<ImageUploadSession> => {
    const { db, user, userRoles, event } = ctx
    if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')

    if (params.ctxType === ImageContextResourceExtended.task && params.replaceImageId)
      throw error(400, 'Creation contribution photos cannot replace accepted images')

    if (params.cdn !== 'cloudflareR2') {
      throw error(400, 'Only cloudflareR2 uploads are supported')
    }

    // Capture before authorization so subsequent reparenting invalidates this grant.
    const isSingleResource = isSingleImageContext(params.ctxType)
    if (
      params.attachment === 'deferred' &&
      (!isSingleResource || params.replaceImageId)
    )
      throw error(
        400,
        'Deferred uploads require a single-image destination and a new asset',
      )
    if (params.ctxType === 'user' && params.replaceImageId)
      throw error(400, 'Upload a new avatar asset to replace the profile selection')
    const resourceSnapshot =
      !params.replaceImageId && isSingleResource
        ? params.ctxType === 'user'
          ? await getUserImageUploadSnapshot(db, params.ctxId)
          : await getResourceUploadSnapshot(
              db,
              params.ctxType as ResourceUploadType,
              params.ctxId,
            )
        : undefined
    const replacementSnapshot = params.replaceImageId
      ? await getImageMutationSnapshot(
          db,
          params.ctxType as ImageContextType,
          params.ctxId,
          params.replaceImageId,
        )
      : undefined
    await assertPermissionsToCreateImage(
      db,
      user,
      ctx.isAdminRequest,
      userRoles,
      params.ctxType as ImageContextResource,
      params.ctxId as Id,
      params.links,
    )

    if (resourceSnapshot === null) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
    if (isSingleResource)
      await cleanupExpiredImageUploads(ctx).catch(cause => {
        console.error('Abandoned image cleanup will be retried:', cause)
      })

    const stage = toImageStage(event.locals.platform?.env.ENVIRONMENT ?? params.env)
    const bucket = getOriginalsBucketForStage(event.locals.platform, stage)
    const bucketName = getOriginalsBucketNameForStage(stage)
    const credentials = getStorageApiCredentials(event.locals.platform)
    const authSecret = event.locals.platform?.env.AUTH_SECRET
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

      if (!replacementSnapshot?.source) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
    }
    // Each replacement uploads to a new key; an unconfirmed upload must not alter the active asset.
    while (await safeOriginalsBucketHead(bucket, publicId)) {
      publicId = `h/${params.ctxType}s/${params.ctxId}/${nanoid(16)}`
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
        replaceImageRevisionId: params.replaceImageRevisionId,
        resourceSnapshot,
        attachment: params.attachment,
        replacementSnapshot: replacementSnapshot ?? undefined,
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
        'if-none-match': '*',
      },
      confirmToken: token,
      expiresAt: new Date(expiresAtMs).toISOString(),
      ...(params.replaceImageId ? { replaceImageId: params.replaceImageId } : {}),
    }
  },
)

/**
 * Confirms a completed direct R2 upload and writes metadata sidecars.
 * @param params Signed grant, metadata and requested evidence links.
 * @returns Persisted image envelope.
 * @remarks Stale new-upload contexts reject before scheduling storage side effects.
 */
export const finalizeImageUpload = guardedCommand(
  FinalizeImageUploadSchema,
  async (params: FinalizeImageUploadParams, ctx) => {
    const { db, user, userId, userRoles, event } = ctx
    if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    const secret = event.locals.platform?.env.AUTH_SECRET
    if (!secret) throw error(500, 'Upload auth secret not available')

    const payload = await verifyUploadToken(params.token, secret)
    if (!payload) throw error(403, 'Invalid upload token')
    if (payload.uploaderUserId !== user.id) {
      throw error(403, 'Upload token does not belong to the current user')
    }

    // Older single-resource grants lack a revision and cannot safely confirm after a new selection.
    if (
      !payload.replaceImageId &&
      isSingleImageContext(payload.ctxType) &&
      !payload.resourceSnapshot
    ) {
      throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
    }

    if (
      payload.replaceImageId &&
      (!payload.replacementSnapshot?.source ||
        payload.replacementSnapshot.assignmentRevision === undefined ||
        payload.replacementSnapshot.imageId !== payload.replaceImageId)
    ) {
      throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
    }

    const featureScope =
      !payload.replaceImageId && payload.ctxType === 'feature'
        ? await getFeatureImageCreationScope(db, payload.ctxId)
        : undefined
    const revisionUpload =
      payload.ctxType === 'feature' && (await hasFeatureRevisionHead(db, payload.ctxId))
    const revisionScope = revisionUpload
      ? await probeFeatureForCommand(db, payload.ctxId)
      : null
    const creationAccess = await assertPermissionsToCreateImage(
      db,
      user,
      ctx.isAdminRequest,
      userRoles,
      payload.ctxType as ImageContextResource,
      payload.ctxId as Id,
      params.persist?.links,
    )

    if (featureScope === null) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
    if (revisionUpload && !revisionScope) throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')

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

    let logoBaseline: ResourceLogoHead | null = null
    const logoUpload =
      isLogoContext(payload.ctxType) && (await hasResourceLogoStorage(db))
    if (logoUpload) {
      const oldId = payload.replaceImageId ?? previousResourceImage?.id
      if (oldId) {
        const snapshot = await getImageMutationSnapshot(
          db,
          payload.ctxType as ImageContextType,
          payload.ctxId,
          oldId,
        )
        if (!snapshot) throw error(409, 'Logo selection changed')
        logoBaseline = await ensureLogoBaseline(
          ctx,
          oldId,
          createImageMutationGuards(
            db,
            payload.ctxType as ImageContextType,
            payload.ctxId,
            snapshot,
          ).before,
        )
      }
    }
    const stage = toImageStage(payload.env)
    const originalsBucket = getOriginalsBucketForStage(event.locals.platform, stage)
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
    let metadataDocument: ImageMetadataDocument = baseMetadataDocument
    const manifestDocument = {
      publicId: payload.publicId,
      version,
      updatedAt: timestamp,
    }

    if (
      (revisionUpload && revisionScope) ||
      creationAccess === 'creation-contribution'
    ) {
      if (payload.replaceImageId) {
        if (!payload.replaceImageRevisionId)
          throw error(409, 'Refresh the image before replacing it')
        await assertPermissionsToUpdateImage(
          db,
          user,
          ctx.isAdminRequest,
          { id: payload.replaceImageId } as ImageDBFlat,
          userRoles,
          payload.replaceImageId,
          payload.ctxId,
          ImageContextResource.feature,
        )
      }
      if (payload.size > 20 * 1024 * 1024)
        throw error(413, 'Image exceeds the supported delivery size')
      // Hash the exact finalized object; client hashes and mutable metadata sidecars are not evidence.
      const object = await originalsBucket.get(payload.publicId)
      let bytes: ArrayBuffer | undefined
      if (object) {
        if (object.size !== payload.size) throw error(409, 'Uploaded image changed')
        bytes = await object.arrayBuffer()
      } else {
        const credentials = getStorageApiCredentials(event.locals.platform)
        const remote = credentials
          ? await readR2ObjectViaApi({
              ...credentials,
              bucket: getOriginalsBucketNameForStage(stage),
              objectKey: payload.publicId,
              fetchFn: event.fetch,
            })
          : null
        if (remote) bytes = Uint8Array.from(remote.body).buffer
      }
      if (!bytes || bytes.byteLength !== payload.size)
        throw error(409, 'Uploaded image bytes are unavailable')
      if (creationAccess === 'creation-contribution' && payload.replaceImageId)
        throw error(400, 'Creation contribution photos cannot replace accepted images')
      const draft =
        creationAccess === 'creation-contribution'
          ? await saveFeatureCreationUpload(db, {
              taskId: payload.ctxId,
              actorId: userId,
              storageNamespace: stage,
              storageKey: payload.publicId,
              mediaType: payload.contentType,
              bytes,
              metadata: {
                ...baseMetadataDocument,
                version,
                presentationMode: DEFAULT_UPLOAD_IMAGE_PRESENTATION,
              },
            })
          : await saveFeatureImageUploadDraft(db, {
              featureId: payload.ctxId,
              actorId: userId,
              reason: payload.replaceImageId
                ? 'Feature gallery photo replaced'
                : creationAccess === 'draft-contribution'
                  ? 'Contribution photo saved for review'
                  : 'Photo added to Feature gallery',
              guard: buildFeatureCommandScopeGuard(db, payload.ctxId, revisionScope!),
              storageNamespace: stage,
              storageKey: payload.publicId,
              mediaType: payload.contentType,
              bytes,
              taskIds: (params.persist?.links ?? []).map(link => link.taskId),
              draftContributor: creationAccess === 'draft-contribution',
              intent: ImageIntentIdSchema.parse(
                creationAccess === 'draft-contribution'
                  ? 'undefined'
                  : (params.persist?.featureImage?.intent ?? 'undefined'),
              ),
              replacement: payload.replaceImageId
                ? {
                    imageId: payload.replaceImageId,
                    imageRevisionId: payload.replaceImageRevisionId!,
                  }
                : undefined,
              deriveMetadata: previous => ({
                ...(previous
                  ? buildReplacementMetadataDocument({
                      existingDocument: previous,
                      incomingDocument: baseMetadataDocument,
                      version,
                      timestamp,
                      editorUserId: user.id,
                      editorName: editorUser?.name ?? null,
                      editorAttribution: editorUser?.attribution ?? null,
                      source: payload.replacementSnapshot!.source!,
                    })
                  : baseMetadataDocument),
                version,
                presentationMode: previous
                  ? (previous.presentationMode ?? 'contain')
                  : DEFAULT_UPLOAD_IMAGE_PRESENTATION,
              }),
            })
      if (draft.status === 'legacy') throw error(409, 'Feature enrollment changed')
      const stored = await db.get<{
        metadata: string
        storageKey: string
        storageNamespace: string
        contentHash: string
      }>(sql`
        SELECT ir.metadata,av.storageKey,av.storageNamespace,av.contentHash FROM imageRevision ir
        JOIN imageAssetVersion av ON av.id=ir.assetVersionId AND av.imageId=ir.imageId WHERE ir.id=${draft.imageRevisionId}`)
      const storedImage = await loadImageById(db, [eq(image.id, draft.imageId)])
      if (!stored || !storedImage) throw error(409, 'Upload receipt unavailable')
      const retained = JSON.parse(stored.metadata)
      const acceptedAssignment =
        draft.status === 'accepted'
          ? await db
              .select()
              .from(featureImage)
              .where(
                and(
                  eq(featureImage.featureId, payload.ctxId),
                  eq(featureImage.imageId, draft.imageId),
                ),
              )
              .get()
          : null
      const data = toImageEntityResponseShape(
        {
          ...storedImage,
          featureId:
            creationAccess === 'creation-contribution' ? undefined : payload.ctxId,
          publishedAt: acceptedAssignment?.publishedAt ?? undefined,
          intent: acceptedAssignment?.intent ?? undefined,
          isPublished: acceptedAssignment?.isPublished ?? false,
          publicId: stored.storageKey,
          env: stored.storageNamespace,
          contentHash: stored.contentHash,
          version: retained.version,
          presentationMode: retained.presentationMode,
        },
        {
          ctxType:
            creationAccess === 'creation-contribution'
              ? ImageContextResourceExtended.task
              : ImageContextResource.feature,
          ctxId: payload.ctxId,
        },
        'detail',
      ).data
      if (!data) throw error(500, 'Failed to shape upload receipt')
      return {
        data: {
          ...data,
          image: { ...data.image, imageRevisionId: draft.imageRevisionId },
          ...(draft.status === 'accepted'
            ? { revisionAccepted: { revisionId: draft.revisionId } }
            : {
                revisionDraft: {
                  proposalId: draft.proposalId,
                  candidateRevisionId: draft.candidateRevisionId,
                },
              }),
        },
      }
    }

    if (payload.replaceImageId) {
      const source = payload.replacementSnapshot!.source!
      const { document: existingDocument } = await readMetadataDocument({
        platform: event.locals.platform,
        env: toImageStage(source.env),
        publicId: source.publicId,
        version: source.version ?? undefined,
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
        source,
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
      presentationMode: 'contain',
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

    const logoEvidence = logoUpload
      ? await readLogoEvidence(
          ctx,
          { env: stage, publicId: payload.publicId },
          {
            ...metadataDocument,
            version,
            presentationMode: payload.replaceImageId
              ? ((logoBaseline?.metadata as Record<string, unknown>)
                  ?.presentationMode ?? 'contain')
              : DEFAULT_UPLOAD_IMAGE_PRESENTATION,
          },
        )
      : undefined
    const logoGuard =
      logoUpload && payload.replaceImageId
        ? await authorizeLogoOwners(ctx, payload.replaceImageId)
        : undefined
    const staged =
      !payload.replaceImageId && isSingleImageContext(payload.ctxType)
        ? await stageImageUpload(db, {
            data: imageData,
            actorId: userId,
            ctxType: payload.ctxType,
            ctxId: payload.ctxId,
            snapshot: payload.resourceSnapshot!,
            evidence: logoEvidence,
            expiresAt: payload.exp + 24 * 60 * 60 * 1000,
          })
        : null
    const created = staged
      ? {
          data: await completeSingleImageUpload(
            ctx,
            staged,
            payload.attachment ?? 'immediate',
          ),
        }
      : payload.replaceImageId
        ? await updateImageForContext({
            db,
            user,
            userId,
            userRoles,
            event,
            isAdminRequest: ctx.isAdminRequest,
            id: payload.replaceImageId as Id,
            logoRevision: logoEvidence
              ? {
                  ...logoEvidence,
                  guard: logoGuard,
                  expectedRevisionId: payload.replaceImageRevisionId,
                }
              : undefined,
            replacement: {
              snapshot: payload.replacementSnapshot!,
              publicId: payload.publicId,
              env: stage,
            },
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
        : await createImageInContext({
            db,
            userId,
            retryableUpload: true,
            logoEvidence,
            featureScope,
            resourceSnapshot: payload.resourceSnapshot,
            taskIds: (params.persist?.links ?? []).map(link => link.taskId),
            draftContributorId:
              creationAccess === 'draft-contribution' ? user.id : undefined,
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

    // A retry reuses the stored row version; never publish a manifest for an uncommitted version.
    const persistedVersion = created.data?.image?.version ?? version
    const persistedTimestamp = new Date(persistedVersion).toISOString()
    const selectedLogo =
      logoUpload && created.data?.image?.id
        ? await readResourceLogoHead(db, created.data.image.id)
        : null
    const previousMetadata =
      ('replayed' in created && created.replayed) || persistedVersion !== version
        ? await readMetadataDocument({
            platform: event.locals.platform,
            env: stage,
            publicId: payload.publicId,
            version: persistedVersion,
            fetchFn: event.fetch,
          })
        : null
    // Always repair mirrors; conditional canonical writes preserve the winning metadata.
    enqueueMetadataSidecarPersistence({
      bucket: originalsBucket,
      publicId: payload.publicId,
      version: persistedVersion,
      metadataDocument: selectedLogo
        ? (selectedLogo.metadata as ImageMetadataDocument)
        : previousMetadata?.document?.sourceVersion === persistedVersion
          ? previousMetadata.document
          : {
              ...metadataDocument,
              uploadedAt: params.metadata.uploadedAt ?? persistedTimestamp,
              ...(payload.replaceImageId
                ? {
                    metadata: {
                      ...metadataDocument.metadata,
                      replacementEditedAt: persistedTimestamp,
                    },
                  }
                : {}),
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
    if (
      payload.attachment !== 'deferred' &&
      previousResourceImage &&
      previousResourceImage.id !== created.data?.image?.id
    ) {
      event.locals.platform?.context.waitUntil(
        cleanupDetachedResourceImage({
          db,
          platform: event.locals.platform,
          image: previousResourceImage,
          preserveAssets:
            previousResourceImage.publicId === payload.publicId &&
            toImageStage(previousResourceImage.env) === stage,
        }),
      )
    }

    event.locals.platform?.context.waitUntil(
      enqueueDerivedAssetWarmup({
        event,
        env: stage,
        publicId: payload.publicId,
        version: persistedVersion,
      }),
    )
    return { data: created.data }
  },
)

/**
 * Creates a new image in context.
 * @param input Image payload and owning resource context.
 * @param ctx Guarded request with account, roles and database.
 * @returns Image envelope after atomic image and association persistence.
 * @remarks Non-upload creates retain fresh identities; resource snapshots reject concurrent pointer changes.
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

  // Capture the authorized pointer and parent scope before asynchronous role checks.
  const resourceSnapshot =
    imageData.ctxType === 'project' ||
    imageData.ctxType === 'organisation' ||
    imageData.ctxType === 'hub'
      ? await getResourceUploadSnapshot(db, imageData.ctxType, imageData.ctxId)
      : undefined
  const featureScope =
    imageData.ctxType === 'feature'
      ? await getFeatureImageCreationScope(db, imageData.ctxId)
      : undefined
  await assertPermissionsToCreateImage(
    db,
    user,
    ctx.isAdminRequest,
    userRoles,
    imageData.ctxType as ImageContextResource,
    imageData.ctxId as Id,
  )
  if (resourceSnapshot === null || featureScope === null)
    throw error(409, 'STALE_IMAGE_UPLOAD_CONTEXT')
  // Logo creation requires the verified upload receipt, including retained original bytes.
  if (isLogoContext(imageData.ctxType) && (await hasResourceLogoStorage(db))) {
    throw error(409, 'Use the verified image upload flow for resource logos')
  }
  return createImageInContext({ db, userId, imageData, resourceSnapshot, featureScope })
})

/**
 * Updates an existing image in context.
 * @param params Authorised context, displayed image revision and metadata fields.
 * @param ctx Authenticated request and resource permissions.
 * @returns Accepted metadata revision or the saved legacy image.
 * @remarks Staff metadata edits apply immediately while preserving publication visibility.
 */
export const updateImage = guardedCommand(UpdateImageSchema, async (params, ctx) => {
  const { db, user, userId, userRoles, event } = ctx
  if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  if (params.ctxType === ImageContextResource.feature) {
    const snapshot = await getImageMutationSnapshot(
      db,
      params.ctxType,
      params.ctxId,
      params.id,
    )
    await assertPermissionsToUpdateImage(
      db,
      user,
      ctx.isAdminRequest,
      { id: params.id } as ImageDBFlat,
      userRoles,
      params.id,
      params.ctxId,
      params.ctxType,
    )
    if (!snapshot) throw error(409, 'STALE_IMAGE_UPDATE')
    const saved = await saveFeatureImageMetadata(db, {
      featureId: params.ctxId,
      imageId: params.id,
      expectedImageRevisionId: params.imageRevisionId,
      actorId: userId,
      reason: 'Image metadata edited',
      guard: createImageMutationGuards(db, params.ctxType, params.ctxId, snapshot)
        .before,
      derive: previous => {
        // Only authored metadata can change here; source, ownership and moderation stay separate.
        const patch = ImageMetadataFullSchema.pick({
          credit: true,
          capturedAt: true,
          capture: true,
        })
          .extend({ presentationMode: z.enum(IMAGE_PRESENTATION_MODES).optional() })
          .strict()
          .parse(params.data)
        const version = Math.max(Date.now(), previous.version + 1)
        return {
          ...previous,
          ...patch,
          version,
          modifiedAt: new Date(version).toISOString(),
        }
      },
    })
    if (saved.status === 'accepted') return { data: null, revisionAccepted: saved }
  }
  if (isLogoContext(params.ctxType) && (await hasResourceLogoStorage(db))) {
    await assertPermissionsToUpdateImage(
      db,
      user,
      ctx.isAdminRequest,
      { id: params.id } as ImageDBFlat,
      userRoles,
      params.id,
      params.ctxId,
      params.ctxType,
    )
    const snapshot = await getImageMutationSnapshot(
      db,
      params.ctxType,
      params.ctxId,
      params.id,
    )
    if (!snapshot) throw error(409, 'Logo changed')
    const head = await ensureLogoBaseline(
      ctx,
      params.id,
      createImageMutationGuards(db, params.ctxType, params.ctxId, snapshot).before,
    )
    const previous = head.metadata as Record<string, unknown>
    const patch = ImageMetadataFullSchema.pick({
      credit: true,
      capturedAt: true,
      capture: true,
    })
      .extend({ presentationMode: z.enum(IMAGE_PRESENTATION_MODES).optional() })
      .strict()
      .parse(params.data)
    // Reject stale intent even when the submitted values happen to match the current head.
    if (params.imageRevisionId && params.imageRevisionId !== head.imageRevisionId)
      throw error(409, 'STALE_IMAGE_UPDATE')
    const guard = await authorizeLogoOwners(ctx, params.id)
    // Compare authored values before adding bookkeeping that would manufacture a revision.
    if (
      equalRevisionValue(head.metadata, {
        ...previous,
        ...patch,
      } as LogoRevisionEvidence['metadata'])
    ) {
      // A matching immutable mode can still have a stale legacy display projection.
      if (
        patch.presentationMode &&
        !(await reconcileLogoPresentation(db, {
          imageId: params.id,
          imageRevisionId: head.imageRevisionId,
          actorId: userId,
          guard: sql`(${guard}) AND (${createImageMutationGuards(db, params.ctxType, params.ctxId, snapshot).before})`,
        }))
      )
        throw error(409, 'STALE_IMAGE_UPDATE')
      return { data: null, unchanged: true }
    }
    const version = Math.max(Date.now(), Number(previous.version ?? 0) + 1)
    const metadata = {
      ...previous,
      ...patch,
      version,
      modifiedAt: new Date(version).toISOString(),
    }
    const updated = await updateImageForContext({
      db,
      user,
      userId,
      userRoles,
      event,
      isAdminRequest: ctx.isAdminRequest,
      id: params.id,
      ctxType: params.ctxType,
      ctxId: params.ctxId,
      expectedSnapshot: snapshot,
      data: {
        version,
        ...(patch.presentationMode ? { presentationMode: patch.presentationMode } : {}),
      },
      logoRevision: {
        asset: head.asset,
        metadata: metadata as LogoRevisionEvidence['metadata'],
        guard,
        expectedRevisionId: params.imageRevisionId,
      },
    })
    await persistOriginalMetadataSidecars({
      bucket: getOriginalsBucketForStage(
        event.locals.platform,
        toImageStage(head.asset.storageNamespace),
      ),
      publicId: head.asset.storageKey,
      version,
      metadataDocument: metadata as ImageMetadataDocument,
      manifestDocument: {
        publicId: head.asset.storageKey,
        version,
        updatedAt: new Date(version).toISOString(),
      },
      stage: toImageStage(head.asset.storageNamespace),
      event,
    }).catch(cause => {
      console.warn('Logo saved, but metadata mirrors could not refresh', cause)
    })
    return updated
  }
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
 * @param params Image identifier, context and requested rotation.
 * @param ctx Authorized request context.
 * @returns Updated image envelope after its metadata revision is selected atomically.
 * @remarks Source bytes and public ID remain unchanged; immutable metadata is selected by a guarded database update.
 * Legacy images without sidecars start at their stored pixel orientation after source existence is verified.
 */
export const rotateImage = guardedCommand(RotateImageSchema, async (params, ctx) => {
  const { db, user, userId, userRoles, event } = ctx
  if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  const existing = await loadImageById(db, [eq(image.id, params.id as Id)])

  if (!existing) {
    throw error(404, 'Image not found')
  }

  const snapshot = await getImageMutationSnapshot(
    db,
    params.ctxType as ImageContextType,
    params.ctxId,
    params.id,
  )
  if (
    !snapshot?.source ||
    snapshot.source.publicId !== existing.publicId ||
    snapshot.source.env !== existing.env ||
    snapshot.source.version !== (existing.version ?? null)
  )
    throw error(409, 'STALE_IMAGE_UPDATE')

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

  // Enrolled Feature edits branch from their displayed image pin, leaving shared bytes and sidecars intact.
  if (params.ctxType === ImageContextResource.feature) {
    const saved = await saveFeatureImageMetadata(db, {
      featureId: params.ctxId,
      imageId: params.id,
      expectedImageRevisionId: params.imageRevisionId,
      actorId: userId,
      reason: 'Image rotated',
      guard: createImageMutationGuards(db, params.ctxType, params.ctxId, snapshot)
        .before,
      derive: previous => {
        const version = Math.max(Date.now(), previous.version + 1)
        return {
          ...previous,
          ...toRotatedMetadataDocument({
            document: previous,
            rotation: params.rotation,
            version,
            timestamp: new Date(version).toISOString(),
          }),
          version,
        }
      },
    })
    if (saved.status === 'accepted') return { data: null, revisionAccepted: saved }
  }

  const logoHead =
    isLogoContext(params.ctxType) && (await hasResourceLogoStorage(db))
      ? await ensureLogoBaseline(
          ctx,
          params.id,
          createImageMutationGuards(db, params.ctxType, params.ctxId, snapshot).before,
        )
      : null
  const logoGuard = logoHead ? await authorizeLogoOwners(ctx, params.id) : undefined
  const env = toImageStage(
    existing.env ?? event.locals.platform?.env.ENVIRONMENT ?? ImageEnv.local,
  )
  const { document: storedDocument, resolvedEnv } = logoHead
    ? {
        document: logoHead.metadata as ImageMetadataDocument,
        resolvedEnv: toImageStage(logoHead.asset.storageNamespace),
      }
    : await readMetadataDocument({
        platform: event.locals.platform,
        env,
        publicId: existing.publicId,
        version: existing.version ?? undefined,
        fetchFn: event.fetch,
      })

  const originalsBucket = getOriginalsBucketForStage(event.locals.platform, resolvedEnv)
  // Legacy imports may have a source without sidecars; verify it before creating rotation metadata.
  if (!storedDocument) {
    const source = await verifyUploadedOriginal({
      bucket: originalsBucket,
      key: existing.publicId,
      stage: resolvedEnv,
      event,
    })
    if (!source) throw error(404, 'Image source not found')
  }
  const document: ImageMetadataDocument = (logoHead?.metadata as
    | ImageMetadataDocument
    | undefined) ??
    storedDocument ?? {
      rotation: 0,
      sourceRotation: 0,
      renderRotation: 0,
      uploadedAt: existing.createdAt,
    }

  // Rotation changes delivery metadata only; the stored source and public identity are immutable.
  const publicId = logoHead?.asset.storageKey ?? existing.publicId
  const targetRotation = normalizeRotation(params.rotation)
  // A debounced full turn or undo must not create sidecars or advance the logo journal.
  if (
    logoHead &&
    params.imageRevisionId &&
    params.imageRevisionId !== logoHead.imageRevisionId
  )
    throw error(409, 'STALE_IMAGE_UPDATE')
  if (targetRotation === normalizeRotation(document.rotation))
    return { data: null, unchanged: true }

  const version = Math.max(Date.now(), Number(existing.version ?? 0) + 1)
  const timestamp = new Date(version).toISOString()
  const metadataDocument = toRotatedMetadataDocument({
    document,
    rotation: targetRotation,
    version,
    timestamp,
  })
  const manifestDocument = {
    publicId,
    version,
    updatedAt: timestamp,
  }

  await persistOriginalMetadataSidecars({
    bucket: originalsBucket,
    publicId,
    version,
    metadataDocument,
    manifestDocument,
    immutableOnly: true,
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
    expectedSnapshot: snapshot,
    logoRevision: logoHead
      ? {
          asset: logoHead.asset,
          metadata: {
            ...metadataDocument,
            version,
            presentationMode: String(
              (logoHead.metadata as Record<string, unknown>).presentationMode ??
                'contain',
            ),
          } as LogoRevisionEvidence['metadata'],
          guard: logoGuard,
          expectedRevisionId: params.imageRevisionId,
        }
      : undefined,
    data: {
      publicId,
      env: resolvedEnv,
      version,
    },
  })

  // Publish unversioned mirrors only after the database selects the immutable metadata revision.
  await persistOriginalMetadataSidecars({
    bucket: originalsBucket,
    publicId,
    version,
    metadataDocument,
    manifestDocument,
    stage: resolvedEnv,
    event,
  }).catch(cause => {
    console.warn('Rotation saved, but metadata mirrors could not refresh', cause)
  })

  event.locals.platform?.context.waitUntil(
    enqueueDerivedAssetWarmup({
      event,
      env: resolvedEnv,
      publicId,
      version,
    }),
  )

  const { replayed: _replayed, ...result } = updated
  return result
})

/**
 * Deletes an image in context.
 * @param params Image identifier and authorization context.
 * @param ctx Guarded remote context.
 * @returns A success response after the database deletion commits.
 * @remarks Organisation logos are detached and retained for history. Other association
 * removal is atomic; storage cleanup is scheduled only after a hard deletion commits.
 */
export const deleteImage = guardedCommand(DeleteImageSchema, async (params, ctx) => {
  const { db, user, userRoles, event } = ctx
  if (user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')

  const snapshot = await getImageMutationSnapshot(
    db,
    params.ctxType as ImageContextType,
    params.ctxId,
    params.id,
  )
  await assertPermissionsToDeleteImage(
    db,
    user,
    ctx.isAdminRequest,
    userRoles,
    params.id as Id,
    params.ctxId as Id,
    params.ctxType as ImageContextResource | ImageContextResourceExtended,
  )

  if (!snapshot) throw error(409, 'STALE_IMAGE_DELETE')

  const imageToDelete = await loadImageById(db, [eq(image.id, params.id as Id)])
  if (!imageToDelete) {
    throw error(404, 'Image not found')
  }

  const deletionGuard = createImageMutationGuards(
    db,
    params.ctxType as ImageContextType,
    params.ctxId,
    snapshot,
  ).before

  // Organisation history retains the former logo: remove its current assignment, not its media.
  if (isLogoContext(params.ctxType) && (await hasResourceLogoStorage(db))) {
    const logoSnapshot = await getImageMutationSnapshot(
      db,
      params.ctxType,
      params.ctxId,
      params.id,
    )
    if (!logoSnapshot) throw error(409, 'Logo changed')
    await ensureLogoBaseline(
      ctx,
      params.id,
      createImageMutationGuards(db, params.ctxType, params.ctxId, logoSnapshot).before,
    )
  }
  if (params.ctxType === ImageContextResource.organisation) {
    const removed = await removeOrganisationImage(db, {
      organisationId: params.ctxId,
      imageId: params.id,
      actor: { actorId: user.id, reason: 'Organisation image removed' },
      guard: deletionGuard,
    })
    if (!removed) throw error(409, 'STALE_IMAGE_DELETE')
    return { type: 'success', message: 'Organisation image removed successfully' }
  }

  if (
    params.ctxType === ImageContextResource.project ||
    params.ctxType === ImageContextResource.hub
  ) {
    const removed = await removeAdminResourceImage(db, {
      resource: params.ctxType,
      resourceId: params.ctxId,
      imageId: params.id,
      actor: { actorId: user.id, reason: 'Resource image removed' },
      guard: deletionGuard,
    })
    if (!removed) throw error(409, 'STALE_IMAGE_DELETE')
    return { type: 'success', message: 'Resource image removed successfully' }
  }

  if (params.ctxType === ImageContextResource.feature) {
    const removed = await removeAcceptedFeatureImage(db, {
      featureId: params.ctxId,
      imageId: params.id,
      actorId: user.id,
      guard: deletionGuard,
    })
    if (removed === 'stale') throw error(409, 'STALE_IMAGE_DELETE')
    if (removed === 'removed')
      return { type: 'success', message: 'Image removed from Feature gallery' }
  }

  // Preserve associations and pending review revisions if deletion fails; clean assets after commit.
  if (!(await deleteImageWithEvidence(db, params.id, deletionGuard)))
    throw error(409, 'STALE_IMAGE_DELETE')

  event.locals.platform?.context.waitUntil(
    cleanupImageAssets({
      db,
      platform: event.locals.platform,
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

/** Discard a pending asset without ever detaching an attached resource image.
 * @param params Verified upload identity.
 * @returns Whether the receipt was canceled; repeat cleanup is safe after storage failures.
 * @remarks The tombstone commits before deleting bytes, excluding concurrent attachment and replay.
 */
export const discardImageUpload = guardedCommand(
  z.object({ imageId: z.string().min(1) }),
  async (params, ctx) => {
    const receipt = await discardStagedImageUpload(ctx.db, params.imageId, ctx.user.id)
    if (receipt) await cleanupStagedImageUpload(ctx, receipt)
    return { discarded: Boolean(receipt) }
  },
)

/** Finish tombstoned cleanup; failures retain a retryable receipt.
 * @param ctx Request storage bindings.
 * @param receipt Canceled receipt, never an attached resource.
 * @returns Completion after storage cleanup has succeeded.
 */
async function cleanupStagedImageUpload(
  ctx: Parameters<typeof readLogoEvidence>[0],
  receipt: StagedImageUpload,
): Promise<void> {
  // Retired avatars have a persisted row; pending assets have never been attached.
  if (receipt.selectedUrl) await deleteDetachedImage(ctx.db, receipt.imageId)
  await cleanupImageAssets({
    db: ctx.db,
    platform: ctx.event.locals.platform,
    image: receipt.data,
  })
  await ctx.db
    .update(imageUpload)
    .set({ expiresAt: 0 })
    .where(
      and(eq(imageUpload.imageId, receipt.imageId), eq(imageUpload.state, 'discarded')),
    )
}

/** Reclaim this actor's expired uploads and a bounded set of already discarded assets.
 * @param ctx Authorized upload request.
 * @returns Completion; a storage failure remains retryable on the next upload.
 */
async function cleanupExpiredImageUploads(
  ctx: Parameters<typeof readLogoEvidence>[0],
): Promise<void> {
  const expired = await listImageUploadsForCleanup(ctx.db, ctx.user.id)
  for (const candidate of expired) {
    const receipt = await discardStagedImageUpload(
      ctx.db,
      candidate.imageId,
      candidate.actorId,
    )
    if (receipt) await cleanupStagedImageUpload(ctx, receipt)
  }
}

/** Retry bounded cleanup after a form has consumed or abandoned its pending image.
 * @param params Empty request; cleanup only sees expired own uploads or terminal tombstones.
 * @returns Completion without exposing another uploader's receipt identities.
 */
export const cleanupImageUploads = guardedCommand(
  z.object({}),
  async (_params, ctx) => {
    if (ctx.user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    await cleanupExpiredImageUploads(ctx)
    return { cleaned: true }
  },
)
