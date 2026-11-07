// DRIZZLE
import { and, eq, sql } from 'drizzle-orm'
// SCHEMA
import { featureRevision, featureRevisionProposal } from '../schema/featureRevision'
// DOMAIN
import {
  FeatureRevisionContentSchema,
  FEATURE_CONTENT_MERGE_POLICY,
  applyFeatureTranslationPatch,
} from '#lib/revisions/featureContent.js'
// SERVICES
import { hasFeatureLifecycleStorage, readCurrentFeatureRevision, acceptPartialFeatureProposal } from './featureLifecycle'
import { readPartialFeatureProposal } from './featureLifecycleProposal'
import { prepareFeatureUploadTaskCompletion } from './featureUploadTasks'
import { buildFeatureCommandScopeGuard } from './featureCommandScope'
import { readFeatureRevisionSource } from './featureRevisionSource'
import { prepareFeatureEditorialProjection } from './featureRevisionProjection'
import {
  createFeatureRevisionProposal,
  saveFeatureRevisionProposal,
  acceptFeatureRevisionProposal,
} from './featureRevision'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { Database } from '#lib/types.js'
import type { FeatureCommandProbe } from '#lib/db/zod/schema/feature.types.js'
import type {
  FeatureRevisionContent,
  FeatureTranslationPatch,
} from '#lib/revisions/featureContent.js'
import type { RevisionResolution } from '#lib/revisions/merge.js'
import type { RevisionCommand, PersistedFeatureAcceptance } from './featureRevision'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CURRENT PUBLISHED AUTHORITY
// - publishedScope
// 2. PRIVATE TRANSLATION PROPOSALS
// - createFeatureTranslationProposal
// - saveFeatureTranslationProposal
// 3. GUARDED EDITORIAL ACCEPTANCE
// - acceptFeatureEditorialRevision
// ---

type EditorialCommand = RevisionCommand & {
  featureId: string
  expectedScope: Omit<FeatureCommandProbe, 'id'>
}
type TranslationPermission = Parameters<typeof applyFeatureTranslationPatch>[2]

/********************
 *  1. CURRENT PUBLISHED AUTHORITY
 ************/
// +++ Current Published Authority

/**
 * Rechecks live publication, ancestry and caller authority without restoring historical controls.
 * @param db Request database.
 * @param input Server-authorized identity and captured parent scope.
 * @returns In-transaction predicate; hidden/retired/unpublished Features require another workflow.
 */
function publishedScope(db: Database, input: EditorialCommand, lifecycle=false): SQL {
  if(lifecycle)return sql`(${input.guard}) AND (${buildFeatureCommandScopeGuard(db,input.featureId,input.expectedScope)})
    AND EXISTS(SELECT 1 FROM feature f JOIN layer l ON l.id=f.layerId JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=f.organisationId
      WHERE f.id=${input.featureId} AND f.currentRevisionId IS NOT NULL AND f.isPublished=1 AND f.isArchived=0
      AND l.isPublished=1 AND l.isArchived=0 AND p.isPublished=1 AND p.isArchived=0 AND o.isPublished=1 AND o.isArchived=0)
    AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember i WHERE i.featureId=${input.featureId} AND i.role='input'
      AND NOT EXISTS(SELECT 1 FROM featureIdentityOperationMember output WHERE output.operationId=i.operationId AND output.role='output' AND output.featureId=i.featureId))`

  return sql`(${input.guard}) AND (${buildFeatureCommandScopeGuard(db, input.featureId, input.expectedScope)})
    AND EXISTS (SELECT 1 FROM feature f JOIN featureRevisionHead h ON h.featureId=f.id
      JOIN layer l ON l.id=f.layerId JOIN project p ON p.id=f.projectId JOIN organisation o ON o.id=f.organisationId
      WHERE f.id=${input.featureId} AND h.state='active' AND h.publishedRevisionId IS NOT NULL
        AND f.isPublished=1 AND f.isArchived=0 AND f.isDraft=0
        AND l.isPublished=1 AND l.isArchived=0 AND p.isPublished=1 AND p.isArchived=0
        AND o.isPublished=1 AND o.isArchived=0)`
}

