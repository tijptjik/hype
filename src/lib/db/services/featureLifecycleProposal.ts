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
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { executeRevisionBatch } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionCommand } from './revisionChangeSet'

// TABLE OF CONTENTS
// 1. Exact proposal version reads
// 2. Atomic proposal preparation
// 3. Submission and withdrawal

/** Read an authorized proposal version and materialize its partial changes against its immutable base.
 * @param db Request database. @param input Exact Feature, proposal and optional version/status fence.
 * @returns Base and proposed content or null when the version/scope does not match.
 * @remarks Materialized content is ephemeral; reading a proposal never creates a Feature revision.
 */
export async function readPartialFeatureProposal(
  db: Database,
  input: {
    featureId: string
    proposalId: string
    version?: string
    status?: string
    guard: SQL
  },
): Promise<{
  id: string
  version: string
  baseRevisionId: string
  contributorId: string
  status: string
  base: FeatureRevisionContent
  content: FeatureRevisionContent
} | null> {
  const row = await db.get<{
    id: string
    version: string
    baseRevisionId: string
    contributorId: string
    status: string
    changes: string
    base: string
  }>(sql`
  SELECT p.id,p.version,p.baseRevisionId,p.contributorId,p.status,p.changes,r.content base
  FROM featureRevisionProposal p JOIN featureRevision r ON r.id=p.baseRevisionId AND r.featureId=p.featureId
  WHERE p.id=${input.proposalId} AND p.featureId=${input.featureId} AND p.kind='update'
   AND (${input.version ?? null} IS NULL OR p.version=${input.version ?? null})
   AND (${input.status ?? null} IS NULL OR p.status=${input.status ?? null}) AND (${input.guard})`)
  if (!row) return null
  const base = FeatureRevisionContentSchema.parse(JSON.parse(row.base))
  const result = applyFeatureChanges(
    base,
    base,
    FeatureChangesSchema.parse(JSON.parse(row.changes)),
  )
  if (result.status !== 'ready')
    throw new Error('Stored proposal cannot be applied to its base')
  return {
    id: row.id,
    version: row.version,
    baseRevisionId: row.baseRevisionId,
    contributorId: row.contributorId,
    status: row.status,
    base,
    content: result.content,
  }
}

/** Prepare a partial proposal from complete server-derived form content for an atomic upload/form transaction.
 * @param db Request database. @param input Exact accepted base, authorized content and optional preserved contributor.
 * @returns Opaque proposal version and unexecuted statements.
 * @remarks The caller must execute the guard and statements together; referenced image evidence may be inserted earlier in that same batch.
 */
export async function preparePartialFeatureProposal(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    baseRevisionId: string
    content: FeatureRevisionContent
    contributorId?: string
  },
): Promise<{
  proposalId: string
  candidateRevisionId: string
  guard: SQL
  statements: BatchItem<'sqlite'>[]
}> {
  const row = await db.get<{ content: string }>(
    sql`SELECT content FROM featureRevision WHERE id=${input.baseRevisionId} AND featureId=${input.featureId} AND (${input.guard})`,
  )
  if (!row) throw new Error('Proposal base is no longer available')
  const changes = JSON.stringify(
    buildFeatureChanges(
      FeatureRevisionContentSchema.parse(JSON.parse(row.content)),
      input.content,
    ),
  )
  const change = prepareRevisionChangeSet(db, input),
    proposalId = crypto.randomUUID(),
    version = crypto.randomUUID()
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND currentRevisionId IS NOT NULL)
  AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=${input.featureId} AND i.role='input'
    AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.role='output' AND o.featureId=i.featureId))`
  return {
    proposalId,
    candidateRevisionId: version,
    guard,
    statements: [
      change.statement,
      db.insert(partialFeatureProposal).values({
        id: proposalId,
        featureId: input.featureId,
        baseRevisionId: input.baseRevisionId,
        kind: 'update',
        version,
        changes,
        contributorId: input.contributorId ?? input.actorId,
        status: 'draft',
        createdChangeSetId: change.id,
      }),
      db.insert(partialFeatureReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId,
        proposalVersion: version,
        changes,
        action: 'created',
        changeSetId: change.id,
      }),
    ],
  }
}

/** Freeze or withdraw the author's exact proposal version without changing its accepted Feature.
 * @param db Request database. @param input Contributor authority, exact version and transition.
 * @returns Whether the transition committed.
 */
export async function transitionPartialFeatureProposal(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    proposalId: string
    version: string
    action: 'submitted' | 'withdrawn'
  },
): Promise<boolean> {
  const proposal = await readPartialFeatureProposal(db, {
    ...input,
    guard: sql`(${input.guard}) AND p.contributorId=${input.actorId}`,
  })
  if (
    !proposal ||
    !(input.action === 'submitted'
      ? proposal.status === 'draft'
      : ['draft', 'submitted'].includes(proposal.status))
  )
    return false
  const change = prepareRevisionChangeSet(db, input),
    changes = JSON.stringify(buildFeatureChanges(proposal.base, proposal.content))
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId} AND featureId=${input.featureId}
  AND version=${input.version} AND contributorId=${input.actorId} AND status=${proposal.status})`
  return Boolean(
    await executeRevisionBatch(db, guard, [
      change.statement,
      db
        .update(partialFeatureProposal)
        .set({ status: input.action })
        .where(eq(partialFeatureProposal.id, input.proposalId)),
      db.insert(partialFeatureReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId: input.proposalId,
        proposalVersion: input.version,
        changes,
        action: input.action,
        changeSetId: change.id,
      }),
    ]),
  )
}
