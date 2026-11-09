// ADDRESS
import {
  ADDRESS_LOCALES,
  getAddressDisplay,
  getAddressLocale,
} from '#lib/addresses/featureAddress.js'
// TYPES
import type { DraftSearchResult } from './draftSearchGroups.js'

const abbreviations: Record<string, string> = {
  rd: 'road',
  st: 'street',
  ave: 'avenue',
  blvd: 'boulevard',
  ln: 'lane',
  hwy: 'highway',
}

/** Normalize discovery text without changing its source labels.
 * @param value Query or published name/address component.
 * @returns Case- and width-normalized text with common street abbreviations expanded.
 */
function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(rd|st|ave|blvd|ln|hwy)\b/g, word => abbreviations[word])
}

/** Let queued input events and rendering run before another filtering batch.
 * @returns A new task, rather than a microtask that would keep blocking input.
 */
function yieldToInput(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/** Create a cooperative matcher with a cache scoped to one discovery component.
 * @returns An asynchronous filter that returns null when its snapshot is obsolete.
 * @remarks Provider rows are cached by object identity; fresh response objects build
 * new text. Work starts in a separate task and yields between rows after a four
 * millisecond processing budget. Callers must recheck currency before publishing.
 */
export function createDraftSearchFilter<T extends DraftSearchResult>(): (
  rows: T[],
  query: string,
  isCurrent: () => boolean,
) => Promise<T[] | null> {
  const labels = new WeakMap<T, string[]>()

  return async (rows, query, isCurrent): Promise<T[] | null> => {
    await yieldToInput()
    if (!isCurrent()) return null
    const terms = normalize(query).split(/\s+/u).filter(Boolean)
    const matches: T[] = []
    let batchStart = performance.now()
    for (const row of rows) {
      if (!isCurrent()) return null
      let text = labels.get(row)
      if (!text) {
        // Build multilingual address text once per provider row, outside the input handler.
        text = [
          ...Object.values(row.names),
          ...Object.keys(ADDRESS_LOCALES).flatMap(locale => [
            getAddressDisplay(row.address, locale as keyof typeof ADDRESS_LOCALES),
            ...Object.values(
              getAddressLocale(row.address, locale as keyof typeof ADDRESS_LOCALES),
            ).filter((value): value is string => typeof value === 'string'),
          ]),
        ].map(normalize)
        labels.set(row, text)
      }
      if (terms.every(term => text.some(label => label.includes(term))))
        matches.push(row)
      if (performance.now() - batchStart >= 4) {
        await yieldToInput()
        batchStart = performance.now()
      }
    }
    return isCurrent() ? matches : null
  }
}
