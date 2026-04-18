// API
import { updateFeatureState } from '$lib/api/server/feature.remote'
import {
  beginMissingReportDraft as beginMissingReportDraftRemote,
  beginNewFeatureDraft as beginNewFeatureDraftRemote,
  beginNewPhotosDraft as beginNewPhotosDraftRemote,
  finalizeTaskDraft as finalizeTaskDraftRemote,
  reviewTask as reviewTaskRemote,
} from '$lib/api/server/tasks.remote'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { DeepPartial, Id, NewFeatureTask, Task } from '$lib/types'
import type { TaskReviewUiAction } from '$lib/bits/patterns/tasks'
import type { ViewerRenderable } from '$lib/bits/patterns/images/images.types'
import type {
  ReviewTaskInput,
  TaskEditorLayerOption,
} from '$lib/db/zod/schema/task.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { ImageUpload, Intent } from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type {
  Organisation,
  OrganisationDB,
} from '$lib/db/zod/schema/organisation.types'
import type { Project, ProjectDB } from '$lib/db/zod/schema/project.types'
import type { Geometry } from 'geojson'
// IMAGE
import {
  finalizePreparedImageUpload,
  getGalleryItemTargetImageId,
  prepareImageUpload,
  uploadPreparedImageObject,
} from '$lib/client/services/image'
// ENUMS
import { ImageContextResource } from '$lib/enums'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. SHARED HELPERS
// - createJsonResponse
// - assertPhotosProvided
// - uploadTaskDraftImages
// - getReviewAction
// - getTaskReviewActionLabel
//
// 1. TASK STATE HELPERS
// - mergeResolvedTaskFeature
// - getEffectiveTaskLayerId
// - getSelectedTaskLayer
// - getTaskSyncSignature
// - isTaskImage
// - getTaskImageBadgeLabel
// - getTaskImageBadgeClass
// - getTaskReviewActionToastLabel
// - syncAssignedTaskLayerCache
//
// 2. TASK CREATION CLIENT SERVICES
// - upsertNewFeatureDraft
// - submitMissingReport
// - submitNewFeature
// - submitNewPhotos
//
// 3. TASK UPDATE CLIENT SERVICES
// - updateTaskReview
// - updateFeatureFromTask
// ---
/********************
 *  0. SHARED HELPERS
 ************/
// +++ Shared Helpers

const JSON_RESPONSE_HEADERS = { 'Content-Type': 'application/json' }
const DEFAULT_NEW_FEATURE_DRAFT_COORDINATES: [number, number] = [
  114.1693671540923, 22.319307515052614,
]

const TASK_SUBMISSION_STAGE = {
  draftingReport: 'draftingReport',
  uploadingImage: 'uploadingImage',
  submittingReport: 'submittingReport',
  draftingFeature: 'draftingFeature',
  submittingFeature: 'submittingFeature',
  draftingPhotos: 'draftingPhotos',
  submittingPhotos: 'submittingPhotos',
} as const

const toTaskSubmissionStageLabel = (
  stage: (typeof TASK_SUBMISSION_STAGE)[keyof typeof TASK_SUBMISSION_STAGE],
): string => {
  switch (stage) {
    case TASK_SUBMISSION_STAGE.draftingReport:
      return m.task_submission__drafting_report()
    case TASK_SUBMISSION_STAGE.uploadingImage:
      return m.task_submission__uploading_image()
    case TASK_SUBMISSION_STAGE.submittingReport:
      return m.task_submission__submitting_report()
    case TASK_SUBMISSION_STAGE.draftingFeature:
      return m.task_submission__drafting_feature()
    case TASK_SUBMISSION_STAGE.submittingFeature:
      return m.task_submission__submitting_feature()
    case TASK_SUBMISSION_STAGE.draftingPhotos:
      return m.task_submission__drafting_photos()
    case TASK_SUBMISSION_STAGE.submittingPhotos:
      return m.task_submission__submitting_photos()
  }
}

