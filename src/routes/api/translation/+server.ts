import { json } from '@sveltejs/kit';
// LIB
import { getTranslation } from '$lib/api/translation';
// TYPES
import type { Locale } from '$lib/types';

export async function POST({ request }) {
  try {
    const body = await request.json();
    const { sourceLang, targetLang, texts } = body;

    // Validate inputs
    if (!sourceLang || !targetLang || !Array.isArray(texts)) {
      return json(
        {
          error:
            'Invalid request. Required fields: sourceLang, targetLang, texts (array)'
        },
        { status: 400 }
      );
    }

    const translations = await getTranslation(
      sourceLang as Locale,
      targetLang as Locale,
      texts
    );

    return json(translations);
  } catch (error) {
    console.error('Translation error:', error);
    return json({ error: 'Failed to process translation' }, { status: 500 });
  }
}
