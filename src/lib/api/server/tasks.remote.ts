// REMOTE
import { guardedCommand, guardedForm, guardedQuery } from '$lib/api/server/remote'
import { error } from '@sveltejs/kit'
// I18N
import { getLocale } from '$lib/i18n'
// DRIZZLE
import { and, eq } from 'drizzle-orm'
// API
import { getValidQueryParams as validateQueryParams } from '$lib/api'
import {
  authorizeTaskListForContext,
  authorizeTaskReadForProbe,
  authorizeTaskReassignForProbe,
  toAuthMessage,
} from '$lib/api/services/authz'
import {
  feature,
  layer,
  organisation,
  project,
  task as taskTable,
} from '$lib/db/schema'
import { taskFeatureScopeCondition } from '$lib/db/services/task-scope'
import {
  BeginMissingReportDraftSchema,
  BeginNewFeatureDraftSchema,
  BeginNewPhotosDraftSchema,
  FinalizeTaskDraftSchema,
  GetTaskEditorDataSchema,
  GetTasksSchema,
  ReassignTaskLayerSchema,
  ReviewTaskSchema,
  SubmitMissingReportSchema,
  SubmitNewFeatureSchema,
  SubmitNewPhotosSchema,
} from '$lib/db/zod/schema/task'
import {
  createTask,
  loadTask,
  listTasks,
  probeTaskQuery,
  updateTask,
  commitTaskImageReview,
  commitTaskFeatureReview,
  commitTaskFeatureDraftFinalization,
  createTaskWithDependencies,
} from '$lib/db/services/task'
import {
  probeFeatureForUpdate,
  updateFeatureByIdWithConcurrency,
} from '$lib/db/services/feature'
import { listAssignableTaskLayers, probeLayerForUpdate } from '$lib/db/services/layer'
import {
  assertUserContributedFeatureDraftIsSubmittable,
  createUserContributedFeature,
  updateUserContributedFeatureDraft,
} from '$lib/api/services/feature'
// API SERVICES
import {
  getTaskWithRelations,
  toEntityResponseShape,
  toListResponseShape,
  toTaskProfile,
  toQueryConditions,
  toTaskPrisms,
} from '$lib/api/services/task'
// TYPES
import type {
  EntityResponse,
  GuardedCommandContext,
  GuardedFormContext,
  Id,
  ListResponse,
  TaskDB,
} from '$lib/types'
import type {
  BeginMissingReportDraftInput,
  BeginNewFeatureDraftInput,
  BeginNewPhotosDraftInput,
  SubmitMissingReportInput,
  SubmitNewFeatureInput,
  SubmitNewPhotosInput,
  TaskAdminProfile,
  TaskEntityByProfile,
  TaskGetParamsByProfile,
  TaskListByProfile,
  TaskListParamsByProfile,
  TaskProfile,
} from '$lib/db/zod/schema/task.types'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// GET
// - getTasks
// - getTask
//
// COMMAND
// - beginMissingReportDraft
// - beginNewFeatureDraft
// - beginNewPhotosDraft
// - finalizeTaskDraft
// - submitMissingReport
// - submitNewFeature
// - submitNewPhotos
// - reviewTask
// - reassignTaskLayer
//

/**
 * Rejects contribution writes from an anonymous session.
 *
 * @param user - Authenticated user resolved for the remote request.
 * @returns Nothing when the session belongs to a durable account.
 * @remarks Treat a missing anonymous marker as untrusted so a partial or stale
 * session object cannot turn a guest into a contributor.
 */
const assertContributionAccount = (
  user: GuardedCommandContext['user'] | GuardedFormContext['user'],
): void => {
  if (user.isAnonymous !== false) throw error(403, 'ACCOUNT_REQUIRED')
}

/**
 * Verifies that a contribution target resolves to a currently public layer,
 * project, and organisation chain.
 *
 * @param db Database handle.
 * @param target Submitted layer ancestry identifiers.
 * @returns Resolves when the target chain is valid for public contribution.
 * @throws 400 for an inconsistent or missing resource chain, otherwise 403 for
 * a non-public target.
 */
