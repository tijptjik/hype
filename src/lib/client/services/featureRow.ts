import { getI18n } from '$lib/i18n'
import {
  calculateCategoricalStatuses,
  calculateContentStatuses,
  calculateFreeformStatuses,
  calculateImageStatuses,
  calculateStatusStatuses,
  calculateTranslationStatuses,
} from '$lib/client/services/stats'
import type { AppCtx } from '$lib/context/app.svelte'
import type { Feature } from '$lib/db/zod/schema/feature.types'
import type { UserPreferences } from '$lib/db/zod/schema/user.types'
import type { FeatureRowModel, LocaleKey } from '$lib/types'

type FeatureRowModelCacheEntry = {
  signature: string
  model: FeatureRowModel
}

type BuildFeatureRowModelParams = {
  appCtx: AppCtx
  feature: Feature
  localeKey: LocaleKey
  activeTranslationLocales: LocaleKey[]
  isSuperAdmin: boolean
  userPreferences: UserPreferences
}

const featureRowModelCache = new Map<string, FeatureRowModelCacheEntry>()

function toFeatureRowModelSignature({
  feature,
  localeKey,
  activeTranslationLocales,
  isSuperAdmin,
}: Omit<BuildFeatureRowModelParams, 'appCtx' | 'userPreferences'>): string {
  const propertySignature = feature.properties
    .map(property => {
      const localizedValue = property.i18n?.[localeKey]?.value ?? ''
      return [
        property.propertyId,
        property.propertyValueId ?? '',
        property.value ?? '',
        localizedValue,
      ].join(':')
    })
    .join('|')

  const imageSignature = (feature.images ?? [])
    .map(image => `${image.image?.id ?? ''}:${image.image?.isPublished ?? ''}`)
    .join('|')

  return [
    feature.id,
    feature.modifiedAt ?? '',
    localeKey,
    activeTranslationLocales.join(','),
    isSuperAdmin ? '1' : '0',
    feature.isPublished ? '1' : '0',
    feature.isPendingReview ? '1' : '0',
    feature.isVisitable ? '1' : '0',
    feature.isIntangible ? '1' : '0',
    imageSignature,
    propertySignature,
  ].join('::')
}

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
  const signature = toFeatureRowModelSignature({
    feature,
    localeKey,
    activeTranslationLocales,
    isSuperAdmin,
  })
  const cached = featureRowModelCache.get(feature.id)

  if (cached?.signature === signature) {
    return cached.model
  }

  const model: FeatureRowModel = {
    id: feature.id,
    title:
      getI18n(feature as never, 'title', userPreferences, feature.id)?.trim() ||
      feature.id,
    description:
      getI18n(
        feature as never,
        'displayAddress',
        userPreferences,
        'No address',
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

  featureRowModelCache.set(feature.id, {
    signature,
    model,
  })

  return model
}
