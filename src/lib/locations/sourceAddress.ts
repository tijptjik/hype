// VALIDATION
import { z } from 'zod'
// DOMAIN
import { readLocationPublicationMetadata } from './publication'
import { resolveSaanSeoiPlaceAddress } from './saanseoiAddress'
// TYPES
import type { PlaceSourceClient } from './sourceClient'
import type { SaanSeoiPlaceProjection } from './saanseoi'

const publicationSchema = z.object({
  meta: z.object({
    apiReleaseSet: z.string().min(1),
    apiCatalogRevision: z.string().min(1),
    catalogPublishedAt: z.string().datetime({ offset: true }),
    cohort: z.string().min(1),
    domain: z.literal('saanseoi'),
    resolvedApiVersion: z.literal('api-addresses-v0.1'),
    profile: z.literal('full'),
  }),
  links: z.object({ permalink: z.string().url() }),
})

/**
 * Load the structured Address dependency referenced by an immutable Location projection.
 * @param client Trusted endpoint, credentials and transport.
 * @param projection Canonical Location evidence, including publication chronology.
 * @returns Hydrated native Address records or explicit unresolved dependency evidence.
 * @remarks Discover the Address publication as of the Location publication, then reread
 * with its independent publication pin. Snapshot, inventory and unit identity must
 * match the Location reference exactly. Semantic mismatches retain location review;
 * transport/server errors throw for retry. No database or Feature writes occur here.
 */
export async function hydrateSaanSeoiPlaceAddress(
  client: PlaceSourceClient,
  projection: SaanSeoiPlaceProjection,
): Promise<SaanSeoiPlaceProjection> {
  const address = projection.facts.location.address
  if (!address.address2dId && !address.address3dId && !address.address3dUnitId)
    return projection
  /** Retain a stable review reason without storing upstream errors or replacing source facts. */
  const review = (reason: string): SaanSeoiPlaceProjection => ({
    ...projection,
    facts: {
      ...projection.facts,
      location: {
        ...projection.facts.location,
        address: { ...address, status: 'unresolved', records: {} },
      },
    },
    issues: projection.issues.some(issue => issue.kind === 'addressRecordsPending')
      ? projection.issues
      : [...projection.issues, { kind: 'addressRecordsPending' }],
    payload: { ...projection.payload, addressHydration: { status: 'review', reason } },
  })
  if (!address.address2dId || !address.addressSnapshotId)
    return review('incomplete-address-reference')
  const locationPublication = readLocationPublicationMetadata(projection.payload.meta)
  const path = `/addresses/v0.1/${encodeURIComponent(address.address2dId)}`
  const base = {
    region: 'hk',
    domain: 'saanseoi',
    profile: 'full',
    locales: 'en,zh-hant,zh-hans',
    include: 'units',
  }
  /** Fetch bounded full-profile evidence without following response-controlled URLs. */
  async function read(selectors: Record<string, string>): Promise<unknown | null> {
    const url = new URL(path, client.baseUrl)
    url.search = new URLSearchParams({ ...base, ...selectors }).toString()
    const response = await client.fetch(url, {
      headers: { Accept: 'application/vnd.api+json', 'x-api-key': client.apiKey },
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status === 404) return null
    if (!response.ok)
      throw new Error(`SaanSeoi Address request failed (${response.status})`)
    return response.json()
  }
  const discovered = await read({ knownAt: locationPublication.publishedAt })
  if (discovered === null) return review('address-not-published')
  const parsed = publicationSchema.safeParse(discovered)
  if (!parsed.success) return review('address-publication-invalid')
  const { meta, links } = parsed.data
  const pin = {
    releaseSet: meta.apiReleaseSet,
    catalogRevision: meta.apiCatalogRevision,
    knownAt: meta.catalogPublishedAt,
    cohort: meta.cohort,
    domain: meta.domain,
  }
  const permalink = new URL(links.permalink)
  if (
    permalink.pathname !== path ||
    Date.parse(meta.catalogPublishedAt) > Date.parse(locationPublication.publishedAt) ||
    Object.entries(pin).some(
      ([key, value]) =>
        permalink.searchParams.getAll(key).length !== 1 ||
        permalink.searchParams.get(key) !== value,
    )
  )
    return review('address-publication-mismatch')
  const pinned = await read(pin)
  if (pinned === null) return review('address-not-published')
  const verified = publicationSchema.safeParse(pinned)
  if (
    !verified.success ||
    verified.data.meta.apiReleaseSet !== meta.apiReleaseSet ||
    verified.data.meta.apiCatalogRevision !== meta.apiCatalogRevision ||
    verified.data.meta.catalogPublishedAt !== meta.catalogPublishedAt ||
    verified.data.meta.cohort !== meta.cohort
  )
    return review('address-publication-mismatch')
  try {
    const resolved = resolveSaanSeoiPlaceAddress(projection, pinned, {
      apiReleaseSet: meta.apiReleaseSet,
    })
    return {
      ...resolved,
      payload: {
        ...resolved.payload,
        addressHydration: { status: 'resolved', ...pin },
      },
    }
  } catch {
    return review('address-dependency-mismatch')
  }
}
