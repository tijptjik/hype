// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. AUTHORIZATION
// - requireIdentityManager
// 2. REVIEW CAPTURE AND READ
// - getPlaceIdentityReviewAccess
// - preparePlaceIdentityReview
// - prepareMirroredPlaceIdentityReview
// - getPlaceIdentityReview
// 3. REVIEW ACCEPTANCE
// - acceptPlaceIdentityReview
// 4. EXPLICIT MERGE REVIEW
// - preparePlaceMergeReview
// - getPlaceMergeReview
// - acceptPlaceMergeReview
// ---
// SVELTE
import { error, isHttpError } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { authorizeProjectUpdateForSubmission } from '#lib/api/services/authz/index.js'
import { canManageSharedPlaceIdentity } from '#lib/api/services/authz/place.js'
// SERVICES
import { probeProjectQuery } from '#lib/db/services/project.js'
import {
  probePlaceIdentityScope,
  readPlaceIdentityBaseline,
  capturePlaceIdentityReview,
  captureMirroredPlaceIdentityReview,
  readPlaceIdentityReview,
  acceptPlaceIdentityReview as persistIdentityReview,
} from '#lib/db/services/placeIdentityReview.js'
import {
  probePlaceMergeSource,
  probePlaceMergeReview,
  readPlaceMergeReview,
  capturePlaceMergeReview,
  applyPlaceMergeReview,
} from '#lib/db/services/placeMerge.js'
// DOMAIN
import { readSaanSeoiPlacePage } from '#lib/places/sourceClient.js'
import { placeSourceEndpoint } from '#lib/places/sourceEndpoint.server.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

const identityInput = z.strictObject({ placeId: z.string().min(1).max(200) })
const reviewInput = identityInput.extend({ reviewId: z.string().min(1).max(200) })

// ---
/********************
 *  1. AUTHORIZATION
 ************/
// +++ Authorization
/**
 * Require authority over the Place itself before reading private comparison evidence.
 * @param ctx Authenticated request with current roles.
 * @param placeId Stable Place ID; ownership is always loaded from persistence.
 * @returns Authorized owner scope, null for a shared Place.
 * @remarks Project managers may administer their private Places. Shared identity changes
 * require a core hub administrator. Feature edit/read authority alone is insufficient.
 */
async function requireIdentityManager(
  ctx: GuardedBaseContext,
  placeId: string,
): Promise<string | null> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  const scope = await probePlaceIdentityScope(ctx.db, placeId)
  if (!scope) error(404, 'PLACE_NOT_FOUND')
  if (scope.ownerProjectId === null) {
    if (
      !canManageSharedPlaceIdentity({
        isAnonymous: ctx.user.isAnonymous,
        userRoles: ctx.userRoles,
      })
    )
      error(403, 'INSUFFICIENT_ROLE')
    return null
  }
  const probe = await probeProjectQuery(ctx.db, {
    ref: scope.ownerProjectId,
    refKey: 'id',
  })
  if (!probe) error(404, 'PROJECT_NOT_FOUND')
  const decision = authorizeProjectUpdateForSubmission({
    user: ctx.user,
    userRoles: ctx.userRoles,
    resource: probe,
    submittedData: { placeUpdatePolicy: true },
  })
  if (!decision.allowed) error(403, decision.code ?? 'INSUFFICIENT_ROLE')
  return scope.ownerProjectId
}

// ---
/********************
 *  2. REVIEW CAPTURE AND READ
 ************/
// +++ Review Capture And Read
/**
 * Determine whether identity review controls belong in this editor.
 * @param input Stable Place ID.
 * @returns Whether current persisted ownership and account roles permit management.
 * @remarks Does not reveal ownership or source facts when access is denied.
 */
export const getPlaceIdentityReviewAccess = guardedQuery(
  identityInput,
  async (input, ctx) => {
    try {
      await requireIdentityManager(ctx, input.placeId)
      return { allowed: true }
    } catch (cause) {
      if (isHttpError(cause) && (cause.status === 403 || cause.status === 404))
        return { allowed: false }
      throw cause
    }
  },
)

