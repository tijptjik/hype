// TYPES
import type { AddressName } from './nameCatalogue.js'
import type { LocaleKey } from '#lib/types.js'

const recent = new Map<string, { expires: number; records: AddressName[] }>()
/** Fetch only matching names, aborting obsolete input requests.
 * @param family Vocabulary. @param query Typed fragment. @param locale Search language.
 * @param signal Cancellation owned by the input.
 * @returns At most 30 source records; recent successful searches are retained briefly.
 */
export async function fetchNameSuggestions(
  family: 'streets' | 'buildings',
  query: string,
  locale: LocaleKey,
  signal: AbortSignal,
): Promise<AddressName[]> {
  const params = new URLSearchParams({ family, q: query.trim().slice(0, 160), locale })
  const key = params.toString()
  const cached = recent.get(key)
  if (cached && cached.expires > Date.now()) return cached.records
  const response = await fetch(`/api/address-names?${key}`, { signal })
  if (!response.ok) throw new Error('Name search unavailable')
  const result = (await response.json()) as { records: AddressName[] }
  if (!Array.isArray(result.records) || result.records.length > 30)
    throw new Error('Invalid name suggestions')
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  const oldest = recent.keys().next().value
  if (recent.size >= 100 && oldest !== undefined) recent.delete(oldest)
  recent.set(key, { expires: Date.now() + 60_000, records: result.records })
  return result.records
}
