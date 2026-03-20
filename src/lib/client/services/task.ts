// TYPES
import type { NewFeatureTask, Id } from '$lib/types'
import type { ImageUpload } from '$lib/db/zod/schema/image.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Project } from '$lib/db/zod/schema/project.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
// API
import { updateFeatureState } from '$lib/api/server/feature.remote'
import type { Feature } from '$lib/db/zod/schema/feature.types'

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
 * @param contributorId - ID of the contributing user
 * @returns Promise resolving to the created task
 */
export const submitMissingReport = async (
  feature: Feature,
  layer: Layer,
  project: Project,
  organisation: Organisation,
  reason: string,
  photos: ImageUpload[],
  contributorId: Id,
): Promise<Response> => {
  // VALIDATION : At least one photo required
  if (photos.length === 0) {
    throw new Error('At least one image is required as evidence')
  }

  // VALIDATION : Minimum reason length
  if (reason.trim().length < 5) {
    throw new Error('Reason must be at least 5 characters long')
  }

  // FORM DATA : Create FormData for file uploads
  const formData = new FormData()

  // TASK DATA : Structure for reportedMissing task
  const taskData = {
    type: 'reportedMissing',
    featureId: feature.id,
    layerId: layer.id,
    projectId: project.id,
    organisationId: organisation.id,
    contributorId,
    message: reason.trim(),
  }

  formData.append('taskData', JSON.stringify(taskData))

  // IMAGES : Add photos to form data
  photos.forEach((photo, index) => {
    formData.append(`photo_${index}`, photo.file)
  })

  // API : Submit the task
  const response = await fetch('/api/tasks', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to submit missing report: ${errorText}`)
  }

  return response
}

/**
 * Creates a new task for submitting a new feature
 * @param newFeature - The new feature data
 * @param photos - Photos for the new feature
 * @param contributorId - ID of the contributing user
 * @returns Promise resolving to the created task
 */
export const submitNewFeature = async (
  newFeature: NewFeatureTask,
  photos: ImageUpload[],
): Promise<Response> => {
  // VALIDATION : At least one photo required
  if (photos.length === 0) {
    throw new Error('At least one image is required')
  }

  // VALIDATION : Title required
  if (!newFeature.feature.i18n || Object.keys(newFeature.feature.i18n).length === 0) {
    throw new Error('Title is required')
  }

  // FORM DATA : Create FormData for file uploads
  const formData = new FormData()

  // TASK DATA : Structure for newFeature task
  const taskData: NewFeatureTask = {
    ...newFeature,
    type: 'newFeature',
  }

  formData.append('taskData', JSON.stringify(taskData))

  // IMAGES : Add photos to form data
  photos.forEach((photo, index) => {
    formData.append(`photo_${index}`, photo.file)
  })

  // API : Submit the task
  const response = await fetch('/api/tasks', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to submit new feature: ${errorText}`)
  }

  return response
}

/**
 * Creates a new task for submitting new photos for an existing feature
 * @param feature - The existing feature
 * @param layer - The layer containing the feature
 * @param project - The project containing the layer
 * @param organisation - The organisation containing the project
 * @param photos - New photos to add
 * @param contributorId - ID of the contributing user
 * @returns Promise resolving to the created task
 */
export const submitNewPhotos = async (
  feature: Feature,
  layer: Layer,
  project: Project,
  organisation: Organisation,
  photos: ImageUpload[],
  contributorId: Id,
): Promise<Response> => {
  // VALIDATION : At least one photo required
  if (photos.length === 0) {
    throw new Error('At least one image is required')
  }

  // FORM DATA : Create FormData for file uploads
  const formData = new FormData()

  // TASK DATA : Structure for newPhoto task
  const taskData = {
    type: 'newPhoto',
    featureId: feature.id,
    layerId: layer.id,
    projectId: project.id,
    organisationId: organisation.id,
    contributorId,
  }

  formData.append('taskData', JSON.stringify(taskData))

  // IMAGES : Add photos to form data
  photos.forEach((photo, index) => {
    formData.append(`photo_${index}`, photo.file)
  })

  // API : Submit the task
  const response = await fetch('/api/tasks', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to submit new photos: ${errorText}`)
  }

  return response
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
  const response = await fetch(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reviewData),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Failed to update task: ${errorText}`)
  }

  return response
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

  return new Response(JSON.stringify(result), {
    headers: { 'Content-Type': 'application/json' },
  })
}
