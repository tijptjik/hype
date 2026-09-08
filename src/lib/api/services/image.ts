// DRIZZLE
import { and, eq, isNull, or, sql, type SQL } from 'drizzle-orm'
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
import { taskFeatureScopeCondition } from '$lib/db/services/task-scope'
import { isSuperAdmin } from '$lib/client/services/auth'
import { isRelevantHubAdmin } from '$lib/api/services/authz/hub'
import { authorizeTaskReadForProbe } from '$lib/api/services/authz/task'
// SCHEMA
import {
  image,
  featureImage,
  project,
  organisation,
  hub,
  task,
  taskImage,
} from '$lib/db/schema/index'
import {
  getImageById as loadImageById,
  toImageEntityResponseShape,
  toResponseShape as toImageResponseShapeFromDb,
  toResponseShapeProjectOrOrganisation as toImageProjectOrOrganisationResponseShapeFromDb,
  updateFeatureImage,
  updateImage as updateImageRecord,
} from '$lib/db/services/image'
// TYPES
import type {
  UserRoleDisco,
  Database,
  Id,
  AssetRenderJob,
  QueryParams,
  SessionUser,
} from '$lib/types'
import type {
  Image,
  ImageContextEnvelope,
  ImageContextType,
  ImageDBFlat,
  FinalizeImageUploadLink,
  ImageProfile,
} from '$lib/db/zod/schema/image.types'
import { ImageContextResource, ImageContextResourceExtended } from '$lib/enums'
import { error, type RequestEvent } from '@sveltejs/kit'
import { applyResourceContextConstraints } from '$lib/db/services/image'
import { getProjectForFeatureId } from '$lib/db/services/project'
import { ImageFlatUpdate, ImageUpdate } from '$lib/db/zod/schema/image'
import { getUserById } from '$lib/db/services/user'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. CONFIG
//    - intentOrder (const)
//    - getImageWarmupQueue
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
//    - enqueueImageDerivativeWarmup
//    - updateImageForContext
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

const imageProfiles = ['list', 'card', 'detail', 'admin'] as const

export const toImageProfile = (value: unknown, fallback: ImageProfile): ImageProfile =>
  typeof value === 'string' && (imageProfiles as readonly string[]).includes(value)
    ? (value as ImageProfile)
    : fallback

export const getAssetRenderQueue = (
  platform?: App.Platform,
): Queue<AssetRenderJob> | null => platform?.env.ASSET_RENDER_QUEUE ?? null

/**
 * Shapes an image record plus optional feature-image fields into API wire format.
 *
 * @param image - Base image row.
 * @param featureImage - Optional related feature-image row.
 * @param attribution - Optional contributor attribution string.
 * @returns Flattened image payload for API responses.
 */
export const toResponseShape = async (
  image: Parameters<typeof toImageResponseShapeFromDb>[0],
  featureImage: Parameters<typeof toImageResponseShapeFromDb>[1],
  attribution: string | undefined,
): Promise<ImageDBFlat> => toImageResponseShapeFromDb(image, featureImage, attribution)

/**
 * Shapes a project/organisation scoped image into API wire format.
 *
 * @param image - Base image row.
 * @param attribution - Optional contributor attribution string.
 * @returns Image payload for API responses.
 */
export const toResponseShapeProjectOrOrganisation = async (
  image: Parameters<typeof toImageProjectOrOrganisationResponseShapeFromDb>[0],
  attribution: string | undefined,
): Promise<Image> => toImageProjectOrOrganisationResponseShapeFromDb(image, attribution)

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
 * @param user Current session user.
 * @param adminContext Request or resolved admin-mode flag.
 * @param params Requested filters.
 * @param ctxId Parent resource identifier.
 * @param ctxType Parent resource type.
 * @returns Scoped query conditions and supported filters.
 */
