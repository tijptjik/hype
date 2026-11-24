// DISPLAY TEMPLATES
import { prepareFeatureDisplayTemplate } from './featureDisplayTemplate'
// IMAGE INTENT POLICY
import {
  readFeatureImageIntentPolicy,
  normalizeAcceptedGalleryIntents,
} from './imageIntentPolicy'
import {
  prepareImageReviewAcceptance,
  reviewedImageChanges,
} from './featureImageReview'
// DRIZZLE
import { and, eq, isNull, sql } from 'drizzle-orm'
// SCHEMA
import { featureImage } from '../schema/image'
import {
  lifecycleFeature,
  acceptedFeatureRevision,
  partialFeatureProposal,
  partialFeatureReview,
  lifecycleWriteScope,
} from '../schema/featureLifecycle.target'
// DOMAIN
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
import {
  FeatureChangesSchema,
  buildFeatureChanges,
  applyFeatureChanges,
} from '#lib/revisions/featureChanges.js'
// SERVICES
import { readFeatureRevisionSource } from './featureRevisionSource'
import {
  featureContentProjectionMatches,
  prepareFeatureEditorialProjection,
} from './featureRevisionProjection'
import { prepareRevisionChangeSet } from './revisionChangeSet'
import { prepareFeatureIdleRevision } from './featureRevisionIdleWindow'
import { executeRevisionBatch, prepareRevisionCheck } from './revisionBatch'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import type { Database } from '#lib/types.js'
import type { RevisionCommand } from './revisionChangeSet'
import type { RevisionProjection } from './featureRevision'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { FeatureChanges } from '#lib/revisions/featureChanges.js'
import type { RevisionConflict, RevisionResolution } from '#lib/revisions/merge.js'
import type { FeatureRevisionSource } from './featureRevisionSource'

// TABLE OF CONTENTS
// 1. One current accepted record and its state
// 2. Atomic staff/automation edits and visibility changes
// 3. Partial proposal preparation, acceptance and rejection

export type FeatureLifecycleState = {
  isPublished: boolean
  isArchived: boolean
  localIsPublished: boolean | null
  organisationId: string
  projectId: string
  layerId: string
}
export type CurrentFeatureRevision = {
  featureId: string
  revisionId: string
  version: number
  state: FeatureLifecycleState
  content: FeatureRevisionContent
  retired: boolean
}
export type FeatureEditCommand = RevisionCommand & {
  /** Trusted adoption adapter supplies evidence prepared in the same transaction. */
  templateLocation?: (
    content: FeatureRevisionContent,
  ) => import('#lib/locations/resolve.js').EffectiveLocationFacts
  featureId: string
  expectedRevisionId: string
  expectedVersion: number
  state?: Partial<Pick<FeatureLifecycleState, 'isPublished' | 'isArchived'>>
  prepareProjection?: (context: {
    previous: FeatureRevisionContent
    content: FeatureRevisionContent
    source: FeatureRevisionSource
    revisionId: string
  }) => RevisionProjection | Promise<RevisionProjection>
  attachmentGuard?: SQL
  /** Trusted identity adapter may adopt already accepted Location associations. */
  identity?: { actorId: string }
  validate: (
    before: FeatureRevisionContent,
    after: FeatureRevisionContent,
  ) => readonly string[] | Promise<readonly string[]>
  derive: (
    previous: FeatureRevisionContent,
    source: FeatureRevisionSource,
  ) => FeatureRevisionContent | Promise<FeatureRevisionContent>
}
export type PreparedFeatureEdit = {
  guard: SQL
  statements: BatchItem<'sqlite'>[]
  revisionId: string
  content: FeatureRevisionContent
  state: FeatureLifecycleState
}

/** Snapshot current record controls inside the same accepted-content transaction.
 * @param featureId Current record. @returns SQL JSON expression evaluated after the projection.
 */
function recordState(featureId: string): SQL {
  return sql`(SELECT json_object('isPublished',json(CASE WHEN isPublished=1 THEN 'true' ELSE 'false' END),
    'isArchived',json(CASE WHEN isArchived=1 THEN 'true' ELSE 'false' END),
    'localIsPublished',json(CASE WHEN localIsPublished IS NULL THEN 'null' WHEN localIsPublished=1 THEN 'true' ELSE 'false' END),
    'organisationId',organisationId,'projectId',projectId,'layerId',layerId) FROM feature WHERE id=${featureId})`
}

