// SVELTE
import { error } from '@sveltejs/kit'
// REMOTE
import { guardedQuery } from '#lib/api/server/guarded.js'
// DOMAIN
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
    const candidates = await searchSaanSeoiPlaces(client, { ...input, limit: 5 })
    const settled = await Promise.allSettled(
      candidates.map(async candidate => {
        const facts = await readSaanSeoiPlacePreview(client, {
          ssId: candidate.placeId,
          resourceReleaseId: candidate.resourceReleaseId,
        })
        // Discovery can match a brand even when the establishment has no source name.
        const label = candidate.nameText || candidate.brandText
        if (label && !facts.names[candidate.locale])
          facts.names[candidate.locale] = label
        return { id: candidate.placeId, facts }
      }),
    )
    return {
      rows: settled.flatMap(result =>
        result.status === 'fulfilled' ? [result.value] : [],
      ),
      partial: settled.some(result => result.status === 'rejected'),
    }
  },
)
