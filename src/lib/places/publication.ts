// VALIDATION
import { z } from 'zod'
// TYPES
import type { PlacePublicationPin, PlaceSourceClient } from './sourceClient'

const timestamp = z.string().datetime({ offset: true })
const publicationSchema = z.object({
  meta: z.object({
    apiReleaseSet: z.string().min(1),
    apiCatalogRevision: z.string().min(1),
    catalogPublishedAt: timestamp,
    cohort: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d+$/),
    resolvedApiVersion: z.literal('api-places-v0.1'),
    domain: z.literal('overture'),
    region: z.literal('hk'),
  }),
  links: z.object({ permalink: z.string().url() }),
})

export type PlacePublication = {
  pin: PlacePublicationPin
  cohort: string
  publishedAt: string
}
export type PlacePublicationTransition = 'initial' | 'unchanged' | 'forward' | 'review'

/**
 * Resolve publication identity from a canonical collection response.
 * @param document Canonical Places response, including its server-generated permalink.
 * @returns Verified publication pin and independent chronology evidence.
 * @remarks The permalink is parsed, never fetched. Its selectors must agree with metadata;
 * no record IDs, credentials or source payloads are retained in the checkpoint.
 */
export function parsePlacePublication(document: unknown): PlacePublication {
  const { meta, links } = publicationSchema.parse(document)
  const permalink = new URL(links.permalink)
  const expected = {
    releaseSet: meta.apiReleaseSet,
    catalogRevision: meta.apiCatalogRevision,
    knownAt: meta.catalogPublishedAt,
    cohort: meta.cohort,
    domain: meta.domain,
  }
  if (
    permalink.pathname !== '/places/v0.1' ||
    Object.entries(expected).some(
      ([key, value]) =>
        permalink.searchParams.getAll(key).length !== 1 ||
        permalink.searchParams.get(key) !== value,
    )
  )
    throw new Error('Place publication permalink disagrees with metadata')
  return {
    pin: {
      releaseSet: meta.apiReleaseSet,
      catalogRevision: meta.apiCatalogRevision,
      knownAt: meta.catalogPublishedAt,
    },
    cohort: meta.cohort,
    publishedAt: meta.catalogPublishedAt,
  }
}

/**
 * Discover one current canonical publication without treating its first row as a refresh.
 * @param client Trusted server endpoint, credentials and request implementation.
 * @returns Publication evidence to persist before scanning any canonical pages.
 * @remarks Discovery is bounded to one row and rejects redirects. Empty ready catalogues
 * still provide publication metadata; source removals never imply Feature deletion.
 */
export async function discoverPlacePublication(
  client: PlaceSourceClient,
): Promise<PlacePublication> {
  const url = new URL('/places/v0.1', client.baseUrl)
  url.search = new URLSearchParams({
    region: 'hk',
    profile: 'full',
    locales: 'en,zh-hant,zh-hans',
    'page[limit]': '1',
    'page[offset]': '0',
  }).toString()
  const response = await client.fetch(url, {
    headers: { Accept: 'application/vnd.api+json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok)
    throw new Error(`SaanSeoi Place publication discovery failed (${response.status})`)
  return parsePlacePublication(await response.json())
}

/**
 * Compare authoritative publication chronology rather than local ingestion sequence.
 * @param accepted Last completely processed publication, or null on first discovery.
 * @param candidate Verified newly discovered publication.
 * @returns Whether to bootstrap, skip, scan forward, or retain accepted state for review.
 * @remarks A newer catalogue may curate the same cohort. Older cohorts, same-time
 * identity conflicts and changed release sets within an identical cohort need review.
 */
export function comparePlacePublications(
  accepted: PlacePublication | null,
  candidate: PlacePublication,
): PlacePublicationTransition {
  if (!accepted) return 'initial'
  if (
    accepted.pin.releaseSet === candidate.pin.releaseSet &&
    accepted.pin.catalogRevision === candidate.pin.catalogRevision &&
    accepted.pin.knownAt === candidate.pin.knownAt &&
    accepted.cohort === candidate.cohort &&
    accepted.publishedAt === candidate.publishedAt
  )
    return 'unchanged'
  const previousTime = Date.parse(accepted.publishedAt)
  const nextTime = Date.parse(candidate.publishedAt)
  if (
    !Number.isFinite(previousTime) ||
    !Number.isFinite(nextTime) ||
    nextTime <= previousTime
  )
    return 'review'
  const [previousDate, previousRevision] = accepted.cohort.split('.')
  const [nextDate, nextRevision] = candidate.cohort.split('.')
  if (
    nextDate < previousDate ||
    (nextDate === previousDate && Number(nextRevision) < Number(previousRevision)) ||
    (candidate.cohort === accepted.cohort &&
      candidate.pin.releaseSet !== accepted.pin.releaseSet) ||
    candidate.pin.catalogRevision === accepted.pin.catalogRevision
  )
    return 'review'
  return 'forward'
}
