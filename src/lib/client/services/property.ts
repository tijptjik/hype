// I18N
import { m } from '$lib/i18n';
import { getI18n } from '$lib/i18n';
// ENUMS
import { FirstClassResource } from '$lib/enums';
// TYPES
import type { AppCtx } from '$lib/context/app.svelte';
import type {
  Property,
  FeatureProperty,
  PropertyValue,
  Feature,
  Locale,
  LocaleExtended,
  Id,
  RangeFilterValue,
  FeaturePropertyI18nDB,
  Layer,
  FeatureFromCollection
} from '$lib/types';

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
//
// 5. FILTERING
//    - getFeatureIdsForProperties
//
// 6.1 FEATURE PROPERTY
//   :: GETTERS
//    - getFeatureCardDisplayProperties
//    - getFeatureCardEditableProperties
//    - getUserContributableProperties
//    - getLocalisedPropertyValues
//    - getFeatureProperty
//    - getUniversalSpecifierValue
//    - getI18nSpecifierValue
//    - getClassifierValueId
//
// 6.2 FEATURE PROPERTY
//   :: SETTERS
//    - updateFeatureProperty
//    - updateFeatureI18nProperty
//    - updateNewFeatureProperty
//    - updateNewFeatureI18nProperty
//    - handleCategoricalChange
//    - handleSpecifierChange

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
  const currentSelection =
    appCtx.state.filters.feature.properties?.[layerId]?.[propertyId] ?? [];
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
  appCtx.state.filters.feature.properties![layerId] = {
    ...(appCtx.state.filters.feature.properties![layerId] || {}),
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
  delete appCtx.state.filters.feature.properties![layerId]?.[propertyId];
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
    appCtx.state.filters.feature.properties![layerId]?.[propertyId]?.rangeMin !==
      Math.min(...values) ||
    appCtx.state.filters.feature.properties![layerId]?.[propertyId]?.rangeMax !==
      Math.max(...values)
  ) {
    // Ensure the layer object exists
    if (!appCtx.state.filters.feature.properties![layerId]) {
      appCtx.state.filters.feature.properties![layerId] = {};
    }

    // Get the existing range filter or find the property definition to get global min/max
    const existingRangeFilter =
      appCtx.state.filters.feature.properties![layerId]?.[propertyId] || {};

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

    appCtx.state.filters.feature.properties![layerId][propertyId] = {
      globalMin,
      globalMax,
      rangeMin: Math.min(...values),
      rangeMax: Math.max(...values)
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
      getI18n(
        pv as Record<'i18n', any>,
        'value',
        appCtx.getUserPreferences(),
        m.jumpy_misty_panther_scold()
      )
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
    return `${m.filters__only()} ${values[0]} ${m.menu_stars()}`;
  } else {
    return m.filters__between({
      min: values[0],
      max: values[1]
    });
  }
}

// ═══════════════════════
// 5. FILTERING
// ═══════════════════════

/**
 * Gets feature IDs filtered by property filters.
 * Returns all features if no property filters are active.
 */
