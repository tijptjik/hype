// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// I18N
import { m, supportedLocaleKeys } from '$lib/i18n'
// SERVICES
import { sortProperties } from '$lib/client/services/property'
// TYPES
import type { Property } from '$lib/db/zod/schema/property.types'
import type { AppCtx } from '$lib/context/app.svelte'
import type {
  Feature,
  FeatureFromCollection,
  FeatureI18nDB,
  UserContributedFeature,
} from '$lib/db/zod/schema/feature.types'
import type { Id, LocaleKey } from '$lib/types'

type StatisticType = 'boolean' | 'count' | 'mean' | 'sum'
type StatisticValue = boolean | number | null
type StatisticRecord = {
  value: StatisticValue
  type: StatisticType
}
type AdminStatsCtx = {
  appCtx?: {
    state?: {
      viewFilters?: {
        feature?: {
          translationLocales?: Record<LocaleKey, boolean>
        }
      }
    }
  }
}
type FeatureWithImageStats =
  | FeatureFromCollection
  | (Feature & {
      imageCount?: number
      imagePublishedCount?: number
    })

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. CACHE PRIMITIVES
// - getStatistic
// - setStatistic
//
// 1. FEATURE CACHE ACCESSORS
// - getCachedFeatureBoolean
// - setCachedFeatureBoolean
// - getCachedFeatureTriState
// - setCachedFeatureTriState
// - getCachedFeatureTranslationBoolean
// - setCachedFeatureTranslationBoolean
// - getCachedFeatureTranslationTriState
// - setCachedFeatureTranslationTriState
// - getCachedFeaturePropertyBoolean
// - setCachedFeaturePropertyBoolean
// - getCachedFeatureSpecifierTranslation
//
// 2. COMPLETION CALCULATORS
// - calculateContentCompletion
// - calculateTranslationCompletion
// - calculateTranslationCompletionTriState
// - calculateImageCompletion
// - calculateSpecifierTranslation
//
// 3. CACHE PRIMING
// - primeFeatureStatsCache
//
// 4. STATUS MAP BUILDERS
// - calculateStatusStatuses
// - calculateContentStatuses
// - calculateImageStatuses
// - clearCachedFeatureTranslationStats
// - getTranslationTooltip
// - calculateTranslationStatuses
//
// 5. PROPERTY-SCOPED HELPERS
// - getAvailableFeatureStatProperties
// - calculateClassifierPresence
// - calculateCategoricalStatuses
// - calculateFreeformStatuses
// - calculateSpecifierPresence
//
// 6. AGGREGATE STATISTICS
// - calculateOverallStats
// ---

// ---
/********************
 *  0. CACHE PRIMITIVES
 ************/
// +++ Cache Primitives

export function getStatistic(
  appCtx: AppCtx,
  resourceType: FirstClassResource,
  id: string,
  statistic: string,
): StatisticRecord | undefined {
  return appCtx.cache.stats.get(resourceType)?.get(id)?.get(statistic)
}

export function setStatistic(
  appCtx: AppCtx,
  resourceType: FirstClassResource,
  id: string,
  statistic: string,
  value: StatisticValue,
  type: StatisticType,
): void {
  let resourceStats = appCtx.cache.stats.get(resourceType)

  if (!resourceStats) {
    resourceStats = new SvelteMap()
    appCtx.cache.stats.set(resourceType, resourceStats)
  }

  let entityStats = resourceStats.get(id)
  if (!entityStats) {
    entityStats = new SvelteMap()
    resourceStats.set(id, entityStats)
  }

  entityStats.set(statistic, { value, type })
}

// ---
/********************
 *  1. FEATURE CACHE ACCESSORS
 ************/
// +++ Feature Cache Accessors

// Helper method to get cached boolean statistics for features (read-only)
export function getCachedFeatureBoolean(
  appCtx: AppCtx,
  feature: FeatureFromCollection | Feature | UserContributedFeature,
  statistic: string,
  calculator: (
    feature: FeatureFromCollection | Feature | UserContributedFeature,
  ) => boolean,
): boolean {
  const featureId = 'id' in feature ? feature.id : undefined
  if (featureId) {
    const cached = getStatistic(
      appCtx,
      FirstClassResource.feature,
      featureId,
      statistic,
    )
    if (cached && cached.type === 'boolean') {
      return cached.value
    }
  }

  // Pure calculation without side effects
  return calculator(feature)
}

