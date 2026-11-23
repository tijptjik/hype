// TABLE OF CONTENTS
// 1. Application authority
// 2. Shared Location queue
// 3. Canonical candidate review
// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
import { sql } from 'drizzle-orm'
// API
import { guardedQuery, guardedCommand } from './server/guarded'
// SERVICES
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import {
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
} from '#lib/db/services/locationIdentityReview.js'
// DOMAIN
import evidence from '#lib/locations/mtrMatchEvidence.json'
import type {
  MatcherCategory,
  MatcherCounts,
} from '#lib/locations/matcherCategories.js'
import { discoverLocationPublication } from '#lib/locations/publication.js'
import { findSaanSeoiPlace } from '#lib/locations/sourceLookup.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

const meta = z.object({ isAdminRequest: z.literal(true) })
/** Require application-level authority before reading or preparing shared matches.
 * @param ctx Fresh request authority. @returns Nothing when authorized.
 */
function requireMatcherAdmin(ctx: GuardedBaseContext): void {
  if (!ctx.isAdminRequest || ctx.user.isAnonymous || ctx.user.superAdmin !== true)
    error(403, 'INSUFFICIENT_ROLE')
}

/** List the shared MTR comparison cohort, filtered by evidence or accepted identity.
 * @param input Evidence category, literal name/address/code query, optional selected ID and cursor.
 * @returns A bounded page of shared Hype Locations, including imported shops.
 * @remarks No organisation, project or layer selectors are accepted.
 */
export const getLocationMatcherQueue = guardedQuery(
  z.strictObject({
    category: z
      .enum(['all', 'matched', 'exact', 'code', 'name', 'none'])
      .default('all'),
    q: z.string().trim().max(200).optional(),
    id: z.string().min(1).max(200).optional(),
    after: z.string().max(16000).optional(),
    meta,
  }),
  async (input, ctx) => {
    requireMatcherAdmin(ctx)
    // Join retained discovery evidence to current shared identities using one JSON binding.
    const cohort = await ctx.db.all<{
      id: string
      sourceKey: string
      ssId: string | null
    }>(sql`
      SELECT l.id,d.sourceKey,l.ssId FROM locationCanonicalDraft d
      JOIN location l ON l.id=d.locationId
      WHERE d.sourceKey IN (SELECT json_extract(value,'$.sourceKey') FROM json_each(${JSON.stringify(evidence.rows.map(row => ({ sourceKey: row.sourceKey })))}))
        AND l.ownerOrganisationId IS NULL AND l.state IN ('linked','unresolved')`)
    const byKey = new Map(evidence.rows.map(row => [row.sourceKey, row]))
    const counts: MatcherCounts = {
      all: 0,
      matched: 0,
      exact: 0,
      code: 0,
      name: 0,
      none: 0,
    }
    const classified = cohort.map(row => {
      const category: MatcherCategory = row.ssId
        ? 'matched'
        : (byKey.get(row.sourceKey)!.category as MatcherCategory)
      counts.all++
      counts[category]++
      return { ...row, category }
    })
    const ids = classified
      .filter(row => input.category === 'all' || row.category === input.category)
      .map(row => row.id)
    const page = await listLocationResources(ctx.db, {
      ids,
      publication: 'all',
      excludeCanonicalDrafts: false,
      searchAddress: true,
      q: input.q,
      id: input.id,
      after: input.after,
      includeCount: true,
    })
    return {
      ...page,
      counts,
      progress: {
        total: counts.all,
        matched: counts.matched,
        remaining: counts.all - counts.matched,
      },
      evidence: page.data.map(row => {
        const item = classified.find(item => item.id === row.id)
        const retained = item ? byKey.get(item.sourceKey) : undefined
        return {
          locationId: row.id,
          category: item?.category ?? 'none',
          candidates: retained?.candidates ?? [],
        }
      }),
    }
  },
)

/** Freeze an exact upstream candidate for the existing shared identity-review flow.
 * @param input Shared Location, reviewed draft hash, source ID and source release.
 * @returns Immutable comparison ID; accepting or rejecting remains a separate decision.
 * @remarks Never imports a duplicate Location or changes Feature associations.
 */
export const prepareLocationMatcherReview = guardedCommand(
  z.strictObject({
    locationId: z.string().min(1).max(200),
    expectedSourceHash: z.string().min(1).max(200),
    ssId: z.string().min(1).max(200),
    resourceReleaseId: z.string().min(1).max(200),
    meta,
  }),
  async (input, ctx) => {
    requireMatcherAdmin(ctx)
    // Re-read shared draft ownership and content before freezing canonical evidence.
    const target = await listLocationResources(ctx.db, {
      id: input.locationId,
      publication: 'draft',
      excludeCanonicalDrafts: false,
      includeCount: false,
    })
    if (
      target.data.length !== 1 ||
      target.data[0].draftVersion !== input.expectedSourceHash
    )
      error(409, 'LOCATION_IDENTITY_CHANGED')
    const baseline = await readLocationIdentityBaseline(ctx.db, input.locationId, null)
    if (!baseline || baseline.expectedLatestContentHash !== input.expectedSourceHash)
      error(409, 'LOCATION_IDENTITY_CHANGED')
    const env = ctx.event.locals.platform?.env
    const endpoint = locationSourceEndpoint(
      env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY ?? '',
    )
    if (!endpoint.apiKey.trim()) error(503, 'LOCATION_SOURCE_UNAVAILABLE')
    const client = { ...endpoint, fetch: ctx.event.fetch }
    const publication = await discoverLocationPublication(client)
    const found = await findSaanSeoiPlace(client, publication.pin, input.ssId)
    if (!found) error(404, 'LOCATION_SOURCE_NOT_FOUND')
    if (found.projection.releaseId !== input.resourceReleaseId)
      error(409, 'LOCATION_SOURCE_CHANGED')
    const reviewId = await captureLocationIdentityReview(
      ctx.db,
      baseline,
      found.projection,
      ctx.user.id,
    )
    if (!reviewId) error(409, 'LOCATION_IDENTITY_CHANGED')
    return { reviewId }
  },
)
