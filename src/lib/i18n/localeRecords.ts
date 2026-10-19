// TYPES
import type { Locale, LocaleKey } from '#lib/types.js'

/**
 * Convert form locale keys to canonical stored locale codes.
 * @param locale Supported form key or locale code.
 * @returns Canonical locale code, retaining the existing English fallback.
 */
export function toLocaleKebab(locale: LocaleKey | Locale): Locale {
  if (locale === 'en' || locale === 'zh-hans' || locale === 'zh-hant') return locale
  if (locale === 'zhHans') return 'zh-hans'
  if (locale === 'zhHant') return 'zh-hant'
  return 'en'
}

/**
 * Normalize an incoming locale identifier to canonical locale code where possible.
 * Accepts form keys (`zhHans`, `zhHant`) and locale codes (`zh-hans`, `zh-hant`).
 * @param input Incoming locale identifier.
 * @returns Canonical known code or the unchanged unknown identifier.
 */
export function normalizeLocaleCode(input: string): string {
  if (input === 'zhHans' || input === 'zhHant' || input === 'en') {
    return toLocaleKebab(input as LocaleKey)
  }
  return input
}

/**
 * Normalize an i18n map to canonical locale-code keys and ensure each entry has `locale`.
 * @param i18n Locale-keyed records.
 * @returns New normalized records, preserving all translated values.
 */
export function normalizeI18nLocaleRecord<T extends Record<string, unknown>>(
  i18n: Record<string, T>,
): Record<string, T> {
  const normalized: Record<string, T> = {}
  for (const [rawLocale, entry] of Object.entries(i18n)) {
    const entryLocale =
      typeof entry?.locale === 'string' ? normalizeLocaleCode(entry.locale) : undefined
    const locale = entryLocale ?? normalizeLocaleCode(rawLocale)
    normalized[locale] = {
      ...entry,
      locale,
    } as T
  }
  return normalized
}
