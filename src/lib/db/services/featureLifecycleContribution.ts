// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
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
} from '#lib/revisions/featureChanges.js'
// SERVICES
import { prepareFeatureEdit } from './featureLifecycle'
import { prepareNewLifecycleFeature } from './featureLifecycleIdentity'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { FeatureChanges } from '#lib/revisions/featureChanges.js'
import type { RevisionCommand } from './revisionChangeSet'
import type { FeatureEditCommand } from './featureLifecycle'

// TABLE OF CONTENTS
// 1. Creation proposals without provisional Feature records
// 2. Contributor draft changes and submission
// 3. Creation acceptance and duplicate adoption

const creationScopeSchema = z.strictObject({
  organisationId: z.string().min(1),
  projectId: z.string().min(1),
  layerId: z.string().min(1),
})
const creationSchema = z.strictObject({
  format: z.literal('feature-create/v1'),
  content: FeatureRevisionContentSchema,
})
export type FeatureCreationScope = z.infer<typeof creationScopeSchema>

/** Store a new Feature contribution as a proposal, without allocating an accepted Feature identity.
 * @param db Request database. @param input Authorized destination scope and validated creation content.
 * @returns Proposal/version tokens or null when scope authority changed.
 * @remarks Task adapters attach their task to this proposal; no placeholder Feature is required.
 */
export async function createFeatureCreationProposal(
  db: Database,
  input: RevisionCommand & {
    scope: FeatureCreationScope
    content: FeatureRevisionContent
    submit?: boolean
    attachTask?: (proposalId: string) => BatchItem<'sqlite'>[]
  },
): Promise<{ proposalId: string; version: string } | null> {
  const scope = creationScopeSchema.parse(input.scope),
    changes = creationSchema.parse({
      format: 'feature-create/v1',
      content: input.content,
    })
  const proposalId = crypto.randomUUID(),
    version = crypto.randomUUID(),
    change = prepareRevisionChangeSet(db, input)
  const evidence = {
    proposalId,
    proposalVersion: version,
    changes: JSON.stringify(changes),
    changeSetId: change.id,
  }
  return (await executeRevisionBatch(db, input.guard, [
    change.statement,
    db.insert(partialFeatureProposal).values({
      id: proposalId,
      featureId: null,
      baseRevisionId: null,
      kind: 'create',
      version,
      changes: evidence.changes,
      creationScope: JSON.stringify(scope),
      contributorId: input.actorId,
      status: input.submit ? 'submitted' : 'draft',
      createdChangeSetId: change.id,
    }),
    db
      .insert(partialFeatureReview)
      .values({ ...evidence, id: crypto.randomUUID(), action: 'created' }),
    ...(input.submit
      ? [
          db
            .insert(partialFeatureReview)
            .values({ ...evidence, id: crypto.randomUUID(), action: 'submitted' }),
        ]
      : []),
    ...(input.attachTask?.(proposalId) ?? []),
  ]))
    ? { proposalId, version }
    : null
}

/** Save or submit the author's exact draft proposal without producing accepted history.
 * @param db Request database. @param input Actor, version, replacement partial changes or creation content.
 * @returns New proposal version or null for stale/non-owned/non-draft input.
 * @remarks Submitted evidence cannot be edited. Domain adapters validate field permissions and required submission fields.
 */
