// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. AUTHORIZATION
// - requireIdentityManager
// 2. REVIEW CAPTURE AND READ
// - getLocationIdentityReviewAccess
// - prepareLocationIdentityReview
// - prepareMirroredLocationIdentityReview
// - getLocationIdentityReview
// 3. REVIEW ACCEPTANCE
// - acceptLocationIdentityReview
// - rejectLocationIdentityReview
// 4. EXPLICIT MERGE REVIEW
// - prepareLocationMergeReview
// - getLocationMergeReview
// - acceptLocationMergeReview
// ---
// SVELTE
import { error, isHttpError } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// REMOTE
import { guardedCommand, guardedQuery } from '#lib/api/server/guarded.js'
// AUTHORIZATION
import { requireLocationOrganisationManager } from '#lib/api/services/locationOwnership.js'
import { canManageSharedLocationIdentity } from '#lib/api/services/authz/location.js'
// SERVICES
import { rejectLocationIdentityReview as persistIdentityRejection } from '#lib/db/services/locationIdentityRejection.js'
import {
  probeLocationIdentityScope,
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
  captureMirroredLocationIdentityReview,
  readLocationIdentityReview,
  acceptLocationIdentityReview as persistIdentityReview,
} from '#lib/db/services/locationIdentityReview.js'
import {
  probeLocationMergeSource,
  probeLocationMergeReview,
  readLocationMergeReview,
  captureLocationMergeReview,
  applyLocationMergeReview,
} from '#lib/db/services/locationMerge.js'
// DOMAIN
import { readSaanSeoiPlacePage } from '#lib/locations/sourceClient.js'
import { hydrateSaanSeoiPlaceAddress } from '#lib/locations/sourceAddress.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

const identityInput = z.strictObject({ locationId: z.string().min(1).max(200) })
const reviewInput = identityInput.extend({ reviewId: z.string().min(1).max(200) })

// ---
/********************
 *  1. AUTHORIZATION
 ************/
// +++ Authorization
/**
 * Require authority over the Location itself before reading private comparison evidence.
 * @param ctx Authenticated request with current roles.
 * @param locationId Stable Location ID; ownership is always loaded from persistence.
 * @returns Authorized owner scope, null for a shared Location.
 * @remarks Organisation administrators may administer their private Locations. Shared identity changes
 * require a core hub administrator. Feature edit/read authority alone is insufficient.
 */
async function requireIdentityManager(
  ctx: GuardedBaseContext,
  locationId: string,
): Promise<string | null> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  const scope = await probeLocationIdentityScope(ctx.db, locationId)
  if (!scope) error(404, 'LOCATION_NOT_FOUND')
  if (scope.ownerOrganisationId === null) {
    if (
      !canManageSharedLocationIdentity({
        isAnonymous: ctx.user.isAnonymous,
        userRoles: ctx.userRoles,
      })
    )
      error(403, 'INSUFFICIENT_ROLE')
    return null
  }
  await requireLocationOrganisationManager(ctx, scope.ownerOrganisationId)
  return scope.ownerOrganisationId
}

// ---
/********************
 *  2. REVIEW CAPTURE AND READ
 ************/
// +++ Review Capture And Read
/**
 * Determine whether identity review controls belong in this editor.
 * @param input Stable Location ID.
 * @returns Whether current persisted ownership and account roles permit management.
 * @remarks Does not reveal ownership or source facts when access is denied.
 */
