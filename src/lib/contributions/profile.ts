// ZOD
import { z } from 'zod'
import { ImageListFields } from '#lib/db/zod/schema/imageList.js'

export const ContributionStatusSchema = z.enum([
  'published',
  'submitted',
  'rejected',
  'unpublished',
])
export type ContributionStatus = z.infer<typeof ContributionStatusSchema>

export const PrivateContributionDetailsSchema = z.object({
  features: z.record(
    z.string(),
    z.object({
      id: z.string(),
      projectId: z.string(),
      createdAt: z.string(),
      title: z.string(),
      address: z.string().nullable(),
      status: ContributionStatusSchema,
    }),
  ),
  images: z.record(
    z.string(),
    z.object({
      projectId: z.string(),
      featureId: z.string(),
      status: ContributionStatusSchema,
      image: ImageListFields,
    }),
  ),
})
export type PrivateContributionDetails = z.infer<
  typeof PrivateContributionDetailsSchema
>

/**
 * Resolves the current contribution state from publication and the latest review.
 * @param state Persisted publication/archive flags and latest non-draft submission.
 * @returns Publication wins; pending review precedes rejection and ordinary unpublication.
 * @remarks A reviewed, archived photo from an accepted partial review was rejected individually.
 */
export function getContributionStatus(state: {
  isPublished: boolean
  isArchived: boolean
  isPendingReview?: boolean
  isRejectedByPartialReview?: boolean
  review?: { isReviewed: boolean; reviewOutcome: string | null } | null
}): ContributionStatus {
  if (state.isPublished && !state.isArchived) return 'published'
  if (state.review && !state.review.isReviewed) return 'submitted'
  if (
    state.review?.isReviewed &&
    (state.review.reviewOutcome === 'rejected' || state.isRejectedByPartialReview)
  )
    return 'rejected'
  if (state.isPendingReview) return 'submitted'
  return 'unpublished'
}
