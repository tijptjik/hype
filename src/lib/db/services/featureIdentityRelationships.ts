// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  featureTaskTransfer,
  featureTaskUploadTransfer,
} from '../schema/featureTaskTransfer'
import {
  featureRevisionProposal,
  featureRevisionReview,
} from '../schema/featureRevision'
import { task } from '../schema/task'
import { userFeature } from '../schema/user'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import { resolveFeatureTaskAssignments } from '#lib/revisions/featureRelationshipPlan.js'
// SERVICES
import {
  prepareFeatureRevisionProposal,
  prepareRevisionChangeSet,
} from './featureRevision'
import { prepareRevisionCheck } from './revisionBatch'
import { featureUploadEvidenceSource } from './featureUploadEvidence'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type {
  FeatureTaskAssignment,
  IdentityTaskEvidence,
} from '#lib/revisions/featureRelationshipPlan.js'
import type { FeatureRevisionRef } from '#lib/revisions/lineage.js'

// TABLE OF CONTENTS
// 1. Transfer evidence and pending photo proposals
// 2. Wishlist reconciliation

type UploadEvidence = {
  id: string
  proposalId: string
  candidateRevisionId: string
  imageId: string
  imageRevisionId: string
  actorId: string
  status: string
  proposalFeatureId: string
  content: string
}

/**
 * Prepares task and wishlist transfers for the identity publication batch.
 * @param db Request database.
 * @param input Exact reviewed task evidence, output revisions and publisher attribution.
 * @returns Statements to run after output publication; nothing executes here.
 * @remarks The caller fences all tasks, task images, proposal tokens and wishlist rows before
 * publishing. Original uploads, completed tasks, visits and import crosswalks are never rewritten.
 */
