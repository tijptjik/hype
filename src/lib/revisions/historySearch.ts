/** Match all search terms against recorded values without exposing object keys.
 * @param query Search text from the history header.
 * @param value Authorized history data already available to the viewer.
 * @returns Whether every term occurs in the recorded values.
 */
export function matchesHistorySearch(query: string, value: unknown): boolean {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const text = historyValues(value).join(' ').toLocaleLowerCase()
  return terms.every(term => text.includes(term))
}

/** Flatten nested historical values while preserving multilingual strings.
 * @param value A recorded scalar, array, or object.
 * @returns Searchable scalar values.
 */
function historyValues(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'object') return Object.values(value).flatMap(historyValues)
  return [String(value)]
}
