// SHARED ADDRESS PARSER
import { createPlaceAddressMatcher } from '@saanseoi/address'
import { parseAddressContent } from '#lib/addresses/parseAddress.js'
// VALIDATION
import { z } from 'zod'
// SOURCES
import { loadSaanseoiNames, loadBuildingNames } from '#lib/sources/saanseoi.js'
import { SOURCE_TTL_MS } from '#lib/sources/cache.js'
// ADDRESS
import { ADDRESS_LOCALES, getAddressLocale, setAddressOverride } from './featureAddress'
import { prepareLocalLocationAddress } from './locationDraft'
import { normalizeNameSearch } from './nameSearch'
import { addressName, applyAddressAbbreviations } from './formatting'
import { withSimplifiedChinese } from './chinese'
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
// Retain the adapted vocabulary too: locale pickers share one immutable inventory.
const catalogues = new Map<
  'streets' | 'buildings',
  { expiresAt: number; pending: Promise<AddressName[]> }
>()
/** Load provider names through the shared daily dataset cache.
 * @param family Controlled vocabulary to retrieve.
 * @returns Named records only; absent translations are never fabricated.
 */
export function loadAddressNames(
  family: 'streets' | 'buildings',
): Promise<AddressName[]> {
  const cached = catalogues.get(family)
  if (cached && cached.expiresAt > Date.now()) return cached.pending
  const pending = adaptAddressNames(family).catch(error => {
    if (catalogues.get(family)?.pending === pending) catalogues.delete(family)
    throw error
  })
  catalogues.set(family, { expiresAt: Date.now() + SOURCE_TTL_MS, pending })
  return pending
}

/** Adapt one source inventory for all mounted locale pickers.
 * @param family Controlled vocabulary to retrieve.
 * @returns Named records; callers replace the inventory rather than mutating it.
 */
async function adaptAddressNames(
  family: 'streets' | 'buildings',
): Promise<AddressName[]> {
  const bundle = family === 'buildings' ? await loadBuildingNames() : null
  const rows = bundle?.records ?? (await loadSaanseoiNames(family))
  return rows.flatMap(row => {
    const names = Object.fromEntries(
      Object.entries(row.names)
        .filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === 'string' && entry[1].length > 0,
        )
        .map(([tag, name]) => [
          tag,
          tag.toLowerCase() === 'en' ? addressName(name, 'en') : name,
        ]),
    )
    return Object.keys(names).length || row.name
      ? [
          {
            id: row.id,
            name: row.name ? addressName(row.name, 'en') : row.name,
            release: bundle?.release,
            names,
            divisionCodes: row.divisionCodes,
          },
        ]
      : []
  })
}

/** Complete missing provider street names from one unambiguous catalogue record.
 * @param address Current editor draft. @param streets Published street catalogue.
 * @returns The original draft when nothing is missing, otherwise locale-only name corrections.
 * @remarks Existing text, explicit removals, source evidence and identity are preserved. Simplified Chinese is derived from published Traditional Chinese when necessary.
 */
export function completeStreetNames(
  address: FeatureAddress,
  streets: AddressName[],
): FeatureAddress {
  const existing = Object.entries(ADDRESS_LOCALES).map(([locale, tag]) => ({
    locale: locale as keyof typeof ADDRESS_LOCALES,
    tag,
    value: String(
      getAddressLocale(address, locale as keyof typeof ADDRESS_LOCALES).streetName ??
        '',
    ).trim(),
  }))
  const missing = existing.filter(
    ({ tag, value }) =>
      !value && !Object.hasOwn(address.overrides[tag] ?? {}, 'streetName'),
  )
  if (!missing.length) return address
  // Resolve the vocabulary identity before borrowing any of its localized names.
  const names = new Set(
    existing
      .filter(({ value }) => value)
      .map(({ value }) => normalizeNameSearch(value)),
  )
  if (!names.size) return address
  const matches = streets.filter(street =>
    [...Object.values(withSimplifiedChinese(street.names)), street.name ?? ''].some(
      name => name && names.has(normalizeNameSearch(name)),
    ),
  )
  if (matches.length !== 1) return address
  const published = Object.fromEntries(
    Object.entries(withSimplifiedChinese(matches[0].names)).map(([tag, name]) => [
      tag.toLowerCase(),
      name,
    ]),
  )
  let next = address
  for (const { locale, tag } of missing) {
    const name = published[tag] || (locale === 'en' ? matches[0].name : undefined)
    if (name?.trim()) next = setAddressOverride(next, locale, 'streetName', name)
  }
  return next
}

/** Apply published names with a Traditional-to-Simplified script fallback.
 * @param address Current draft. @param field Controlled name field.
 * @param record Explicitly chosen record, or null to clear the name.
 * @returns Draft corrections; missing translations are explicitly cleared. Source evidence and identity remain untouched.
 * @remarks The catalogue's default English name is an English-only fallback; it never supplies missing Chinese translations.
 */
export function setAddressName(
  address: FeatureAddress,
  field: 'streetName' | 'buildingName',
  record: AddressName | null,
): FeatureAddress {
  const content =
    address.association?.content ??
    address.canonical?.content ??
    address.source.canonical?.content ??
    address.source.authored
  const raw = address.source.rawSource.data as
    | { attributes?: { i18n?: Record<string, unknown> } }
    | undefined
  // Clear prior localized names even when the new catalogue record omits their language.
  const tags = new Set(
    [
      ...Object.values(ADDRESS_LOCALES),
      ...Object.keys(address.overrides),
      ...Object.keys(content?.i18n ?? raw?.attributes?.i18n ?? {}),
      ...Object.keys(address.detachedNames?.[field] ?? {}),
      ...Object.keys(record?.names ?? {}),
    ].map(tag => tag.toLowerCase()),
  )
  for (const tag of tags) {
    const value =
      Object.entries(withSimplifiedChinese(record?.names ?? {})).find(
        ([key]) => key.toLowerCase() === tag.toLowerCase(),
      )?.[1] || (tag === 'en' ? record?.name : undefined)
    address = setAddressOverride(address, tag, field, value ?? null)
  }
  return address
}

