// DRIZZLE
import { sql } from 'drizzle-orm'
// DOMAIN
import {
  FEATURE_CONTENT_MERGE_POLICY,
  FeatureRevisionContentSchema,
} from '#lib/revisions/featureContent.js'
// SERVICES
import { prepareFeatureUploadTaskCompletion } from './featureUploadTasks'
import { buildFeatureCommandScopeGuard } from './featureCommandScope'
import {
  createFeatureRevisionProposal,
  saveFeatureRevisionProposal,
  acceptFeatureRevisionProposal,
} from './featureRevision'
import { readFeatureRevisionSource } from './featureRevisionSource'
import { privateFeatureComparison } from './featurePrivateCapture'
import { prepareFeatureEditorialProjection } from './featureRevisionProjection'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureCommandProbe } from '#lib/db/zod/schema/feature.types.js'
import type { FeatureRevisionContent } from '#lib/revisions/featureContent.js'
import type { RevisionCommand, PersistedFeatureAcceptance } from './featureRevision'
import type { RevisionResolution } from '#lib/revisions/merge.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Scope and draft saves
// 2. Explicit draft publication
// ═══════════════════════

type StaffCommand = RevisionCommand & {
  featureId: string
  expectedScope: Omit<FeatureCommandProbe, 'id'>
}

/**
 * Fences saved staff content against current ancestry and identity lifecycle.
 * @param db Request database.
 * @param input Server-authorized editing or publishing scope.
 * @returns In-transaction scope predicate; parent visibility is checked at publication.
 */
function staffScope(db: Database, input: StaffCommand): SQL {
  return sql`(${input.guard}) AND (${buildFeatureCommandScopeGuard(db, input.featureId, input.expectedScope)})
    AND EXISTS (SELECT 1 FROM feature f JOIN featureRevisionHead h ON h.featureId=f.id
      WHERE f.id=${input.featureId} AND f.isArchived=0 AND h.state='active')`
}

/**
 * Saves staff content as an isolated immutable draft without touching public projections.
 * @param db Request database.
 * @param input Server-built complete content, exact base/draft token and current delta authorization.
 * @returns Draft identifiers, or null when ownership, ancestry or base evidence changed.
 * @remarks This is not a remote payload API. Callers apply allowed form fields to a
 * server-loaded snapshot, preserving hidden fields. Save never publishes or writes shared Locations.
 */
export async function saveFeatureStaffDraft(
  db: Database,
  input: StaffCommand & {
    baseRevisionId: string
    draft?: { proposalId: string; candidateRevisionId: string }
    content: FeatureRevisionContent
    validateResult: (
      previous: FeatureRevisionContent,
      result: FeatureRevisionContent,
    ) => readonly string[]
  },
): Promise<{ proposalId: string; candidateRevisionId: string } | null> {
  const reference = input.draft?.candidateRevisionId ?? input.baseRevisionId
  const privateComparison = await privateFeatureComparison(
    db,
    sql`${input.featureId}`,
    sql`(SELECT generation FROM featureRevisionHead WHERE featureId=${input.featureId})`,
  )
  const evidence = input.draft
    ? sql`EXISTS (SELECT 1 FROM featureRevisionProposal WHERE id=${input.draft.proposalId}
        AND featureId=${input.featureId} AND contributorId=${input.actorId} AND status='draft'
        AND candidateRevisionId=${reference})`
    : sql`(${privateComparison}=${reference} OR EXISTS (SELECT 1 FROM featureRevisionPublication p WHERE p.featureId=${input.featureId}
        AND (p.revisionId=${reference} OR (p.generation=0 AND EXISTS (
          SELECT 1 FROM featureRevision r WHERE r.id=${reference} AND r.featureId=p.featureId
          AND r.changeSetId=p.changeSetId AND r.previousRevisionId IS NULL)))))`
  const guard = sql`(${staffScope(db, input)}) AND (${evidence})`
  const row = await db.get<{ content: string }>(sql`SELECT content FROM featureRevision
    WHERE featureId=${input.featureId} AND id=${reference} AND (${guard})`)
  if (!row) return null
  const previous = FeatureRevisionContentSchema.safeParse(JSON.parse(row.content))
  if (!previous.success) return null
  const content = FeatureRevisionContentSchema.parse(input.content)
  const errors = input.validateResult(previous.data, content)
  if (errors.length) throw new Error(errors.join('; '))
  if (!input.draft)
    return createFeatureRevisionProposal(db, { ...input, guard, content })
  const candidateRevisionId = await saveFeatureRevisionProposal(db, {
    ...input,
    guard,
    content,
    proposalId: input.draft.proposalId,
    expectedCandidateRevisionId: input.draft.candidateRevisionId,
  })
  return candidateRevisionId
    ? { proposalId: input.draft.proposalId, candidateRevisionId }
    : null
}

