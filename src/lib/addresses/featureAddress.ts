// VALIDATION
import { z } from 'zod'
import { PlaceFactsSchema } from '#lib/places/validation.js'
// TYPES
import type { AddressMeta } from '#lib/utils/address.types.js'
import type { LocaleKey } from '#lib/types.js'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
// 1. CONTRACTS
// 2. PROJECTION AND OVERRIDES
// - emptyFeatureAddress
// - getAddressLocale
// - getAddressDisplay
// - setAddressOverride
// - invalidateAddressLocation
// - getAddressUnits
// - projectFeatureAddress
// ---

export const ADDRESS_LOCALES = {
  en: 'en',
  zhHant: 'zh-hant',
  zhHans: 'zh-hans',
} as const
// Names are the upstream Address i18n contract, not the retired HYPE address properties.
export const ADDRESS_FIELDS = [
  'formattedAddress',
  'buildingName',
  'buildingNumberExpression',
  'buildingNumberFrom',
  'buildingNumberTo',
  'buildingNumberConnector',
  'blockExpression',
  'blockType',
  'blockRef',
  'blockTypeBeforeNumber',
  'phaseExpression',
  'phaseName',
  'phaseRef',
  'premisesName',
  'streetName',
] as const
export type AddressField = (typeof ADDRESS_FIELDS)[number]
const fields = z.partialRecord(
  z.enum(ADDRESS_FIELDS),
  z.union([z.string().max(4000), z.boolean(), z.null()]),
)
const featureAddressBase = z.strictObject({
  version: z.literal(1),
  source: PlaceFactsSchema.shape.location.shape.address,
  coordinates: z
    .tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ])
    .nullable(),
  matchStatus: z.enum(['resolved', 'ambiguous', 'unresolved', 'stale']),
  overrides: z.record(z.string(), fields),
  legacy: z.record(z.string(), z.unknown()).optional(),
  query: z.string().optional(),
})
export type FeatureAddress = z.infer<typeof featureAddressBase>
export const FeatureAddressSchema = featureAddressBase.superRefine(
  (address, context) => {
    if (address.source.address2dId) {
      const resource = z
        .object({
          id: z.string(),
          attributes: z.object({ snapshotId: z.string().optional() }),
        })
        .safeParse(address.source.records.data)
      if (
        !resource.success ||
        resource.data.id !== address.source.address2dId ||
        (address.source.addressSnapshotId &&
          resource.data.attributes.snapshotId !== address.source.addressSnapshotId)
      )
        context.addIssue({
          code: 'custom',
          message: 'Address identity does not match its retained source record',
          path: ['source'],
        })
    }
    if (
      address.source.address3dUnitId &&
      !getAddressUnits(address, 'en').some(
        unit =>
          unit.value === address.source.address3dUnitId &&
          unit.inventoryId === address.source.address3dId,
      )
    )
      context.addIssue({
        code: 'custom',
        message: 'Unit does not belong to the selected address publication',
        path: ['source', 'address3dUnitId'],
      })
  },
)

// Submit the canonical envelope as one JSON value: dotted form paths lose nulls,
// empty collections, source locale tags and arbitrary JSON:API attribution keys.
const addressTransport = z.preprocess(value => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}, FeatureAddressSchema)
export const AddressMetaSchema = z
  .custom<AddressMeta>(
    value => value !== null && typeof value === 'object' && !Array.isArray(value),
  )
  .transform((value, context) => {
    const result = z
      .object({ address: addressTransport.optional() })
      .passthrough()
      .safeParse(value)
    if (!result.success) {
      context.addIssue({
        code: 'custom',
        message: 'Invalid canonical address',
        path: ['address'],
      })
      return z.NEVER
    }
    return result.data as AddressMeta
  })

/** Creates an explicitly unresolved local address. @param fallbackDisplay Existing localized labels. @returns An empty canonical envelope, without invented source identity. */
export function emptyFeatureAddress(
  fallbackDisplay: Record<string, string> = {},
): FeatureAddress {
  return {
    version: 1,
    coordinates: null,
    matchStatus: 'unresolved',
    overrides: {},
    source: {
      status: 'unresolved',
      address2dId: null,
      address3dId: null,
      address3dUnitId: null,
      addressSnapshotId: null,
      records: {},
      fallbackDisplay,
    },
  }
}

