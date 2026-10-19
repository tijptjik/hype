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
        total: z.number().int().nonnegative(),
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
  total: number
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
  // Reject inconsistent pagination instead of declaring an incomplete export successful.
  if (
    parsed.meta.apiReleaseSet !== pin.releaseSet ||
    parsed.meta.apiCatalogRevision !== pin.catalogRevision ||
    page.offset !== offset ||
    page.limit !== 100 ||
    parsed.data.length > page.limit ||
    offset + parsed.data.length > page.total ||
    (parsed.data.length === 0 && offset < page.total) ||
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
    total: page.total,
    nextOffset:
      offset + parsed.data.length === page.total ? null : offset + parsed.data.length,
  }
}
