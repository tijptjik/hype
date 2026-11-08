// SHARED ADDRESS PARSER
import { createPlaceAddressMatcher, parseAddressContent } from '@saanseoi/address'
// VALIDATION
import { z } from 'zod'
// SOURCES
import { loadSaanseoiNames, loadBuildingNames } from '#lib/sources/saanseoi.js'
// ADDRESS
import { ADDRESS_LOCALES, getAddressLocale, setAddressOverride } from './featureAddress'
import { prepareLocalLocationAddress } from './locationDraft'
// TYPES
import type { FeatureAddress } from './featureAddress'

export const AddressNameSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().optional(),
  release: z.string().optional(),
  names: z.record(z.string(), z.string()),
  divisionCodes: z.array(z.string()),
})
export type AddressName = z.infer<typeof AddressNameSchema>
/** Load provider names through the shared daily dataset cache.
 * @param family Controlled vocabulary to retrieve.
 * @returns Named records only; absent translations are never fabricated.
 */
export async function loadAddressNames(
  family: 'streets' | 'buildings',
): Promise<AddressName[]> {
  const bundle = family === 'buildings' ? await loadBuildingNames() : null
  const rows = bundle?.records ?? (await loadSaanseoiNames(family))
  return rows.flatMap(row => {
    const names = Object.fromEntries(
      Object.entries(row.names).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    )
    return Object.keys(names).length || row.name
      ? [
          {
            id: row.id,
            name: row.name,
            release: bundle?.release,
            names,
            divisionCodes: row.divisionCodes,
          },
        ]
      : []
  })
}

/** Apply all published translations together without fabricating missing translations.
 * @param address Current draft. @param field Controlled name field.
 * @param record Explicitly chosen record, or null to clear the name.
 * @returns Draft corrections; source evidence and identity remain untouched.
 */
export function setAddressName(
  address: FeatureAddress,
  field: 'streetName' | 'buildingName',
  record: AddressName | null,
): FeatureAddress {
  for (const [locale, tag] of Object.entries(ADDRESS_LOCALES)) {
    const value = Object.entries(record?.names ?? {}).find(
      ([key]) => key.toLowerCase() === tag.toLowerCase(),
    )?.[1]
    address = setAddressOverride(
      address,
      locale as keyof typeof ADDRESS_LOCALES,
      field,
      value ?? null,
    )
  }
  return address
}

/** Parse an unassociated Place address, accepting English streets only from the catalogue.
 * @param address Selected preview, with original text retained as evidence.
 * @param streets Controlled street vocabulary.
 * @returns A local structured draft; never an invented canonical address association.
 */
export function structurePlaceAddress(
  address: FeatureAddress,
  streets: AddressName[],
): FeatureAddress {
  if (
    address.source.address2dId ||
    address.source.canonical ||
    address.canonical ||
    address.source.authored
  )
    return address
  const content = prepareLocalLocationAddress(address)
  // Match compound source addresses against the same street vocabulary used by the pickers.
  const matcher = createPlaceAddressMatcher(
    [],
    streets.flatMap(street =>
      Object.entries(street.names).map(([locale, name]) => ({
        locale: locale.toLowerCase(),
        name,
        streetId: street.id,
      })),
    ),
  )
  // A bare unit reference is usable only alongside an explicit floor and named mall.
  // This source-text pattern proposes editable components, never a canonical identity.
  const mallUnit =
    /^([A-Z]\d+[A-Z]?),\s*((?:\d+|G|UG|LG|B\d*)\/F),\s*(.+\bMall(?:\s+[IVX]+|\s+\d+)?)$/i.exec(
      address.source.fallbackDisplay.en?.trim() ?? '',
    )
  const labels = mallUnit
    ? {
        ...address.source.fallbackDisplay,
        en: `Unit ${mallUnit[1]}, ${mallUnit[2]}, ${mallUnit[3]}`,
      }
    : address.source.fallbackDisplay
  const parsed = parseAddressContent(labels, matcher).content
  if (mallUnit)
    parsed.i18n.en = {
      ...parsed.i18n.en,
      premisesName: mallUnit[3],
      formattedAddress: '',
    }
  if (parsed.unit) {
    content.unit = parsed.unit
    content.unitI18n = parsed.unitI18n
  }
  for (const [locale, fields] of Object.entries(parsed.i18n)) {
    if (fields.streetName || fields.buildingName || fields.premisesName)
      content.i18n[locale] = { ...content.i18n[locale], ...fields }
  }
  const english = address.source.fallbackDisplay.en?.trim() ?? ''
  const match = /^(\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?)\s+(.+)$/.exec(english)
  const street =
    match && streets.find(row => row.names.en?.toLowerCase() === match[2].toLowerCase())
  if (match && street) {
    const [from, to] = match[1].split(/\s*[-–]\s*/)
    content.i18n.en = {
      ...content.i18n.en,
      formattedAddress: '',
      streetName: street.names.en,
      buildingNumberFrom: from,
      buildingNumberTo: to ?? null,
      buildingNumberConnector: to ? '-' : null,
      buildingNumberExpression: match[1],
    }
    content.scope = 'building'
  }
  // Do not install an unstructured parser result merely to replace identical source text.
  if (
    !content.unit &&
    !Object.values(content.i18n).some(
      row => row.streetName || row.buildingName || row.premisesName,
    )
  )
    return address
  const next = { ...address, source: { ...address.source, authored: content } }
  // A structured correction lets display composition use the parsed components.
  for (const locale of Object.keys(ADDRESS_LOCALES) as Array<
    keyof typeof ADDRESS_LOCALES
  >) {
    const row = getAddressLocale(next, locale)
    if (row.streetName) {
      next.overrides = setAddressOverride(
        next,
        locale,
        'streetName',
        row.streetName,
      ).overrides
    }
  }
  return next
}
