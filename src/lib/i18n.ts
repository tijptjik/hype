// I18N
import * as runtime from '$lib/paraglide/runtime';
import * as m from '$lib/paraglide/messages';
import type { LanguageTag } from '$lib/types';

// Helper function to get translated value
export function getI18nValue(obj: any, field: string): string {
  if (!obj) return '-';
  const currentLang = runtime.getLocale();
  if (currentLang === 'en') return obj[field];
  const translation = obj.translations?.find((t: any) => t.lang === currentLang);
  return translation?.[field] || obj[field]; // fallback to English if translation not found
}

export { getLocale, setLocale } from '$lib/paraglide/runtime';
export { m, runtime };

export async function translateText(
  sourceLang: LanguageTag,
  targetLang: LanguageTag,
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
