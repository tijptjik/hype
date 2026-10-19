// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { authorizeFeatureUpdateForSubmission } from '#lib/api/services/authz/index.js'
// SERVICES
import { probeFeatureQuery } from '#lib/db/services/feature.js'
import {
  listPlaceAdoptionReviews,
  readPlaceAdoptionReview,
  proposeFeaturePlaceAdoption,
  rejectPlaceAdoptionGroup,
} from '#lib/db/services/placeAdoptionReview.js'
import { applyPlaceAdoptionGroup } from '#lib/db/services/placeAdoptionApply.js'
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
 * @returns Persisted project scope; caller-supplied project/actor values are never accepted.
 * @remarks Both groups include non-translation fields; translators cannot review or adopt them.
 */
async function requireReviewer(
  ctx: GuardedBaseContext,
  featureId: string,
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
  return probe.projectId
}

/**
 * List retained source assessments for a Feature the editor can manage.
 * @param input Feature and optional bounded pagination cursor.
 * @returns Newest assessment per candidate, plus the next page cursor.
 */
export const listFeaturePlaceReviews = guardedQuery(
  featureInput.extend({
    beforeRow: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  }),
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    return listPlaceAdoptionReviews(ctx.db, { ...input, projectId })
  },
)

/**
 * Read immutable comparison evidence and all candidate group decisions.
 * @param input Feature and retained proposal identities.
 * @returns Authorized review; unavailable or cross-scope identities return 404.
 */
export const getFeaturePlaceReview = guardedQuery(reviewInput, async (input, ctx) => {
  const projectId = await requireReviewer(ctx, input.featureId)
  const review = await readPlaceAdoptionReview(ctx.db, { ...input, projectId })
  if (!review) error(404, 'PLACE_REVIEW_NOT_FOUND')
  return review
})

/**
 * Explicitly refresh still-pending groups from an existing canonical proposal.
 * @param input Feature and retained proposal identities, never arbitrary source revisions.
 * @returns Retained/new assessment with prior decisions preserved.
 * @remarks Does not import a source, select a publication or reopen completed groups.
 */
export const reevaluateFeaturePlaceReview = guardedCommand(
  reviewInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    const current = await readPlaceAdoptionReview(ctx.db, { ...input, projectId })
    if (!current) error(404, 'PLACE_REVIEW_NOT_FOUND')
    const result = await proposeFeaturePlaceAdoption(ctx.db, {
      featureId: input.featureId,
      projectId,
      candidateRevisionId: current.proposal.candidateRevisionId,
      reevaluatePending: true,
    })
    if (!result) error(409, 'PLACE_REVIEW_CHANGED')
    return result
  },
)

/**
 * Record an explicit rejection for one pending group.
 * @param input Review identity, group, current editor tokens and reason.
 * @returns Immutable decision; stale or already-decided input returns 409.
 */
export const rejectFeaturePlaceReview = guardedCommand(
  decisionInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    const result = await rejectPlaceAdoptionGroup(ctx.db, {
      ...input,
      projectId,
      actorId: ctx.user.id,
    })
    if (!result) error(409, 'PLACE_REVIEW_CHANGED')
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
export const acceptFeaturePlaceReview = guardedCommand(
  decisionInput,
  async (input, ctx) => {
    const projectId = await requireReviewer(ctx, input.featureId)
    const result = await applyPlaceAdoptionGroup(ctx.db, {
      ...input,
      projectId,
      actorId: ctx.user.id,
      mode: 'reviewed',
    })
    if (result.status === 'conflict') error(409, 'PLACE_REVIEW_CHANGED')
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
