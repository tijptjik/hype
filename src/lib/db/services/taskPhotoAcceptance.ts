// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// DOMAIN
import {
  FeatureRevisionContentSchema,
  type FeatureRevisionContent,
} from '#lib/revisions/featureContent.js'
import {
  applyFeatureChanges,
  buildFeatureChanges,
} from '#lib/revisions/featureChanges.js'
// SCHEMA
import {
  featureRevisionProposal,
  featureRevisionReview,
} from '../schema/featureRevision'
import { partialFeatureReview } from '../schema/featureLifecycle.target'
import { task } from '../schema/task'
// SERVICES
import {
  imageReviewProposalAssociation,
  readFeatureImageReview,
  reviewedImageContent,
  type FeatureImageReview,
} from './featureImageReview'
import {
  readFeatureImageIntentPolicy,
  resolvePolicyImageIntent,
} from './imageIntentPolicy'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { prepareRevisionCheck } from './revisionBatch'
import {
  prepareFeatureUploadTaskCompletion,
  prepareFeatureUploadTaskRejection,
} from './featureUploadTasks'
// TYPES
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'

// TABLE OF CONTENTS
// 1. Reviewed task contract
// 2. Exact evidence and atomic decision preparation

export type PhotoAcceptanceMode = 'acceptAll' | 'acceptClassified'
export type TaskPhotoReviewToken = {
  proposalId: string
  proposalVersion: string
  expectedReviewId: string | null
  expectedRevisionId: string | null
  expectedGeneration: number
}
export type TaskPhotoAcceptancePlan = {
  primary: FeatureImageReview
  content: FeatureRevisionContent
  guard: SQL
  decisions: BatchItem<'sqlite'>[]
  rejectAll: boolean
}

/** Prepare one task-wide photo decision without writing any gallery or review state.
 * @param db Request database.
 * @param input Exact inspected proposal set and the requested acceptance policy.
 * @param scope Current task and Feature publication authority.
 * @returns One content snapshot and atomic tail statements, or null for stale evidence.
 * @remarks All proposal decisions and task completion must share the primary publication transaction.
 */
