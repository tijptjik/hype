// TYPES
import type { AddressName } from './nameCatalogue.js'
import type { LocaleKey } from '#lib/types.js'

/** Build a punctuation-insensitive comparison key without changing source labels.
 * @param value User input or published name.
 * @returns A case-folded, width-normalized key with punctuation removed.
 * @remarks Only for name matching; address numbers and unit expressions retain punctuation.
 */
export function normalizeNameSearch(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\p{P}/gu, '')
    .replace(/\s+/gu, ' ')
    .trim()
}

/** Read the selected language only; never disguise a fallback as a translation.
 * @param row Published names. @param locale Address editor language.
 * @returns The published name, or an empty string for a missing translation.
 */
export function addressNameLabel(row: AddressName, locale: LocaleKey): string {
  const tag = locale === 'zhHant' ? 'zh-hant' : locale === 'zhHans' ? 'zh-hans' : 'en'
  return Object.entries(row.names).find(([key]) => key.toLowerCase() === tag)?.[1] ?? ''
}

/** Find partial name matches in the chosen language without allocating the full result set.
 * @param rows Complete cached vocabulary. @param query User-entered substring.
 * @param locale Address editor language. @param limit Maximum visible suggestions.
 * @returns A bounded list of matching source records.
 */
export function searchAddressNames(
  rows: AddressName[],
  query: string,
  locale: LocaleKey,
  limit = 30,
): AddressName[] {
  const needle = normalizeNameSearch(query)
  if (query.trim() && !needle) return []
  const results: AddressName[] = []
  for (const row of rows) {
    const name = addressNameLabel(row, locale)
    if (name.length > 0 && normalizeNameSearch(name).includes(needle)) {
      results.push(row)
      if (results.length >= limit) break
    }
  }
  return results
}
