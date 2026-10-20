// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. AUTHORIZATION
// - requireIdentityManager
// 2. REVIEW CAPTURE AND READ
// - preparePlaceIdentityReview
// - getPlaceIdentityReview
// 3. REVIEW ACCEPTANCE
// - acceptPlaceIdentityReview
// ---
// SVELTE
import { error } from '@sveltejs/kit'
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
  readPlaceIdentityReview,
  acceptPlaceIdentityReview as persistIdentityReview,
} from '#lib/db/services/placeIdentityReview.js'
// DOMAIN
import { readSaanSeoiPlacePage } from '#lib/places/sourceClient.js'
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
        { baseUrl: 'https://api.saanseoi.hk', apiKey, fetch: ctx.event.fetch },
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