const assertPublicContributionScope = async (
  db: GuardedCommandContext['db'],
  target: {
    layerId: string
    projectId: string
    organisationId: string
  },
): Promise<void> => {
  const [scope] = await db
    .select({
      layerId: layer.id,
      layerProjectId: layer.projectId,
      layerOrganisationId: layer.organisationId,
      layerIsPublished: layer.isPublished,
      layerIsArchived: layer.isArchived,
      projectId: project.id,
      projectOrganisationId: project.organisationId,
      projectIsPublished: project.isPublished,
      projectIsArchived: project.isArchived,
      organisationId: organisation.id,
      organisationIsPublished: organisation.isPublished,
      organisationIsArchived: organisation.isArchived,
    })
    .from(layer)
    .innerJoin(project, eq(layer.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(
      and(
        eq(layer.id, target.layerId as Id),
        eq(layer.projectId, target.projectId as Id),
        eq(layer.organisationId, target.organisationId as Id),
        eq(project.id, target.projectId as Id),
        eq(project.organisationId, target.organisationId as Id),
        eq(organisation.id, target.organisationId as Id),
      ),
    )
    .limit(1)

  if (!scope) throw error(400, 'TASK_FEATURE_SCOPE_MISMATCH')
  if (
    !scope.layerIsPublished ||
    scope.layerIsArchived ||
    !scope.projectIsPublished ||
    scope.projectIsArchived ||
    !scope.organisationIsPublished ||
    scope.organisationIsArchived
  ) {
    throw error(403, 'FEATURE_NOT_AVAILABLE')
  }
}

/**
 * Verifies that a contribution target is a currently public feature in the
 * submitted layer/project/organisation chain.
 *
 * @param db Database handle.
 * @param target Submitted feature ancestry identifiers.
 * @returns Resolves when the target is valid for public contribution.
 * @throws 400 for an inconsistent or missing resource chain, otherwise 403 for
 * a non-public target.
 * @remarks The submitted layer id is checked against the persisted feature so
 * callers cannot attach a contribution to an unrelated layer identifier.
 */
const assertPublicContributionTarget = async (
  db: GuardedCommandContext['db'],
  target: {
    featureId: string
    layerId: string
    projectId: string
    organisationId: string
  },
): Promise<void> => {
  const [scope] = await db
    .select({
      featureId: feature.id,
      featureLayerId: feature.layerId,
      featureIsPublished: feature.isPublished,
      featureIsArchived: feature.isArchived,
      featureIsDraft: feature.isDraft,
      layerIsPublished: layer.isPublished,
      layerIsArchived: layer.isArchived,
      projectIsPublished: project.isPublished,
      projectIsArchived: project.isArchived,
      organisationIsPublished: organisation.isPublished,
      organisationIsArchived: organisation.isArchived,
    })
    .from(feature)
    .innerJoin(layer, eq(feature.layerId, layer.id))
    .innerJoin(project, eq(feature.projectId, project.id))
    .innerJoin(organisation, eq(project.organisationId, organisation.id))
    .where(
      and(
        eq(feature.id, target.featureId as Id),
        eq(feature.layerId, target.layerId as Id),
        eq(feature.projectId, target.projectId as Id),
        eq(feature.organisationId, target.organisationId as Id),
        eq(layer.projectId, target.projectId as Id),
        eq(layer.organisationId, target.organisationId as Id),
        eq(project.organisationId, target.organisationId as Id),
      ),
    )
    .limit(1)

  if (!scope) throw error(400, 'TASK_FEATURE_SCOPE_MISMATCH')
  if (
    !scope.featureIsPublished ||
    scope.featureIsArchived ||
    scope.featureIsDraft ||
    !scope.layerIsPublished ||
    scope.layerIsArchived ||
    !scope.projectIsPublished ||
    scope.projectIsArchived ||
    !scope.organisationIsPublished ||
    scope.organisationIsArchived
  ) {
    throw error(403, 'FEATURE_NOT_AVAILABLE')
  }
}

/**
 * Returns a role-scoped task list for admin callers.
 *
 * @param params List query params validated by `GetTasksSchema`.
 * @param params.conditions Optional task filters.
 * @param params.prisms Optional organisation/project prisms.
 * @param params.pagination Optional pagination controls.
 * @param params.sorting Optional sorting controls.
 * @param params.q Optional text query.
 * @param params.meta Optional request metadata.
 * @returns Paged task list response.
 */
const getTasksQuery = guardedQuery(GetTasksSchema, async (params, ctx) => {
  const { db, event, user, userRoles, isAdminRequest } = ctx
  const profile = toTaskProfile(params.meta?.profile, 'list')
  const normalizedConditions = Object.fromEntries(
    Object.entries(params.conditions ?? {}).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  )

  const queryParams = validateQueryParams<TaskDB>(
    taskTable,
    normalizedConditions as Partial<TaskDB>,
    { isDraft: false } as Partial<TaskDB>,
  )
  const normalizedPrisms = toTaskPrisms(params.prisms as never)

  const listDecision = authorizeTaskListForContext({
    user,
    userRoles,
    isAdminRequest,
    organisationIds: normalizedPrisms?.organisation ?? [],
    projectIds: normalizedPrisms?.project ?? [],
    resourceHubId: event.locals.hub.id ?? null,
  })
  if (!listDecision.allowed) {
    throw error(403, toAuthMessage(listDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const { conditions, filtersToApply } = toQueryConditions(
    db,
    user,
    isAdminRequest,
    queryParams,
    userRoles,
    normalizedPrisms,
    event.locals.hub.id ?? null,
  )

  const result = await listTasks(
    db,
    getTaskWithRelations(profile),
    conditions,
    {
      ...event.locals.hub,
      isSuperAdmin: Boolean(user.superAdmin),
    },
    params.pagination,
    params.sorting,
    {
      q: params.q,
      filtersToApply,
      locale: getLocale(),
    },
  )

  return await toListResponseShape(result, profile)
})
export const getTasks = getTasksQuery as typeof getTasksQuery &
  (<P extends TaskProfile = 'list'>(
    params: TaskListParamsByProfile<P>,
  ) => Promise<ListResponse<TaskListByProfile<P>>>)

/**
 * Returns the task editor payload for the admin task page.
 *
 * @param params Query params containing the task id.
 * @param ctx Guarded remote context.
 * @returns Task editor data with optional reassignment options.
 */
const getTaskQuery = guardedQuery(GetTaskEditorDataSchema, async (params, ctx) => {
  const { db, user, userRoles, isAdminRequest, event } = ctx
  const profile = toTaskProfile(params.meta?.profile, 'admin')
  const taskId = params.id as Id

  const probe = await probeTaskQuery(db, {
    ref: taskId,
  })
  if (!probe) {
    return toEntityResponseShape(null, profile)
  }

  const readDecision = authorizeTaskReadForProbe({
    user,
    userRoles,
    isAdminRequest,
    probe,
  })
  if (!readDecision.allowed) {
    throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
  }

  const queryParams = validateQueryParams<TaskDB>(taskTable, { id: taskId }, {
    isReviewed: probe.isReviewed,
  } as Partial<TaskDB>)
  const { conditions } = toQueryConditions(
    db,
    user,
    isAdminRequest,
    queryParams,
    userRoles,
    {
      organisation: [probe.organisationId],
      project: [probe.projectId],
      layer: [],
    },
    event.locals.hub.id ?? null,
  )

  const rawTask = await loadTask(db, getTaskWithRelations(profile), conditions, {
    ...event.locals.hub,
    isSuperAdmin: Boolean(user.superAdmin),
  })
  if (!rawTask) {
    return toEntityResponseShape(null, profile)
  }

  const canReassignLayer =
    rawTask.type === 'newFeature' &&
    authorizeTaskReassignForProbe({
      user,
      userRoles,
      isAdminRequest,
      probe: {
        id: rawTask.id,
        organisationId: rawTask.organisationId,
        projectId: rawTask.projectId,
        resourceHubId: event.locals.hub.id ?? null,
      },
    }).allowed

  return toEntityResponseShape(rawTask, profile, {
    assignableLayers: canReassignLayer
      ? await listAssignableTaskLayers(db, rawTask.projectId as Id)
      : [],
    canReassignLayer,
  })
})
export const getTask = getTaskQuery as typeof getTaskQuery &
  (<P extends TaskProfile = 'admin'>(
    params: TaskGetParamsByProfile<P>,
  ) => Promise<EntityResponse<TaskEntityByProfile<P>>>)

/**
 * Creates a draft reported-missing task and returns its server-minted ID.
 *
 * @param input Draft task payload.
 * @param ctx Guarded remote context.
 * @returns Draft task row.
 */
export const beginMissingReportDraft = guardedCommand(
  BeginMissingReportDraftSchema,
  async (
    input: BeginMissingReportDraftInput,
    ctx: GuardedCommandContext,
  ): Promise<{ data: unknown }> => {
    assertContributionAccount(ctx.user)
    if (input.reason.trim().length < 5) {
      throw error(400, 'TASK_REASON_TOO_SHORT')
    }
    await assertPublicContributionTarget(ctx.db, input)

    const createdTask = await createTask(ctx.db, {
      type: 'reportedMissing',
      featureId: input.featureId,
      projectId: input.projectId,
      organisationId: input.organisationId,
      contributorId: ctx.userId,
      message: input.reason.trim(),
      isDraft: true,
      isReviewed: false,
    })

    return { data: createdTask }
  },
)

/**
 * Creates a draft new-feature task and its backing feature record.
 *
 * @param input Draft task payload.
 * @param ctx Guarded remote context.
 * @returns Draft task row and created feature identifiers.
 */
export const beginNewFeatureDraft = guardedCommand(
  BeginNewFeatureDraftSchema,
  async (
    input: BeginNewFeatureDraftInput,
    ctx: GuardedCommandContext,
  ): Promise<{ data: unknown }> => {
    assertContributionAccount(ctx.user)
    await assertPublicContributionScope(ctx.db, input.task)
    const region = ctx.event.platform?.env?.PUBLIC_AZURE_TRANSLATION_REGION || ''
    const subscriptionKey = ctx.event.platform?.env?.AZURE_TRANSLATION_KEY || ''
    const draftFeature = {
      ...input.task.feature,
      contributorId: ctx.userId,
    }

    if (input.task.taskId) {
      const existingTask = await ctx.db.query.task.findFirst({
        where: and(
          eq(taskTable.id, input.task.taskId as Id),
          taskFeatureScopeCondition(),
        ),
      })

      if (!existingTask) {
        throw error(404, 'TASK_NOT_FOUND')
      }

      if (existingTask.contributorId !== ctx.userId) {
        throw error(403, 'TASK_DRAFT_FORBIDDEN')
      }

      // Submitted contributions must not be reset to drafts by a stale editor.
      if (!existingTask.isDraft || existingTask.isReviewed) {
        throw error(409, 'TASK_DRAFT_ALREADY_SUBMITTED')
      }

      if (existingTask.type !== 'newFeature') {
        throw error(400, 'TASK_TYPE_MISMATCH')
      }

      if (!existingTask.featureId) {
        throw error(400, 'TASK_FEATURE_REQUIRED')
      }

      const updatedFeature = await updateUserContributedFeatureDraft(
        ctx.db,
        existingTask.featureId as Id,
        {
          ...draftFeature,
          isDraft: true,
        },
        region,
        subscriptionKey,
      )

      const updatedTask = await updateTask(
        ctx.db,
        {
          organisationId: updatedFeature.organisationId,
          projectId: updatedFeature.projectId,
        },
        existingTask.id as Id,
      )

      return {
        data: {
          task: updatedTask,
          featureId: updatedFeature.id,
          layerId: updatedFeature.layerId,
          projectId: updatedFeature.projectId,
          organisationId: updatedFeature.organisationId,
        },
      }
    }

    const createdFeature = await createUserContributedFeature(
      ctx.db,
      {
        ...draftFeature,
        isDraft: true,
      },
      region,
      subscriptionKey,
    )

    const createdTask = await createTask(ctx.db, {
      type: 'newFeature',
      featureId: createdFeature.id,
      projectId: createdFeature.projectId,
      organisationId: createdFeature.organisationId,
      contributorId: ctx.userId,
      isDraft: true,
      isReviewed: false,
    })

    return {
      data: {
        task: createdTask,
        featureId: createdFeature.id,
        layerId: createdFeature.layerId,
        projectId: createdFeature.projectId,
        organisationId: createdFeature.organisationId,
      },
    }
  },
)

/**
 * Creates a draft new-photo task and returns its server-minted ID.
 *
 * @param input Draft task payload.
 * @param ctx Guarded remote context.
 * @returns Draft task row.
 */
export const beginNewPhotosDraft = guardedCommand(
  BeginNewPhotosDraftSchema,
  async (
    input: BeginNewPhotosDraftInput,
    ctx: GuardedCommandContext,
  ): Promise<{ data: unknown }> => {
    assertContributionAccount(ctx.user)
    await assertPublicContributionTarget(ctx.db, input)
    const createdTask = await createTask(ctx.db, {
      type: 'newPhoto',
      featureId: input.featureId,
      projectId: input.projectId,
      organisationId: input.organisationId,
      contributorId: ctx.userId,
      isDraft: true,
      isReviewed: false,
    })

    return { data: createdTask }
  },
)

/**
 * Marks a draft task as finalized after direct image uploads complete.
 *
 * @param params Draft task identifier.
 * @param ctx Guarded remote context.
 * @returns Updated task row.
 */
export const finalizeTaskDraft = guardedCommand(
  FinalizeTaskDraftSchema,
  async (params, ctx): Promise<{ data: unknown }> => {
    assertContributionAccount(ctx.user)
    const draftTask = await ctx.db.query.task.findFirst({
      with: {
        images: true,
      },
      where: and(eq(taskTable.id, params.id as Id), taskFeatureScopeCondition()),
    })

    if (!draftTask) {
      throw error(404, 'TASK_NOT_FOUND')
    }

    if (draftTask.contributorId !== ctx.userId) {
      throw error(403, 'TASK_DRAFT_FORBIDDEN')
    }

    if (!draftTask.isDraft) {
      return { data: draftTask }
    }

    if (!draftTask.images || draftTask.images.length === 0) {
      throw error(400, 'TASK_IMAGE_REQUIRED')
    }

    if (
      draftTask.type === 'reportedMissing' &&
      (!draftTask.message || draftTask.message.trim().length < 5)
    ) {
      throw error(400, 'TASK_REASON_TOO_SHORT')
    }

    if (draftTask.type === 'newFeature' && draftTask.featureId) {
      await assertUserContributedFeatureDraftIsSubmittable(
        ctx.db,
        draftTask.featureId as Id,
      )
    }

    if (draftTask.type === 'newFeature' && draftTask.featureId) {
      const featureProbe = await probeFeatureForUpdate(
        ctx.db,
        draftTask.featureId as Id,
      )

      if (!featureProbe) {
        throw error(404, 'FEATURE_NOT_FOUND')
      }

      const finalized = await commitTaskFeatureDraftFinalization(ctx.db, {
        task: draftTask,
        feature: featureProbe,
      })
      if (!finalized) {
        throw error(409, 'STALE_TASK_DRAFT')
      }
    } else {
      const finalizedTask = await updateTask(
        ctx.db,
        { isDraft: false },
        params.id as Id,
      )
      return { data: finalizedTask }
    }

    const finalizedTask = await loadTask(
      ctx.db,
      getTaskWithRelations('admin'),
      [eq(taskTable.id, params.id as Id)],
      { ...ctx.event.locals.hub, isSuperAdmin: Boolean(ctx.user.superAdmin) },
    )
    if (!finalizedTask) throw error(404, 'TASK_NOT_FOUND')
    return toEntityResponseShape(finalizedTask, 'admin')
  },
)

/**
 * Creates a reported-missing task without routing through the legacy REST endpoint.
 *
 * @param input Missing-report payload.
 * @param ctx Guarded remote context.
 * @returns Created task row.
 */
export const submitMissingReport = guardedForm(
  SubmitMissingReportSchema,
  async (
    input: SubmitMissingReportInput,
    ctx: GuardedFormContext,
  ): Promise<{ data: unknown }> => {
    assertContributionAccount(ctx.user)
    if (!Array.isArray(input.photos) || input.photos.length === 0) {
      ctx.invalid(ctx.issue('At least one image is required as evidence'))
    }

    if (input.reason.trim().length < 5) {
      ctx.invalid(ctx.issue('Reason must be at least 5 characters long'))
    }
    await assertPublicContributionTarget(ctx.db, input)

    const region = ctx.event.platform?.env?.PUBLIC_AZURE_TRANSLATION_REGION || ''
    const subscriptionKey = ctx.event.platform?.env?.AZURE_TRANSLATION_KEY || ''

    const createdTask = await createTaskWithDependencies(
      ctx.db,
      {
        type: 'reportedMissing',
        featureId: input.featureId,
        layerId: input.layerId,
        projectId: input.projectId,
        organisationId: input.organisationId,
        contributorId: ctx.userId,
        message: input.reason.trim(),
      },
      input.photos,
      ctx.userId,
      region,
      subscriptionKey,
      ctx.event.fetch,
    )

    return { data: createdTask }
  },
)

/**
 * Creates a new-feature task through the remote command layer.
 *
 * @param input New-feature payload.
 * @param ctx Guarded remote context.
 * @returns Created task row.
 */
export const submitNewFeature = guardedCommand(
  SubmitNewFeatureSchema,
  async (
    input: SubmitNewFeatureInput,
    ctx: GuardedCommandContext,
  ): Promise<{ data: unknown }> => {
    assertContributionAccount(ctx.user)
    if (!Array.isArray(input.photos) || input.photos.length === 0) {
      throw error(400, 'TASK_IMAGE_REQUIRED')
    }
    await assertPublicContributionScope(ctx.db, input.task)

    const region = ctx.event.platform?.env?.PUBLIC_AZURE_TRANSLATION_REGION || ''
    const subscriptionKey = ctx.event.platform?.env?.AZURE_TRANSLATION_KEY || ''

    const createdTask = await createTaskWithDependencies(
      ctx.db,
      input.task,
      input.photos,
      ctx.userId,
      region,
      subscriptionKey,
      ctx.event.fetch,
    )

    return { data: createdTask }
  },
)

/**
 * Creates a new-photo task through the remote command layer.
 *
 * @param input New-photo payload.
 * @param ctx Guarded remote context.
 * @returns Created task row.
 */
export const submitNewPhotos = guardedCommand(
  SubmitNewPhotosSchema,
  async (
    input: SubmitNewPhotosInput,
    ctx: GuardedCommandContext,
  ): Promise<{ data: unknown }> => {
    assertContributionAccount(ctx.user)
    if (!Array.isArray(input.photos) || input.photos.length === 0) {
      throw error(400, 'TASK_IMAGE_REQUIRED')
    }
    await assertPublicContributionTarget(ctx.db, input)

    const region = ctx.event.platform?.env?.PUBLIC_AZURE_TRANSLATION_REGION || ''
    const subscriptionKey = ctx.event.platform?.env?.AZURE_TRANSLATION_KEY || ''

    const createdTask = await createTaskWithDependencies(
      ctx.db,
      {
        type: 'newPhoto',
        featureId: input.featureId,
        layerId: input.layerId,
        projectId: input.projectId,
        organisationId: input.organisationId,
        contributorId: ctx.userId,
      },
      input.photos,
      ctx.userId,
      region,
      subscriptionKey,
      ctx.event.fetch,
    )

    return { data: createdTask }
  },
)

/**
 * Reviews a task from the admin task editor.
 *
 * @param params Review command params.
 * @param ctx Guarded remote context.
 * @returns Updated task entity.
 */
export const reviewTask = guardedCommand(
  ReviewTaskSchema,
  async (params, ctx): Promise<EntityResponse<TaskAdminProfile>> => {
    const taskId = params.id as Id
    const probe = await probeTaskQuery(ctx.db, {
      ref: taskId,
    })
    if (!probe) {
      return toEntityResponseShape(null, 'admin')
    }

    const readDecision = authorizeTaskReadForProbe({
      user: ctx.user,
      userRoles: ctx.userRoles,
      isAdminRequest: ctx.isAdminRequest,
      probe,
    })
    if (!readDecision.allowed) {
      throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    const rawTask = await loadTask(
      ctx.db,
      getTaskWithRelations('admin'),
      [
        eq(taskTable.id, taskId),
        eq(taskTable.projectId, probe.projectId),
        eq(taskTable.organisationId, probe.organisationId),
      ],
      {
        ...ctx.event.locals.hub,
        isSuperAdmin: Boolean(ctx.user.superAdmin),
      },
    )
    if (!rawTask) {
      throw error(404, 'TASK_NOT_FOUND')
    }

    // A stale editor must not overwrite a completed review or its feature changes.
    if (rawTask.isReviewed) {
      throw error(409, 'TASK_ALREADY_REVIEWED')
    }

    // Contributors must finish validation and uploads before moderation can begin.
    if (rawTask.isDraft) {
      throw error(409, 'TASK_NOT_SUBMITTED')
    }

    if (rawTask.type === 'newFeature') {
      if (!rawTask.featureId) throw error(400, 'TASK_FEATURE_REQUIRED')
      if (params.action !== 'reject' && params.action !== 'accept') {
        throw error(400, 'INVALID_TASK_ACTION')
      }

      const featureProbe = await probeFeatureForUpdate(ctx.db, rawTask.featureId as Id)
      if (!featureProbe) throw error(404, 'FEATURE_NOT_FOUND')

      const persisted = await commitTaskFeatureReview(ctx.db, {
        task: rawTask,
        feature: featureProbe,
        resourceHubId: probe.resourceHubId,
        action: params.action,
        reviewerId: ctx.userId,
        reason: params.reviewReason,
      })
      if (!persisted) throw error(409, 'STALE_TASK_REVIEW')
    } else if (rawTask.type === 'newPhoto') {
      if (
        params.action !== 'reject' &&
        params.action !== 'acceptAll' &&
        params.action !== 'acceptClassified'
      ) {
        throw error(400, 'INVALID_TASK_ACTION')
      }
      const persisted = await commitTaskImageReview(ctx.db, {
        task: rawTask,
        resourceHubId: probe.resourceHubId,
        action: params.action,
        reviewerId: ctx.userId,
        reason: params.reviewReason,
      })
      if (!persisted) throw error(409, 'STALE_TASK_REVIEW')
    } else if (rawTask.type === 'reportedMissing') {
      if (!rawTask.featureId) throw error(400, 'TASK_FEATURE_REQUIRED')

      if (params.action === 'reject') {
        const persisted = await commitTaskImageReview(ctx.db, {
          task: rawTask,
          resourceHubId: probe.resourceHubId,
          action: 'reject',
          reviewerId: ctx.userId,
          reason: params.reviewReason,
        })
        if (!persisted) throw error(409, 'STALE_TASK_REVIEW')
      } else {
        const featureProbe = await probeFeatureForUpdate(
          ctx.db,
          rawTask.featureId as Id,
        )
        if (!featureProbe) throw error(404, 'FEATURE_NOT_FOUND')

        if (
          params.action !== 'setIntangible' &&
          params.action !== 'setUnpublished' &&
          params.action !== 'setArchived'
        ) {
          throw error(400, 'INVALID_TASK_ACTION')
        }

        const persisted = await commitTaskFeatureReview(ctx.db, {
          task: rawTask,
          feature: featureProbe,
          resourceHubId: probe.resourceHubId,
          action: params.action,
          reviewerId: ctx.userId,
          reason: params.reviewReason,
        })
        if (!persisted) throw error(409, 'STALE_TASK_REVIEW')
      }
    } else {
      throw error(400, 'UNSUPPORTED_TASK_TYPE')
    }

    // Every review branch has committed its resource changes and completion together.
    const updatedTask = await loadTask(
      ctx.db,
      getTaskWithRelations('admin'),
      [eq(taskTable.id, rawTask.id as Id)],
      {
        ...ctx.event.locals.hub,
        isSuperAdmin: Boolean(ctx.user.superAdmin),
      },
    )
    if (!updatedTask) {
      throw error(404, 'TASK_NOT_FOUND')
    }

    return toEntityResponseShape(updatedTask, 'admin')
  },
)

/**
 * Reassigns the layer for a pending new-feature task.
 *
 * @param params Reassignment command params.
 * @param ctx Guarded remote context.
 * @returns Updated task entity.
 */
export const reassignTaskLayer = guardedCommand(
  ReassignTaskLayerSchema,
  async (params, ctx): Promise<EntityResponse<TaskAdminProfile>> => {
    const taskId = params.id as Id
    const probe = await probeTaskQuery(ctx.db, {
      ref: taskId,
    })
    if (!probe) {
      return toEntityResponseShape(null, 'admin')
    }

    const readDecision = authorizeTaskReadForProbe({
      user: ctx.user,
      userRoles: ctx.userRoles,
      isAdminRequest: ctx.isAdminRequest,
      probe,
    })
    if (!readDecision.allowed) {
      throw error(403, toAuthMessage(readDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    const rawTask = await loadTask(
      ctx.db,
      getTaskWithRelations('admin'),
      [eq(taskTable.id, taskId)],
      {
        ...ctx.event.locals.hub,
        isSuperAdmin: Boolean(ctx.user.superAdmin),
      },
    )
    if (!rawTask) {
      throw error(404, 'TASK_NOT_FOUND')
    }

    // Layer reassignment is restricted to pending tasks, matching the read-only editor.
    if (rawTask.isReviewed) {
      throw error(409, 'TASK_ALREADY_REVIEWED')
    }

    if (rawTask.type !== 'newFeature') {
      throw error(400, 'TASK_LAYER_REASSIGN_UNSUPPORTED')
    }

    const reassignDecision = authorizeTaskReassignForProbe({
      user: ctx.user,
      userRoles: ctx.userRoles,
      isAdminRequest: ctx.isAdminRequest,
      probe: {
        id: rawTask.id,
        organisationId: rawTask.organisationId,
        projectId: rawTask.projectId,
        resourceHubId: ctx.event.locals.hub.id ?? null,
      },
    })
    if (!reassignDecision.allowed) {
      throw error(403, toAuthMessage(reassignDecision.code ?? 'INSUFFICIENT_ROLE'))
    }

    if (!rawTask.featureId) {
      throw error(400, 'TASK_FEATURE_REQUIRED')
    }

    const targetLayer = await probeLayerForUpdate(ctx.db, params.layerId as Id)
    if (!targetLayer) {
      throw error(404, 'LAYER_NOT_FOUND')
    }

    if (targetLayer.projectId !== rawTask.projectId) {
      throw error(400, 'TASK_LAYER_PROJECT_MISMATCH')
    }

    const featureProbe = await probeFeatureForUpdate(ctx.db, rawTask.featureId as Id)
    if (!featureProbe) {
      throw error(404, 'FEATURE_NOT_FOUND')
    }

    const persisted = await updateFeatureByIdWithConcurrency(ctx.db, {
      id: featureProbe.id as Id,
      updatedAt: featureProbe.modifiedAt,
      data: {
        layerId: targetLayer.id as Id,
      },
    })
    if (!persisted) {
      throw error(409, 'STALE_FEATURE_WRITE')
    }

    const updatedTask = await loadTask(
      ctx.db,
      getTaskWithRelations('admin'),
      [eq(taskTable.id, rawTask.id as Id)],
      {
        ...ctx.event.locals.hub,
        isSuperAdmin: Boolean(ctx.user.superAdmin),
      },
    )
    if (!updatedTask) {
      throw error(404, 'TASK_NOT_FOUND')
    }

    return toEntityResponseShape(updatedTask, 'admin')
  },
)
