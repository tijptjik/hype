// DRIZZLE
import { eq, type SQL } from 'drizzle-orm'
// LIB
import { isAdminRequest } from '$lib/api'
// API
import { applyQueryFilters, removeExcludedColumns } from '$lib/api'
// AUTH
import {
  assertUserLoggedIn,
  assertAdminRequest,
  runAssertions,
  assertProjectMaintainerOrSuperAdmin,
  assertOrganisationOwnerOrSuperAdmin,
  assertProjectMaintainerOrMemberOrSuperAdmin,
  assertParamIdentifierEqualsFormIdentifier,
} from '$lib/auth/asserts'
// DB
import { userColumnsWithPrivacyProtected } from '$lib/db/services/user'
import { isSuperAdmin } from '$lib/client/services/auth'
// SCHEMA
import { image, featureImage, project, organisation } from '$lib/db/schema/index'
import {
  getImageById as loadImageById,
  toResponseShape,
  updateFeatureImage,
  updateImage as updateImageRecord,
} from '$lib/db/services/image'
// TYPES
import type {
  UserRoleDisco,
  Database,
  Id,
  QueryParams,
  ImageNew,
  ImageDBFlat,
  HubOpts,
  SessionUser,
  ImageContextType,
  ParamsToSign,
  DeleteParamsToSign,
  SignData,
} from '$lib/types'
import { ImageContextResource, ImageContextResourceExtended } from '$lib/enums'
import { error } from '@sveltejs/kit'
import { applyResourceContextConstraints } from '$lib/db/services/image'
import { getProjectIdForFeatureId } from '$lib/db/services/feature'
import { ImageFlatUpdate, ImageUpdate } from '$lib/db/zod/schema/image'
import { getUserById } from '$lib/db/services/user'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CONFIG
//    - intentOrder (const)
//
// 2. COMMON
//    - imageCollectionWithRelations (const)
//    - imageEntityWithRelations (const)
//
// 3. QUERY CONTEXT
//    - getImageQueryContext
//    - getImageEntityQueryContext
//
// 4. ASSERTIONS
//    - assertPermissionsToCreateImage
//    - assertPermissionsToUpdateImage
//    - assertPermissionsToDeleteImage
//
// 5. UTILS
//    - getCtxFromUrl
//    - updateImageForContext
//    - createCloudinarySignature
//    - deleteCloudinaryImage
//

// ═══════════════════════
// 1. CONFIG
// ═══════════════════════

/**
 * The order of intents for feature images.
 */
export const intentOrder = [
  'canonical',
  'closeUp',
  'context',
  'general',
  'undefined',
  'research',
] as const

export const adminIntentOrder = [
  'undefined',
  'canonical',
  'closeUp',
  'context',
  'general',
  'research',
] as const

// ═══════════════════════
// 2. COMMON
// ═══════════════════════

export const imageCollectionWithRelations = {
  featureImage: true,
  contributor: {
    columns: userColumnsWithPrivacyProtected,
  },
}

export const imageEntityWithRelations = {
  ...imageCollectionWithRelations,
}

// ═══════════════════════
// 3. QUERY CONTEXT
// ═══════════════════════

/**
 * Get the query context for the image resource.
 * Filters the query based on user roles, context (featureId, projectId, etc.), and query parameters.
 */
export const getImageQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  ctxId: Id, // ID of the parent resource (e.g., featureId, projectId)
  ctxType: ImageContextResource | ImageContextResourceExtended, // Type of the parent resource
) => {
  // SETUP : By default, only show non-archived images,
  // and disable isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = []
  const excludeColumns = ['isArchived', 'isPublished']

  // NON-SUPERADMIN : Hide images which are archived
  if (!isSuperAdmin(user)) {
    conditions.push(eq(image.isArchived, false))
  }

  // PUBLIC : List all images which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns)
    // For public, typically show images that are marked as published, or if their associated resource is published.
    if (ctxType === ImageContextResource.feature) {
      conditions.push(eq(featureImage.isPublished, true))
    } else if (ctxType === ImageContextResource.project) {
      conditions.push(eq(project.isPublished, true))
    } else if (ctxType === ImageContextResource.organisation) {
      conditions.push(eq(organisation.isPublished, true))
    } else if (ctxType === ImageContextResourceExtended.task) {
      // NO further restrictions on task images, as they are only accessible
      // from the Admin view
    }
  } else {
    // Admin view: allow filtering by isPublished if not a superadmin
    // TODO SECURITY : Technically, currently we allow maintainers to see unpublished feature images, from ANY project if they know the featureId.
    if (!isSuperAdmin(user)) {
      params = removeExcludedColumns(params, ['isArchived']) // Keep isPublished filterable
    } else {
      conditions = [] // Superadmin sees all
    }
  }

  // Filter by context (e.g., images for a specific feature)
  applyResourceContextConstraints(ctxType, ctxId, conditions)

  // Apply general query filters from params
  if (Object.keys(params).length > 0) {
    applyQueryFilters(image, params, conditions)
  }

  return { params, conditions, excludeColumns }
}

