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
  console.log('ValueMatching: Property changed to:', property.key);

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
    console.log('ValueMatching: Loading existing property for key:', property.key);

    // First try to find in cache
    let found = Array.from(appCtx.cache.property.values()).find(
      (p: Property) => p.key === property.key
    );

    if (found) {
      existingProperty = found;
      console.log(
        'ValueMatching: Found existing property in cache:',
        found.id,
        'with',
        found.values?.length || 0,
        'values'
      );
    } else {
      // If not in cache, try to fetch from API
      console.log('ValueMatching: Property not in cache, fetching from API...');
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
              console.log(
                'ValueMatching: Found existing property via API:',
                found.id,
                'with',
                found.values?.length || 0,
                'values'
              );
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
    console.log('ValueMatching: No existing property to analyze');
    return;
  }

  console.log('ValueMatching: Analyzing values for property:', existingProperty.key);

  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Get unique values from CSV for each locale
  const csvValues = new Map<Locale, Set<string>>();

  console.log('ValueMatching: Property columns:', property.columns);
  console.log('ValueMatching: CSV headers:', headers);

  property.columns.forEach((col) => {
    console.log(
      `ValueMatching: Processing column "${col.header}" with locale "${col.locale}"`
    );

    // Handle both localized columns and locale="None" columns
    const locale = col.locale && col.locale !== 'None' ? (col.locale as Locale) : 'en'; // Default to 'en' for None
    const colIndex = headers.indexOf(col.header);

    console.log(
      `ValueMatching: Column "${col.header}" found at index ${colIndex}, using locale "${locale}"`
    );

    if (colIndex !== -1) {
      if (!csvValues.has(locale)) {
        csvValues.set(locale, new Set());
      }

      data.forEach((row, rowIndex) => {
        const cellValue = row[colIndex];
        if (cellValue && cellValue.trim()) {
          const trimmedValue = cellValue.trim();
          if (rowIndex < 5) {
            // Log first 5 values for debugging
            console.log(
              `ValueMatching: Row ${rowIndex}, adding value "${trimmedValue}" for locale "${locale}" (original locale: "${col.locale}")`
            );
          }
          csvValues.get(locale)!.add(trimmedValue);
        }
      });
    } else {
      console.warn(`ValueMatching: Column "${col.header}" not found in headers`);
    }
  });

  // Create match data for each unique value per locale
  const matches: ValueMatchData[] = [];

  console.log('ValueMatching: CSV values by locale:', Array.from(csvValues.entries()));

  // Check if this is a ToggleField - if so, handle differently
  if (existingProperty.component === 'ToggleField') {
    console.log('ValueMatching: Detected ToggleField, validating boolean values');

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
      console.log(
        'ValueMatching: All ToggleField values are valid booleans, auto-completing'
      );
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
    console.log(
      `ValueMatching: Processing locale ${locale} with values:`,
      Array.from(values)
    );

    values.forEach((value) => {
      console.log(`ValueMatching: Looking for value "${value}" in locale "${locale}"`);

      // Log all existing property values for debugging
      const allExistingI18n =
        existingProperty?.values?.flatMap((pv) => Object.values(pv.i18n || {})) || [];

      console.log(
        'ValueMatching: All existing i18n values:',
        allExistingI18n.map((i18n) => ({
          locale: i18n.locale,
          value: i18n.value,
          propertyValueId: i18n.propertyValueId
        }))
      );

      // Check if this value exists in the existing property values
      const baseLocale = locale.split(';')[0];
      console.log(
        `ValueMatching: Looking for value "${value}" in locale "${baseLocale}"`
      );
      console.log(
        `ValueMatching: Available property values:`,
        existingProperty?.values?.map((pv) => ({
          id: pv.id,
          i18n: Object.values(pv.i18n || {}).map((i18n) => ({
            locale: i18n.locale,
            value: i18n.value
          }))
        }))
      );

      const existingValueI18n = existingProperty?.values
        ?.flatMap((pv) => Object.values(pv.i18n || {}))
        .find((i18n) => {
          const localeMatch = i18n.locale === baseLocale;
          const valueMatch = i18n.value === value;
          console.log(
            `ValueMatching: Comparing "${i18n.value}" (${i18n.locale}) with "${value}" (${baseLocale} from ${locale}) - locale match: ${localeMatch}, value match: ${valueMatch}`
          );
          return localeMatch && valueMatch;
        });

      console.log(
        `ValueMatching: Found existing value for "${value}" in "${locale}":`,
        existingValueI18n
      );

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
  console.log('ValueMatching: All values match perfectly?', allValuesMatch);

  if (allValuesMatch) {
    console.log('ValueMatching: All values match perfectly, auto-completing');
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

  console.log('ValueMatching: Creating property value mapping:', propertyValueMapping);
  console.log('ValueMatching: Resolved data:', resolvedData);

  // Store in enriched data
  const enrichedData = {
    propertyId: existingProperty?.id,
    propertyValueMapping: propertyValueMapping,
    resolvedData: resolvedData,
    // Store resolved value mappings for later use
    ...(importCtx.getPropertyEnrichedData(property.key) || {})
  };

  console.log(
    `ValueMatching: Storing enriched data for property "${property.key}":`,
    enrichedData
  );
  importCtx.setPropertyEnrichedData(property.key, enrichedData);

  // Verify it was stored
  const storedData = importCtx.getPropertyEnrichedData(property.key);
  console.log(`ValueMatching: Verified stored data for "${property.key}":`, storedData);

  // Also check the full reconciliation state
  const reconciliation = importCtx.getPropertyReconciliation();
  console.log(
    'ValueMatching: Full reconciliation enrichedData size after storage:',
    reconciliation.enrichedData.size
  );
  console.log(
    'ValueMatching: All stored keys:',
    Array.from(reconciliation.enrichedData.keys())
  );

  if (hasNewValues()) {
    // Need to create new property values - transition to creation flow
    // This would need a separate component for creating new property values
    console.log('Need to create new property values');
    // For now, just proceed
    onActionComplete();
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
