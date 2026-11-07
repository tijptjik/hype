// SVELTEKIT
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
import { authorizeTaskReadForProbe } from './services/authz/task'
import { authorizeFeaturePublishForSubmission } from './services/authz/feature'
// SERVICES
import {
  readFeatureImageReview,
  reviewedImageContent,
} from '#lib/db/services/featureImageReview.js'
import { probeTaskQuery } from '#lib/db/services/task.js'
import { probeFeatureForUpdate } from '#lib/db/services/feature.js'
import { readFeatureCreationTask } from '#lib/db/services/featureLifecycleCreationTask.js'
import { acceptFeatureCreationProposal } from '#lib/db/services/featureLifecycleContribution.js'
import { prepareFeatureContributionTaskCompletion } from '#lib/db/services/featureLifecycleTask.js'
import {
  inspectFeatureIdentitySource,
  buildSelectedFeatureIdentityContent,
} from '#lib/db/services/featureIdentityProposal.js'
import { getInternalPropertyAccess } from '#lib/properties/audience.server.js'
import { buildFeatureCommandScopeGuard } from '#lib/db/services/featureCommandScope.js'
import { FeatureIdentitySelectionSchema } from '#lib/revisions/featureIdentityPlan.js'
// TYPES
import type { SQL } from 'drizzle-orm'
import type { CreationTaskDraft } from '#lib/db/services/featureLifecycleCreationTask.js'
import type { GuardedBaseContext } from './guarded.types'

const request = z.object({
  taskId: z.string().min(1),
  primaryId: z.string().min(1),
  meta: z.object({ isAdminRequest: z.boolean().optional() }).optional(),
})

/** Resolve separate task and existing Feature authority before exposing duplicate choices.
 * @param ctx Current request. @param input Task and existing primary identity.
 * @returns Exact proposal and accepted-content tokens with transactional scope guards.
 */
async function inspect(
  ctx: GuardedBaseContext,
  input: z.infer<typeof request>,
): Promise<{
  proposal: CreationTaskDraft
  imageReviewId: string | null
  primary: Awaited<ReturnType<typeof inspectFeatureIdentitySource>>
  guard: SQL
  allowedInternalIds: ReadonlySet<string>
}> {
  const probe = await probeTaskQuery(ctx.db, { ref: input.taskId })
  if (!probe || !authorizeTaskReadForProbe({ ...ctx, probe }).allowed)
    error(403, 'TASK_NOT_AVAILABLE')
  const resource = await probeFeatureForUpdate(ctx.db, input.primaryId)
  if (
    !resource ||
    !ctx.isAdminRequest ||
    !authorizeFeaturePublishForSubmission({ ...ctx, resource }).allowed
  )
    error(403, 'FEATURE_NOT_AVAILABLE')
  const featureGuard = buildFeatureCommandScopeGuard(ctx.db, input.primaryId, resource)
  const guard = sql`(${featureGuard}) AND EXISTS(SELECT 1 FROM task t JOIN organisation o ON o.id=t.organisationId
    WHERE t.id=${input.taskId} AND t.projectId=${probe.projectId} AND t.organisationId=${probe.organisationId}
      AND o.hubId IS ${probe.resourceHubId})`
  const proposal = await readFeatureCreationTask(ctx.db, {
    taskId: input.taskId,
    guard,
  })
  if (
    !proposal ||
    proposal.isDraft ||
    proposal.isReviewed ||
    proposal.status !== 'submitted'
  )
    error(409, 'Contribution is no longer awaiting review')
  if (
    proposal.scope.layerId !== resource.layerId ||
    proposal.scope.projectId !== resource.projectId ||
    proposal.scope.organisationId !== resource.organisationId
  )
    error(400, 'Choose an existing Feature in the same layer')
  const access = await getInternalPropertyAccess(ctx)
  if (
    Object.entries(proposal.content.properties).some(
      ([id, field]) =>
        field.selection.definition.audience === 'internal' && !access.allowed.has(id),
    )
  )
    error(403, 'Internal field access required')
  const primary = await inspectFeatureIdentitySource(ctx.db, {
    actorId: ctx.user.id,
    guard,
    allowedInternalIds: access.allowed,
    featureId: input.primaryId,
  })
  const review = await readFeatureImageReview(ctx.db, {
    taskId: input.taskId,
    proposalId: proposal.proposalId,
    guard,
  })
  if (review?.stale) error(409, 'Image review changed; inspect again')
  if (review) proposal.content = reviewedImageContent(review)
  return {
    proposal,
    primary,
    guard,
    allowedInternalIds: access.allowed,
    imageReviewId: review?.reviewId ?? null,
  }
}

