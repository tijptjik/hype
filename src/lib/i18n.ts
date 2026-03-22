// I18N
import * as runtime from '$lib/paraglide/runtime'
import * as m from '$lib/paraglide/messages'
// REMOTE
import { translateText as translateTextRemote } from '$lib/api/server/translation.remote'
import type { Locale, LocaleKey, Neighbourhood } from '$lib/types'
import type { Resource } from '$lib/types'
import type {
  PropertyValueI18nDB,
  WritableI18nRecord,
} from '$lib/db/zod/schema/property.types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'
import { supportedLocales } from './enums'
import type {
  FeatureProperty,
  FeaturePropertyI18nDB,
} from '$lib/db/zod/schema/feature.types'

export const supportedLocaleKeys: LocaleKey[] = ['en', 'zhHans', 'zhHant']

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. RUNTIME LOCALE ACCESS
//    - getLocale
//    - getLocaleKey
//    - setLocale
//
// 2. LOCALE KEY/CODE CONVERSIONS
//    - getLocaleOrder
//    - toLocaleKey
//    - toLocaleCode
//    - normalizeLocaleCode
//
// 3. FORM I18N RECORD HELPERS
//    - toFormLocaleRecord
//    - ensureLocaleEntryForWrite
//    - normalizeI18nLocaleRecord
//
// 4. LOCALE FALLBACKS
//    - getFallbackLocales
//
// 5. TRANSLATION RESOLUTION
//    - getI18n
//    - getFPI18n
//
// 6. LOCALE LABELS / EXPORTS
//    - localeLabels
//    - m, runtime
//
// 7. TRANSLATION API HELPERS
//    - translateText
//    - translateI18nFields

// ═══════════════════════
// 1. RUNTIME LOCALE ACCESS
// ═══════════════════════

/**
 * Get the current locale with Paraglide. Wrapping for type safety.
 * @returns The current locale.
 */
export function getLocale(): Locale {
  return runtime.getLocale() as Locale
}

/**
 * Get the current locale as organisation-form locale key (`en`, `zhHans`, `zhHant`).
 * @returns The current form locale key.
 */
export function getLocaleKey(): LocaleKey {
  return toLocaleKey(getLocale())
}

/**
 * Set the current locale. Wrapping for type safety.
 * @param locale - The locale to set.
 */
export function setLocale(locale: Locale) {
  runtime.setLocale(locale)
}

// ═══════════════════════
// 2. LOCALE KEY/CODE CONVERSIONS
// ═══════════════════════

/**
 * Get canonical locale order for rendering and fallback checks.
 * @param localeKey - The preferred form locale key.
 * @returns Ordered form locale keys with preferred locale first.
 */
export function getLocaleOrder(localeKey: LocaleKey): LocaleKey[] {
  if (localeKey === 'en') return ['en', 'zhHant', 'zhHans']
  if (localeKey === 'zhHant') return ['zhHant', 'zhHans', 'en']
  return ['zhHans', 'zhHant', 'en']
}

export function toLocaleKey(locale: Locale | LocaleKey): LocaleKey {
  if (locale === 'en' || locale === 'zhHans' || locale === 'zhHant') return locale
  if (locale === 'zh-hans') return 'zhHans'
  if (locale === 'zh-hant') return 'zhHant'
  return 'en'
}

/**
 * Convert organisation form i18n key back to app locale.
 * @param localeKey - Form locale key.
 * @returns Locale value used by entity i18n payloads.
 */
export function toLocaleCode(localeKey: LocaleKey): Locale {
  if (localeKey === 'zhHans') return 'zh-hans'
  if (localeKey === 'zhHant') return 'zh-hant'
  return 'en'
}

/**
 * Normalize an incoming locale identifier to canonical locale code where possible.
 * Accepts form keys (`zhHans`, `zhHant`) and locale codes (`zh-hans`, `zh-hant`).
 */
export function normalizeLocaleCode(input: string): string {
  if (input === 'zhHans' || input === 'zhHant' || input === 'en') {
    return toLocaleCode(input as LocaleKey)
  }
  return input
}

// ═══════════════════════
// 3. FORM I18N RECORD HELPERS
// ═══════════════════════

/**
 * Normalize any partial organisation-form i18n map to canonical form keys.
 * @param i18n - Form-keyed i18n object.
 * @returns Canonical form-keyed i18n object.
 */
export function toFormLocaleRecord<T>(
  i18n:
    | Partial<Record<LocaleKey, T>>
    | Partial<Record<Locale, T>>
    | Record<string, T>
    | null
    | undefined,
): Partial<Record<LocaleKey, T>> | null | undefined {
  if (!i18n) return i18n

  const out: Partial<Record<LocaleKey, T>> = {}
  for (const [rawKey, value] of Object.entries(i18n)) {
    const normalizedLocale = normalizeLocaleCode(rawKey)
    if (
      normalizedLocale !== 'en' &&
      normalizedLocale !== 'zh-hans' &&
      normalizedLocale !== 'zh-hant'
    ) {
      continue
    }
    const formLocaleKey = toLocaleKey(normalizedLocale)
    out[formLocaleKey] = value
  }

  return out
}

/**
 * Ensure a writable form-locale entry exists for the provided locale and return it.
 * @param i18n - Mutable form-keyed i18n record.
 * @param locale - App locale to map into form keys.
 * @returns Existing or newly created locale entry.
 */
export function ensureLocaleEntryForWrite(
  i18n: WritableI18nRecord | null | undefined,
  locale: Locale,
): Record<string, unknown> | null {
  if (!i18n) return null
  const localeKey = toLocaleKey(locale)
  if (!i18n[localeKey]) {
    i18n[localeKey] = {
      locale: toLocaleCode(localeKey),
    }
  }
  return i18n[localeKey] as Record<string, unknown>
}

