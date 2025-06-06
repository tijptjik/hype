// I18N
import * as runtime from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';
import type {
  FeatureProperty,
  FeaturePropertyI18nDB,
  Locale,
  PropertyValueI18nDB,
  UserPreferences
} from '$lib/types';
// ENUMS
import { supportedLocales } from '$lib/enums';
import type { MapCtx } from './context/map.svelte';

/**
 * Get the current locale with Paraglide. Wrapping for type safety.
 * @returns The current locale.
 */
export function getLocale(): Locale {
  return runtime.getLocale() as Locale;
}

/**
 * Set the current locale. Wrapping for type safety.
 * @param locale - The locale to set.
 */
export function setLocale(locale: Locale) {
  runtime.setLocale(locale as any);
}

/**
 * Get the fallback locales for a given locale.
 * @param locale - The locale to get the fallback locales for.
 * @returns All supported locales, excluding the given locale.
 */
export function getFallbackLocales(locale: Locale): Locale[] {
  return supportedLocales.filter((l) => l !== locale);
}

/**
 * Get user preferences with safe defaults
 * @param userPreferences - User preferences from session
 * @returns UserPreferences with defaults applied
 */
function getUserPreferencesWithDefaults(userPreferences?: Partial<UserPreferences>): UserPreferences {
  return {
    fallbackLocales: userPreferences?.fallbackLocales || getFallbackLocales(getLocale()),
    allowMachineTranslation: userPreferences?.allowMachineTranslation ?? false,
    preferFallbackInCurrentLocale: userPreferences?.preferFallbackInCurrentLocale ?? false,
    isTranslateButtonVisible: userPreferences?.isTranslateButtonVisible ?? true
  };
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
  obj: Record<'i18n', Record<Locale, T>> | Record<Locale, T>,
  field: string,
  userPreferences: UserPreferences,
  fallback?: string,
  skipGenFieldCheck?: boolean
): string {
  const defaultFallback = '-';
  if (!obj) return fallback || defaultFallback;

  // ASSERT : Text Object provided - else use the (default) fallback.
  if ('i18n' in obj) {
    obj = obj.i18n as Record<Locale, T>;
  }
  
  // CONFIG : Locale, Options and Keys
  const locale = getLocale() as Locale;
  
  // Set options based on user preferences
  let opts = {
    fallback: fallback || defaultFallback,
    fallbackLocales: userPreferences.fallbackLocales,
    allowMachineTranslation: userPreferences.allowMachineTranslation,
    preferFallbackInCurrentLocale: userPreferences.preferFallbackInCurrentLocale
  };
  
  // indicator for machine-translated values
  const genField = `${field}Gen`;

  // SWITCH : BEST CASE : The field is available in the preferred locale as
  //  a human-provided value
  const translation = obj[locale]?.[field as keyof T] as string;
  if (translation && (!obj[locale]?.[genField as keyof T] || skipGenFieldCheck)) return translation;

  // SWITCH : FALLBACK LOCALE CASE - The field is available in a secondary
  //   locale accepted by the user, and is a human-provided value.
  for (const fallbackLocale of opts.fallbackLocales) {
    const translation = obj[fallbackLocale]?.[field as keyof T] as string;
    if (translation && (!obj[fallbackLocale]?.[genField as keyof T] || skipGenFieldCheck)) return translation;
  }

  // SWITCH : FALLBACK VALUE CASE : If configured to prefer a generic fallback over any machine-translated values (and no human ones were found yet), return the generic fallback.
  if (opts?.preferFallbackInCurrentLocale && opts.fallback) return opts.fallback;

  // SWITCH : AI <3 CASE : The field is available in the current locale,
  // as a machine-translated value, and the user allows machine translations.
  if (translation && opts.allowMachineTranslation) return translation;

  // SWITCH : FALLBACK LOCALE AI CASE - The field is available in a secondary
  //   locale accepted by the user, is a machine-translated value, but the user
  //   accepts machine translations.
  for (const fallbackLocale of opts.fallbackLocales) {
    const translation = obj[fallbackLocale]?.[field as keyof T] as string;
    if (translation && opts.allowMachineTranslation) return translation;
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
  return opts?.fallback || defaultFallback;
}

/**
 * Get the translated value of a feature property using user preferences.
 * @param obj - The feature property to get the translated value from.
 * @param userPreferences - User preferences with defaults applied
 * @returns The translated value of the feature property.
 */
export function getFPI18n(
  obj: FeatureProperty,
  userPreferences: UserPreferences
): string {
  const field = 'value';
  const fallback = m.great_crazy_squid_promise();
  
  // CASE : SPECIFIER Property & UNIVERSAL VALUE
  if (obj.property?.type === 'specifier' && obj.value) {
    return obj.value;
  }
  // CASE : SPECIFIER Property & I18N VALUE
  else if (obj.property?.type === 'specifier' && obj.i18n) {
    return getI18n<FeaturePropertyI18nDB>(
      obj.i18n as Record<Locale, FeaturePropertyI18nDB>,
      field,
      userPreferences,
      fallback
    );
  }
  // CASE : RANGE FIELD Property (stores numeric values directly)
  else if (obj.property?.component === 'RangeField' && obj.value) {
    return obj.value;
  }
  // CASE : CLASSIFIER Property
  else if (obj.property?.type === 'classifier' && obj.propertyValue) {
    return getI18n<PropertyValueI18nDB>(
      obj.propertyValue,
      field,
      userPreferences,
      fallback
    );
  }
  // CASE : FALLBACK
  console.warn('No translation found for', obj);
  return fallback;
}

/**
 * Labels for the locales.
 * @returns The labels for the locales.
 */
export const localeLabels = [
  { locale: 'en', label: 'EN' },
  { locale: 'zh-hant', label: 'HK' },
  { locale: 'zh-hans', label: 'CN' }
];

// EXPORT PARAGLIDE
export { m, runtime };

// EXPORT CUSTOM FUNCTIONS
export async function translateText(
  sourceLang: Locale,
  targetLang: Locale,
  texts: string[]
): Promise<string[]> {
  const response = await fetch('/api/translation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourceLang,
      targetLang,
      texts
    })
  });
  const data = await response.json();
  return data;
}
