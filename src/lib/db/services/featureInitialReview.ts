// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import {
  featureRevisionProposal,
  featureRevisionReview,
} from '../schema/featureRevision'
// DOMAIN
import {
  FEATURE_CONTENT_MERGE_POLICY,
  FeatureRevisionContentSchema,
} from '#lib/revisions/featureContent.js'
// SERVICES
import {
  featureImageReviewGuard,
  prepareImageReviewAcceptance,
  reviewedImageContent,
} from './featureImageReview'
import {
  acceptFeatureRevisionProposal,
  rejectFeatureRevisionProposal,
  prepareRevisionChangeSet,
} from './featureRevision'
import { readFeatureRevisionSource } from './featureRevisionSource'
import { parseFeatureRevisionSource } from './featureRevisionContent'
import { prepareFeatureEditorialProjection } from './featureRevisionProjection'
import { prepareRevisionCheck } from './revisionBatch'
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { reviewMigratedInitialContribution } from './featureLifecycleInitialReview'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'

/**
 * Reviews a new identity's frozen content and photo evidence as one explicit initial publication.
 * @param db Request database.
 * @param input Authorized task reviewer, inspected source/task guard and task-completion statements.
 * @returns Null for a legacy identity, otherwise the guarded review outcome.
 * @remarks This is only for never-published initial contributions. Ordinary proposals never gain
 * permission to republish. Completed task history and every image/version retain their identities.
 */