/**
 * Prepare the canonical candidate selected from the Feature editor's source search.
 * @param input Stable target Place and exact mirrored source revision.
 * @returns Retained comparison ID, without changing either Place's identity or Feature links.
 * @remarks Authorization and source ownership are rechecked before reading candidate facts.
 */
export const prepareMirroredPlaceIdentityReview = guardedCommand(
  identityInput.extend({
    candidateRevisionId: z.string().min(1).max(200),
  }),
  async (input, ctx) => {
    const ownerProjectId = await requireIdentityManager(ctx, input.placeId)
    const baseline = await readPlaceIdentityBaseline(
      ctx.db,
      input.placeId,
      ownerProjectId,
    )
    if (!baseline) error(409, 'PLACE_IDENTITY_CHANGED')
    const reviewId = await captureMirroredPlaceIdentityReview(
      ctx.db,
      baseline,
      input.candidateRevisionId,
      ctx.user.id,
    )
    if (!reviewId) error(409, 'PLACE_IDENTITY_CANDIDATE_UNAVAILABLE')
    return { reviewId }
  },
)

/**
 * Retain one candidate from a verified pinned collection page for explicit identity review.
 * @param input Target identity and bounded source-page selectors; never client facts or URLs.
 * @returns Immutable review ID; source matching does not claim or merge an identity.
 * @remarks Source discovery supplies IDs only. Exact source record and publication are
 * fetched server-side, then frozen before presentation; unavailable sources are explicit errors.
 */
export const preparePlaceIdentityReview = guardedCommand(
  identityInput.extend({
    ssId: z.string().min(1).max(200),
    publication: z.strictObject({
      releaseSet: z.string().min(1).max(200),
      catalogRevision: z.string().min(1).max(200),
      knownAt: z.string().datetime({ offset: true }),
    }),
    sourceOffset: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 100),
  }),
  async (input, ctx) => {
    const ownerProjectId = await requireIdentityManager(ctx, input.placeId)
    const baseline = await readPlaceIdentityBaseline(
      ctx.db,
      input.placeId,
      ownerProjectId,
    )
    if (!baseline) error(409, 'PLACE_IDENTITY_CHANGED')
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    if (!apiKey?.trim()) error(503, 'PLACE_SOURCE_UNAVAILABLE')
    let page: Awaited<ReturnType<typeof readSaanSeoiPlacePage>>
    try {
      page = await readSaanSeoiPlacePage(
        { ...placeSourceEndpoint(apiKey), fetch: ctx.event.fetch },
        input.publication,
        input.sourceOffset,
      )
    } catch {
      error(502, 'PLACE_SOURCE_FAILED')
    }
    const candidates = page.places.filter(candidate => candidate.ssId === input.ssId)
    if (candidates.length !== 1) error(404, 'PLACE_SOURCE_NOT_IN_PAGE')
    const reviewId = await capturePlaceIdentityReview(
      ctx.db,
      baseline,
      candidates[0],
      ctx.user.id,
    )
    if (!reviewId) error(409, 'PLACE_IDENTITY_CHANGED')
    return { reviewId }
  },
)

/**
 * Read projected before/after facts from a retained identity comparison.
 * @param input Place and immutable review identities.
 * @returns Safe comparison including stale state; no raw source payload or other Feature records.
 */
export const getPlaceIdentityReview = guardedQuery(reviewInput, async (input, ctx) => {
  const ownerProjectId = await requireIdentityManager(ctx, input.placeId)
  const review = await readPlaceIdentityReview(ctx.db, { ...input, ownerProjectId })
  if (!review) error(404, 'PLACE_IDENTITY_REVIEW_NOT_FOUND')
  return review
})

// ---
/********************
 *  3. REVIEW ACCEPTANCE
 ************/
