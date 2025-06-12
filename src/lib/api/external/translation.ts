// SVELTE
import { PUBLIC_AZURE_TRANSLATION_REGION } from '$env/static/public';
// THIRD PARTY
import { v4 as uuidv4 } from 'uuid';
// TYPES
import type { Locale } from '$lib/types';

/*
 * Get translation from Azure Translation API
 */
export const getTranslation = async (
  source: Locale,
  target: Locale,
  texts: string[],
  subscriptionKey: string
): Promise<string[]> => {
  const { sourceLocale, targetLocale } = languageTagToApiLanguageTag(source, target);
  const ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
  return await fetch(
    `${ENDPOINT}/translate?api-version=3.0&from=${sourceLocale}&to=${targetLocale}`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Ocp-Apim-Subscription-Region': PUBLIC_AZURE_TRANSLATION_REGION,
        'Content-type': 'application/json',
        'X-ClientTraceId': uuidv4().toString()
      },
      body: JSON.stringify(
        texts.map((text) => ({
          text: text
        }))
      )
    }
  )
    .then((response) => response.json())
    .then((data) => {
      return data.map((item: Record<string, any>) => item.translations[0].text);
    });
};

/*
 * Convert locale to API language tag
 */
const languageTagToApiLanguageTag = (
  source: Locale,
  target: Locale
): { sourceLocale: string; targetLocale: string } => {
  const sourceMaps = {
    en: 'en',
    'zh-hant': 'yue',
    'zh-hans': 'zh-Hans'
  };
  const targetMaps = {
    en: 'en',
    'zh-hant': 'yue',
    'zh-hans': 'zh-Hans'
  };
  return {
    sourceLocale: sourceMaps[source as keyof typeof sourceMaps] || source,
    targetLocale: targetMaps[target as keyof typeof targetMaps] || target
  };
};
