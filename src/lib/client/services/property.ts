// TYPES
import type { AppCtx } from '$lib/context/app.svelte';
import { FirstClassResource } from '$lib/enums';
import type {
  Property,
  FeatureProperty,
  PropertyValue,
  Locale,
  Id,
  RangeFilterValue,
  UserPreferences
} from '$lib/types';
// I18N
import { getLocale, getI18n } from '$lib/i18n';
import * as m from '$lib/paraglide/messages';

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SORTING
//    - sortProperties
//    - sortPropertiesByTypeAndRank
//    - sortFeatureProperties
//
// 2. GROUPING
//    - getGroupedClassifierProperties
//
// 3. MUTATIONS
//    - toggleCategoricalPropertyValue
//    - setCategoricalPropertyFilter
//    - resetCategoricalPropertyFilter
//    - setRangePropertyFilter
//
// 4. DISPLAY
//    - displaySelectedProperties
//    - displaySelectedFilters
//    - displayRangeFilter

// ═══════════════════════
// 1. SORTING
// ═══════════════════════

/**
 * Sorts an array of properties by type and rank.
 *
 * @param properties - Array of properties to sort
 * @returns Sorted array of properties
 */
export function sortProperties<T extends { property?: Property }>(
  properties: T[]
): T[] {
  return [...properties].sort(sortPropertiesByTypeAndRank);
}

/**
 * Sorts an array of feature properties by the type and rank of their property.
 *
 * @param featureProperties - Array of feature properties to sort
 * @returns Sorted array of feature properties
 */
export function sortFeatureProperties(
  featureProperties: Omit<FeatureProperty, 'featureId'>[]
): Omit<FeatureProperty, 'featureId'>[] {
  // Sort the feature properties directly using the property field
  const sortedFeatureProperties = [...featureProperties].sort((a, b) =>
    sortPropertiesByTypeAndRank(a, b, (a, b) => {
      // Fallback sort by key if properties exist
      if (!a.property || !b.property) return 0;
      return a.property.key.localeCompare(b.property.key);
    })
  );

  return sortedFeatureProperties;
}

/**
 * Sorts properties by type (classifiers first, then specifiers) and then by rank.
 * Lower rank values have higher priority.
 *
 * @param a - First property to compare
 * @param b - Second property to compare
 * @returns Sort comparison result
 */
export function sortPropertiesByTypeAndRank<T extends { property?: Property }>(
  a: T,
  b: T,
  fallbackSort?: (a: T, b: T) => number
): number {
  // Check if both properties exist
  if (!a.property || !b.property) return 0;

  // First sort by type: classifiers before specifiers
  const typeOrder = { classifier: 0, specifier: 1 };
  const typeA = typeOrder[a.property.type as keyof typeof typeOrder] ?? 2;
  const typeB = typeOrder[b.property.type as keyof typeof typeOrder] ?? 2;

  if (typeA !== typeB) {
    return typeA - typeB;
  }

  // Then sort by rank (lower rank comes first)
  const rankA = a.property.rank ?? Infinity;
  const rankB = b.property.rank ?? Infinity;

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  // If ranks are equal, use fallback sort or default to alphabetical by key
  if (fallbackSort) {
    return fallbackSort(a, b);
  }
  return a.property.key.localeCompare(b.property.key);
}

// ═══════════════════════
// 2. GROUPING
// ═══════════════════════

/**
 * Groups classifier properties per layer, and adds hierarchy information.
 *
 * @param appCtx - The application context
 * @returns Array of grouped classifier properties
 */
export let getGroupedClassifierProperties = async (
  appCtx: AppCtx
): Promise<
  Array<{
    hierarchy: {
      organisation: string | null;
      project: string | null;
      layer: string | null;
      layerId: string;
    };
    properties: Property[];
  }>
