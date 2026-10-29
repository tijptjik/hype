import { error } from '@sveltejs/kit'
import { z } from 'zod'
import {
  translateText as translateWithAzure,
  translateContentField as translateFieldWithAzure,
  type ContentTranslationResult,
} from '#lib/api/external/translation.js'
import { guardedCommand } from '#lib/api/server/guarded.js'

// CONTENT CONTRACT
import { ContentTagInput } from '#lib/i18n/contentRecords.js'

const TranslationParamsSchema = z.object({
  source: ContentTagInput,
  target: ContentTagInput,
  texts: z
    .array(z.string().min(1).max(5_000))
    .min(1)
    .max(100)
    .refine(texts => texts.reduce((total, text) => total + text.length, 0) <= 50_000, {
      message: 'Translation request exceeds the maximum text volume',
    }),
})

/** Translate a bounded batch for existing callers.
 * @param params Source, target and text batch. @returns Provider translations.
 * @remarks Requires a non-anonymous account before spending provider quota.
 */
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

/** Translate one field; the caller owns target eligibility, fanout and stale-response guards.
 * @param params Immutable text, source tag and target tag.
 * @returns A typed per-target result; never writes content or verification state.
 */
export const translateContentField = guardedCommand(
  z.object({
    source: ContentTagInput,
    target: ContentTagInput,
    text: z.string().min(1).max(8192),
  }),
  async (params, ctx): Promise<ContentTranslationResult> => {
    if (ctx.user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    const key = ctx.event.locals.platform?.env.AZURE_TRANSLATION_KEY
    if (!key) throw error(500, 'Missing Azure subscription key')
    return translateFieldWithAzure(
      params,
      ctx.event.locals.platform?.env.PUBLIC_AZURE_TRANSLATION_REGION || 'eastasia',
      key,
    )
  },
)
