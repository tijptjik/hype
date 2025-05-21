// I18N
import * as runtime from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';
import type { Locale } from '$lib/types';
import { getLocale } from '$lib/paraglide/runtime';
import { supportedLocales } from './db/zod';

// Helper function to get translated value
// TODO I18N Refactor to handle fallbacks to other languages, and request user preferences for human-translated values
export function getI18nValue(obj: any, field: string, fallback: string = '-'): string {
  if (!obj) return fallback;
  const currentLang = getLocale();
  if (currentLang === 'en') return obj[field] || fallback;
  const translation = obj.i18n?.find((t: any) => t.lang === currentLang);
  return translation?.[field] || obj[field] || fallback;
}

/**
 * Get the fallback locales for a given locale.
 * @param locale - The locale to get the fallback locales for.
 * @returns All supported locales, excluding the given locale.
 */
function getFallbackLocales(locale: Locale): Locale[] {
  return supportedLocales.filter((l) => l !== locale);
}

/**
 * Get the translated value of a field from an object. 
 * @param obj - The object to get the translated value from.
 * @param field - The field to get the translated value from.
 * @param options - The options for the translation.
 * @param options.fallback - The fallback value if no translation is available.
 * @param options.fallbackLocales - The locales to fallback to if no translation is available.
 * @param options.allowMachineTranslation - Whether to allow machine translation.
 * @returns The translated value of the field.
 */
export async function getI18n<T>(
  obj: Record<Locale, T>,
  field: string,
  options?: {
    fallback?: string;
    fallbackLocales?: Locale[];
    allowMachineTranslation?: boolean;
    preferFallbackInCurrentLocale?: boolean;
  }
): Promise<string> {
  // If no translation options are provided, use the (default) fallback.
  if (!obj) return options?.fallback || '-';

  const genKey = `${field}Gen`;
  const locale = getLocale() as Locale;
  const fallbackLocales : Locale[] = options?.fallbackLocales || getFallbackLocales(locale);

  // Best case scenario: The field is available in the current locale, and (1) not machine-translated, or (2) the user allows machine translations.
  const translation = obj[locale]?.[field as keyof T] as string;
  if (translation && (!obj[locale]?.[genKey as keyof T] || options?.allowMachineTranslation))
    return translation;

  // If the fallback is preferred over translated values, use the fallback.
  if (options?.preferFallbackInCurrentLocale) return options?.fallback || '-';

  // Iterate through the fallback locales, and return the first available translation, if it was not machine-translated or the user allows machine translations.
  for (const fallbackLocale of fallbackLocales) {
    const translation = obj[fallbackLocale]?.[field as keyof T] as string;
    if (
      translation &&
      (!obj[fallbackLocale]?.[genKey as keyof T] || options?.allowMachineTranslation)
    )
      return translation;
  }

  // If no translation is available in the fallback locales even if machine translations are allowed, we will assume that there is no translation available in any of the fallback locales. In that case, generate a machine translation.
  if (options?.allowMachineTranslation) {
    // First find a locale which has a translation for the field.
    for (const supportedLocale of Object.keys(obj)) {
      const translation = obj[supportedLocale as keyof typeof obj]?.[field as keyof T] as string;
      if (translation) {
        const machineTranslation = await translateText(supportedLocale as Locale, locale, [translation]);
        return machineTranslation[0];
      }
    }
  }
  // If no translation is available in the fallback locales or they were machine translated, while the user does not allow machine translations, use the fallback.
  return options?.fallback || '-';
}

// EXPORT PARAGLIDE
export { getLocale, setLocale } from '$lib/paraglide/runtime';
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
