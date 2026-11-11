// CONTENT
import {
  cacheResourceTranslations,
  type TranslationResource,
} from '#lib/db/services/automaticTranslationCache.js'
import { canonicalContentTag } from '#lib/i18n/contentRecords.js'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'
import type { AutomaticTranslations } from '#lib/i18n/automatic.js'

/** Run one cache refresh, allowing catalogue callers to bound provider concurrency.
 * @param ctx Request lifetime and provider bindings. @param resource Resource kind.
 * @param id Successfully saved identity. @param rows Submitted, server-validated candidates.
 * @returns Nothing; failures leave the existing published fallback intact.
 */
async function cacheSubmittedTranslations(
  ctx: GuardedBaseContext,
  resource: TranslationResource,
  id: string,
  rows?: Record<string, unknown>,
): Promise<void> {
  if (!rows) return
  const candidates = Object.fromEntries(
    Object.entries(rows ?? {}).map(([locale, row]) => [
      canonicalContentTag(locale),
      (row as { autoTranslated?: AutomaticTranslations }).autoTranslated ?? {},
    ]),
  )
  const env = ctx.event.locals.platform?.env
  await cacheResourceTranslations({
    db: ctx.db,
    resource,
    id,
    targets: ['en', 'zh-Hant', 'zh-Hans', ...Object.keys(candidates)],
    candidates,
    key: env?.AZURE_TRANSLATION_KEY,
    region: env?.PUBLIC_AZURE_TRANSLATION_REGION,
    secret: env?.AUTH_SECRET,
  }).catch(error => {
    console.error('Automatic translation cache could not be refreshed', {
      resource,
      id,
      error,
    })
  })
}

/** Cache common languages after a successful save without delaying publication.
 * @param ctx Request lifetime and provider bindings. @param resource Resource kind.
 * @param id Saved identity. @param rows Validated submitted candidates.
 * @returns Nothing; schedules a bounded field-by-field refresh.
 */
export function scheduleAutomaticTranslations(
  ctx: GuardedBaseContext,
  resource: TranslationResource,
  id: string,
  rows?: Record<string, unknown>,
): void {
  ctx.event.locals.platform.context.waitUntil(
    cacheSubmittedTranslations(ctx, resource, id, rows),
  )
}

/** Warm common languages for saved catalogue labels and options independently of approval.
 * @param ctx Request lifetime and provider bindings. @param properties Saved definitions.
 * @returns Nothing; background failures retain the published fallback.
 */
export function schedulePropertyTranslations(
  ctx: GuardedBaseContext,
  properties?: readonly {
    id?: string
    i18n?: Record<string, unknown> | null
    values?: readonly { id?: string; i18n?: Record<string, unknown> | null }[] | null
  }[],
): void {
  const task = (async () => {
    for (const property of properties ?? []) {
      if (property.id)
        await cacheSubmittedTranslations(
          ctx,
          'property',
          property.id,
          property.i18n ?? undefined,
        )
      for (const value of property.values ?? []) {
        if (value.id)
          await cacheSubmittedTranslations(
            ctx,
            'propertyValue',
            value.id,
            value.i18n ?? undefined,
          )
      }
    }
  })()
  ctx.event.locals.platform.context.waitUntil(task)
}

/** Cache common languages for saved Feature text fields without accepting them.
 * @param ctx Request lifetime and provider bindings. @param id Saved Feature identity.
 * @param properties Submitted field rows. @returns Nothing; schedules bounded per-field work.
 */
export function scheduleFeaturePropertyTranslations(
  ctx: GuardedBaseContext,
  id: string,
  properties?: readonly { propertyId: string; i18n?: Record<string, unknown> }[],
): void {
  const env = ctx.event.locals.platform?.env
  const task = (async () => {
    for (const property of properties ?? []) {
      if (!property.i18n) continue
      await cacheResourceTranslations({
        db: ctx.db,
        resource: 'featureProperty',
        id,
        propertyId: property.propertyId,
        targets: ['en', 'zh-Hant', 'zh-Hans'],
        key: env?.AZURE_TRANSLATION_KEY,
        region: env?.PUBLIC_AZURE_TRANSLATION_REGION,
        secret: env?.AUTH_SECRET,
      })
    }
  })().catch(error =>
    console.error('Feature field translation cache could not be refreshed', {
      id,
      error,
    }),
  )
  ctx.event.locals.platform.context.waitUntil(task)
}