/**
 * Normalize an i18n map to canonical locale-code keys and ensure each entry has `locale`.
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

// ═══════════════════════
// 4. LOCALE FALLBACKS
// ═══════════════════════

/**
 * Get the fallback locales for a given locale.
 * @param locale - The locale to get the fallback locales for.
 * @returns All supported locales, excluding the given locale.
 */
export function getFallbackLocales(locale: Locale): Locale[] {
  return supportedLocales.filter((nextLocale: Locale) => nextLocale !== locale)
}

// ═══════════════════════
// 5. TRANSLATION RESOLUTION
// ═══════════════════════

/**
 * Get the translated value of a field from an object using user preferences.
 * @param obj - The object to get the translated value from.
 * @param field - The field to get the translated value from.
 * @param userPreferences - User preferences with defaults applied
 * @param fallback - Optional fallback value
 * @returns The translated value of the field.
 */
export function getI18n<T>(
  obj:
    | Resource
    | Neighbourhood
    | { i18n: Record<Locale, T> | null }
    | Record<Locale, T>
    | undefined,
  field: string,
  _userPreferences: UserPreferences,
  fallback?: string,
  skipGenFieldCheck?: boolean,
): string {
  const defaultFallback = '-'
  if (!obj) return fallback || defaultFallback

  // ASSERT : Text Object provided - else use the (default) fallback.
  let i18nObj: Record<string, T>
  if ('i18n' in obj && obj.i18n) {
    i18nObj = obj.i18n as Record<string, T>
  } else {
    i18nObj = obj as Record<string, T>
  }

  // CONFIG : Locale key only (no locale fallback chain)
  const localeKey = getLocaleKey()
  const opts = {
    fallback: fallback || defaultFallback,
  }

  // indicator for machine-translated values
  const genField = `${field}Gen`

  // SWITCH : BEST CASE : The field is available in the preferred locale key.
  const translation = i18nObj[localeKey]?.[field as keyof T] as string
  if (translation && (!i18nObj[localeKey]?.[genField as keyof T] || skipGenFieldCheck))
    return translation

  // SWTICH : CATCHALL CASE
  // If all prior attempts to get a translation (human, allowed machine, or newly generated machine) have failed or were skipped due to preferences, this is the last resort.
  return opts?.fallback || defaultFallback
}

/**
 * Get the translated value of a feature property using user preferences.
 * @param obj - The feature property to get the translated value from.
 * @param userPreferences - User preferences with defaults applied
 * @returns The translated value of the feature property.
 */
export function getFPI18n(
  obj: Omit<FeatureProperty, 'featureId'>,
  userPreferences: UserPreferences,
): string {
  const field = 'value'
  const fallback = m.great_crazy_squid_promise()

  // CASE : SPECIFIER Property & UNIVERSAL VALUE
  if (obj.property?.type === 'specifier' && obj.value) {
    return obj.value
  }
  // CASE : SPECIFIER Property & I18N VALUE
  else if (obj.property?.type === 'specifier' && obj.i18n) {
    return getI18n<FeaturePropertyI18nDB>(
      obj.i18n as Record<Locale, FeaturePropertyI18nDB>,
      field,
      userPreferences,
      fallback,
    )
  }
  // CASE : RANGE FIELD Property (stores numeric values directly)
  else if (obj.property?.component === 'RangeField' && obj.value) {
    return obj.value
  }
  // CASE : CLASSIFIER Property
  else if (obj.property?.type === 'classifier' && obj.propertyValueId) {
    return getI18n<PropertyValueI18nDB>(
      obj.property.values?.find(v => v.id === obj.propertyValueId)?.i18n as Record<
        Locale,
        PropertyValueI18nDB
      >,
      field,
      userPreferences,
      fallback,
    )
  }
  // CASE : FALLBACK
  console.warn('No translation found for', obj)
  return fallback
}

// ═══════════════════════
// 6. LOCALE LABELS / EXPORTS
// ═══════════════════════

/**
 * Labels for the locales.
 * @returns The labels for the locales.
 */
export const localeLabels = [
  { locale: 'en', label: 'EN' },
  { locale: 'zh-hant', label: 'HK' },
  { locale: 'zh-hans', label: 'CN' },
]

// EXPORT PARAGLIDE
export { m, runtime }

// ═══════════════════════
// 7. TRANSLATION API HELPERS
// ═══════════════════════

export async function translateText(
  sourceLang: Locale,
  targetLang: Locale,
  texts: string[],
): Promise<string[]> {
  return translateTextRemote({
    source: sourceLang,
    target: targetLang,
    texts,
  })
}

type TranslateI18nFieldsParams = {
  source: Locale
  target: Locale
  fields: string[]
  i18n: Partial<Record<Locale, Record<string, string | null | undefined>>>
  onSuccess?: (translated: Record<string, string>) => void
  onFailure?: (error: unknown) => void
}

/**
 * Translate selected i18n fields from one locale to another.
 * @param params - Translation request payload and lifecycle callbacks.
 * @returns A field/value map for translated strings.
 */
export async function translateI18nFields({
  source,
  target,
  fields,
  i18n,
  onSuccess,
  onFailure,
}: TranslateI18nFieldsParams): Promise<Record<string, string>> {
  try {
    const sourceTexts = fields.map(field => i18n[source]?.[field] ?? '')
    const translatedTexts = await translateText(source, target, sourceTexts)

    const translated = fields.reduce<Record<string, string>>((acc, field, index) => {
      acc[field] = translatedTexts[index] ?? ''
      return acc
    }, {})

    onSuccess?.(translated)
    return translated
  } catch (error) {
    onFailure?.(error)
    throw error
  }
}