/** Read the sole accepted revision independently of publication state.
 * @param db Request database. @param input Server-authorized identity and scope.
 * @returns Current content/state, or null outside the caller's scope.
 * @remarks Retirement is derived from lineage. A retired source cannot be restored by an archive toggle.
 */
export async function readCurrentFeatureRevision(
  db: Database,
  input: { featureId: string; guard: SQL },
): Promise<CurrentFeatureRevision | null> {
  const row = await db.get<{
    id: string
    currentRevisionId: string
    revisionVersion: number
    isPublished: number
    isArchived: number
    localIsPublished: number | null
    organisationId: string
    projectId: string
    layerId: string
    content: string
    retired: number
  }>(sql`
    SELECT f.id,f.currentRevisionId,f.revisionVersion,f.isPublished,f.isArchived,f.localIsPublished,
      f.organisationId,f.projectId,f.layerId,r.content,
      EXISTS (SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=f.id AND i.role='input'
        AND NOT EXISTS (SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.role='output' AND o.featureId=f.id)) retired
    FROM feature f JOIN featureRevision r ON r.id=f.currentRevisionId AND r.featureId=f.id
    WHERE f.id=${input.featureId} AND (${input.guard})`)
  return row
    ? {
        featureId: row.id,
        revisionId: row.currentRevisionId,
        version: row.revisionVersion,
        content: FeatureRevisionContentSchema.parse(JSON.parse(row.content)),
        retired: Boolean(row.retired),
        state: {
          isPublished: Boolean(row.isPublished),
          isArchived: Boolean(row.isArchived),
          localIsPublished:
            row.localIsPublished === null ? null : Boolean(row.localIsPublished),
          organisationId: row.organisationId,
          projectId: row.projectId,
          layerId: row.layerId,
        },
      }
    : null
}

/** Initialize accepted history for an existing or atomically inserted Feature.
 * @param db Request database. @param input Trusted complete content and exact creation/source guard.
 * @returns Initial revision ID, or null if initialization lost its race.
 * @remarks The initial snapshot records actual visibility; it does not change it.
 */
export async function initializeCurrentFeatureRevision(
  db: Database,
  input: RevisionCommand & { featureId: string; content: FeatureRevisionContent },
): Promise<string | null> {
  const prepared = await prepareCurrentFeatureInitialization(db, input)
  return (await executeRevisionBatch(db, prepared.guard, prepared.statements))
    ? prepared.revisionId
    : null
}

/** Prepare the initial accepted snapshot for an existing or atomically inserted record.
 * @param db Request database. @param input Exact complete creation content and source guard.
 * @returns Guard and unexecuted statements for the enclosing creation transaction.
 */
