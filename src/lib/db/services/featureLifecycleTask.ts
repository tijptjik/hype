// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { lifecycleTask } from '../schema/featureLifecycle.target'
// SERVICES
import { prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'

/** Prepare a task for a contribution, including one with no accepted Feature identity yet.
 * @param db Request database. @param input Authorized proposal, ownership, scope and submission state.
 * @returns Task insertion to execute with proposal creation in a single batch.
 */
export function prepareFeatureContributionTask(
  db: Database,
  input: {
    taskId: string
    proposalId: string
    featureId: string | null
    organisationId: string
    projectId: string
    actorId: string
    type: 'newFeature' | 'newPhoto' | 'featureChange'
    submitted: boolean
  },
): BatchItem<'sqlite'>[] {
  const now = new Date().toISOString()
  return [
    prepareRevisionCheck(
      db,
      sql`EXISTS(SELECT 1 FROM featureRevisionProposal p WHERE p.id=${input.proposalId}
      AND p.contributorId=${input.actorId} AND p.featureId IS ${input.featureId}
      AND p.status=${input.submitted ? 'submitted' : 'draft'}
      AND ((p.kind='create' AND ${input.type}='newFeature'
        AND json_extract(p.creationScope,'$.organisationId')=${input.organisationId}
        AND json_extract(p.creationScope,'$.projectId')=${input.projectId})
      OR (p.kind='update' AND EXISTS(SELECT 1 FROM feature f WHERE f.id=p.featureId
        AND f.organisationId=${input.organisationId} AND f.projectId=${input.projectId}))))`,
    ),
    db.insert(lifecycleTask).values({
      id: input.taskId,
      proposalId: input.proposalId,
      featureId: input.featureId,
      organisationId: input.organisationId,
      projectId: input.projectId,
      contributorId: input.actorId,
      type: input.type,
      isDraft: input.submitted ? 0 : 1,
      isReviewed: 0,
      createdAt: now,
      modifiedAt: now,
    }),
  ]
}

/** Complete an exact pending proposal task in the acceptance/rejection transaction.
 * @param db Request database. @param input Reviewed task token, authorization and concrete outcome.
 * @returns Guarded task update; any stale task rolls back the surrounding Feature decision.
 * @remarks A duplicate creation task records its surviving Feature without reassigning historical visits or other tasks.
 */
export function prepareFeatureContributionTaskCompletion(
  db: Database,
  input: {
    taskId: string
    proposalId: string
    expectedModifiedAt: string
    actorId: string
    guard: SQL
    featureId: string | null
    outcome: 'accepted' | 'rejected'
    action:
      | 'added-feature'
      | 'merged-feature'
      | 'added-all-photos'
      | 'ignored'
      | 'updated-feature'
    reason: string
  },
): BatchItem<'sqlite'>[] {
  if (!input.reason.trim()) throw new Error('A task review reason is required')
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM task WHERE id=${input.taskId} AND proposalId=${input.proposalId}
  AND modifiedAt=${input.expectedModifiedAt} AND isReviewed=0 AND isDraft=0)
  AND EXISTS(SELECT 1 FROM featureRevisionProposal p WHERE p.id=${input.proposalId} AND p.status=${input.outcome})`
  return [
    prepareRevisionCheck(db, guard),
    db
      .update(lifecycleTask)
      .set({
        featureId: input.featureId,
        isReviewed: 1,
        reviewerId: input.actorId,
        reviewOutcome: input.outcome,
        reviewAction: input.action,
        reviewReason: input.reason,
        modifiedAt: new Date(
          Math.max(Date.now(), (Date.parse(input.expectedModifiedAt) || 0) + 1),
        ).toISOString(),
      })
      .where(eq(lifecycleTask.id, input.taskId)),
    prepareRevisionCheck(db, sql`changes()=1`),
  ]
}