export async function saveFeatureContributionDraft(
  db: Database,
  input: RevisionCommand & {
    proposalId: string
    expectedVersion: string
    payload: FeatureChanges | z.infer<typeof creationSchema>
    submit?: boolean
    validate: (
      content: FeatureRevisionContent,
    ) => readonly string[] | Promise<readonly string[]>
    completion?: BatchItem<'sqlite'>[]
  },
): Promise<string | null> {
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId}
  AND version=${input.expectedVersion} AND contributorId=${input.actorId} AND status='draft')`
  const proposal = await db.get<{
    kind: string
    featureId: string | null
    baseRevisionId: string | null
  }>(
    sql`SELECT kind,featureId,baseRevisionId FROM featureRevisionProposal WHERE id=${input.proposalId} AND (${guard})`,
  )
  if (!proposal) return null
  let payload: FeatureChanges | z.infer<typeof creationSchema>,
    content: FeatureRevisionContent
  if (proposal.kind === 'create') {
    payload = creationSchema.parse(input.payload)
    content = payload.content
  } else if (proposal.kind === 'update') {
    payload = FeatureChangesSchema.parse(input.payload)
    const base = await db.get<{ content: string }>(
      sql`SELECT content FROM featureRevision WHERE id=${proposal.baseRevisionId} AND featureId=${proposal.featureId}`,
    )
    if (!base) throw new Error('Contribution base revision is missing')
    const parsed = FeatureRevisionContentSchema.parse(JSON.parse(base.content)),
      result = applyFeatureChanges(parsed, parsed, payload)
    if (result.status !== 'ready') throw new Error('Invalid draft changes')
    content = result.content
  } else throw new Error('Identity proposals require their specific review flow')
  const errors = await input.validate(content)
  if (errors.length) throw new Error(errors.join('; '))
  const version = crypto.randomUUID(),
    change = prepareRevisionChangeSet(db, input),
    changes = JSON.stringify(payload)
  return (await executeRevisionBatch(db, guard, [
    change.statement,
    db
      .update(partialFeatureProposal)
      .set({ version, changes, status: input.submit ? 'submitted' : 'draft' })
      .where(eq(partialFeatureProposal.id, input.proposalId)),
    db.insert(partialFeatureReview).values({
      id: crypto.randomUUID(),
      featureId: proposal.featureId,
      proposalId: input.proposalId,
      proposalVersion: version,
      changes,
      action: input.submit ? 'submitted' : 'saved',
      changeSetId: change.id,
    }),
    ...(input.completion ?? []),
  ]))
    ? version
    : null
}

/** Accept a new contribution or adopt useful data into an existing primary Feature.
 * @param db Request database. @param input Exact reviewed proposal, scope guard, domain validation and atomic task completion.
 * @returns Accepted identity/revision or null for stale review.
 * @remarks Duplicate adoption creates no second accepted identity and no merge lineage. Existing visibility is preserved.
 */
export async function acceptFeatureCreationProposal(
  db: Database,
  input: RevisionCommand & {
    proposalId: string
    expectedVersion: string
    validate: (
      content: FeatureRevisionContent,
    ) => readonly string[] | Promise<readonly string[]>
    duplicate?: Omit<FeatureEditCommand, 'actorId' | 'origin' | 'reason'>
    completion?: (featureId: string, revisionId: string) => BatchItem<'sqlite'>[]
  },
): Promise<{ featureId: string; revisionId: string } | null> {
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId}
  AND version=${input.expectedVersion} AND status='submitted' AND kind='create' AND featureId IS NULL)`
  const proposal = await db.get<{
    changes: string
    creationScope: string
    contributorId: string
  }>(
    sql`SELECT changes,creationScope,contributorId FROM featureRevisionProposal WHERE id=${input.proposalId} AND (${guard})`,
  )
  if (!proposal) return null
  const creation = creationSchema.parse(JSON.parse(proposal.changes)),
    scope = creationScopeSchema.parse(JSON.parse(proposal.creationScope))
  const errors = await input.validate(creation.content)
  if (errors.length) throw new Error(errors.join('; '))
  const change = prepareRevisionChangeSet(db, input)
  let featureId: string,
    revisionId: string,
    statements: BatchItem<'sqlite'>[],
    acceptanceGuard = guard
  if (input.duplicate) {
    const edit = await prepareFeatureEdit(db, {
      ...input.duplicate,
      actorId: input.actorId,
      origin: input.origin,
      reason: input.reason,
      state: undefined,
      identity: { actorId: input.actorId },
    })
    if (!edit) return null
    featureId = input.duplicate.featureId
    revisionId = edit.revisionId
    statements = edit.statements
    acceptanceGuard = sql`(${guard}) AND (${edit.guard})`
  } else {
    const prepared = prepareNewLifecycleFeature(db, {
      ...input,
      contributorId: proposal.contributorId,
      featureId: crypto.randomUUID(),
      scope,
      content: creation.content,
    })
    featureId = prepared.featureId
    revisionId = prepared.revisionId
    statements = prepared.statements
  }
  return (await executeRevisionBatch(db, acceptanceGuard, [
    ...statements,
    change.statement,
    db
      .update(partialFeatureProposal)
      .set({ status: 'accepted' })
      .where(eq(partialFeatureProposal.id, input.proposalId)),
    db.insert(partialFeatureReview).values({
      id: crypto.randomUUID(),
      featureId,
      proposalId: input.proposalId,
      proposalVersion: input.expectedVersion,
      changes: proposal.changes,
      action: 'accepted',
      comparedRevisionId: input.duplicate?.expectedRevisionId ?? null,
      resultingRevisionId: revisionId,
      changeSetId: change.id,
    }),
    ...(input.completion?.(featureId, revisionId) ?? []),
  ]))
    ? { featureId, revisionId }
    : null
}
