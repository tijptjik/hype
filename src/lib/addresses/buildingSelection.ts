// ADDRESS
import { buildingNames } from './buildingNames.js'
import {
  ADDRESS_LOCALES,
  emptyFeatureAddress,
  getAddressLocale,
  setAddressOverride,
} from './featureAddress'
import { parseAddressContent, createPlaceAddressMatcher } from '@saanseoi/address'
// TYPES
import type { AddressField, FeatureAddress } from './featureAddress'
import type { AddressName } from './nameCatalogue'
import type {
  BuildingDetails,
  BuildingAddressCandidate,
} from '#lib/sources/saanseoi.js'
import type { LocaleKey } from '#lib/types.js'

/** Fill only empty editable fields from a selected building and an explicit address candidate.
 * @param address Latest draft, including edits made while the projection loaded.
 * @param building Selected published name. @param details Release-pinned geometry and candidates.
 * @param candidate One candidate, or undefined when there is no unambiguous choice.
 * @param hasLocation Whether the user has already positioned the feature.
 * @param locale Language in which the user selected the building label.
 * @param streets Controlled street vocabulary used by the shared parser.
 * @returns A corrected draft without overwriting authored data or inventing canonical IDs.
 */
export function fillBuildingDetails(
  address: FeatureAddress,
  building: AddressName,
  details: BuildingDetails,
  candidate: BuildingAddressCandidate | undefined,
  hasLocation: boolean,
  locale: LocaleKey,
  streets: AddressName[] = [],
): FeatureAddress {
  let next = { ...address, overrides: { ...address.overrides } }
  if (!hasLocation) next.coordinates = [...details.coordinates]
  const source = emptyFeatureAddress(candidate?.display ?? {})
  const names = buildingNames(building.names, building.name)
  const matcher = createPlaceAddressMatcher(
    Object.entries(names).map(([locale, buildingName]) => ({
      addressId: building.id,
      locale,
      formattedAddress: null,
      buildingName,
      buildingNumberExpression: null,
      buildingNumberFrom: null,
      buildingNumberTo: null,
      blockExpression: null,
      phaseExpression: null,
      premisesName: null,
      streetName: null,
    })),
    streets.flatMap(street =>
      Object.entries(street.names).map(([locale, name]) => ({
        locale: locale.toLowerCase(),
        name,
        streetId: street.id,
      })),
    ),
  )
  const parsed = candidate
    ? parseAddressContent(candidate.display, matcher).content
    : undefined
  if (parsed) source.source.authored = parsed
  for (const [key, tag] of Object.entries(ADDRESS_LOCALES)) {
    const language = key as LocaleKey
    const original = getAddressLocale(address, language)
    const components = getAddressLocale(source, language)
    const name =
      Object.entries(names).find(
        ([code]) => code.toLowerCase() === tag.toLowerCase(),
      )?.[1] || (language === 'en' ? building.name : undefined)
    // Expand the shared parser's unambiguous number expression into editor fields.
    const number = /^(\d+[A-Za-z]?)(?:\s*[-–]\s*(\d+[A-Za-z]?))?$/.exec(
      String(components.buildingNumberExpression ?? ''),
    )
    if (number) {
      components.buildingNumberFrom = number[1]
      components.buildingNumberTo = number[2] ?? null
      components.buildingNumberConnector = number[2] ? '-' : null
    }
    const parsedAddress = Boolean(
      components.streetName || components.buildingNumberFrom || components.premisesName,
    )
    const numberFields = [
      'buildingNumberExpression',
      'buildingNumberFrom',
      'buildingNumberTo',
      'buildingNumberConnector',
    ] as const
    const keepNumber =
      numberFields.some(
        field =>
          Boolean(original[field]) ||
          Object.hasOwn(address.overrides[tag] ?? {}, field),
      ) ||
      Boolean(
        original.streetName &&
          components.streetName &&
          String(original.streetName).toLocaleLowerCase() !==
            String(components.streetName).toLocaleLowerCase(),
      )
    if (name) components.buildingName = name
    for (const [field, value] of Object.entries(components)) {
      if (
        field === 'formattedAddress' ||
        (field.startsWith('buildingNumber') && keepNumber) ||
        value === null ||
        value === undefined ||
        value === '' ||
        (original[field as AddressField] !== undefined &&
          original[field as AddressField] !== null &&
          original[field as AddressField] !== '') ||
        Object.hasOwn(address.overrides[tag] ?? {}, field)
      )
        continue
      next = setAddressOverride(next, language, field as AddressField, value)
    }
    // Keep unparsed source text visible without replacing a complete user-authored label.
    if (
      candidate &&
      !original.formattedAddress &&
      !Object.hasOwn(address.overrides[tag] ?? {}, 'formattedAddress') &&
      !address.source.fallbackDisplay[tag] &&
      !original.streetName &&
      !parsedAddress
    ) {
      const text = Object.entries(candidate.display).find(
        ([code]) => code.toLowerCase() === tag.toLowerCase(),
      )?.[1]
      if (text) next = setAddressOverride(next, language, 'formattedAddress', text)
    }
  }
  return next
}