/**
 * Get the query context for a single image.
 * All images can be queried if their ID is known, except for images which have isArchived.
 * This is used for the /images/[id] route.
 */
export const getImageEntityQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
  params: QueryParams,
) => {
  // SETUP : By default, only show non-archived images,
  // and disable isArchived and isPublished filters from the query.
  let conditions: SQL<unknown>[] = []
  const excludeColumns = ['isArchived', 'isPublished']

  // NON-SUPERADMIN : Hide images which are archived
  if (!isSuperAdmin(user)) {
    conditions.push(eq(image.isArchived, false))
  }

  // PUBLIC : List all images which are isPublished, and not isArchived,
  if (!isAdminRequest(request)) {
    params = removeExcludedColumns(params, excludeColumns)
  } else {
    // Admin view: allow filtering by isPublished if not a superadmin
    if (!isSuperAdmin(user)) {
      params = removeExcludedColumns(params, ['isArchived']) // Keep isPublished filterable
    } else {
      conditions = [] // Superadmin sees all
    }
  }

  // Apply general query filters from params
  if (Object.keys(params).length > 0) {
    applyQueryFilters(image, params, conditions)
  }

  return { params, conditions, excludeColumns }
}

/**
 * Get the query context for images fetched by IDs.
 * This applies basic filtering for published and non-archived images for public requests.
 * Used for the /images?ids=... route.
 */
export const getImageByIdsQueryContext = (
  db: Database,
  user: SessionUser,
  request: Request,
) => {
  const conditions: SQL<unknown>[] = []

  // NON-SUPERADMIN : Hide images which are archived
  if (!isSuperAdmin(user)) {
    conditions.push(eq(image.isArchived, false))
  }

  // PUBLIC : Only show published images
  if (!isAdminRequest(request)) {
    conditions.push(eq(featureImage.isPublished, true))
  }

  return { conditions }
}

// ═══════════════════════
// 4. ASSERTIONS
// ═══════════════════════

/**
 * Asserts permissions to create an image for a given context (feature, project, etc.). Images are a second-class resource, and are always created in the context of a first-class resource : organisation, project, or feature. Images are only created directly from the admin interface, and not from the API. From the front-end, images are created indirectly by creating a task (newFeature, MissingReport or newPhoto) which in turn creates an image.
 */
export const assertPermissionsToCreateImage = async (
  db: Database,
  user: SessionUser,
  request: Request,
  hubOpts: HubOpts,
  data: ImageNew,
  userRoles: UserRoleDisco[],
  ctxType: ImageContextResource,
  ctxId: Id,
) => {
  const commonAssertions = [
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
  ]

  let contextAssertion = () => {} // Placeholder for context-specific assertion

  switch (ctxType) {
    case ImageContextResource.feature: {
      const projectId = await getProjectIdForFeatureId(db, ctxId as Id, hubOpts)
      contextAssertion = () =>
        assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId)
      break
    }
    case ImageContextResource.project:
      contextAssertion = () =>
        assertProjectMaintainerOrSuperAdmin(user, userRoles, ctxId)
      break
    case ImageContextResource.organisation:
      contextAssertion = () =>
        assertOrganisationOwnerOrSuperAdmin(user, userRoles, ctxId)
      break
  }

  const assertionError = runAssertions(...commonAssertions, contextAssertion)
  if (assertionError) return assertionError
}

/**
 * Asserts permissions to update/delete an image.
 * This might depend on who uploaded it, or roles in the associated context.
 */
export const assertPermissionsToUpdateImage = async (
  db: Database,
  user: SessionUser,
  request: Request,
  hubOpts: HubOpts,
  params: QueryParams,
  data: ImageDBFlat,
  userRoles: UserRoleDisco[],
  refId: Id,
  ctxId: Id,
  ctxType: ImageContextResource | ImageContextResourceExtended,
) => {
  const commonAssertions = [
    () => assertUserLoggedIn(user as any),
    () => assertAdminRequest(request),
    () => assertParamIdentifierEqualsFormIdentifier(data, refId, 'id'),
  ]

  // Implement logic to determine who can update/delete.
  // 1. Users with specific roles in the context (feature's project members/maintainers, organisation's owners, project's maintainers).
  // 2. SuperAdmins.
  let contextAssertion = () => {} // Placeholder

  switch (ctxType) {
    case ImageContextResource.feature: {
      const projectId = await getProjectIdForFeatureId(db, ctxId as Id, hubOpts)
      contextAssertion = () =>
        assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId)
      break
    }
    case ImageContextResource.project:
      contextAssertion = () =>
        assertProjectMaintainerOrSuperAdmin(user, userRoles, ctxId)
      break
    case ImageContextResource.organisation:
      contextAssertion = () =>
        assertOrganisationOwnerOrSuperAdmin(user, userRoles, ctxId)
      break
  }

  const assertionError = runAssertions(...commonAssertions, contextAssertion)
  if (assertionError) return assertionError
}