export async function prepareCurrentFeatureInitialization(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    content: FeatureRevisionContent
    creationScope?: { organisationId: string; projectId: string }
  },
): Promise<{ revisionId: string; guard: SQL; statements: BatchItem<'sqlite'>[] }> {
  const content = FeatureRevisionContentSchema.parse(input.content),
    revisionId = crypto.randomUUID(),
    change = prepareRevisionChangeSet(db, input)
  const displayTemplate = await prepareFeatureDisplayTemplate(db, {
    featureId: input.featureId,
    previous: input.content,
    content,
    creationScope: input.creationScope,
  })
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND currentRevisionId IS NULL AND revisionVersion=0)
    AND (${featureContentProjectionMatches(input.featureId, content)})`
  return {
    revisionId,
    guard,
    statements: [
      ...displayTemplate,
      change.statement,
      db.insert(acceptedFeatureRevision).values({
        id: revisionId,
        featureId: input.featureId,
        changeSetId: change.id,
        content: JSON.stringify(content),
        recordState: recordState(input.featureId),
        sequence: 0,
      }),
      db
        .update(lifecycleFeature)
        .set({ currentRevisionId: revisionId })
        .where(eq(lifecycleFeature.id, input.featureId)),
    ],
  }
}

/** Prepare a normal accepted edit, including visibility/archive changes, in one transaction.
 * @param db Request database. @param input Exact current revision/version, authorized changes and validation.
 * @returns Complete unexecuted write or null for stale input.
 * @remarks No draft, private journal, publication head, or publication receipt is created.
 */
export async function prepareFeatureEdit(
  db: Database,
  input: FeatureEditCommand,
): Promise<PreparedFeatureEdit | null> {
  const current = await readCurrentFeatureRevision(db, input)
  if (
    !current ||
    current.revisionId !== input.expectedRevisionId ||
    current.version !== input.expectedVersion
  )
    return null
  if (current.retired)
    throw new Error(
      'Retired Feature history is read-only; use an explicit identity correction',
    )
  const source = await readFeatureRevisionSource(db, input.featureId, input.guard)
  if (!source) return null
  const content = FeatureRevisionContentSchema.parse(
    await input.derive(structuredClone(current.content), source),
  )
  const errors = await input.validate(current.content, content)
  if (errors.length) throw new Error(errors.join('; '))
  const imagePolicy = await readFeatureImageIntentPolicy(db, input.featureId)
  await normalizeAcceptedGalleryIntents(db, input.featureId, content, imagePolicy)
  const state = { ...current.state, ...input.state }
  if (input.state?.isPublished !== undefined)
    state.localIsPublished = input.state.isPublished
  const displayTemplate = await prepareFeatureDisplayTemplate(db, {
    featureId: input.featureId,
    previous: current.content,
    content,
    acceptedLocation: input.templateLocation?.(content),
    creationScope: { organisationId: state.organisationId, projectId: state.projectId },
  })
  const idle = await prepareFeatureIdleRevision(db, {
    ...input,
    previousRevisionId: current.revisionId,
    previous: current.content,
    content,
    boundary: input.state !== undefined || Boolean(input.identity),
    lifecycle: {
      sequence: current.version + 1,
      recordState: recordState(input.featureId),
    },
  })
  const revisionId = idle.revisionId,
    token = crypto.randomUUID(),
    version = current.version + 1
  const projection = input.prepareProjection
    ? await input.prepareProjection({
        previous: current.content,
        content,
        source,
        revisionId,
      })
    : prepareFeatureEditorialProjection(db, {
        featureId: input.featureId,
        source,
        previous: current.content,
        content,
        gallery: { actorId: input.actorId, attachmentGuard: input.attachmentGuard },
        identity: input.identity,
      })
  const guard = sql`(${input.guard}) AND (${imagePolicy.guard}) AND (${source.unchanged}) AND (${featureContentProjectionMatches(input.featureId, current.content)})
    AND EXISTS (SELECT 1 FROM feature WHERE id=${input.featureId} AND currentRevisionId=${current.revisionId} AND revisionVersion=${current.version})
    AND NOT EXISTS (SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=${input.featureId} AND i.role='input'
      AND NOT EXISTS (SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.featureId=i.featureId AND o.role='output'))`
  // Projection, record state, revision pointer and complete snapshot either all commit or all roll back.
  const statements: BatchItem<'sqlite'>[] = [
    db.insert(lifecycleWriteScope).values({ featureId: input.featureId, token }),
    ...projection.statements,
    ...displayTemplate,
    prepareRevisionCheck(db, projection.verify),
    // Preserve legacy gallery choices before publication/archive triggers recompute effective visibility.
    ...(input.state
      ? [
          db
            .update(featureImage)
            .set({ localIsPublished: sql`${featureImage.isPublished}` })
            .where(
              and(
                eq(featureImage.featureId, input.featureId),
                isNull(featureImage.localIsPublished),
              ),
            ),
        ]
      : []),
    db
      .update(lifecycleFeature)
      .set({
        isPublished: Number(state.isPublished),
        localIsPublished:
          state.localIsPublished === null ? null : Number(state.localIsPublished),
        isArchived: Number(state.isArchived),
      })
      .where(eq(lifecycleFeature.id, input.featureId)),
    ...idle.write,
    ...(!idle.noop
      ? [
          db
            .update(lifecycleFeature)
            .set({ currentRevisionId: revisionId, revisionVersion: version })
            .where(eq(lifecycleFeature.id, input.featureId)),
        ]
      : []),
    ...idle.finish,
    ...(projection.afterPublication ?? []),
    prepareRevisionCheck(db, featureContentProjectionMatches(input.featureId, content)),
    db
      .delete(lifecycleWriteScope)
      .where(
        and(
          eq(lifecycleWriteScope.featureId, input.featureId),
          eq(lifecycleWriteScope.token, token),
        ),
      ),
    prepareRevisionCheck(
      db,
      sql`NOT EXISTS(SELECT 1 FROM featureRevisionWriteScope WHERE featureId=${input.featureId})`,
    ),
  ]
  return { guard, statements, revisionId, content, state }
}

/** Save accepted staff/automation changes without modifying publication unless explicitly requested.
 * @param db Request database. @param input Current-state command.
 * @returns Accepted revision ID, or null if the inspected record changed.
 */
export async function saveFeatureEdit(
  db: Database,
  input: FeatureEditCommand,
): Promise<string | null> {
  const prepared = await prepareFeatureEdit(db, input)
  return prepared &&
    (await executeRevisionBatch(db, prepared.guard, prepared.statements))
    ? prepared.revisionId
    : null
}

/** Store a partial contribution against its exact immutable base, without creating a Feature revision.
 * @param db Request database. @param input Authorized contributor, existing Feature and partial changes.
 * @returns Proposal identity/version, or null if scope changed.
 * @remarks Domain adapters must authorize every changed field and referenced photo before calling.
 */
export async function createPartialFeatureProposal(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    baseRevisionId: string
    changes: FeatureChanges
    submit?: boolean
    attachTask?: (proposalId: string) => BatchItem<'sqlite'>[]
  },
): Promise<{ proposalId: string; version: string } | null> {
  const base = await db.get<{
    content: string
  }>(sql`SELECT r.content FROM featureRevision r JOIN feature f ON f.id=r.featureId
    WHERE r.id=${input.baseRevisionId} AND r.featureId=${input.featureId} AND (${input.guard})`)
  if (!base) return null
  const changes = FeatureChangesSchema.parse(input.changes),
    content = FeatureRevisionContentSchema.parse(JSON.parse(base.content))
  const result = applyFeatureChanges(content, content, changes)
  if (result.status !== 'ready')
    throw new Error('Proposal cannot be applied to its base revision')
  const proposalId = crypto.randomUUID(),
    version = crypto.randomUUID(),
    change = prepareRevisionChangeSet(db, input)
  const status = input.submit ? 'submitted' : 'draft'
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND currentRevisionId IS NOT NULL)
    AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=${input.featureId} AND i.role='input'
      AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.role='output' AND o.featureId=i.featureId))`
  const statements: BatchItem<'sqlite'>[] = [
    change.statement,
    db.insert(partialFeatureProposal).values({
      id: proposalId,
      featureId: input.featureId,
      baseRevisionId: input.baseRevisionId,
      kind: 'update',
      version,
      changes: JSON.stringify(changes),
      contributorId: input.actorId,
      status,
      createdChangeSetId: change.id,
    }),
    db.insert(partialFeatureReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId,
      proposalVersion: version,
      changes: JSON.stringify(changes),
      action: 'created',
      changeSetId: change.id,
    }),
  ]
  if (input.submit)
    statements.push(
      db.insert(partialFeatureReview).values({
        id: crypto.randomUUID(),
        featureId: input.featureId,
        proposalId,
        proposalVersion: version,
        changes: JSON.stringify(changes),
        action: 'submitted',
        changeSetId: change.id,
      }),
    )
  statements.push(...(input.attachTask?.(proposalId) ?? []))
  return (await executeRevisionBatch(db, guard, statements))
    ? { proposalId, version }
    : null
}