// Helper method to set cached boolean statistics for features (separate from reading)
export function setCachedFeatureBoolean(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  statistic: string,
  value: boolean,
): void {
  setStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    statistic,
    value,
    'boolean',
  )
}

// Helper methods for tri-state caching (boolean | null)
export function getCachedFeatureTriState(
  appCtx: AppCtx,
  feature: FeatureFromCollection | Feature,
  statistic: string,
  calculator: (feature: FeatureFromCollection | Feature) => boolean | null,
): boolean | null {
  const cached = getStatistic(appCtx, FirstClassResource.feature, feature.id, statistic)
  if (cached && cached.type === 'boolean') {
    return cached.value // Can be boolean or null
  }

  // Pure calculation without side effects
  return calculator(feature)
}

export function setCachedFeatureTriState(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  statistic: string,
  value: boolean | null,
): void {
  setStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    statistic,
    value,
    'boolean',
  )
}

// Helper methods for per-locale translation caching
export function getCachedFeatureTranslationBoolean(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  statistic: string,
  locale: string,
  calculator: (feature: FeatureFromCollection, locale: string) => boolean,
): boolean {
  const localeStatistic = `${statistic}.${locale}`
  const cached = getStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    localeStatistic,
  )
  if (cached && cached.type === 'boolean') {
    return cached.value
  }

  // Pure calculation without side effects
  return calculator(feature, locale)
}

export function setCachedFeatureTranslationBoolean(
  appCtx: AppCtx,
  feature: Feature,
  statistic: string,
  locale: string,
  value: boolean,
): void {
  const localeStatistic = `${statistic}.${locale}`
  setStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    localeStatistic,
    value,
    'boolean',
  )
}

// Helper methods for per-locale translation tri-state caching (boolean | null)
export function getCachedFeatureTranslationTriState(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  statistic: string,
  locale: LocaleKey,
  calculator: (feature: FeatureFromCollection, locale: LocaleKey) => boolean | null,
): boolean | null {
  const localeStatistic = `${statistic}.${locale}`
  const cached = getStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    localeStatistic,
  )
  if (cached && cached.type === 'boolean') {
    return cached.value // Can be boolean or null
  }

  // Pure calculation without side effects
  return calculator(feature, locale)
}

export function setCachedFeatureTranslationTriState(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  statistic: string,
  locale: LocaleKey,
  value: boolean | null,
): void {
  const localeStatistic = `${statistic}.${locale}`
  setStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    localeStatistic,
    value,
    'boolean',
  )
}

// Helper methods for property-based caching (categories/specifiers)
export function getCachedFeaturePropertyBoolean(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  propertyId: string,
  calculator: (
    feature: FeatureFromCollection,
    propertyId: string,
    appCtx?: AppCtx,
  ) => boolean,
): boolean {
  const propertyStatistic = `properties.${propertyId}`
  const cached = getStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    propertyStatistic,
  )
  if (cached && cached.type === 'boolean') {
    return cached.value
  }

  // Pure calculation without side effects
  return calculator(feature, propertyId, appCtx)
}

export function setCachedFeaturePropertyBoolean(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  propertyId: string,
  value: boolean,
): void {
  const propertyStatistic = `properties.${propertyId}`
  setStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    propertyStatistic,
    value,
    'boolean',
  )
}

// Helper function for tri-state specifier translation caching
export function getCachedFeatureSpecifierTranslation(
  appCtx: AppCtx,
  feature: Feature | FeatureFromCollection,
  calculator: (feature: Feature | FeatureFromCollection) => boolean | null,
): boolean | null {
  const cached = getStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    'isSpecifierTranslated',
  )
  if (cached && cached.type === 'boolean') {
    return cached.value // Can be boolean or null
  }

  // Pure calculation without side effects
  return calculator(feature)
}

// ---
/********************
 *  2. COMPLETION CALCULATORS
 ************/
// +++ Completion Calculators

export function calculateContentCompletion(
  _appCtx: AppCtx,
  feature: FeatureFromCollection,
): { title: boolean; description: boolean } {
  return {
    title: (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).some(
      (t: FeatureI18nDB) => !t.titleGen && t.title && t.title.length > 0,
    ),
    description: (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).some(
      (t: FeatureI18nDB) =>
        !t.descriptionGen && t.description && t.description.length > 0,
    ),
  }
}