export const assertPermissionsToDeleteImage = async (
  db: Database,
  user: SessionUser,
  request: Request,
  hubOpts: HubOpts,
  params: QueryParams,
  userRoles: UserRoleDisco[],
  refId: Id,
  ctxId: Id,
  ctxType: ImageContextResource | ImageContextResourceExtended,
) => {
  return assertPermissionsToUpdateImage(
    db,
    user,
    request,
    hubOpts,
    params,
    { id: refId } as ImageDBFlat,
    userRoles,
    refId,
    ctxId,
    ctxType,
  )
}

// ═══════════════════════
// 5. UTILS
// ═══════════════════════

export const getCtxFromUrl = (url: URL) => {
  const organisationId = url.searchParams.get('organisationId')
  const projectId = url.searchParams.get('projectId')
  const featureId = url.searchParams.get('featureId')
  const taskId = url.searchParams.get('taskId')

  let ctxId: Id | null = null
  let ctxType: ImageContextResource | ImageContextResourceExtended | null = null

  if (featureId) {
    ctxId = featureId
    ctxType = ImageContextResource.feature
  } else if (projectId) {
    ctxId = projectId
    ctxType = ImageContextResource.project
  } else if (organisationId) {
    ctxId = organisationId
    ctxType = ImageContextResource.organisation
  } else if (taskId) {
    ctxId = taskId
    ctxType = ImageContextResourceExtended.task
  } else {
    return error(400, 'A featureId, organisationId, projectId, or taskId is required')
  }

  return { ctxId, ctxType }
}

/**
 * Updates an image for a given context with authorization and feature-image relation updates.
 */
export const updateImageForContext = async (args: {
  db: Database
  user: SessionUser
  userId: Id
  userRoles: UserRoleDisco[]
  event: App.RequestEvent
  id: string
  ctxType: ImageContextType
  ctxId: string
  data: Record<string, unknown>
}): Promise<{ data: ImageDBFlat }> => {
  const { db, user, userId, userRoles, event, id, ctxType, ctxId, data } = args
  const userWithAttribution = await getUserById(db, userId)

  const payload = {
    ...data,
    id,
  } as ImageDBFlat

  await assertPermissionsToUpdateImage(
    db,
    user,
    event.request,
    event.locals.hub,
    { id } as QueryParams,
    payload,
    userRoles,
    id as Id,
    ctxId as Id,
    ctxType,
  )

  const imageToUpdate = ImageUpdate.parse(data)
  let updatedImage: ImageDBFlat | undefined

  if (Object.keys(imageToUpdate).length > 0) {
    updatedImage = (await updateImageRecord(db, imageToUpdate, id as Id)) as ImageDBFlat
  } else {
    updatedImage = await loadImageById(db, [eq(image.id, id as Id)])
  }

  if (!updatedImage) {
    throw error(404, 'Image not found')
  }

  let updatedFeatureImage: Awaited<ReturnType<typeof updateFeatureImage>> | undefined
  const parseResult = ImageFlatUpdate.safeParse(data)
  if (parseResult.success && parseResult.data.featureId) {
    updatedFeatureImage = await updateFeatureImage(db, parseResult.data, id)
  }

  const responseData = await toResponseShape(
    updatedImage,
    updatedFeatureImage,
    userWithAttribution?.attribution ?? undefined,
  )

  return { data: responseData }
}

/**
 * Creates Cloudinary signature payload for direct uploads/deletes.
 */
export const createCloudinarySignature = async (
  paramsToSign: ParamsToSign | DeleteParamsToSign,
  platform: App.Platform | undefined,
): Promise<SignData> => {
  const timestamp = String(Date.now())
  const apiSecret = platform?.env?.CLOUDINARY_API_SECRET
  const apiKey = platform?.env?.CLOUDINARY_API_KEY
  const cloudName = platform?.env?.PUBLIC_CLOUDINARY_CLOUD_NAME

  if (!apiSecret || !apiKey || !cloudName) {
    throw error(500, 'Missing Cloudinary API credentials')
  }

  const params = Object.fromEntries(
    Object.entries({ ...paramsToSign, timestamp }).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  )
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key as keyof typeof params]}`)
    .join('&')

  const payload = new TextEncoder().encode(sortedParams + apiSecret)
  const hashBuffer = await crypto.subtle.digest('SHA-1', payload)
  const signature = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  return {
    signature,
    timestamp,
    cloudname: cloudName,
    apikey: apiKey,
  }
}

/**
 * Deletes a Cloudinary image by publicId using signed credentials.
 */
export const deleteCloudinaryImage = async (
  signData: SignData,
  publicId: string,
): Promise<void> => {
  const destroyResponse = await fetch(
    `https://api.cloudinary.com/v1_1/${signData.cloudname}/image/destroy`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        public_id: publicId,
        api_key: signData.apikey,
        timestamp: signData.timestamp,
        signature: signData.signature,
      }),
    },
  )

  if (!destroyResponse.ok) {
    const destroyJson = await destroyResponse.json()
    console.error('Cloudinary delete failed:', destroyJson.error?.message)
    return
  }

  const destroyJson = await destroyResponse.json()
  if (destroyJson.result !== 'ok' && destroyJson.result !== 'not found') {
    console.warn('Cloudinary deletion reported non-standard result:', destroyJson)
  }
}