export function getFeatureIdsForProperties(appCtx: AppCtx): Id[] {
  // If there are no property filters at all, return all features
  if (Object.keys(appCtx.state.filters.feature.properties ?? {}).length === 0) {
    return Array.from(appCtx.features.keys());
  }

  const featureList = Array.from(appCtx.features.values());

  const filteredIds = featureList
    .filter((feature: Feature | FeatureFromCollection) => {
      // Get filters specific to this feature's layer
      const layerFilters = appCtx.state.filters.feature.properties?.[feature.layerId];

      // If no filters for this layer, feature passes
      if (!layerFilters || Object.keys(layerFilters).length === 0) {
        return true;
      }

      // Check if feature matches ALL filters for its layer
      return Object.entries(layerFilters).every(([propertyId, filterValue]) => {
        // Empty categorical filter matches all
        if (Array.isArray(filterValue) && filterValue.length === 0) {
          return true;
        }

        // Find the feature's property by property ID
        const featureProperty = feature.properties.find(
          (fp: FeatureProperty) => fp.propertyId === propertyId
        );

        if (!featureProperty) {
          return false; // Feature doesn't have this property
        }

        // Get the property definition to check type and component
        const property = appCtx.cache.property.get(propertyId);
        if (!property) {
          console.error(`Property definition not found for propertyId: ${propertyId}`);
          return true; // Property definition not found, so we keep showing it
        }

        // Handle different property types and components
        if (property.type === 'classifier' && property.component === 'SelectField') {
          // Categorical filter: check if feature's PropertyValue ID is in selected IDs
          if (Array.isArray(filterValue)) {
            return featureProperty.propertyValueId
              ? filterValue.includes(featureProperty.propertyValueId)
              : false;
          }
          return false;
        } else if (
          property.type === 'classifier' &&
          property.component === 'RangeField'
        ) {
          // If the range filter is set in the globalMin/Max range we should not fail any features
          if (
            filterValue.rangeMin === filterValue.globalMin &&
            filterValue.rangeMax === filterValue.globalMax
          ) {
            return true;
          }

          // Range filter: check if numeric value is within range
          if (
            typeof filterValue === 'object' &&
            filterValue !== null &&
            'rangeMin' in filterValue &&
            'rangeMax' in filterValue
          ) {
            // If no value available, consider it as not matching the filter
            if (!featureProperty.value) {
              return false;
            }

            const numericValue = Number(featureProperty.value);
            return (
              !isNaN(numericValue) &&
              numericValue >= filterValue.rangeMin &&
              numericValue <= filterValue.rangeMax
            );
          }
          return false;
        }

        // For other property types/components, return true for now
        return true;
      });
    })
    .map((feature) => feature.id);

  return filteredIds;
}

// ═══════════════════════
// 6. FEATURE PROPERTY :: GETTERS
// ═══════════════════════

/**
 * Gets properties for a display FeatureCard.
 *
 * @param appCtx - The application context.
 * @param layerId - The ID of the layer to get the properties for.
 * @param feature - The feature to get the properties for.
 * @returns The properties for the feature.
 */
export function getFeatureCardDisplayProperties(
  appCtx: AppCtx,
  layerId: Id,
  feature: Feature
): Omit<FeatureProperty, 'featureId'>[] {
  if (!layerId) {
    return [];
  }
  // ASSERT : Layer exists
  const layer = appCtx.state.resources.layer.find((l) => l.id === layerId);
  if (!layer) {
    console.warn(`Layer ${layerId} not found`);
    return [];
  }

  // Get all visible properties for the layer (not just user contributable ones)
  const layerProperties =
    layer.properties
      ?.filter((layerProp) => {
        const property = appCtx.cache.property.get(layerProp.propertyId);
        return (
          property &&
          (property.type === 'classifier' || property.type === 'specifier') &&
          layerProp.isVisible === true &&
          property.key !== 'grade'
        );
      })
      .map((layerProp) => {
        const property = appCtx.cache.property.get(layerProp.propertyId);
        return {
          property,
          propertyId: layerProp.propertyId
        };
      })
      .filter(
        (item): item is { property: Property; propertyId: Id } =>
          item.property !== undefined
      ) || [];

  // Map layer properties to feature properties, including the property definition
  return sortFeatureProperties(
    layerProperties
      .map((item) => {
        const featureProperty = feature.properties.find(
          (prop) => prop.propertyId === item.propertyId
        );
        if (featureProperty) {
          return {
            ...featureProperty,
            property: item.property
          };
        }
        return null;
      })
      .filter((item): item is FeatureProperty & { property: Property } => item !== null)
  );
}

/**
 * Gets properties for an editable FeatureCard.
 *
 * @remark While properties are defined at the project level, at the
 * layer level (layerProperty) we define where they
 * are to be included for that particular layer (isVisible) and whether
 * they are editable by the public - i.e. whether they can be set as part
 * of a newFeature flow.
 */
