// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import {
  partialFeatureProposal,
  partialFeatureReview,
} from '../schema/featureLifecycle.target'
// DOMAIN
import {
  FeatureChangesSchema,
  applyFeatureChanges,
} from '#lib/revisions/featureChanges.js'
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SERVICES
import {
  prepareImageReviewAcceptance,
  reviewedImageChanges,
} from './featureImageReview'
import { prepareFeatureEdit, readCurrentFeatureRevision } from './featureLifecycle'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

/** Review a migrated initial contribution without falling back to mutable legacy acceptance.
 * @param db Request database.
 * @param input Authorized exact task/Feature snapshot and atomic completion statements.
 * @returns True only when the content, photo decisions and task completion commit together.
 * @remarks New creations use creation proposals. Migrated identities remain unpublished on acceptance;
 * unrelated staff edits are preserved and overlapping changes require explicit review.
 */
export async function reviewMigratedInitialContribution(
  db: Database,
  input: {
    featureId: string
    taskId: string
    imageReview?: { taskId: string; reviewId: string | null }
    actorId: string
    reason: string
    accept: boolean
    guard: SQL
    completion: BatchItem<'sqlite'>[]
  },
): Promise<boolean> {
  const initial = await db.get<{
    id: string
    version: string
    changes: string
    content: string
  }>(sql`
    SELECT p.id,p.version,p.changes,r.content FROM task t
    JOIN featureRevisionProposal p ON p.id=t.proposalId AND p.featureId=t.featureId
    JOIN featureRevision r ON r.id=p.baseRevisionId AND r.featureId=p.featureId
    WHERE t.id=${input.taskId} AND t.featureId=${input.featureId} AND t.type='newFeature'
      AND t.isDraft=0 AND t.isReviewed=0 AND t.contributorId=p.contributorId
      AND p.kind='update' AND p.status='submitted'
      AND json_extract(p.creationScope,'$.legacyInitial.mode')='contribution' AND (${input.guard})`)
  const current = await readCurrentFeatureRevision(db, input)
  if (!initial || !current || current.retired) return false
  const imageReview = input.accept
    ? await prepareImageReviewAcceptance(db, initial.id, input.imageReview, input.guard)
    : { review: null, guard: input.guard }
  if (!imageReview) return false
  const proposed = applyFeatureChanges(
    FeatureRevisionContentSchema.parse(JSON.parse(initial.content)),
    current.content,
    imageReview.review
      ? reviewedImageChanges(
          FeatureRevisionContentSchema.parse(JSON.parse(initial.content)),
          imageReview.review,
        )
      : FeatureChangesSchema.parse(JSON.parse(initial.changes)),
  )
  if (input.accept && proposed.status !== 'ready')
    throw new Error('Review conflicting changes before accepting this contribution')
  const content =
    input.accept && proposed.status === 'ready' ? proposed.content : current.content
  const uploads = await db.all<{
    id: string
    version: string
    changes: string
    imageId: string
    imageRevisionId: string
  }>(sql`
    SELECT p.id,p.version,p.changes,u.imageId,u.imageRevisionId FROM featureUploadEvidence u
    JOIN featureRevisionProposal p ON p.id=u.proposalId
    WHERE u.featureId=${input.featureId} AND p.status='submitted'
      AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})`)
  if (
    input.accept &&
    !imageReview.review?.reviewId &&
    uploads.some(
      upload =>
        content.gallery.entries[upload.imageId]?.imageRevisionId !==
        upload.imageRevisionId,
    )
  )
    throw new Error('Review all submitted photos before accepting the contribution')
  const otherReview = sql`NOT EXISTS(SELECT 1 FROM featureRevisionReview r JOIN featureRevisionProposal p ON p.id=r.proposalId
    JOIN featureUploadEvidence u ON u.proposalId=p.id WHERE p.id!=${initial.id} AND p.status='submitted'
    AND json_extract(r.context,'$.kind')='image-review/v1' AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId}))`
  if (input.accept && !(await db.get(sql`SELECT 1 WHERE ${otherReview}`)))
    throw new Error(
      'Accept the separately reviewed photo proposals before completing this report',
    )
  const guard = sql`(${imageReview.guard}) AND (${input.accept ? otherReview : sql`1`}) AND EXISTS(SELECT 1 FROM task WHERE id=${input.taskId}
    AND featureId=${input.featureId} AND proposalId=${initial.id} AND isDraft=0 AND isReviewed=0)
    AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${initial.id} AND version=${initial.version} AND status='submitted')`
  const prepared = await prepareFeatureEdit(db, {
    ...input,
    guard,
    expectedRevisionId: current.revisionId,
    expectedVersion: current.version,
    state: input.accept ? undefined : { isArchived: true, isPublished: false },
    derive: () => content,
    validate: () => [],
    attachmentGuard: imageReview.review?.reviewId
      ? imageReview.guard
      : sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(content.gallery.entries)}) entry
      WHERE NOT EXISTS(SELECT 1 FROM featureRevisionImage pin WHERE pin.featureRevisionId=${current.revisionId}
        AND pin.imageId=entry.key AND pin.imageRevisionId=json_extract(entry.value,'$.imageRevisionId'))
      AND NOT EXISTS(SELECT 1 FROM featureUploadEvidence u JOIN taskImage ti ON ti.imageId=u.imageId AND ti.taskId=${input.taskId}
        WHERE u.featureId=${input.featureId} AND u.imageId=entry.key AND u.imageRevisionId=json_extract(entry.value,'$.imageRevisionId')
        AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})))`,
  })
  if (!prepared) return false
  const change = prepareRevisionChangeSet(db, input),
    action = input.accept ? 'accepted' : 'rejected'
  const decisions: BatchItem<'sqlite'>[] = [change.statement]
  // Decide each exact proposal once; multiple upload receipts may belong to one proposal.
  for (const item of new Map(
    [...uploads, initial].map(row => [row.id, row]),
  ).values()) {
    decisions.push(
      prepareRevisionCheck(
        db,
        sql`EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${item.id}
        AND featureId=${input.featureId} AND version=${item.version} AND status='submitted')`,
      ),
      db
        .update(partialFeatureProposal)
        .set({ status: action })
        .where(eq(partialFeatureProposal.id, item.id)),
      db.insert(partialFeatureReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId: item.id,
        proposalVersion: item.version,
        changes: item.changes,
        context: JSON.stringify({
          imageReviewId: imageReview.review?.reviewId ?? null,
        }),
        action,
        comparedRevisionId: current.revisionId,
        resultingRevisionId: input.accept ? prepared.revisionId : null,
        changeSetId: change.id,
      }),
    )
  }
  return Boolean(
    await executeRevisionBatch(db, prepared.guard, [
      ...prepared.statements,
      ...decisions,
      db
        .update(feature)
        .set({ isPendingReview: false, isDraft: false })
        .where(eq(feature.id, input.featureId)),
      ...input.completion,
    ]),
  )
}