export function calculateTranslationCompletion(
  _appCtx: AppCtx,
  feature: FeatureFromCollection,
  locale?: LocaleKey,
): Record<string, boolean> {
  const i18nEntries = feature?.i18n ?? {}

  // If locale is specified, return per-locale status
  if (locale) {
    const entry = i18nEntries[locale]
    if (!entry) {
      return {
        title: false,
        description: false,
        displayAddress: false,
      }
    }

    return {
      title: !entry.titleGen && !!entry.title && entry.title.length > 0,
      description:
        !entry.descriptionGen && !!entry.description && entry.description.length > 0,
      displayAddress:
        !entry.displayAddressGen &&
        !!entry.displayAddress &&
        entry.displayAddress.length > 0,
    }
  }

  // For backward compatibility, return global status (ALL locales must have translations)
  const allEntries = Object.values(i18nEntries) as FeatureI18nDB[]
  if (allEntries.length === 0) {
    return {
      title: false,
      description: false,
      displayAddress: false,
    }
  }

  return {
    title: allEntries.every(t => !t.titleGen && t.title && t.title.length > 0),
    description: allEntries.every(
      t =>
        (!t.descriptionGen && t.description && t.description.length > 0) ||
        !t.description ||
        t.description.length === 0,
    ),
    displayAddress: allEntries.every(
      t =>
        (!t.displayAddressGen && t.displayAddress && t.displayAddress.length > 0) ||
        !t.displayAddress ||
        t.displayAddress.length === 0,
    ),
  }
}

// New tri-state translation completion function
export function calculateTranslationCompletionTriState(
  _appCtx: AppCtx,
  feature: FeatureFromCollection,
  locale: LocaleKey,
): Record<string, boolean | null> {
  const i18nEntries = feature?.i18n ?? {}

  // Helper function to check tri-state for each field
  const checkField = (
    fieldKey: 'title' | 'description' | 'displayAddress',
    genKey: 'titleGen' | 'descriptionGen' | 'displayAddressGen',
  ): boolean | null => {
    // First check if this specific locale has content
    const entry = i18nEntries[locale]
    if (!entry) {
      // No i18n entry for this locale - check if ANY locale has manual content
      return checkIfAnyLocaleHasManualContent(fieldKey, genKey)
    }

    const fieldValue = entry[fieldKey]
    if (!fieldValue || fieldValue.length === 0) {
      // No content in this locale - check if ANY locale has manual content
      return checkIfAnyLocaleHasManualContent(fieldKey, genKey)
    }

    const isGenerated = entry[genKey] ?? false // Default to false if missing

    // Has content in this locale - check if it's translated (not generated)
    return !isGenerated
  }

  // Helper function to check if ANY locale has manual (non-generated) content for this field
  const checkIfAnyLocaleHasManualContent = (
    fieldKey: 'title' | 'description' | 'displayAddress',
    genKey: 'titleGen' | 'descriptionGen' | 'displayAddressGen',
  ): boolean | null => {
    const allEntries = Object.values(i18nEntries)

    // Check if ANY locale has manual content for this field
    const hasManualContent = allEntries.some(entry => {
      const fieldValue = entry[fieldKey]
      const isGenerated = entry[genKey] ?? false
      return fieldValue && fieldValue.length > 0 && !isGenerated
    })

    if (hasManualContent) {
      // Some locale has manual content, but not this specific locale
      return false // This locale is not translated
    } else {
      // No locale has manual content - return null (no manual translation available)
      return null
    }
  }

  return {
    title: checkField('title', 'titleGen'),
    description: checkField('description', 'descriptionGen'),
    displayAddress: checkField('displayAddress', 'displayAddressGen'),
  }
}

export function calculateImageCompletion(feature: FeatureWithImageStats): {
  hasImage: boolean
  isOneImagePublished: boolean | null
  isAllImagePublished: boolean | null
} {
  // Check if feature has the new count fields (from collection API)
  const imageCount = feature.imageCount ?? 0
  const imagePublishedCount = feature.imagePublishedCount ?? 0

  return {
    hasImage: imageCount > 0,
    // Tri-state logic: true = has images AND at least one published, false = has images BUT none published, null = no images
    isOneImagePublished: imageCount === 0 ? null : imagePublishedCount > 0,
    // Tri-state logic: true = has images AND all published, false = has images BUT not all published, null = no images
    isAllImagePublished: imageCount === 0 ? null : imagePublishedCount === imageCount,
  }
}

