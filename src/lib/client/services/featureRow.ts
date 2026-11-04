import { getI18n } from '#lib/i18n.js'
import {
  calculateCategoricalStatuses,
  calculateContentStatuses,
  calculateFreeformStatuses,
  calculateImageStatuses,
  calculateStatusStatuses,
  calculateTranslationStatuses,
} from '#lib/client/services/stats.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import type { Feature } from '#lib/db/zod/schema/feature.types.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'
import type { FeatureRowModel } from '#lib/client/services/featureRows.types.js'
import type { LocaleKey } from '#lib/types.js'

type BuildFeatureRowModelParams = {
  appCtx: ResourceViewCtx
  feature: Feature
  localeKey: LocaleKey
  activeTranslationLocales: LocaleKey[]
  isSuperAdmin: boolean
  userPreferences: UserPreferences
}

/**
 * Builds presentation for a mounted row using the view's existing statistic caches.
 * @param params Current Feature, view, locale and user preference inputs.
 * @returns Fresh row presentation with current labels and translations.
 * @remarks The virtual list bounds these calculations to mounted rows. Do not retain
 * a second global model cache: its output depends on reactive view definitions and preferences.
 */
export function getCachedFeatureRowModel(
  params: BuildFeatureRowModelParams,
): FeatureRowModel {
  const {
    appCtx,
    feature,
    localeKey,
    activeTranslationLocales,
    isSuperAdmin,
    userPreferences,
  } = params
  const model: FeatureRowModel = {
    id: feature.id,
    title:
      getI18n(feature as never, 'title', userPreferences, feature.id, true)?.trim() ||
      feature.id,
    description:
      getI18n(
        feature as never,
        'displayAddress',
        userPreferences,
        'No address',
        true,
      )?.trim() || 'No address',
    imageAlt:
      (feature.image as { altText?: string } | null)?.altText ?? 'Feature image',
    isPublished: feature.isPublished,
    isPendingReview: feature.isPendingReview,
    stats: {
      status: calculateStatusStatuses(appCtx, feature),
      content: calculateContentStatuses(appCtx, feature),
      translation: calculateTranslationStatuses(
        appCtx,
        feature,
        activeTranslationLocales,
        isSuperAdmin,
      ),
      image: calculateImageStatuses(appCtx, feature),
      category: calculateCategoricalStatuses(feature, appCtx, localeKey),
      freeform: calculateFreeformStatuses(feature, appCtx, localeKey),
    },
  }

  return model
}
