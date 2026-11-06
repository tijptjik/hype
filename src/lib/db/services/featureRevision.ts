// SHARED ATTRIBUTION
import { prepareRevisionChangeSet, type RevisionCommand } from './revisionChangeSet'
export { prepareRevisionChangeSet, type RevisionCommand } from './revisionChangeSet'
// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import {
  featureRevision,
  featureRevisionHead,
  featureRevisionProposal,
  featureRevisionReview,
  featureRevisionPublication,
  revisionChangeSet,
} from '../schema/featureRevision'
import { feature } from '../schema/feature'
// DOMAIN
import { equalRevisionValue } from '#lib/revisions/merge.js'
import { prepareFeatureAcceptance } from '#lib/revisions/acceptance.js'
// SERVICES
import { prepareFeatureRevisionWriteScope } from './featureRevisionWriteScope'
import { privateFeatureComparison } from './featurePrivateCapture'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { RevisionResolution, RevisionValue, RevisionMergePolicy } from '#lib/revisions/merge.js'
import type { FeatureAcceptanceResult } from '#lib/revisions/acceptance.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. Command contracts and attribution
// 2. Baseline, proposal creation, save and submission
// 3. Atomic acceptance/publication and rejection

export type RevisionProjection = {
  statements: BatchItem<'sqlite'>[]
  // Derived visibility may depend on the Feature becoming published in this same batch.
  afterPublication?: BatchItem<'sqlite'>[]
  // Verify complete public projection after writes, not just the identity row.
  verify: SQL
}
export type PersistedFeatureAcceptance =
  | { status: 'accepted'; revisionId: string }
  | { status: 'stale' }
  | Exclude<FeatureAcceptanceResult, { status: 'ready' }>

/**
 * Records the current feature once without inventing earlier history.
 * @param db Request database.
 * @param input Authorized captured snapshot and existing publication state.
 * @returns Baseline revision ID, or null when a concurrent baseline/scope change won.
 * @remarks The guard must compare the complete captured source state. No current
 * feature rows are changed and no new public content is manufactured by this command.
 */
export async function initializeFeatureRevision(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    content: RevisionValue
    published: boolean
  },
): Promise<string | null> {
  const prepared = prepareFeatureRevisionInitialization(db, { ...input, origin: 'migration' })
  return (await executeRevisionBatch(db, prepared.guard, prepared.statements)) ? prepared.revisionId : null
}

/**
 * Prepares a first immutable snapshot for atomic composition with Feature creation.
 * @param db Request database.
 * @param input Complete server-validated content, attribution and creation/source equality guard.
 * @returns Unexecuted initialization; the caller must check the guard in the same batch.
 * @remarks New identities use user attribution; existing enrollment uses migration attribution.
 * This never creates or changes compatibility rows and never chooses a pending draft.
 */
export function prepareFeatureRevisionInitialization(db: Database, input: RevisionCommand & {
  featureId: string; content: RevisionValue; published: boolean
}): { revisionId: string; guard: SQL; statements: BatchItem<'sqlite'>[] } {
  const change = prepareRevisionChangeSet(db, input)
  const id = crypto.randomUUID()
  const guard = sql`(${input.guard}) AND NOT EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId})`
  const statements: BatchItem<'sqlite'>[] = [
    change.statement,
    db.insert(featureRevision).values({
      id,
      featureId: input.featureId,
      changeSetId: change.id,
      content: input.content,
    }),
    db.insert(featureRevisionHead).values({
      featureId: input.featureId,
      publishedRevisionId: input.published ? id : null,
    }),
    db.insert(featureRevisionPublication).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      revisionId: input.published ? id : null,
      generation: 0,
      changeSetId: change.id,
    }),
  ]
  return { revisionId: id, guard, statements }
}

/**
 * Creates an independent draft branch without touching the public head or projection.
 * @param db Request database.
 * @param input Authorized proposal content, existing base and contributor.
 * @returns Draft identity and candidate ID, or null for stale/missing scope.
 * @remarks Base visibility and editable-field allowlists are checked by the caller.
 */
export async function createFeatureRevisionProposal(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    baseRevisionId: string
    content: RevisionValue
  },
): Promise<{ proposalId: string; candidateRevisionId: string } | null> {
  const prepared = prepareFeatureRevisionProposal(db, input)
  return (await executeRevisionBatch(db, prepared.guard, prepared.statements))
    ? { proposalId: prepared.proposalId, candidateRevisionId: prepared.candidateRevisionId } : null
}

