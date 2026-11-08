// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { partialFeatureReview } from '../schema/featureLifecycle.target'
import { task } from '../schema/task'
import {
  featureRevisionProposal,
  featureRevisionReview,
} from '../schema/featureRevision'
// SERVICES
import { hasFeatureLifecycleStorage } from './featureLifecycle'
import { featureUploadEvidenceSource } from './featureUploadEvidence'
import { prepareRevisionChangeSet } from './featureRevision'
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { SQL } from 'drizzle-orm'

/**
 * Submits exact uploaded-photo proposals in the same batch as their contributor task.
 * @param db Request database.
 * @param input Task identity and its authenticated contributor.
 * @returns Statements requiring unchanged candidate ownership; legacy tasks return no statements.
 * @remarks The caller must fence the complete task revision and ancestry before this plan.
 */
export async function prepareFeatureUploadSubmission(
  db: Database,
  input: {
    taskId: string
    featureId: string
    actorId: string
  },
): Promise<BatchItem<'sqlite'>[]> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name IN ('featureImageUploadRevision','featureUploadEvidence') AND type='table'`,
  )
  if (!storage?.n) return []
  const evidence = await featureUploadEvidenceSource(db)
  const lifecycle = await hasFeatureLifecycleStorage(db)
  const version = lifecycle ? sql`version` : sql`candidateRevisionId`
  const proposals = await db.all<{
    id: string
    candidateRevisionId: string
    changes: string | null
  }>(sql`
    SELECT DISTINCT p.id,${lifecycle ? sql`p.version` : sql`p.candidateRevisionId`} candidateRevisionId,${lifecycle ? sql`p.changes` : sql`NULL`} changes FROM ${evidence} u JOIN featureRevisionProposal p ON p.id=u.proposalId
    WHERE u.featureId=${input.featureId} AND u.actorId=${input.actorId} AND p.status='draft'
      AND EXISTS (SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})`)
  if (!proposals.length) return []
  const change = prepareRevisionChangeSet(db, {
    actorId: input.actorId,
    reason: 'Photo contribution submitted with its task',
  })
  const statements: BatchItem<'sqlite'>[] = [change.statement]
  for (const proposal of proposals)
    statements.push(
      prepareRevisionCheck(
        db,
        sql`EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${proposal.id}
      AND featureId=${input.featureId} AND contributorId=${input.actorId} AND status='draft' AND ${version}=${proposal.candidateRevisionId})`,
      ),
      db
        .update(featureRevisionProposal)
        .set({ status: 'submitted' })
        .where(eq(featureRevisionProposal.id, proposal.id)),
      uploadProposalReview(db, {
        lifecycle,
        featureId: input.featureId,
        proposal,
        action: 'submitted',
        changeSetId: change.id,
      }),
    )
  return statements
}

/**
 * Completes photo tasks only after every linked proposal has an explicit terminal decision.
 * @param db Request database.
 * @param input Authorized proposal decision and reviewer.
 * @returns Statements to append after the proposal decision in its publication/rejection batch.
 * @remarks Mixed legacy evidence and non-photo tasks retain their existing explicit review.
 * No task completes early while another proposal is still in the review queue.
 */
export async function prepareFeatureUploadTaskCompletion(
  db: Database,
  input: {
    featureId: string
    proposalId: string
    actorId: string
    reason?: string
  },
): Promise<BatchItem<'sqlite'>[]> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name IN ('featureImageUploadRevision','featureUploadEvidence') AND type='table'`,
  )
  if (!storage?.n) return []
  const evidence = await featureUploadEvidenceSource(db)
  const receipts = await db.get(
    sql`SELECT 1 FROM ${evidence} WHERE featureId=${input.featureId} AND proposalId=${input.proposalId}`,
  )
  if (!receipts) return []
  const reviewed = sql`EXISTS (SELECT 1 FROM ${evidence} u JOIN json_each(u.taskIds) j
    WHERE u.featureId=${input.featureId} AND u.proposalId=${input.proposalId} AND j.value=${task.id})`
  const accepted = sql`EXISTS (SELECT 1 FROM ${evidence} u JOIN json_each(u.taskIds) j
    JOIN featureRevisionProposal p ON p.id=u.proposalId WHERE j.value=${task.id} AND u.featureId=${task.featureId} AND p.status='accepted')`
  const complete = sql`NOT EXISTS (SELECT 1 FROM ${evidence} u JOIN json_each(u.taskIds) j
    JOIN featureRevisionProposal p ON p.id=u.proposalId WHERE j.value=${task.id} AND u.featureId=${task.featureId} AND p.status IN ('draft','submitted'))
    AND NOT EXISTS (SELECT 1 FROM taskImage ti WHERE ti.taskId=${task.id} AND NOT EXISTS (
      SELECT 1 FROM ${evidence} u JOIN json_each(u.taskIds) j
      WHERE u.featureId=${task.featureId} AND u.imageId=ti.imageId AND j.value=${task.id}))`
  return [
    db
      .update(task)
      .set({
        isReviewed: true,
        reviewerId: input.actorId,
        reviewReason: input.reason ?? 'All photo proposals reviewed',
        reviewOutcome: sql`CASE WHEN ${accepted} THEN 'accepted' ELSE 'rejected' END`,
        reviewAction: sql`CASE WHEN ${accepted} THEN 'added-all-photos' ELSE 'ignored' END`,
      })
      .where(
        and(
          eq(task.featureId, input.featureId),
          eq(task.type, 'newPhoto'),
          eq(task.isDraft, false),
          eq(task.isReviewed, false),
          reviewed,
          complete,
          sql`EXISTS (SELECT 1 FROM feature f WHERE f.id=${task.featureId} AND f.organisationId=${task.organisationId} AND f.projectId=${task.projectId})`,
        ),
      ),
  ]
}

