// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressLocale,
  type FeatureAddress,
} from '#lib/addresses/featureAddress.js'
import { localAddressContent } from '#lib/addresses/locationDraft.js'
import {
  parseFloor,
  parseUnit,
  type FloorType,
  type UnitType,
} from '#lib/addresses/address3d.js'
import { LocalAddressI18nSchema } from '#lib/addresses/localLocationAddress.js'
import type { LocalLocationAddress } from '#lib/addresses/localLocationAddress.js'
import {
  parseAddressExpression,
  setAddressExpression,
  setStructuredAddressExpression,
  setAddressFloorReference,
  setCustomAddressUnit,
} from '#lib/addresses/addressExpressions.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'
import type { AssociationKind } from './association'

export const ADDRESS_CHOICE_GROUPS = {
  // Review the address from its street context down to the destination and access details.
  street: ['streetName'],
  number: [
    'buildingNumberExpression',
    'buildingNumberFrom',
    'buildingNumberTo',
    'buildingNumberConnector',
  ],
  premises: ['premisesName'],
  phase: ['phaseExpression', 'phaseName', 'phaseRef'],
  building: ['buildingName'],
  block: ['blockExpression', 'blockType', 'blockRef', 'blockTypeBeforeNumber'],
  floor: ['floorExpression'],
  unit: ['unitExpression', 'unitPortion'],
  access: ['accessHint'],
} as const
export type AddressChoiceGroup = keyof typeof ADDRESS_CHOICE_GROUPS
export type AddressChoices = Record<AddressChoiceGroup, 'original' | 'location'>

/** Read identity evidence without treating premises names or unit entries as another kind.
 * @param address Selected address. @param kind Requested association kind.
 * @returns Localized name seeds; establishments always require their own name.
 */
export function associationNames(
  address: FeatureAddress,
  kind: AssociationKind,
): Record<string, string> {
  if (kind !== 'premises' && kind !== 'building') return {}
  const field = kind === 'premises' ? 'premisesName' : 'buildingName'
  return Object.fromEntries(
    Object.entries(ADDRESS_LOCALES).flatMap(([locale, tag]) => {
      const value = getAddressLocale(address, locale as keyof typeof ADDRESS_LOCALES)[
        field
      ]
      return typeof value === 'string' && value.trim() ? [[tag, value]] : []
    }),
  )
}

/** Read one comparison group across all languages, including structured unit semantics.
 * @param address Source address. @param group Component group.
 * @returns Stable comparison value used for differences and default choices.
 */
export function addressGroupValue(
  address: FeatureAddress,
  group: AddressChoiceGroup,
): unknown {
  const content = localAddressContent(address)
  return {
    fields: Object.fromEntries(
      Object.keys(ADDRESS_LOCALES).map(locale => [
        locale,
        ADDRESS_CHOICE_GROUPS[group].map(
          field =>
            getAddressLocale(address, locale as keyof typeof ADDRESS_LOCALES)[field] ??
            null,
        ),
      ]),
    ),
    ...(group === 'street' ? { streetId: content.streetId } : {}),
    ...(group === 'floor'
      ? { type: content.unit?.floorType, ref: content.unit?.floorRef }
      : {}),
    ...(group === 'unit'
      ? {
          type: content.unit?.unitType,
          ref: content.unit?.unitRef,
          portion: content.unit?.unitPortion,
        }
      : {}),
  }
}

/** Default populated components to the matched Location and preserve missing original values.
 * @param original Initial Address. @param location Matched Location address.
 * @returns A choice for every independently reviewed component group.
 */
export function defaultAddressChoices(
  original: FeatureAddress,
  location: FeatureAddress,
): AddressChoices {
  // Formatting flags alone do not constitute a value that can replace an original component.
  const hasValue = (address: FeatureAddress, fields: readonly string[]): boolean =>
    Object.keys(ADDRESS_LOCALES).some(locale =>
      fields.some(field => {
        if (
          ['buildingNumberConnector', 'blockType', 'blockTypeBeforeNumber'].includes(
            field,
          )
        )
          return false
        const value = getAddressLocale(address, locale as keyof typeof ADDRESS_LOCALES)[
          field as keyof ReturnType<typeof getAddressLocale>
        ]
        return typeof value === 'string' && Boolean(value.trim())
      }),
    )
  return Object.fromEntries(
    Object.entries(ADDRESS_CHOICE_GROUPS).map(([group, fields]) => {
      const deliberatelyCleared = Object.values(location.overrides).some(row =>
        fields.some(field => Object.hasOwn(row, field) && row[field] === null),
      )
      return [
        group,
        deliberatelyCleared || hasValue(location, fields) || !hasValue(original, fields)
          ? 'location'
          : 'original',
      ]
    }),
  ) as AddressChoices
}