/** Accept an exact partial proposal into the current record with its present publication state.
 * @param db Request database. @param input Reviewer authority, current/proposal tokens and domain validation.
 * @returns Accepted revision, explicit overlapping-field conflicts, or stale evidence.
 * @remarks Caller-supplied task completion is part of the same transaction. Retired targets require explicit retargeting.
 */
export async function acceptPartialFeatureProposal(
  db: Database,
  input: Omit<FeatureEditCommand, 'derive' | 'state'> & {
    proposalId: string
    expectedProposalVersion: string
    imageReview?: { taskId: string; reviewId: string | null }
    /** Server-composed task gallery; protected by the complete task evidence guard. */
    reviewedContent?: FeatureRevisionContent
    completion?: BatchItem<'sqlite'>[]
    resolutions?: readonly RevisionResolution[]
  },
): Promise<
  | { status: 'accepted'; revisionId: string }
  | { status: 'stale' }
  | { status: 'conflict'; conflicts: RevisionConflict[] }
> {
  const proposal = await db.get<{
    version: string
    changes: string
    content: string
  }>(sql`
    SELECT p.version,p.changes,r.content FROM featureRevisionProposal p JOIN featureRevision r ON r.id=p.baseRevisionId
    WHERE p.id=${input.proposalId} AND p.featureId=${input.featureId} AND p.status='submitted' AND p.kind='update'
      AND p.version=${input.expectedProposalVersion} AND r.featureId=p.featureId AND (${input.guard})`)
  const current = await readCurrentFeatureRevision(db, input)
  if (
    !proposal ||
    !current ||
    current.revisionId !== input.expectedRevisionId ||
    current.version !== input.expectedVersion
  )
    return { status: 'stale' }
  if (current.retired)
    throw new Error('Choose an active successor and review the proposed changes again')
  const imageReview = await prepareImageReviewAcceptance(
    db,
    input.proposalId,
    input.imageReview,
    input.guard,
  )
  if (!imageReview) return { status: 'stale' }
  const reviewedChanges = input.reviewedContent
    ? buildFeatureChanges(
        FeatureRevisionContentSchema.parse(JSON.parse(proposal.content)),
        input.reviewedContent,
      )
    : imageReview.review
      ? reviewedImageChanges(
          FeatureRevisionContentSchema.parse(JSON.parse(proposal.content)),
          imageReview.review,
        )
      : FeatureChangesSchema.parse(JSON.parse(proposal.changes))
  const result = applyFeatureChanges(
    FeatureRevisionContentSchema.parse(JSON.parse(proposal.content)),
    current.content,
    reviewedChanges,
    input.resolutions,
  )
  if (result.status === 'conflict') return result
  const prepared = await prepareFeatureEdit(db, {
    ...input,
    revisionBoundary: true,
    guard: imageReview.guard,
    derive: () => result.content,
  })
  if (!prepared) return { status: 'stale' }
  const change = prepareRevisionChangeSet(db, input)
  const statements: BatchItem<'sqlite'>[] = [
    ...prepared.statements,
    change.statement,
    db
      .update(partialFeatureProposal)
      .set({ status: 'accepted' })
      .where(eq(partialFeatureProposal.id, input.proposalId)),
    db.insert(partialFeatureReview).values({
      id: crypto.randomUUID(),
      featureId: input.featureId,
      proposalId: input.proposalId,
      proposalVersion: proposal.version,
      changes: proposal.changes,
      resolutions: JSON.stringify(input.resolutions ?? []),
      context: JSON.stringify({ imageReviewId: imageReview.review?.reviewId ?? null }),
      comparedRevisionId: current.revisionId,
      resultingRevisionId: prepared.revisionId,
      action: 'accepted',
      changeSetId: change.id,
    }),
    ...(input.completion ?? []),
  ]
  const guard = sql`(${prepared.guard}) AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId}
    AND featureId=${input.featureId} AND status='submitted' AND version=${input.expectedProposalVersion})`
  return (await executeRevisionBatch(db, guard, statements))
    ? { status: 'accepted', revisionId: prepared.revisionId }
    : { status: 'stale' }
}