// +++ Review Acceptance
/**
 * Accept an explicitly reviewed source identity using only retained server-side evidence.
 * @param input Place/review identities and mandatory review reason.
 * @returns Applied/unchanged or explicit merge-required outcome; stale evidence returns 409.
 * @remarks Reauthorizes current ownership. Actor, baseline, projection and project scope are
 * server-derived. Feature values and accepted facts/location groups are not changed here.
 */
export const acceptPlaceIdentityReview = guardedCommand(
  reviewInput.extend({
    reason: z.string().trim().min(1).max(2000),
  }),
  async (input, ctx) => {
    const ownerProjectId = await requireIdentityManager(ctx, input.placeId)
    const result = await persistIdentityReview(ctx.db, {
      ...input,
      ownerProjectId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'PLACE_IDENTITY_CHANGED')
    return result
  },
)

// ---
/********************
 *  4. EXPLICIT MERGE REVIEW
 ************/
// +++ Explicit Merge Review
/**
 * Prepare an explicit merge impact after independently authorizing both retained identities.
 * @param input Target Place and the identity comparison already shown to its manager.
 * @returns Captured impact identity/count or a privacy incompatibility, never an automatic merge.
 * @remarks The source Place comes from persisted evidence. Client-supplied scopes are rejected.
 */
export const preparePlaceMergeReview = guardedCommand(
  identityInput.extend({ identityReviewId: z.string().min(1).max(200) }),
  async (input, ctx) => {
    const ownerProjectId = await requireIdentityManager(ctx, input.placeId)
    const source = await probePlaceMergeSource(ctx.db, { ...input, ownerProjectId })
    if (!source) error(409, 'PLACE_MERGE_CHANGED')
    const sourceOwnerProjectId = await requireIdentityManager(ctx, source.sourcePlaceId)
    const result = await capturePlaceMergeReview(ctx.db, {
      ...input,
      ...source,
      ownerProjectId,
      sourceOwnerProjectId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'PLACE_MERGE_CHANGED')
    return result
  },
)

/**
 * Read saved merge impact after reauthorizing the current owners of both Places.
 * @param input Target Place and immutable merge comparison ID.
 * @returns Affected count, retained visibility and stale/applied state, without private Feature data.
 */
export const getPlaceMergeReview = guardedQuery(reviewInput, async (input, ctx) => {
  const ownerProjectId = await requireIdentityManager(ctx, input.placeId)
  const source = await probePlaceMergeReview(ctx.db, input)
  if (!source) error(404, 'PLACE_MERGE_REVIEW_NOT_FOUND')
  const sourceOwnerProjectId = await requireIdentityManager(ctx, source.sourcePlaceId)
  const result = await readPlaceMergeReview(ctx.db, {
    ...input,
    ...source,
    ownerProjectId,
    sourceOwnerProjectId,
  })
  if (!result) error(409, 'PLACE_MERGE_CHANGED')
  return result
})

/**
 * Confirm the separately reviewed merge without changing Feature facts or overrides.
 * @param input Target, merge comparison and required explicit merge reason.
 * @returns Applied receipt/count; stale state returns 409 with no partial writes.
 * @remarks Reauthorizes BOTH identities on every submission. Scope, source and actor are server-derived.
 */
export const acceptPlaceMergeReview = guardedCommand(
  reviewInput.extend({ reason: z.string().trim().min(1).max(2000) }),
  async (input, ctx) => {
    const ownerProjectId = await requireIdentityManager(ctx, input.placeId)
    const source = await probePlaceMergeReview(ctx.db, input)
    if (!source) error(404, 'PLACE_MERGE_REVIEW_NOT_FOUND')
    const sourceOwnerProjectId = await requireIdentityManager(ctx, source.sourcePlaceId)
    const result = await applyPlaceMergeReview(ctx.db, {
      ...input,
      ...source,
      ownerProjectId,
      sourceOwnerProjectId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'PLACE_MERGE_CHANGED')
    return result
  },
)
