// I18N
import * as runtime from '$lib/paraglide/runtime'
import * as m from '$lib/paraglide/messages'
import type {
  FeatureProperty,
  FeaturePropertyI18nDB,
  Locale,
  Neighbourhood,
  OrganisationFormLocaleKey,
  PropertyValueI18nDB,
  UserPreferences,
} from '$lib/types'
import type { Resource } from '$lib/types'
import { supportedLocales } from './enums'

/**
 * Get the current locale with Paraglide. Wrapping for type safety.
 * @returns The current locale.
 */
export function getLocale(): Locale {
  return runtime.getLocale() as Locale
}

/**
 * Set the current locale. Wrapping for type safety.
 * @param locale - The locale to set.
 */
export function setLocale(locale: Locale) {
  runtime.setLocale(locale as any)
}

/**
 * Get canonical locale order for rendering and fallback checks.
 * @param locale - The preferred locale.
 * @returns Ordered locales with preferred locale first.
 */
export function getLocaleOrder(locale: Locale): Locale[] {
  if (locale === 'en') return ['en', 'zh-hant', 'zh-hans']
  if (locale === 'zh-hant') return ['zh-hant', 'zh-hans', 'en']
  return ['zh-hans', 'zh-hant', 'en']
}

export function toOrganisationFormLocaleKey(locale: Locale): OrganisationFormLocaleKey {
  if (locale === 'zh-hans') return 'zhHans'
  if (locale === 'zh-hant') return 'zhHant'
  return 'en'
}

/**
 * Convert organisation form i18n key back to app locale.
 * @param localeKey - Form locale key.
 * @returns Locale value used by entity i18n payloads.
 */
export function toLocaleFromOrganisationFormLocaleKey(
  localeKey: OrganisationFormLocaleKey,
): Locale {
  if (localeKey === 'zhHans') return 'zh-hans'
  if (localeKey === 'zhHant') return 'zh-hant'
  return 'en'
}

/**
 * Convert organisation form i18n map keys (`en`, `zhHans`, `zhHant`) to locale keys.
 * @param i18n - Form-keyed i18n object.
 * @returns Locale-keyed i18n object.
 */
export function toLocaleRecordFromOrganisationFormI18n<T>(
  i18n: Record<OrganisationFormLocaleKey, T>,
): Record<Locale, T> {
  return {
    en: i18n.en,
    'zh-hans': i18n.zhHans,
    'zh-hant': i18n.zhHant,
  }
}

/**
 * Get the fallback locales for a given locale.
 * @param locale - The locale to get the fallback locales for.
 * @returns All supported locales, excluding the given locale.
 */
export function getFallbackLocales(locale: Locale): Locale[] {
  return supportedLocales.filter((nextLocale: Locale) => nextLocale !== locale)
}

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
  userPreferences: UserPreferences,
  fallback?: string,
  skipGenFieldCheck?: boolean,
): string {
  const defaultFallback = '-'
  if (!obj) return fallback || defaultFallback

  // ASSERT : Text Object provided - else use the (default) fallback.
  let i18nObj: Record<Locale, T>
  if ('i18n' in obj && obj.i18n) {
    i18nObj = obj.i18n as Record<Locale, T>
  } else {
    i18nObj = obj as Record<Locale, T>
  }

  // CONFIG : Locale, Options and Keys
  const locale = getLocale() as Locale

  // Set options based on user preferences
  const opts = {
    fallback: fallback || defaultFallback,
    fallbackLocales: userPreferences.fallbackLocales,
    allowMachineTranslation: userPreferences.allowMachineTranslation,
    preferFallbackInCurrentLocale: userPreferences.preferFallbackInCurrentLocale,
  }

  // indicator for machine-translated values
  const genField = `${field}Gen`

  // SWITCH : BEST CASE : The field is available in the preferred locale as
  //  a human-provided value
  const translation = i18nObj[locale]?.[field as keyof T] as string
  if (translation && (!i18nObj[locale]?.[genField as keyof T] || skipGenFieldCheck))
    return translation

  // SWITCH : FALLBACK LOCALE CASE - The field is available in a secondary
  //   locale accepted by the user, and is a human-provided value.
  for (const fallbackLocale of opts.fallbackLocales) {
    const translation = i18nObj[fallbackLocale]?.[field as keyof T] as string
    if (
      translation &&
      (!i18nObj[fallbackLocale]?.[genField as keyof T] || skipGenFieldCheck)
    )
      return translation
  }

  // SWITCH : FALLBACK VALUE CASE : If configured to prefer a generic fallback over any machine-translated values (and no human ones were found yet), return the generic fallback.
  if (opts?.preferFallbackInCurrentLocale && opts.fallback) return opts.fallback

  // SWITCH : AI <3 CASE : The field is available in the current locale,
  // as a machine-translated value, and the user allows machine translations.
  if (translation && opts.allowMachineTranslation) return translation

  // SWITCH : FALLBACK LOCALE AI CASE - The field is available in a secondary
  //   locale accepted by the user, is a machine-translated value, but the user
  //   accepts machine translations.
  for (const fallbackLocale of opts.fallbackLocales) {
    const translation = i18nObj[fallbackLocale]?.[field as keyof T] as string
    if (translation && opts.allowMachineTranslation) return translation
  }

  // TODO : Implement machine translation for missing translations
  // SWITCH : MISSING TRANSLATIONS AI CASE
  // If no translation is available in the fallback locales even if machine translations are allowed, we will assume that there is no translation available in any of the available locales. In that case, generate a machine translation.
  // if (opts?.allowMachineTranslation) {
  //   // First find a locale which has a translation for the field.
  //   for (const supportedLocale of Object.keys(obj)) {
  //     const translation = obj[supportedLocale as keyof typeof obj]?.[
  //       field as keyof T
  //     ] as string;
  //     if (translation) {
  //       let machineTranslation = await translateText(
  //         supportedLocale as Locale,
  //         locale,
  //         [translation]
  //       ).then((machineTranslation) => machineTranslation[0]);
  //       return machineTranslation;
  //     }
  //   }
  // }

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

// EXPORT CUSTOM FUNCTIONS
export async function translateText(
  sourceLang: Locale,
  targetLang: Locale,
  texts: string[],
): Promise<string[]> {
  const response = await fetch('/api/translation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: sourceLang,
      target: targetLang,
      texts,
    }),
  })
  const data = await response.json()
  return data
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
