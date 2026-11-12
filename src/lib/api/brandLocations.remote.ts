// TABLE OF CONTENTS
// 1. Access and provider transport
// 2. Read-only Hype and source discovery
// 3. Explicit import and identity review
// ---
// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// API
import { guardedQuery, guardedCommand } from './server/guarded'
import { requireLocationOrganisationManager } from './services/locationOwnership'
// SERVICES
import { readIdentityCatalogue } from '#lib/db/services/identityCatalogue.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import { persistSaanSeoiPlace } from '#lib/db/services/locationSource.js'
import {
  probeLocationIdentityScope,
  readLocationIdentityBaseline,
  captureLocationIdentityReview,
} from '#lib/db/services/locationIdentityReview.js'
// DOMAIN
import {
  type PlaceSourceClient,
  searchSaanSeoiPlacesPage,
} from '#lib/locations/sourceClient.js'
import { PlaceSearchFiltersSchema } from '#lib/locations/placeSearchFilters.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'
import { discoverLocationPublication } from '#lib/locations/publication.js'
import { findSaanSeoiPlace } from '#lib/locations/sourceLookup.js'
// TYPES
import type { GuardedBaseContext } from './guarded.types'

/** Authorize discovery in an explicit administrative scope.
 * @param ctx Request context. @param organisationId Optional organisation scope.
 * @returns Nothing when authorized; a missing scope never grants global feature visibility.
 */
async function authorize(
  ctx: GuardedBaseContext,
  organisationId?: string,
): Promise<void> {
  if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
  if (ctx.user.superAdmin) return
  if (!organisationId) error(403, 'ORGANISATION_CONTEXT_REQUIRED')
  await requireLocationOrganisationManager(ctx, organisationId)
}

/** Construct the credentialed provider client on the server only.
 * @param ctx Request context. @returns Trusted source client.
 */