/** Inspect a creation proposal beside an existing primary, without allocating a Feature.
 * @param input Task and primary identity. @returns Content choices and exact concurrency tokens.
 */
export const inspectCreationDuplicate = guardedQuery(request, async (input, ctx) => {
  const { proposal, primary, imageReviewId } = await inspect(ctx, input)
  return {
    imageReviewId,
    proposalId: proposal.proposalId,
    version: proposal.version,
    modifiedAt: proposal.modifiedAt,
    sources: [
      {
        featureId: input.primaryId,
        revisionId: primary.revisionId,
        generation: primary.generation,
        content: primary.content,
      },
      {
        featureId: `proposal:${proposal.proposalId}`,
        revisionId: proposal.version,
        generation: 0,
        content: proposal.content,
        proposalOnly: true,
      },
    ],
  }
})

/** Adopt selected contribution fields and photos into an existing identity and complete its task.
 * @param input Inspected proposal and primary tokens and reviewed field selections.
 * @returns Existing primary editor destination; no new identity or merge lineage is created.
 */
export const applyCreationDuplicate = guardedCommand(
  request.extend({
    imageReviewId: z.string().nullable().optional(),
    proposalId: z.string(),
    version: z.string(),
    modifiedAt: z.string(),
    selection: FeatureIdentitySelectionSchema,
  }),
  async (input, ctx) => {
    const { proposal, primary, guard, allowedInternalIds, imageReviewId } =
      await inspect(ctx, input)
    const key = `proposal:${proposal.proposalId}`
    const selection = input.selection
    if (
      (input.imageReviewId ?? null) !== imageReviewId ||
      input.proposalId !== proposal.proposalId ||
      input.version !== proposal.version ||
      input.modifiedAt !== proposal.modifiedAt ||
      selection.kind !== 'merge' ||
      selection.inputs.length !== 2 ||
      selection.outputs.length !== 1 ||
      selection.inputs[0].featureId !== input.primaryId ||
      selection.inputs[0].revisionId !== primary.revisionId ||
      selection.inputs[0].generation !== primary.generation ||
      selection.inputs[1].featureId !== key ||
      selection.inputs[1].revisionId !== proposal.version ||
      selection.outputs[0].featureId !== input.primaryId ||
      selection.outputs[0].sourceFeatureId !== input.primaryId
    )
      error(409, 'Contribution or Feature changed; inspect again')
    const content = await buildSelectedFeatureIdentityContent(ctx.db, {
      kind: 'merge',
      output: selection.outputs[0],
      featureId: input.primaryId,
      sources: new Map([
        [input.primaryId, { content: primary.content }],
        [key, { content: proposal.content }],
      ]),
      allowedInternalIds,
      layerId: proposal.scope.layerId,
    })
    const result = await acceptFeatureCreationProposal(ctx.db, {
      actorId: ctx.user.id,
      guard,
      proposalId: proposal.proposalId,
      expectedVersion: proposal.version,
      imageReview: { taskId: input.taskId, reviewId: imageReviewId },
      reason: selection.reason,
      validate: () => [],
      duplicate: {
        featureId: input.primaryId,
        expectedRevisionId: primary.revisionId,
        expectedVersion: primary.generation,
        guard,
        attachmentGuard: guard,
        derive: () => content,
        validate: () => [],
      },
      completion: featureId =>
        prepareFeatureContributionTaskCompletion(ctx.db, {
          taskId: input.taskId,
          proposalId: proposal.proposalId,
          expectedModifiedAt: proposal.modifiedAt,
          actorId: ctx.user.id,
          guard,
          featureId,
          outcome: 'accepted',
          action: 'merged-feature',
          reason: selection.reason,
        }),
    })
    if (!result) error(409, 'Contribution or Feature changed; inspect again')
    return { outputs: [result.featureId] }
  },
)