export const getImageQueryContext = (
  user: SessionUser,
  adminContext: Request | boolean,
  params: QueryParams,
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
  const isAdmin =
    typeof adminContext === 'boolean' ? adminContext : isAdminRequest(adminContext)

  if (!isAdmin) {
    params = removeExcludedColumns(params, excludeColumns)
    // For public, typically show images that are marked as published, or if their associated resource is published.
    if (ctxType === ImageContextResource.feature) {
      conditions.push(eq(featureImage.isPublished, true))
    } else if (ctxType === ImageContextResource.hub) {
      conditions.push(eq(hub.isPublished, true))
    } else if (ctxType === ImageContextResource.project) {
      conditions.push(eq(project.isPublished, true))
    } else if (ctxType === ImageContextResource.organisation) {
      conditions.push(eq(organisation.isPublished, true))
    } else if (ctxType === ImageContextResource.user) {
      conditions.push(
        sql`exists (select 1 from "user" where "user"."id" = ${image.contributorId} and "user"."isArchived" = false)`,
      )
    } else if (ctxType === ImageContextResourceExtended.task) {
      // Task narrowing is also reachable from public queries; require reviewed publication.
      conditions.push(eq(featureImage.isPublished, true))
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
 * Public feature assignments must be published; non-superadmins cannot read archived images.
 * This is used for the /images/[id] route.
 * @param user Current session user.
 * @param adminContext Request or resolved admin-mode flag.
 * @param params Requested filters.
 * @returns Query conditions and supported filters.
 */
export const getImageEntityQueryContext = (
  user: SessionUser,
  adminContext: Request | boolean,
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
  const isAdmin =
    typeof adminContext === 'boolean' ? adminContext : isAdminRequest(adminContext)

  if (!isAdmin) {
    params = removeExcludedColumns(params, excludeColumns)
    // A single-image lookup must not choose an unpublished feature assignment.
    const publishedAssignment = or(
      isNull(featureImage.imageId),
      eq(featureImage.isPublished, true),
    )
    if (publishedAssignment) conditions.push(publishedAssignment)
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
  user: SessionUser,
  adminContext: Request | boolean,
) => {
  const conditions: SQL<unknown>[] = []

  // NON-SUPERADMIN : Hide images which are archived
  if (!isSuperAdmin(user)) {
    conditions.push(eq(image.isArchived, false))
  }

  // PUBLIC : Only show published images
  const isAdmin =
    typeof adminContext === 'boolean' ? adminContext : isAdminRequest(adminContext)

  if (!isAdmin) {
    conditions.push(eq(featureImage.isPublished, true))
  }

  return { conditions }
}

// ═══════════════════════
// 4. ASSERTIONS
// ═══════════════════════

/**
 * Asserts permissions to create an image for a given context (feature, project, etc.). Images are a second-class resource, and are always created in the context of a first-class resource : organisation, project, or feature. Images are only created directly from the admin interface, and not from the API. From the front-end, images are created indirectly by creating a task (newFeature, MissingReport or newPhoto) which in turn creates an image.
 * @param db Database handle.
 * @param user Current account.
 * @param requestOrIntent Legacy request or resolved guarded-remote admin intent.
 * @param userRoles Persisted roles.
 * @param ctxType Target resource type.
 * @param ctxId Target resource ID.
 * @param links Requested task associations.
 * @returns A draft-contribution marker for restricted uploads, otherwise nothing on admin access.
 */
export const assertPermissionsToCreateImage = async (
  db: Database,
  user: SessionUser,
  requestOrIntent: Request | boolean,
  userRoles: UserRoleDisco[],
  ctxType: ImageContextResource,
  ctxId: Id,
  links?: FinalizeImageUploadLink[],
) => {
  if (!user?.id || user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  const taskLinks = (links ?? []).filter(
    (link): link is Extract<FinalizeImageUploadLink, { type: 'taskImage' }> =>
      link.type === 'taskImage',
  )

  let canContributeToDraft = taskLinks.length > 0
  // Every requested link must belong to this feature, not just the first draft link.
  for (const taskLink of taskLinks) {
    const draftTask = await db.query.task.findFirst({
      where: and(eq(task.id, taskLink.taskId as Id), taskFeatureScopeCondition()),
    })
    if (
      ctxType !== ImageContextResource.feature ||
      !draftTask ||
      draftTask.featureId !== ctxId ||
      draftTask.isReviewed
    ) {
      throw error(403, 'IMAGE_TASK_CONTEXT_MISMATCH')
    }
    if (!draftTask.isDraft || draftTask.contributorId !== user.id)
      canContributeToDraft = false
  }
  if (canContributeToDraft) return 'draft-contribution' as const

  const commonAssertions = [
    () => assertUserLoggedIn(user),
    () => assertAdminRequest(requestOrIntent),
  ]

  let contextAssertion: () => void | Response

  switch (ctxType) {
    case ImageContextResource.feature: {
      const projectId = (await getProjectForFeatureId(db, ctxId as Id))?.id
      contextAssertion = () =>
        assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId ?? '')
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
    case ImageContextResource.hub:
      contextAssertion = () => {
        if (!isSuperAdmin(user) && !isRelevantHubAdmin(userRoles, ctxId)) {
          throw error(403, 'INSUFFICIENT_ROLE')
        }
      }
      break
    default:
      throw error(400, 'UNSUPPORTED_IMAGE_CONTEXT')
  }

  const assertionError = runAssertions(...commonAssertions, contextAssertion)
  if (assertionError) return assertionError
}

/**
 * Asserts permissions to update/delete an image.
 * This might depend on who uploaded it, or roles in the associated context.
 * @param db Database handle.
 * @param user Current account.
 * @param requestOrIntent Legacy request or resolved guarded-remote admin intent.
 * @param data Mutation payload.
 * @param userRoles Persisted roles.
 * @param refId Target image ID.
 * @param ctxId Claimed resource ID.
 * @param ctxType Claimed resource type.
 * @returns Nothing when both role and resource membership checks pass.
 */
export const assertPermissionsToUpdateImage = async (
  db: Database,
  user: SessionUser,
  requestOrIntent: Request | boolean,
  data: ImageDBFlat,
  userRoles: UserRoleDisco[],
  refId: Id,
  ctxId: Id,
  ctxType: ImageContextResource | ImageContextResourceExtended,
) => {
  if (!user?.id || user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
  const commonAssertions = [
    () => assertUserLoggedIn(user),
    () => assertAdminRequest(requestOrIntent),
    () => assertParamIdentifierEqualsFormIdentifier(data, refId, 'id'),
  ]
  const commonError = runAssertions(...commonAssertions)
  if (commonError) return commonError

  // Implement logic to determine who can update/delete.
  // 1. Users with specific roles in the context (feature's project members/maintainers, organisation's owners, project's maintainers).
  // 2. SuperAdmins.
  let contextAssertion: () => void | Response
  let contextCondition: SQL
  let allowedFeatureId: string | undefined

  switch (ctxType) {
    case ImageContextResource.feature: {
      allowedFeatureId = ctxId
      const projectId = (await getProjectForFeatureId(db, ctxId as Id))?.id
      contextAssertion = () =>
        assertProjectMaintainerOrMemberOrSuperAdmin(user, userRoles, projectId ?? '')
      contextCondition = sql`EXISTS (SELECT 1 FROM ${featureImage} WHERE ${featureImage.featureId} = ${ctxId} AND ${featureImage.imageId} = ${image.id})`
      break
    }
    case ImageContextResource.project:
      contextAssertion = () =>
        assertProjectMaintainerOrSuperAdmin(user, userRoles, ctxId)
      contextCondition = sql`EXISTS (SELECT 1 FROM ${project} WHERE ${project.id} = ${ctxId} AND ${project.imageId} = ${image.id})`
      break
    case ImageContextResource.organisation:
      contextAssertion = () =>
        assertOrganisationOwnerOrSuperAdmin(user, userRoles, ctxId)
      contextCondition = sql`EXISTS (SELECT 1 FROM ${organisation} WHERE ${organisation.id} = ${ctxId} AND ${organisation.imageId} = ${image.id})`
      break
    case ImageContextResource.hub:
      contextAssertion = () => {
        if (!isSuperAdmin(user) && !isRelevantHubAdmin(userRoles, ctxId)) {
          throw error(403, 'INSUFFICIENT_ROLE')
        }
      }
      contextCondition = sql`EXISTS (SELECT 1 FROM ${hub} WHERE ${hub.id} = ${ctxId} AND ${hub.imageId} = ${image.id})`
      break
    case ImageContextResourceExtended.task: {
      const [taskRow] = await db
        .select({
          id: task.id,
          featureId: task.featureId,
          projectId: task.projectId,
          organisationId: task.organisationId,
          resourceHubId: organisation.hubId,
        })
        .from(task)
        .innerJoin(organisation, eq(organisation.id, task.organisationId))
        .where(and(eq(task.id, ctxId), taskFeatureScopeCondition()))
        .limit(1)
      allowedFeatureId = taskRow?.featureId
      contextAssertion = () => {
        if (
          !taskRow ||
          !authorizeTaskReadForProbe({
            user,
            userRoles,
            isAdminRequest: true,
            probe: taskRow,
          }).allowed
        )
          throw error(403, 'INSUFFICIENT_ROLE')
      }
      contextCondition = sql`EXISTS (SELECT 1 FROM ${taskImage} WHERE ${taskImage.taskId} = ${ctxId} AND ${taskImage.imageId} = ${image.id})`
      break
    }
    default:
      throw error(400, 'UNSUPPORTED_IMAGE_CONTEXT')
  }

  const assertionError = runAssertions(contextAssertion)
  if (assertionError) return assertionError

  // Shared images must not let a payload redirect an assignment edit to another feature.
  if (data.featureId && data.featureId !== allowedFeatureId) {
    throw error(403, 'IMAGE_FEATURE_CONTEXT_MISMATCH')
  }

  // A role in one resource never grants mutation rights over an unrelated image ID.
  const [linkedImage] = await db
    .select({ id: image.id })
    .from(image)
    .where(and(eq(image.id, refId), contextCondition))
    .limit(1)
  if (!linkedImage) throw error(403, 'IMAGE_CONTEXT_MISMATCH')
}

export const assertPermissionsToDeleteImage = async (
  db: Database,
  user: SessionUser,
  requestOrIntent: Request | boolean,
  userRoles: UserRoleDisco[],
  refId: Id,
  ctxId: Id,
  ctxType: ImageContextResource | ImageContextResourceExtended,
) => {
  return assertPermissionsToUpdateImage(
    db,
    user,
    requestOrIntent,
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
  const hubId = url.searchParams.get('hubId')
  const organisationId = url.searchParams.get('organisationId')
  const projectId = url.searchParams.get('projectId')
  const featureId = url.searchParams.get('featureId')
  const userId = url.searchParams.get('userId')
  const taskId = url.searchParams.get('taskId')

  let ctxId: Id | null = null
  let ctxType: ImageContextResource | ImageContextResourceExtended | null = null

  if (featureId) {
    ctxId = featureId
    ctxType = ImageContextResource.feature
  } else if (hubId) {
    ctxId = hubId
    ctxType = ImageContextResource.hub
  } else if (projectId) {
    ctxId = projectId
    ctxType = ImageContextResource.project
  } else if (organisationId) {
    ctxId = organisationId
    ctxType = ImageContextResource.organisation
  } else if (userId) {
    ctxId = userId
    ctxType = ImageContextResource.user
  } else if (taskId) {
    // DEPRECATED: Task-as-primary image context.
    // Remove after all callers migrate to:
    // ctxType=feature, ctxId=<featureId>, ctxNarrowingType=task, ctxNarrowingId=<taskId>.
    ctxId = taskId
    ctxType = ImageContextResourceExtended.task
  } else {
    return error(
      400,
      'A hubId, featureId, organisationId, projectId, userId, or taskId is required',
    )
  }

  return { ctxId, ctxType }
}

/**
 * Enqueues asynchronous image derivative warmup in the asset worker queue.
 *
 * @param params Queue payload inputs.
 * @returns Promise that settles after the queue accepts the message.
 */
export const enqueueDerivedAssetWarmup = async (params: {
  event: RequestEvent
  env: string
  publicId: string
  version?: number | null
}): Promise<void> => {
  const queue = getAssetRenderQueue(params.event.platform)
  if (!queue) return

  await queue.send({
    env: params.env === 'production' || params.env === 'preview' ? params.env : 'local',
    publicId: params.publicId,
    ...(typeof params.version === 'number' ? { version: params.version } : {}),
  })
}

/**
 * Updates an image for a given context with authorization and feature-image relation updates.
 */
export const updateImageForContext = async (args: {
  db: Database
  user: SessionUser
  userId: Id
  userRoles: UserRoleDisco[]
  event: RequestEvent
  isAdminRequest: boolean
  id: string
  ctxType: ImageContextType
  ctxId: string
  data: Record<string, unknown>
}): Promise<{ data: ImageContextEnvelope<'detail'> }> => {
  const { db, user, userId, userRoles, isAdminRequest, id, ctxType, ctxId, data } = args
  const userWithAttribution = await getUserById(db, userId)

  const payload = {
    ...data,
    id,
  } as ImageDBFlat

  await assertPermissionsToUpdateImage(
    db,
    user,
    isAdminRequest,
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

  const envelope = toImageEntityResponseShape(
    responseData as unknown as Image,
    { ctxType, ctxId: ctxId as Id },
    'detail',
  ).data
  if (!envelope) {
    throw error(500, 'Failed to shape image envelope')
  }

  return { data: envelope }
}
