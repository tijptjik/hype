import { json } from '@sveltejs/kit'
// LIB
import { translateText } from '$lib/api/external/translation'

export async function POST({
  request,
  platform,
}: {
  request: Request
  platform: App.Platform
}) {
  try {
    const { source, target, texts } = await request.json()

    // ASSERT :: Validate inputs
    if (!source || !target || !Array.isArray(texts)) {
      return json(
        {
          error:
            'Invalid request. Required fields: sourceLang, targetLang, texts (array)',
        },
        { status: 400 },
      )
    }

    // Get Azure translation key from platform
    const subscriptionKey = platform.env.AZURE_TRANSLATION_KEY
    const region = platform.env.PUBLIC_AZURE_TRANSLATION_REGION

    if (!subscriptionKey) {
      return json({ error: 'Missing Azure subscription key' }, { status: 500 })
    }

    const translations = await translateText(
      texts,
      source,
      target,
      region,
      subscriptionKey,
    )

    return json(translations)
  } catch (error) {
    console.error('Translation error:', error)
    return json({ error: 'Failed to process translation' }, { status: 500 })
  }
}
