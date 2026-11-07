type ReviewEvidence = {
  status: string
  imageIds?: string[]
  submitted: { gallery: { order: string[] } }
  content: { gallery: { entries: Record<string, { intent: string }> } }
  excluded: string[]
}

/** Resolves a task photo decision without confusing acceptance with publication.
 * @param review Frozen proposal evidence owning this thumbnail.
 * @param imageId Thumbnail image identifier.
 * @param reviewAction Completed task action, including classified-only acceptance.
 * @returns A decision badge for submitted evidence, or null for existing context.
 * @remarks Pending exclusions remain provisional; existing gallery images have no task outcome.
 */
export function taskPhotoDecisionLabel(
  review: ReviewEvidence | undefined,
  imageId: string,
  reviewAction?: string | null,
): 'ACCEPTED' | 'REJECTED' | 'Excluded' | null {
  if (!review || !(review.imageIds ?? review.submitted.gallery.order).includes(imageId))
    return null
  if (review.status === 'rejected') return 'REJECTED'
  if (review.status === 'accepted') {
    return review.excluded.includes(imageId) ||
      (reviewAction === 'added-classified-photos' &&
        review.content.gallery.entries[imageId]?.intent === 'undefined')
      ? 'REJECTED'
      : 'ACCEPTED'
  }
  return review.excluded.includes(imageId) ? 'Excluded' : null
}
