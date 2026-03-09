// REMOTE
import { guardedCommand, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
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
  createCloudinarySignature,
  deleteCloudinaryImage,
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
  CloudinarySignatureSchema,
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
} from '$lib/db/zod'
// ENUMS
import { ImageContextResource, ImageContextResourceExtended } from '$lib/enums'
// TYPES
import type {
  DeleteParamsToSign,
  Id,
  EntityResponse,
  ParamsToSign,
  QueryParams,
} from '$lib/types'
import type {
  CreateImageParams,
  Image,
  ImageByIdParamsByProfile,
  ImageContextEnvelope,
  ImageContextType,
  ImageDBFlat,
  ImageNew,
  ImageProfile,
  ImagesForContextParamsByProfile,
  ImagesForIdsParamsByProfile,
  SignData,
} from '$lib/db/zod/schema/image.types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getImagesForContext
// - getImagesForIds
// - getImageById
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
// - getCloudinarySignature

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

const toRoleDebug = (roles: Array<{ type?: string; role?: string }>) =>
  roles.map(role => ({ type: role.type, role: role.role }))

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

  const { conditions } = getImageByIdsQueryContext(db, user, isAdminRequest)
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
  const { conditions } = getImageEntityQueryContext(db, user, isAdminRequest, {})
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
    event.locals.hub,
    imageData,
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
 * Deletes an image in context and attempts Cloudinary cleanup.
 */
export const deleteImage = guardedCommand(DeleteImageSchema, async (params, ctx) => {
  const { db, user, userRoles, event } = ctx

  await assertPermissionsToDeleteImage(
    db,
    user,
    event.request,
    event.locals.hub,
    { id: params.id } as QueryParams,
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

  if (imageToDelete.publicId) {
    try {
      const signData = await createCloudinarySignature(
        { public_id: imageToDelete.publicId },
        event.platform,
      )
      await deleteCloudinaryImage(signData, imageToDelete.publicId)
    } catch (cloudinaryError) {
      console.warn(
        'Failed to delete from Cloudinary (database already cleaned up):',
        cloudinaryError,
      )
    }
  }

  return { type: 'success', message: 'Image deleted successfully' }
})

/**
 * Creates Cloudinary signature data for direct upload.
 */
export const getCloudinarySignature = guardedCommand(
  CloudinarySignatureSchema,
  async (params, ctx): Promise<SignData> => {
    return createCloudinarySignature(
      params.paramsToSign as ParamsToSign | DeleteParamsToSign,
      ctx.event.platform,
    )
  },
)
