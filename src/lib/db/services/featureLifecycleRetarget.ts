// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  partialFeatureProposal,
  partialFeatureReview,
} from '../schema/featureLifecycle.target'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import {
  FeatureChangesSchema,
  applyFeatureChanges,
  buildFeatureChanges,
} from '#lib/revisions/featureChanges.js'
// SERVICES
import { readCurrentFeatureRevision } from './featureLifecycle'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureEditCommand } from './featureLifecycle'
import type { RevisionConflict, RevisionResolution } from '#lib/revisions/merge.js'

/** Explicitly retarget a pending contribution from a retired identity to an inspected active record.
 * @param db Request database. @param input Source proposal authority, target token, selected conflicts and pending-task reassignment.
 * @returns New submitted proposal, displayed conflicts or stale result.
 * @remarks The old proposal and its complete evidence remain immutable. Retargeting does not accept content or move historical tasks/visits.
 */
export async function retargetFeatureContribution(
  db: Database,
  input: Omit<FeatureEditCommand, 'derive' | 'state'> & {
    proposalId: string
    expectedProposalVersion: string
    sourceGuard: FeatureEditCommand['guard']
    resolutions?: readonly RevisionResolution[]
    retargetTasks?: (proposalId: string) => BatchItem<'sqlite'>[]
  },
): Promise<
  | { status: 'retargeted'; proposalId: string; version: string }
  | { status: 'stale' }
  | { status: 'conflict'; conflicts: RevisionConflict[] }
> {
  const original = await db.get<{
    featureId: string
    baseRevisionId: string
    changes: string
    content: string
    contributorId: string
  }>(sql`
  SELECT p.featureId,p.baseRevisionId,p.changes,r.content,p.contributorId FROM featureRevisionProposal p
  JOIN featureRevision r ON r.id=p.baseRevisionId AND r.featureId=p.featureId
  WHERE p.id=${input.proposalId} AND p.version=${input.expectedProposalVersion} AND p.status='submitted' AND p.kind='update'
  AND (${input.sourceGuard}) AND EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=p.featureId AND i.role='input'
    AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.role='output' AND o.featureId=i.featureId))`)
  const current = await readCurrentFeatureRevision(db, input)
  if (
    !original ||
    !current ||
    current.retired ||
    current.revisionId !== input.expectedRevisionId ||
    current.version !== input.expectedVersion
  )
    return { status: 'stale' }
  const result = applyFeatureChanges(
    FeatureRevisionContentSchema.parse(JSON.parse(original.content)),
    current.content,
    FeatureChangesSchema.parse(JSON.parse(original.changes)),
    input.resolutions,
  )
  if (result.status === 'conflict') return result
  const errors = await input.validate(current.content, result.content)
  if (errors.length) throw new Error(errors.join('; '))
  const proposalId = crypto.randomUUID(),
    version = crypto.randomUUID(),
    change = prepareRevisionChangeSet(db, input)
  const changes = JSON.stringify(buildFeatureChanges(current.content, result.content))
  const context = JSON.stringify({
    sourceProposalId: input.proposalId,
    sourceProposalVersion: input.expectedProposalVersion,
    sourceFeatureId: original.featureId,
    targetProposalId: proposalId,
    targetFeatureId: input.featureId,
  })
  const guard = sql`(${input.guard}) AND (${input.sourceGuard})
  AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND currentRevisionId=${current.revisionId} AND revisionVersion=${current.version})
  AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId} AND version=${input.expectedProposalVersion} AND status='submitted')`
  const evidence = {
    featureId: original.featureId,
    proposalId: input.proposalId,
    proposalVersion: input.expectedProposalVersion,
    changes: original.changes,
    changeSetId: change.id,
    context,
    resolutions: JSON.stringify(input.resolutions ?? []),
  }
  return (await executeRevisionBatch(db, guard, [
    change.statement,
    db.insert(partialFeatureProposal).values({
      id: proposalId,
      featureId: input.featureId,
      baseRevisionId: current.revisionId,
      kind: 'update',
      version,
      changes,
      contributorId: original.contributorId,
      status: 'submitted',
      createdChangeSetId: change.id,
    }),
    db.insert(partialFeatureReview).values({
      ...evidence,
      id: crypto.randomUUID(),
      action: 'retargeted',
      comparedRevisionId: current.revisionId,
    }),
    db
      .insert(partialFeatureReview)
      .values({ ...evidence, id: crypto.randomUUID(), action: 'withdrawn' }),
    db
      .update(partialFeatureProposal)
      .set({ status: 'withdrawn' })
      .where(eq(partialFeatureProposal.id, input.proposalId)),
    db.insert(partialFeatureReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId,
      proposalVersion: version,
      changes,
      context,
      action: 'created',
      changeSetId: change.id,
    }),
    db.insert(partialFeatureReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId,
      proposalVersion: version,
      changes,
      context,
      action: 'submitted',
      changeSetId: change.id,
    }),
    ...(input.retargetTasks?.(proposalId) ?? []),
  ]))
    ? { status: 'retargeted', proposalId, version }
    : { status: 'stale' }
}
