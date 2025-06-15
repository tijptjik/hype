// TYPES
import type { AppCtx } from '$lib/context/app.svelte';
import { FirstClassResource } from '$lib/enums';
import type { Property, FeatureProperty, PropertyValue, TranslatedValue, Locale, Id, RangeFilterValue } from '$lib/types';
// I18N
import { getLocale, getI18n } from '$lib/i18n';
import * as m from '$lib/paraglide/messages';

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
  b: T
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

  // If ranks are equal, sort alphabetically by key
  return a.property.key.localeCompare(b.property.key);
}

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
  const propertiesToSort = featureProperties
    .map((fp) => fp.property)
    .filter((p) => p !== undefined) as Property[];

  // Create a simple comparison function for Property arrays
  const compareProperties = (a: Property, b: Property): number => {
    // First sort by type: classifiers before specifiers
    const typeOrder = { classifier: 0, specifier: 1 };
    const typeA = typeOrder[a.type as keyof typeof typeOrder] ?? 2;
    const typeB = typeOrder[b.type as keyof typeof typeOrder] ?? 2;

    if (typeA !== typeB) {
      return typeA - typeB;
    }

    // Then sort by rank (lower rank comes first)
    const rankA = a.rank ?? Infinity;
    const rankB = b.rank ?? Infinity;

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    // If ranks are equal, sort alphabetically by key
    return a.key.localeCompare(b.key);
  };

  const sortedProperties = [...propertiesToSort].sort(compareProperties);

  // Map back to original feature properties in sorted order
  return sortedProperties
    .map((sortedProp) =>
      featureProperties.find((fp) => fp.property?.id === sortedProp?.id)
    )
    .filter((fp): fp is Omit<FeatureProperty, 'featureId'> => fp !== undefined);
}


export let getGroupedClassifierProperties = async (appCtx : AppCtx) : Promise<Array<{
  hierarchy: {
    organisation: string | null;
    project: string | null;
    layer: string | null;
    layerId: string;
  };
  properties: Property[];
}>> => {
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
  return results.filter(
    (group): group is NonNullable<typeof group> =>
      group !== null
  );
};

/**
 * Gets the translated display value based on the current locale.
 * Falls back to the original value if no translation is found.
 */
export function getPropValueInCurrentLocale(value: string | TranslatedValue | PropertyValue): string {
  if (typeof value === 'string') return value;
  
  const currentLocale = getLocale() as Locale;
  
  // Handle PropertyValue objects
  if ('id' in value && value.i18n) {
    const translation = value.i18n[currentLocale];
    return translation?.value || Object.values(value.i18n)[0]?.value || value.id;
  }
  
  // Handle TranslatedValue objects
  if ('value' in value) {
    // Fallback to original value for 'en' or if translations are missing
    if (!value.i18n) return value.value;
    // Add type annotation for 't'
    const translation = value.i18n.find(
      (t: { locale: string; value: string }) => t.locale === currentLocale
    );
    return translation?.value || value.value; // Fallback to original value
  }
  
  return '';
}

/**
 * Gets the PropertyValue ID for a given value string from property values.
 * This is used for tracking selected filters using PropertyValue IDs.
 */
export function getPropertyValueId(value: string | TranslatedValue, propertyValues: PropertyValue[]): string {
  const originalValue = typeof value === 'string' ? value : value.value;
  
  // Find PropertyValue by matching against i18n values
  const propertyValue = propertyValues.find((pv) => {
    if (!pv.i18n) return false;
    return Object.values(pv.i18n).some((translation) => 
      translation && translation.value === originalValue
    );
  });
  
  return propertyValue?.id || originalValue; // Fallback to original value if not found
}

/**
 * Toggles a categorical property filter value.
 */
export function toggleCategoricalPropertyValue(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
  value: string | TranslatedValue,
  propertyValues: PropertyValue[]
): void {
  const valueId = getPropertyValueId(value, propertyValues);
  const currentSelection = appCtx.propertyFilters?.[layerId]?.[propertyId] ?? [];
  const index = currentSelection.indexOf(valueId);
  let newSelection: string[];

  if (index === -1) {
    newSelection = [...currentSelection, valueId];
  } else {
    newSelection = currentSelection.filter((v: string) => v !== valueId);
  }

  // Update context using the dedicated methods
  if (newSelection.length > 0) {
    setCategoricalPropertyFilter(appCtx, layerId, propertyId, newSelection);
  } else {
    // If selection becomes empty, remove the key from the filter object for this layer
    removeCategoricalPropertyFilter(appCtx, layerId, propertyId);
  }

  appCtx.zoomToAllVisibleFeatures();
}