// ---
/********************
 *  2. PRIVATE TRANSLATION PROPOSALS
 ************/
// +++ Private Translation Proposals

/**
 * Creates an isolated translation branch from a revision that was actually published.
 * @param db Request database.
 * @param input Authenticated actor/scope, published base, allowlisted patch and current permissions.
 * @returns Proposal/candidate identifiers, or null for stale or unavailable publication/scope.
 * @remarks Permissions and guard are server-resolved; no complete content or internal fields
 * are returned to the contributor. A historical public base is valid, but another private
 * candidate cannot be selected as the base. Shared inherited names require Location review.
 */
export async function createFeatureTranslationProposal(
  db: Database,
  input: EditorialCommand & {
    baseRevisionId: string
    patch: FeatureTranslationPatch
    permission: TranslationPermission
  },
): Promise<{ proposalId: string; candidateRevisionId: string } | null> {
  const lifecycle=await hasFeatureLifecycleStorage(db)
  const accepted=lifecycle?sql`EXISTS(SELECT 1 FROM featureRevision WHERE featureId=${input.featureId} AND id=${input.baseRevisionId} AND sequence IS NOT NULL)`:
    sql`EXISTS(SELECT 1 FROM featureRevisionPublication WHERE featureId=${input.featureId} AND revisionId=${input.baseRevisionId})`
  const guard=sql`(${publishedScope(db,input,lifecycle)}) AND (${accepted})`
  const base = await db
    .select({ content: featureRevision.content })
    .from(featureRevision)
    .where(
      and(
        eq(featureRevision.featureId, input.featureId),
        eq(featureRevision.id, input.baseRevisionId),
        guard,
      ),
    )
    .get()
  if (!base) return null
  const parsedBase = FeatureRevisionContentSchema.safeParse(base.content)
  if (!parsedBase.success) return null
  const content = applyFeatureTranslationPatch(
    parsedBase.data,
    input.patch,
    input.permission,
  )
  return createFeatureRevisionProposal(db, { ...input, guard, content })
}

/**
 * Saves a translation-only candidate using exact contributor and draft-head ownership.
 * @param db Request database.
 * @param input Server-resolved scope/permissions and the exact editable proposal token.
 * @returns New immutable candidate ID, or null for moved, submitted or foreign proposals.
 * @remarks Public Feature/Location/image projections are never changed by this command.
 */
export async function saveFeatureTranslationProposal(
  db: Database,
  input: EditorialCommand & {
    proposalId: string
    expectedCandidateRevisionId: string
    patch: FeatureTranslationPatch
    permission: TranslationPermission
  },
): Promise<string | null> {
  const lifecycle=await hasFeatureLifecycleStorage(db)
  const guard = publishedScope(db, input,lifecycle)
  if(lifecycle){
    const proposal=await readPartialFeatureProposal(db,{...input,guard,version:input.expectedCandidateRevisionId,status:'draft'})
    if(!proposal||proposal.contributorId!==input.actorId)return null
    return saveFeatureRevisionProposal(db,{...input,guard,content:applyFeatureTranslationPatch(proposal.content,input.patch,input.permission)})
  }
  const current = await db
    .select({ content: featureRevision.content })
    .from(featureRevisionProposal)
    .innerJoin(
      featureRevision,
      and(
        eq(featureRevision.id, featureRevisionProposal.candidateRevisionId),
        eq(featureRevision.featureId, featureRevisionProposal.featureId),
      ),
    )
    .where(
      and(
        eq(featureRevisionProposal.id, input.proposalId),
        eq(featureRevisionProposal.featureId, input.featureId),
        eq(featureRevisionProposal.contributorId, input.actorId),
        eq(featureRevisionProposal.status, 'draft'),
        eq(
          featureRevisionProposal.candidateRevisionId,
          input.expectedCandidateRevisionId,
        ),
        guard,
      ),
    )
    .get()
  if (!current) return null
  const parsedCurrent = FeatureRevisionContentSchema.safeParse(current.content)
  if (!parsedCurrent.success) return null
  const content = applyFeatureTranslationPatch(
    parsedCurrent.data,
    input.patch,
    input.permission,
  )
  return saveFeatureRevisionProposal(db, { ...input, guard, content })
}