export function calculateSpecifierTranslation(
  feature: Feature | FeatureFromCollection,
): boolean | null {
  // Get all feature properties
  const properties = feature.properties || []

  // Find properties that have i18n objects
  const propertiesWithI18n = properties.filter(
    fp => fp.i18n && Object.keys(fp.i18n).length > 0,
  )

  // If no properties have i18n objects, no source available to translate
  if (propertiesWithI18n.length === 0) {
    return null
  }

  // Check if ALL i18n entries across ALL properties have no source content
  const allEmpty = propertiesWithI18n.every(fp => {
    const i18nEntries = Object.values(fp.i18n || {})
    // Check if ALL i18n entries are empty (undefined, null, or empty string)
    return i18nEntries.every(
      i18nEntry => !i18nEntry.value || i18nEntry.value.trim() === '',
    )
  })

  // If all content is empty across all locales, no source available
  if (allEmpty) {
    return null
  }

  // Check if EVERY property with i18n has valueGen = false for ALL i18n entries
  return propertiesWithI18n.every(fp => {
    const i18nEntries = Object.values(fp.i18n || {})
    // Every i18n entry must have valueGen = false (not auto-generated)
    return i18nEntries.every(i18nEntry => i18nEntry.valueGen === false)
  })
}

// ---
/********************
 *  3. CACHE PRIMING
 ************/
// +++ Cache Priming

// Pre-populate stats cache for a feature (called during feature refresh)
export function primeFeatureStatsCache(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
): void {
  // Clear existing cache for this feature to ensure fresh calculation with correct image logic
  const resourceStats = appCtx.cache.stats.get(FirstClassResource.feature)
  if (resourceStats?.has(feature.id)) {
    resourceStats.delete(feature.id)
  }

  // Cache boolean statistics (DRY approach)
  const booleanStats = {
    isPendingReview: feature.isPendingReview,
    isPublished: feature.isPublished,
    isVisitable: feature.isVisitable,
    isIntangible: feature.isIntangible,
  }

  Object.entries(booleanStats).forEach(([key, value]) => {
    setCachedFeatureBoolean(appCtx, feature, key, value)
  })

  // Cache completion statistics for all sections using proper key mappings
  // Cache translation status per-locale using tri-state logic
  supportedLocaleKeys.forEach(locale => {
    const translationCompletion = calculateTranslationCompletionTriState(
      appCtx,
      feature,
      locale,
    )
    setCachedFeatureTranslationTriState(
      appCtx,
      feature,
      'isTitleTranslated',
      locale,
      translationCompletion.title,
    )
    setCachedFeatureTranslationTriState(
      appCtx,
      feature,
      'isDescriptionTranslated',
      locale,
      translationCompletion.description,
    )
    setCachedFeatureTranslationTriState(
      appCtx,
      feature,
      'isAddressTranslated',
      locale,
      translationCompletion.displayAddress,
    )
  })

  // Calculate specifier translation completion (this is now tri-state like other translations)
  const specifierTranslated = calculateSpecifierTranslation(feature)
  setStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    'isSpecifierTranslated',
    specifierTranslated,
    'boolean',
  )

  const contentCompletion = calculateContentCompletion(appCtx, feature)
  setCachedFeatureBoolean(appCtx, feature, 'hasTitle', contentCompletion.title)
  setCachedFeatureBoolean(
    appCtx,
    feature,
    'hasDescription',
    contentCompletion.description,
  )

  // Calculate hasDisplayAddress separately (same logic as hasTitle/hasDescription)
  const hasDisplayAddress = (
    Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]
  ).some(
    (t: FeatureI18nDB) =>
      !t.displayAddressGen && t.displayAddress && t.displayAddress.length > 0,
  )
  setCachedFeatureBoolean(appCtx, feature, 'hasDisplayAddress', hasDisplayAddress)

  const imageCompletion = calculateImageCompletion(feature)
  setCachedFeatureBoolean(appCtx, feature, 'hasImage', imageCompletion.hasImage)
  setCachedFeatureTriState(
    appCtx,
    feature,
    'isOneImagePublished',
    imageCompletion.isOneImagePublished,
  )
  setCachedFeatureTriState(
    appCtx,
    feature,
    'isAllImagePublished',
    imageCompletion.isAllImagePublished,
  )

  // Cache property presence by propertyId (not index)
  const allProperties = appCtx.cache.property

  // Cache classifier (category) presence
  const classifiers = Array.from(allProperties.values()).filter(
    p => p.type === 'classifier',
  )
  classifiers.forEach(property => {
    const isPresent = calculateClassifierPresence(feature, property.id, appCtx)
    setCachedFeaturePropertyBoolean(appCtx, feature, property.id, isPresent)
  })

  // Cache specifier presence
  const specifiers = Array.from(allProperties.values()).filter(
    p => p.type === 'specifier',
  )
  specifiers.forEach(property => {
    const isPresent = calculateSpecifierPresence(feature, property.id)
    setCachedFeaturePropertyBoolean(appCtx, feature, property.id, isPresent)
  })
}