/**
 * Creates a standard JSON response for remote action payloads.
 * @param data - Payload to serialize in the response body
 * @returns JSON response wrapping the remote payload
 */
const createJsonResponse = (data: unknown): Response =>
  new Response(JSON.stringify(data), {
    headers: JSON_RESPONSE_HEADERS,
  })

/**
 * Ensures at least one uploaded image is present.
 * @param photos - Uploaded image descriptors from the client
 * @param errorMessage - Error thrown when no photos are provided
 */
const assertPhotosProvided = (photos: ImageUpload[], errorMessage: string): void => {
  if (photos.length === 0) {
    throw new Error(errorMessage)
  }
}

/**
 * Normalizes the client-side new-feature draft into the minimum persisted task payload.
 * @param newFeature Mutable new-feature draft from app state.
 * @returns Draft-safe task payload ready for remote persistence.
 */
const toDraftNewFeatureTask = (
  newFeature: DeepPartial<NewFeatureTask>,
): NewFeatureTask => {
  const geometry = newFeature.feature?.geometry ?? {
    type: 'Point',
    coordinates: DEFAULT_NEW_FEATURE_DRAFT_COORDINATES,
  }
  const i18n = (newFeature.feature?.i18n ?? {}) as NonNullable<
    NewFeatureTask['feature']['i18n']
  >

  return {
    type: 'newFeature',
    taskId: newFeature.taskId,
    featureId: newFeature.featureId,
    layerId: newFeature.layerId as Id,
    organisationId: newFeature.organisationId as Id,
    projectId: newFeature.projectId as Id,
    contributorId: newFeature.contributorId as Id,
    feature: {
      organisationId:
        newFeature.feature?.organisationId ?? (newFeature.organisationId as Id),
      projectId: newFeature.feature?.projectId ?? (newFeature.projectId as Id),
      layerId: newFeature.feature?.layerId ?? (newFeature.layerId as Id),
      contributorId: newFeature.feature?.contributorId,
      isDraft: true,
      geometry: geometry as Geometry,
      i18n,
      properties: (newFeature.feature?.properties ?? []).filter(
        Boolean,
      ) as NewFeatureTask['feature']['properties'],
    },
  }
}

/**
 * Runs async work over a list with a small fixed concurrency.
 * This keeps image finalization off the fully-serial path without overwhelming D1.
 *
 * @param items Work items to process.
 * @param concurrency Maximum number of active workers.
 * @param worker Async worker for each item.
 * @returns Resolves once all items finish successfully.
 */
const mapWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> => {
  let nextIndex = 0
  const workerCount = Math.min(Math.max(concurrency, 1), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        await worker(items[currentIndex] as T)
      }
    }),
  )
}

/**
 * Uploads staged task photos through the direct-to-R2 image pipeline and links them to the task.
 * @param params - Task/image upload parameters.
 * @returns Resolves once all uploads are finalized and linked.
 */
const uploadTaskDraftImages = async (params: {
  taskId: Id
  featureId: Id
  organisationId: Id
  projectId: Id
  photos: ImageUpload[]
  intent: Intent
  finalizingLabel?: string
  onStatusChange?: (label: string) => void
}): Promise<void> => {
  const uploadCtx = {
    ctxType: ImageContextResource.feature,
    ctxId: params.featureId,
    organisation: { id: params.organisationId } as OrganisationDB,
    project: { id: params.projectId } as ProjectDB,
    links: [{ type: 'taskImage' as const, taskId: params.taskId }],
  }
  const featureImage = {
    isPublished: false,
    intent: params.intent,
  } as const

  params.onStatusChange?.(
    toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.uploadingImage),
  )
  const preparedUploads = await Promise.all(
    params.photos.map(photo => prepareImageUpload(photo.file, uploadCtx, featureImage)),
  )

  await Promise.all(
    preparedUploads.map(preparedUpload => uploadPreparedImageObject(preparedUpload)),
  )

  params.onStatusChange?.(
    params.finalizingLabel ??
      toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.submittingReport),
  )

  await mapWithConcurrency(preparedUploads, 2, async preparedUpload => {
    await finalizePreparedImageUpload(preparedUpload)
  })
}