/** Reject an exact contribution without changing accepted Feature content or deleting its evidence.
 * @param db Request database. @param input Authorized review and optional atomic task completion.
 * @returns Whether the pending proposal was rejected.
 */
export async function rejectPartialFeatureProposal(
  db: Database,
  input: RevisionCommand & {
    proposalId: string
    expectedProposalVersion: string
    completion?: BatchItem<'sqlite'>[]
  },
): Promise<boolean> {
  if (!input.reason?.trim()) throw new Error('A review reason is required')
  const change = prepareRevisionChangeSet(db, input)
  const guard = sql`(${input.guard}) AND EXISTS(SELECT 1 FROM featureRevisionProposal WHERE id=${input.proposalId}
    AND version=${input.expectedProposalVersion} AND status='submitted')`
  const proposal = await db.get<{ featureId: string | null; changes: string }>(
    sql`SELECT featureId,changes FROM featureRevisionProposal WHERE id=${input.proposalId} AND (${guard})`,
  )
  if (!proposal) return false
  return Boolean(
    await executeRevisionBatch(db, guard, [
      change.statement,
      db.insert(partialFeatureReview).values({
        id: crypto.randomUUID(),
        featureId: proposal.featureId,
        proposalId: input.proposalId,
        proposalVersion: input.expectedProposalVersion,
        changes: proposal.changes,
        action: 'rejected',
        changeSetId: change.id,
      }),
      db
        .update(partialFeatureProposal)
        .set({ status: 'rejected' })
        .where(eq(partialFeatureProposal.id, input.proposalId)),
      ...(input.completion ?? []),
    ]),
  )
}

/** Detect the completed lifecycle cutover without assuming legacy tables still exist.
 * @param db Request database. @returns Whether the Feature has the single-current-revision schema.
 */
