import { createI18n } from '@inlang/paraglide-sveltekit';
// I18N
import * as runtime from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';

export const i18n = createI18n(runtime);

// Helper function to get translated value
export function getI18nValue(obj: any, field: string): string {
  const currentLang = runtime.languageTag();
  if (currentLang === 'en') return obj[field];
  const translation = obj.translations?.find((t: any) => t.lang === currentLang);
  return translation?.[field] || obj[field]; // fallback to English if translation not found
}

export { languageTag, setLanguageTag } from '$lib/paraglide/runtime';
export { m, runtime };
