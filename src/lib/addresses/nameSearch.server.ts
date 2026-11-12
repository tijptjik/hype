// ADDRESS
import { loadAddressNames, type AddressName } from './nameCatalogue.js'
import { addressNameLabel, normalizeNameSearch } from './nameSearch.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'

type SearchRow = { record: AddressName; keys: Record<LocaleKey, string> }
const indexes = new WeakMap<AddressName[], SearchRow[]>()

/** Search the public vocabulary on the server, returning only bounded suggestions.
 * @param family Published vocabulary. @param query Name fragment. @param locale Search language.
 * @returns At most 30 published records, with their release and translation evidence intact.
 * @remarks Indexes follow the retained catalogue object and expire when it is replaced.
 */
export async function findAddressNames(
  family: 'streets' | 'buildings',
  query: string,
  locale: LocaleKey,
): Promise<AddressName[]> {
  const needle = normalizeNameSearch(query)
  if (!needle) return []
  const records = await loadAddressNames(family)
  let index = indexes.get(records)
  if (!index) {
    // Normalize each published label once, rather than for every user's keystroke.
    index = records
      .filter(
        row =>
          family !== 'buildings' ||
          !Object.values(row.names).some(name =>
            /^Block\s+[\p{L}\p{N}-]+$/iu.test(name.trim()),
          ),
      )
      .map(record => ({
        record,
        keys: {
          en: normalizeNameSearch(addressNameLabel(record, 'en')),
          zhHant: normalizeNameSearch(addressNameLabel(record, 'zhHant')),
          zhHans: normalizeNameSearch(addressNameLabel(record, 'zhHans')),
        },
      }))
    indexes.set(records, index)
  }
  const matches: AddressName[] = []
  for (const row of index) {
    if (row.keys[locale].includes(needle)) matches.push(row.record)
    if (matches.length === 30) break
  }
  return matches
}
