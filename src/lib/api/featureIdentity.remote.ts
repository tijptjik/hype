// SVELTE
import { error } from '@sveltejs/kit'
// DRIZZLE
import { sql } from 'drizzle-orm'
// VALIDATION
import { z } from 'zod'
// API
import { guardedCommand, guardedQuery } from './server/guarded'
import { authorizeTaskReadForProbe } from './services/authz/index.js'
import { probeTaskQuery } from '#lib/db/services/task.js'
import { prepareFeatureDuplicateReview } from '#lib/db/services/featureDuplicateReview.js'
import { authorizeFeaturePublishForSubmission } from './services/authz/feature'
// DOMAIN
import { FeatureTaskAssignmentsSchema } from '#lib/revisions/featureRelationshipPlan.js'
import { FeatureIdentitySelectionSchema } from '#lib/revisions/featureIdentityPlan.js'
import { FeatureRevisionContentSchema } from '#lib/revisions/featureContent.js'
// SERVICES
import { hasFeatureLifecycleStorage } from '#lib/db/services/featureLifecycle.js'
import { applyCurrentFeatureIdentitySelection } from '#lib/db/services/featureLifecycleIdentityAdapter.js'
import { prepareLifecycleDuplicateReview } from '#lib/db/services/featureDuplicateReview.js'
import { getInternalPropertyAccess } from '#lib/properties/audience.server.js'
import { probeFeatureForUpdate } from '#lib/db/services/feature.js'
import {
  readPublicFeatureSuccessors,
  readSavedFeatureSuccessors,
} from '#lib/db/services/featureSuccessors.js'
import {
  featureIdentityReviewEnabled,
  inspectFeatureIdentitySource,
  createFeatureIdentityProposal,
  readFeatureIdentityProposal,
  decideFeatureIdentityProposal,
} from '#lib/db/services/featureIdentityProposal.js'
// TYPES
import type { IdentityTaskEvidence } from '#lib/revisions/featureRelationshipPlan.js'
import type { GuardedBaseContext } from './guarded.types'
import type { IdentityCommand } from '#lib/db/services/featureIdentityProposal.js'

// ═══════════════════════
// TABLE OF CONTENTS
// 1. Current publisher authority for every affected identity
// 2. Inspected content and immutable proposal creation
// 3. Review and decisions
// ═══════════════════════
const meta = z.object({ isAdminRequest: z.boolean().optional() }).optional()

/** Resolves persisted scopes and requires publisher authority on every affected Feature.
 * @param ctx Authenticated request. @param ids All input and output identities.
 * @returns Current authority with a one-binding transactional ancestry fence.
 */
async function scope(ctx: GuardedBaseContext, ids: string[]): Promise<IdentityCommand> {
  // Staff lifecycle actions remain available after the legacy proposal tables are removed.
  if (
    !ctx.isAdminRequest ||
    (!(await hasFeatureLifecycleStorage(ctx.db)) &&
      !(await featureIdentityReviewEnabled(ctx.db)))
  )
    error(403, 'IDENTITY_REVIEW_UNAVAILABLE')
  const scopes = []
  for (const id of new Set(ids)) {
    const resource = await probeFeatureForUpdate(ctx.db, id)
    if (!resource) error(404, 'FEATURE_NOT_FOUND')
    if (
      !authorizeFeaturePublishForSubmission({
        user: ctx.user,
        userRoles: ctx.userRoles,
        resource,
      }).allowed
    )
      error(403, 'INSUFFICIENT_ROLE')
    scopes.push(resource)
  }
  const access = await getInternalPropertyAccess(ctx)
  return {
    actorId: ctx.user.id,
    allowedInternalIds: access.allowed,
    guard: sql`NOT EXISTS(SELECT 1 FROM json_each(${JSON.stringify(scopes)}) expected WHERE NOT EXISTS(
      SELECT 1 FROM feature f JOIN layer l ON l.id=f.layerId AND l.projectId=f.projectId AND l.organisationId=f.organisationId
      JOIN project p ON p.id=f.projectId AND p.organisationId=f.organisationId JOIN organisation o ON o.id=f.organisationId
      WHERE f.id=json_extract(expected.value,'$.id') AND f.layerId=json_extract(expected.value,'$.layerId')
        AND f.projectId=json_extract(expected.value,'$.projectId') AND f.organisationId=json_extract(expected.value,'$.organisationId')
        AND o.hubId IS json_extract(expected.value,'$.resourceHubId')))`,
  }
}

