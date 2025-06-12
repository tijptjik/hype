import { json } from '@sveltejs/kit';
// LIB
import { getTranslation } from '$lib/api/external/translation';

export async function POST({ request, event }) {
  try {
    const { source, target, texts } = await request.json();

    // ASSERT :: Validate inputs
    if (!source || !target || !Array.isArray(texts)) {
      return json(
        {
          error:
            'Invalid request. Required fields: sourceLang, targetLang, texts (array)'
        },
        { status: 400 }
      );
    }

    // Get Azure translation key from platform
    const subscriptionKey = event.platform?.env?.AZURE_TRANSLATION_KEY;

    if (!subscriptionKey) {
      return json({ error: 'Missing Azure subscription key' }, { status: 500 });
    }

    const translations = await getTranslation(
      source,
      target,
      texts,
      azureTranslationKey
    );

    return json(translations);
  } catch (error) {
    console.error('Translation error:', error);
    return json({ error: 'Failed to process translation' }, { status: 500 });
  }
}
