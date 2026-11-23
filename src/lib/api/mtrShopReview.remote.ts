// SVELTE
import { error } from '@sveltejs/kit'
// VALIDATION
import { z } from 'zod'
// DRIZZLE
import { sql } from 'drizzle-orm'
// API
import { guardedQuery } from './server/guarded'
import { isCoreHubAdmin } from './services/authz/hubPolicy'
// DOMAIN
import { readLocationFacts } from '#lib/locations/factsSnapshot.js'
import brandExceptions from '#lib/locations/mtrShopBrandExceptions.json'

/** Read one station's imported shops and retained identity comparisons for core review.
 * @param input Station code and admin request context.
 * @returns Source shop codes, catalogue associations, occupancy state and candidate review IDs.
 * @remarks Only super admins can access this shared import review; no identity is accepted here.
 */
export const getMtrShopReview = guardedQuery(
  z.object({
    station: z.string().regex(/^[A-Z]{3}$/),
    meta: z.object({ isAdminRequest: z.boolean() }),
  }),
  async (input, ctx) => {
    if (
      !ctx.isAdminRequest ||
      ctx.user.isAnonymous ||
      !(ctx.user.superAdmin === true || isCoreHubAdmin(ctx.userRoles))
    )
      error(403, 'INSUFFICIENT_ROLE')
    const stations = await ctx.db.all<{
      code: string
      name: string
      count: number
    }>(sql`
      SELECT substr(json_extract(r.rawSource,'$.record.properties.shopNumber'),1,3) code,
        json_extract(r.rawSource,'$.record.properties.station') name,count(*) count
      FROM locationCanonicalDraft d JOIN locationRevisionContent r ON r.id=d.locationId||'_draft'
      WHERE d.sourceKey LIKE 'mtr-shop:%' GROUP BY code,name ORDER BY name`)
    const rows = await ctx.db.all<{
      id: string
      ssId: string | null
      facts: string
      code: string
      listingStatus: string
      businessKey: string | null
    }>(sql`
      SELECT l.id,l.ssId,r.facts,json_extract(source.rawSource,'$.record.properties.shopNumber') code,
        json_extract(source.rawSource,'$.record.listingStatus') listingStatus,
        json_extract(source.rawSource,'$.businessKey') businessKey
      FROM locationCanonicalDraft d JOIN location l ON l.id=d.locationId
      JOIN locationRevisionContent source ON source.id=d.locationId||'_draft'
      JOIN locationRevisionContent r ON r.locationId=l.id AND r.version=(SELECT max(version) FROM locationRevision WHERE locationId=l.id)
      WHERE d.sourceKey LIKE 'mtr-shop:%' AND substr(json_extract(source.rawSource,'$.record.properties.shopNumber'),1,3)=${input.station}
      ORDER BY code,l.id`)
    const shops = []
    for (const row of rows) {
      const facts = readLocationFacts(row.facts)
      const brand = facts.brandId
        ? await ctx.db.get<{ code: string; name: string }>(sql`
        SELECT json_extract(r.content,'$.code') code,coalesce(json_extract(r.content,'$.i18n.en.name'),json_extract(r.content,'$.i18n.zh-hant.name')) name
        FROM identityCatalogue c JOIN identityCatalogueRevisionContent r ON r.catalogueId=c.id AND r.version=c.version WHERE c.id=${facts.brandId}`)
        : null
      const occupancies = await ctx.db.all<{
        id: string
        state: string
        containerId: string | null
      }>(sql`
        SELECT id,occupancyState state,containerLocationId containerId FROM locationOccupancyHead
        WHERE establishmentLocationId=${row.id} AND scopeOrganisationId IS NULL AND assertionState='asserted'`)
      const reviews = await ctx.db.all<{
        id: string
        ssId: string
        facts: string
        candidateLocationId: string | null
      }>(sql`
        SELECT id,json_extract(projection,'$.ssId') ssId,json_extract(projection,'$.facts') facts,
          (SELECT l.id FROM location l WHERE l.ssId=json_extract(projection,'$.ssId') AND l.ownerOrganisationId IS NULL AND l.state='linked') candidateLocationId
        FROM locationIdentityReview WHERE locationId=${row.id} AND rejection IS NULL
          AND json_extract(projection,'$.ssId') IS NOT ${row.ssId} ORDER BY createdAt`)
      shops.push({
        id: row.id,
        ssId: row.ssId,
        code: row.code,
        listingStatus: row.listingStatus,
        name: facts.names.en || Object.values(facts.names).find(Boolean) || row.code,
        brand,
        // These exclusions were explicitly decided in the MTR catalogue review, not failed name matches.
        brandDisposition: brand
          ? 'associated'
          : ((brandExceptions as Record<string, { action: string }>)[
              row.businessKey ?? ''
            ]?.action ?? 'unmatched'),
        occupancies,
        reviews: reviews.map(review => {
          const candidate = JSON.parse(review.facts)
          return {
            id: review.id,
            ssId: review.ssId,
            candidateLocationId: review.candidateLocationId,
            name:
              candidate.names.en ||
              Object.values(candidate.names).find(Boolean) ||
              review.ssId,
          }
        }),
      })
    }
    return { stations, shops }
  },
)