// ---
/********************
 *  4. STATUS MAP BUILDERS
 ************/
// +++ Status Map Builders

export function calculateStatusStatuses(
  appCtx: AppCtx,
  feature: FeatureFromCollection | Feature | UserContributedFeature,
): Record<string, boolean> {
  const isPendingReview = getCachedFeatureBoolean(
    appCtx,
    feature,
    'isPendingReview',
    value => Boolean((value as FeatureFromCollection | Feature).isPendingReview),
  )
  const isPublished = getCachedFeatureBoolean(appCtx, feature, 'isPublished', value =>
    Boolean((value as FeatureFromCollection | Feature).isPublished),
  )
  const isVisitable = getCachedFeatureBoolean(appCtx, feature, 'isVisitable', value =>
    Boolean((value as FeatureFromCollection | Feature).isVisitable),
  )
  const isIntangible = getCachedFeatureBoolean(appCtx, feature, 'isIntangible', value =>
    Boolean((value as FeatureFromCollection | Feature).isIntangible),
  )

  const result: Record<string, boolean> = {}
  const statusItems = [
    { key: m.plain_broad_shell_dart(), value: !isPendingReview },
    { key: m.published(), value: isPublished },
    { key: m.dry_aware_squirrel_cheer(), value: isVisitable },
    { key: m.teary_fit_maggot_socket(), value: !isIntangible },
  ]

  statusItems.forEach(({ key, value }) => {
    result[value ? key : `${m.filters__not()} ${key}`] = value
  })

  return result
}

export function calculateContentStatuses(
  appCtx: AppCtx,
  feature: FeatureFromCollection | Feature | UserContributedFeature,
): Record<string, boolean> {
  const result: Record<string, boolean> = {}

  const contentItems = [
    {
      key: m.feature__title(),
      value: getCachedFeatureBoolean(appCtx, feature, 'hasTitle', current =>
        (
          Object.values(
            (current as FeatureFromCollection | Feature).i18n ?? {},
          ) as Array<Record<string, unknown>>
        ).some(
          translation =>
            !translation.titleGen &&
            typeof translation.title === 'string' &&
            translation.title.length > 0,
        ),
      ),
    },
    {
      key: m.feature__description(),
      value: getCachedFeatureBoolean(appCtx, feature, 'hasDescription', current =>
        (
          Object.values(
            (current as FeatureFromCollection | Feature).i18n ?? {},
          ) as Array<Record<string, unknown>>
        ).some(
          translation =>
            !translation.descriptionGen &&
            typeof translation.description === 'string' &&
            translation.description.length > 0,
        ),
      ),
    },
    {
      key: m.feature__address(),
      value: getCachedFeatureBoolean(appCtx, feature, 'hasDisplayAddress', current =>
        (
          Object.values(
            (current as FeatureFromCollection | Feature).i18n ?? {},
          ) as Array<Record<string, unknown>>
        ).some(
          translation =>
            !translation.displayAddressGen &&
            typeof translation.displayAddress === 'string' &&
            translation.displayAddress.length > 0,
        ),
      ),
    },
  ]

  contentItems.forEach(({ key, value }) => {
    result[value ? `${m.filters__has()} ${key}` : `${m.filters__no()} ${key}`] = value
  })

  return result
}

