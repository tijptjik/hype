import type { MapCtx } from '$lib/context/map.svelte';
import { getLocale, getI18n } from '$lib/i18n';
import * as m from '$lib/paraglide/messages';
import type { Property, TranslatedValue, RangeFilterValue, Locale } from '$lib/types';

/**
 * Gets the original (non-translated) value from a potentially translated value object.
 * Used for storing filter state.
 */
export function getOriginalValue(value: string | TranslatedValue): string {
  return typeof value === 'string' ? value : value.value;
}

/**
 * Gets the translated display value based on the current locale.
 * Falls back to the original value if no translation is found.
 */
export function getPropValueInCurrentLocale(value: string | TranslatedValue): string {
  if (typeof value === 'string') return value;
  const currentLocale = getLocale();
  // Fallback to original value for 'en' or if translations are missing
  if (!value.i18n) return value.value;
  // Add type annotation for 't'
  const translation = value.i18n.find(
    (t: { locale: Locale; value: string }) => t.locale === currentLocale
  );
  return translation?.value || value.value; // Fallback to original value
}

export function getTranslatedValues(values: TranslatedValue[] = []) {
  // Add default empty array
  return values.map((v) => ({
    value: v.value,
    i18n: v.i18n || {}
  }));
}

/**
 * Formats the display text for selected values of a *single* categorical filter property.
 * Mimics the logic previously in CategoryFilter's displayText.
 */
export function displaySelectedProperties(
  selectedValues: string[], // Array of original selected values (e.g., ["A", "B"])
  propertyDefinitionValues: Array<string | TranslatedValue> // Available values from property definition
): string {
  if (!selectedValues || selectedValues.length === 0) {
    return m.filters__all();
  }

  const translatedSelectedValues = selectedValues.map((selectedValue: string) => {
    // Explicitly type selectedValue
    const valueObject = propertyDefinitionValues.find(
      (v) => getOriginalValue(v) === selectedValue
    );
    // If somehow the value object isn't found (shouldn't happen), fallback to the raw value
    return valueObject ? getPropValueInCurrentLocale(valueObject) : selectedValue;
  });

  if (translatedSelectedValues.length === 1) {
    return translatedSelectedValues[0];
  } else {
    // Format as "ValueA, ValueB & ValueC"
    return (
      translatedSelectedValues.slice(0, -1).join(', ') +
      ' & ' +
      translatedSelectedValues[translatedSelectedValues.length - 1]
    );
  }
}

/**
 * Summarizes the *active* property filters for a given layer.
 */
export function displaySelectedFilters(
  layerFilters: Record<string, string[] | RangeFilterValue> | undefined, // Filters for the specific layer
  properties: Property[] | undefined, // Property definitions for the layer's project
  mapCtx: MapCtx
): string {
  if (!layerFilters || !properties) {
    return m.filters__none();
  }

  const activeFilterKeys = Object.entries(layerFilters)
    .filter(([_, value]) => {
      // Check if filter is active
      if (Array.isArray(value)) {
        // Categorical: active if array is not empty
        return value.length > 0;
      } else if (
        typeof value === 'object' &&
        value !== null &&
        'rangeMin' in value && // Check for range properties
        'globalMin' in value // Check for range properties
      ) {
        // Range: active if range differs from global min/max
        // Cast value to RangeFilterValue for type safety after checks
        const rangeValue = value as RangeFilterValue;
        return (
          rangeValue.rangeMin !== rangeValue.globalMin ||
          rangeValue.rangeMax !== rangeValue.globalMax
        );
      }
      return false; // Not active if not array or valid range object
    })
    .map(([key]) => key); // Get the keys of active filters

  if (activeFilterKeys.length === 0) {
    return m.filters__none();
  }

  // Get translated labels for active filters
  const activeFilterLabels = activeFilterKeys.map((key) => {
    const propertyDefinition = properties.find((p) => p.key === key);
    // Use getI18n for the property label, fallback to key if not found
    return propertyDefinition ? getI18n(propertyDefinition, 'label', mapCtx.getUserPreferences()) || key : key;
  });

  // Format the summary string based on the count
  if (activeFilterLabels.length === 1) {
    return m.filters__filtering_for({
      properties: `<span class="text-sky-600 font-mono">${activeFilterLabels[0]}</span>`
    });
  } else {
    // Format as "LabelA, LabelB & LabelC" for more than one
    const formattedString =
      '<span class="text-sky-600 font-mono">' +
      activeFilterLabels
        .slice(0, -1)
        .join('</span>, <span class="text-sky-600 font-mono">') +
      '</span> & <span class="text-sky-600 font-mono">' +
      activeFilterLabels[activeFilterLabels.length - 1] +
      '</span>';
    return m.filters__filtering_for({ properties: formattedString });
  }
}
