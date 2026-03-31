// API
import { updateFeatureState } from '$lib/api/server/feature.remote'
import {
  reviewTask as reviewTaskRemote,
  submitMissingReport as submitMissingReportRemote,
  submitNewFeature as submitNewFeatureRemote,
  submitNewPhotos as submitNewPhotosRemote,
} from '$lib/api/server/tasks.remote'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type { Id, NewFeatureTask, Task } from '$lib/types'
import type { TaskReviewUiAction } from '$lib/bits/patterns/tasks'
import type { ViewerRenderable } from '$lib/bits/patterns/images/images.types'
import type {
  ReviewTaskInput,
  TaskEditorLayerOption,
} from '$lib/db/zod/schema/task.types'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { ImageUpload } from '$lib/db/zod/schema/image.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
// IMAGE
import { getGalleryItemTargetImageId } from '$lib/client/services/image'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. SHARED HELPERS
// - createJsonResponse
// - mapPhotoFiles
// - assertPhotosProvided
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
 * Extracts raw files from staged image uploads.
 * @param photos - Uploaded image descriptors from the client
 * @returns File array ready for remote submission
 */
const mapPhotoFiles = (photos: ImageUpload[]): File[] => photos.map(photo => photo.file)

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
 * Creates a new task for reporting a missing feature.
 * @param feature - The feature being reported as missing
 * @param layer - The layer containing the feature
 * @param project - The project containing the layer
 * @param organisation - The organisation containing the project
 * @param reason - The reason for reporting as missing
 * @param photos - Evidence photos
 * @returns Promise resolving to the created task
 */
export const submitMissingReport = async (
  feature: Feature,
  layer: Layer,
  project: Project,
  organisation: Organisation,
  reason: string,
  photos: ImageUpload[],
): Promise<Response> => {
  // Validate the minimum task submission inputs before invoking the remote action.
  assertPhotosProvided(photos, 'At least one image is required as evidence')

  if (reason.trim().length < 5) {
    throw new Error('Reason must be at least 5 characters long')
  }

  const result = await submitMissingReportRemote({
    featureId: feature.id,
    layerId: layer.id,
    projectId: project.id,
    organisationId: organisation.id,
    reason: reason.trim(),
    photos: mapPhotoFiles(photos),
  })

  return createJsonResponse(result)
}

/**
 * Creates a new task for submitting a new feature.
 * @param newFeature - The new feature data
 * @param photos - Photos for the new feature
 * @returns Promise resolving to the created task
 */
export const submitNewFeature = async (
  newFeature: NewFeatureTask,
  photos: ImageUpload[],
): Promise<Response> => {
  // Validate the minimum task submission inputs before invoking the remote action.
  assertPhotosProvided(photos, 'At least one image is required')

  if (!newFeature.feature.i18n || Object.keys(newFeature.feature.i18n).length === 0) {
    throw new Error('Title is required')
  }

  const result = await submitNewFeatureRemote({
    task: {
      ...newFeature,
      type: 'newFeature',
    },
    photos: mapPhotoFiles(photos),
  })

  return createJsonResponse(result)
}

/**
 * Creates a new task for submitting new photos for an existing feature.
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
): Promise<Response> => {
  // Validate the minimum task submission inputs before invoking the remote action.
  assertPhotosProvided(photos, 'At least one image is required')

  const result = await submitNewPhotosRemote({
    featureId: feature.id,
    layerId: layer.id,
    projectId: project.id,
    organisationId: organisation.id,
    photos: mapPhotoFiles(photos),
  })

  return createJsonResponse(result)
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