// ---
/********************
 *  3. GUARDED EDITORIAL ACCEPTANCE
 ************/
// +++ Guarded Editorial Acceptance

/**
 * Accepts complete editorial content against the currently published, authorized Feature.
 * @param db Request database.
 * @param input Exact reviewed heads, current publishing authority, delta validation and conflict-field visibility.
 * @returns Accepted revision, conflict/validation errors, or stale evidence with no publication.
 * @remarks The caller must authorize publishing and validate current field eligibility/delta.
 * The fixed content format/merge policy and complete projection adapter cannot be replaced by
 * a remote payload. Shared Location, gallery and detached-brand edits remain separate writers.
 * This command never performs first publication or reactivates an unpublished/archived Feature.
 */
export async function acceptFeatureEditorialRevision(
  db: Database,
  input: EditorialCommand & {
    proposalId: string
    expectedCandidateRevisionId: string
    expectedPublishedRevisionId: string
    expectedGeneration: number
    resolutions?: readonly RevisionResolution[]
    validateResult: (
      previous: FeatureRevisionContent,
      result: FeatureRevisionContent,
    ) => readonly string[]
    canReviewPath: (path: readonly string[]) => boolean
    galleryAttachmentGuard?: SQL
    validateBeforeProjection?: (previous: FeatureRevisionContent, result: FeatureRevisionContent) => Promise<void>
  },
): Promise<PersistedFeatureAcceptance> {
  if (input.resolutions?.some(resolution => !input.canReviewPath(resolution.path)))
    return {
      status: 'invalid',
      errors: [
        'Conflict resolution includes fields outside current review permissions',
      ],
    }
  if(await hasFeatureLifecycleStorage(db)) {
    const guard=sql`(${input.guard}) AND (${buildFeatureCommandScopeGuard(db,input.featureId,input.expectedScope)})`
    const current=await readCurrentFeatureRevision(db,{...input,guard})
    if(!current||current.revisionId!==input.expectedPublishedRevisionId||current.version!==input.expectedGeneration)return {status:'stale'}
    const result=await acceptPartialFeatureProposal(db,{...input,guard,expectedRevisionId:current.revisionId,expectedVersion:current.version,
      expectedProposalVersion:input.expectedCandidateRevisionId,attachmentGuard:input.galleryAttachmentGuard,
      completion:await prepareFeatureUploadTaskCompletion(db,input),validate:input.validateResult,
      prepareProjection:async ({previous,content,source})=>{
        await input.validateBeforeProjection?.(previous,content)
        return prepareFeatureEditorialProjection(db,{featureId:input.featureId,source,previous,content,
          gallery:{actorId:input.actorId,attachmentGuard:input.galleryAttachmentGuard}})
      }})
    if(result.status==='conflict'&&result.conflicts.some(conflict=>!input.canReviewPath(conflict.path)))
      return {status:'invalid',errors:['Proposal conflicts include fields outside current review permissions']}
    return result
  }
  const guard = sql`(${publishedScope(db, input)}) AND EXISTS (SELECT 1 FROM featureRevisionHead
    WHERE featureId=${input.featureId} AND publishedRevisionId=${input.expectedPublishedRevisionId}
      AND generation=${input.expectedGeneration})`
  const published = await db
    .select({ content: featureRevision.content })
    .from(featureRevision)
    .where(
      and(
        eq(featureRevision.featureId, input.featureId),
        eq(featureRevision.id, input.expectedPublishedRevisionId),
        guard,
      ),
    )
    .get()
  if (!published) return { status: 'stale' }
  const previous = FeatureRevisionContentSchema.safeParse(published.content)
  if (!previous.success)
    return {
      status: 'invalid',
      errors: ['Published Feature content requires migration'],
    }
  const source = await readFeatureRevisionSource(db, input.featureId, guard)
  if (!source) return { status: 'stale' }
  const result = await acceptFeatureRevisionProposal(db, {
    ...input,
    decisionStatements: await prepareFeatureUploadTaskCompletion(db, input),
    guard,
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
  // Conflicts are evidence too; publication authority alone does not reveal internal values.
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