/** Parse an unassociated Place address, accepting English streets only from the catalogue.
 * @param address Selected preview, with original text retained as evidence.
 * @param streets Controlled street vocabulary.
 * @param buildings Published building names for exact component matches.
 * @returns A local structured draft; never an invented canonical address association.
 */
export function structurePlaceAddress(
  address: FeatureAddress,
  streets: AddressName[],
  buildings: AddressName[] = [],
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
  const directions: Record<string, string> = {
    NORTH: 'N',
    SOUTH: 'S',
    EAST: 'E',
    WEST: 'W',
  }
  const streetDefinitions = streets.flatMap(street =>
    Object.entries(street.names).flatMap(([locale, name]) => {
      const shortDirection =
        locale === 'en'
          ? name.replace(
              /\b(NORTH|SOUTH|EAST|WEST)$/i,
              word => directions[word.toUpperCase()],
            )
          : name
      return [...new Set([name, shortDirection])].map(alias => ({
        locale: locale.toLowerCase(),
        name: alias,
        streetId: street.id,
      }))
    }),
  )
  // Limit the large building vocabulary to names present in this source text; never guess a translation.
  const labelsKey = Object.values(address.source.fallbackDisplay).map(value =>
    normalizeNameSearch(applyAddressAbbreviations(value)),
  )
  const matchingBuildings = buildings.filter(building =>
    Object.values(building.names).some(name => {
      const key = normalizeNameSearch(applyAddressAbbreviations(name))
      return key.length > 3 && labelsKey.some(label => label.includes(key))
    }),
  )
  const buildingDefinitions = matchingBuildings.flatMap(building =>
    Object.entries(building.names).map(([locale, name]) => ({
      addressId: building.id,
      locale: locale.toLowerCase(),
      formattedAddress: null,
      buildingName: name,
      buildingNumberExpression: null,
      buildingNumberFrom: null,
      buildingNumberTo: null,
      blockExpression: null,
      phaseExpression: null,
      premisesName: null,
      streetName: null,
    })),
  )
  const matcher = createPlaceAddressMatcher(buildingDefinitions, streetDefinitions)
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
    // Keep the parser's 2D remainder: the original source string still includes the extracted unit.
    content.i18n[locale] = { ...content.i18n[locale], ...fields }
    const matched = streetDefinitions.filter(
      row =>
        row.locale === locale &&
        normalizeNameSearch(row.name) === normalizeNameSearch(fields.streetName ?? ''),
    )
    const ids = [...new Set(matched.map(row => row.streetId))]
    if (ids.length === 1)
      content.i18n[locale].streetName =
        streets.find(row => row.id === ids[0])?.names[
          locale === 'en' ? 'en' : locale === 'zh-hant' ? 'zh-Hant' : 'zh-Hans'
        ] ?? fields.streetName
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
  // Carry the matched street's published translations and shared number into each language.
  // Never replace a different source street or discard unparsed translated source text.
  for (const fields of Object.values({ ...content.i18n })) {
    if (!fields.streetName) continue
    const matches = streets.filter(candidate =>
      Object.values(candidate.names).some(
        name => normalizeNameSearch(name) === normalizeNameSearch(fields.streetName!),
      ),
    )
    if (matches.length !== 1) continue
    for (const [locale, name] of Object.entries(
      withSimplifiedChinese(matches[0].names),
    )) {
      const tag = locale.toLowerCase()
      if (!Object.values(ADDRESS_LOCALES).some(value => value === tag)) continue
      const existing = content.i18n[tag]
      if (
        existing?.streetName &&
        normalizeNameSearch(existing.streetName) !== normalizeNameSearch(name)
      )
        continue
      if (!existing?.streetName && address.source.fallbackDisplay[tag]?.trim()) continue
      content.i18n[tag] = {
        ...existing,
        streetName: name,
        buildingNumberFrom: existing?.buildingNumberFrom || fields.buildingNumberFrom,
        buildingNumberTo: existing?.buildingNumberTo || fields.buildingNumberTo,
        buildingNumberConnector:
          existing?.buildingNumberConnector || fields.buildingNumberConnector,
        buildingNumberExpression:
          existing?.buildingNumberExpression || fields.buildingNumberExpression,
      }
    }
  }
  // Copy only unambiguous published building translations; identity and original source evidence stay separate.
  for (const fields of Object.values({ ...content.i18n })) {
    if (!fields.buildingName) continue
    const matches = matchingBuildings.filter(candidate =>
      Object.values(candidate.names).some(
        name => normalizeNameSearch(name) === normalizeNameSearch(fields.buildingName!),
      ),
    )
    if (matches.length !== 1) continue
    for (const [locale, name] of Object.entries(
      withSimplifiedChinese(matches[0].names),
    )) {
      const tag = locale.toLowerCase()
      if (!Object.values(ADDRESS_LOCALES).some(value => value === tag)) continue
      const existing = content.i18n[tag]
      if (
        existing?.buildingName ||
        (!existing?.streetName && address.source.fallbackDisplay[tag]?.trim())
      )
        continue
      content.i18n[tag] = {
        ...existing,
        formattedAddress: existing?.formattedAddress ?? '',
        buildingName: name,
      }
    }
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
