// SVELTE
import { SvelteMap } from 'svelte/reactivity';
// ENUMS
import { FirstClassResource, supportedLocales } from '$lib/enums';
// TYPES
import type { Feature, Property, FeatureI18nDB, FeatureProperty } from '$lib/types';
import type { AppCtx } from '$lib/context/app.svelte';

// ═══════════════════════
// STATISTICS CACHE METHODS
// ═══════════════════════

export function getStatistic(
  appCtx: AppCtx,
  resourceType: FirstClassResource,
  id: string,
  statistic: string
): { value: any; type: string } | undefined {
  return appCtx.cache.stats.get(resourceType)?.get(id)?.get(statistic);
}

export function setStatistic(
  appCtx: AppCtx,
  resourceType: FirstClassResource,
  id: string,
  statistic: string,
  value: any,
  type: 'boolean' | 'count' | 'mean' | 'sum'
): void {
  let resourceStats = appCtx.cache.stats.get(resourceType);

  if (!resourceStats) {
    resourceStats = new SvelteMap();
    appCtx.cache.stats.set(resourceType, resourceStats);
  }
  
  let entityStats = resourceStats.get(id);
  if (!entityStats) {
    entityStats = new SvelteMap();
    resourceStats.set(id, entityStats);
  }
  
  entityStats.set(statistic, { value, type });
}

// Helper method to get cached boolean statistics for features (read-only)
export function getCachedFeatureBoolean(
  appCtx: AppCtx,
  feature: Feature,
  statistic: string,
  calculator: (feature: Feature) => boolean
): boolean {
  const cached = getStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    statistic
  );
  if (cached && cached.type === 'boolean') {
    return cached.value;
  }

  // Pure calculation without side effects
  return calculator(feature);
}

// Helper method to set cached boolean statistics for features (separate from reading)
export function setCachedFeatureBoolean(
  appCtx: AppCtx,
  feature: Feature,
  statistic: string,
  value: boolean
): void {
  setStatistic(
    appCtx,
    FirstClassResource.feature,
    feature.id,
    statistic,
    value,
    'boolean'
  );
}

// ═══════════════════════
// COMPLETION STATISTICS
// ═══════════════════════

export function calculateContentCompletion(
  appCtx: AppCtx,
  feature: Feature
): { title: boolean; description: boolean } {
  return {
    title: (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).some(
      (t: FeatureI18nDB) => !t.titleGen && t.title && t.title.length > 0
    ),
    description: (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).some(
      (t: FeatureI18nDB) =>
        !t.descriptionGen && t.description && t.description.length > 0
    )
  };
}

export function calculateTranslationCompletion(
  appCtx: AppCtx,
  feature: Feature
): { title: boolean; description: boolean; displayAddress: boolean } {
  return {
    title: (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).every(
      (t: FeatureI18nDB) => !t.titleGen && t.title && t.title.length > 0
    ),
    description:
      (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).every(
        (t: FeatureI18nDB) =>
          !t.descriptionGen && t.description && t.description.length > 0
      ) ||
      (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).every(
        (t: FeatureI18nDB) => !t.description || t.description.length === 0
      ),
    displayAddress:
      (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).every(
        (t: FeatureI18nDB) =>
          !t.displayAddressGen && t.displayAddress && t.displayAddress.length > 0
      ) ||
      (Object.values(feature?.i18n ?? {}) as FeatureI18nDB[]).every(
        (t: FeatureI18nDB) => !t.displayAddress || t.displayAddress.length === 0
      )
  };
}

export function calculateImageCompletion(
  appCtx: AppCtx,
  feature: Feature
): { canonical: boolean } {
  return {
    canonical: !!feature?.image
  };
}

export function calculateCategoryCompletion(
  appCtx: AppCtx,
  feature: Feature
): Array<{ name: string; present: boolean }> {
  const allProperties = appCtx.cache.property;
  const classifiers = Array.from(allProperties.values()).filter(
    (p) => p.type === 'classifier'
  );
  if (classifiers.length === 0) return [{ name: 'dummy', present: false }];
  return classifiers.map((prop: Property) => ({
    name: prop.i18n?.['en']?.label ?? prop.key, // Use fallback locale
    present: feature.properties.some((fp: FeatureProperty) => fp.propertyId === prop.id)
  }));
}

export function calculateSpecifierCompletion(
  appCtx: AppCtx,
  feature: Feature
): Array<{ name: string; present: boolean }> {
  const allProperties = appCtx.cache.property;
  const specifiers = Array.from(allProperties.values()).filter(
    (p) => p.type === 'specifier'
  );
  if (specifiers.length === 0) return [{ name: 'dummy', present: false }];
  return specifiers.map((prop: Property) => ({
    name: prop.i18n?.['en']?.label ?? prop.key, // Use fallback locale
    present: feature.properties.some((fp: FeatureProperty) => fp.propertyId === prop.id)
  }));
}

// ═══════════════════════
// AGGREGATE STATISTICS
// ═══════════════════════

export function calculateOverallStats(
  appCtx: AppCtx,
  entities: Feature[]
): {
  content: number;
  translation: number;
  image: number;
  category: number;
  freeform: number;
} {
  const total = entities.length;
  if (total === 0) {
    return {
      content: 0,
      translation: 0,
      image: 0,
      category: 0,
      freeform: 0
    };
  }

  let contentScore = 0;
  let translationScore = 0;
  let imageScore = 0;
  let categoryScore = 0;
  let freeformScore = 0;

  const allProperties = appCtx.cache.property;
  const classifiers = Array.from(allProperties.values()).filter(
    (p) => p.type === 'classifier'
  );
  const specifiers = Array.from(allProperties.values()).filter(
    (p) => p.type === 'specifier'
  );

  for (const feature of entities) {
    // Content
    const contentCompletion = calculateContentCompletion(appCtx, feature);
    contentScore +=
      (contentCompletion.title ? 1 : 0) + (contentCompletion.description ? 1 : 0);

    // Translation
    const i18n = feature?.i18n ?? {};
    let langCount = 0;
    supportedLocales.forEach((locale) => {
      if (i18n[locale]?.title) langCount++;
      if (i18n[locale]?.description) langCount++;
      if (i18n[locale]?.displayAddress) langCount++;
    });
    translationScore += langCount / (supportedLocales.length * 3);

    // Image
    if (feature.image) imageScore++;

    // Categories
    if (classifiers.length > 0) {
      const featureClassifiers = feature.properties.filter((fp: FeatureProperty) =>
        classifiers.some((c) => c.id === fp.propertyId)
      );
      categoryScore += featureClassifiers.length / classifiers.length;
    }

    // Freeform
    if (specifiers.length > 0) {
      const featureSpecifiers = feature.properties.filter((fp: FeatureProperty) =>
        specifiers.some((s) => s.id === fp.propertyId)
      );
      freeformScore += featureSpecifiers.length / specifiers.length;
    }
  }

  return {
    content: (contentScore / (total * 2)) * 100, // 2 fields: title, desc
    translation: (translationScore / total) * 100,
    image: (imageScore / total) * 100,
    category: (categoryScore / total) * 100,
    freeform: (freeformScore / total) * 100
  };
}
