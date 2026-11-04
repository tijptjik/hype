// ZOD
import { z } from 'zod'

/** Content tags are independent of the three compiled application-message locales. */
export type ContentLocale = string & { readonly __contentLocale: unique symbol }
export const MAX_CONTENT_LOCALE_LENGTH = 64
// Reserved transport prefix keeps BCP 47 subtags reversible in remote-form paths.
export const CONTENT_LOCALE_FORM_KEY_PREFIX = '$locale_'
export const LEGACY_CONTENT_LOCALE_ALIASES: Readonly<Record<string, string>> = {
  zhHant: 'zh-Hant',
  zhHans: 'zh-Hans',
}

/**
 * Canonicalizes a content tag without restricting previously stored languages.
 * @param value - BCP 47 tag, encoded remote-form key, or explicit legacy form key.
 * @returns Canonical tag, or null for malformed/oversized input.
 * @remarks Registry eligibility is a separate settings/catalogue concern.
 */
export function normalizeContentLocale(value: unknown): ContentLocale | null {
  if (
    typeof value !== 'string' ||
    !value.length ||
    value.length > MAX_CONTENT_LOCALE_LENGTH + CONTENT_LOCALE_FORM_KEY_PREFIX.length
  )
    return null
  const tag = Object.hasOwn(LEGACY_CONTENT_LOCALE_ALIASES, value)
    ? LEGACY_CONTENT_LOCALE_ALIASES[value]
    : value.startsWith(CONTENT_LOCALE_FORM_KEY_PREFIX)
      ? value.slice(CONTENT_LOCALE_FORM_KEY_PREFIX.length).replaceAll('_', '-')
      : value
  if (tag.length > MAX_CONTENT_LOCALE_LENGTH) return null
  try {
    const [canonical] = Intl.getCanonicalLocales(tag)
    return canonical && canonical.length <= MAX_CONTENT_LOCALE_LENGTH
      ? (canonical as ContentLocale)
      : null
  } catch {
    return null
  }
}

export const ContentLocaleSchema = z.string().transform((value, ctx) => {
  const locale = normalizeContentLocale(value)
  if (locale) return locale
  ctx.addIssue({
    code: 'custom',
    message: 'Enter a valid content language tag (at most 64 characters).',
  })
  return z.NEVER
})

/**
 * Normalizes and stably deduplicates locale identities; invalid tags throw.
 * @param values - Ordered content tags.
 * @returns Fresh canonical array preserving first occurrence order.
 * @remarks Do not use to merge translation records with potentially conflicting values.
 */
export function normalizeContentLocales(values: readonly string[]): ContentLocale[] {
  return [...new Set(values.map(value => ContentLocaleSchema.parse(value)))]
}

/**
 * Adapts canonical Chinese tags to the old form-key boundary explicitly.
 * @param value - Content tag to normalize.
 * @returns Legacy Chinese form key or the unchanged canonical tag for other languages.
 */
export function toLegacyContentLocaleKey(value: string): string {
  const locale = ContentLocaleSchema.parse(value)
  return locale === 'zh-Hant' ? 'zhHant' : locale === 'zh-Hans' ? 'zhHans' : locale
}
