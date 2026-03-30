// TYPES
import type { NewFeatureTask, Id } from '$lib/types'
import type { ImageUpload } from '$lib/db/zod/schema/image.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
// API
import { updateFeatureState } from '$lib/api/server/feature.remote'
import {
  submitMissingReport as submitMissingReportRemote,
  submitNewFeature as submitNewFeatureRemote,
  submitNewPhotos as submitNewPhotosRemote,
  reviewTask as reviewTaskRemote,
} from '$lib/api/server/tasks.remote'
import type { Feature } from '$lib/db/zod/schema/feature.types'

/**
 * TOC
 * 1. Shared helpers
 * 2. Task creation client services
 * 3. Task update client services
 */

// ═══════════════════════
// SHARED HELPERS
// ═══════════════════════

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
}): string => {
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

// ═══════════════════════
// TASK CREATION CLIENT SERVICES
// ═══════════════════════

/**
 * Creates a new task for reporting a missing feature
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
  // VALIDATION : At least one photo required
  assertPhotosProvided(photos, 'At least one image is required as evidence')

  // VALIDATION : Minimum reason length
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
 * Creates a new task for submitting a new feature
 * @param newFeature - The new feature data
 * @param photos - Photos for the new feature
 * @returns Promise resolving to the created task
 */
export const submitNewFeature = async (
  newFeature: NewFeatureTask,
  photos: ImageUpload[],
): Promise<Response> => {
  // VALIDATION : At least one photo required
  assertPhotosProvided(photos, 'At least one image is required')

  // VALIDATION : Title required
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
 * Creates a new task for submitting new photos for an existing feature
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
  // VALIDATION : At least one photo required
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

// ═══════════════════════
// TASK UPDATE CLIENT SERVICES
// ═══════════════════════

/**
 * Updates a task with review information
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
 * Updates a feature as part of task review process
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