export function calculateImageStatuses(
  appCtx: AppCtx,
  feature: Feature,
): Record<string, boolean | null> {
  return {
    [`${m.filters__has()} ${m.organisation__images()}`]: getCachedFeatureBoolean(
      appCtx,
      feature,
      'hasImage',
      current =>
        calculateImageCompletion(current as FeatureFromCollection | Feature).hasImage,
    ),
    [`${m.number__1()} ${m.published()}`]: getCachedFeatureTriState(
      appCtx,
      feature,
      'isOneImagePublished',
      current => calculateImageCompletion(current).isOneImagePublished,
    ),
    [`${m.filters__all()} ${m.published()}`]: getCachedFeatureTriState(
      appCtx,
      feature,
      'isAllImagePublished',
      current => calculateImageCompletion(current).isAllImagePublished,
    ),
  }
}

export function clearCachedFeatureTranslationStats(
  appCtx: AppCtx,
  featureId: string,
): void {
  const featureStats = appCtx.cache.stats.get(FirstClassResource.feature)
  if (!featureStats?.has(featureId)) return

  const stats = featureStats.get(featureId)
  if (!stats) return

  const keysToDelete: string[] = []
  for (const key of stats.keys()) {
    if (key.includes('Translated.')) keysToDelete.push(key)
  }
  keysToDelete.forEach(key => {
    stats.delete(key)
  })
}

function getTranslationTooltip(fieldName: string, status: boolean | null): string {
  if (status === true) return `${fieldName} ${m.tooltip__translated()}`
  if (status === false)
    return `${fieldName} ${m.filters__not()} ${m.tooltip__translated()}`
  return `${fieldName} ${m.filters__not()} ${m.awful_even_coyote_wish()}`
}

export function calculateTranslationStatuses(
  appCtx: AppCtx,
  feature: Feature,
  activeTranslationLocales: LocaleKey[],
  isSuperAdmin: boolean,
): Record<string, boolean | null> {
  const calculateMultiLocaleStatus = (
    fieldKey: 'title' | 'description' | 'displayAddress',
  ): boolean | null => {
    if (activeTranslationLocales.length === 0) return null

    const i18nEntries = feature.i18n ?? {}
    const genKey =
      fieldKey === 'title'
        ? 'titleGen'
        : fieldKey === 'description'
          ? 'descriptionGen'
          : 'displayAddressGen'

    const hasAnyManualContent = Object.values(i18nEntries).some(entry => {
      const fieldValue = entry[fieldKey]
      const isGenerated = entry[genKey] ?? false
      return Boolean(fieldValue && fieldValue.length > 0 && !isGenerated)
    })

    if (!hasAnyManualContent) return null

    return activeTranslationLocales.every(localeKey => {
      const entry = i18nEntries[localeKey]
      if (!entry) return false
      const fieldValue = entry[fieldKey]
      const isGenerated = entry[genKey] ?? false
      return Boolean(fieldValue && fieldValue.length > 0 && !isGenerated)
    })
  }

  const titleStatus = calculateMultiLocaleStatus('title')
  const descriptionStatus = calculateMultiLocaleStatus('description')
  const addressStatus = calculateMultiLocaleStatus('displayAddress')

  const result: Record<string, boolean | null> = {
    [getTranslationTooltip(m.feature__title(), titleStatus)]: titleStatus,
    [getTranslationTooltip(m.feature__description(), descriptionStatus)]:
      descriptionStatus,
    [getTranslationTooltip(m.feature__address(), addressStatus)]: addressStatus,
  }

  if (isSuperAdmin) {
    const propertyStatus = getCachedFeatureSpecifierTranslation(
      appCtx,
      feature,
      current => calculateSpecifierTranslation(current),
    )
    result[getTranslationTooltip(m.spicy_ideal_butterfly_revive(), propertyStatus)] =
      propertyStatus
  }

  return result
}

// ---
/********************
 *  5. PROPERTY-SCOPED HELPERS
 ************/
// +++ Property-Scoped Helpers

