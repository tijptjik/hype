// CONTENT LOCALES
import { normalizeContentLocale } from '#lib/content-locales/model.js'

/** Generated text is separate from the published field, even after editorial acceptance. */
export type AutomaticTranslation = {
  receipt?: string
  value: string
  sourceLocale: string
  sourceHash: string
  sourceText: string
  provider: string
  model: string | null
  generatedAt: string
}
export type AutomaticTranslations = Record<string, AutomaticTranslation>
export type TranslationAcceptance = (
  | AutomaticTranslation
  | { origin: 'legacy-ai'; value: string }
) & {
  humanVerified?: boolean
  acceptedValue: string
  acceptedBy: string
  acceptedAt: string
}
export type TranslationProvenance = Record<string, TranslationAcceptance>
export interface ContentResolution {
  value: string
  locale: string | null
  kind: 'published' | 'automatic' | 'missing'
  original?: { value: string; locale: string }
}

/** Resolve a stable language chain without collapsing additional content languages to English.
 * @param preferred Reader's content language. @param available Stored locale identities.
 * @returns Requested language, Chinese/English fallbacks, then other available languages.
 */
export function contentLocaleOrder(
  preferred: string,
  available: readonly string[] = [],
): string[] {
  const locale = normalizeContentLocale(preferred) ?? 'en'
  const language = new Intl.Locale(locale).maximize()
  const primary =
    language.language === 'zh' && language.script === 'Hans'
      ? ['zh-Hans', 'zh-Hant', 'en']
      : language.language === 'zh' && language.script === 'Hant'
        ? ['zh-Hant', 'zh-Hans', 'en']
        : ['en', 'zh-Hant', 'zh-Hans']
  const remaining = available
    .map(normalizeContentLocale)
    .filter((tag): tag is NonNullable<typeof tag> => tag !== null)
    .sort()
  return [...new Set([locale, ...primary, ...remaining])]
}

/** Hash the exact source snapshot used by the provider.
 * @param text Source text without normalization. @returns SHA-256 hexadecimal digest.
 */
export async function translationSourceHash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

/** Resolve one field, keeping publication and generation independent.
 * @param records Locale rows. @param field Field to read. @param preferred Requested content language.
 * @param allowAutomatic Explicit reader opt-in. @param allowLegacyGenerated Editor-only legacy preview.
 * @returns Text with display provenance; automatic fallback languages are never used.
 * @remarks Source text equality also rejects stale cache entries synchronously on the client.
 */
export function resolveContentField(
  records: Record<string, unknown>,
  field: string,
  preferred: string,
  allowAutomatic = false,
  allowLegacyGenerated = false,
): ContentResolution {
  const rows = new Map<string, Record<string, unknown>>()
  for (const [key, row] of Object.entries(records)) {
    const locale = normalizeContentLocale(key)
    if (locale && row && typeof row === 'object')
      rows.set(locale, row as Record<string, unknown>)
  }
  const order = contentLocaleOrder(preferred, [...rows.keys()])
  const published = (locale: string): string | null => {
    const row = rows.get(locale)
    if (row?.isAutomaticOnly === true) return null
    const value = row?.[field]
    const generated = row?.[`${field}Gen`] === true || row?.[`${field}Gen`] === 'true'
    return typeof value === 'string' &&
      value.trim() &&
      (!generated || allowLegacyGenerated)
      ? value
      : null
  }
  const exact = published(order[0])
  if (exact !== null) return { value: exact, locale: order[0], kind: 'published' }
  if (allowAutomatic) {
    const candidate = (
      rows.get(order[0])?.autoTranslated as AutomaticTranslations | undefined
    )?.[field]
    const sourceLocale = normalizeContentLocale(candidate?.sourceLocale)
    const source = sourceLocale ? published(sourceLocale) : null
    if (
      candidate?.value?.trim() &&
      sourceLocale !== null &&
      source !== null &&
      source === candidate.sourceText
    ) {
      return {
        value: candidate.value,
        locale: order[0],
        kind: 'automatic',
        original: { value: source, locale: sourceLocale },
      }
    }
  }
  for (const locale of order.slice(1)) {
    const value = published(locale)
    if (value !== null) return { value, locale, kind: 'published' }
  }
  return { value: '', locale: null, kind: 'missing' }
}
