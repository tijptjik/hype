// THIRD-PARTY
import { ConverterBuilder } from 'opencc-js/core'
import * as cn2t from 'opencc-js/preset/cn2t'
import * as t2cn from 'opencc-js/preset/t2cn'
// TYPES
import type { LocaleKey } from '#lib/types.js'

// Keep the exact OpenCC normalization and segmentation rules, but ship only our two locales.
const Converter = ConverterBuilder({
  from: { hk: t2cn.from.hk, cn: cn2t.from.cn },
  to: { cn: t2cn.to.cn, hk: cn2t.to.hk },
  configs: { hk2s: t2cn.configs.hk2s, s2hk: cn2t.configs.s2hk },
})

let simplify: ReturnType<typeof Converter> | undefined

/** Convert Traditional Chinese presentation text without modifying source evidence.
 * @param value Published Traditional Chinese text.
 * @returns Simplified Chinese characters and vocabulary.
 */
export function simplifiedChinese(value: string): string {
  simplify ??= Converter({ from: 'hk', to: 'cn' })
  return simplify(value)
}

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

let traditionalize: ReturnType<typeof Converter> | undefined

/** Convert published Simplified Chinese to Hong Kong Traditional script for presentation.
 * @param value Published Simplified text. @returns Script-converted text; source evidence stays intact.
 */
export function traditionalChinese(value: string): string {
  traditionalize ??= Converter({ from: 'cn', to: 'hk' })
  return traditionalize(value)
}