/** Adds an exact task fence for a contribution being reviewed as a duplicate.
 * @param ctx Authenticated request. @param command All-feature publisher authority.
 * @param taskId Optional duplicate task. @param ids Inspected identities.
 * @returns Authority fenced to the pending contribution, or unchanged ordinary authority.
 */
async function withDuplicateTask(
  ctx: GuardedBaseContext,
  command: IdentityCommand,
  taskId: string | undefined,
  ids: string[],
): Promise<IdentityCommand> {
  if (!taskId) return command
  const probe = await probeTaskQuery(ctx.db, { ref: taskId })
  if (
    !probe ||
    !authorizeTaskReadForProbe({
      user: ctx.user,
      userRoles: ctx.userRoles,
      isAdminRequest: ctx.isAdminRequest,
      probe,
    }).allowed
  )
    error(403, 'TASK_NOT_AVAILABLE')
  const row = await ctx.db.get<{
    featureId: string
    modifiedAt: string
  }>(sql`SELECT featureId,modifiedAt FROM task
    WHERE id=${taskId} AND type='newFeature' AND isReviewed=0 AND isDraft=0
      AND projectId=${probe.projectId} AND organisationId=${probe.organisationId}`)
  if (!row || !ids.includes(row.featureId))
    error(409, 'Contribution is no longer awaiting review')
  return {
    ...command,
    contributionTaskId: taskId,
    guard: sql`(${command.guard}) AND EXISTS (SELECT 1 FROM task
    WHERE id=${taskId} AND featureId=${row.featureId} AND modifiedAt=${row.modifiedAt} AND type='newFeature' AND isReviewed=0 AND isDraft=0
      AND projectId=${probe.projectId} AND organisationId=${probe.organisationId})`,
  }
}

/** Inspects complete authorized source choices before a merge or split is proposed.
 * @param input Source identities. @returns Exact publication tokens and reviewable content.
 */
export const inspectFeatureIdentity = guardedQuery(
  z.object({
    featureIds: z.array(z.string().min(1)).min(1).max(20),
    duplicateTaskId: z.string().min(1).optional(),
    meta,
  }),
  async (input, ctx) => {
    const command = await withDuplicateTask(
      ctx,
      await scope(ctx, input.featureIds),
      input.duplicateTaskId,
      input.featureIds,
    )
    const result = []
    for (const featureId of input.featureIds) {
      const source = await inspectFeatureIdentitySource(ctx.db, {
        ...command,
        featureId,
      })
      result.push({
        featureId,
        revisionId: source.revisionId,
        generation: source.generation,
        content: source.content,
      })
    }
    return result
  },
)

/** Creates a submitted identity proposal and private reserved children without publication.
 * @param input Inspected inputs, chosen survivor/children and source selectors.
 * @returns Immutable proposal ID for explicit review.
 */
export const proposeFeatureIdentity = guardedCommand(
  FeatureIdentitySelectionSchema.extend({ meta }),
  async (input, ctx) => {
    const command = await scope(
      ctx,
      input.inputs.map(ref => ref.featureId),
    )
    const proposalId = await createFeatureIdentityProposal(ctx.db, {
      ...command,
      selection: input,
    })
    if (!proposalId) error(409, 'STALE_IDENTITY_INPUTS')
    return { proposalId }
  },
)

/** Applies a staff split or merge directly, retaining an immutable operation receipt.
 * @param input Inspected inputs and selected output content.
 * @returns Successor identities for the regular editors.
 * @remarks Acceptance is atomic; staff splits create unpublished children and retire the source.
 */