/** Reads an exact source locale and overlays local corrections. @param address Canonical source envelope. @param locale HYPE locale. @returns Effective upstream-named scalar fields; no cross-locale fallback. */
export function getAddressLocale(
  address: FeatureAddress,
  locale: LocaleKey,
): Partial<Record<AddressField, string | boolean | null>> {
  const data = address.source.records.data as
    | { attributes?: { i18n?: Record<string, unknown> } }
    | undefined
  const parsed = z
    .record(z.string(), z.unknown())
    .safeParse(data?.attributes?.i18n?.[ADDRESS_LOCALES[locale]])
  const result: Partial<Record<AddressField, string | boolean | null>> = {}
  if (parsed.success)
    for (const key of ADDRESS_FIELDS) {
      const value = parsed.data[key]
      if (typeof value === 'string' || typeof value === 'boolean' || value === null)
        result[key] = value
    }
  return { ...result, ...address.overrides[ADDRESS_LOCALES[locale]] }
}

/** Resolves display text without rewriting canonical evidence. @param address Address and corrections. @param locale HYPE locale. @returns Effective display label, including explicit clearing. @remarks Structured corrections compose a local label; an explicit formattedAddress override always wins. */
export function getAddressDisplay(address: FeatureAddress, locale: LocaleKey): string {
  const tag = ADDRESS_LOCALES[locale]
  const overrides = address.overrides[tag] ?? {}
  if (Object.hasOwn(overrides, 'formattedAddress'))
    return String(overrides.formattedAddress ?? '')
  const value = getAddressLocale(address, locale)
  let display =
    address.source.fallbackDisplay[tag] ?? String(value.formattedAddress ?? '')
  if (Object.keys(overrides).length) {
    const text = (key: AddressField): string =>
      typeof value[key] === 'string' ? (value[key] as string) : ''
    const number = Object.hasOwn(overrides, 'buildingNumberExpression')
      ? text('buildingNumberExpression')
      : Object.hasOwn(overrides, 'buildingNumberFrom') ||
          Object.hasOwn(overrides, 'buildingNumberTo')
        ? [text('buildingNumberFrom'), text('buildingNumberTo')]
            .filter(Boolean)
            .join(text('buildingNumberConnector') || '-')
        : text('buildingNumberExpression') ||
          [text('buildingNumberFrom'), text('buildingNumberTo')]
            .filter(Boolean)
            .join('-')
    const block = Object.hasOwn(overrides, 'blockExpression')
      ? text('blockExpression')
      : Object.hasOwn(overrides, 'blockRef') ||
          Object.hasOwn(overrides, 'blockType') ||
          Object.hasOwn(overrides, 'blockTypeBeforeNumber')
        ? (value.blockTypeBeforeNumber === false
            ? [text('blockRef'), text('blockType')]
            : [text('blockType'), text('blockRef')]
          )
            .filter(Boolean)
            .join(locale === 'en' ? ' ' : '')
        : text('blockExpression')
    const phase = Object.hasOwn(overrides, 'phaseExpression')
      ? text('phaseExpression')
      : Object.hasOwn(overrides, 'phaseName') || Object.hasOwn(overrides, 'phaseRef')
        ? [text('phaseName'), text('phaseRef')]
            .filter(Boolean)
            .join(locale === 'en' ? ' ' : '')
        : text('phaseExpression')
    const premises = [
      ...new Set(
        [block, phase, text('buildingName'), text('premisesName')].filter(Boolean),
      ),
    ]
    display =
      locale === 'en'
        ? [...premises, [number, text('streetName')].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(', ')
        : `${text('streetName')}${number ? number + (locale === 'zhHans' ? '号' : '號') : ''}${premises.reverse().join('')}`
  }
  const unit = getAddressUnits(address, locale).find(
    item => item.value === address.source.address3dUnitId,
  )
  return unit
    ? locale === 'en'
      ? [unit.label, display].filter(Boolean).join(', ')
      : display + unit.label
    : display
}

/** Applies or resets one locale correction. @param address Current envelope. @param locale HYPE locale. @param field Upstream field name. @param value Undefined resets to source; null explicitly clears. @returns New envelope with original source untouched. */
export function setAddressOverride(
  address: FeatureAddress,
  locale: LocaleKey,
  field: AddressField,
  value: string | boolean | null | undefined,
): FeatureAddress {
  const tag = ADDRESS_LOCALES[locale]
  const fields = { ...address.overrides[tag] }
  if (value === undefined) delete fields[field]
  else fields[field] = value
  return { ...address, overrides: { ...address.overrides, [tag]: fields } }
}

/** Marks retained address evidence stale when its pin moves. @param meta Existing metadata. @param coordinates New marker point. @returns Metadata retaining source and corrections, requiring a new lookup. */
export function invalidateAddressLocation(
  meta: AddressMeta,
  coordinates: number[],
): AddressMeta {
  const address = meta.address
  if (
    !address ||
    !address.coordinates ||
    address.coordinates.every((value, index) => value === coordinates[index])
  )
    return meta
  return { ...meta, address: { ...address, matchStatus: 'stale' } }
}

/** Returns only publication-compatible units with established building membership.
 * @param address Canonical address with included Address3D inventory.
 * @param locale Requested locale; unit IDs remain the fallback when no label exists.
 * @returns Valid units and their exact inventory IDs, never nearby/guessed units.
 */
export function getAddressUnits(
  address: FeatureAddress,
  locale: LocaleKey,
): Array<{ value: string; label: string; inventoryId: string }> {
  const parsed = z
    .object({
      data: z.object({
        attributes: z.object({
          address3dCoverage: z.object({
            kind: z.enum(['direct', 'ancestor']),
            ownerAddress2dId: z.string(),
            address3dId: z.string(),
            membership: z.literal('established'),
          }),
        }),
      }),
      included: z.array(z.unknown()),
    })
    .safeParse(address.source.records)
  if (!parsed.success) return []
  const coverage = parsed.data.data.attributes.address3dCoverage
  if (
    coverage.kind === 'direct' &&
    coverage.ownerAddress2dId !== address.source.address2dId
  )
    return []
  for (const record of parsed.data.included) {
    const inventory = z
      .object({
        type: z.literal('address3d'),
        id: z.string(),
        attributes: z.object({
          snapshotId: z.string(),
          address2dId: z.string(),
          units: z.array(
            z.object({ id: z.string(), unitRef: z.string(), floorRef: z.string() }),
          ),
          i18n: z.record(
            z.string(),
            z.object({
              units: z.record(
                z.string(),
                z.object({
                  formattedAddressPart: z.string().optional(),
                  unitExpression: z.string(),
                  floorExpression: z.string(),
                }),
              ),
            }),
          ),
        }),
      })
      .safeParse(record)
    if (
      !inventory.success ||
      inventory.data.id !== coverage.address3dId ||
      inventory.data.attributes.snapshotId !== address.source.addressSnapshotId ||
      inventory.data.attributes.address2dId !== coverage.ownerAddress2dId
    )
      continue
    const { attributes } = inventory.data
    return attributes.units.map(unit => {
      const translation = attributes.i18n[ADDRESS_LOCALES[locale]]?.units[unit.id]
      return {
        value: unit.id,
        inventoryId: inventory.data.id,
        label:
          translation?.formattedAddressPart ||
          [translation?.unitExpression, translation?.floorExpression]
            .filter(Boolean)
            .join(locale === 'en' ? ', ' : '') ||
          [unit.unitRef, unit.floorRef].filter(Boolean).join(', ') ||
          unit.id,
      }
    })
  }
  return []
}

/** Materializes display-only locale columns from canonical data at a write boundary.
 * @param data Feature payload with its geometry and locale records.
 * @returns A copy with stale pin state and canonical display projections synchronized.
 * @remarks Legacy payloads without a canonical envelope remain accepted during migration.
 * Explicit manual display edits become local overrides, never mutations of source records.
 */
export function projectFeatureAddress<
  T extends {
    addressMeta?: AddressMeta | null
    geometry: unknown
    i18n: Record<
      string,
      {
        displayAddress?: string | null
        displayAddressGen?: boolean | string | null
        addressProperties?: unknown
      }
    >
  },
>(data: T): T {
  if (!data.addressMeta?.address) return data
  const geometry = data.geometry as { type?: string; coordinates?: number[] }
  const metadata =
    geometry.type === 'Point' && geometry.coordinates
      ? invalidateAddressLocation(data.addressMeta, geometry.coordinates)
      : data.addressMeta
  let address = metadata.address!
  // Preserve explicit manual display values from the public contribution and import flows.
  for (const locale of Object.keys(ADDRESS_LOCALES) as LocaleKey[]) {
    const translation = data.i18n[locale]
    if (
      translation &&
      (translation.displayAddressGen === false ||
        translation.displayAddressGen === 'false') &&
      translation.displayAddress != null &&
      translation.displayAddress !== getAddressDisplay(address, locale)
    )
      address = setAddressOverride(
        address,
        locale,
        'formattedAddress',
        translation.displayAddress,
      )
  }
  return {
    ...data,
    addressMeta: { ...metadata, address },
    i18n: Object.fromEntries(
      Object.entries(data.i18n).map(([locale, translation]) => [
        locale,
        {
          ...translation,
          displayAddress: getAddressDisplay(address, locale as LocaleKey),
          displayAddressGen:
            Object.keys(address.overrides[ADDRESS_LOCALES[locale as LocaleKey]] ?? {})
              .length === 0,
          addressProperties: {},
        },
      ]),
    ),
  }
}