> => {
  const results = await Promise.all(
    appCtx.getPrism(FirstClassResource.layer).map(async (layerId) => {
      // Get layer
      const layer = await appCtx.getLayerById(layerId);
      if (!layer) return null;
      // Get project and organisation for this layer
      const { project, organisation } = await appCtx.getHierarchy(layer);
      if (!project || !organisation) return null;

      // Get sorted classifier properties from layerProperties
      const properties = await appCtx.getClassifierPropertiesForLayer(layer);
      if (properties.length === 0) return null;

      // Construct hierarchy info
      const hierarchy = {
        organisation: appCtx.getContextualOrganisationName(organisation),
        project: appCtx.getContextualProjectName(project),
        layer: appCtx.getContextualLayerName(layer),
        layerId: layer.id // Pass layerId for direct filter access
      };

      return {
        hierarchy,
        properties
      };
    })
  );

  // Filter out nulls and empty groups
  return results.filter((group): group is NonNullable<typeof group> => group !== null);
};

// ═══════════════════════
// 3. MUTATIONS
// ═══════════════════════

/**
 * Toggles a categorical property filter value.
 */
export function toggleCategoricalPropertyValue(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
  propertyValueId: Id
): void {
  const currentSelection = appCtx.propertyFilters?.[layerId]?.[propertyId] ?? [];
  const index = currentSelection.indexOf(propertyValueId);
  let newSelection: string[];

  if (index === -1) {
    newSelection = [...currentSelection, propertyValueId];
  } else {
    newSelection = currentSelection.filter((v: string) => v !== propertyValueId);
  }

  // Update context using the dedicated methods
  if (newSelection.length > 0) {
    setCategoricalPropertyFilter(appCtx, layerId, propertyId, newSelection);
  } else {
    // If selection becomes empty, remove the key from the filter object for this layer
    resetCategoricalPropertyFilter(appCtx, layerId, propertyId);
  }
}

/**
 * Sets a categorical property filter.
 */
export function setCategoricalPropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
  values: string[]
): void {
  appCtx.state.filters.properties![layerId] = {
    ...(appCtx.state.filters.properties![layerId] || {}),
    [propertyId]: values
  };
  appCtx.zoomToAllVisibleFeatures();
}

/**
 * Removes a categorical property filter.
 */
export function resetCategoricalPropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id
): void {
  delete appCtx.state.filters.properties![layerId]?.[propertyId];
  appCtx.zoomToAllVisibleFeatures();
}

/**
 * Sets a range property filter.
 */
export function setRangePropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
  values: [number, number]
): void {
  // Only update if the values have actually changed to prevent unnecessary reactivity triggers
  if (
    appCtx.state.filters.properties![layerId]?.[propertyId]?.rangeMin !== values[0] ||
    appCtx.state.filters.properties![layerId]?.[propertyId]?.rangeMax !== values[1]
  ) {
    // Ensure the layer object exists
    if (!appCtx.state.filters.properties![layerId]) {
      appCtx.state.filters.properties![layerId] = {};
    }

    // Get the existing range filter or find the property definition to get global min/max
    const existingRangeFilter =
      appCtx.state.filters.properties![layerId]?.[propertyId] || {};

    // If globalMin/globalMax are missing, find them from the property definition
    let globalMin = existingRangeFilter.globalMin;
    let globalMax = existingRangeFilter.globalMax;

    if (globalMin === undefined || globalMax === undefined) {
      // Find the property definition to get the global min/max
      const property = appCtx.cache.property.get(propertyId);
      if (property) {
        globalMin = property.min;
        globalMax = property.max;
      }
    }

    appCtx.state.filters.properties![layerId][propertyId] = {
      globalMin,
      globalMax,
      rangeMin: values[0],
      rangeMax: values[1]
    };
    appCtx.zoomToAllVisibleFeatures();
  }
}

// ═══════════════════════
// 4. DISPLAY
// ═══════════════════════

