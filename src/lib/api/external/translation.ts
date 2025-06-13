// THIRD PARTY
import { error } from '@sveltejs/kit';
// TYPES
import type { Locale } from '$lib/types';

/**
 * Translates text using Azure Cognitive Services Translator
 * @param text - The text to translate
 * @param targetLanguage - The target language code (e.g., 'zh-Hans', 'zh-Hant', 'en')
 * @param sourceLanguage - The source language code (optional, auto-detect if not provided)
 * @param region - The Azure region for the translation service
 * @param apiKey - The Azure translation API key
 * @returns Promise<string> - The translated text
 */
export async function translateText(
  text: string,
  targetLanguage: string,
  sourceLanguage: string = '',
  region: string,
  apiKey: string
): Promise<string> {
  const endpoint = 'https://api.cognitive.microsofttranslator.com';
  const path = '/translate';
  const constructed_url = endpoint + path;

  const params = new URLSearchParams({
    'api-version': '3.0',
    to: targetLanguage
  });

  if (sourceLanguage) {
    params.append('from', sourceLanguage);
  }

  const headers = {
    'Ocp-Apim-Subscription-Key': apiKey,
    'Ocp-Apim-Subscription-Region': region,
    'Content-type': 'application/json',
    'X-ClientTraceId': crypto.randomUUID()
  };

  const body = JSON.stringify([{ text }]);

  try {
    const response = await fetch(`${constructed_url}?${params}`, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      throw new Error(`Translation API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    return result[0]?.translations[0]?.text || text;
  } catch (err) {
    console.error('Translation error:', err);
    throw error(500, 'Translation service unavailable');
  }
}

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
