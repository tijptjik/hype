// VALIDATION
import { z } from 'zod'
import {
  PlaceSearchFiltersSchema,
  hasPlaceSearchCategory,
  placeSearchFilterParams,
} from './placeSearchFilters'
// DOMAIN
import { projectSaanSeoiPlace } from './saanseoi'
import { placeTaxonomyPath } from './placeTaxonomy'
// TYPES
import type { SaanSeoiPlaceProjection } from './saanseoi'
import type { PlaceTaxonomyNode } from './placeTaxonomy'

export type LocationPublicationPin = {
  releaseSet: string
  catalogRevision: string
  knownAt: string
}
export type PlaceSourceClient = {
  baseUrl: string
  apiKey: string
  fetch: typeof fetch
}

export const PlaceSearchInputSchema = z
  .strictObject({
    filters: PlaceSearchFiltersSchema.optional(),
    q: z.string().trim().max(200),
    locale: z.enum(['en', 'zh-hant', 'zh-hans']).optional(),
    limit: z.number().int().min(1).max(20).default(10),
  })
  .refine(input => Boolean(input.q) || hasPlaceSearchCategory(input.filters), {
    path: ['q'],
    message: 'Enter search text or select a category',
  })
const searchResultSchema = z.object({
  placeId: z.string().min(1),
  resourceReleaseId: z.string().min(1),
  locale: z.string().min(1),
  nameText: z.string().nullable(),
  brandText: z.string().nullable(),
})
export type LocationSearchCandidate = z.infer<typeof searchResultSchema> & {
  /** HYPE-owned review metadata; never accepted from the upstream search rawSource. */
  previouslyRejected?: boolean
}

/** Enumerate the selected branch for the collection API's exact primary filter.
 * @param node Selected taxonomy node, including any descendant categories.
 * @returns Category identifiers in stable publisher order, including the parent.
 */
function categoryNames(node: PlaceTaxonomyNode): string[] {
  return [node.name, ...(node.children ?? []).flatMap(categoryNames)]
}

export const PlaceSearchPageInputSchema = PlaceSearchInputSchema.safeExtend({
  cursor: z.string().max(8192).optional(),
})
export type PlaceSearchPage = {
  candidates: LocationSearchCandidate[]
  nextCursor: string | null
}
export class PlaceSearchPageError extends Error {
  constructor(public readonly status: number) {
    super(`SaanSeoi Places search failed (${status})`)
  }
}
const categoryCursorSchema = z.strictObject({
  key: z.string(),
  index: z.number().int().nonnegative(),
  offset: z.number().int().nonnegative(),
  pin: z.strictObject({
    releaseSet: z.string().min(1),
    catalogRevision: z.string().min(1),
    knownAt: z.string().min(1),
  }),
})
const categoryCollectionSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1),
        attributes: z.object({
          resourceReleaseId: z.string().min(1),
          i18n: z
            .record(
              z.string(),
              z.object({ name: z.string().nullish(), brandName: z.string().nullish() }),
            )
            .optional(),
        }),
      }),
    )
    .max(20),
  meta: z.object({
    apiReleaseSet: z.string().min(1),
    apiCatalogRevision: z.string().min(1),
    catalogPublishedAt: z.string().min(1),
    page: z.object({
      offset: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      total: z.number().int().nonnegative().optional(),
      hasMore: z.boolean().optional(),
    }),
  }),
})

/** Read a bounded category slice, retaining the collection publication across pages.
 * @param client Trusted source transport and credentials.
 * @param query Validated category-only query and opaque continuation.
 * @returns Source identities and the next category/offset position, never an invented total.
 * @remarks Exact category filters precede limits. Sparse branches advance at most four
 * collection pages per call; an empty slice may still have a continuation.
 */
async function browseSaanSeoiPlacesPage(
  client: PlaceSourceClient,
  query: z.output<typeof PlaceSearchPageInputSchema>,
): Promise<PlaceSearchPage> {
  const category = query.filters?.taxonomyCategory
  const node = category ? placeTaxonomyPath(category).at(-1) : undefined
  const categories = query.filters?.taxonomyPrimary
    ? [query.filters.taxonomyPrimary]
    : node
      ? categoryNames(node)
      : [category]
  const key = JSON.stringify([query.q, query.locale ?? 'en', query.filters ?? {}])
  let index = 0,
    offset = 0
  let pin: LocationPublicationPin | undefined
  if (query.cursor) {
    try {
      const cursor = categoryCursorSchema.parse(
        JSON.parse(decodeURIComponent(query.cursor)),
      )
      if (cursor.key !== key || cursor.index >= categories.length)
        throw new Error('Changed query')
      ;({ index, offset, pin } = cursor)
    } catch {
      throw new PlaceSearchPageError(410)
    }
  }
  const candidates: LocationSearchCandidate[] = []
  const signal = AbortSignal.timeout(30_000)
  const locale = query.locale ?? 'en'
  // Read sequentially so one cursor owns every consumed category and offset.
  for (
    let reads = 0;
    reads < 4 && index < categories.length && candidates.length < query.limit;
    reads++
  ) {
    const limit = query.limit - candidates.length
    const primary = categories[index]
    const url = new URL('/places/v0.1', client.baseUrl)
    url.search = new URLSearchParams({
      ...placeSearchFilterParams(query.filters),
      ...(primary ? { 'filter[taxonomyPrimary]': primary } : {}),
      ...(pin ?? {}),
      region: 'hk',
      profile: 'full',
      locales: locale,
      'page[limit]': String(limit),
      'page[offset]': String(offset),
    }).toString()
    const response = await client.fetch(url, {
      headers: { Accept: 'application/vnd.api+json', 'x-api-key': client.apiKey },
      redirect: 'error',
      signal,
    })
    if (!response.ok)
      throw new PlaceSearchPageError(
        query.cursor && [404, 410].includes(response.status) ? 410 : response.status,
      )
    const page = categoryCollectionSchema.parse(await response.json())
    if (
      pin &&
      (page.meta.apiReleaseSet !== pin.releaseSet ||
        page.meta.apiCatalogRevision !== pin.catalogRevision)
    )
      throw new PlaceSearchPageError(410)
    pin ??= {
      releaseSet: page.meta.apiReleaseSet,
      catalogRevision: page.meta.apiCatalogRevision,
      knownAt: page.meta.catalogPublishedAt,
    }
    const next = offset + page.data.length
    const more =
      page.meta.page.total === undefined
        ? page.meta.page.hasMore
        : next < page.meta.page.total
    if (
      page.meta.page.offset !== offset ||
      page.meta.page.limit !== limit ||
      page.data.length > limit ||
      more === undefined ||
      (more && !page.data.length)
    )
      throw new Error('Places collection pagination changed')
    candidates.push(
      ...page.data.map(row => ({
        placeId: row.id,
        resourceReleaseId: row.attributes.resourceReleaseId,
        locale,
        nameText: row.attributes.i18n?.[locale]?.name ?? null,
        brandText: row.attributes.i18n?.[locale]?.brandName ?? null,
      })),
    )
    if (more) offset = next
    else {
      index++
      offset = 0
    }
  }
  return {
    candidates,
    nextCursor:
      index < categories.length
        ? encodeURIComponent(JSON.stringify({ key, index, offset, pin }))
        : null,
  }
}

