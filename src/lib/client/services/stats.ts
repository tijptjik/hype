// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// ENUMS
import { FirstClassResource, supportedLocales } from '$lib/enums'
// TYPES
import type {
  Feature,
  Property,
  FeatureI18nDB,
  FeatureProperty,
  FeatureFromCollection,
  UserContributedFeature,
} from '$lib/types'
import type { AppCtx } from '$lib/context/app.svelte'

// ═══════════════════════
// STATISTICS CACHE METHODS
// ═══════════════════════

export function getStatistic(
  appCtx: AppCtx,
  resourceType: FirstClassResource,
  id: string,
  statistic: string,
): { value: any; type: string } | undefined {
  return appCtx.cache.stats.get(resourceType)?.get(id)?.get(statistic)
}

export function setStatistic(
  appCtx: AppCtx,
  resourceType: FirstClassResource,
  id: string,
  statistic: string,
  value: any,
  type: 'boolean' | 'count' | 'mean' | 'sum',
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

// Helper method to get cached boolean statistics for features (read-only)
export function getCachedFeatureBoolean(
  appCtx: AppCtx,
  feature: FeatureFromCollection | Feature | UserContributedFeature,
  statistic: string,
  calculator: (
    feature: FeatureFromCollection | Feature | UserContributedFeature,
  ) => boolean,
): boolean {
  const cached = getStatistic(appCtx, FirstClassResource.feature, feature.id, statistic)
  if (cached && cached.type === 'boolean') {
    return cached.value
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
  feature: FeatureFromCollection,
  statistic: string,
  calculator: (feature: FeatureFromCollection) => boolean | null,
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
  locale: string,
  calculator: (feature: FeatureFromCollection, locale: string) => boolean | null,
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
  locale: string,
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

// Pre-populate stats cache for a feature (called during feature refresh)
export function primeFeatureStatsCache(
  appCtx: AppCtx,
  feature: FeatureFromCollection,
): void {
  // Clear existing cache for this feature to ensure fresh calculation with correct image logic
  const resourceStats = appCtx.cache.stats.get(FirstClassResource.feature)
  if (resourceStats && resourceStats.has(feature.id)) {
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
  supportedLocales.forEach(locale => {
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

// ═══════════════════════
// COMPLETION STATISTICS
// ═══════════════════════

export function calculateContentCompletion(
  appCtx: AppCtx,
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
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  locale?: string,
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
  appCtx: AppCtx,
  feature: FeatureFromCollection,
  locale: string,
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
    const hasManualContent = allEntries.some((entry: any) => {
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

export function calculateImageCompletion(feature: FeatureFromCollection): {
  hasImage: boolean
  isOneImagePublished: boolean | null
  isAllImagePublished: boolean | null
} {
  // Check if feature has the new count fields (from collection API)
  const imageCount = (feature as any).imageCount as number
  const imagePublishedCount = (feature as any).imagePublishedCount as number

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

// ═══════════════════════
// AGGREGATE STATISTICS
// ═══════════════════════

export function calculateOverallStats(
  appCtx: AppCtx,
  entities: FeatureFromCollection[],
  adminCtx?: any, // Optional admin context for translation locale filtering
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
  let activeLocales = supportedLocales // Default to all locales

  if (adminCtx?.appCtx?.state?.viewFilters?.feature?.translationLocales) {
    const translationLocales =
      adminCtx.appCtx.state.viewFilters.feature.translationLocales
    activeLocales = supportedLocales.filter(locale => translationLocales[locale])
    if (activeLocales.length === 0) {
      activeLocales = supportedLocales // Fallback if no locales selected
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
    const i18n = feature?.i18n ?? {}
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