/**
 * Rejects a task's pending upload proposals without archiving shared image identities.
 * @param db Request database.
 * @param input Authorized, revision-fenced task and reviewer decision.
 * @returns Atomic rejection statements, or null for a legacy task with no upload receipts.
 * @remarks Already accepted photos remain published; each remaining rejection retains its own receipt.
 */
export async function prepareFeatureUploadTaskRejection(
  db: Database,
  input: {
    taskId: string
    featureId: string
    actorId: string
    reason: string
    guard: SQL
    reject: boolean
  },
): Promise<BatchItem<'sqlite'>[] | null> {
  const storage = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM sqlite_master WHERE name IN ('featureImageUploadRevision','featureUploadEvidence') AND type='table'`,
  )
  if (!storage?.n) return null
  const evidence = await featureUploadEvidenceSource(db)
  const lifecycle = await hasFeatureLifecycleStorage(db)
  const version = lifecycle ? sql`version` : sql`candidateRevisionId`
  const proposals = await db.all<{
    id: string
    candidateRevisionId: string
    status: string
    changes: string | null
  }>(sql`
    SELECT DISTINCT p.id,${lifecycle ? sql`p.version` : sql`p.candidateRevisionId`} candidateRevisionId,p.status,${lifecycle ? sql`p.changes` : sql`NULL`} changes FROM ${evidence} u JOIN featureRevisionProposal p ON p.id=u.proposalId
    WHERE u.featureId=${input.featureId} AND EXISTS (SELECT 1 FROM json_each(u.taskIds) WHERE value=${input.taskId})`)
  if (!proposals.length) return null
  if (!input.reject) throw new Error('Review the photo proposals in the task queue')
  const change = prepareRevisionChangeSet(db, input)
  const statements: BatchItem<'sqlite'>[] = [
    prepareRevisionCheck(db, input.guard),
    change.statement,
  ]
  for (const proposal of proposals) {
    if (proposal.status !== 'draft' && proposal.status !== 'submitted') continue
    statements.push(
      prepareRevisionCheck(
        db,
        sql`EXISTS (SELECT 1 FROM featureRevisionProposal
      WHERE id=${proposal.id} AND featureId=${input.featureId} AND status=${proposal.status} AND ${version}=${proposal.candidateRevisionId})`,
      ),
    )
    if (proposal.status !== 'submitted') continue
    statements.push(
      db
        .update(featureRevisionProposal)
        .set({ status: 'rejected' })
        .where(eq(featureRevisionProposal.id, proposal.id)),
      uploadProposalReview(db, {
        lifecycle,
        featureId: input.featureId,
        proposal,
        action: 'rejected',
        changeSetId: change.id,
      }),
    )
  }
  if (proposals.some(proposal => proposal.status === 'draft'))
    throw new Error('Submit every photo proposal before task review')
  const hasAccepted = proposals.some(proposal => proposal.status === 'accepted')
  statements.push(
    db
      .update(task)
      .set({
        isReviewed: true,
        reviewerId: input.actorId,
        reviewReason: input.reason,
        reviewOutcome: hasAccepted ? 'accepted' : 'rejected',
        reviewAction: hasAccepted ? 'added-all-photos' : 'ignored',
      })
      .where(and(eq(task.id, input.taskId), input.guard))
      .returning({ id: task.id }),
  )
  return statements
}

/** Record exact upload-proposal evidence in the active schema without manufacturing a candidate snapshot.
 * @param db Request database. @param input Inspected version and submitted/rejected action.
 * @returns One immutable review insert for the surrounding task transaction.
 */
function uploadProposalReview(
  db: Database,
  input: {
    lifecycle: boolean
    featureId: string
    proposal: { id: string; candidateRevisionId: string; changes: string | null }
    action: 'submitted' | 'rejected'
    changeSetId: string
  },
): BatchItem<'sqlite'> {
  const common = {
    id: crypto.randomUUID(),
    featureId: input.featureId,
    proposalId: input.proposal.id,
    action: input.action,
    changeSetId: input.changeSetId,
  }
  if (input.lifecycle) {
    if (!input.proposal.changes) throw new Error('Upload proposal evidence is missing')
    return db.insert(partialFeatureReview).values({
      ...common,
      proposalVersion: input.proposal.candidateRevisionId,
      changes: input.proposal.changes,
    })
  }
  return db
    .insert(featureRevisionReview)
    .values({ ...common, candidateRevisionId: input.proposal.candidateRevisionId })
}