/** Read the next Place discovery page without repeating or enlarging earlier requests.
 * @param client Trusted endpoint, credential and transport.
 * @param input Text or category query with the previous page's opaque cursor.
 * @returns Verified source identities and continuation; upstream failure is not emptiness.
 */
export async function searchSaanSeoiPlacesPage(
  client: PlaceSourceClient,
  input: z.input<typeof PlaceSearchPageInputSchema>,
): Promise<PlaceSearchPage> {
  const query = PlaceSearchPageInputSchema.parse(input)
  if (!query.q) return browseSaanSeoiPlacesPage(client, query)
  const url = new URL('/places/v0.1/search', client.baseUrl)
  url.search = new URLSearchParams({
    ...placeSearchFilterParams(query.filters),
    q: query.q,
    region: 'hk',
    paginate: 'true',
    limit: String(query.limit),
    ...(query.locale ? { locale: query.locale } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
  }).toString()
  const response = await client.fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new PlaceSearchPageError(response.status)
  const page = z
    .object({
      results: z.array(searchResultSchema).max(query.limit),
      meta: z.object({ nextCursor: z.string().max(8192).nullable() }),
    })
    .parse(await response.json())
  return { candidates: page.results, nextCursor: page.meta.nextCursor }
}

/**
 * Discover candidates across SaanSeoi's latest published Hong Kong Locations index.
 * @param client Trusted server endpoint, credential and request transport.
 * @param input Bounded text query or category-only filters, and optional preferred locale.
 * @returns Bounded discovery candidates, not canonical Location revisions.
 * @remarks Search supplies no geometry or publication pin. Results must be resolved
 * against canonical source evidence before import/linking; never pass them to ingestion.
 * Redirects are rejected so credentials cannot follow an upstream redirect.
 */
export async function searchSaanSeoiPlaces(
  client: PlaceSourceClient,
  input: z.input<typeof PlaceSearchInputSchema>,
): Promise<LocationSearchCandidate[]> {
  const query = PlaceSearchInputSchema.parse(input)
  if (!query.q) return (await browseSaanSeoiPlacesPage(client, query)).candidates
  const url = new URL('/places/v0.1/search', client.baseUrl)
  url.search = new URLSearchParams({
    ...placeSearchFilterParams(query.filters),
    q: query.q,
    region: 'hk',
    limit: String(query.limit),
    ...(query.locale ? { locale: query.locale } : {}),
  }).toString()
  const response = await client.fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
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
      filters: z.object({ id: z.string().optional() }).optional(),
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
 * Fetch one bounded canonical Location page from a fixed publication checkpoint.
 * @param client Trusted server endpoint, credential and request implementation.
 * @param pin Immutable publication selection, retained across every page and retry.
 * @param offset Next offset from the last successfully persisted page.
 * @param filters Optional canonical ID, category or Division restriction, unchanged across pages.
 * @returns Verified projections, total count and the next offset (null only when complete).
 * @remarks Latest-only search/detail results are never used as canonical snapshots.
 * Credentials are sent only to the configured endpoint, with redirects rejected.
 * Callers persist their checkpoint only after storing every projection in the page.
 */
export async function readSaanSeoiPlacePage(
  client: PlaceSourceClient,
  pin: LocationPublicationPin,
  offset = 0,
  filters: {
    id?: string
    basicCategory?: string
    taxonomyPrimary?: string
    division?: string
  } = {},
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
    throw new Error('Invalid Location publication checkpoint')
  const url = new URL('/places/v0.1', client.baseUrl)
  url.search = new URLSearchParams({
    releaseSet: pin.releaseSet,
    catalogRevision: pin.catalogRevision,
    knownAt: pin.knownAt,
    profile: 'full',
    locales: 'en,zh-hant,zh-hans',
    'page[limit]': '100',
    'page[offset]': String(offset),
    ...(filters.id ? { 'filter[id]': filters.id } : {}),
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
    (filters.id !== undefined && parsed.meta.filters?.id !== filters.id) ||
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
      'Location page does not match its publication checkpoint or pagination',
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