/**
 * Resolves the review action string expected by the remote review API.
 * @param reviewData - Review outcome and action data from the client
 * @returns Remote action identifier derived from the review state
 */
const getReviewAction = (reviewData: {
  type: string
  reviewOutcome: string
  reviewAction: string
}): ReviewTaskInput['action'] => {
  if (reviewData.type === 'newFeature') {
    return reviewData.reviewOutcome === 'rejected' ? 'reject' : 'accept'
  }

  if (reviewData.type === 'newPhoto') {
    if (reviewData.reviewAction === 'ignored') {
      return 'reject'
    }

    return reviewData.reviewAction === 'added-all-photos'
      ? 'acceptAll'
      : 'acceptClassified'
  }

  if (reviewData.reviewAction === 'ignored') {
    return 'reject'
  }

  if (reviewData.reviewAction === 'set-intangible') {
    return 'setIntangible'
  }

  return reviewData.reviewAction === 'set-unpublished'
    ? 'setUnpublished'
    : 'setArchived'
}

/**
 * Resolves the display label for a persisted task review action.
 * @param reviewAction - Stored review action identifier from the task record
 * @returns Localized action label for task UI and filters
 */
export const getTaskReviewActionLabel = (reviewAction?: string | null): string => {
  switch (reviewAction) {
    case 'ignored':
      return m.task__review_action_declined()
    case 'set-unpublished':
      return m.forms__unpublished()
    case 'set-intangible':
      return m.feature__intangible()
    case 'set-archived':
      return m.bad_swift_cheetah_surge()
    case 'added-all-photos':
      return m.task__review_action_added_photos()
    case 'added-all-photos-with-intent':
      return m.task__review_action_added_selected_photos()
    case 'added-feature':
      return m.task__review_action_added_feature()
    default:
      return reviewAction ? reviewAction.replaceAll('-', ' ') : ''
  }
}

// ---
/********************
 *  1. TASK STATE HELPERS
 ************/
// +++ Task State Helpers

/**
 * Merges the cached feature copy with the task-attached feature snapshot.
 * @param task - Task carrying a feature reference or embedded feature data
 * @param featureCache - Feature cache keyed by feature ID
 * @returns Combined feature state when either source is available
 */
export const mergeResolvedTaskFeature = (
  task: Pick<Task, 'featureId' | 'feature'>,
  featureCache: Map<Id, Feature>,
): Feature | null => {
  const cachedFeature = task.featureId
    ? (featureCache.get(task.featureId as Id) ?? null)
    : null

  if (!cachedFeature && !task.feature) {
    return null
  }

  return {
    ...(cachedFeature ?? {}),
    ...(task.feature ?? {}),
  } as Feature
}

/**
 * Resolves the effective layer for a task, preferring the freshest feature state.
 * @param task - Task with direct or embedded layer references
 * @param resolvedFeature - Optional merged feature state for the task
 * @returns Effective layer ID backing the task editor state
 */
export const getEffectiveTaskLayerId = (
  task: Pick<Task, 'feature'>,
  resolvedFeature?: Pick<Feature, 'layerId'> | null,
): Id | null => (resolvedFeature?.layerId ?? task.feature?.layerId ?? null) as Id | null

/**
 * Resolves the currently selected layer from assignable options first, then cache fallback.
 * @param assignableLayers - Layers available for reassignment in the current editor state
 * @param layerId - Effective task layer ID
 * @param layerCache - Layer cache keyed by layer ID
 * @returns Matching layer option or cached layer when available
 */
export const getSelectedTaskLayer = (
  assignableLayers: TaskEditorLayerOption[],
  layerId: string | null | undefined,
  layerCache: Map<Id, Layer>,
): TaskEditorLayerOption | Layer | null => {
  if (!layerId) return null

  return (
    assignableLayers.find(layer => layer.id === layerId) ??
    layerCache.get(layerId as Id) ??
    null
  )
}