/**
 * Prepares an independent proposal for composition with new immutable image evidence.
 * @param db Request database.
 * @param input Server-built content, exact base and trusted editing scope.
 * @returns Proposal identifiers, guard and statements to execute in one atomic batch.
 * @remarks The caller must execute the guard with every statement; this never publishes.
 * A server-only contributor override preserves authorship when a reviewer forwards task evidence.
 */
export function prepareFeatureRevisionProposal(
  db: Database,
  input: RevisionCommand & { featureId: string; baseRevisionId: string; content: RevisionValue; contributorId?: string },
): { proposalId: string; candidateRevisionId: string; guard: SQL; statements: BatchItem<'sqlite'>[] } {
  const change = prepareRevisionChangeSet(db, input)
  const proposalId = crypto.randomUUID(),
    candidateRevisionId = crypto.randomUUID()
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active') AND EXISTS (SELECT 1 FROM featureRevision WHERE featureId=${input.featureId} AND id=${input.baseRevisionId})`
  const statements: BatchItem<'sqlite'>[] = [
    change.statement,
    db.insert(featureRevision).values({
      id: candidateRevisionId,
      featureId: input.featureId,
      previousRevisionId: input.baseRevisionId,
      changeSetId: change.id,
      content: input.content,
    }),
    db.insert(featureRevisionProposal).values({
      id: proposalId,
      featureId: input.featureId,
      baseRevisionId: input.baseRevisionId,
      candidateRevisionId,
      contributorId: input.contributorId ?? input.actorId,
      status: 'draft',
      createdChangeSetId: change.id,
    }),
    db.insert(featureRevisionReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId,
      candidateRevisionId,
      action: 'created',
      changeSetId: change.id,
    }),
  ]
  return { proposalId, candidateRevisionId, guard, statements }
}

/**
 * Saves a new immutable draft revision using the editor's exact candidate token.
 * @param db Request database.
 * @param input Contributor-authorized draft edit and expected candidate.
 * @returns New candidate revision ID, or null if submitted, changed or unauthorized.
 */
export async function saveFeatureRevisionProposal(
  db: Database,
  input: RevisionCommand & {
    proposalId: string
    featureId: string
    expectedCandidateRevisionId: string
    content: RevisionValue
  },
): Promise<string | null> {
  const change = prepareRevisionChangeSet(db, input),
    id = crypto.randomUUID()
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active') AND EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId} AND featureId=${input.featureId} AND contributorId=${input.actorId} AND status='draft' AND candidateRevisionId=${input.expectedCandidateRevisionId})`
  const current = await db
    .select({ content: featureRevision.content })
    .from(featureRevision)
    .where(
      and(
        eq(featureRevision.id, input.expectedCandidateRevisionId),
        eq(featureRevision.featureId, input.featureId),
      ),
    )
    .get()
  if (current && equalRevisionValue(current.content, input.content)) {
    return (await executeRevisionBatch(db, guard, []))
      ? input.expectedCandidateRevisionId
      : null
  }
  const result = await executeRevisionBatch(db, guard, [
    change.statement,
    db.insert(featureRevision).values({
      id,
      featureId: input.featureId,
      previousRevisionId: input.expectedCandidateRevisionId,
      changeSetId: change.id,
      content: input.content,
    }),
    db
      .update(featureRevisionProposal)
      .set({ candidateRevisionId: id })
      .where(eq(featureRevisionProposal.id, input.proposalId)),
    db.insert(featureRevisionReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId: input.proposalId,
      candidateRevisionId: id,
      action: 'saved',
      changeSetId: change.id,
    }),
  ])
  return result ? id : null
}

/**
 * Freezes the exact draft candidate for review.
 * @param db Request database.
 * @param input Contributor-authorized draft identity and expected candidate.
 * @returns Whether the submitted snapshot was recorded atomically.
 */
export async function submitFeatureRevisionProposal(
  db: Database,
  input: RevisionCommand & {
    proposalId: string
    featureId: string
    expectedCandidateRevisionId: string
  },
): Promise<boolean> {
  const change = prepareRevisionChangeSet(db, input)
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active') AND EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId} AND featureId=${input.featureId} AND contributorId=${input.actorId} AND candidateRevisionId=${input.expectedCandidateRevisionId} AND status='draft')`
  return (
    (await executeRevisionBatch(db, guard, [
      change.statement,
      db
        .update(featureRevisionProposal)
        .set({ status: 'submitted' })
        .where(eq(featureRevisionProposal.id, input.proposalId)),
      db.insert(featureRevisionReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId: input.proposalId,
        candidateRevisionId: input.expectedCandidateRevisionId,
        action: 'submitted',
        changeSetId: change.id,
      }),
    ])) !== null
  )
}