export function getFeatureCardEditableProperties(
  appCtx: AppCtx,
  layerId: Id
): Omit<FeatureProperty, 'featureId'>[] {
  if (!layerId) {
    return [];
  }
  // ASSERT : Layer exists
  const layer = appCtx.cache.layer.get(layerId);
  if (!layer) {
    console.warn(`Layer ${layerId} not found`);
    return [];
  }

  // Get categorical and specifier properties that are user contributable
  const layerProperties =
    layer.properties
      ?.filter((layerProp) => {
        const property = appCtx.cache.property.get(layerProp.propertyId);
        return (
          property &&
          (property.type === 'classifier' || property.type === 'specifier') &&
          layerProp.isVisible === true &&
          layerProp.isUserContributed === true &&
          property.key !== 'grade'
        );
      })
      .map((layerProp) => {
        const property = appCtx.cache.property.get(layerProp.propertyId);
        return {
          property,
          propertyId: layerProp.propertyId
        };
      })
      .filter(
        (item): item is { property: Property; propertyId: Id } =>
          item.property !== undefined
      ) || [];

  return sortFeatureProperties(layerProperties);
}

/**
 * Gets property values for a categorical property from the cache.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns A map of property value IDs to their localised values.
 */
export function getLocalisedPropertyValues(
  appCtx: AppCtx,
  propertyId: Id
): Map<Id, string> {
  const property = appCtx.cache.property.get(propertyId);
  if (!property?.values) return new Map<Id, string>();
  return propertyValuesToLocalisedOptions(appCtx, property.values);
}

/**
 * Gets a feature property by property ID from the new feature context.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @param featureId - Optional feature ID to get the property for.
 * If not provided, the property will be searched for in the new feature context.
 */
export function getFeatureProperty(
  appCtx: AppCtx,
  propertyId: Id,
  featureId?: Id | null
): FeatureProperty | null {
  if (!featureId) {
    // ASSERT : newFeature exists
    if (!appCtx.newFeature?.feature?.properties) return null;
    return appCtx.newFeature.feature.properties.find(
      (p) => p && p.propertyId === propertyId
    ) as FeatureProperty | null;
  } else {
    return appCtx.features
      .get(featureId)
      ?.properties.find(
        (p) => p && p.propertyId === propertyId
      ) as FeatureProperty | null;
  }
}

/**
 * Gets the universal specifier value for a property.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns The universal specifier value for the property.
 */
export function getUniversalSpecifierValue(
  appCtx: AppCtx,
  propertyId: Id
): string | undefined | null {
  const featureProperty = getFeatureProperty(appCtx, propertyId);
  if (!featureProperty) return null;
  return featureProperty.value;
}

/**
 * Gets the i18n specifier value for a property in the current locale.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns The i18n specifier value for the property.
 */
export function getI18nSpecifierValue(
  appCtx: AppCtx,
  propertyId: Id
): string | undefined {
  const featureProperty = getFeatureProperty(appCtx, propertyId);
  if (!featureProperty) return undefined;
  const result = getI18n(featureProperty as any, 'value', appCtx.getUserPreferences());
  return result ?? undefined;
}

/**
 * Gets the classifier value ID for a property.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns The classifier value ID for the property.
 */
export function getClassifierValueId(
  appCtx: AppCtx,
  propertyId: Id
): string | undefined {
  const featureProperty = getFeatureProperty(appCtx, propertyId);
  const valueId = featureProperty?.propertyValueId;
  return valueId && valueId !== null ? valueId : undefined;
}

// ═══════════════════════
// 6. FEATURE PROPERTY :: SETTERS
// ═══════════════════════

/**
 * Updates a feature property in the new feature context.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param updates - The updates to apply to the property.
 */
export function updateFeatureProperty(
  appCtx: AppCtx,
  propertyId: Id,
  updates: Partial<FeatureProperty>
): void {
  const existingProperty = getFeatureProperty(appCtx, propertyId);

  if (existingProperty) {
    // Update existing property
    Object.assign(existingProperty, updates);
  } else {
    // Create new property
    updateNewFeatureProperty(appCtx, propertyId, updates);
  }
}

/**
 * Updates a feature property's i18n value.
 *
 * @remark This function is used to provide a way to update the i18n value of a property.
 * By default we assume that the user is making a contribution in their own locale.
 * @todo Add UI support for providing values in other locales (i.e. allow users-translatable)
 * values.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param locale - The locale to update the property for.
 * @param value - The value to update the property to.
 * @param valueGen - Whether the value is generated.
 */