export async function prepareTaskPhotoAcceptance(
  db: Database,
  input: {
    taskId: string
    actorId: string
    mode: PhotoAcceptanceMode
    reviews: TaskPhotoReviewToken[]
  },
  scope: SQL,
): Promise<TaskPhotoAcceptancePlan | null> {
  if (
    !input.reviews.length ||
    new Set(input.reviews.map(row => row.proposalId)).size !== input.reviews.length
  )
    return null
  const reviews: FeatureImageReview[] = []
  for (const token of input.reviews) {
    const review = await readFeatureImageReview(db, {
      taskId: input.taskId,
      proposalId: token.proposalId,
      guard: scope,
    })
    if (
      !review?.featureId ||
      review.status !== 'submitted' ||
      review.stale ||
      review.proposalVersion !== token.proposalVersion ||
      review.reviewId !== token.expectedReviewId ||
      review.currentRevisionId !== token.expectedRevisionId ||
      review.currentGeneration !== token.expectedGeneration
    )
      return null
    reviews.push(review)
  }
  const first = reviews[0]
  if (
    reviews.some(
      review =>
        review.featureId !== first.featureId ||
        review.currentRevisionId !== first.currentRevisionId ||
        review.lifecycle !== first.lifecycle,
    )
  )
    return null
  const association = await imageReviewProposalAssociation(db)
  const version = first.lifecycle ? sql`p.version` : sql`p.candidateRevisionId`
  const tokens = JSON.stringify(input.reviews)
  // One JSON binding fences the complete proposal set without an unbounded SQL parameter list.
  const evidenceGuard = sql`EXISTS(SELECT 1 FROM task WHERE id=${input.taskId} AND type='newPhoto' AND isReviewed=0 AND isDraft=0)
    AND NOT EXISTS(SELECT 1 FROM json_each(${tokens}) j WHERE NOT EXISTS(
      SELECT 1 FROM featureRevisionProposal p JOIN task t ON t.id=${input.taskId}
      WHERE (${association}) AND p.id=json_extract(j.value,'$.proposalId') AND p.status='submitted'
        AND ${version}=json_extract(j.value,'$.proposalVersion')
        AND (SELECT r.id FROM featureRevisionReview r WHERE r.proposalId=p.id
          AND json_extract(r.context,'$.kind')='image-review/v1' AND json_extract(r.context,'$.taskId')=t.id ORDER BY r.rowid DESC LIMIT 1)
            IS json_extract(j.value,'$.expectedReviewId')))
    AND NOT EXISTS(SELECT 1 FROM featureRevisionProposal p JOIN task t ON t.id=${input.taskId}
      WHERE (${association}) AND (p.status='draft' OR (p.status='submitted' AND NOT EXISTS(
        SELECT 1 FROM json_each(${tokens}) j WHERE json_extract(j.value,'$.proposalId')=p.id))))`
  const policy = await readFeatureImageIntentPolicy(db, first.featureId!)
  const guard = sql`(${scope}) AND (${first.comparisonGuard}) AND (${policy.guard}) AND (${evidenceGuard})`
  if (!(await db.get(sql`SELECT 1 WHERE ${guard}`))) return null
  const current = await db.get<{ content: string }>(
    sql`SELECT content FROM featureRevision WHERE id=${first.currentRevisionId} AND featureId=${first.featureId}`,
  )
  if (!current) return null
  let content = FeatureRevisionContentSchema.parse(JSON.parse(current.content))
  const accepted = new Set<string>()
  for (const review of reviews) {
    const baseRow = await db.get<{
      content: string
      candidate: string | null
    }>(sql`SELECT b.content,${review.lifecycle ? sql`NULL` : sql`c.content`} candidate
      FROM featureRevisionProposal p JOIN featureRevision b ON b.id=p.baseRevisionId
      ${review.lifecycle ? sql`` : sql`JOIN featureRevision c ON c.id=p.candidateRevisionId`} WHERE p.id=${review.proposalId}`)
    if (!baseRow) return null
    const base = FeatureRevisionContentSchema.parse(JSON.parse(baseRow.content))
    const candidate = baseRow.candidate
      ? FeatureRevisionContentSchema.parse(JSON.parse(baseRow.candidate))
      : review.submitted
    if (
      buildFeatureChanges(base, candidate).operations.some(
        operation =>
          ![
            'addImage',
            'editImage',
            'removeImage',
            'orderImages',
            'setGallerySortMode',
          ].includes(operation.op),
      )
    )
      throw new Error('Review the complete Feature proposal before accepting')
    const reviewed = reviewedImageContent(review, base)
    let included = 0
    for (const id of review.imageIds ?? review.submitted.gallery.order) {
      const entry = reviewed.gallery.entries[id]
      if (!entry) continue
      if (input.mode === 'acceptClassified' && entry.intent === 'undefined') {
        // Declining new evidence must never remove an already accepted gallery image.
        if (base.gallery.entries[id])
          reviewed.gallery.entries[id] = structuredClone(base.gallery.entries[id])
        else delete reviewed.gallery.entries[id]
      } else {
        Object.assign(
          entry,
          resolvePolicyImageIntent(policy, entry.intent, input.mode === 'acceptAll'),
        )
        included++
      }
    }
    reviewed.gallery.order = reviewed.gallery.order.filter(id =>
      Object.hasOwn(reviewed.gallery.entries, id),
    )
    if (!included) continue
    accepted.add(review.proposalId)
    const merged = applyFeatureChanges(
      base,
      content,
      buildFeatureChanges(base, reviewed),
    )
    if (merged.status !== 'ready')
      throw new Error(
        'Photo reviews conflict. Reload and review the changed images before accepting.',
      )
    content = merged.content
  }
  const primary = reviews.find(review => accepted.has(review.proposalId)) ?? first
  if (!accepted.size) {
    const decisions = await prepareFeatureUploadTaskRejection(db, {
      ...input,
      featureId: first.featureId!,
      reason: 'No classified photos accepted',
      guard: scope,
      reject: true,
    })
    if (!decisions) return null
    decisions.push(
      prepareRevisionCheck(
        db,
        sql`EXISTS(SELECT 1 FROM task WHERE id=${input.taskId} AND isReviewed=1)`,
      ),
    )
    return { primary, content, guard, decisions, rejectAll: true }
  }
  const change = prepareRevisionChangeSet(db, {
    actorId: input.actorId,
    reason: `Task photos reviewed: ${input.mode}`,
  })
  const decisions: BatchItem<'sqlite'>[] = [change.statement]
  for (const review of reviews) {
    if (review.proposalId === primary.proposalId) continue
    const action = accepted.has(review.proposalId)
      ? ('accepted' as const)
      : ('rejected' as const)
    decisions.push(
      db
        .update(featureRevisionProposal)
        .set({ status: action })
        .where(eq(featureRevisionProposal.id, review.proposalId)),
    )
    const receipt = {
      id: crypto.randomUUID(),
      featureId: review.featureId!,
      proposalId: review.proposalId,
      comparedRevisionId: review.currentRevisionId,
      action,
      changeSetId: change.id,
      context: JSON.stringify({
        imageReviewId: review.reviewId,
        taskId: input.taskId,
        mode: input.mode,
      }),
      resultingRevisionId:
        action === 'rejected'
          ? null
          : first.lifecycle
            ? sql`(SELECT currentRevisionId FROM feature WHERE id=${first.featureId})`
            : sql`(SELECT publishedRevisionId FROM featureRevisionHead WHERE featureId=${first.featureId})`,
    }
    if (first.lifecycle) {
      const proposal = await db.get<{ changes: string }>(
        sql`SELECT changes FROM featureRevisionProposal WHERE id=${review.proposalId}`,
      )
      if (!proposal) return null
      decisions.push(
        db.insert(partialFeatureReview).values({
          ...receipt,
          proposalVersion: review.proposalVersion,
          changes: proposal.changes,
        }),
      )
    } else
      decisions.push(
        db
          .insert(featureRevisionReview)
          .values({ ...receipt, candidateRevisionId: review.proposalVersion }),
      )
  }
  decisions.push(
    ...(await prepareFeatureUploadTaskCompletion(db, {
      featureId: first.featureId!,
      proposalId: primary.proposalId,
      actorId: input.actorId,
      reason: input.mode === 'acceptClassified' ? 'All Classified Photos' : undefined,
    })),
  )
  decisions.push(
    db
      .update(task)
      .set({
        reviewAction:
          input.mode === 'acceptAll' ? 'added-all-photos' : 'added-classified-photos',
      })
      .where(sql`${task.id}=${input.taskId} AND ${task.isReviewed}=1`),
  )
  // A partial completion must roll back the publication as well as the decision receipts.
  decisions.push(
    prepareRevisionCheck(
      db,
      sql`EXISTS(SELECT 1 FROM task WHERE id=${input.taskId} AND isReviewed=1)`,
    ),
  )
  return { primary, content, guard, decisions, rejectAll: false }
}
