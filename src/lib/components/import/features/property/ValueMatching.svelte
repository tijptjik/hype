<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// I18N
import { m } from '$lib/i18n';
// TYPES
import type {
  CSVColumn,
  Property,
  PropertyValue,
  PropertyValueI18nDB,
  Locale,
  Id
} from '$lib/types';
// ENUMS
import { FirstClassResource } from '$lib/enums';

type PropertyData = {
  key: string;
  columns: CSVColumn[];
  scenario: number;
};

type ValueMatchData = {
  value: string;
  locale: Locale;
  exists: boolean;
  matchedPropertyValueId?: Id;
  existingOptions: PropertyValueI18nDB[];
};

type Props = {
  property: PropertyData;
  onActionComplete: () => void;
};

let { property, onActionComplete }: Props = $props();

const importCtx = getImportCtx();
const appCtx = getAppCtx();

// Get the existing property data
let existingProperty = $state<Property | null>(null);
let isLoading = $state(true);
let valueMatches = $state<ValueMatchData[]>([]);

// Reactive effect to reload data when property changes
$effect(() => {
  // Reset loading state when property changes
  isLoading = true;
  valueMatches = [];
  existingProperty = null;

  // Load new property data asynchronously
  loadExistingProperty().then(() => {
    analyzeValues();
  });
});

async function loadExistingProperty() {
  try {
    // First try to find in cache
    let found = Array.from(appCtx.cache.property.values()).find(
      (p: Property) => p.key === property.key
    );

    if (found) {
      existingProperty = found;
    } else {
      // If not in cache, try to fetch from API
      try {
        const response = await fetch(
          `/api/properties?key=${encodeURIComponent(property.key)}`
        );
        if (response.ok) {
          const properties = await response.json();
          if (properties.length > 0) {
            found = properties[0] as Property;
            existingProperty = found;
            // Add to cache for future use
            if (found) {
              appCtx.addToCache(FirstClassResource.property, found.id, found);
            }
          } else {
            console.error('ValueMatching: Property not found in API:', property.key);
          }
        } else {
          console.error('ValueMatching: API request failed:', response.status);
        }
      } catch (apiError) {
        console.error('ValueMatching: Error fetching from API:', apiError);
      }
    }

    if (!found) {
      console.error('ValueMatching: Property not found in cache or API:', property.key);
    }
  } catch (error) {
    console.error('ValueMatching: Error loading property:', error);
  } finally {
    isLoading = false;
  }
}

function analyzeValues() {
  if (!existingProperty) {
    return;
  }

  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Get unique values from CSV for each locale
  const csvValues = new Map<Locale, Set<string>>();

  property.columns.forEach((col) => {
    // Handle both localized columns and locale="None" columns
    const locale = col.locale && col.locale !== 'None' ? (col.locale as Locale) : 'en'; // Default to 'en' for None
    const colIndex = headers.indexOf(col.header);

    if (colIndex !== -1) {
      if (!csvValues.has(locale)) {
        csvValues.set(locale, new Set());
      }

      data.forEach((row, rowIndex) => {
        const cellValue = row[colIndex];
        if (cellValue && cellValue.trim()) {
          const trimmedValue = cellValue.trim();
          csvValues.get(locale)!.add(trimmedValue);
        }
      });
    } else {
      console.warn(`ValueMatching: Column "${col.header}" not found in headers`);
    }
  });

  // Create match data for each unique value per locale
  const matches: ValueMatchData[] = [];

  // Check if this is a ToggleField - if so, handle differently
  if (existingProperty.component === 'ToggleField') {
    // For ToggleFields, validate that all values are truthy/falsy
    let allValidBooleans = true;
    const invalidValues: string[] = [];

    csvValues.forEach((values, locale) => {
      values.forEach((value) => {
        const lowerValue = value.toLowerCase();
        if (!['true', 'false', '1', '0', 'yes', 'no'].includes(lowerValue)) {
          allValidBooleans = false;
          invalidValues.push(value);
        }
      });
    });

    if (allValidBooleans) {
      // For ToggleFields, we don't need property value mappings since they're just boolean
      // Store empty mapping but mark as completed
      handleAccept();
      return;
    } else {
      console.error(
        'ValueMatching: Invalid boolean values found in ToggleField:',
        invalidValues
      );
      // Could show error UI here
      return;
    }
  }

  csvValues.forEach((values, locale) => {
    values.forEach((value) => {
      // Log all existing property values for debugging
      const allExistingI18n =
        existingProperty?.values?.flatMap((pv) => Object.values(pv.i18n || {})) || [];

      // Check if this value exists in the existing property values
      const baseLocale = locale.split(';')[0];
      const existingValueI18n = existingProperty?.values
        ?.flatMap((pv) => Object.values(pv.i18n || {}))
        .find((i18n) => {
          const localeMatch = i18n.locale === baseLocale;
          const valueMatch = i18n.value === value;
          return localeMatch && valueMatch;
        });

      // Get all existing values for this locale as options
      const existingOptions =
        existingProperty?.values
          ?.flatMap((pv) => Object.values(pv.i18n || {}))
          .filter((i18n) => i18n.locale === baseLocale) || [];

      matches.push({
        value,
        locale,
        exists: !!existingValueI18n,
        matchedPropertyValueId: existingValueI18n?.propertyValueId,
        existingOptions
      });
    });
  });

  valueMatches = matches;

  // Check if all values match perfectly - if so, auto-complete
  const allValuesMatch = matches.every((match) => match.exists);

  if (allValuesMatch) {
    // Auto-proceed after a short delay to show the matches
    setTimeout(() => {
      handleAccept();
    }, 1000);
  }
}