export function updateFeatureI18nProperty(
  appCtx: AppCtx,
  propertyId: Id,
  locale: Locale,
  value: string,
  valueGen: boolean = false
): void {
  const existingProperty = getFeatureProperty(appCtx, propertyId);

  if (existingProperty) {
    // Update existing property's i18n
    if (!existingProperty.i18n) {
      existingProperty.i18n = {};
    }
    existingProperty.i18n[locale] = { locale, value, valueGen };
  } else {
    // Create new property with i18n
    updateNewFeatureProperty(appCtx, propertyId, {
      value: '',
      i18n: { [locale]: { locale, value, valueGen } }
    });
  }
}

/**
 * Updates a property in the new feature context
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param object - The object to update the property with.
 */
export function updateNewFeatureProperty(
  appCtx: AppCtx,
  propertyId: Id,
  object: Partial<FeatureProperty>
): void {
  if (!appCtx.newFeature?.feature) {
    return;
  }

  // Initialize properties array if it doesn't exist
  if (!appCtx.newFeature.feature.properties) {
    appCtx.newFeature.feature.properties = [];
  }

  const propIndex = appCtx.newFeature.feature.properties.findIndex(
    (p) => p!.propertyId === propertyId
  );

  let updatedProperties: any[];

  if (propIndex >= 0) {
    // Update existing property
    updatedProperties = [...appCtx.newFeature.feature.properties];
    updatedProperties[propIndex] = {
      ...updatedProperties[propIndex]!,
      ...object
    };
  } else {
    // Create new property
    const newProperty = {
      id: '', // Will be set when saved
      propertyId,
      featureId: '', // Will be set when feature is created
      value: '',
      ...object
    };

    // Only add i18n if it's provided in the object
    if (object.i18n) {
      newProperty.i18n = object.i18n;
    }

    updatedProperties = [...appCtx.newFeature.feature.properties, newProperty];
  }

  // Create a new newFeature object to ensure reactivity
  appCtx.newFeature = {
    ...appCtx.newFeature,
    feature: {
      ...appCtx.newFeature.feature,
      properties: updatedProperties
    }
  };
}

/**
 * Updates a feature property's i18n value in the new feature context
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param object - The object to update the property with.
 * @param locale - The locale to update the property for.
 */
export function updateNewFeatureI18nProperty(
  appCtx: AppCtx,
  propertyId: Id,
  object: Partial<FeaturePropertyI18nDB>,
  locale: Locale
): void {
  const propIndex = appCtx.newFeature?.feature?.properties?.findIndex(
    (p) => p!.propertyId === propertyId
  );

  if (
    propIndex !== undefined &&
    propIndex >= 0 &&
    appCtx.newFeature?.feature?.properties?.[propIndex]?.i18n
  ) {
    appCtx.newFeature.feature.properties[propIndex].i18n![locale] = {
      ...appCtx.newFeature.feature.properties[propIndex].i18n![locale as Locale]!,
      ...(object as { locale: Locale; value: string; valueGen: boolean })
    };
  }
}

/**
 * Handles categorical property change for new features.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param propertyValueId - The ID of the property value to update.
 */
export function handleCategoricalChange(
  appCtx: AppCtx,
  propertyId: Id,
  propertyValueId: Id
): void {
  updateFeatureProperty(appCtx, propertyId, {
    propertyValueId: propertyValueId
  });
}

/**
 * Handles specifier property change for new features.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param locale - The locale to update the property for.
 * @param newValue - The new value to update the property to.
 */
export function handleSpecifierChange(
  appCtx: AppCtx,
  propertyId: Id,
  locale: LocaleExtended,
  newValue: string
): void {
  const property = appCtx.cache.property.get(propertyId);

  if (property?.isTranslatable && locale !== 'core') {
    // Translatable property - use i18n structure
    updateFeatureI18nProperty(appCtx, propertyId, locale as Locale, newValue);
  } else {
    // Non-translatable property - just set value
    updateFeatureProperty(appCtx, propertyId, {
      value: newValue
    });
  }
}
