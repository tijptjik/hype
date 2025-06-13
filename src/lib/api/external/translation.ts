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
  texts: string[],
  sourceLocale: Locale,
  targetLocale: Locale,
  region: string,
  apiKey: string
): Promise<string> {
  const endpoint = 'https://api.cognitive.microsofttranslator.com';
  const path = '/translate';
  const constructed_url = endpoint + path;

  const params = new URLSearchParams({
    'api-version': '3.0',
    ...localeToApiLanguageTag(sourceLocale, targetLocale)
  });

  const headers = {
    'Ocp-Apim-Subscription-Key': apiKey,
    'Ocp-Apim-Subscription-Region': region,
    'Content-type': 'application/json',
    'X-ClientTraceId': crypto.randomUUID()
  };

  const body = JSON.stringify(texts.map((text) => ({ text })));

  try {
    const response = await fetch(`${constructed_url}?${params}`, {
      method: 'POST',
      headers,
      body
    });

    if (!response.ok) {
      throw new Error(
        `Translation API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data.map((item: Record<string, any>) => item.translations[0].text);
  } catch (err) {
    console.error('Translation error:', err);
    throw error(500, 'Translation service unavailable');
  }
}

/*
 * Convert locale to API language tag
 */
const localeToApiLanguageTag = (
  source: Locale,
  target: Locale
): { from: string; to: string } => {
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
    from: sourceMaps[source as keyof typeof sourceMaps] || source,
    to: targetMaps[target as keyof typeof targetMaps] || target
  };
};
