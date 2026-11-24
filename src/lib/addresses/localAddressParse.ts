// SHARED ADDRESS CONTRACT
import {
  createPlaceAddressMatcher,
  parsePlaceAddress,
  type AddressParseResult,
  type PlaceAddressMatcher,
} from '@saanseoi/address'
// ADDRESS
import { catalogueStreetDefinitions, type AddressName } from './nameCatalogue'
import { parseAddressContent } from './parseAddress'
import { parseStreetNumber } from './streetNumber'
import { withSimplifiedChinese } from './chinese'

type StreetIndex = PlaceAddressMatcher['streetsByLongestName']
const streetIndexes = new WeakMap<AddressName[], StreetIndex>()

/** Prepare and cache public street spellings for the lifetime of a catalogue release.
 * @param streets Immutable inventory from the shared names loader.
 * @returns Longest-name-first street index for the shared parser.
 */
function streetIndex(streets: AddressName[]): StreetIndex {
  const cached = streetIndexes.get(streets)
  if (cached) return cached
  const names = catalogueStreetDefinitions(streets)
  // The shared dictionary indexes Chinese under zh-hant. Register script variants as
  // spelling aliases for the same street so Simplified input keeps its own spelling.
  for (const street of streets) {
    const localized = withSimplifiedChinese(street.names)
    if (localized['zh-hans'] && localized['zh-hans'] !== localized['zh-hant'])
      names.push({ locale: 'zh-hant', name: localized['zh-hans'], streetId: street.id })
  }
  const index = createPlaceAddressMatcher([], names).streetsByLongestName
  streetIndexes.set(streets, index)
  return index
}

/** Locate the complete number around a Chinese street before the matcher removes punctuation.
 * @param label Original localized text.
 * @param street Matched catalogue spelling.
 * @returns Number expression and the remaining source text, when its boundaries are clear.
 */
function chineseStreetNumber(
  label: string,
  street: string,
): { expression: string; remainder: string } | null {
  if (!/\p{Script=Han}/u.test(street)) return null
  const source = label.normalize('NFKC')
  const start = source.lastIndexOf(street)
  if (start < 0) return null
  const before = source.slice(0, start)
  const after = source.slice(start + street.length)
  // A trailing 號/号 distinguishes post-street numbers from building, floor and unit references.
  const following =
    /^\s*([0-9]+[A-Z]?(?:\s*[-–—至、,&及與和/]\s*(?:[0-9]+[A-Z]?|[A-Z]))?)\s*[號号]/i.exec(
      after,
    )
  const preceding =
    !following &&
    /([0-9]+[A-Z]?(?:\s*[-–—至、,&及與和/]\s*(?:[0-9]+[A-Z]?|[A-Z]))?)\s*[號号]?\s*$/i.exec(
      before,
    )
  const match = following || preceding
  if (!match) return null
  const number = parseStreetNumber(match[1])
  if (!number.valid) return null
  const remainder = following
    ? [before, after.slice(following[0].length)]
    : [before.slice(0, match.index), after]
  return { expression: number.number.expression, remainder: remainder.join(' ') }
}

/** Parse the display fields in the current editor and enrich the existing authored components.
 * @param input Current authored components and exact localized source strings.
 * @param streets Published vocabulary for street and adjacent number matching.
 * @returns Reviewable content, exact input labels and unresolved text.
 */
export function proposeLocalAddressParse(
  input: Pick<AddressParseResult, 'content' | 'source'>,
  streets: AddressName[],
): AddressParseResult {
  const content = { ...input.content, i18n: { ...input.content.i18n } }
  // Existing component names can account for text in the review without resolving a new identity.
  const known = Object.entries(content.i18n).map(([tag, row]) => ({
    addressId: '',
    locale: tag === 'zh-hans' ? 'zh-hant' : tag,
    formattedAddress: null,
    buildingName: row.buildingName ?? null,
    premisesName: row.premisesName ?? null,
    blockExpression: row.blockExpression ?? null,
    phaseExpression: row.phaseExpression ?? null,
    buildingNumberExpression: null,
    buildingNumberFrom: null,
    buildingNumberTo: null,
    streetName: null,
  }))
  const matcher = {
    componentsByLongestName: createPlaceAddressMatcher(known).componentsByLongestName,
    streetsByLongestName: streetIndex(streets),
  }
  const parsed = parseAddressContent(input.source, matcher)
  for (const [tag, fields] of Object.entries(parsed.content.i18n)) {
    const chineseNumber =
      fields.streetName &&
      fields.buildingNumberExpression &&
      chineseStreetNumber(input.source[tag], fields.streetName)
    if (chineseNumber) {
      fields.buildingNumberExpression = chineseNumber.expression
      const remaining = parsePlaceAddress(chineseNumber.remainder, {
        componentsByLongestName: matcher.componentsByLongestName,
        streetsByLongestName: [],
      }).unclassified2dText
      if (remaining) parsed.unresolved[tag] = remaining
      else delete parsed.unresolved[tag]
    }
    const row = { ...content.i18n[tag], ...fields }
    // A newly matched street cannot inherit the previous street's number.
    if (
      fields.buildingNumberExpression ||
      (fields.streetName &&
        content.i18n[tag]?.streetName &&
        fields.streetName.toLowerCase() !== content.i18n[tag].streetName?.toLowerCase())
    ) {
      const number = parseStreetNumber(fields.buildingNumberExpression ?? '')
      row.buildingNumberExpression = fields.buildingNumberExpression ?? null
      row.buildingNumberFrom = number.valid ? number.number.from : null
      row.buildingNumberTo = number.valid ? number.number.to : null
      row.buildingNumberConnector = number.valid ? number.number.connector : null
    }
    content.i18n[tag] = row
  }
  if (parsed.content.unit) {
    content.unit = {
      ...parsed.content.unit,
      unitPortion: content.unit?.unitPortion ?? null,
    }
    content.unitI18n = parsed.content.unitI18n
  }
  return { ...parsed, content }
}
