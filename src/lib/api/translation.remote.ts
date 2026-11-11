// PROVENANCE
import { signAutomaticTranslation } from '#lib/i18n/automaticReceipt.server.js'
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
    text: z.string().min(1).max(16_000),
  }),
  async (params, ctx): Promise<ContentTranslationResult> => {
    if (ctx.user.isAnonymous) throw error(403, 'ACCOUNT_REQUIRED')
    const key = ctx.event.locals.platform?.env.AZURE_TRANSLATION_KEY
    if (!key) throw error(500, 'Missing Azure subscription key')
    const result = await translateFieldWithAzure(
      params,
      ctx.event.locals.platform?.env.PUBLIC_AZURE_TRANSLATION_REGION || 'eastasia',
      key,
    )
    if (result.status === 'translated') {
      const secret = ctx.event.locals.platform?.env.AUTH_SECRET
      if (!secret) throw error(503, 'Translation provenance signing unavailable')
      result.automatic.receipt = await signAutomaticTranslation(
        result.automatic,
        result.target,
        secret,
      )
    }
    return result
  },
)

/** Resolve and persist an automatic translation for an authorized reader.
 * @param params Existing record identity and requested content language.
 * @returns Locale rows containing reusable automatic values, never editorial approval.
 * @remarks The normal resource query enforces visibility and hub scope before any provider call.
 */
export const getAutomaticTranslations = guardedCommand(
  z.object({
    resource: z.enum(['feature', 'hub', 'organisation', 'project', 'layer']),
    id: z.string().min(1),
    target: ContentTagInput,
  }),
  async (params, ctx): Promise<Record<string, unknown>> => {
    const query = {
      ref: params.id,
      refKey: 'id' as const,
      meta: { profile: 'detail' as const, isAdminRequest: false },
    }
    let accessible: unknown
    switch (params.resource) {
      case 'feature':
        accessible = (await (await import('./feature.remote')).getFeature(query)).data
        break
      case 'hub':
        accessible = (await (await import('./hub.remote')).getHub(query)).data
        break
      case 'organisation':
        accessible = (
          await (await import('./organisation.remote')).getOrganisation(query)
        ).data
        break
      case 'project':
        accessible = (await (await import('./project.remote')).getProject(query)).data
        break
      case 'layer':
        accessible = (await (await import('./layer.remote')).getLayer(query)).data
        break
    }
    if (
      !accessible ||
      typeof accessible !== 'object' ||
      !('modifiedAt' in accessible) ||
      typeof accessible.modifiedAt !== 'string'
    )
      throw error(404, 'Record unavailable')
    const { cacheResourceTranslations } = await import(
      '#lib/db/services/automaticTranslationCache.js'
    )
    const env = ctx.event.locals.platform.env
    return cacheResourceTranslations({
      db: ctx.db,
      resource: params.resource,
      id: params.id,
      targets: [params.target],
      expectedModifiedAt: accessible.modifiedAt,
      authorizedRows:
        'i18n' in accessible && accessible.i18n && typeof accessible.i18n === 'object'
          ? (accessible.i18n as Record<string, unknown>)
          : {},
      key: ctx.user.isAnonymous ? undefined : env.AZURE_TRANSLATION_KEY,
      region: env.PUBLIC_AZURE_TRANSLATION_REGION,
      secret: env.AUTH_SECRET,
    })
  },
)

/** Cache a readable catalogue definition and its choices in the requested language.
 * @param params Catalogue identity and reading language.
 * @returns Authorized locale maps with independently generated candidates.
 * @remarks The normal property query authorizes the persisted owner before provider requests.
 */
export const getAutomaticPropertyTranslations = guardedCommand(
  z.object({ id: z.string().min(1), target: ContentTagInput }),
  async (params, ctx) => {
    const accessible = (
      await (await import('./property.remote')).getProperty({ id: params.id })
    ).data
    if (!accessible || accessible.audience === 'internal')
      throw error(404, 'Property unavailable')
    const { cacheResourceTranslations } = await import(
      '#lib/db/services/automaticTranslationCache.js'
    )
    const env = ctx.event.locals.platform.env
    const common = {
      db: ctx.db,
      targets: [params.target],
      expectedModifiedAt: accessible.modifiedAt,
      key: ctx.user.isAnonymous ? undefined : env.AZURE_TRANSLATION_KEY,
      region: env.PUBLIC_AZURE_TRANSLATION_REGION,
      secret: env.AUTH_SECRET,
    }
    const i18n = await cacheResourceTranslations({
      ...common,
      resource: 'property',
      id: params.id,
      authorizedRows: accessible.i18n,
    })
    const values: Record<string, Record<string, unknown>> = {}
    for (const value of accessible.isTranslatable ? (accessible.values ?? []) : []) {
      values[value.id] = await cacheResourceTranslations({
        ...common,
        resource: 'propertyValue',
        id: value.id,
        authorizedRows: value.i18n ?? {},
      })
    }
    return { i18n, values }
  },
)

/** Cache visible translated text fields on an already-readable Feature.
 * @param params Feature identity and requested language.
 * @returns Locale maps keyed by visible property identity.
 * @remarks The normal public projection owns field visibility and source selection.
 */
export const getAutomaticFeaturePropertyTranslations = guardedCommand(
  z.object({ id: z.string().min(1), target: ContentTagInput }),
  async (params, ctx): Promise<Record<string, Record<string, unknown>>> => {
    const accessible = (
      await (
        await import('./feature.remote')
      ).getFeature({
        ref: params.id,
        refKey: 'id',
        meta: { profile: 'detail', isAdminRequest: false },
      })
    ).data
    if (!accessible) throw error(404, 'Feature unavailable')
    const { cacheResourceTranslations } = await import(
      '#lib/db/services/automaticTranslationCache.js'
    )
    const env = ctx.event.locals.platform.env
    const result: Record<string, Record<string, unknown>> = {}
    for (const row of accessible.properties ?? []) {
      if (
        row.property?.audience === 'internal' ||
        row.property?.type !== 'specifier' ||
        !row.property?.isTranslatable
      )
        continue
      result[row.propertyId] = await cacheResourceTranslations({
        db: ctx.db,
        resource: 'featureProperty',
        id: params.id,
        propertyId: row.propertyId,
        targets: [params.target],
        authorizedRows: row.i18n ?? {},
        expectedModifiedAt: accessible.modifiedAt,
        key: ctx.user.isAnonymous ? undefined : env.AZURE_TRANSLATION_KEY,
        region: env.PUBLIC_AZURE_TRANSLATION_REGION,
        secret: env.AUTH_SECRET,
      })
    }
    return result
  },
)
