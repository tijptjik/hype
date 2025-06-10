import { json } from '@sveltejs/kit';
// LIB
import { getTranslation } from '$lib/api/external/translation';

export async function POST({ request }) {
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

    const translations = await getTranslation(source, target, texts);

    return json(translations);
  } catch (error) {
    console.error('Translation error:', error);
    return json({ error: 'Failed to process translation' }, { status: 500 });
  }
}