export async function prepareFeatureIdentityRelationships(
  db: Database,
  input: {
    proposalId: string
    actorId: string
    kind: 'merge' | 'split'
    inputs: readonly FeatureRevisionRef[]
    outputs: readonly FeatureRevisionRef[]
    tasks: IdentityTaskEvidence[]
    assignments: FeatureTaskAssignment[]
  },
): Promise<BatchItem<'sqlite'>[]> {
  const assigned = resolveFeatureTaskAssignments(
    input.tasks,
    input.outputs.map(ref => ref.featureId),
    input.assignments,
  )
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name='featureTaskTransfer' AND type='table'`,
  )
  if (!storage?.n)
    throw new Error(
      'Install the identity relationship migration before accepting this operation',
    )
  const invalidScope =
    await db.get(sql`SELECT 1 FROM task t JOIN feature f ON f.id=t.featureId
    WHERE t.featureId IN(SELECT value FROM json_each(${JSON.stringify(input.inputs.map(ref => ref.featureId))}))
      AND t.isReviewed=0 AND (t.organisationId IS NOT f.organisationId OR t.projectId IS NOT f.projectId) LIMIT 1`)
  if (invalidScope)
    throw new Error('Repair task ancestry before reviewing identity assignments')
  const evidence = await featureUploadEvidenceSource(db)
  const statements: BatchItem<'sqlite'>[] = []
  const change = prepareRevisionChangeSet(db, {
    actorId: input.actorId,
    reason: 'Reviewed task assignments and wishlist transfer',
  })
  statements.push(change.statement)
  const superseded = new Map<
    string,
    { featureId: string; candidateRevisionId: string }
  >()
  for (const assignment of assigned) {
    const original = assignment.task,
      targetId = assignment.featureId
    if (original.featureId === targetId) continue
    const transferId = crypto.randomUUID()
    const sequence = (await db.get<{ n: number }>(
      sql`SELECT COALESCE(max(sequence),0)+1 n FROM featureTaskTransfer WHERE taskId=${original.id}`,
    ))!.n
    statements.push(
      db.insert(featureTaskTransfer).values({
        id: transferId,
        identityProposalId: input.proposalId,
        taskId: original.id,
        sequence,
        sourceFeatureId: original.featureId,
        targetFeatureId: targetId,
        sourceModifiedAt: original.modifiedAt,
        changeSetId: change.id,
      }),
    )
    const uploads =
      await db.all<UploadEvidence>(sql`SELECT u.id,u.proposalId,p.candidateRevisionId,u.imageId,u.imageRevisionId,
      u.actorId,p.status,p.featureId proposalFeatureId,r.content FROM ${evidence} u
      JOIN featureRevisionProposal p ON p.id=u.proposalId JOIN featureRevision r ON r.id=p.candidateRevisionId
      WHERE u.featureId=${original.featureId} AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=${original.id})`)
    const missing =
      await db.get(sql`SELECT 1 FROM taskImage ti WHERE ti.taskId=${original.id}
      AND NOT EXISTS(SELECT 1 FROM ${evidence} u WHERE u.featureId=${original.featureId} AND u.imageId=ti.imageId
        AND EXISTS(SELECT 1 FROM json_each(u.taskIds) WHERE value=ti.taskId)) LIMIT 1`)
    if (missing)
      throw new Error(
        'Verify and enroll legacy task photos before reassigning this task',
      )
    const output = input.outputs.find(ref => ref.featureId === targetId)!
    const base = await db.get<{ content: string }>(
      sql`SELECT content FROM featureRevision WHERE id=${output.revisionId} AND featureId=${targetId}`,
    )
    if (!base) throw new Error('Task destination revision is unavailable')
    for (const upload of uploads) {
      let proposalId = upload.proposalId
      if (upload.status === 'draft' || upload.status === 'submitted') {
        // Forward only this upload's gallery entry, never unrelated source edits or captions.
        const content = FeatureRevisionContentSchema.parse(JSON.parse(base.content))
        const entry = FeatureRevisionContentSchema.parse(JSON.parse(upload.content))
          .gallery.entries[upload.imageId]
        if (!entry || entry.imageRevisionId !== upload.imageRevisionId)
          throw new Error(
            'Task photo changed; review its proposal before moving the task',
          )
        if (
          content.gallery.entries[upload.imageId] &&
          content.gallery.entries[upload.imageId].imageRevisionId !==
            upload.imageRevisionId
        )
          throw new Error(
            'The destination contains a different version of this task photo',
          )
        if (!content.gallery.entries[upload.imageId]) {
          if (entry.intent === 'canonical')
            for (const existing of Object.values(content.gallery.entries))
              if (existing.intent === 'canonical') existing.intent = 'undefined'
          content.gallery.entries[upload.imageId] = entry
          content.gallery.order.push(upload.imageId)
        }
        const prepared = await prepareFeatureRevisionProposal(db, {
          actorId: input.actorId,
          contributorId: upload.actorId,
          featureId: targetId,
          baseRevisionId: output.revisionId,
          content,
          guard: sql`1`,
          reason: 'Photo proposal forwarded with reviewed task assignment',
        })
        proposalId = prepared.proposalId
        statements.push(
          prepareRevisionCheck(db, prepared.guard),
          ...prepared.statements,
        )
        if (!original.isDraft)
          statements.push(
            db
              .update(featureRevisionProposal)
              .set({ status: 'submitted' })
              .where(eq(featureRevisionProposal.id, proposalId)),
            db.insert(featureRevisionReview).values({
              id: crypto.randomUUID(),
              featureId: targetId,
              proposalId,
              candidateRevisionId: prepared.candidateRevisionId,
              action: 'submitted',
              changeSetId: change.id,
            }),
          )
        superseded.set(upload.proposalId, {
          featureId: upload.proposalFeatureId,
          candidateRevisionId: upload.candidateRevisionId,
        })
      }
      statements.push(
        db.insert(featureTaskUploadTransfer).values({
          transferId,
          uploadId: upload.id,
          sourceProposalId: upload.proposalId,
          sourceCandidateRevisionId: upload.candidateRevisionId,
          proposalId,
        }),
      )
    }
    // Advance the task token even if two assignments happen within the same millisecond.
    statements.push(
      db
        .update(task)
        .set({
          featureId: targetId,
          modifiedAt: sql`CASE WHEN modifiedAt>=strftime('%Y-%m-%dT%H:%M:%fZ','now')
        THEN strftime('%Y-%m-%dT%H:%M:%fZ',modifiedAt,'+0.001 seconds') ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END`,
        })
        .where(
          and(
            eq(task.id, original.id),
            eq(task.featureId, original.featureId),
            eq(task.modifiedAt, original.modifiedAt),
            eq(task.isReviewed, false),
          ),
        ),
      prepareRevisionCheck(db, sql`changes()=1`),
    )
  }
  // Withdraw a superseded branch only when no current task still depends on it.
  for (const [id, previous] of superseded) {
    const unused = sql`NOT EXISTS(SELECT 1 FROM ${evidence} u WHERE u.proposalId=${id})`
    statements.push(
      db.insert(featureRevisionReview).select(
        db
          .select({
            id: sql<string>`${crypto.randomUUID()}`.as('id'),
            featureId: sql<string>`${previous.featureId}`.as('featureId'),
            proposalId: sql<string>`${id}`.as('proposalId'),
            candidateRevisionId: sql<string>`${previous.candidateRevisionId}`.as(
              'candidateRevisionId',
            ),
            comparedRevisionId: sql<string>`NULL`.as('comparedRevisionId'),
            resultingRevisionId: sql<string>`NULL`.as('resultingRevisionId'),
            action: sql<'withdrawn'>`'withdrawn'`.as('action'),
            changeSetId: sql<string>`${change.id}`.as('changeSetId'),
            resolutions: sql<[]>`'[]'`.as('resolutions'),
          })
          .from(sql`(SELECT 1)`)
          .where(unused),
      ),
      db
        .update(featureRevisionProposal)
        .set({ status: 'withdrawn' })
        .where(and(eq(featureRevisionProposal.id, id), unused)),
    )
  }
  if (input.kind === 'merge') {
    const survivor = input.outputs[0].featureId
    const absorbed = JSON.stringify(
      input.inputs.map(ref => ref.featureId).filter(id => id !== survivor),
    )
    // Copy only the wishlist flag; existing visits and original visit timestamps stay put.
    statements.push(
      db
        .insert(userFeature)
        .select(
          db
            .select({
              userId: sql<string>`userId`.as('userId'),
              featureId: sql<string>`${survivor}`.as('featureId'),
              isVisited: sql<boolean>`0`.as('isVisited'),
              isWishlisted: sql<boolean>`1`.as('isWishlisted'),
              visitedAt: sql<string>`NULL`.as('visitedAt'),
              createdAt: sql<string>`min(createdAt)`.as('createdAt'),
              modifiedAt: sql<string>`strftime('%Y-%m-%dT%H:%M:%fZ','now')`.as(
                'modifiedAt',
              ),
            })
            .from(userFeature)
            .where(
              sql`featureId IN(SELECT value FROM json_each(${absorbed})) AND isWishlisted=1`,
            )
            .groupBy(userFeature.userId),
        )
        .onConflictDoUpdate({
          target: [userFeature.userId, userFeature.featureId],
          set: { isWishlisted: true, modifiedAt: new Date().toISOString() },
        }),
      db
        .update(userFeature)
        .set({ isWishlisted: false })
        .where(
          sql`featureId IN(SELECT value FROM json_each(${absorbed})) AND isWishlisted=1`,
        ),
    )
  }
  return statements
}
