// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { FeatureAddress } from '#lib/addresses/featureAddress.js'
import type { LocaleKey } from '#lib/types.js'

export type LocationMatchSeed = {
  query: string
  kind: 'establishment' | 'building' | 'premises' | 'address'
}

/** Read retained legacy components without accepting them as canonical address facts.
 * @param address Editor envelope. @param locale Requested content locale.
 * @returns String-valued legacy fields used only to seed an editable search.
 */
function legacyFields(
  address: FeatureAddress,
  locale: LocaleKey,
): Record<string, unknown> {
  const legacy = address.legacy?.i18n
  if (!legacy || typeof legacy !== 'object') return {}
  const row =
    (legacy as Record<string, unknown>)[ADDRESS_LOCALES[locale]] ??
    (legacy as Record<string, unknown>)[locale] ??
    (legacy as Record<string, unknown>).en
  if (!row || typeof row !== 'object' || !('addressProperties' in row)) return {}
  const fields = row.addressProperties
  return fields && typeof fields === 'object' ? (fields as Record<string, unknown>) : {}
}

/** Seed an editable identity search from the most specific meaningful component.
 * @param name Known establishment name, if any. @param address Current address.
 * @param locale Editor locale. @returns Establishment, building, complex or street query, excluding unit/floor text.
 * @remarks Legacy fields are search hints only; this function never changes address facts or accepts identities.
 */
export function locationMatchSeeds(
  name: string,
  address: FeatureAddress,
  locale: LocaleKey,
): LocationMatchSeed[] {
  const seeds: LocationMatchSeed[] = []
  const title = name.trim()
  if (title && !/^(new|untitled)\s+(feature|location)$/i.test(title))
    seeds.push({ query: title.slice(0, 200), kind: 'establishment' })
  const current = getAddressLocale(address, locale)
  const legacy = legacyFields(address, locale)
  const text = (key: string): string => {
    const primary = current[key as keyof typeof current]
    const value = typeof primary === 'string' && primary.trim() ? primary : legacy[key]
    return typeof value === 'string' ? value.trim() : ''
  }
  for (const [field, kind] of [
    ['buildingName', 'building'],
    ['premisesName', 'premises'],
  ] as const) {
    const query = text(field)
    if (query) seeds.push({ query: query.slice(0, 200), kind })
  }
  const street = text('streetName')
  if (street)
    seeds.push({
      kind: 'address',
      query: [
        text('buildingNumberExpression') ||
          [text('buildingNumberFrom'), text('buildingNumberTo')]
            .filter(Boolean)
            .join('-'),
        street,
      ]
        .filter(Boolean)
        .join(' ')
        .slice(0, 200),
    })
  // Display-only imports still offer useful building/complex/street fragments after removing unit labels.
  const parts = getAddressDisplay(address, locale)
    .split(/[,，]/)
    .map(value => value.trim())
    .filter(
      value =>
        value &&
        !/^[零一二三四五六七八九十百\d]+\s*[樓楼層层室]$/.test(value) &&
        !/^(?:flat|room|shop|unit|suite|floor|level)\b|^(?:\d+|g|ug|lg|b)\s*\/?f\b/i.test(
          value,
        ),
    )
  const building = parts.find(value =>
    /\b(building|bldg|house|hse|mansion|tower)\b|大廈|大厦|樓|楼/i.test(value),
  )
  if (building) {
    // Unpunctuated Chinese imports commonly put the building immediately after the street number.
    const namedBuilding = building.match(
      /(?:號|号)\s*([^,，]+?(?:大廈|大厦|大樓|大楼))/,
    )?.[1]
    if (!seeds.some(seed => seed.kind === 'building'))
      seeds.push({ kind: 'building', query: (namedBuilding ?? building).slice(0, 200) })
  }
  const complex = parts.find(value =>
    /\b(estate|mall|plaza|centre|center)\b|屋邨|商場|商场/i.test(value),
  )
  if (complex && !seeds.some(seed => seed.kind === 'premises'))
    seeds.push({ kind: 'premises', query: complex.slice(0, 200) })
  if (!street)
    seeds.push({
      kind: 'address',
      query: (
        parts.find(value =>
          /\b(road|rd|street|st|avenue|ave|lane|circuit)\b|街|道|路/i.test(value),
        ) ?? ''
      ).slice(0, 200),
    })
  const order = ['establishment', 'building', 'premises', 'address']
  return seeds
    .filter(
      (seed, index) =>
        seed.query &&
        seeds.findIndex(
          other => other.query.toLowerCase() === seed.query.toLowerCase(),
        ) === index,
    )
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
}

/** Return the first meaningful search hint.
 * @param name Establishment name. @param address Current address. @param locale Editor locale.
 * @returns Most specific query, or an empty address query.
 */
export function locationMatchSeed(
  name: string,
  address: FeatureAddress,
  locale: LocaleKey,
): LocationMatchSeed {
  return locationMatchSeeds(name, address, locale)[0] ?? { kind: 'address', query: '' }
}
