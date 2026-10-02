import { error } from '@sveltejs/kit'
import { z } from 'zod'
import { translateText as translateWithAzure } from '#lib/api/external/translation.js'
import { guardedCommand } from '#lib/api/server/guarded.js'

const TranslationParamsSchema = z.object({
  source: z.enum(['en', 'zhHans', 'zhHant']),
  target: z.enum(['en', 'zhHans', 'zhHant']),
  texts: z
    .array(z.string().min(1).max(5_000))
    .min(1)
    .max(100)
    .refine(texts => texts.reduce((total, text) => total + text.length, 0) <= 50_000, {
      message: 'Translation request exceeds the maximum text volume',
    }),
})

export const translateText = guardedCommand(
  TranslationParamsSchema,
  async (params, ctx): Promise<string[]> => {
    if (ctx.user.isAnonymous) {
      throw error(403, 'ACCOUNT_REQUIRED')
    }

    const subscriptionKey = ctx.event.locals.platform?.env.AZURE_TRANSLATION_KEY
    const region =
      ctx.event.locals.platform?.env.PUBLIC_AZURE_TRANSLATION_REGION || 'eastasia'

    if (!subscriptionKey) {
      throw error(500, 'Missing Azure subscription key')
    }

    return translateWithAzure(
      params.texts,
      params.source,
      params.target,
      region,
      subscriptionKey,
    )
  },
)
