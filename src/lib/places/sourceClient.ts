// VALIDATION
import { z } from 'zod'
// DOMAIN
import { projectSaanSeoiPlace } from './saanseoi'
// TYPES
import type { SaanSeoiPlaceProjection } from './saanseoi'

export type PlacePublicationPin = {
  releaseSet: string
  catalogRevision: string
  knownAt: string
}
export type PlaceSourceClient = {
  baseUrl: string
  apiKey: string
  fetch: typeof fetch
}

export const PlaceSearchInputSchema = z.strictObject({
  q: z.string().trim().min(1).max(200),
  locale: z.enum(['en', 'zh-hant', 'zh-hans']).optional(),
  limit: z.number().int().min(1).max(20).default(10),
})
const searchResultSchema = z.object({
  placeId: z.string().min(1),
  resourceReleaseId: z.string().min(1),
  locale: z.string().min(1),
  nameText: z.string().nullable(),
  brandText: z.string().nullable(),
})
export type PlaceSearchCandidate = z.infer<typeof searchResultSchema>

/**
 * Discover candidates across SaanSeoi's latest published Hong Kong Places index.
 * @param client Trusted server endpoint, credential and request transport.
 * @param input Bounded text query and optional preferred locale.
 * @returns Ranked discovery candidates, not canonical Place revisions.
 * @remarks Search supplies no geometry or publication pin. Results must be resolved
 * against canonical source evidence before import/linking; never pass them to ingestion.
 * Redirects are rejected so credentials cannot follow an upstream redirect.
 */
export async function searchSaanSeoiPlaces(
  client: PlaceSourceClient,
  input: z.input<typeof PlaceSearchInputSchema>,
): Promise<PlaceSearchCandidate[]> {
  const query = PlaceSearchInputSchema.parse(input)
  const url = new URL('/places/v0.1/search', client.baseUrl)
  url.search = new URLSearchParams({
    q: query.q,
    region: 'hk',
    limit: String(query.limit),
    ...(query.locale ? { locale: query.locale } : {}),
  }).toString()
  const response = await client.fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok)
    throw new Error(`SaanSeoi Places search failed (${response.status})`)
  // Reject contract drift rather than passing arbitrary upstream records to the UI.
  return z
    .object({ results: z.array(searchResultSchema).max(query.limit) })
    .parse(await response.json()).results
}
const pageSchema = z.object({
  data: z.array(
    z
      .object({
        id: z.string().min(1),
        attributes: z.object({ snapshotId: z.string().min(1) }),
      })
      .passthrough(),
  ),
  meta: z
    .object({
      apiReleaseSet: z.string().min(1),
      apiCatalogRevision: z.string().min(1),
      page: z.object({
        offset: z.number().int().nonnegative(),
        limit: z.number().int().positive(),
        total: z.number().int().nonnegative().optional(),
        hasMore: z.boolean().optional(),
      }),
    })
    .passthrough(),
})

/**
 * Fetch one bounded canonical Place page from a fixed publication checkpoint.
 * @param client Trusted server endpoint, credential and request implementation.
 * @param pin Immutable publication selection, retained across every page and retry.
 * @param offset Next offset from the last successfully persisted page.
 * @param filters Optional canonical category or Division restriction, unchanged across pages.
 * @returns Verified projections, total count and the next offset (null only when complete).
 * @remarks Latest-only search/detail results are never used as canonical snapshots.
 * Credentials are sent only to the configured endpoint, with redirects rejected.
 * Callers persist their checkpoint only after storing every projection in the page.
 */
export async function readSaanSeoiPlacePage(
  client: PlaceSourceClient,
  pin: PlacePublicationPin,
  offset = 0,
  filters: { basicCategory?: string; taxonomyPrimary?: string; division?: string } = {},
): Promise<{
  places: SaanSeoiPlaceProjection[]
  total: number | null
  nextOffset: number | null
}> {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !pin.releaseSet ||
    !pin.catalogRevision ||
    !Number.isFinite(Date.parse(pin.knownAt))
  )
    throw new Error('Invalid Place publication checkpoint')
  const url = new URL('/places/v0.1', client.baseUrl)
  url.search = new URLSearchParams({
    releaseSet: pin.releaseSet,
    catalogRevision: pin.catalogRevision,
    knownAt: pin.knownAt,
    profile: 'full',
    locales: 'en,zh-hant,zh-hans',
    'page[limit]': '100',
    'page[offset]': String(offset),
    ...(filters.basicCategory
      ? { 'filter[basicCategory]': filters.basicCategory }
      : {}),
    ...(filters.taxonomyPrimary
      ? { 'filter[taxonomyPrimary]': filters.taxonomyPrimary }
      : {}),
    ...(filters.division ? { 'filter[division]': filters.division } : {}),
  }).toString()
  const response = await client.fetch(url, {
    headers: { Accept: 'application/vnd.api+json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok)
    throw new Error(`SaanSeoi Places request failed (${response.status})`)
  const document: unknown = await response.json()
  const parsed = pageSchema.parse(document)
  const page = parsed.meta.page
  const nextOffset = offset + parsed.data.length
  const hasMore = page.total === undefined ? page.hasMore : nextOffset < page.total
  // Historical collections report hasMore rather than computing a full total.
  // Reject inconsistent pagination instead of declaring an incomplete export successful.
  if (
    parsed.meta.apiReleaseSet !== pin.releaseSet ||
    parsed.meta.apiCatalogRevision !== pin.catalogRevision ||
    page.offset !== offset ||
    page.limit !== 100 ||
    parsed.data.length > page.limit ||
    hasMore === undefined ||
    (page.total !== undefined && nextOffset > page.total) ||
    (page.hasMore !== undefined && page.hasMore !== hasMore) ||
    (parsed.data.length === 0 && hasMore) ||
    new Set(parsed.data.map(row => row.id)).size !== parsed.data.length
  )
    throw new Error(
      'Place page does not match its publication checkpoint or pagination',
    )
  const raw = document as { data: unknown[]; meta: unknown }
  return {
    places: raw.data.map((resource, index) =>
      projectSaanSeoiPlace(resource, raw.meta, {
        apiReleaseSet: pin.releaseSet,
        snapshotId: parsed.data[index].attributes.snapshotId,
      }),
    ),
    total: page.total ?? null,
    nextOffset: hasMore ? nextOffset : null,
  }
}