/**
 * Builds a cache-sync signature for the current task state.
 * @param task - Task whose mutation state should be tracked
 * @param effectiveLayerId - Effective layer ID currently associated with the task
 * @returns Signature string that changes when cache-relevant task fields change
 */
export const getTaskSyncSignature = (
  task: Pick<
    Task,
    'id' | 'isReviewed' | 'modifiedAt' | 'reviewAction' | 'reviewOutcome'
  >,
  effectiveLayerId: string | null,
): string =>
  [
    task.id,
    task.modifiedAt ?? '',
    task.isReviewed ? 'reviewed' : 'pending',
    task.reviewOutcome ?? '',
    task.reviewAction ?? '',
    effectiveLayerId ?? '',
  ].join(':')

/**
 * Resolves whether a gallery item is linked to the currently highlighted task image set.
 * @param item - Gallery item being rendered in the task image editor
 * @param items - Current gallery item collection used to resolve persisted image IDs
 * @param isImageHighlighted - Predicate backed by the image context highlight state
 * @returns True when the gallery item maps to a highlighted persisted task image
 */
export const isTaskImage = (
  item: ViewerRenderable,
  items: ViewerRenderable[],
  isImageHighlighted: (imageId: string) => boolean,
): boolean => {
  const persistedImageId =
    getGalleryItemTargetImageId(item.id, items) ?? item.status?.savedImageId ?? null

  return persistedImageId ? isImageHighlighted(persistedImageId) : false
}

/**
 * Resolves the admin badge label for a task image in review and pre-review states.
 * @param item - Gallery item being rendered
 * @param items - Current gallery item collection used to resolve persisted image IDs
 * @param isReviewed - Whether the parent task has already been reviewed
 * @param isImageHighlighted - Predicate backed by the image context highlight state
 * @returns Badge label when the item should show task review state, otherwise null
 */
export const getTaskImageBadgeLabel = (
  item: ViewerRenderable,
  items: ViewerRenderable[],
  isReviewed: boolean,
  isImageHighlighted: (imageId: string) => boolean,
): string | null => {
  const isLinkedToTask = isTaskImage(item, items, isImageHighlighted)

  if (!isReviewed) {
    return isLinkedToTask ? m.gallery__new_badge() : null
  }

  if (!isLinkedToTask) {
    return null
  }

  return item.isPublished === true ? 'ACCEPTED' : 'REJECTED'
}

/**
 * Resolves the admin badge class for a task image in review and pre-review states.
 * @param item - Gallery item being rendered
 * @param items - Current gallery item collection used to resolve persisted image IDs
 * @param isReviewed - Whether the parent task has already been reviewed
 * @param isImageHighlighted - Predicate backed by the image context highlight state
 * @returns Badge class name when the item should show task review state
 */
export const getTaskImageBadgeClass = (
  item: ViewerRenderable,
  items: ViewerRenderable[],
  isReviewed: boolean,
  isImageHighlighted: (imageId: string) => boolean,
): string | undefined => {
  const isLinkedToTask = isTaskImage(item, items, isImageHighlighted)

  if (!isReviewed) {
    return isLinkedToTask ? 'bg-[#2A6FEC]' : undefined
  }

  if (!isLinkedToTask) {
    return undefined
  }

  return item.isPublished === true ? 'bg-emerald-600' : 'bg-rose-600'
}

/**
 * Maps a review UI action to the success label used in admin toasts.
 * @param action - Review action dispatched from the task UI
 * @returns Human-readable past-tense label for toast messages
 */
export const getTaskReviewActionToastLabel = (action: TaskReviewUiAction): string => {
  switch (action) {
    case 'reject':
      return 'rejected'
    case 'accept':
      return 'accepted'
    case 'acceptAll':
      return 'accepted all photos'
    case 'acceptClassified':
      return 'accepted selected photos'
    case 'setIntangible':
      return 'marked intangible'
    case 'setUnpublished':
      return 'unpublished'
    case 'setArchived':
      return 'archived'
  }
}