function updateMatch(index: number, propertyValueId: Id | 'NEW') {
  if (propertyValueId === 'NEW') {
    valueMatches[index].matchedPropertyValueId = undefined;
    valueMatches[index].exists = false;
  } else {
    valueMatches[index].matchedPropertyValueId = propertyValueId;
    valueMatches[index].exists = true;
  }
}

function canProceed(): boolean {
  return valueMatches.every(
    (match) => match.exists || match.matchedPropertyValueId === undefined
  );
}

function hasNewValues(): boolean {
  return valueMatches.some(
    (match) => !match.exists && match.matchedPropertyValueId === undefined
  );
}

async function handleAccept() {
  if (!canProceed()) return;

  // Store the resolved property value IDs
  const resolvedData: Record<string, Id | undefined> = {};
  const propertyValueMapping: Record<string, string> = {};

  valueMatches.forEach((match) => {
    const key = `${match.locale}:${match.value}`;
    resolvedData[key] = match.matchedPropertyValueId;

    // Also create a simple value mapping for CSV value -> property value ID
    if (match.matchedPropertyValueId) {
      propertyValueMapping[match.value] = match.matchedPropertyValueId;
    }
  });

  // Store in enriched data
  const enrichedData = {
    propertyId: existingProperty?.id,
    propertyValueMapping: propertyValueMapping,
    resolvedData: resolvedData,
    // Store resolved value mappings for later use
    ...(importCtx.getPropertyEnrichedData(property.key) || {})
  };

  importCtx.setPropertyEnrichedData(property.key, enrichedData);

  // Verify it was stored
  const storedData = importCtx.getPropertyEnrichedData(property.key);

  // Also check the full reconciliation state
  const reconciliation = importCtx.getPropertyReconciliation();

  if (hasNewValues()) {
    // Need to create new property values by updating the property
    try {
      // Get new values that need to be created
      const newValues = valueMatches.filter(
        (match) => !match.exists && match.matchedPropertyValueId === undefined
      );

      // Auto-translate new values to all locales
      const translatedValues = new Map<string, Record<Locale, string>>();

      // Translate each new value to zh-hans and zh-hant
      for (const match of newValues) {
        const baseLocale = match.locale.split(';')[0] as Locale;
        const valueTranslations: Record<Locale, string> = {
          en: match.value,
          'zh-hans': match.value,
          'zh-hant': match.value
        } as Record<Locale, string>;

        // If source is English, translate to Chinese
        if (baseLocale === 'en') {
          try {
            // Translate to zh-hant
            const zhHantResponse = await fetch('/api/translation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source: 'en',
                target: 'zh-hant',
                texts: [match.value]
              })
            });
            if (zhHantResponse.ok) {
              const [zhHantValue] = await zhHantResponse.json();
              valueTranslations['zh-hant'] = zhHantValue;
            }

            // Translate to zh-hans
            const zhHansResponse = await fetch('/api/translation', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                source: 'en',
                target: 'zh-hans',
                texts: [match.value]
              })
            });
            if (zhHansResponse.ok) {
              const [zhHansValue] = await zhHansResponse.json();
              valueTranslations['zh-hans'] = zhHansValue;
            }
          } catch (error) {
            console.error('ValueMatching: Translation error:', error);
            // Continue with English value as fallback
          }
        }

        translatedValues.set(match.value, valueTranslations);
      }

      // Create property value records for the new values with translations
      const newPropertyValues = newValues.map((match, index) => {
        const valueId = crypto.randomUUID();
        const baseLocale = match.locale.split(';')[0] as Locale;
        const translations = translatedValues.get(match.value) || {
          en: match.value,
          'zh-hans': match.value,
          'zh-hant': match.value
        };

        return {
          id: valueId,
          propertyId: existingProperty!.id,
          rank: (existingProperty!.values?.length || 0) + index,
          i18n: {
            en: {
              propertyValueId: valueId,
              locale: 'en' as Locale,
              value: translations['en'] || match.value,
              valueGen: baseLocale !== 'en'
            },
            'zh-hant': {
              propertyValueId: valueId,
              locale: 'zh-hant' as Locale,
              value: translations['zh-hant'] || match.value,
              valueGen: baseLocale === 'en' && translations['zh-hant'] !== match.value
            },
            'zh-hans': {
              propertyValueId: valueId,
              locale: 'zh-hans' as Locale,
              value: translations['zh-hans'] || match.value,
              valueGen: baseLocale === 'en' && translations['zh-hans'] !== match.value
            }
          }
        };
      });

      // Merge with existing property values
      const updatedProperty = {
        ...existingProperty!,
        values: [...(existingProperty!.values || []), ...newPropertyValues]
      };

      // PUT the updated property
      const response = await fetch(`/api/properties/${existingProperty!.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedProperty)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ValueMatching: Failed to update property:', errorText);
        throw new Error(`Failed to update property: ${response.statusText}`);
      }

      const updatedPropertyData: Property = await response.json();

      // Update cache
      appCtx.addToCache(
        FirstClassResource.property,
        updatedPropertyData.id,
        updatedPropertyData
      );

      // Update the resolved data with the new property value IDs
      const updatedResolvedData: Record<string, Id | undefined> = { ...resolvedData };
      const updatedPropertyValueMapping: Record<string, string> = {
        ...propertyValueMapping
      };

      newValues.forEach((match) => {
        // Find the newly created property value ID
        const baseLocale = match.locale.split(';')[0] as Locale;
        const newPropertyValue = updatedPropertyData.values?.find((pv) => {
          const i18nValue = pv.i18n?.[baseLocale];
          return i18nValue && i18nValue.value === match.value;
        });

        if (newPropertyValue) {
          const key = `${match.locale}:${match.value}`;
          updatedResolvedData[key] = newPropertyValue.id;
          updatedPropertyValueMapping[match.value] = newPropertyValue.id;
        }
      });

      // Store the updated enriched data
      const enrichedData = {
        propertyId: existingProperty?.id,
        propertyValueMapping: updatedPropertyValueMapping,
        resolvedData: updatedResolvedData,
        ...(importCtx.getPropertyEnrichedData(property.key) || {})
      };

      importCtx.setPropertyEnrichedData(property.key, enrichedData);

      onActionComplete();
    } catch (error) {
      console.error('ValueMatching: Error creating new property values:', error);
      // Still proceed but log the error
      onActionComplete();
    }
  } else {
    // All values matched, proceed to next step
    onActionComplete();
  }
}
</script>

{#if isLoading}
  <div class="flex items-center justify-center p-8">
    <span class="loading loading-spinner loading-lg"></span>
    <span class="ml-3">{m.loading_property_data()}</span>
  </div>
{:else if !existingProperty}
  <div class="alert alert-error">
    <div>
      <h4 class="font-semibold">{m.property_not_found()}</h4>
      <p>{m.property_not_found_description({ key: property.key })}</p>
    </div>
  </div>
{:else}
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body">
      <h3 class="card-title">
        {m.match_property_values({ key: property.key })}
      </h3>

      <div class="mb-4">
        <div class="alert alert-info">
          <div>
            <div class="mb-2 font-semibold">
              {m.existing_property_info()}
            </div>
            <div class="text-sm">
              <strong>{m.property_id()}:</strong>
              {existingProperty.id}<br />
              <strong>{m.existing_values()}:</strong>
              {existingProperty.values?.length || 0}
            </div>
          </div>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead>
            <tr>
              <th>{m.locale()}</th>
              <th>{m.csv_value()}</th>
              <th>{m.exists_in_system()}</th>
              <th>{m.match_to()}</th>
            </tr>
          </thead>
          <tbody>
            {#each valueMatches as match, index}
              <tr>
                <td>
                  <span class="badge badge-outline">{match.locale}</span>
                </td>
                <td class="font-mono text-sm">{match.value}</td>
                <td>
                  {#if match.exists}
                    <span class="badge badge-success">✓ {m.exists()}</span>
                  {:else}
                    <span class="badge badge-warning">⚠ {m.new_value()}</span>
                  {/if}
                </td>
                <td>
                  {#if match.exists}
                    <span class="text-success">✓ {m.auto_matched()}</span>
                  {:else}
                    <select
                      class="select select-bordered select-sm w-full max-w-xs"
                      onchange={(e) =>
                        updateMatch(index, (e.target as HTMLSelectElement).value)}>
                      <option value="NEW">{m.create_new()}</option>
                      {#each match.existingOptions as option}
                        <option value={option.propertyValueId}>
                          {option.value}
                        </option>
                      {/each}
                    </select>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      {#if hasNewValues()}
        <div class="alert alert-warning mt-4">
          <div>
            <h4 class="font-semibold">{m.new_values_detected()}</h4>
            <p class="text-sm">
              {m.new_values_will_be_created()}
            </p>
          </div>
        </div>
      {/if}

      <div class="card-actions mt-6 justify-end">
        <button class="btn btn-primary" onclick={handleAccept} disabled={!canProceed()}>
          {m.accept()}
        </button>
      </div>
    </div>
  </div>
{/if}
