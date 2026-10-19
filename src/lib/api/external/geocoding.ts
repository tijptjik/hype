import type { Polygon, MultiPolygon } from 'geojson'
// THIRD PARTY
import { z } from 'zod'
// SERVICES
import { applyAddressAbbreviations, titleCase } from '#lib/utils/geocoding.js'
// TYPES
import type { ParsedReverseGeocodeResult } from '#lib/utils/geocoding.types.js'
import {
  emptyFeatureAddress,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import type { LocaleKey } from '#lib/types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CONTRACTS
// 2. ADDRESS PRESENTATION
// - formatAddress
// - parseGeocodeResult
// 3. SAANSEOI REQUESTS
// - geocodeAddress
// - loadGeocodedAddressUnits
// ---

const addressLocaleSchema = z.object({
  formattedAddress: z.string(),
  buildingName: z.string().nullish(),
  buildingNumberExpression: z.string().nullish(),
  buildingNumberFrom: z.string().nullish(),
  buildingNumberTo: z.string().nullish(),
  blockExpression: z.string().nullish(),
  blockType: z.string().nullish(),
  blockRef: z.string().nullish(),
  blockTypeBeforeNumber: z.boolean().nullish(),
  phaseExpression: z.string().nullish(),
  phaseName: z.string().nullish(),
  phaseRef: z.string().nullish(),
  premisesName: z.string().nullish(),
  streetName: z.string().nullish(),
})
const responseSchema = z.object({
  data: z.array(
    z.object({
      type: z.literal('geocoding-results'),
      attributes: z.object({
        status: z.enum(['resolved', 'ambiguous', 'incomplete', 'not_found']),
        match: z
          .object({
            distanceMetres: z.number().optional(),
            type: z.string().optional(),
          })
          .passthrough()
          .optional(),
      }),
      relationships: z.object({
        address: z
          .object({
            data: z.array(z.object({ type: z.literal('addresses'), id: z.string() })),
          })
          .optional(),
      }),
    }),
  ),
  included: z
    .array(
      z
        .object({
          type: z.string(),
          id: z.string(),
          attributes: z.unknown(),
        })
        .passthrough(),
    )
    .default([]),
  meta: z.record(z.string(), z.unknown()).optional(),
})
const addressSchema = z.object({
  geometry: z
    .object({
      type: z.literal('Point'),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .nullish(),
  i18n: z.record(z.string(), addressLocaleSchema),
})

type AddressLocale = z.infer<typeof addressLocaleSchema>
export type GeocodeInput = { lng: number; lat: number } | { address: string }
export type GeocodeOptions = {
  footprint?: Polygon | MultiPolygon
  baseUrl?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
}

/**
 * Builds a readable address while leaving polygon-derived divisions out of urban labels.
 * @param value Canonical localized SaanSeoi address components.
 * @param locale Hype locale key.
 * @param urban Whether the canonical English region identifies HK Island or Kowloon.
 * @returns Building and street address for urban records, otherwise the full canonical label.
 * @remarks Keep NT village/locality context and addresses without a street intact.
 */
function formatAddress(
  value: AddressLocale,
  locale: LocaleKey,
  urban: boolean,
): string {
  let label = value.formattedAddress
  if (urban && value.streetName) {
    const number =
      value.buildingNumberExpression ||
      [value.buildingNumberFrom, value.buildingNumberTo].filter(Boolean).join('-')
    const premises = [
      ...new Set(
        [
          value.blockExpression,
          value.phaseExpression,
          value.buildingName,
          value.premisesName,
        ].filter((part): part is string => Boolean(part)),
      ),
    ]
    label =
      locale === 'en'
        ? [
            ...premises,
            [number, applyAddressAbbreviations(value.streetName)]
              .filter(Boolean)
              .join(' '),
          ].join(', ')
        : `${value.streetName}${number ? `${number}${locale === 'zhHans' ? '号' : '號'}` : ''}${[...premises].reverse().join('')}`
  }
  return locale === 'en'
    ? titleCase(label)
        .replace(
          /\b(\d+)([a-z])\b/g,
          (_, digits: string, suffix: string) => digits + suffix.toUpperCase(),
        )
        .replace(/\b(?:Hk|Nt|Kln)\b/g, part => part.toUpperCase())
    : label
}

/**
 * Adapts the highest-ranked address through its JSON:API relationship.
 * @param body SaanSeoi response body.
 * @param input Original address or selected map coordinates.
 * @returns Canonical Hype address data, or null when no usable address exists.
 * @remarks Reverse results preserve the selected pin; forward results use address geometry.
 * Division membership is never inferred from address text or copied into the feature.
 */
export function parseGeocodeResult(
  body: unknown,
  input: GeocodeInput,
): ParsedReverseGeocodeResult | null {
  const response = responseSchema.parse(body)
  const candidate = response.data[0]
  if (!candidate || ['not_found', 'incomplete'].includes(candidate.attributes.status))
    return null
  const link = candidate.relationships.address?.data[0]
  if (!link) return null
  const resource = response.included.find(
    item => item.type === link.type && item.id === link.id,
  )
  if (!resource) throw new Error('SaanSeoi address relationship is missing')
  const address = addressSchema.parse(resource.attributes)
  const point = 'lng' in input ? [input.lng, input.lat] : address.geometry?.coordinates
  if (!point) return null
  const english = address.i18n.en?.formattedAddress ?? ''
  const urban = /,\s*(?:HK|HKI|KL|KLN|KOWLOON|HONG KONG ISLAND)\s*$/i.test(english)
  const locales = {
    en: ['en'],
    zhHant: ['zh-hant', 'zh-hans', 'en'],
    zhHans: ['zh-hans', 'zh-hant', 'en'],
  } as const
  const i18n = {} as ParsedReverseGeocodeResult['i18n']

  // Map provider locale tags and structured fields without an extra translation/provider call.
  for (const locale of Object.keys(locales) as LocaleKey[]) {
    const sourceLocale = locales[locale].find(key => address.i18n[key])
    const value = sourceLocale ? address.i18n[sourceLocale] : undefined
    i18n[locale] = {
      displayAddress: value
        ? formatAddress(
            value,
            sourceLocale === 'en'
              ? 'en'
              : sourceLocale === 'zh-hans'
                ? 'zhHans'
                : 'zhHant',
            urban,
          )
        : '',
      displayAddressGen: true,
      // Compatibility shell only: canonical structure now lives in addressMeta.address.
      addressProperties: {},
    }
  }
  if (!Object.values(i18n).some(value => value.displayAddress)) return null
  // Retain the full selected record, publication and source attribution unchanged.
  const attributes = resource.attributes as Record<string, unknown>
  const snapshotId =
    typeof attributes.snapshotId === 'string' ? attributes.snapshotId : null
  const canonical = emptyFeatureAddress(
    Object.fromEntries(
      Object.entries(locales).map(([locale, tags]) => [
        tags[0],
        i18n[locale as LocaleKey].displayAddress ?? '',
      ]),
    ),
  )
  canonical.coordinates = [point[0], point[1]]
  canonical.matchStatus =
    candidate.attributes.status === 'resolved' ? 'resolved' : 'ambiguous'
  canonical.query = 'address' in input ? input.address : undefined
  canonical.source = {
    ...canonical.source,
    status:
      snapshotId && candidate.attributes.status === 'resolved'
        ? 'resolved'
        : 'unresolved',
    address2dId: link.id,
    addressSnapshotId: snapshotId,
    records: {
      data: resource,
      included: response.included,
      meta: response.meta ?? {},
      match: candidate.attributes,
    },
  }
  return {
    addressMeta: {
      address: canonical,
      saanseoiAddressId: link.id,
      ...('lng' in input
        ? {
            addressMatch:
              candidate.attributes.match?.type === 'within_footprint'
                ? ('within_footprint' as const)
                : candidate.attributes.match?.type === 'exact_location'
                  ? ('exact_location' as const)
                  : ('nearest' as const),
          }
        : {}),
      longitude: point[0],
      latitude: point[1],
      distanceFromPoint: candidate.attributes.match?.distanceMetres,
      ...('lng' in input
        ? { addressReverseGeocoder: 'saanseoi' as const, addressReverseGen: true }
        : { addressForwardGeocoder: 'saanseoi' as const, addressForwardGen: true }),
    },
    i18n,
  }
}

/**
 * Fetches forward or reverse geocoding exclusively from SaanSeoi.
 * @param input Address text or WGS84 pin.
 * @param options Optional endpoint override and request transport for local verification.
 * @returns Every usable ranked address, preserving candidates for explicit selection.
 * @remarks Calls SaanSeoi directly from the browser using its whitelisted Origin.
 * No API key, Hype proxy, or government-provider fallback is used. HTTP/schema failures throw.
 */
export async function geocodeAddressCandidates(
  input: GeocodeInput,
  options: GeocodeOptions = {},
): Promise<ParsedReverseGeocodeResult[]> {
  const validated = z
    .union([
      z
        .object({
          lng: z.number().finite().min(-180).max(180),
          lat: z.number().finite().min(-90).max(90),
        })
        .strict(),
      z.object({ address: z.string().trim().min(1).max(500) }).strict(),
    ])
    .parse(input)
  const url = new URL(
    '/addresses/v1/geocode',
    options.baseUrl ??
      import.meta.env.PUBLIC_SAANSEOI_API_URL ??
      'https://api.saanseoi.hk',
  )
  url.search = new URLSearchParams({
    ...('lng' in validated
      ? { lng: String(validated.lng), lat: String(validated.lat) }
      : { address: validated.address }),
    ...(options.footprint && 'lng' in validated
      ? { footprint: JSON.stringify(options.footprint) }
      : {}),
    profile: 'full',
    locales: 'en,zh-hant,zh-hans',
    limit: '10',
    maxDistance: '500',
  }).toString()
  const headers: Record<string, string> = { Accept: 'application/vnd.api+json' }
  const response = await (options.fetcher ?? fetch)(url, {
    headers,
    credentials: 'omit',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`SaanSeoi geocoding failed (${response.status})`)
  const body: unknown = await response.json()
  if (options.footprint) {
    const parsed = responseSchema.parse(body)
    if (
      parsed.data.some(
        candidate =>
          candidate.attributes.match?.type !== 'within_footprint' ||
          candidate.attributes.status === 'ambiguous',
      )
    )
      return []
  }
  const parsed = responseSchema.parse(body)
  // Keep every linked candidate available for explicit selection in the editor.
  return parsed.data.flatMap(candidate =>
    (candidate.relationships.address?.data ?? []).flatMap(link => {
      const result = parseGeocodeResult(
        {
          ...parsed,
          data: [{ ...candidate, relationships: { address: { data: [link] } } }],
        },
        validated,
      )
      return result ? [result] : []
    }),
  )
}

/** Loads the selected address's structured unit inventory from the same publication.
 * @param address Geocoded address with publication metadata.
 * @param options Optional request transport and endpoint.
 * @returns Address with exact Address3D records; missing pins leave it unchanged.
 * @remarks Never mixes the geocoded snapshot with independently selected latest units.
 */
export async function loadGeocodedAddressUnits(
  address: FeatureAddress,
  options: GeocodeOptions = {},
): Promise<FeatureAddress> {
  const metadata = address.source.records.meta as
    | {
        apiReleaseSet?: unknown
        release?: { apiReleaseSet?: unknown }
        addressRelease?: { apiReleaseSet?: unknown }
      }
    | undefined
  const releaseSet =
    metadata?.addressRelease?.apiReleaseSet ??
    metadata?.release?.apiReleaseSet ??
    metadata?.apiReleaseSet
  if (!address.source.address2dId || !address.source.addressSnapshotId) return address
  if (typeof releaseSet !== 'string') throw new Error('Address publication is missing')
  const url = new URL(
    `/addresses/v0.1/${encodeURIComponent(address.source.address2dId)}`,
    options.baseUrl ??
      import.meta.env.PUBLIC_SAANSEOI_API_URL ??
      'https://api.saanseoi.hk',
  )
  url.search = new URLSearchParams({
    releaseSet,
    profile: 'full',
    locales: 'en,zh-hant,zh-hans',
    include: 'divisions,units',
  }).toString()
  const response = await (options.fetcher ?? fetch)(url, {
    headers: { Accept: 'application/vnd.api+json' },
    credentials: 'omit',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok)
    throw new Error(`SaanSeoi address units failed (${response.status})`)
  const raw: unknown = await response.json()
  const parsed = z
    .object({
      data: z.object({
        type: z.literal('addresses'),
        id: z.string(),
        attributes: z.object({ snapshotId: z.string() }),
      }),
      meta: z.object({ apiReleaseSet: z.string() }),
    })
    .parse(raw)
  if (
    parsed.data.id !== address.source.address2dId ||
    parsed.data.attributes.snapshotId !== address.source.addressSnapshotId ||
    parsed.meta.apiReleaseSet !== releaseSet
  )
    throw new Error('Address inventory publication mismatch')
  return {
    ...address,
    source: {
      ...address.source,
      records: {
        ...z.record(z.string(), z.unknown()).parse(raw),
        geocoding: address.source.records,
      },
    },
  }
}

/** Resolves the top result for existing pinpointer/import consumers.
 * @param input Search text or pin. @param options Transport options.
 * @returns The first ranked match, or null. Admin editing uses the candidate API.
 */
export async function geocodeAddress(
  input: GeocodeInput,
  options: GeocodeOptions = {},
): Promise<ParsedReverseGeocodeResult | null> {
  return (await geocodeAddressCandidates(input, options))[0] ?? null
}