/**
 * Mirrors the currently assigned task layer into the shared admin layer cache.
 * @param params - Layer selection, assignable layer options, and cache dependencies
 */
export const syncAssignedTaskLayerCache = (params: {
  layerId: string
  assignableLayers: TaskEditorLayerOption[]
  task: Pick<Task, 'projectId'>
  layerCache: Map<Id, Layer>
}): void => {
  const selectedLayer = params.assignableLayers.find(
    layer => layer.id === params.layerId,
  )
  if (!selectedLayer) return

  // Keep the layer cache aligned with task-level reassignment before related views refresh.
  params.layerCache.set(
    params.layerId as Id,
    {
      id: params.layerId as Id,
      code: selectedLayer.code,
      projectId: selectedLayer.projectId as Id,
      i18n: selectedLayer.i18n,
    } as unknown as Layer,
  )
}

// ---
/********************
 *  2. TASK CREATION CLIENT SERVICES
 ************/
// +++ Task Creation Client Services

/**
 * Creates or updates the provisional new-feature task and backing feature draft.
 * @param newFeature Current client-side draft state.
 * @returns Server-minted draft identifiers and resolved hierarchy ids.
 */
export const upsertNewFeatureDraft = async (
  newFeature: DeepPartial<NewFeatureTask>,
): Promise<{
  task: { id: Id }
  featureId: Id
  layerId: Id
  projectId: Id
  organisationId: Id
}> => {
  const draftResult = await beginNewFeatureDraftRemote({
    task: toDraftNewFeatureTask(newFeature),
  })

  return draftResult.data as {
    task: { id: Id }
    featureId: Id
    layerId: Id
    projectId: Id
    organisationId: Id
  }
}

/**
 * Creates a draft reported-missing task, uploads linked evidence images directly to R2, and finalizes the task.
 * @param feature - The feature being reported as missing.
 * @param layer - The layer containing the feature.
 * @param project - The project containing the feature.
 * @param organisation - The organisation containing the feature.
 * @param reason - The missing-report reason.
 * @param photos - Evidence photos staged on the client.
 * @returns Promise resolving to the finalized task payload.
 */
export const submitMissingReport = async (
  feature: Feature,
  layer: Layer,
  project: Project,
  organisation: Organisation,
  reason: string,
  photos: ImageUpload[],
  options: {
    onStatusChange?: (label: string) => void
  } = {},
): Promise<Response> => {
  assertPhotosProvided(photos, 'At least one image is required as evidence')

  if (reason.trim().length < 5) {
    throw new Error('Reason must be at least 5 characters long')
  }

  options.onStatusChange?.(
    toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.draftingReport),
  )
  const draftResult = await beginMissingReportDraftRemote({
    featureId: feature.id,
    layerId: layer.id,
    projectId: project.id,
    organisationId: organisation.id,
    reason: reason.trim(),
  })

  const draftTask = draftResult.data as { id: Id }

  await uploadTaskDraftImages({
    taskId: draftTask.id,
    featureId: feature.id,
    organisationId: organisation.id as Id,
    projectId: project.id as Id,
    photos,
    intent: 'research',
    finalizingLabel: toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.submittingReport),
    onStatusChange: options.onStatusChange,
  })

  options.onStatusChange?.(
    toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.submittingReport),
  )
  const finalizedTask = await finalizeTaskDraftRemote({
    id: draftTask.id,
  })

  return createJsonResponse(finalizedTask)
}

/**
 * Creates a draft new-feature task, uploads linked images directly to R2, and finalizes the task.
 * @param newFeature - The new feature data
 * @param photos - Photos for the new feature
 * @returns Promise resolving to the created task
 */
