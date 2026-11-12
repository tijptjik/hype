// VALIDATION
import { z } from 'zod'
import { LocationFactsSchema } from './validation'
// DOMAIN
import { normalizeHongKongPhoneNumber } from '#lib/utils/phone-property.js'
// TYPES
import type { PlaceSourceClient } from './sourceClient'
import type { LocationFacts } from './model'

export type PlacePreview = LocationFacts & {
  searchClassification?: {
    basicCategory?: string | null
    taxonomyPrimary?: string | null
    operatingStatus?: string | null
  }
  classification?: {
    basicCategory?: string | null
    taxonomy?: {
      primary?: string | null
      hierarchy?: string[] | null
      alternates?: string[] | null
    } | null
  }
}

const previewSchema = z.object({
  place: z.object({
    id: z.string().min(1),
    resourceReleaseId: z.string().min(1),
    geometry: LocationFactsSchema.shape.location.shape.geometry,
    phones: z.array(z.string()).nullish(),
    basicCategory: z.string().nullish(),
    taxonomyPrimary: z.string().nullish(),
    operatingStatus: z.string().nullish(),
    taxonomy: z
      .object({
        primary: z.string().nullish(),
        hierarchy: z.array(z.string()).nullish(),
        alternates: z.array(z.string()).nullish(),
      })
      .nullish(),
  }),
  i18n: z.record(
    z.string(),
    z.object({
      name: z.string().nullish(),
      brandName: z.string().nullish(),
      freeformAddress: z.string().nullish(),
    }),
  ),
})

/**
 * Read a latest-source preview independently of canonical import availability.
 * @param client Trusted source endpoint and server credential.
 * @param input Candidate identity and release returned by spatial/text discovery.
 * @returns Display-only facts; these must never be persisted as canonical evidence.
 * @remarks Exact identity and release checks prevent stale cell results showing another
 * establishment. Import/linking must still resolve a publication-pinned canonical record.
 */
export async function readSaanSeoiPlacePreview(
  client: PlaceSourceClient,
  input: { ssId: string; resourceReleaseId: string },
): Promise<PlacePreview> {
  const url = new URL(`/places/v0.1/${encodeURIComponent(input.ssId)}`, client.baseUrl)
  url.searchParams.set('region', 'hk')
  const response = await client.fetch(url, {
    headers: { Accept: 'application/json', 'x-api-key': client.apiKey },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`Location preview failed (${response.status})`)
  return projectSaanSeoiPlacePreview(await response.json(), input)
}

/** Validate and project an embedded or independently fetched discovery preview.
 * @param value Untrusted source preview payload.
 * @param input Identity and release supplied by the matching search candidate.
 * @returns Display facts without canonical import evidence.
 * @remarks Embedded previews require the same identity checks as detail responses.
 */
export function projectSaanSeoiPlacePreview(
  value: unknown,
  input: { ssId: string; resourceReleaseId: string },
): PlacePreview {
  const data = previewSchema.parse(value)
  if (
    data.place.id !== input.ssId ||
    data.place.resourceReleaseId !== input.resourceReleaseId
  )
    throw new Error('Location preview identity or release changed')
  const names: Record<string, string> = {}
  const brands: Record<string, string> = {}
  const fallbackDisplay: Record<string, string> = {}
  // Keep every source locale; do not invent canonical Address identities for previews.
  for (const [locale, row] of Object.entries(data.i18n)) {
    if (row.name) names[locale] = row.name
    if (row.brandName) brands[locale] = row.brandName
    if (row.freeformAddress) fallbackDisplay[locale] = row.freeformAddress
  }
  return {
    searchClassification: {
      basicCategory: data.place.basicCategory,
      taxonomyPrimary: data.place.taxonomyPrimary ?? data.place.taxonomy?.primary,
      operatingStatus: data.place.operatingStatus,
    },
    classification: {
      basicCategory: data.place.basicCategory,
      taxonomy: data.place.taxonomy,
    },
    names,
    brands: Object.keys(brands).length ? [{ identifiers: {}, names: brands }] : [],
    phoneNumber: (data.place.phones ?? []).flatMap(value => {
      const normalized = normalizeHongKongPhoneNumber(value)
      return normalized ? [normalized] : []
    }),
    location: {
      geometry: data.place.geometry,
      address: {
        status: 'unresolved',
        address2dId: null,
        address3dId: null,
        address3dUnitId: null,
        snapshotId: null,
        rawSource: {},
        fallbackDisplay,
      },
    },
  }
}