// Property presence calculators that match filter logic exactly
export function calculateClassifierPresence(
  feature: FeatureFromCollection,
  propertyId: string,
  appCtx?: AppCtx,
): boolean {
  const featureProp = feature.properties?.find(fp => fp.propertyId === propertyId)
  if (!featureProp) return false

  // Get property definition to check component type
  let property = null
  if (appCtx) {
    property = appCtx.cache.property.get(propertyId)
  }

  if (property && property.component === 'RangeField') {
    // RangeField classifier: check if value is not undefined, null, or empty string
    return (
      featureProp.value !== undefined &&
      featureProp.value !== null &&
      featureProp.value !== ''
    )
  } else {
    // SelectField classifier (default): check if there's a propertyValueId
    return !!featureProp.propertyValueId
  }
}

function getAvailableFeatureStatProperties(
  appCtx: AppCtx,
  layerId: Id,
  type: Property['type'],
): Property[] {
  if (!layerId) return []

  const layer = appCtx.cache.layer.get(layerId)
  if (!layer?.properties) return []

  return sortProperties(
    layer.properties
      .filter(layerProperty => {
        if (!layerProperty.propertyId) return false
        const property = appCtx.cache.property.get(layerProperty.propertyId)
        return (
          property &&
          property.type === type &&
          layerProperty.isVisible === true &&
          property.key !== 'grade'
        )
      })
      .map(layerProperty => {
        if (!layerProperty.propertyId) return { property: undefined }
        return {
          property: appCtx.cache.property.get(layerProperty.propertyId),
        }
      })
      .filter((item): item is { property: Property } => item.property !== undefined),
  ).map(item => item.property)
}

export function calculateCategoricalStatuses(
  feature: Feature,
  appCtx: AppCtx,
  localeKey: LocaleKey,
): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  const classifierProperties = getAvailableFeatureStatProperties(
    appCtx,
    feature.layerId,
    'classifier',
  )

  classifierProperties.forEach(property => {
    const featureProperty = feature.properties?.find(
      item => item.propertyId === property.id,
    )
    const propertyLabel = property.i18n?.[localeKey]?.label ?? property.key

    if (property.component === 'RangeField') {
      if (featureProperty?.value && featureProperty.value !== '') {
        result[`${propertyLabel} : ${featureProperty.value}`] = true
      } else {
        result[propertyLabel] = false
      }
      return
    }

    if (featureProperty?.propertyValueId) {
      const selectedValue = property.values?.find(
        value => value.id === featureProperty.propertyValueId,
      )
      if (selectedValue) {
        const valueLabel = selectedValue.i18n?.[localeKey]?.value ?? 'Unknown'
        result[`${propertyLabel} : ${valueLabel}`] = true
        return
      }
    }

    result[propertyLabel] = false
  })

  return result
}

export function calculateFreeformStatuses(
  feature: Feature,
  appCtx: AppCtx,
  localeKey: LocaleKey,
): Record<string, boolean> {
  const result: Record<string, boolean> = {}
  const specifierProperties = getAvailableFeatureStatProperties(
    appCtx,
    feature.layerId,
    'specifier',
  )

  specifierProperties.forEach(property => {
    const featureProperty = feature.properties?.find(
      item => item.propertyId === property.id,
    )
    const propertyLabel = property.i18n?.[localeKey]?.label ?? property.key

    let actualValue = ''
    let hasValue = false

    if (featureProperty?.value && featureProperty.value.length > 0) {
      actualValue = featureProperty.value
      hasValue = true
    } else if (featureProperty?.i18n) {
      const localeValue = featureProperty.i18n[localeKey]?.value
      if (localeValue && localeValue.length > 0) {
        actualValue = localeValue
        hasValue = true
      }
    }

    result[
      hasValue && actualValue ? `${propertyLabel} : ${actualValue}` : propertyLabel
    ] = hasValue
  })

  return result
}

export function calculateSpecifierPresence(
  feature: FeatureFromCollection,
  propertyId: string,
): boolean {
  const featureProp = feature.properties?.find(fp => fp.propertyId === propertyId)
  if (!featureProp) return false

  // Get the property definition to check if it's translatable
  // For now, assume we need to check both translatable and non-translatable cases

  // Check for i18n values (translatable specifier)
  if (featureProp.i18n && Object.keys(featureProp.i18n).length > 0) {
    const allLocaleValues = Object.values(featureProp.i18n).map(t => t.value)
    return allLocaleValues.some(v => v && v.length > 0)
  }

  // Check for single value (non-translatable specifier)
  return !!featureProp.value && featureProp.value.length > 0
}