function client(ctx: GuardedBaseContext): PlaceSourceClient {
  const env = ctx.event.locals.platform?.env
  const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
  if (!apiKey?.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
  return { ...locationSourceEndpoint(apiKey), fetch: ctx.event.fetch }
}

const scope = z.object({
  brandId: z.string().min(1).max(200),
  organisationId: z.string().min(1).optional(),
})
/** List curated brand Locations with filters applied before pagination.
 * @param input Brand and independent upstream/linked-feature filters.
 * @returns One bounded page of accessible Locations, including community-only branches.
 */
export const getBrandLocations = guardedQuery(
  scope.extend({
    upstream: z.boolean().optional(),
    linkedFeatures: z.boolean().optional(),
    after: z.string().optional(),
    q: z.string().max(200).optional(),
  }),
  async (input, ctx) => {
    await authorize(ctx, input.organisationId)
    return listLocationResources(ctx.db, { ...input, includeCount: false })
  },
)

/** Search source candidates without importing or assigning a catalogue brand.
 * @param input Editable term, category, source cursor and independent presence/usage filters.
 * @returns Name-match candidates and a provider continuation, even when a filtered page is empty.
 * @remarks Provider text search is not a verified brand identity match or an exhaustive branch census.
 */
export const discoverBrandLocations = guardedQuery(
  scope.extend({
    q: z.string().trim().min(1).max(200),
    locale: z.enum(['en', 'zh-hant', 'zh-hans']),
    filters: PlaceSearchFiltersSchema.optional(),
    cursor: z.string().max(8192).optional(),
    hype: z.boolean().optional(),
    linkedFeatures: z.boolean().optional(),
  }),
  async (input, ctx) => {
    await authorize(ctx, input.organisationId)
    const brand = await readIdentityCatalogue(ctx.db, input.brandId)
    if (!brand || brand.kind !== 'brand') error(404, 'BRAND_NOT_FOUND')
    const page = await searchSaanSeoiPlacesPage(client(ctx), {
      q: input.q,
      locale: input.locale,
      filters: input.filters,
      cursor: input.cursor,
      limit: 20,
    })
    const rows = []
    // Resolve each bounded source identity independently: no unbounded SQL parameter lists.
    for (const candidate of page.candidates) {
      const existing = await ctx.db.get<{
        id: string
        linked: number
        brandId: string | null
      }>(sql`SELECT l.id,
      EXISTS(SELECT 1 FROM featureLocation fl JOIN feature f ON f.id=fl.featureId JOIN project p ON p.id=f.projectId WHERE fl.locationId=l.id AND (${input.organisationId ?? null} IS NULL OR p.organisationId=${input.organisationId ?? null})) linked,
      (SELECT CASE WHEN json_extract(corrections,'$.brandId.supersededBy') IS NULL AND json_extract(corrections,'$.brandId.choice.mode')='override' THEN json_extract(corrections,'$.brandId.choice.value') END FROM locationSharedHead WHERE locationId=l.id) brandId
      FROM location l WHERE l.ssId=${candidate.placeId} AND l.state NOT IN ('manual','redirect') LIMIT 1`)
      if (input.hype !== undefined && Boolean(existing) !== input.hype) continue
      if (
        input.linkedFeatures !== undefined &&
        Boolean(existing?.linked) !== input.linkedFeatures
      )
        continue
      rows.push({
        ssId: candidate.placeId,
        resourceReleaseId: candidate.resourceReleaseId,
        name: candidate.nameText ?? candidate.placeId,
        brand: candidate.brandText,
        locationId: existing?.id ?? null,
        linked: Boolean(existing?.linked),
        match:
          existing?.brandId === input.brandId ? ('brand' as const) : ('name' as const),
      })
    }
    return { rows, nextCursor: page.nextCursor }
  },
)

/** Fetch exact canonical evidence and either add it or prepare the existing identity review.
 * @param input Selected source identity/release and optional existing Location target.
 * @returns Stable Location identity or an immutable review awaiting explicit acceptance.
 * @remarks No brand is inferred or assigned, no Feature is created, and repeated imports converge.
 */
export const addBrandLocationCandidate = guardedCommand(
  scope.extend({
    ssId: z.string().min(1).max(200),
    resourceReleaseId: z.string().min(1).max(200),
    locationId: z.string().min(1).optional(),
  }),
  async (input, ctx) => {
    await authorize(ctx, input.organisationId)
    // Canonical shared identity writes retain the existing administrator boundary.
    if (!ctx.user.superAdmin) error(403, 'INSUFFICIENT_ROLE')
    const source = client(ctx)
    const publication = await discoverLocationPublication(source)
    const found = await findSaanSeoiPlace(source, publication.pin, input.ssId)
    if (!found) error(404, 'LOCATION_SOURCE_NOT_FOUND')
    if (
      found.projection.ssId !== input.ssId ||
      found.projection.releaseId !== input.resourceReleaseId
    )
      error(409, 'LOCATION_SOURCE_CHANGED')
    if (input.locationId) {
      const identity = await probeLocationIdentityScope(ctx.db, input.locationId)
      if (
        !identity ||
        identity.ownerOrganisationId !== null ||
        identity.state === 'redirect'
      )
        error(409, 'LOCATION_IDENTITY_CHANGED')
      const baseline = await readLocationIdentityBaseline(
        ctx.db,
        input.locationId,
        null,
      )
      if (!baseline) error(409, 'LOCATION_IDENTITY_CHANGED')
      const reviewId = await captureLocationIdentityReview(
        ctx.db,
        baseline,
        found.projection,
        ctx.user.id,
      )
      if (!reviewId) error(409, 'LOCATION_IDENTITY_CHANGED')
      return { locationId: input.locationId, reviewId }
    }
    const guard = sql`NOT EXISTS(SELECT 1 FROM location WHERE ssId=${input.ssId} AND (ownerOrganisationId IS NOT NULL OR state='redirect'))`
    const retained = await persistSaanSeoiPlace(ctx.db, found.projection, guard)
    const confirmed = await ctx.db.get<{ id: string }>(
      sql`SELECT l.id FROM location l JOIN locationRevision r ON r.locationId=l.id WHERE l.id=${retained.locationId} AND r.id=${retained.revisionId} AND l.ownerOrganisationId IS NULL AND l.state!='redirect'`,
    )
    if (!confirmed) error(409, 'LOCATION_CANDIDATE_UNAVAILABLE')
    return { locationId: confirmed.id, reviewId: null }
  },
)