/** Compose selected structured values without rewriting either retained source publication.
 * @param original Original address and pin. @param location Matched Location address.
 * @param choices Per-group choices. @returns Feature-owned reviewed address content.
 * @remarks Street IDs follow street choices, ranges stay atomic, and floor/unit semantics
 * travel with their expressions. Moving the marker is a separate explicit choice.
 */
export function combineAssociationAddress(
  original: FeatureAddress,
  location: FeatureAddress,
  choices: AddressChoices,
): FeatureAddress {
  const contents = {
    original: localAddressContent(original),
    location: localAddressContent(location),
  }
  const content = structuredClone(contents.original)
  const addresses = { original, location }
  for (const [group, fields] of Object.entries(ADDRESS_CHOICE_GROUPS)) {
    const side = choices[group as AddressChoiceGroup]
    for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
      const values = getAddressLocale(
        addresses[side],
        locale as keyof typeof ADDRESS_LOCALES,
      )
      content.i18n[tag] ??= { formattedAddress: '' }
      const row = content.i18n[tag]
      row.formattedAddress = ''
      for (const field of fields) {
        if (field in LocalAddressI18nSchema.shape && (field in row || field in values))
          (row as Record<string, unknown>)[field] = values[field] ?? null
      }
    }
  }
  content.streetId = contents[choices.street].streetId
  const floorText = String(
    getAddressLocale(addresses[choices.floor], 'en').floorExpression ?? '',
  )
  const unitText = String(
    getAddressLocale(addresses[choices.unit], 'en').unitExpression ?? '',
  )
  const floor =
    contents[choices.floor].unit ?? (floorText ? parseFloor(floorText) : null)
  const unit = contents[choices.unit].unit ?? (unitText ? parseUnit(unitText) : null)
  content.unit =
    floor || unit
      ? {
          floorRef: floor?.floorRef ?? '',
          floorType: floor?.floorType ?? 'F',
          unitRef: unit?.unitRef ?? '',
          unitType: unit?.unitType ?? 'U',
          unitPortion: unit?.unitPortion ?? null,
        }
      : null
  content.unitI18n = !content.unit
    ? {}
    : (Object.fromEntries(
        Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => [
          tag,
          {
            floorExpression: String(
              getAddressLocale(
                addresses[choices.floor],
                locale as keyof typeof ADDRESS_LOCALES,
              ).floorExpression ?? '',
            ),
            unitExpression: String(
              getAddressLocale(
                addresses[choices.unit],
                locale as keyof typeof ADDRESS_LOCALES,
              ).unitExpression ?? '',
            ),
          },
        ]),
      ) as LocalLocationAddress['unitI18n'])
  return {
    ...original,
    overrides: {},
    unitDetails: undefined,
    accessHints: structuredClone(addresses[choices.access].accessHints),
    association: {
      originKind: original.association?.originKind ?? 'address',
      kind: 'establishment',
      mode: 'linked',
      lookup: 'matched',
      names: {},
      originalSource: structuredClone(original.source),
      matchedSource: structuredClone(location.source),
      content,
      choices,
    },
  }
}

/** Split a published building label only when known premises and an explicit block term support it.
 * @param address Candidate address; immutable source evidence is retained.
 * @param context Original Address supplying known premises names.
 * @returns Reviewed component overrides, without renaming the Location identity.
 * @remarks A named tower such as Bank of China Tower remains a building name. No premises
 * is inferred from an arbitrary name prefix, and conflicting structured blocks are retained.
 */