export const getLocationIdentityReviewAccess = guardedQuery(
  identityInput,
  async (input, ctx) => {
    try {
      await requireIdentityManager(ctx, input.locationId)
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
 * @param input Stable target Location and exact mirrored source revision.
 * @returns Retained comparison ID, without changing either Location's identity or Feature links.
 * @remarks Authorization and source ownership are rechecked before reading candidate facts.
 */
export const prepareMirroredLocationIdentityReview = guardedCommand(
  identityInput.extend({
    candidateRevisionId: z.string().min(1).max(200),
  }),
  async (input, ctx) => {
    const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
    const baseline = await readLocationIdentityBaseline(
      ctx.db,
      input.locationId,
      ownerOrganisationId,
    )
    if (!baseline) error(409, 'LOCATION_IDENTITY_CHANGED')
    const reviewId = await captureMirroredLocationIdentityReview(
      ctx.db,
      baseline,
      input.candidateRevisionId,
      ctx.user.id,
    )
    if (!reviewId) error(409, 'LOCATION_IDENTITY_CANDIDATE_UNAVAILABLE')
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
export const prepareLocationIdentityReview = guardedCommand(
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
    const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
    const baseline = await readLocationIdentityBaseline(
      ctx.db,
      input.locationId,
      ownerOrganisationId,
    )
    if (!baseline) error(409, 'LOCATION_IDENTITY_CHANGED')
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    if (!apiKey?.trim()) error(503, 'LOCATION_SOURCE_UNAVAILABLE')
    let page: Awaited<ReturnType<typeof readSaanSeoiPlacePage>>
    try {
      page = await readSaanSeoiPlacePage(
        { ...locationSourceEndpoint(apiKey), fetch: ctx.event.fetch },
        input.publication,
        input.sourceOffset,
      )
    } catch {
      error(502, 'LOCATION_SOURCE_FAILED')
    }
    const candidates = page.places.filter(candidate => candidate.ssId === input.ssId)
    if (candidates.length !== 1) error(404, 'LOCATION_SOURCE_NOT_IN_PAGE')
    let projection = candidates[0]
    try {
      projection = await hydrateSaanSeoiPlaceAddress(
        { ...locationSourceEndpoint(apiKey), fetch: ctx.event.fetch },
        projection,
      )
    } catch {
      error(502, 'LOCATION_SOURCE_FAILED')
    }
    const reviewId = await captureLocationIdentityReview(
      ctx.db,
      baseline,
      projection,
      ctx.user.id,
    )
    if (!reviewId) error(409, 'LOCATION_IDENTITY_CHANGED')
    return { reviewId }
  },
)

/**
 * Read projected before/after facts from a retained identity comparison.
 * @param input Location and immutable review identities.
 * @returns Safe comparison including stale state; no raw source payload or other Feature records.
 */
export const getLocationIdentityReview = guardedQuery(
  reviewInput,
  async (input, ctx) => {
    const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
    const review = await readLocationIdentityReview(ctx.db, {
      ...input,
      ownerOrganisationId,
    })
    if (!review) error(404, 'LOCATION_IDENTITY_REVIEW_NOT_FOUND')
    return review
  },
)

// ---
/********************
 *  3. REVIEW ACCEPTANCE
 ************/
// +++ Review Acceptance
/**
 * Accept an explicitly reviewed source identity using only retained server-side evidence.
 * @param input Location/review identities and mandatory review reason.
 * @returns Applied/unchanged or explicit merge-required outcome; stale evidence returns 409.
 * @remarks Reauthorizes current ownership. Actor, baseline, projection and project scope are
 * server-derived. Feature values and accepted facts/location groups are not changed here.
 */
export const acceptLocationIdentityReview = guardedCommand(
  reviewInput.extend({
    reason: z.string().trim().min(1).max(2000),
  }),
  async (input, ctx) => {
    const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
    const result = await persistIdentityReview(ctx.db, {
      ...input,
      ownerOrganisationId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'LOCATION_IDENTITY_CHANGED')
    return result
  },
)

/**
 * Retain a negative establishment decision with current Location management authority.
 * @param input Retained comparison and mandatory reason.
 * @returns Rejected outcome; stale or already accepted comparisons return 409.
 * @remarks Actor and ownership are server-derived. No Location or Feature facts change.
 */
export const rejectLocationIdentityReview = guardedCommand(
  reviewInput.extend({ reason: z.string().trim().min(1).max(2000) }),
  async (input, ctx) => {
    const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
    const result = await persistIdentityRejection(ctx.db, {
      ...input,
      ownerOrganisationId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'LOCATION_IDENTITY_CHANGED')
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
 * @param input Target Location and the identity comparison already shown to its manager.
 * @returns Captured impact identity/count or a privacy incompatibility, never an automatic merge.
 * @remarks The source Location comes from persisted evidence. Client-supplied scopes are rejected.
 */
export const prepareLocationMergeReview = guardedCommand(
  identityInput.extend({ identityReviewId: z.string().min(1).max(200) }),
  async (input, ctx) => {
    const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
    const source = await probeLocationMergeSource(ctx.db, {
      ...input,
      ownerOrganisationId,
    })
    if (!source) error(409, 'LOCATION_MERGE_CHANGED')
    const sourceOwnerOrganisationId = await requireIdentityManager(
      ctx,
      source.sourceLocationId,
    )
    const result = await captureLocationMergeReview(ctx.db, {
      ...input,
      ...source,
      ownerOrganisationId,
      sourceOwnerOrganisationId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'LOCATION_MERGE_CHANGED')
    return result
  },
)

/**
 * Read saved merge impact after reauthorizing the current owners of both Locations.
 * @param input Target Location and immutable merge comparison ID.
 * @returns Affected count, retained visibility and stale/applied state, without private Feature data.
 */
export const getLocationMergeReview = guardedQuery(reviewInput, async (input, ctx) => {
  const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
  const source = await probeLocationMergeReview(ctx.db, input)
  if (!source) error(404, 'LOCATION_MERGE_REVIEW_NOT_FOUND')
  const sourceOwnerOrganisationId = await requireIdentityManager(
    ctx,
    source.sourceLocationId,
  )
  const result = await readLocationMergeReview(ctx.db, {
    ...input,
    ...source,
    ownerOrganisationId,
    sourceOwnerOrganisationId,
  })
  if (!result) error(409, 'LOCATION_MERGE_CHANGED')
  return result
})

/**
 * Confirm the separately reviewed merge without changing Feature facts or overrides.
 * @param input Target, merge comparison and required explicit merge reason.
 * @returns Applied receipt/count; stale state returns 409 with no partial writes.
 * @remarks Reauthorizes BOTH identities on every submission. Scope, source and actor are server-derived.
 */
export const acceptLocationMergeReview = guardedCommand(
  reviewInput.extend({ reason: z.string().trim().min(1).max(2000) }),
  async (input, ctx) => {
    const ownerOrganisationId = await requireIdentityManager(ctx, input.locationId)
    const source = await probeLocationMergeReview(ctx.db, input)
    if (!source) error(404, 'LOCATION_MERGE_REVIEW_NOT_FOUND')
    const sourceOwnerOrganisationId = await requireIdentityManager(
      ctx,
      source.sourceLocationId,
    )
    const result = await applyLocationMergeReview(ctx.db, {
      ...input,
      ...source,
      ownerOrganisationId,
      sourceOwnerOrganisationId,
      actorId: ctx.user.id,
    })
    if (result.status === 'conflict') error(409, 'LOCATION_MERGE_CHANGED')
    return result
  },
)