export const applyFeatureIdentity = guardedCommand(
  FeatureIdentitySelectionSchema.extend({
    duplicateTaskId: z.string().min(1).optional(),
    meta,
  }),
  async (input, ctx) => {
    if (
      input.kind === 'split' &&
      (input.outputs.length !== 2 ||
        input.outputs.some(output => output.featureId !== null))
    )
      error(400, 'A split requires two new Features')
    if (
      input.kind === 'merge' &&
      (input.outputs.length !== 1 ||
        input.outputs[0].featureId !== input.inputs[0]?.featureId)
    )
      error(400, 'A merge must preserve the primary Feature')
    if (input.duplicateTaskId && (input.kind !== 'merge' || input.inputs.length !== 2))
      error(400, 'Duplicate review requires one existing Feature')
    const command = await withDuplicateTask(
      ctx,
      await scope(
        ctx,
        input.inputs.map(ref => ref.featureId),
      ),
      input.duplicateTaskId,
      input.inputs.map(ref => ref.featureId),
    )
    if (await hasFeatureLifecycleStorage(ctx.db)) {
      const completion = input.duplicateTaskId
        ? await prepareLifecycleDuplicateReview(ctx.db, {
            taskId: input.duplicateTaskId,
            featureId: input.inputs[1].featureId,
            actorId: ctx.user.id,
          })
        : undefined
      const result = await applyCurrentFeatureIdentitySelection(ctx.db, {
        ...command,
        selection: input,
        completion,
      })
      if (!result) error(409, 'Feature changed; refresh before applying')
      return result
    }
    const completion = input.duplicateTaskId
      ? await prepareFeatureDuplicateReview(ctx.db, {
          taskId: input.duplicateTaskId,
          featureId: input.inputs[1].featureId,
          actorId: ctx.user.id,
          imageIds: input.outputs[0].images?.map(image => image.imageId) ?? [],
        })
      : []
    const proposalId = await createFeatureIdentityProposal(ctx.db, {
      ...command,
      selection: input,
    })
    if (!proposalId) error(409, 'Feature changed; refresh before applying')
    const proposal = await readFeatureIdentityProposal(ctx.db, proposalId)
    if (!proposal) error(409, 'Operation preparation is unavailable')
    const receipt = await decideFeatureIdentityProposal(ctx.db, {
      ...command,
      proposalId,
      accept: true,
      reason: input.reason,
      relationshipsReviewed: true,
      taskAssignments: [],
      preserveVisibility: true,
      completion,
    })
    if (!receipt) error(409, 'Feature changed; refresh before applying')
    return { receipt, outputs: proposal.plan.outputs.map(output => output.featureId) }
  },
)

/** Lists proposals involving an authorized Feature without exposing foreign-source content.
 * @param input Feature identity. @returns Queue metadata; details require all-source authorization.
 */
export const listFeatureIdentityProposals = guardedQuery(
  z.object({ featureId: z.string().min(1), meta }),
  async (input, ctx) => {
    if (!(await featureIdentityReviewEnabled(ctx.db))) return []
    const command = await scope(ctx, [input.featureId])
    return ctx.db.all<{
      id: string
      kind: string
      actorId: string
      outcome: string | null
    }>(sql`
    SELECT p.id,p.kind,p.actorId,d.outcome FROM featureIdentityProposal p
    LEFT JOIN featureIdentityProposalDecision d ON d.proposalId=p.id
    JOIN revisionChangeSet c ON c.id=p.changeSetId
    WHERE (${command.guard}) AND (EXISTS(SELECT 1 FROM json_each(p.plan,'$.inputs') item WHERE json_extract(item.value,'$.featureId')=${input.featureId})
      OR EXISTS(SELECT 1 FROM json_each(p.plan,'$.outputs') item WHERE json_extract(item.value,'$.featureId')=${input.featureId})) ORDER BY c.createdAt DESC LIMIT 50`)
  },
)

/** Loads every exact output plus relationship counts under current all-source authority.
 * @param input Stored proposal ID. @returns Review evidence with no user relationship identities exposed.
 */
