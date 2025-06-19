//I18N
import { m } from '$lib/i18n';
// CONTEXT
import { AdminCtx } from '../../context/admin.svelte';
// TYPES
import type {
  FilterTriState,
  FeatureStatusFilterKey,
  FeatureAuthorshipFilterKey,
  FeatureImageFilterKey,
  FeatureTranslationFilterKey,
  FeatureViewFilters,
  Locale,
  Id
} from '$lib/types';

/* ------------------ */
// GETTERS
/* -------- */

function getFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  propertyId?: Id,
  activeLocales?: Set<Locale>
): FilterTriState {
  if (
    filterKey === 'isTitleTranslated' ||
    filterKey === 'isDescriptionTranslated' ||
    filterKey === 'isSpecifierTranslated' ||
    filterKey === 'isAddressTranslated'
  ) {
    if (!activeLocales) return null;
    return getTranslationFilterState(adminCtx, filterKey, activeLocales);
  } else if (filterKey === 'properties' && propertyId) {
    return getSimpleFilterState(adminCtx, 'properties', propertyId);
  } else {
    return getSimpleFilterState(adminCtx, filterKey) as FilterTriState;
  }
}
// Generic filter state helpers
export function getSimpleFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  propertyId?: Id
): FilterTriState | any {
  const featureFilters = adminCtx.state?.viewFilters?.feature;
  if (!featureFilters || typeof featureFilters !== 'object') return null;

  const sectionFilters = featureFilters[filterKey];
  if (sectionFilters === undefined || sectionFilters === null) return null;

  // For simple filters like isPublished
  if (!propertyId) {
    return sectionFilters as FilterTriState;
  }

  // For nested filters
  if (
    typeof sectionFilters === 'object' &&
    propertyId &&
    propertyId in sectionFilters
  ) {
    return (sectionFilters as any)[propertyId];
  }

  return null;
}

/* ------------------ */
// SETTERS
/* -------- */

export function setFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  newValue: FilterTriState,
  propertyId?: Id,
  activeLocales?: Set<Locale>
) {
  // Set the new state
  if (
    filterKey === 'isTitleTranslated' ||
    filterKey === 'isDescriptionTranslated' ||
    filterKey === 'isSpecifierTranslated' ||
    filterKey === 'isAddressTranslated'
  ) {
    if (!activeLocales) return;
    setTranslationFilterState(adminCtx, filterKey, activeLocales, newValue);
  } else if (filterKey === 'properties' && propertyId) {
    setPropertyFilterState(adminCtx, propertyId, newValue);
  } else {
    setSimpleFilterState(adminCtx, filterKey, newValue);
  }
}

export function setSimpleFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  value: FilterTriState,
  propertyId?: Id
) {
  const featureFilters = adminCtx.state?.viewFilters?.feature;
  if (!featureFilters || typeof featureFilters !== 'object') return;

  if (!propertyId) {
    // Simple filter
    (featureFilters as any)[filterKey] = value;
  } else {
    // Nested filter
    const sectionFilters = featureFilters[filterKey];
    if (sectionFilters && typeof sectionFilters === 'object') {
      (sectionFilters as any)[propertyId] = value;
    }
  }
}

/* ------------------ */
// SETTERS :: TOGGLERS
/* -------- */

export function toggleFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  value: FilterTriState,
  propertyId?: Id,
  activeLocales?: Set<Locale>
) {
  // GET
  let currentState = getFilterState(adminCtx, filterKey, propertyId, activeLocales);
  // DETERMINE
  const newValue = value === currentState ? null : value;
  // SET
  setFilterState(adminCtx, filterKey, newValue, propertyId, activeLocales);
}

/* ------------------ */
// IMAGES
/* -------- */

export function getImageFilterState(
  adminCtx: AdminCtx,
  filterKey: FeatureImageFilterKey
): FilterTriState {
  return getSimpleFilterState(adminCtx, filterKey) as FilterTriState;
}