export const submitNewFeature = async (
  newFeature: NewFeatureTask,
  photos: ImageUpload[],
  options: {
    onStatusChange?: (label: string) => void
  } = {},
): Promise<Response> => {
  // Validate the minimum task submission inputs before invoking the remote action.
  assertPhotosProvided(photos, 'At least one image is required')

  if (!newFeature.feature.i18n || Object.keys(newFeature.feature.i18n).length === 0) {
    throw new Error('Title is required')
  }

  options.onStatusChange?.(
    toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.draftingFeature),
  )
  const draftData = await upsertNewFeatureDraft(newFeature)

  await uploadTaskDraftImages({
    taskId: draftData.task.id,
    featureId: draftData.featureId,
    organisationId: draftData.organisationId,
    projectId: draftData.projectId,
    photos,
    intent: 'undefined',
    finalizingLabel: toTaskSubmissionStageLabel(
      TASK_SUBMISSION_STAGE.submittingFeature,
    ),
    onStatusChange: options.onStatusChange,
  })

  options.onStatusChange?.(
    toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.submittingFeature),
  )
  const finalizedTask = await finalizeTaskDraftRemote({
    id: draftData.task.id,
  })

  return createJsonResponse(finalizedTask)
}

/**
 * Creates a draft new-photo task, uploads linked images directly to R2, and finalizes the task.
 * @param feature - The existing feature
 * @param layer - The layer containing the feature
 * @param project - The project containing the layer
 * @param organisation - The organisation containing the project
 * @param photos - New photos to add
 * @returns Promise resolving to the created task
 */
export const submitNewPhotos = async (
  feature: Feature,
  layer: Layer,
  project: Project,
  organisation: Organisation,
  photos: ImageUpload[],
  options: {
    onStatusChange?: (label: string) => void
  } = {},
): Promise<Response> => {
  // Validate the minimum task submission inputs before invoking the remote action.
  assertPhotosProvided(photos, 'At least one image is required')

  options.onStatusChange?.(
    toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.draftingPhotos),
  )
  const draftResult = await beginNewPhotosDraftRemote({
    featureId: feature.id,
    layerId: layer.id,
    projectId: project.id,
    organisationId: organisation.id,
  })

  const draftTask = draftResult.data as { id: Id }

  await uploadTaskDraftImages({
    taskId: draftTask.id,
    featureId: feature.id,
    organisationId: organisation.id as Id,
    projectId: project.id as Id,
    photos,
    intent: 'undefined',
    finalizingLabel: toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.submittingPhotos),
    onStatusChange: options.onStatusChange,
  })

  options.onStatusChange?.(
    toTaskSubmissionStageLabel(TASK_SUBMISSION_STAGE.submittingPhotos),
  )
  const finalizedTask = await finalizeTaskDraftRemote({
    id: draftTask.id,
  })

  return createJsonResponse(finalizedTask)
}

// ---
/********************
 *  3. TASK UPDATE CLIENT SERVICES
 ************/
// +++ Task Update Client Services

/**
 * Updates a task with review information.
 * @param taskId - ID of the task to update
 * @param reviewData - Review outcome and action data
 * @returns Promise resolving to the updated task
 */
export const updateTaskReview = async (
  taskId: Id,
  reviewData: {
    type: string
    reviewOutcome: string
    reviewAction: string
    reviewReason?: string
  },
): Promise<Response> => {
  const result = await reviewTaskRemote({
    id: taskId,
    action: getReviewAction(reviewData),
    reviewReason: reviewData.reviewReason,
  })

  return createJsonResponse(result.data)
}

/**
 * Updates a feature as part of task review process.
 * @param featureId - ID of the feature to update
 * @param updateData - Feature update data
 * @returns Promise resolving to the updated feature
 */
export const updateFeatureFromTask = async (
  featureId: Id,
  updateData: Record<string, unknown>,
): Promise<Response> => {
  const result = await updateFeatureState({
    id: featureId,
    data: updateData as {
      isPublished?: boolean
      isArchived?: boolean
      isIntangible?: boolean
      isVisitable?: boolean
      isPendingReview?: boolean
    },
    meta: {
      isAdminRequest: true,
    },
  })

  return createJsonResponse(result)
}
