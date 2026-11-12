// CONTENT LOCALES
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'

/** Compatibility context for the shared save dialogue and inline proposals; enabled by default. */
export const hubTranslationReviewKey = Symbol('hub-translation-review')
export type TranslationSourceMode = 'english' | 'nearest'
const european = new Set(
  'en fr de es pt it nl ca gl ro sv da no nb nn is fi et lv lt pl cs sk sl hr bs sr bg mk ru uk be el hu sq ga cy mt eu'.split(
    ' ',
  ),
)

/** Select a translation source independently of the reader's fallback order.
 * @param target Target language. @param available Authored source languages.
 * @param mode Explicit English or nearest-language selection.
 * @returns A source language, or undefined when no other language has a value.
 */
export function translationSource(
  target: string,
  available: readonly string[],
  mode: TranslationSourceMode,
): string | undefined {
  const canonical = canonicalContentTag(target)
  const language = new Intl.Locale(canonical).language
  const sources = available.filter(tag => canonicalContentTag(tag) !== canonical)
  const base = (tag: string): string =>
    new Intl.Locale(canonicalContentTag(tag)).language
  const english = sources.find(tag => base(tag) === 'en')
  if (mode === 'english' && english) return english
  const rank = (tag: string): number => {
    const source = base(tag)
    if (source === language) return 0
    if (language === 'zh') {
      if (source === 'ja') return 1
      if (source === 'ko') return 2
      if (source === 'en') return 3
      if (european.has(source)) return 4
      return 5
    }
    if (european.has(source)) return source === 'en' ? 1 : 2
    if (source === 'zh')
      return canonicalContentTag(tag).includes('Hant') ||
        new Intl.Locale(canonicalContentTag(tag)).maximize().script === 'Hant'
        ? 3
        : 4
    return 5
  }
  return sources
    .map((tag, index) => ({ tag, index, rank: rank(tag) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)[0]?.tag
}