/**
 * Sets a categorical property filter.
 */
export function setCategoricalPropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyKey: string,
  values: string[]
): void {
  appCtx.state.filters.properties![layerId] = {
    ...(appCtx.state.filters.properties![layerId] || {}),
    [propertyKey]: values
  };
}

/**
 * Removes a categorical property filter.
 */
export function removeCategoricalPropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyKey: string
): void {
  delete appCtx.state.filters.properties![layerId]?.[propertyKey];
}

/**
 * Sets a range property filter.
 */
export function setRangePropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyKey: string,
  values: [number, number]
): void {
  // Only update if the values have actually changed to prevent unnecessary reactivity triggers
  if (
    appCtx.state.filters.properties![layerId]?.[propertyKey]?.rangeMin !== values[0] ||
    appCtx.state.filters.properties![layerId]?.[propertyKey]?.rangeMax !== values[1]
  ) {
    // Ensure the layer object exists
    if (!appCtx.state.filters.properties![layerId]) {
      appCtx.state.filters.properties![layerId] = {};
    }

    // Get the existing range filter or find the property definition to get global min/max
    const existingRangeFilter =
      appCtx.state.filters.properties![layerId]?.[propertyKey] || {};

    // If globalMin/globalMax are missing, find them from the property definition
    let globalMin = existingRangeFilter.globalMin;
    let globalMax = existingRangeFilter.globalMax;

    if (globalMin === undefined || globalMax === undefined) {
      // Find the property definition to get the global min/max
      const layer = appCtx.state.resources.layer.find((l) => l.id === layerId);
      if (layer) {
        const project = appCtx.state.resources.project.find(
          (p) => p.id === layer.projectId
        );
        if (project) {
          const property = project.properties?.find((p) => p.key === propertyKey);
          if (
            property &&
            typeof property.min === 'number' &&
            typeof property.max === 'number'
          ) {
            globalMin = property.min;
            globalMax = property.max;
          }
        }
      }
    }

    appCtx.state.filters.properties![layerId][propertyKey] = {
      globalMin,
      globalMax,
      rangeMin: values[0],
      rangeMax: values[1]
    };
  }
}

/**
 * Formats the display text for selected values of a *single* categorical filter property.
 * Displays selected property values in a user-friendly format.
 */
export function displaySelectedProperties(
  selectedValues: string[], // Array of selected display values (e.g., ["A", "B"])
  propertyDefinitionValues: string[] // Available display values from property definition
): string {
  if (!selectedValues || selectedValues.length === 0) {
    return m.filters__all();
  }

  if (selectedValues.length === 1) {
    return selectedValues[0];
  } else {
    // Format as "ValueA, ValueB & ValueC"
    return (
      selectedValues.slice(0, -1).join(', ') +
      ' & ' +
      selectedValues[selectedValues.length - 1]
    );
  }
}

/**
 * Summarizes the *active* property filters for a given layer.
 */
export function displaySelectedFilters(
  layerFilters: Record<string, string[] | RangeFilterValue> | undefined, // Filters for the specific layer
  properties: Property[] | undefined, // Property definitions for the layer's project
  appCtx: AppCtx
): string {
  if (!layerFilters || !properties || Object.keys(layerFilters).length === 0) {
    return m.filters__none();
  }

  // Create a map for efficient property lookup by ID
  const propertyMap = new Map(properties.map(p => [p.id, p]));
  
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
      isActive = (
        rangeValue.rangeMin !== rangeValue.globalMin ||
        rangeValue.rangeMax !== rangeValue.globalMax
      );
    }
    
    if (isActive) {
      // Look up property by ID (not key!)
      const property = propertyMap.get(propertyId);
      if (property) {
        const label = getI18n(property, 'label', appCtx.getUserPreferences()) || property.key;
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
    const formattedLabels = activeFilterLabels.map(label => 
      `<span class="text-sky-600 font-mono">${label}</span>`
    );
    const lastLabel = formattedLabels.pop();
    return m.filters__filtering_for({ 
      properties: `${formattedLabels.join(', ')} & ${lastLabel}` 
    });
  }
}