/**
 * Accepts and publishes against exactly the comparison inspected by the reviewer.
 * @param db Request database.
 * @param input Authorized publication scope, reviewed tokens, domain validation and projection builder.
 * @returns Accepted revision, explicit conflict/validation failure, or stale evidence.
 * @remarks Projection writes and verification share the transaction with both heads,
 * review evidence and publication history. This service is never a client-payload API.
 */
export async function acceptFeatureRevisionProposal(
  db: Database,
  input: RevisionCommand & {
    proposalId: string
    featureId: string
    expectedCandidateRevisionId: string
    expectedPublishedRevisionId: string | null
    expectedGeneration: number
    // Ordinary contributor acceptance updates an existing publication. Creating the
    // first publication requires a separately authorized, explicit publish command.
    publicationIntent?: 'update' | 'initial' | 'republish'
    // Explicit republication compares against the last accepted revision, never a
    // contributor-selected old base or an arbitrary latest draft.
    expectedComparisonRevisionId?: string
    // Staff publishing their own saved draft is a single transaction; contributor
    // review continues to require a submitted proposal by default.
    acceptOwnDraft?: boolean
    resolutions?: readonly RevisionResolution[]
    // Application adapters must supply their dependent-field boundaries, never client rules.
    mergePolicy?: RevisionMergePolicy
    decisionStatements?: BatchItem<'sqlite'>[]
    validate: (content: RevisionValue) => readonly string[]
    project: (content: RevisionValue, revisionId: string) => RevisionProjection | Promise<RevisionProjection>
  },
): Promise<PersistedFeatureAcceptance> {
  // Reject stale or revoked review scope before returning any immutable comparison data.
  // This is only a read preflight; the same predicates are rechecked inside the batch.
  const inspectedHead = await db
    .select({ featureId: featureRevisionHead.featureId })
    .from(featureRevisionHead)
    .where(
      and(
        eq(featureRevisionHead.featureId, input.featureId),
        eq(featureRevisionHead.state, 'active'),
        eq(featureRevisionHead.generation, input.expectedGeneration),
        sql`${featureRevisionHead.publishedRevisionId} IS ${input.expectedPublishedRevisionId}`,
        input.guard,
      ),
    )
    .get()
  if (!inspectedHead) return { status: 'stale' }
  const proposal = await db
    .select()
    .from(featureRevisionProposal)
    .where(
      and(
        eq(featureRevisionProposal.id, input.proposalId),
        eq(featureRevisionProposal.featureId, input.featureId),
      ),
    )
    .get()
  const expectedProposalStatus = input.acceptOwnDraft ? 'draft' : 'submitted'
  if (
    proposal?.status !== expectedProposalStatus ||
    (input.acceptOwnDraft && proposal.contributorId !== input.actorId) ||
    proposal.candidateRevisionId !== input.expectedCandidateRevisionId
  )
    return { status: 'stale' }
  // Read immutable evidence separately; the transaction rechecks all mutable review inputs.
  const read = (id: string) =>
    db
      .select()
      .from(featureRevision)
      .where(
        and(eq(featureRevision.featureId, input.featureId), eq(featureRevision.id, id)),
      )
      .get()
  let comparisonRevisionId = input.expectedPublishedRevisionId
  let comparisonGuard = sql`1`
  if (comparisonRevisionId === null && (input.publicationIntent === 'initial' || input.publicationIntent === 'republish')) {
    if ((input.publicationIntent === 'initial' && input.expectedGeneration !== 0) ||
      (input.publicationIntent === 'republish' && input.expectedGeneration < 1)) return { status: 'stale' }
    const privateComparison = await privateFeatureComparison(db, sql`${input.featureId}`, sql`${input.expectedGeneration}`)
    const current = await db.get<{ id: string | null }>(sql`SELECT ${privateComparison} id`)
    comparisonGuard = sql`${privateComparison} IS ${current?.id ?? null}`
    if (current?.id) {
      if (input.expectedComparisonRevisionId !== current.id) return { status: 'stale' }
      comparisonRevisionId = current.id
    }
  }
  if (comparisonRevisionId === null && input.publicationIntent === 'republish') {
    if (!input.expectedComparisonRevisionId || input.expectedGeneration < 1)
      return { status: 'stale' }
    const receipt = await db.select().from(featureRevisionPublication).where(and(
      eq(featureRevisionPublication.featureId, input.featureId),
      eq(featureRevisionPublication.generation, input.expectedGeneration),
    )).get()
    if (receipt?.revisionId !== null || receipt.previousRevisionId !== input.expectedComparisonRevisionId)
      return { status: 'stale' }
    comparisonRevisionId = receipt.previousRevisionId
  }
  const [base, published, submitted] = await Promise.all([
    read(proposal.baseRevisionId),
    comparisonRevisionId === null
      ? Promise.resolve(undefined)
      : read(comparisonRevisionId),
    read(proposal.candidateRevisionId),
  ])
  if (!base || !submitted || (comparisonRevisionId !== null && !published))
    return { status: 'stale' }
  // Only a never-published identity can use its baseline as the initial comparison.
  // Explicit republication uses the inspected last-publication receipt above.
  if (comparisonRevisionId === null &&
    (input.publicationIntent !== 'initial' || input.expectedGeneration !== 0 || base.previousRevisionId !== null))
    return { status: 'stale' }
  if (input.expectedPublishedRevisionId !== null && input.publicationIntent && input.publicationIntent !== 'update')
    return { status: 'stale' }
  const comparison = published ?? base
  if (input.expectedComparisonRevisionId && comparison.id !== input.expectedComparisonRevisionId)
    return { status: 'stale' }
  const prepared = prepareFeatureAcceptance({
    base: { featureId: input.featureId, revisionId: base.id, content: base.content },
    published: {
      featureId: input.featureId,
      revisionId: comparison.id,
      content: comparison.content,
    },
    submitted: {
      featureId: input.featureId,
      revisionId: submitted.id,
      proposalId: proposal.id,
      baseRevisionId: base.id,
      content: submitted.content,
    },
    resolutions: input.resolutions,
    mergePolicy: input.mergePolicy,
    validate: input.validate,
  })
  if (prepared.status !== 'ready') return prepared
  const result = prepared.plan.result
  const revisionId = result.kind === 'promote' ? result.revisionId : crypto.randomUUID()
  const change = prepareRevisionChangeSet(db, input)
  const projection = await input.project(result.content, revisionId)
  const publishedAt = new Date().toISOString()
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active' AND publishedRevisionId IS ${input.expectedPublishedRevisionId} AND generation=${input.expectedGeneration}) AND EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId} AND featureId=${input.featureId} AND status=${expectedProposalStatus} AND candidateRevisionId=${input.expectedCandidateRevisionId} AND (${Number(!input.acceptOwnDraft)} OR contributorId=${input.actorId}))`
  const writeScope = await prepareFeatureRevisionWriteScope(db, input.featureId)
  const statements: BatchItem<'sqlite'>[] = [prepareRevisionCheck(db, comparisonGuard), ...writeScope.before, change.statement]
  // Staff Publish records submission and acceptance in the same transaction. Preserve
  // the proposal state machine without exposing a half-published submitted draft.
  if (input.acceptOwnDraft) statements.push(
    db.update(featureRevisionProposal).set({ status: 'submitted' })
      .where(eq(featureRevisionProposal.id, input.proposalId)),
    db.insert(featureRevisionReview).values({
      id: crypto.randomUUID(), featureId: input.featureId, proposalId: input.proposalId,
      candidateRevisionId: input.expectedCandidateRevisionId, action: 'submitted', changeSetId: change.id,
    }),
  )
  if (result.kind === 'merge')
    statements.push(
      db.insert(featureRevision).values({
        id: revisionId,
        featureId: input.featureId,
        previousRevisionId: result.mainlineParentRevisionId,
        mergedFromRevisionId: result.proposalParentRevisionId,
        changeSetId: change.id,
        content: result.content,
      }),
    )
  // Commit public data, provenance and pointers together; a failed verification rolls back all.
  statements.push(
    ...projection.statements,
    db
      .update(feature)
      .set({
        isPublished: true,
        localIsPublished: true,
        isDraft: false,
        isPendingReview: false,
        publisherId: input.publisherUserId ?? null,
        publishedAt,
        // Preserve the projection's edit fence even when two writes share a clock tick.
        modifiedAt: sql`CASE WHEN ${feature.modifiedAt} >= ${publishedAt}
          THEN COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ',${feature.modifiedAt},'+0.001 seconds'),${publishedAt})
          ELSE ${publishedAt} END`,
      })
      .where(eq(feature.id, input.featureId)),
    db
      .update(featureRevisionHead)
      .set({
        publishedRevisionId: revisionId,
        generation: input.expectedGeneration + 1,
      })
      .where(eq(featureRevisionHead.featureId, input.featureId)),
    db
      .update(featureRevisionProposal)
      .set({ status: 'accepted' })
      .where(eq(featureRevisionProposal.id, input.proposalId)),
    db.insert(featureRevisionReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId: input.proposalId,
      candidateRevisionId: input.expectedCandidateRevisionId,
      comparedRevisionId: comparison.id,
      resultingRevisionId: revisionId,
      action: 'accepted',
      changeSetId: change.id,
      resolutions: input.resolutions ?? [],
    }),
    db.insert(featureRevisionPublication).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      previousRevisionId: input.expectedPublishedRevisionId,
      revisionId,
      generation: input.expectedGeneration + 1,
      changeSetId: change.id,
    }),
  )
  statements.push(...(projection.afterPublication ?? []), ...(input.decisionStatements ?? []), prepareRevisionCheck(db, projection.verify), ...writeScope.after)
  return (await executeRevisionBatch(db, guard, statements))
    ? { status: 'accepted', revisionId }
    : { status: 'stale' }
}

