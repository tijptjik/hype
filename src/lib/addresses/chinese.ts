// THIRD-PARTY
import { ConverterBuilder } from 'opencc-js/core'
import * as cn2t from 'opencc-js/preset/cn2t'
// I18N
import { simplifiedChinese } from './simplifiedChinese.js'
// TYPES
import type { LocaleKey } from '#lib/types.js'

export { simplifiedChinese }

/** Read a published name, preferring Chinese script fallback before English.
 * @param names Published names keyed by locale tag. @param locale Requested display language.
 * @returns Localized label, or undefined when no usable name is available.
 */
export function localizedAddressName(
  names: Record<string, string | null | undefined>,
  locale: LocaleKey,
): string | undefined {
  const normalized = Object.fromEntries(
    Object.entries(names).map(([tag, value]) => [tag.toLowerCase(), value]),
  )
  const tag = locale === 'zhHant' ? 'zh-hant' : locale === 'zhHans' ? 'zh-hans' : 'en'
  if (normalized[tag]) return normalized[tag]!
  if (locale === 'zhHans' && normalized['zh-hant'])
    return simplifiedChinese(normalized['zh-hant'])
  return (
    normalized.en ||
    Object.values(normalized).find((value): value is string => Boolean(value))
  )
}

/** Supply a derived Simplified Chinese catalogue label only when it is absent.
 * @param names Published catalogue names. @returns Names plus a script-converted fallback.
 */
export function withSimplifiedChinese(
  names: Record<string, string>,
): Record<string, string> {
  const normalized = Object.fromEntries(
    Object.entries(names).map(([tag, value]) => [tag.toLowerCase(), value]),
  )
  return !normalized['zh-hans'] && normalized['zh-hant']
    ? { ...names, 'zh-hans': simplifiedChinese(normalized['zh-hant']) }
    : names
}

let traditionalize: ((value: string) => string) | undefined

/** Convert published Simplified Chinese to Hong Kong Traditional script for presentation.
 * @param value Published Simplified text. @returns Script-converted text; source evidence stays intact.
 */
export function traditionalChinese(value: string): string {
  // Keep the exact OpenCC normalization and segmentation rules for the reverse conversion.
  traditionalize ??= ConverterBuilder({
    from: { cn: cn2t.from.cn },
    to: { hk: cn2t.to.hk },
    configs: { s2hk: cn2t.configs.s2hk },
  })({ from: 'cn', to: 'hk' })
  return traditionalize(value)
}