export async function hasFeatureLifecycleStorage(db: Database): Promise<boolean> {
  const row = await db.get<{ n: number }>(
    sql`SELECT count(*) n FROM pragma_table_info('feature') WHERE name='currentRevisionId'`,
  )
  return Boolean(row?.n)
}

/** Surround a domain's authorized projection with one accepted snapshot and concurrency guard.
 * @param db Request database. @param input Trusted domain change, derivation and optional explicit unpublication.
 * @returns Before/after statements which must enclose the domain writes in the same batch.
 * @remarks This adapter preserves existing form, Location and automation validation boundaries.
 */
export async function prepareLifecycleCapture(
  db: Database,
  input: RevisionCommand & {
    featureId: string
    /** Exact shared revisions inserted by this same atomic operation. */
    preparedSharedCorrections?: readonly import('./locationShared').PreparedSharedCorrection[]
    /** Trusted migration's effective facts when its Location is inserted in this batch. */
    acceptedLocation?: import('#lib/locations/resolve.js').EffectiveLocationFacts
    unpublish?: boolean
    visibility?: boolean
    derive: (
      previous: FeatureRevisionContent,
      source: FeatureRevisionSource,
    ) => FeatureRevisionContent | Promise<FeatureRevisionContent>
  },
): Promise<{
  before: BatchItem<'sqlite'>[]
  after: BatchItem<'sqlite'>[]
  revisionId: string
}> {
  const current = await readCurrentFeatureRevision(db, input)
  if (!current) throw new Error('Current Feature revision is unavailable')
  if (current.retired)
    throw new Error('Retired Features cannot receive content changes')
  const source = await readFeatureRevisionSource(db, input.featureId, input.guard)
  if (!source) throw new Error('Feature revision scope changed')
  const content = FeatureRevisionContentSchema.parse(
    await input.derive(structuredClone(current.content), source),
  )
  const displayTemplate = await prepareFeatureDisplayTemplate(db, {
    featureId: input.featureId,
    previous: current.content,
    content,
    preparedSharedCorrections: input.preparedSharedCorrections,
    acceptedLocation: input.acceptedLocation,
  })
  const idle = await prepareFeatureIdleRevision(db, {
    ...input,
    previousRevisionId: current.revisionId,
    previous: current.content,
    content,
    boundary: Boolean(input.unpublish) || input.visibility !== undefined,
    lifecycle: {
      sequence: current.version + 1,
      recordState: recordState(input.featureId),
    },
  })
  const token = crypto.randomUUID(),
    revisionId = idle.revisionId
  // The captured source already includes the caller guard.
  const guard = sql`(${source.unchanged}) AND (${featureContentProjectionMatches(input.featureId, current.content)})
    AND EXISTS(SELECT 1 FROM feature WHERE id=${input.featureId} AND currentRevisionId=${current.revisionId} AND revisionVersion=${current.version})
    AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=${input.featureId} AND i.role='input'
      AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember o WHERE o.operationId=i.operationId AND o.role='output' AND o.featureId=i.featureId))`
  return {
    revisionId,
    before: [
      prepareRevisionCheck(db, guard),
      db.insert(lifecycleWriteScope).values({ featureId: input.featureId, token }),
    ],
    after: [
      ...displayTemplate,
      ...(input.unpublish
        ? [
            db
              .update(lifecycleFeature)
              .set({ isPublished: 0, localIsPublished: 0 })
              .where(eq(lifecycleFeature.id, input.featureId)),
          ]
        : []),
      prepareRevisionCheck(
        db,
        sql`(${featureContentProjectionMatches(input.featureId, content)}) AND EXISTS(SELECT 1 FROM feature
      WHERE id=${input.featureId} AND isPublished=${Number(input.unpublish ? false : (input.visibility ?? current.state.isPublished))})`,
      ),
      ...idle.write,
      ...(!idle.noop
        ? [
            db
              .update(lifecycleFeature)
              .set({
                currentRevisionId: revisionId,
                revisionVersion: current.version + 1,
              })
              .where(eq(lifecycleFeature.id, input.featureId)),
          ]
        : []),
      ...idle.finish,
      db
        .delete(lifecycleWriteScope)
        .where(
          and(
            eq(lifecycleWriteScope.featureId, input.featureId),
            eq(lifecycleWriteScope.token, token),
          ),
        ),
    ],
  }
}
