// DRIZZLE
import { eq, sql } from 'drizzle-orm'
// SCHEMA
import { feature } from '../schema/feature'
import { featurePrivateCapture } from '../schema/featurePrivateCapture'
import {
  featureRevision,
  featureIdentityOperation,
  featureIdentityOperationMember,
  featureRevisionHead,
  featureRevisionPublication,
} from '../schema/featureRevision'
// DOMAIN
import { retiredFeatureIds, validateFeatureLineage } from '#lib/revisions/lineage.js'
// SERVICES
import { prepareFeatureRevisionWriteScope } from './featureRevisionWriteScope'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
import { prepareRevisionChangeSet } from './featureRevision'
// TYPES
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { RevisionCommand, RevisionProjection } from './featureRevision'
import type { FeatureRevisionRef } from '#lib/revisions/lineage.js'
import type { RevisionValue } from '#lib/revisions/merge.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. Inspected head contract
// 2. Atomic merge/split publication
// 3. Immutable output candidates

/** The publication token inspected for every source and output, including unpublished children. */
export type FeatureIdentityHead = {
  featureId: string
  publishedRevisionId: string | null
  generation: number
}

/**
 * Publishes a reviewed merge or split as one guarded identity operation.
 * @param db Request database.
 * @param input Authorized complete lineage, exact inspected heads and public projection writes.
 * @returns Operation receipt ID, or null when any source/output/scope changed.
 * @remarks New children must be explicitly reserved unpublished identities with empty
 * heads. The server must authorize every scope and validate dependent-record dispositions
 * before calling. Projection writes must include all selected output content; histories
 * remain attached to their original identities. No implicit task/visit transfer occurs.
 */
