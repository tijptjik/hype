// ADDRESS
import { addressComparisonName } from './formatting.js'
import { withSimplifiedChinese } from './chinese.js'

/** Keep published building translations and recover missing languages from a bilingual label.
 * @param names Published locale names, including any legacy undetermined label.
 * @param label Provider display title, which is not itself a language.
 * @returns Language-specific names without an undetermined-language entry.
 * @remarks Published translations win; the source record is never mutated.
 */
export function buildingNames(
  names: Record<string, string | null | undefined>,
  label?: string | null,
): Record<string, string> {
  const result = Object.fromEntries(
    Object.entries(names)
      .filter(
        (entry): entry is [string, string] =>
          !/^und(?:-|$)/i.test(entry[0]) && Boolean(entry[1]?.trim()),
      )
      .map(([tag, value]) => [tag.toLowerCase(), value.trim()]),
  )
  const fallback = label || names.und
  if (fallback) {
    // Only split a Han/Latin label; other scripts cannot safely be identified as English.
    const letters = fallback.replace(/[\p{Script=Han}\p{Script=Latin}\P{L}]/gu, '')
    if (!letters) {
      for (const [locale, tag] of [
        ['en', 'en'],
        ['zhHant', 'zh-hant'],
      ] as const) {
        const value = addressComparisonName(fallback, locale)
        if (!result[tag] && value && /\p{L}/u.test(value)) result[tag] = value
      }
    }
  }
  return withSimplifiedChinese(result)
}