export function propertyValuesToLocalisedOptions(
  appCtx: AppCtx,
  propertyValues: PropertyValue[]
): Map<Id, string> {
  return new Map(
    propertyValues.map((pv) => [
      pv.id,
      getI18n(pv, 'value', appCtx.getUserPreferences(), m.suave_watery_mole_gulp())
    ])
  );
}

/**
 * Formats the display text for selected values of a *single* categorical filter property.
 * Displays selected property values in a user-friendly format.
 */
export function displaySelectedProperties(
  selectedPropertyValueIds: Id[], // Array of selected display values (e.g., ["A", "B"])
  localisedOptions: Map<Id, string> // Available display values from property definition
): string {
  if (!selectedPropertyValueIds || selectedPropertyValueIds.length === 0) {
    return m.filters__all();
  }

  if (selectedPropertyValueIds.length === 1) {
    return localisedOptions.get(selectedPropertyValueIds[0]) || '?';
  } else {
    // Format as "ValueA, ValueB & ValueC"
    const translatedValues = selectedPropertyValueIds.map(
      (id) => localisedOptions.get(id) || '?'
    );
    return (
      translatedValues.slice(0, -1).join(', ') +
      ' & ' +
      translatedValues[translatedValues.length - 1]
    );
  }
}

/**
 * Summarizes the *active* property filters for a given layer.
 */
export function displaySelectedFilters(
  appCtx: AppCtx,
  layerFilters: Record<Id, string[] | RangeFilterValue> | undefined, // Filters for the specific layer
  properties: Property[] | undefined // Property definitions for the layer's project
): string {
  if (!layerFilters || !properties || Object.keys(layerFilters).length === 0) {
    return m.filters__none();
  }

  // Create a map for efficient property lookup by ID
  const propertyMap = new Map(properties.map((p) => [p.id, p]));

  // Get active filter property IDs and their labels
  const activeFilterLabels: string[] = [];

  for (const [propertyId, value] of Object.entries(layerFilters)) {
    let isActive = false;

    // Check if filter is active
    if (Array.isArray(value)) {
      // Categorical: active if array is not empty
      isActive = value.length > 0;
    } else if (
      typeof value === 'object' &&
      value !== null &&
      'rangeMin' in value &&
      'globalMin' in value
    ) {
      // Range: active if range differs from global min/max
      const rangeValue = value as RangeFilterValue;
      isActive =
        rangeValue.rangeMin !== rangeValue.globalMin ||
        rangeValue.rangeMax !== rangeValue.globalMax;
    }

    if (isActive) {
      // Look up property by ID (not key!)
      const property = propertyMap.get(propertyId);
      if (property) {
        const label =
          getI18n(property, 'label', appCtx.getUserPreferences()) || property.key;
        activeFilterLabels.push(label);
      } else {
        // Fallback if property not found
        activeFilterLabels.push(propertyId);
      }
    }
  }

  if (activeFilterLabels.length === 0) {
    return m.filters__none();
  }

  // Format the summary string based on the count
  if (activeFilterLabels.length === 1) {
    return m.filters__filtering_for({
      properties: `<span class="text-sky-600 font-mono">${activeFilterLabels[0]}</span>`
    });
  } else {
    // Format as "LabelA, LabelB & LabelC" for more than one
    const formattedLabels = activeFilterLabels.map(
      (label) => `<span class="text-sky-600 font-mono">${label}</span>`
    );
    const lastLabel = formattedLabels.pop();
    return m.filters__filtering_for({
      properties: `${formattedLabels.join(', ')} & ${lastLabel}`
    });
  }
}

export function displayRangeFilter(
  min: number,
  max: number,
  values: [number, number]
): string {
  if (min === values[0] && max === values[1]) {
    return m.filters__all();
  } else if (values[0] === values[1]) {
    return `${m.filters__only()} ${values[0]} ${m.filters__stars()}`;
  } else {
    return `${m.filters__between()} ${values[0]} ${m.filters__and()} ${values[1]} ${m.filters__stars()}`;
  }
}