export const reviewFeatureIdentity = guardedQuery(
  z.object({ proposalId: z.string().min(1), meta }),
  async (input, ctx) => {
    const proposal = await readFeatureIdentityProposal(ctx.db, input.proposalId)
    if (!proposal) error(404, 'PROPOSAL_NOT_FOUND')
    const command = await scope(
      ctx,
      proposal.plan.heads.map(head => head.featureId),
    )
    // Current catalogue privacy applies even when viewing an older candidate.
    const access = await getInternalPropertyAccess(ctx)
    const outputs = []
    for (const ref of [...proposal.plan.inputs, ...proposal.plan.outputs]) {
      const row = await ctx.db.get<{
        content: string
      }>(sql`SELECT content FROM featureRevision
      WHERE featureId=${ref.featureId} AND id=${ref.revisionId} AND (${command.guard})`)
      if (!row) error(409, 'STALE_IDENTITY_SCOPE')
      const content = FeatureRevisionContentSchema.parse(JSON.parse(row.content))
      if (
        Object.entries(content.properties).some(
          ([id, value]) =>
            (access.internal.has(id) ||
              value.selection.definition.audience === 'internal') &&
            !access.allowed.has(id),
        )
      )
        error(403, 'PROPERTY_NOT_AVAILABLE')
      outputs.push({
        ...ref,
        role: proposal.plan.inputs.some(source => source.revisionId === ref.revisionId)
          ? 'input'
          : 'output',
        content,
      })
    }
    const relations = JSON.parse(proposal.plan.relations) as {
      tasks: IdentityTaskEvidence[]
      users: { isVisited: number; isWishlisted: number }[]
    }
    return {
      id: proposal.id,
      kind: proposal.kind,
      actorId: proposal.actorId,
      outcome: proposal.outcome,
      reason: proposal.plan.reason,
      records: outputs,
      tasks: relations.tasks
        .filter(task => !task.isReviewed)
        .map(({ id, featureId, type, isDraft }) => ({ id, featureId, type, isDraft })),
      taskAssignments: proposal.taskAssignments,
      relations: {
        openTasks: relations.tasks.filter(task => !task.isReviewed).length,
        completedTasks: relations.tasks.filter(task => task.isReviewed).length,
        visits: relations.users.filter(link => link.isVisited).length,
        wishlists: relations.users.filter(link => link.isWishlisted).length,
      },
    }
  },
)

/** Records an explicit whole-operation decision; acceptance publishes all outputs atomically.
 * @param input Reviewed proposal, reason and explicit relationship acknowledgement and task destinations.
 * @returns Accepted operation or rejection receipt.
 */
export const decideFeatureIdentity = guardedCommand(
  z.object({
    proposalId: z.string().min(1),
    accept: z.boolean(),
    reason: z.string().trim().min(1).max(2000),
    relationshipsReviewed: z.literal(true),
    taskAssignments: FeatureTaskAssignmentsSchema,
    meta,
  }),
  async (input, ctx) => {
    const proposal = await readFeatureIdentityProposal(ctx.db, input.proposalId)
    if (!proposal) error(404, 'PROPOSAL_NOT_FOUND')
    const command = await scope(
      ctx,
      proposal.plan.heads.map(head => head.featureId),
    )
    const receipt = await decideFeatureIdentityProposal(ctx.db, {
      ...command,
      ...input,
    })
    if (!receipt)
      error(409, 'Inputs or relationships changed. Create a fresh proposal for review.')
    return { receipt }
  },
)

/** Resolves public successor links with live visibility and the request's hub scope.
 * @param input Retired Feature identity. @returns Visible successors without private proposal data.
 */
export const getFeatureSuccessors = guardedQuery(
  z.object({ featureId: z.string().min(1) }),
  async (input, ctx) =>
    readPublicFeatureSuccessors(ctx.db, {
      ...input,
      hubId: ctx.event.locals.hub.id ?? null,
      isCore: Boolean(ctx.event.locals.hub.isCore),
    }),
)

/** Lists successor guidance for the session user's retained wishlist links.
 * @param input Page offset; user identity and hub scope are always server-resolved.
 * @returns A bounded page of visible split successors.
 */
export const getSavedFeatureSuccessors = guardedQuery(
  z.object({ offset: z.number().int().min(0).max(100000).default(0) }),
  async (input, ctx) =>
    readSavedFeatureSuccessors(ctx.db, {
      userId: ctx.user.id,
      hubId: ctx.event.locals.hub.id ?? null,
      isCore: Boolean(ctx.event.locals.hub.isCore),
      offset: input.offset,
    }),
)
