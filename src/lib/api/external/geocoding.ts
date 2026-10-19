import type { Polygon, MultiPolygon } from 'geojson'
// THIRD PARTY
import { z } from 'zod'
// SERVICES
import { applyAddressAbbreviations, titleCase } from '#lib/utils/geocoding.js'
// TYPES
import type { ParsedReverseGeocodeResult } from '#lib/utils/geocoding.types.js'
import type { AddressProperties } from '#lib/utils/address.types.js'
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
  estateName: z.string().nullish(),
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
      z.object({
        type: z.string(),
        id: z.string(),
        attributes: z.unknown(),
      }),
    )
    .default([]),
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
          value.estateName,
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
    const properties: AddressProperties = value
      ? {
          formattedAddress: value.formattedAddress,
          buildingName: value.buildingName ?? undefined,
          buildingNumberFrom: value.buildingNumberFrom ?? undefined,
          buildingNumberTo: value.buildingNumberTo ?? undefined,
          blockType: value.blockType ?? undefined,
          blockNumber: value.blockRef ?? undefined,
          blockTypeBeforeNumber: value.blockTypeBeforeNumber ?? undefined,
          phaseName: value.phaseName ?? undefined,
          phaseNumber: value.phaseRef ?? undefined,
          premisesName: value.estateName ?? undefined,
          streetName: value.streetName ?? undefined,
          rawAddress: 'address' in input ? input.address : undefined,
        }
      : {}
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
      addressProperties: properties,
    }
  }
  if (!Object.values(i18n).some(value => value.displayAddress)) return null
  return {
    addressMeta: {
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
 * @returns The normalized top address or null for a genuine no-match response.
 * @remarks Calls SaanSeoi directly from the browser using its whitelisted Origin.
 * No API key, Hype proxy, or government-provider fallback is used. HTTP/schema failures throw.
 */
export async function geocodeAddress(
  input: GeocodeInput,
  options: GeocodeOptions = {},
): Promise<ParsedReverseGeocodeResult | null> {
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
    profile: 'map',
    locales: 'en,zh-hant,zh-hans',
    limit: '1',
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
      return null
  }
  return parseGeocodeResult(body, validated)
}
