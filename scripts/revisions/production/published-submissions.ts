// TYPES
import type { Database } from 'bun:sqlite'

export type PublishedSubmission = {
  featureId: string
  taskId: string
  imageId: string
  archived: number
}

// Explicit operator dispositions for the November production export.
export const publishedSubmissions: readonly PublishedSubmission[] = [
  {
    featureId: '766_uxqGxr_p',
    taskId: 'UCgpHDJqrHgp',
    imageId: 'VPRn2fYLTrBC',
    archived: 1,
  },
  {
    featureId: 'O8H1GijDJWJN',
    taskId: 'q4UImUJlmo3b',
    imageId: 'upload-5cd92d0ccda0eeefa83dde14460d69f3045ee69776acb0f01a618549c3ae193d',
    archived: 0,
  },
]

/** Require the exact approved open contribution and its single already-attached photo.
 * @param db Snapshot being enrolled. @param entry Operator-reviewed identities and archive state.
 * @returns Nothing when ownership, visibility, evidence and undecided status still agree.
 */
export function verifyPublishedSubmission(
  db: Database,
  entry: PublishedSubmission,
): void {
  const row = db
    .query(`SELECT 1 FROM feature f
    JOIN task t ON t.featureId=f.id AND t.projectId=f.projectId AND t.organisationId=f.organisationId
    JOIN taskImage ti ON ti.taskId=t.id JOIN image i ON i.id=ti.imageId
    JOIN featureImage fi ON fi.featureId=f.id AND fi.imageId=i.id
    WHERE f.id=? AND t.id=? AND i.id=? AND f.isArchived=? AND f.localIsArchived IS NULL
      AND f.isPublished=1 AND f.localIsPublished IS NULL AND f.isDraft=0 AND f.isPendingReview=1
      AND t.type='newFeature' AND t.isReviewed=0 AND t.isDraft=0
      AND t.reviewOutcome IS NULL AND t.reviewAction IS NULL AND t.reviewerId IS NULL AND t.reviewReason IS NULL
      AND t.contributorId=i.contributorId AND t.contributorId=f.contributorId
      AND (SELECT count(*) FROM taskImage WHERE taskId=t.id)=1
      AND (SELECT count(*) FROM taskImage WHERE imageId=i.id)=1
      AND (SELECT count(*) FROM task WHERE featureId=f.id AND type='newFeature' AND isReviewed=0)=1`)
    .get(entry.featureId, entry.taskId, entry.imageId, entry.archived)
  if (!row)
    throw new Error(
      'Published contribution differs from approved evidence: ' + entry.taskId,
    )
}