/**
 * Rejects a submitted candidate without changing its content or the published head.
 * @param db Request database.
 * @param input Authorized reviewer, exact submitted candidate and explanation.
 * @returns Whether the rejection was recorded; repeat/stale decisions return false.
 */
export async function rejectFeatureRevisionProposal(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    proposalId: string
    expectedCandidateRevisionId: string
    reason: string
    decisionStatements?: BatchItem<'sqlite'>[]
  },
): Promise<boolean> {
  if (!input.reason.trim()) throw new Error('A rejection reason is required')
  const change = prepareRevisionChangeSet(db, input)
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId} AND featureId=${input.featureId} AND status='submitted' AND candidateRevisionId=${input.expectedCandidateRevisionId})`
  return (
    (await executeRevisionBatch(db, guard, [
      change.statement,
      db
        .update(featureRevisionProposal)
        .set({ status: 'rejected' })
        .where(eq(featureRevisionProposal.id, input.proposalId)),
      db.insert(featureRevisionReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId: input.proposalId,
        candidateRevisionId: input.expectedCandidateRevisionId,
        action: 'rejected',
        changeSetId: change.id,
      }),
      ...(input.decisionStatements ?? []),
    ])) !== null
  )
}

/**
 * Withdraws the contributor's exact draft/submitted candidate while retaining all evidence.
 * @param db Request database.
 * @param input Contributor-authorized proposal and candidate token.
 * @returns Whether withdrawal was recorded; terminal/stale proposals return false.
 */
export async function withdrawFeatureRevisionProposal(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    proposalId: string
    expectedCandidateRevisionId: string
  },
): Promise<boolean> {
  const change = prepareRevisionChangeSet(db, input)
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId} AND featureId=${input.featureId} AND contributorId=${input.actorId} AND candidateRevisionId=${input.expectedCandidateRevisionId} AND status IN ('draft','submitted'))`
  return (
    (await executeRevisionBatch(db, guard, [
      change.statement,
      db
        .update(featureRevisionProposal)
        .set({ status: 'withdrawn' })
        .where(eq(featureRevisionProposal.id, input.proposalId)),
      db.insert(featureRevisionReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId: input.proposalId,
        candidateRevisionId: input.expectedCandidateRevisionId,
        action: 'withdrawn',
        changeSetId: change.id,
      }),
    ])) !== null
  )
}