export function setImageFilterState(
  adminCtx: AdminCtx,
  filterKey: FeatureImageFilterKey,
  value: FilterTriState
) {
  setSimpleFilterState(adminCtx, filterKey, value);
}

/* ------------------ */
// AUTHORSHIP
/* -------- */

export function getAuthorshipFilterState(
  adminCtx: AdminCtx,
  filterKey: FeatureAuthorshipFilterKey
): FilterTriState {
  return getSimpleFilterState(adminCtx, filterKey) as FilterTriState;
}

export function setAuthorshipFilterState(
  adminCtx: AdminCtx,
  filterKey: FeatureAuthorshipFilterKey,
  value: FilterTriState
) {
  setSimpleFilterState(adminCtx, filterKey, value);
}

/* ------------------ */
// TRANSLATION
/* -------- */

export function getTranslationFilterState<K extends FeatureTranslationFilterKey>(
  adminCtx: AdminCtx,
  filterKey: K,
  activeLocales: Set<Locale>
): FilterTriState {
  const sectionFilters = getSimpleFilterState(adminCtx, filterKey);
  if (!sectionFilters || typeof sectionFilters !== 'object') {
    return null;
  }

  // Check values for active locales only
  const activeValues: FilterTriState[] = [];
  for (const locale of activeLocales) {
    if (locale in sectionFilters) {
      activeValues.push((sectionFilters as any)[locale]);
    } else {
      activeValues.push(null);
    }
  }

  // If no active locales or all null, return null
  if (activeValues.length === 0 || activeValues.every((v) => v === null)) {
    return null;
  }

  // Check if all active values are the same
  const firstNonNull = activeValues.find((v) => v !== null);
  if (firstNonNull !== undefined) {
    const allSame = activeValues.every((v) => v === null || v === firstNonNull);
    if (allSame) {
      return firstNonNull;
    }
  }

  // If they're not all the same, set them all to true and return true
  for (const locale of activeLocales) {
    (sectionFilters as any)[locale] = true;
  }
  return true;
}

export function setTranslationFilterState<K extends FeatureTranslationFilterKey>(
  adminCtx: AdminCtx,
  filterKey: K,
  activeLocales: Set<Locale>,
  value: FilterTriState
) {
  const featureFilters = adminCtx.state?.viewFilters?.feature;
  if (!featureFilters || typeof featureFilters !== 'object') return;

  let sectionFilters = featureFilters[filterKey];
  if (!sectionFilters || typeof sectionFilters !== 'object') {
    // Initialize if doesn't exist
    sectionFilters = {
      en: null,
      'zh-hant': null,
      'zh-hans': null
    };
    (featureFilters as any)[filterKey] = sectionFilters;
  }

  // Set all locales: inactive ones to null, active ones to the provided value
  const allLocales: Locale[] = ['en', 'zh-hant', 'zh-hans'];
  for (const locale of allLocales) {
    if (activeLocales.has(locale)) {
      (sectionFilters as any)[locale] = value;
    } else {
      (sectionFilters as any)[locale] = null;
    }
  }
}

/* ------------------ */
// PROPERTIES
/* -------- */

export function setPropertyFilterState(
  adminCtx: AdminCtx,
  propertyId: string,
  value: FilterTriState
) {
  setSimpleFilterState(adminCtx, 'properties', value, propertyId);
}

/* ------------------ */
// LABELS
/* -------- */

export function getFeatureTaskLabel(
  filterDef: any,
  targetState: boolean,
  isTranslation: boolean = false
): string {
  if (isTranslation) {
    return !targetState ? 'ToDo' : 'Done';
  }

  if (!targetState) {
    return (
      filterDef.falseLabel ||
      (filterDef.invertBoolean ? m.filters__only() : m.filters__not())
    );
  } else {
    return (
      filterDef.trueLabel ||
      (filterDef.invertBoolean ? m.filters__not() : m.filters__only())
    );
  }
}