export async function publishFeatureIdentityOperation(
  db: Database,
  input: RevisionCommand & {
    kind: 'merge' | 'split'
    /** Staff splits create private successors; merges preserve the survivor's visibility. */
    preserveVisibility?: boolean
    inputs: readonly FeatureRevisionRef[]
    outputs: readonly FeatureRevisionRef[]
    expectedHeads: readonly FeatureIdentityHead[]
    dispositions: RevisionValue
    projection: RevisionProjection
    decisionStatements?: (operationId: string) => BatchItem<'sqlite'>[]
  },
): Promise<string | null> {
  const validation = validateFeatureLineage(input)
  if (!validation.valid) throw new Error(validation.reason)
  const ids = new Set([...input.inputs, ...input.outputs].map(ref => ref.featureId))
  const expected = new Map(input.expectedHeads.map(head => [head.featureId, head]))
  if (
    expected.size !== input.expectedHeads.length ||
    expected.size !== ids.size ||
    [...ids].some(id => !expected.has(id))
  )
    throw new Error('Every input and output requires exactly one inspected head')
  for (const source of input.inputs) {
    if (expected.get(source.featureId)?.publishedRevisionId !== source.revisionId &&
      !(input.preserveVisibility && expected.get(source.featureId)?.publishedRevisionId === null))
      throw new Error('Identity inputs must match their inspected published revisions')
  }
  const inputIds = new Set(input.inputs.map(ref => ref.featureId))
  for (const output of input.outputs) {
    const head = expected.get(output.featureId)
    if (!head) throw new Error('Missing output head')
    if (
      !inputIds.has(output.featureId) &&
      (head.publishedRevisionId !== null || head.generation !== 0)
    )
      throw new Error('New split children require unused unpublished heads')
  }
  const change = prepareRevisionChangeSet(db, input),
    id = crypto.randomUUID()
  const statements: BatchItem<'sqlite'>[] = []
  const closing: BatchItem<'sqlite'>[] = []
  for (const featureId of ids) {
    const scope = await prepareFeatureRevisionWriteScope(db, featureId)
    statements.push(...scope.before); closing.push(...scope.after)
  }
  // Keep each head/reference check in its own statement to avoid unbounded SQL bindings.
  for (const head of input.expectedHeads) {
    statements.push(
      prepareRevisionCheck(
        db,
        sql`EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${head.featureId} AND state='active' AND publishedRevisionId IS ${head.publishedRevisionId} AND generation=${head.generation})`,
      ),
    )
  }
  for (const output of input.outputs) {
    statements.push(
      prepareRevisionCheck(
        db,
        sql`EXISTS (SELECT 1 FROM featureRevision WHERE featureId=${output.featureId} AND id=${output.revisionId}) AND NOT EXISTS (SELECT 1 FROM featureRevisionProposal WHERE candidateRevisionId=${output.revisionId})`,
      ),
    )
    if (!inputIds.has(output.featureId))
      statements.push(
        prepareRevisionCheck(
          db,
          sql`EXISTS (SELECT 1 FROM feature WHERE id=${output.featureId} AND isPublished=0 AND isDraft=1)`,
        ),
      )
  }
  statements.push(
    change.statement,
    db.insert(featureIdentityOperation).values({
      id,
      kind: input.kind,
      changeSetId: change.id,
      dispositions: input.dispositions,
    }),
  )
  for (const [role, refs] of [
    ['input', input.inputs],
    ['output', input.outputs],
  ] as const) {
    for (const ref of refs)
      statements.push(
        db.insert(featureIdentityOperationMember).values({
          operationId: id,
          role,
          featureId: ref.featureId,
          revisionId: ref.revisionId,
        }),
      )
  }
  statements.push(...(input.decisionStatements?.(id) ?? []), ...input.projection.statements)
  const retired = new Set(retiredFeatureIds(input))
  const outputs = new Map(input.outputs.map(ref => [ref.featureId, ref.revisionId]))
  for (const head of input.expectedHeads) {
    const isRetired = retired.has(head.featureId)
    const outputRevisionId = outputs.get(head.featureId)
    const privateOutput = !isRetired && input.preserveVisibility && (input.kind === 'split' || !head.publishedRevisionId)
    const revisionId = isRetired || privateOutput ? null : outputRevisionId
    if (revisionId === undefined) throw new Error('Missing output revision')
    const generation = head.generation + 1
    statements.push(
      db
        .update(featureRevisionHead)
        .set({
          publishedRevisionId: revisionId,
          generation,
          state: isRetired ? (input.kind === 'merge' ? 'merged' : 'split') : 'active',
          redirectFeatureId:
            isRetired && input.kind === 'merge' ? input.outputs[0].featureId : null,
        })
        .where(eq(featureRevisionHead.featureId, head.featureId)),
      db.insert(featureRevisionPublication).values({
        id: crypto.randomUUID(),
        featureId: head.featureId,
        previousRevisionId: head.publishedRevisionId,
        revisionId,
        generation,
        changeSetId: change.id,
      }),
    )
    if (isRetired) {
      statements.push(
        db
          .update(feature)
          .set({
            isPublished: false,
            localIsPublished: false,
            ...(input.preserveVisibility ? { isArchived: true } : {}),
            modifiedAt: new Date().toISOString(),
          })
          .where(eq(feature.id, head.featureId)),
      )
    } else {
      // Staff operations retain visibility; private successors can be edited before publication.
      statements.push(
        db
          .update(feature)
          .set({
            isPublished: !privateOutput,
            localIsPublished: !privateOutput,
            isDraft: false,
            isPendingReview: false,
            publisherId: input.publisherUserId ?? null,
            publishedAt: privateOutput ? null : new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
          })
          .where(eq(feature.id, head.featureId)),
      )
    }
    if (privateOutput && outputRevisionId) statements.push(db.insert(featurePrivateCapture).values({
      featureId: head.featureId, revisionId: outputRevisionId, generation,
    }))
  }
  statements.push(...(input.projection.afterPublication ?? []), prepareRevisionCheck(db, input.projection.verify), ...closing)
  return (await executeRevisionBatch(db, input.guard, statements)) ? id : null
}

/**
 * Records a candidate output for a merge/split without creating an ordinary edit proposal.
 * @param db Request database.
 * @param input Authorized output identity, optional same-feature predecessor and content.
 * @returns Immutable candidate reference, or null if authorized scope changed.
 * @remarks Cross-feature ancestry is stored by the accepted identity operation. It must
 * never be smuggled into the ordinary same-feature predecessor field.
 */
export async function createFeatureIdentityRevision(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    previousRevisionId: string | null
    content: RevisionValue
  },
): Promise<FeatureRevisionRef | null> {
  const change = prepareRevisionChangeSet(db, input),
    revisionId = crypto.randomUUID()
  const guard = sql`(${input.guard}) AND EXISTS (SELECT 1 FROM featureRevisionHead WHERE featureId=${input.featureId} AND state='active')`
  return (await executeRevisionBatch(db, guard, [
    change.statement,
    db.insert(featureRevision).values({
      id: revisionId,
      featureId: input.featureId,
      previousRevisionId: input.previousRevisionId,
      content: input.content,
      changeSetId: change.id,
    }),
  ]))
    ? { featureId: input.featureId, revisionId }
    : null
}