/**
 * Unpublishes an inspected active head without deleting its revisions or proposals.
 * @param db Request database.
 * @param input Current publication authority and exact inspected head/generation.
 * @returns Whether publication was cleared atomically; stale/retired heads return false.
 * @remarks The caller supplies any additional visibility/cache projection writes and
 * their postcondition. A later republication must be explicitly reviewed.
 */
export async function unpublishFeatureRevision(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    expectedPublishedRevisionId: string
    expectedGeneration: number
    projection: RevisionProjection
  },
): Promise<boolean> {
  const writeScope = await prepareFeatureRevisionWriteScope(db, input.featureId)
  const change = prepareRevisionChangeSet(db, input),
    generation = input.expectedGeneration + 1
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active' AND publishedRevisionId=${input.expectedPublishedRevisionId} AND generation=${input.expectedGeneration})`
  return (
    (await executeRevisionBatch(db, guard, [
      ...writeScope.before, change.statement,
      ...input.projection.statements,
      db
        .update(feature)
        .set({
          isPublished: false,
          localIsPublished: false,
          modifiedAt: new Date().toISOString(),
        })
        .where(eq(feature.id, input.featureId)),
      db
        .update(featureRevisionHead)
        .set({ publishedRevisionId: null, generation })
        .where(eq(featureRevisionHead.featureId, input.featureId)),
      db.insert(featureRevisionPublication).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        previousRevisionId: input.expectedPublishedRevisionId,
        revisionId: null,
        generation,
        changeSetId: change.id,
      }),
      prepareRevisionCheck(db, input.projection.verify), ...writeScope.after,
    ])) !== null
  )
}