/**
 * Publishes the staff member's exact saved draft, including initial publication or republication.
 * @param db Request database.
 * @param input Inspected publication/comparison tokens and server-resolved publishing/field authority.
 * @returns Atomic publication outcome. Failed validation leaves the saved draft editable.
 * @remarks Publication must be an explicit UI action. Contributor review uses its separate
 * submitted-proposal command and cannot invoke this unpublished-identity path.
 */
export async function publishFeatureStaffDraft(
  db: Database,
  input: StaffCommand & {
    proposalId: string
    expectedCandidateRevisionId: string
    expectedPublishedRevisionId: string | null
    expectedComparisonRevisionId: string
    expectedGeneration: number
    resolutions?: readonly RevisionResolution[]
    validateResult: (
      previous: FeatureRevisionContent,
      result: FeatureRevisionContent,
    ) => readonly string[]
    canReviewPath: (path: readonly string[]) => boolean
    galleryAttachmentGuard?: SQL
    validateBeforeProjection?: (
      previous: FeatureRevisionContent,
      result: FeatureRevisionContent,
    ) => Promise<void>
  },
): Promise<PersistedFeatureAcceptance> {
  const initialStorage =
    input.expectedGeneration === 0 &&
    (await db.get<{ n: number }>(
      sql`SELECT count(*) n FROM sqlite_master WHERE name='featureInitialRevision' AND type='table'`,
    ))
  if (
    initialStorage &&
    initialStorage.n &&
    (await db.get(
      sql`SELECT 1 FROM featureInitialRevision WHERE featureId=${input.featureId} AND mode='contribution'`,
    ))
  )
    return {
      status: 'invalid',
      errors: ['Review this initial contribution through its task'],
    }
  if (input.resolutions?.some(resolution => !input.canReviewPath(resolution.path)))
    return {
      status: 'invalid',
      errors: [
        'Conflict resolution includes fields outside current review permissions',
      ],
    }
  const guard = sql`(${staffScope(db, input)}) AND EXISTS (
    SELECT 1 FROM feature f JOIN layer l ON l.id=f.layerId JOIN project p ON p.id=f.projectId
      JOIN organisation o ON o.id=f.organisationId WHERE f.id=${input.featureId}
      AND l.isPublished=1 AND l.isArchived=0 AND p.isPublished=1 AND p.isArchived=0
      AND o.isPublished=1 AND o.isArchived=0)`
  const row = await db.get<{ content: string }>(sql`SELECT content FROM featureRevision
    WHERE featureId=${input.featureId} AND id=${input.expectedComparisonRevisionId} AND (${guard})`)
  if (
    !row ||
    (input.expectedPublishedRevisionId !== null &&
      input.expectedPublishedRevisionId !== input.expectedComparisonRevisionId)
  )
    return { status: 'stale' }
  const previous = FeatureRevisionContentSchema.safeParse(JSON.parse(row.content))
  if (!previous.success)
    return { status: 'invalid', errors: ['Feature content requires migration'] }
  const source = await readFeatureRevisionSource(db, input.featureId, guard)
  if (!source) return { status: 'stale' }
  const result = await acceptFeatureRevisionProposal(db, {
    ...input,
    decisionStatements: await prepareFeatureUploadTaskCompletion(db, input),
    guard,
    acceptOwnDraft: true,
    publicationIntent:
      input.expectedPublishedRevisionId !== null
        ? 'update'
        : input.expectedGeneration === 0
          ? 'initial'
          : 'republish',
    mergePolicy: FEATURE_CONTENT_MERGE_POLICY,
    validate: value => {
      const parsed = FeatureRevisionContentSchema.safeParse(value)
      return parsed.success
        ? input.validateResult(previous.data, parsed.data)
        : ['Invalid Feature content']
    },
    project: async value => {
      const content = FeatureRevisionContentSchema.parse(value)
      await input.validateBeforeProjection?.(previous.data, content)
      return prepareFeatureEditorialProjection(db, {
        featureId: input.featureId,
        source,
        previous: previous.data,
        content,
        gallery: {
          actorId: input.actorId,
          attachmentGuard: input.galleryAttachmentGuard,
        },
      })
    },
  })
  if (
    result.status === 'conflict' &&
    result.conflicts.some(conflict => !input.canReviewPath(conflict.path))
  )
    return {
      status: 'invalid',
      errors: ['Proposal conflicts include fields outside current review permissions'],
    }
  return result
}
