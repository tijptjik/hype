import {
  proposeLocationPlacement,
  decideLocationPlacement,
} from '#lib/db/services/locationPlacement.js'
import { PlacementDecisionSchema } from '#lib/locations/placement.js'
// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
import { authorizeFeatureUpdateForSubmission } from '#lib/api/services/authz/index.js'
// SERVICES
import { probeFeatureQuery } from '#lib/db/services/feature.js'
import {
  listLocationAdoptionReviews,
  readLocationAdoptionReview,
  proposeFeatureLocationAdoption,
  proposeLatestLocalLocationAdoption,
  rejectLocationAdoptionGroup,
} from '#lib/db/services/locationAdoptionReview.js'
import { applyLocationAdoptionGroup } from '#lib/db/services/locationAdoptionApply.js'
import { scheduleFeatureMtr } from '#lib/api/services/feature-mtr.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. REVIEW AUTHORIZATION
// 2. LIST AND READ
// 3. RE-EVALUATION
// 4. GROUP DECISIONS
// ---

const featureInput = z.strictObject({ featureId: z.string().min(1) })
const reviewInput = featureInput.extend({ proposalId: z.string().min(1) })
const decisionInput = reviewInput.extend({
  fieldGroup: z.enum(['facts', 'location']),
  expectedRevision: z.string().min(1),
  expectedFeatureModifiedAt: z.string().min(1),
  reason: z.string().trim().min(1).max(2000),
})

/**
 * Require inherited-field editing permissions before reading source review evidence.
 * @param ctx Authenticated request context.
 * @param featureId Feature whose persisted ancestry determines authorization.
 * @param organisationWide Whether this decision changes every consumer in the Organisation.
 * @returns Persisted project scope; caller-supplied project/actor values are never accepted.
 * @remarks Both groups include non-translation fields; translators cannot review or adopt them.
 */
async function requireReviewer(
  ctx: GuardedBaseContext,
  featureId: string,
  organisationWide = false,
): Promise<string> {
  const probe = await probeFeatureQuery(ctx.db, { ref: featureId, refKey: 'id' })
  if (!probe) error(404, 'FEATURE_NOT_FOUND')
  const decision = authorizeFeatureUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource: probe,
    submittedData: { i18n: true, properties: true, geometry: true, addressMeta: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  if (organisationWide)
    await requireLocationOrganisationManager(ctx, probe.organisationId)
  return probe.projectId
}

/**
 * List retained source assessments for a Feature the editor can manage.
 * @param input Feature and optional bounded pagination cursor.
 * @returns Newest assessment per candidate, plus the next page cursor.
 */
export const listFeatureLocationReviews = guardedQuery(
  featureInput.extend({
    beforeRow: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  }),
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    return listLocationAdoptionReviews(ctx.db, { ...input, projectId })
  },
)

/**
 * Read immutable comparison evidence and all candidate group decisions.
 * @param input Feature and retained proposal identities.
 * @returns Authorized review; unavailable or cross-scope identities return 404.
 */
export const getFeatureLocationReview = guardedQuery(
  reviewInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    const review = await readLocationAdoptionReview(ctx.db, { ...input, projectId })
    if (!review) error(404, 'LOCATION_REVIEW_NOT_FOUND')
    return review
  },
)

/**
 * Explicitly refresh still-pending groups from an existing canonical proposal.
 * @param input Feature and retained proposal identities, never arbitrary source revisions.
 * @returns Retained/new assessment with prior decisions preserved.
 * @remarks Does not import a source, select a publication or reopen completed groups.
 */
export const reevaluateFeatureLocationReview = guardedCommand(
  reviewInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    const current = await readLocationAdoptionReview(ctx.db, { ...input, projectId })
    if (!current) error(404, 'LOCATION_REVIEW_NOT_FOUND')
    if (current.proposal.evidence.placement) {
      const target = current.proposal.evidence.placement
      const proposal = await proposeLocationPlacement(ctx.db, {
        featureId: input.featureId,
        projectId,
        ...(target.kind === 'relocation'
          ? { occupancyRevisionId: target.occupancyRevisionId! }
          : { addressRevisionId: target.addressRevisionId ?? undefined }),
      })
      if (!proposal) error(409, 'LOCATION_REVIEW_CHANGED')
      return readLocationAdoptionReview(ctx.db, {
        ...input,
        projectId,
        proposalId: proposal.id,
      })
    }
    const result = await proposeFeatureLocationAdoption(ctx.db, {
      featureId: input.featureId,
      projectId,
      candidateRevisionId: current.proposal.candidateRevisionId,
      reevaluatePending: true,
    })
    if (!result) error(409, 'LOCATION_REVIEW_CHANGED')
    return result
  },
)

/**
 * Record an explicit rejection for one pending group.
 * @param input Review identity, group, current editor tokens and reason.
 * @returns Immutable decision; stale or already-decided input returns 409.
 */
export const rejectFeatureLocationReview = guardedCommand(
  decisionInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId, true)
    const result = await rejectLocationAdoptionGroup(ctx.db, {
      ...input,
      projectId,
      actorId: ctx.user.id,
    })
    if (!result) error(409, 'LOCATION_REVIEW_CHANGED')
    return result
  },
)

/**
 * Accept one reviewed group with its Feature projection and audit in the same transaction.
 * @param input Review identity, group, current editor tokens and reason.
 * @returns Applied revision; conflicts and incomplete source evidence remain explicit.
 * @remarks Clients cannot request automatic adoption or provide replacement source values.
 * Routing is woken only after a committed geometry change; durable jobs already exist.
 */
export const acceptFeatureLocationReview = guardedCommand(
  decisionInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId, true)
    const result = await applyLocationAdoptionGroup(ctx.db, {
      ...input,
      projectId,
      actorId: ctx.user.id,
      mode: 'reviewed',
    })
    if (result.status === 'conflict') error(409, 'LOCATION_REVIEW_CHANGED')
    if (result.status === 'review') return result
    if (result.geometryChanged)
      scheduleFeatureMtr(ctx.event.locals.platform, result.feature.id)
    return {
      status: result.status,
      revision: result.revision,
      modifiedAt: result.feature.modifiedAt,
    }
  },
)

/**
 * Prepare a review of newer locally authored Location content without accepting it.
 * @param input Feature identity; its current Project scope is resolved server-side.
 * @returns Retained review evidence, or null when already current or not a local Location.
 */
export const reviewLatestLocalLocation = guardedCommand(
  featureInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    return proposeLatestLocalLocationAdoption(ctx.db, { ...input, projectId })
  },
)

/** Decide an occupancy/address review using current Feature authority and persisted ancestry.
 * @param input Exact candidate, editor versions and explicit placement choices.
 * @returns Applied/rejected/deferred result; stale or inaccessible evidence fails closed.
 */
export const decideFeaturePlacement = guardedCommand(
  reviewInput.extend({
    expectedRevision: z.string().min(1),
    expectedFeatureModifiedAt: z.string().min(1),
    reason: z.string().trim().min(1).max(2000),
    decision: PlacementDecisionSchema,
  }),
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    if (!(await readLocationAdoptionReview(ctx.db, { ...input, projectId })))
      error(404, 'LOCATION_REVIEW_NOT_FOUND')
    const result = await decideLocationPlacement(ctx.db, {
      ...input,
      projectId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'LOCATION_REVIEW_CHANGED')
    if (result.status === 'applied' && result.geometryChanged)
      scheduleFeatureMtr(ctx.event.locals.platform, input.featureId)
    return result
  },
)