export function normalizeAssociationComponents(
  address: FeatureAddress,
  context: FeatureAddress = address,
): FeatureAddress {
  let result = address
  for (const locale of Object.keys(ADDRESS_LOCALES) as LocaleKey[]) {
    const fields = getAddressLocale(address, locale)
    const building = String(fields.buildingName ?? '').trim()
    if (!building) continue
    const premises = String(
      fields.premisesName || getAddressLocale(context, locale).premisesName || '',
    ).trim()
    const escapePattern = (value: string): string =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let remainder = building
    let removedPremises = false
    if (premises) {
      if (building.toLocaleLowerCase() === premises.toLocaleLowerCase()) {
        remainder = ''
        removedPremises = true
      } else {
        const prefix = new RegExp(
          `^${escapePattern(premises)}[\\s,·–—-]+(.+)$`,
          'iu',
        ).exec(building)
        const suffix = new RegExp(
          `^(.+?)[\\s,·–—-]+${escapePattern(premises)}$`,
          'iu',
        ).exec(building)
        if (prefix || suffix) {
          remainder = (prefix ?? suffix)![1].trim()
          removedPremises = true
        }
      }
    }
    const parsed = parseAddressExpression('blockExpression', remainder)
    // A proper Chinese building name is not a block reference merely because it ends in 大廈.
    const explicitBlock =
      typeof parsed.blockType === 'string' &&
      typeof parsed.blockRef === 'string' &&
      /^(?:[A-Za-z0-9][A-Za-z0-9/-]{0,15}|[零〇一二三四五六七八九十百]+)$/.test(
        parsed.blockRef,
      )
    if ((!removedPremises && !explicitBlock) || (remainder && !explicitBlock)) continue
    if (
      explicitBlock &&
      fields.blockRef &&
      String(fields.blockRef).toLocaleLowerCase() !==
        String(parsed.blockRef).toLocaleLowerCase()
    )
      continue
    if (removedPremises)
      result = setAddressExpression(result, locale, 'premisesName', premises)
    result = setAddressExpression(result, locale, 'buildingName', '')
    if (explicitBlock)
      result = setAddressExpression(result, locale, 'blockExpression', remainder)
  }
  return result
}

export type AddressReviewEdits = Partial<
  Record<AddressChoiceGroup, Partial<Record<LocaleKey, string>>>
>
export type AssociationUnitEdits = {
  floor?: { type: FloorType; reference: string }
  unit?: { type: UnitType; reference: string; customType?: string; locale: LocaleKey }
}

/** Apply user-authored corrections when neither source is right, retaining the selected Location.
 * @param address Combined source choices. @param edits Localized, structured component corrections.
 * @param streetId Explicitly selected catalogue street identity, if any.
 * @param units Shared floor/unit type and reference corrections.
 * @returns Feature-owned edits with explicit custom provenance; source publications stay untouched.
 */
export function editAssociationAddress(
  address: FeatureAddress,
  edits: AddressReviewEdits,
  streetId?: string,
  units: AssociationUnitEdits = {},
): FeatureAddress {
  let result = address
  for (const [group, values] of Object.entries(edits) as [
    AddressChoiceGroup,
    Partial<Record<LocaleKey, string>>,
  ][]) {
    const field = ADDRESS_CHOICE_GROUPS[group][0]
    for (const [locale, value] of Object.entries(values) as [LocaleKey, string][]) {
      result =
        field === 'floorExpression' || field === 'unitExpression'
          ? setStructuredAddressExpression(result, locale, field, value)
          : setAddressExpression(result, locale, field, value)
    }
    if (result.association)
      result = {
        ...result,
        association: {
          ...result.association,
          choices: { ...result.association.choices, [group]: 'custom' },
        },
      }
  }
  // Shared identifiers use the same semantic setters as the regular address form.
  if (units.floor)
    result = setAddressFloorReference(result, units.floor.reference, units.floor.type)
  if (units.unit)
    result =
      units.unit.type === 'X'
        ? setCustomAddressUnit(
            result,
            units.unit.locale,
            units.unit.reference,
            units.unit.customType ?? '',
          )
        : setStructuredAddressExpression(
            result,
            units.unit.locale,
            'unitExpression',
            units.unit.reference,
            units.unit.type,
          )
  if (result.association && Object.keys(units).length)
    result = {
      ...result,
      association: {
        ...result.association,
        choices: {
          ...result.association.choices,
          ...Object.fromEntries(
            Object.keys(units).map(group => [group, 'custom' as const]),
          ),
        },
      },
    }
  // A corrected street uses only an explicitly chosen catalogue identity; free text cannot retain a source ID.
  if (edits.street && result.association?.content)
    result = {
      ...result,
      association: {
        ...result.association,
        content: { ...result.association.content, streetId },
      },
    }
  return result
}
