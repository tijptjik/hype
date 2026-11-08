// THIRD PARTY
import { polygonToCellsExperimental, POLYGON_TO_CELLS_FLAGS } from 'h3-js'
import { z } from 'zod'
import {
  matchesPlaceSearchFilters,
  placeSearchFilterParams,
} from './placeSearchFilters'
// DOMAIN
import { NearbyPlacesInputSchema } from './discovery'
import { locationDistance } from './searchPresentation'
import type { PlaceSourceClient } from './sourceClient'

const cellPage = z.object({
  places: z
    .array(
      z.object({
        placeId: z.string().min(1),
        resourceReleaseId: z.string().min(1),
        basicCategory: z.string().nullish(),
        operatingStatus: z.string().nullish(),
        taxonomy: z.object({ primary: z.string().nullish() }).nullish(),
        geometry: z.object({
          type: z.literal('Point'),
          coordinates: z.tuple([z.number().finite(), z.number().finite()]),
        }),
      }),
    )
    .max(100),
  meta: z.object({
    page: z.object({
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
      hasMore: z.boolean(),
    }),
  }),
})

export type NearbySourceResult = {
  candidates: z.infer<typeof cellPage>['places']
  partial: boolean
  limited: boolean
}

/** Cover the complete search circle, including cells intersecting its boundary.
 * @param input Validated Hong Kong pin and bounded radius.
 * @returns Resolution-nine cells supported by SaanSeoi's Locations index.
 */
export function nearbyLocationCells(
  input: z.infer<typeof NearbyPlacesInputSchema>,
): string[] {
  const {
    coordinates: [lng, lat],
    radius,
  } = NearbyPlacesInputSchema.parse(input)
  const dy = radius / 110000
  const dx = dy / Math.cos((lat * Math.PI) / 180)
  return polygonToCellsExperimental(
    [
      [lng - dx, lat - dy],
      [lng + dx, lat - dy],
      [lng + dx, lat + dy],
      [lng - dx, lat + dy],
    ],
    9,
    POLYGON_TO_CELLS_FLAGS.containmentOverlapping,
    true,
  )
}

/** Discover nearby source identities without importing or trusting unverified facts.
 * @param client Trusted endpoint, credential and transport.
 * @param input Search pin and radius.
 * @returns Nearest fifty identities and explicit truncation/partial-failure indicators.
 * @remarks Each cell is paginated up to three pages. Details must be verified against
 * canonical publication evidence before display/linking. Upstream failure is never emptiness.
 */
export async function searchNearbySaanSeoiPlaces(
  client: PlaceSourceClient,
  input: z.infer<typeof NearbyPlacesInputSchema>,
): Promise<NearbySourceResult> {
  const query = NearbyPlacesInputSchema.parse(input)
  const cells = nearbyLocationCells(query)
  const deadline = AbortSignal.timeout(30000)
  const found = new Map<string, z.infer<typeof cellPage>['places'][number]>()
  let partial = false
  let limited = false
  let succeeded = 0
  // Bound upstream concurrency and pagination independently of local density.
  for (let index = 0; index < cells.length; index += 4) {
    const group = await Promise.allSettled(
      cells.slice(index, index + 4).map(async cell => {
        for (let page = 0; page < 3; page++) {
          const url = new URL(`/places/v0.1/by-cell/9/${cell}`, client.baseUrl)
          url.search = new URLSearchParams({
            ...placeSearchFilterParams(query.filters),
            region: 'hk',
            limit: '100',
            offset: String(page * 100),
          }).toString()
          const response = await client.fetch(url, {
            headers: { Accept: 'application/json', 'x-api-key': client.apiKey },
            redirect: 'error',
            signal: AbortSignal.any([deadline, AbortSignal.timeout(15000)]),
          })
          if (!response.ok)
            throw new Error(`Nearby Locations failed (${response.status})`)
          const data = cellPage.parse(await response.json())
          if (data.meta.page.offset !== page * 100 || data.meta.page.limit !== 100)
            throw new Error('Nearby Locations pagination changed')
          // Filter before nearest-candidate limits so unrelated places cannot crowd out matches.
          for (const row of data.places)
            if (
              locationDistance(query.coordinates, row.geometry.coordinates) <=
                query.radius &&
              matchesPlaceSearchFilters(query.filters, {
                basicCategory: row.basicCategory,
                taxonomyPrimary: row.taxonomy?.primary,
                operatingStatus: row.operatingStatus,
              })
            )
              found.set(row.placeId, row)
          if (!data.meta.page.hasMore) return
          if (page === 2) limited = true
        }
      }),
    )
    for (const result of group) {
      if (result.status === 'rejected') partial = true
      else succeeded++
    }
  }
  if (!succeeded) throw new Error('Nearby Locations unavailable')
  const candidates = [...found.values()].sort(
    (a, b) =>
      locationDistance(query.coordinates, a.geometry.coordinates) -
        locationDistance(query.coordinates, b.geometry.coordinates) ||
      a.placeId.localeCompare(b.placeId),
  )
  return {
    candidates: candidates.slice(0, 50),
    partial,
    limited: limited || candidates.length > 50,
  }
}
