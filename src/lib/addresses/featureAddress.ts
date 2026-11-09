import { simplifiedChinese, traditionalChinese } from './chinese.js'
import { formatStreetNumber, streetNumberIssue } from './streetNumber.js'
import {
  addressName,
  streetDisplayName,
  applyAddressAbbreviations,
} from './formatting.js'
import { LocalLocationAddressSchema } from './localLocationAddress.js'
import {
  UnitDetailsSchema,
  formatFloor,
  formatUnit,
  unitDisplayExpression,
  parseFloor,
} from './address3d.js'
import {
  addressDivisionName,
  addressLocalityLevel,
  AddressDivisionOverridesSchema,
} from './divisions.js'
// VALIDATION
import { z } from 'zod'
import { AddressAssociationSchema } from '#lib/locations/association.js'
import { LocationFactsSchema } from '#lib/locations/validation.js'
// TYPES
import type { AddressMeta } from '#lib/utils/address.types.js'
import type { AddressDivision } from './divisions.js'
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
  'floorExpression',
  'unitExpression',
  'unitPortion',
  'accessHint',
] as const
export type AddressField = (typeof ADDRESS_FIELDS)[number]
const fields = z.partialRecord(
  z.enum(ADDRESS_FIELDS),
  z.union([z.string().max(4000), z.boolean(), z.null()]),
)
const featureAddressBase = z.strictObject({
  version: z.literal(1),
  association: AddressAssociationSchema.optional(),
  canonical: z
    .strictObject({
      addressId: z.string().min(1),
      revisionId: z.string().min(1),
      content: LocalLocationAddressSchema,
    })
    .optional(),
  source: LocationFactsSchema.shape.location.shape.address,
  coordinates: z
    .tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ])
    .nullable(),
  matchStatus: z.enum(['resolved', 'ambiguous', 'unresolved', 'stale']),
  overrides: z.record(z.string(), fields),
  // Retained names absent from the latest catalogue selection need locale-specific review.
  detachedNames: z
    .object({
      buildingName: z.record(z.string(), z.string()).optional(),
      streetName: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  // Subjective geography is shared across locales; factual geography always follows the marker.
  divisionOverrides: AddressDivisionOverridesSchema.optional(),
  // Feature-local semantics follow SaanSeoi unit fields without inventing inventory IDs.
  unitDetails: UnitDetailsSchema.optional(),
  // Location-level directions are separate from canonical building/unit evidence.
  accessHints: z.record(z.string(), z.string().max(4000).nullable()).optional(),
  legacy: z.record(z.string(), z.unknown()).optional(),
  query: z.string().optional(),
})
export type FeatureAddress = z.infer<typeof featureAddressBase>
export const FeatureAddressSchema = featureAddressBase.superRefine(
  (address, context) => {
    // Validate explicit edits without rejecting or rewriting retained provider evidence.
    for (const [locale, corrections] of Object.entries(address.overrides)) {
      const issue = streetNumberIssue(corrections)
      if (issue)
        context.addIssue({
          code: 'custom',
          message:
            issue === 'descending'
              ? 'The last street number must not be lower than the first.'
              : 'Invalid street number expression.',
          path: ['overrides', locale, 'buildingNumberExpression'],
        })
    }
    if (address.source.address2dId) {
      const resource = z
        .object({
          id: z.string(),
          attributes: z.object({ snapshotId: z.string().optional() }),
        })
        .safeParse(address.source.rawSource.data)
      if (
        !resource.success ||
        resource.data.id !== address.source.address2dId ||
        (address.source.snapshotId &&
          resource.data.attributes.snapshotId !== address.source.snapshotId)
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
      snapshotId: null,
      rawSource: {},
      fallbackDisplay,
    },
  }
}

// Reuse validators across repeated locale reads while comparing and rendering candidates.
const addressLocaleRecordSchema = z.record(z.string(), z.unknown())

/** Reads an exact source locale and overlays local corrections. @param address Canonical source envelope. @param locale HYPE locale. @returns Effective upstream-named scalar fields; no cross-locale fallback. */
export function getAddressLocale(
  address: FeatureAddress,
  locale: LocaleKey,
): Partial<Record<AddressField, string | boolean | null>> {
  const data = address.source.rawSource.data as
    | { attributes?: { i18n?: Record<string, unknown> } }
    | undefined
  const parsed = addressLocaleRecordSchema.safeParse(
    (
      address.association?.content ??
      address.canonical?.content ??
      address.source.canonical?.content ??
      address.source.authored
    )?.i18n[ADDRESS_LOCALES[locale]] ??
      data?.attributes?.i18n?.[ADDRESS_LOCALES[locale]],
  )
  const result: Partial<Record<AddressField, string | boolean | null>> = {}
  if (parsed.success)
    for (const key of ADDRESS_FIELDS) {
      const value = parsed.data[key]
      if (typeof value === 'string' || typeof value === 'boolean' || value === null)
        result[key] =
          typeof value === 'string' &&
          (key === 'buildingName' || key === 'premisesName')
            ? addressName(value, locale)
            : value
    }
  // Selected inventory supplies defaults; local floor/unit corrections remain independent.
  const unit = getAddressUnits(address, locale).find(
    item => item.value === address.source.address3dUnitId,
  )
  if (unit) {
    result.floorExpression = unit.floorExpression
    result.unitExpression = unit.unitExpression
  }
  const authored =
    address.association?.content ??
    address.canonical?.content ??
    address.source.canonical?.content ??
    address.source.authored
  const localUnit = authored?.unit
  const localExpressions = authored?.unitI18n[ADDRESS_LOCALES[locale]]
  if (localUnit) {
    result.floorExpression =
      localExpressions?.floorExpression ?? formatFloor(localUnit, locale)
    result.unitExpression =
      localExpressions?.unitExpression &&
      localExpressions.unitExpression !== localUnit.unitRef
        ? localExpressions.unitExpression
        : formatUnit(localUnit, locale)
  }
  result.unitPortion =
    address.unitDetails?.unitPortion ?? localUnit?.unitPortion ?? unit?.unitPortion
  result.accessHint = address.accessHints?.[ADDRESS_LOCALES[locale]]
  return { ...result, ...address.overrides[ADDRESS_LOCALES[locale]] }
}

/** Derive Chinese script fallbacks for presentation without changing source evidence.
 * @param address Original source and explicit corrections. @param locale Display language.
 * @returns Effective components; distinct custom values and explicit clears never fall back.
 * @remarks Traditional names may use published Simplified text when the source slot is absent or duplicates English.
 */
export function getAddressPresentationLocale(
  address: FeatureAddress,
  locale: LocaleKey,
): ReturnType<typeof getAddressLocale> {
  const exact = { ...getAddressLocale(address, locale) }
  // References identify the same part in both Chinese scripts; source-only gaps must not appear as empty inputs.
  if (locale !== 'en') {
    const other = getAddressLocale(address, locale === 'zhHant' ? 'zhHans' : 'zhHant')
    for (const field of ['blockRef', 'phaseRef'] as const) {
      if (
        !exact[field] &&
        !Object.hasOwn(address.overrides[ADDRESS_LOCALES[locale]] ?? {}, field)
      )
        exact[field] = other[field]
    }
  }
  if (locale === 'zhHant') {
    const simplified = getAddressLocale(address, 'zhHans')
    const english = getAddressLocale(address, 'en')
    const result = { ...exact }
    // An English duplicate is fallback text; catalogue selection can also have copied it into street overrides.
    for (const field of ['streetName', 'buildingName', 'premisesName'] as const) {
      const candidate = simplified[field]
      const current = exact[field]
      const duplicatesEnglish =
        typeof current === 'string' &&
        Boolean(current.trim()) &&
        current.trim().toLowerCase() ===
          String(english[field] ?? '')
            .trim()
            .toLowerCase()
      if (
        (!Object.hasOwn(address.overrides['zh-hant'] ?? {}, field) ||
          (field === 'streetName' && duplicatesEnglish)) &&
        typeof candidate === 'string' &&
        /\p{Script=Han}/u.test(candidate) &&
        ((!current &&
          !exact.formattedAddress &&
          !address.source.fallbackDisplay['zh-hant']) ||
          duplicatesEnglish)
      )
        result[field] = traditionalChinese(candidate)
    }
    return result
  }
  if (locale !== 'zhHans') return exact
  const traditional = getAddressLocale(address, 'zhHant')
  const result = { ...exact }
  for (const [field, value] of Object.entries(traditional)) {
    const key = field as AddressField
    if (!result[key] && !Object.hasOwn(address.overrides['zh-hans'] ?? {}, key))
      result[key] = typeof value === 'string' ? simplifiedChinese(value) : value
  }
  return result
}

/** Resolves display text without rewriting canonical evidence. @param address Address and corrections. @param locale HYPE locale. @param divisions Resolved effective marker geography, when available. @param locationKind Entity displayed above this supporting address; buildings omit their building component. @returns Effective display label, including explicit clearing. @remarks Structured corrections compose a local label; an explicit formattedAddress override is the complete user-authored label, including any unit text. */
export function getAddressDisplay(
  address: FeatureAddress,
  locale: LocaleKey,
  divisions: AddressDivision[] = [],
  locationKind?: string,
): string {
  const tag = ADDRESS_LOCALES[locale]
  const overrides = address.overrides[tag] ?? {}
  const hasDisplayOverride = Object.hasOwn(overrides, 'formattedAddress')
  if (hasDisplayOverride) return String(overrides.formattedAddress ?? '')
  // Effective local baselines retain complete labels separately from structured evidence.
  const retainedDisplay = address.source.displayOverrides
  if (
    !Object.keys(overrides).length &&
    retainedDisplay &&
    Object.hasOwn(retainedDisplay, tag)
  ) {
    return retainedDisplay[tag]
  }
  const value = getAddressPresentationLocale(address, locale)
  // A partial component edit must not discard retained text that has not been structured yet.
  const original = getAddressPresentationLocale({ ...address, overrides: {} }, locale)
  const hasStructuredBase = [
    'buildingName',
    'premisesName',
    'streetName',
    'blockExpression',
    'blockRef',
    'phaseExpression',
    'phaseRef',
  ].some(field => Boolean(original[field as AddressField]))
  let display = hasDisplayOverride
    ? String(overrides.formattedAddress)
    : ((
        address.association?.content ??
        address.canonical?.content ??
        address.source.canonical?.content ??
        address.source.authored
      )?.i18n[tag]?.formattedAddress ??
      address.source.fallbackDisplay[tag] ??
      String(value.formattedAddress ?? ''))
  // A missing Simplified label can use retained Traditional text even when it is not structured.
  if (locale === 'zhHans' && !display) {
    const content =
      address.association?.content ??
      address.canonical?.content ??
      address.source.canonical?.content ??
      address.source.authored
    const traditional =
      content?.i18n['zh-hant']?.formattedAddress ??
      address.source.fallbackDisplay['zh-hant'] ??
      getAddressLocale(address, 'zhHant').formattedAddress
    if (typeof traditional === 'string') display = simplifiedChinese(traditional)
  }
  if (hasStructuredBase || !display || value.streetName) {
    const text = (key: AddressField): string =>
      typeof value[key] === 'string' ? (value[key] as string) : ''
    const numberExpression = Object.hasOwn(overrides, 'buildingNumberExpression')
      ? text('buildingNumberExpression')
      : Object.hasOwn(overrides, 'buildingNumberFrom') ||
          Object.hasOwn(overrides, 'buildingNumberTo')
        ? [text('buildingNumberFrom'), text('buildingNumberTo')]
            .filter(Boolean)
            .join(text('buildingNumberConnector') || '-')
        : text('buildingNumberExpression') ||
          [text('buildingNumberFrom'), text('buildingNumberTo')]
            .filter(Boolean)
            .join(text('buildingNumberConnector') || '-')
    const number = formatStreetNumber(numberExpression)
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
        : text('blockExpression') ||
          (value.blockTypeBeforeNumber === false
            ? [text('blockRef'), text('blockType')]
            : [text('blockType'), text('blockRef')]
          )
            .filter(Boolean)
            .join(locale === 'en' ? ' ' : '')
    const phase = Object.hasOwn(overrides, 'phaseExpression')
      ? text('phaseExpression')
      : Object.hasOwn(overrides, 'phaseName') || Object.hasOwn(overrides, 'phaseRef')
        ? [text('phaseName'), text('phaseRef')]
            .filter(Boolean)
            .join(locale === 'en' ? ' ' : '')
        : text('phaseExpression') ||
          [text('phaseName'), text('phaseRef')]
            .filter(Boolean)
            .join(locale === 'en' ? ' ' : '')
    const premises = [
      ...new Set(
        [
          locale === 'en' ? applyAddressAbbreviations(block) : block,
          phase,
          locationKind === 'building' ? '' : text('buildingName'),
          text('premisesName'),
        ].filter(Boolean),
      ),
    ]
    display =
      locale === 'en'
        ? [
            ...premises,
            [number, streetDisplayName(text('streetName'), locale)]
              .filter(Boolean)
              .join(' '),
          ]
            .filter(Boolean)
            .join(', ')
        : `${text('streetName')}${number ? number + (locale === 'zhHans' ? '号' : '號') : ''}${premises.reverse().join('')}`
  }
  const unit = getAddressUnits(address, locale).find(
    item => item.value === address.source.address3dUnitId,
  )
  // Parsed shared values generate display text; original expressions remain editable evidence.
  const content =
    address.association?.content ??
    address.canonical?.content ??
    address.source.canonical?.content ??
    address.source.authored
  const details = address.unitDetails ?? content?.unit ?? unit
  const sourceFloor = String(value.floorExpression ?? '')
  const parsedFloor = parseFloor(sourceFloor)
  const floor =
    details &&
    Object.hasOwn(details, 'floorRef') &&
    (address.unitDetails || !Object.hasOwn(overrides, 'floorExpression'))
      ? formatFloor(details, locale)
      : !Object.hasOwn(overrides, 'floorExpression') &&
          parsedFloor.floorType &&
          parsedFloor.floorType !== 'X'
        ? formatFloor(parsedFloor, locale)
        : sourceFloor
  const flat =
    details?.unitType === 'X' && value.unitExpression
      ? String(value.unitExpression)
      : details &&
          Object.hasOwn(details, 'unitRef') &&
          (address.unitDetails || !Object.hasOwn(overrides, 'unitExpression'))
        ? formatUnit(details, locale)
        : unitDisplayExpression(String(value.unitExpression ?? ''), locale)
  const portion = String(value.unitPortion ?? '')
  const hasUnitCorrections =
    Boolean(details) ||
    floor !== sourceFloor ||
    flat !== String(value.unitExpression ?? '') ||
    ['floorExpression', 'unitExpression', 'unitPortion'].some(key =>
      Object.hasOwn(overrides, key),
    )
  const unitPart = hasUnitCorrections
    ? (locale === 'en' ? [portion, flat, floor] : [floor, flat, portion])
        .filter(Boolean)
        .join(locale === 'en' ? ', ' : '')
    : (unit?.label ??
      (
        address.association?.content ??
        address.canonical?.content ??
        address.source.canonical?.content ??
        address.source.authored
      )?.unitI18n[tag]?.formattedAddressPart ??
      (locale === 'en'
        ? [value.unitPortion, value.unitExpression, value.floorExpression]
            .filter(Boolean)
            .join(', ')
        : [value.floorExpression, value.unitExpression, value.unitPortion]
            .filter(Boolean)
            .join('')))
  const displayUnit =
    locationKind === 'building' ? '' : unitDisplayExpression(unitPart, locale)
  const composed = displayUnit
    ? locale === 'en'
      ? [displayUnit, display].filter(Boolean).join(', ')
      : display + displayUnit
    : display
  // Prefer the most specific available locality, including urban neighbourhoods.
  const locality = divisions
    .filter(division => addressLocalityLevel(division) !== null)
    .sort(
      (a, b) =>
        addressLocalityLevel(b)! - addressLocalityLevel(a)! || a.id.localeCompare(b.id),
    )[0]
  if (!locality) return composed
  const name = addressDivisionName(locality, locale)
  if (!composed) return name
  const alreadyIncluded =
    locale === 'en'
      ? composed
          .split(/\s*,\s*/)
          .some(part => part.toLocaleLowerCase() === name.toLocaleLowerCase())
      : !value.streetName && composed.startsWith(name)
  if (alreadyIncluded) return composed
  return locale === 'en' ? `${composed}, ${name}` : name + composed
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
  const next = { ...address, overrides: { ...address.overrides, [tag]: fields } }
  if (
    (field === 'buildingName' || field === 'streetName') &&
    address.detachedNames?.[field]?.[tag] !== undefined
  ) {
    const retained = { ...address.detachedNames[field] }
    delete retained[tag]
    next.detachedNames = { ...address.detachedNames, [field]: retained }
  }
  return next
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

// Compile inventory validators once; every locale read still validates the current source evidence.
const addressUnitCoverageSchema = z.object({
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
const addressUnitInventorySchema = z.object({
  type: z.literal('address3d'),
  id: z.string(),
  attributes: z.object({
    snapshotId: z.string(),
    address2dId: z.string(),
    units: z.array(
      z.object({
        ...UnitDetailsSchema.shape,
        id: z.string(),
        unitRef: z.string(),
        floorRef: z.string(),
      }),
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

/** Returns only publication-compatible units with established building membership.
 * @param address Canonical address with included Address3D inventory.
 * @param locale Requested locale; unit IDs remain the fallback when no label exists.
 * @returns Valid units and their exact inventory IDs, never nearby/guessed units.
 */
export function getAddressUnits(
  address: FeatureAddress,
  locale: LocaleKey,
): Array<{
  value: string
  label: string
  inventoryId: string
  floorExpression: string
  unitExpression: string
  floorRef?: string
  floorType?: import('./address3d.js').FloorType
  unitRef?: string
  unitType?: import('./address3d.js').UnitType
  unitPortion?: string | null
}> {
  const parsed = addressUnitCoverageSchema.safeParse(address.source.rawSource)
  if (!parsed.success) return []
  const coverage = parsed.data.data.attributes.address3dCoverage
  if (
    coverage.kind === 'direct' &&
    coverage.ownerAddress2dId !== address.source.address2dId
  )
    return []
  for (const record of parsed.data.included) {
    const inventory = addressUnitInventorySchema.safeParse(record)
    if (
      !inventory.success ||
      inventory.data.id !== coverage.address3dId ||
      inventory.data.attributes.snapshotId !== address.source.snapshotId ||
      inventory.data.attributes.address2dId !== coverage.ownerAddress2dId
    )
      continue
    const { attributes } = inventory.data
    return attributes.units.map(unit => {
      const translation = attributes.i18n[ADDRESS_LOCALES[locale]]?.units[unit.id]
      return {
        value: unit.id,
        inventoryId: inventory.data.id,
        ...(unit.unitType
          ? { unitRef: unit.unitRef ?? undefined, unitType: unit.unitType }
          : {}),
        ...(unit.floorType
          ? { floorRef: unit.floorRef ?? undefined, floorType: unit.floorType }
          : {}),
        ...(unit.unitPortion != null ? { unitPortion: unit.unitPortion } : {}),
        floorExpression: translation?.floorExpression ?? unit.floorRef ?? '',
        unitExpression: translation?.unitExpression ?? unit.unitRef ?? '',
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
        !(locale in ADDRESS_LOCALES)
          ? translation
          : {
              ...translation,
              displayAddress: getAddressDisplay(address, locale as LocaleKey),
              displayAddressGen:
                Object.keys(
                  address.overrides[ADDRESS_LOCALES[locale as LocaleKey]] ?? {},
                ).length === 0,
              addressProperties: {},
            },
      ]),
    ),
  }
}
