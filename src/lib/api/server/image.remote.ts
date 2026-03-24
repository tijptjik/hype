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
  getImageByIdsQueryContext,
  getImageEntityQueryContext,
  getImageQueryContext,
  toImageProfile,
  toResponseShape,
  toResponseShapeProjectOrOrganisation,
  updateImageForContext,
} from '$lib/api/services/image'
// DB SERVICES
import {
  createFeatureImage,
  createImage as createImageRecord,
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
import type { Id, EntityResponse } from '$lib/types'
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
} from '$lib/db/zod/schema/image.types'
import { createUploadToken, verifyUploadToken } from '$lib/server/image-upload-auth'
import {
  createPresignedR2UploadUrl,
  getOriginalsBucketNameForStage,
  getOriginalsBucketForStage,
  readMetadataDocument,
  toManifestObjectKey,
  toMetadataObjectKey,
  toImageStage,
  toMetadataProfilePayload,
} from '$lib/server/image-storage'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getImagesForContext
// - getImagesForIds
// - getImageById
// - getMetadata
//
// FORM
// - none
//
// COMMAND
// - createImage
// - updateImage
// - setImageIntent
// - setImagePublished
// - deleteImage
// - authImageUpload
// - finalizeImageUpload

const probeContextState = async (
  db: any,
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
 * Returns image collections in context.
 */
export const getImagesForContext = guardedQuery(
  ImagesByContextSchema,
  async (params, ctx) => {
    const { db, user, userRoles, isAdminRequest } = ctx
    const profile = toImageProfile(params.meta?.profile, 'list')
    const context = await probeContextState(
      db,
      params.ctxType as ImageContextType,
      params.ctxId as Id,
    )

    const decision = authorizeImageList(
      {
        userId: user.id,
        userRoles,
        isAuthenticated: true,
        isAnonymous: user.isAnonymous,
      },
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
    const queryCtxType =
      params.ctxNarrowingType === ImageContextResourceExtended.task &&
      params.ctxNarrowingId
        ? ImageContextResourceExtended.task
        : (params.ctxType as ImageContextType)
    const queryCtxId =
      params.ctxNarrowingType === ImageContextResourceExtended.task &&
      params.ctxNarrowingId
        ? (params.ctxNarrowingId as Id)
        : (params.ctxId as Id)

    const { conditions } = getImageQueryContext(
      user,
      isAdminRequest,
      {},
      queryCtxId,
      queryCtxType,
    )

    const images = (await getImageForContextType(
      db,
      queryCtxType as ImageContextResource | ImageContextResourceExtended,
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
  const profile = toImageProfile(params.meta?.profile, 'list')
  // TODO(image/getImagesForIds): Transitional cache backfill endpoint.
  // Remove when cache is keyed by { featureId, imageId } and context-aware fetches replace ids lookup.
  const listDecision = authorizeImageList(
    {
      userId: user.id,
      userRoles,
      isAuthenticated: true,
      isAnonymous: user.isAnonymous,
    },
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
  const profile = toImageProfile(params.meta?.profile, 'detail')
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
    {
      userId: user.id,
      userRoles,
      isAuthenticated: true,
      isAnonymous: user.isAnonymous,
    },
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
    const { document } = await readMetadataDocument({
      platform: ctx.event.platform,
      env,
      publicId: params.publicId,
      version: params.version,
    })

    return {
      data: document ? toMetadataProfilePayload(document, params.profile) : null,
      durationMs: Date.now() - startedAt,
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
    const accountId = event.platform?.env.CLOUDFLARE_ACCOUNT_ID
    const accessKeyId = event.platform?.env.R2_S3_ACCESS_KEY_ID
    const secretAccessKey = event.platform?.env.R2_S3_SECRET_ACCESS_KEY
    const authSecret = event.platform?.env.AUTH_SECRET
    let publicId = `${params.ctxType}s/${params.ctxId}/${nanoid(16)}`

    if (!accountId || !accessKeyId || !secretAccessKey || !authSecret) {
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
      while (await bucket.head(publicId)) {
        publicId = `${params.ctxType}s/${params.ctxId}/${nanoid(16)}`
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
      accountId,
      bucket: bucketName,
      objectKey: publicId,
      accessKeyId,
      secretAccessKey,
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
  async (params: FinalizeImageUploadParams, ctx): Promise<ImageNew> => {
    const { user, event } = ctx
    const secret = event.platform?.env.AUTH_SECRET
    if (!secret) throw error(500, 'Upload auth secret not available')

    const payload = await verifyUploadToken(params.token, secret)
    if (!payload) throw error(403, 'Invalid upload token')
    if (payload.uploaderUserId !== user.id) {
      throw error(403, 'Upload token does not belong to the current user')
    }

    const stage = toImageStage(payload.env)
    const originalsBucket = getOriginalsBucketForStage(event.platform, stage)
    const uploadedObject = await originalsBucket.head(payload.publicId)

    if (!uploadedObject) {
      throw error(404, 'Uploaded image not found in storage')
    }
    if (uploadedObject.size !== payload.size) {
      throw error(400, 'Uploaded image size does not match the authorized upload')
    }

    const uploadedContentType = uploadedObject.httpMetadata?.contentType
    if (uploadedContentType && uploadedContentType !== payload.contentType) {
      throw error(
        400,
        'Uploaded image content type does not match the authorized upload',
      )
    }

    const version = Date.now()
    const timestamp = new Date(version).toISOString()
    const metadataDocument = {
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
    const manifestDocument = {
      publicId: payload.publicId,
      version,
      updatedAt: timestamp,
    }

    // Keep metadata sidecars adjacent to the stable source object key.
    await originalsBucket.put(
      toMetadataObjectKey(payload.publicId),
      JSON.stringify(metadataDocument),
      {
        httpMetadata: { contentType: 'application/json' },
      },
    )
    await originalsBucket.put(
      toMetadataObjectKey(payload.publicId, version),
      JSON.stringify(metadataDocument),
      {
        httpMetadata: { contentType: 'application/json' },
      },
    )
    await originalsBucket.put(
      toManifestObjectKey(payload.publicId),
      JSON.stringify(manifestDocument),
      {
        httpMetadata: { contentType: 'application/json' },
      },
    )

    return {
      cdn: 'cloudflareR2',
      env: stage,
      cdnId: null,
      publicId: payload.publicId,
      version,
      contributorId: user.id,
      ctxType: payload.ctxType as ImageContextResource,
      ctxId: payload.ctxId,
    } satisfies ImageNew
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
  const userWithAttribution = await getUserById(db, userId)
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

  if (imageData.ctxType === ImageContextResource.feature) {
    const validatedData = ImageInsertWithFeatureAPI.parse(imageData)
    const createdImage = await createImageRecord(db, validatedData)
    const createdFeatureImage = await createFeatureImage(
      db,
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
    imageData.ctxType === ImageContextResource.project ||
    imageData.ctxType === ImageContextResource.organisation
  ) {
    const validatedData = ImageInsertWithProjectOrOrganisationAPI.parse(imageData)
    const createdImage = await createImageRecord(db, validatedData)

    if (validatedData.ctxType === ImageContextResource.project) {
      await updateProjectById(db, { imageId: createdImage.id }, validatedData.ctxId)
    } else {
      await updateOrganisationById(
        db,
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

  if (imageData.ctxType === ImageContextResource.hub) {
    const validatedData = ImageInsertWithHubAPI.parse(imageData)
    const createdImage = await createImageRecord(db, validatedData)

    await db
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

  throw error(400, `Unsupported image context: ${imageData.ctxType}`)
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
    const featureId =
      params.featureId ??
      (params.ctxType === ImageContextResource.feature ? params.ctxId : undefined)

    if (!featureId) {
      throw error(400, 'featureId is required to set image intent')
    }

    return updateImageForContext({
      db,
      user,
      userId,
      userRoles,
      event,
      id: params.id,
      ctxType: params.ctxType as ImageContextType,
      ctxId: params.ctxId,
      data: {
        id: params.id,
        imageId: params.id,
        featureId,
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
    const featureId =
      params.featureId ??
      (params.ctxType === ImageContextResource.feature ? params.ctxId : undefined)

    if (!featureId) {
      throw error(400, 'featureId is required to set image publish status')
    }

    return updateImageForContext({
      db,
      user,
      userId,
      userRoles,
      event,
      id: params.id,
      ctxType: params.ctxType as ImageContextType,
      ctxId: params.ctxId,
      data: {
        id: params.id,
        imageId: params.id,
        featureId,
        isPublished: params.isPublished,
      },
    })
  },
)

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
