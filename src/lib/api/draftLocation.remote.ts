// TABLE OF CONTENTS
// 1. Text discovery previews
// 2. Nearby discovery previews

// SVELTE
import { error } from '@sveltejs/kit'
import { matchesPlaceSearchFilters } from '#lib/locations/placeSearchFilters.js'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// DOMAIN
import { NearbyPlacesInputSchema } from '#lib/locations/discovery.js'
import { searchNearbySaanSeoiPlaces } from '#lib/locations/nearbySource.js'
import {
  PlaceSearchInputSchema,
  searchSaanSeoiPlaces,
} from '#lib/locations/sourceClient.js'
import { readSaanSeoiPlacePreview } from '#lib/locations/sourcePreview.js'
import { locationSourceEndpoint } from '#lib/locations/sourceEndpoint.server.js'

/** Search public Place previews before a Feature has an identity.
 * @param input Bounded search text and display locale.
 * @returns Read-only facts and explicit partial coverage when a preview fails.
 * @remarks Requires an account; creates no Location or Feature association.
 */
export const searchDraftLocations = guardedQuery(
  PlaceSearchInputSchema,
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const env = ctx.event.locals.platform?.env
    const apiKey = env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY
    const endpoint = locationSourceEndpoint(apiKey ?? '')
    if (!endpoint.apiKey.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    const client = { ...endpoint, fetch: ctx.event.fetch }
    const candidates = await searchSaanSeoiPlaces(client, { ...input, limit: 20 })
    const settled = await Promise.allSettled(
      candidates.map(async candidate => {
        const facts = await readSaanSeoiPlacePreview(client, {
          ssId: candidate.placeId,
          resourceReleaseId: candidate.resourceReleaseId,
        })
        // Discovery can match a brand even when the establishment has no source name.
        const label = candidate.nameText?.trim() || candidate.brandText?.trim()
        if (label && !facts.names[candidate.locale]?.trim())
          facts.names[candidate.locale] = label
        return {
          id: candidate.placeId,
          resourceReleaseId: candidate.resourceReleaseId,
          facts,
        }
      }),
    )
    return {
      rows: settled.flatMap(result =>
        result.status === 'fulfilled' &&
        matchesPlaceSearchFilters(
          input.filters,
          result.value.facts.searchClassification ?? {},
        )
          ? [result.value]
          : [],
      ),
      partial: settled.some(result => result.status === 'rejected'),
      limited: candidates.length === 20,
    }
  },
)

/** Discover bounded public Place previews around an unsaved Feature pin.
 * @param input Current coordinates and radius in metres.
 * @returns Read-only source previews and explicit incomplete coverage.
 * @remarks Requires an account; does not read private Locations or create associations.
 */
export const searchNearbyDraftLocations = guardedQuery(
  NearbyPlacesInputSchema,
  async (input, ctx) => {
    if (ctx.user.isAnonymous) error(403, 'ACCOUNT_REQUIRED')
    const env = ctx.event.locals.platform?.env
    const endpoint = locationSourceEndpoint(
      env?.SAANSEOI_API_KEY ?? env?.VITE_SAANSEOI_API_KEY ?? '',
    )
    if (!endpoint.apiKey.trim()) error(503, 'LOCATION_SEARCH_UNAVAILABLE')
    const client = { ...endpoint, fetch: ctx.event.fetch }
    const found = await searchNearbySaanSeoiPlaces(client, input)
    // Bound preview fan-out; propagate truncation instead of implying complete coverage.
    const settled = await Promise.allSettled(
      found.candidates.slice(0, 20).map(async candidate => ({
        id: candidate.placeId,
        resourceReleaseId: candidate.resourceReleaseId,
        facts: await readSaanSeoiPlacePreview(client, {
          ssId: candidate.placeId,
          resourceReleaseId: candidate.resourceReleaseId,
        }),
      })),
    )
    return {
      rows: settled.flatMap(result =>
        result.status === 'fulfilled' &&
        matchesPlaceSearchFilters(
          input.filters,
          result.value.facts.searchClassification ?? {},
        )
          ? [result.value]
          : [],
      ),
      partial: found.partial || settled.some(result => result.status === 'rejected'),
      limited: found.limited || found.candidates.length > 20,
    }
  },
)