export async function reviewInitialFeatureContribution(
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
): Promise<boolean | null> {
  if (await hasFeatureLifecycleStorage(db))
    return reviewMigratedInitialContribution(db, input)
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision' AND type='table'`,
  )
  if (!storage?.n) return null
  const initial = await db.get<{
    proposalId: string
    candidateRevisionId: string
    baseRevisionId: string
    content: string
  }>(sql`
    SELECT p.id proposalId,p.candidateRevisionId,p.baseRevisionId,r.content
    FROM featureInitialRevision i JOIN featureRevisionProposal p ON p.id=i.proposalId
    JOIN featureRevision r ON r.id=p.candidateRevisionId AND r.featureId=i.featureId
    WHERE i.featureId=${input.featureId} AND i.mode='contribution'`)
  if (!initial) return null
  const imageReview = input.accept
    ? await prepareImageReviewAcceptance(
        db,
        initial.proposalId,
        input.imageReview,
        input.guard,
      )
    : { review: null, guard: input.guard }
  if (!imageReview) return false
  const guard = sql`(${imageReview.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead h
    JOIN task t ON t.featureId=h.featureId JOIN featureRevisionProposal p ON p.featureId=h.featureId
    WHERE h.featureId=${input.featureId} AND h.state='active' AND h.generation=0 AND h.publishedRevisionId IS NULL
      AND p.id=${initial.proposalId} AND p.status='submitted' AND p.candidateRevisionId=${initial.candidateRevisionId}
      AND t.id=${input.taskId} AND t.type='newFeature' AND t.isDraft=0 AND t.isReviewed=0 AND t.contributorId=p.contributorId)`
  if (!(await db.get(sql`SELECT 1 WHERE ${guard}`))) return false
  const submittedContent = FeatureRevisionContentSchema.parse(
    JSON.parse(initial.content),
  )
  const content = imageReview.review
    ? reviewedImageContent(imageReview.review)
    : submittedContent
  const uploads = await db.all<{
    proposalId: string
    candidateRevisionId: string
    imageId: string
    imageRevisionId: string
  }>(sql`
    SELECT u.proposalId,p.candidateRevisionId,u.imageId,u.imageRevisionId FROM featureImageUploadRevision u
    JOIN featureRevisionProposal p ON p.id=u.proposalId WHERE u.featureId=${input.featureId}
      AND EXISTS (SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId}) ORDER BY u.imageId`)
  const change = prepareRevisionChangeSet(db, input)
  const evidence: BatchItem<'sqlite'>[] = [change.statement]
  // Each photo candidate is frozen and explicitly decided alongside the complete initial Feature.
  for (const upload of uploads) {
    if (
      input.accept &&
      !imageReview.review?.reviewId &&
      content.gallery.entries[upload.imageId]?.imageRevisionId !==
        upload.imageRevisionId
    )
      throw new Error(
        'Initial Feature review must include its submitted photo evidence',
      )
    evidence.push(
      prepareRevisionCheck(
        db,
        sql`EXISTS (SELECT 1 FROM featureRevisionProposal p
      JOIN taskImage ti ON ti.taskId=${input.taskId} AND ti.imageId=${upload.imageId}
      WHERE p.id=${upload.proposalId} AND p.featureId=${input.featureId} AND p.status='submitted'
        AND p.candidateRevisionId=${upload.candidateRevisionId})`,
      ),
      db
        .update(featureRevisionProposal)
        .set({ status: input.accept ? 'accepted' : 'rejected' })
        .where(eq(featureRevisionProposal.id, upload.proposalId)),
      db.insert(featureRevisionReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId: upload.proposalId,
        candidateRevisionId: upload.candidateRevisionId,
        comparedRevisionId: initial.baseRevisionId,
        resultingRevisionId: input.accept
          ? sql`(SELECT publishedRevisionId FROM featureRevisionHead WHERE featureId=${input.featureId})`
          : null,
        action: input.accept ? 'accepted' : 'rejected',
        changeSetId: change.id,
      }),
    )
  }
  if (!input.accept)
    return rejectFeatureRevisionProposal(db, {
      ...input,
      guard,
      proposalId: initial.proposalId,
      expectedCandidateRevisionId: initial.candidateRevisionId,
      decisionStatements: [
        ...evidence,
        db
          .update(feature)
          .set({ isArchived: true, isPendingReview: false })
          .where(eq(feature.id, input.featureId)),
        ...input.completion,
      ],
    })
  const visibleParents = sql`EXISTS (SELECT 1 FROM feature f JOIN layer l ON l.id=f.layerId
    JOIN project p ON p.id=f.projectId AND p.id=l.projectId JOIN organisation o ON o.id=f.organisationId AND o.id=p.organisationId
    WHERE f.id=${input.featureId} AND f.isArchived=0 AND l.isPublished=1 AND l.isArchived=0
      AND p.isPublished=1 AND p.isArchived=0 AND o.isPublished=1 AND o.isArchived=0)`
  const source = await readFeatureRevisionSource(
    db,
    input.featureId,
    sql`(${guard}) AND (${visibleParents})`,
  )
  if (!source) return false
  const previous = structuredClone(submittedContent)
  const gallery = parseFeatureRevisionSource(source.snapshot).galleryLinks
  previous.gallery.order = gallery.map(row => String(row.imageId))
  // Legacy submissions may already have private gallery links. Compare their actual
  // visibility/intent before adopting the submitted photo candidate on publication.
  previous.gallery.entries = Object.fromEntries(
    gallery.map(row => {
      const id = String(row.imageId),
        entry = submittedContent.gallery.entries[id]
      if (!entry)
        throw new Error('Initial Feature candidate omits an existing gallery image')
      return [
        id,
        {
          ...entry,
          intent: row.intent,
          isPublished: row.localIsPublished ?? row.isPublished,
        },
      ]
    }),
  ) as typeof previous.gallery.entries
  const result = await acceptFeatureRevisionProposal(db, {
    ...input,
    guard: sql`(${guard}) AND (${visibleParents})`,
    publisherUserId: input.actorId,
    proposalId: initial.proposalId,
    expectedCandidateRevisionId: initial.candidateRevisionId,
    expectedPublishedRevisionId: null,
    expectedComparisonRevisionId: initial.baseRevisionId,
    expectedGeneration: 0,
    publicationIntent: 'initial',
    mergePolicy: FEATURE_CONTENT_MERGE_POLICY,
    validate: value =>
      FeatureRevisionContentSchema.safeParse(value).success
        ? []
        : ['Invalid initial Feature content'],
    project: acceptedContent =>
      prepareFeatureEditorialProjection(db, {
        featureId: input.featureId,
        previous,
        content: FeatureRevisionContentSchema.parse(acceptedContent),
        source,
        gallery: {
          actorId: input.actorId,
          // The outer transaction checks input.guard before projection updates modifiedAt.
          // Recheck photo evidence here without repeating that consumed Feature snapshot.
          attachmentGuard: imageReview.review?.reviewId
            ? featureImageReviewGuard(imageReview.review, sql`1`)
            : sql`NOT EXISTS (
        SELECT 1 FROM json_each(${JSON.stringify(content.gallery.entries)}) entry
        WHERE NOT EXISTS (SELECT 1 FROM featureImageUploadRevision u JOIN taskImage ti ON ti.imageId=u.imageId AND ti.taskId=${input.taskId}
          WHERE u.featureId=${input.featureId} AND u.imageId=entry.key AND u.imageRevisionId=json_extract(entry.value,'$.imageRevisionId')
            AND EXISTS (SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})))`,
        },
      }),
    decisionStatements: [...evidence, ...input.completion],
  })
  return result.status === 'accepted'
}
