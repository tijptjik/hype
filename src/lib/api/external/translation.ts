import { v4 as uuidv4 } from 'uuid';
import { PRIVATE_AZURE_TRANSLATION_KEY } from '$env/static/private';
import { PUBLIC_AZURE_TRANSLATION_REGION } from '$env/static/public';
// Types
import type { Locale } from '$lib/types';

// CONFIG
const ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
const REGION = PUBLIC_AZURE_TRANSLATION_REGION;
const KEY = PRIVATE_AZURE_TRANSLATION_KEY;

const languageTagToApiLanguageTag = (source: Locale, target: Locale): { sourceLocale: string; targetLocale: string } => {
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

export const getTranslation = async (
  source: Locale,
  target: Locale,
  texts: string[]
): Promise<string[]> => {
  const { sourceLocale, targetLocale } = languageTagToApiLanguageTag(source, target);
  return await fetch(
    `${ENDPOINT}/translate?api-version=3.0&from=${sourceLocale}&to=${targetLocale}`,
    {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': KEY,
        'Ocp-Apim-Subscription-Region': REGION,
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
