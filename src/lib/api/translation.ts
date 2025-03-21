import type { LanguageTag } from '$lib/types';
import { v4 as uuidv4 } from 'uuid';
import { PRIVATE_AZURE_TRANSLATION_KEY } from '$env/static/private';
import { PUBLIC_AZURE_TRANSLATION_REGION } from '$env/static/public';

// CONFIG
const ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
const REGION = PUBLIC_AZURE_TRANSLATION_REGION;
const KEY = PRIVATE_AZURE_TRANSLATION_KEY;

const languageTagToApiLanguageTag = (
  sourceLang: LanguageTag,
  targetLang: LanguageTag
): { source: string; target: string } => {
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
    source: sourceMaps[sourceLang] || sourceLang,
    target: targetMaps[targetLang] || targetLang
  };
};

// TODO: Implement the actual translation API call
export const getTranslation = async (
  sourceLang: LanguageTag,
  targetLang: LanguageTag,
  texts: string[]
): Promise<string[]> => {
  let { source, target } = languageTagToApiLanguageTag(sourceLang, targetLang);
  return await fetch(
    `${ENDPOINT}/translate?api-version=3.0&from=${source}&to=${target}`,
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
    .then((data) => data.map((item: Record<string, any>) => item.translations[0].text));
};
