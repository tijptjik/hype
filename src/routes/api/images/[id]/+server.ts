// SVELTE
import { error, json } from '@sveltejs/kit'
// DRIZZLE
import { eq } from 'drizzle-orm'
// DB
import { image } from '$lib/db/schema/index'
import { getUserById } from '$lib/db/services/user'
import {
  getImageById,
  updateFeatureImage,
  toResponseShape,
  updateImage,
} from '$lib/db/services/image'
// ZOD
import { ImageFlatUpdate, ImageUpdate } from '$lib/db/zod/schema/image'
// API
import {
  delFromCloudinary,
  getDatabase,
  getSignedRequest,
  isValidQueryParamsOrError,
  JSONResponseOrError,
} from '$lib/api'
import {
  assertPermissionsToDeleteImage,
  assertPermissionsToUpdateImage,
  getCtxFromUrl,
  getImageEntityQueryContext,
} from '$lib/api/services/image'
// TYPES
import type { RequestHandler } from '@sveltejs/kit'
import type { Id, ImageDBFlat, QueryParams, FeatureImageDB } from '$lib/types'

/********************
 *  READ
 ************/

/**
 * Reads an image
 */
export const GET: RequestHandler = async ({
  params,
  url,
  locals,
  platform,
  request,
}) => {
  // ASSERT : User logged in
  const { db, user, userRoles } = await getDatabase(locals, platform)

  // ASSERT : Valid query parameters
  // Validate query parameters, or return 400
  const contextParams = [
    'hubId',
    'organisationId',
    'projectId',
    'featureId',
    'userId',
    'taskId',
  ]
  const queryParams = isValidQueryParamsOrError(image, url, contextParams)

  // CONTEXT : Get the query context
  const { conditions } = getImageEntityQueryContext(
    db,
    user,
    request,
    queryParams as QueryParams,
  )

  try {
    // Add condition for specific image ID
    conditions.push(eq(image.id, params.id!))
    // DB : Get the image
    const result = (await getImageById(db, conditions)) as ImageDBFlat

    return JSONResponseOrError(result)
  } catch (e) {
    console.error('Database query error:', e)
    return error(500, 'Dust Accumulation Critical')
  }
}

/**
 * Updates an image. Requires a valid context to be provided in the URL.
 *
 * PATCH /api/images/[id]?organisationId=...
 * PATCH /api/images/[id]?projectId=...
 * PATCH /api/images/[id]?featureId=...
 * PATCH /api/images/[id]?taskId=...
 */
export const PATCH: RequestHandler = async ({
  params,
  request,
  locals,
  platform,
  url,
}) => {
  // ASSERT : User logged in
  const {
    db,
    user: sessionUser,
    userId,
    userRoles,
  } = await getDatabase(locals, platform)
  const user = await getUserById(db, userId)
  const { ctxId, ctxType } = getCtxFromUrl(url)

  try {
    // ASSERT : Valid submitted data
    const data: ImageDBFlat = await request.json()

    // ASSERT : Access to context
    await assertPermissionsToUpdateImage(
      db,
      sessionUser,
      request,
      locals.hub,
      params as QueryParams,
      data,
      userRoles,
      params.id as Id,
      ctxId,
      ctxType,
    )

    const imageToUpdate = ImageUpdate.parse(data)
    let updatedImage: ImageDBFlat | undefined
    if (Object.keys(imageToUpdate).length > 0) {
      updatedImage = await updateImage(db, imageToUpdate, params.id as Id)
    } else {
      const existingImage = await getImageById(db, [eq(image.id, params.id as Id)])
      if (existingImage) {
        updatedImage = existingImage
      } else {
        return error(404, 'Image not found')
      }
    }
    let updatedFeatureImage: FeatureImageDB | undefined

    const parseResult = ImageFlatUpdate.safeParse(data)
    if (parseResult.success && parseResult.data.featureId) {
      // Only update featureImage if we have the required featureId
      updatedFeatureImage = await updateFeatureImage(
        db,
        parseResult.data,
        params.id as Id,
      )
    }
    const responseData = await toResponseShape(
      updatedImage,
      updatedFeatureImage,
      user?.attribution ?? undefined,
    )
    // DB : Return the created
    return json({ type: 'success', data: responseData })
  } catch (e) {
    console.error('Database query error:', e)
    return error(500, 'Dust Accumulation Critical')
  }
}

/**
 * Deletes an image. Requires a valid context to be provided in the URL.
 *
 * DELETE /api/images/[id]?organisationId=...
 * DELETE /api/images/[id]?projectId=...
 * DELETE /api/images/[id]?featureId=...
 */
export const DELETE: RequestHandler = async ({
  params,
  request,
  locals,
  platform,
  url,
  fetch: eventFetch,
}) => {
  // ASSERT : User logged in
  const { db, user, userId, userRoles } = await getDatabase(locals, platform)
  const { ctxId, ctxType } = getCtxFromUrl(url)

  try {
    // ASSERT : Access to context
    await assertPermissionsToDeleteImage(
      db,
      user,
      request,
      locals.hub,
      params as QueryParams,
      userRoles,
      params.id as Id,
      ctxId,
      ctxType,
    )

    // 1. Fetch image details to get publicId
    const conditions = [eq(image.id, params.id as Id)]
    const imageToDelete = await getImageById(db, conditions)

    if (!imageToDelete) {
      return error(404, 'Image not found')
    }

    // 2. Delete from database first (so UI stops trying to load the image)
    await db.delete(image).where(eq(image.id, params.id as Id))
    // Feature Image is deleted by cascade

    // 3. Delete from Cloudinary second (cleanup external resource)
    if (imageToDelete.publicId) {
      try {
        // Fetch signature for deletion
        const signData = await getSignedRequest(eventFetch, {
          public_id: imageToDelete.publicId,
        })
        await delFromCloudinary(eventFetch, signData, imageToDelete.publicId)
      } catch (cloudinaryError) {
        // Log but don't fail the entire operation if Cloudinary deletion fails
        console.warn(
          'Failed to delete from Cloudinary (database already cleaned up):',
          cloudinaryError,
        )
      }
    }

    return json({ type: 'success', message: 'Image deleted successfully' })
  } catch (e: any) {
    console.error('Failed to delete image:', e)

    // Check for specific D1 constraint error (taskImage foreign key constraint)
    if (
      e?.cause?.message?.includes('taskImage.imageId') &&
      e?.cause?.message?.includes('SQLITE_CONSTRAINT')
    ) {
      return error(400, 'Cannot delete image. It belongs to a Task')
    }

    // Check if it's a SvelteKit error object
    if (e && typeof e.status === 'number' && typeof e.body === 'object') {
      return error(e.status, e.body.message || 'Failed to delete image')
    }
    return error(500, 'Failed to delete image')
  }
}