// ---
/********************
 *  6. AGGREGATE STATISTICS
 ************/
// +++ Aggregate Statistics

export function calculateOverallStats(
  appCtx: AppCtx,
  entities: FeatureFromCollection[],
  adminCtx?: AdminStatsCtx, // Optional admin context for translation locale filtering
): {
  content: number
  translation: number
  image: number
  category: number
  freeform: number
} {
  const total = entities.length
  if (total === 0) {
    return {
      content: 0,
      translation: 0,
      image: 0,
      category: 0,
      freeform: 0,
    }
  }

  let contentScore = 0
  let translationScore = 0
  let translationTotal = 0 // Track how many features have translatable content
  let imageScore = 0
  let categoryScore = 0
  let freeformScore = 0

  const allProperties = appCtx.cache.property
  const classifiers = Array.from(allProperties.values()).filter(
    p => p.type === 'classifier',
  )
  const specifiers = Array.from(allProperties.values()).filter(
    p => p.type === 'specifier',
  )

  // Get active locales from admin context if available
  let activeLocales = supportedLocaleKeys // Default to all locales

  if (adminCtx?.appCtx?.state?.viewFilters?.feature?.translationLocales) {
    const translationLocales =
      adminCtx.appCtx.state.viewFilters.feature.translationLocales
    activeLocales = supportedLocaleKeys.filter(locale => translationLocales[locale])
    if (activeLocales.length === 0) {
      activeLocales = supportedLocaleKeys // Fallback if no locales selected
    }
  }

  // Translation fields to check (only title and description for progress)
  const translationFields: Array<{
    key: 'title' | 'description'
    genKey: 'titleGen' | 'descriptionGen'
  }> = [
    { key: 'title', genKey: 'titleGen' },
    { key: 'description', genKey: 'descriptionGen' },
  ]

  for (const feature of entities) {
    // Content
    const contentCompletion = calculateContentCompletion(appCtx, feature)
    contentScore +=
      (contentCompletion.title ? 1 : 0) + (contentCompletion.description ? 1 : 0)

    // Translation - TRI-STATE LOGIC: exclude null values from both numerator and denominator
    let featureTranslationCompleted = 0
    let featureTranslationTotal = 0

    for (const field of translationFields) {
      for (const locale of activeLocales) {
        // Calculate tri-state completion for this field+locale combination
        const triStateResult = calculateTranslationCompletionTriState(
          appCtx,
          feature,
          locale,
        )
        const fieldResult = triStateResult[field.key]

        if (fieldResult !== null) {
          // Only count non-null values in both numerator and denominator
          featureTranslationTotal += 1
          if (fieldResult === true) {
            featureTranslationCompleted += 1
          }
        }
        // If fieldResult is null, we exclude it from both counts (no source content to translate)
      }
    }

    // Add this feature's translation ratio to the total
    if (featureTranslationTotal > 0) {
      translationScore += featureTranslationCompleted / featureTranslationTotal
      translationTotal += 1 // This feature has translatable content
    }

    // Image - requires BOTH hasImage AND isOneImagePublished to be TRUE
    const imageCompletion = calculateImageCompletion(feature)
    if (imageCompletion.hasImage && imageCompletion.isOneImagePublished === true) {
      imageScore += 1
    }

    // Categories - count how many classifier properties have values
    if (classifiers.length > 0) {
      let filledClassifiers = 0
      for (const classifier of classifiers) {
        if (calculateClassifierPresence(feature, classifier.id, appCtx)) {
          filledClassifiers += 1
        }
      }
      categoryScore += filledClassifiers / classifiers.length
    }

    // Freeform - count how many specifier properties have values
    if (specifiers.length > 0) {
      let filledSpecifiers = 0
      for (const specifier of specifiers) {
        if (calculateSpecifierPresence(feature, specifier.id)) {
          filledSpecifiers += 1
        }
      }
      freeformScore += filledSpecifiers / specifiers.length
    }
  }

  return {
    content: (contentScore / (total * 2)) * 100, // 2 fields: title, desc
    translation: translationTotal > 0 ? (translationScore / translationTotal) * 100 : 0,
    image: (imageScore / total) * 100,
    category: (categoryScore / total) * 100,
    freeform: (freeformScore / total) * 100,
  }
}
