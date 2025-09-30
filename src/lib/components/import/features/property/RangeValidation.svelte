<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// I18N
import { m } from '$lib/i18n';
// TYPES
import type { CSVColumn, Property } from '$lib/types';

type PropertyData = {
  key: string;
  columns: CSVColumn[];
  scenario: number;
};

type ValidationResult = {
  isValid: boolean;
  outOfRangeValues: Array<{
    value: string;
    numericValue: number;
  }>;
  currentRange: {
    min: number | null;
    max: number | null;
  };
  csvRange: {
    min: number;
    max: number;
  };
};

type Props = {
  property: PropertyData;
  onActionComplete: () => void;
};

let { property, onActionComplete }: Props = $props();

const importCtx = getImportCtx();
const appCtx = getAppCtx();

let existingProperty = $state<Property | null>(null);
let validation = $state<ValidationResult | null>(null);
let isLoading = $state(true);
let showManualFix = $state(false);
let hasValidated = $state(false);
let isToggleField = $state(false);

async function initializeProperty() {
  console.log('RangeValidation: Initializing property:', property.key);
  isLoading = true;
  isToggleField = false;
  validation = null;
  hasValidated = false;

  await loadExistingProperty();

  if (!existingProperty) {
    console.error('RangeValidation: Property not found, cannot proceed');
    return;
  }

  // Check if this should actually be treated as a toggle field
  if (shouldTreatAsToggle()) {
    console.log('RangeValidation: Detected toggle field pattern, auto-proceeding');
    isToggleField = true;
    isLoading = false;
    // Store property ID for enrichment
    importCtx.setPropertyEnrichedData(property.key, {
      propertyId: existingProperty.id
    });
    console.log('RangeValidation: Property enriched data set, scheduling auto-proceed');
    // Auto-proceed immediately for toggle fields
    setTimeout(() => {
      console.log(
        'RangeValidation: Auto-proceed timeout triggered, calling onActionComplete'
      );
      onActionComplete();
    }, 1000);
    return;
  }

  validateValues();
}

onMount(() => {
  initializeProperty();
});

// Re-initialize when property changes
$effect(() => {
  console.log('RangeValidation: Property effect triggered for:', property.key);
  initializeProperty();
});

async function loadExistingProperty() {
  try {
    const found = Array.from(appCtx.cache.property.values()).find(
      (p: Property) => p.key === property.key
    );

    if (found) {
      existingProperty = found;
    } else {
      console.error('Property not found:', property.key);
    }
  } catch (error) {
    console.error('Error loading property:', error);
  } finally {
    isLoading = false;
  }
}

function shouldTreatAsToggle(): boolean {
  if (!existingProperty) {
    console.log(
      'RangeValidation: No existing property loaded, cannot check toggle status'
    );
    return false;
  }

  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Get all unique values from CSV
  const uniqueValues = new Set<string>();

  property.columns.forEach((col) => {
    const colIndex = headers.indexOf(col.header);

    data.forEach((row) => {
      if (row[colIndex] && row[colIndex].trim()) {
        uniqueValues.add(row[colIndex].trim());
      }
    });
  });

  const values = Array.from(uniqueValues);
  console.log('RangeValidation: Checking if should be toggle, unique values:', values);

  // Check for binary toggle patterns
  const isBinaryToggle = values.length === 2 && values.sort().join(',') === '0,1';
  const isSingleBinaryValue =
    values.length === 1 && (values[0] === '0' || values[0] === '1');
  const isBooleanValues = values.every((val) => {
    const lower = val.toLowerCase();
    return lower === 'true' || lower === 'false';
  });

  const shouldBeToggle = isBinaryToggle || isSingleBinaryValue || isBooleanValues;
  console.log('RangeValidation: Should treat as toggle?', shouldBeToggle, {
    isBinaryToggle,
    isSingleBinaryValue,
    isBooleanValues,
    existingPropertyId: existingProperty.id
  });

  return shouldBeToggle;
}

function validateValues() {
  if (!existingProperty) return;

  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Get all numeric values from CSV
  const numericValues: number[] = [];
  const invalidValues: Array<{ value: string; numericValue: number }> = [];

  property.columns.forEach((col) => {
    const colIndex = headers.indexOf(col.header);

    data.forEach((row) => {
      if (row[colIndex] && row[colIndex].trim()) {
        const value = row[colIndex].trim();
        let numericValue: number;

        // Handle boolean values
        if (value.toLowerCase() === 'true') {
          numericValue = 1;
        } else if (value.toLowerCase() === 'false') {
          numericValue = 0;
        } else {
          numericValue = parseFloat(value);
        }

        if (!isNaN(numericValue)) {
          numericValues.push(numericValue);

          // Check if value is within existing range
          const min = existingProperty?.min;
          const max = existingProperty?.max;

          if (
            (min !== null && min !== undefined && numericValue < min) ||
            (max !== null && max !== undefined && numericValue > max)
          ) {
            invalidValues.push({ value, numericValue });
          }
        }
      }
    });
  });

  // Calculate CSV data range
  const csvMin = Math.min(...numericValues);
  const csvMax = Math.max(...numericValues);

  validation = {
    isValid: invalidValues.length === 0,
    outOfRangeValues: invalidValues,
    currentRange: {
      min: existingProperty.min,
      max: existingProperty.max
    },
    csvRange: {
      min: csvMin,
      max: csvMax
    }
  };

  hasValidated = true;
  console.log('RangeValidation: Validation completed:', {
    isValid: validation.isValid,
    invalidCount: invalidValues.length,
    csvRange: { min: csvMin, max: csvMax },
    currentRange: { min: existingProperty.min, max: existingProperty.max }
  });
}

function handleProceed() {
  if (validation?.isValid) {
    // Store property ID for enrichment
    importCtx.setPropertyEnrichedData(property.key, {
      propertyId: existingProperty?.id
    });

    onActionComplete();
  } else {
    showManualFix = true;
  }
}

// Auto-proceed if validation passes (for ToggleField/RangeField scenarios)
$effect(() => {
  if (validation?.isValid && hasValidated && !showManualFix) {
    console.log(
      'RangeValidation: Auto-proceeding for valid range field - all values within acceptable range'
    );
    setTimeout(() => handleProceed(), 1000); // Slightly longer delay to show validation result
  }
});

function handleAbort() {
  // Abort the import process
  console.log('Import aborted due to range validation failure');
  // You might want to set an error state or navigate back
}

function suggestNewRange() {
  if (!validation) return { min: null, max: null };

  const currentMin = validation.currentRange.min;
  const currentMax = validation.currentRange.max;
  const csvMin = validation.csvRange.min;
  const csvMax = validation.csvRange.max;

  return {
    min: currentMin !== null ? Math.min(currentMin, csvMin) : csvMin,
    max: currentMax !== null ? Math.max(currentMax, csvMax) : csvMax
  };
}
</script>

{#if isLoading}
  <div class="flex items-center justify-center p-8">
    <span class="loading loading-spinner loading-lg"></span>
    <span class="ml-3">{m.validating_range_values()}</span>
  </div>
{:else if !existingProperty}
  <div class="alert alert-error">
    <div>
      <h4 class="font-semibold">{m.property_not_found()}</h4>
      <p>{m.property_not_found_description({ key: property.key })}</p>
    </div>
  </div>
{:else if isToggleField}
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body">
      <h3 class="card-title">
        Toggle Field Detected: {property.key}
      </h3>

      <div class="alert alert-success">
        <div>
          <h4 class="font-semibold">✓ Toggle Field Detected</h4>
          <p>
            This property contains boolean values (TRUE/FALSE) and will be processed as
            a toggle field.
          </p>
        </div>
      </div>

      <div class="mb-4">
        <div class="stat rounded-lg bg-base-200">
          <div class="stat-title">Property Type</div>
          <div class="stat-value text-lg">Toggle Field</div>
          <div class="stat-desc">Boolean values detected</div>
        </div>
      </div>

      <div class="text-center">
        <span class="loading loading-spinner loading-md"></span>
        <p class="mt-2 text-sm text-base-content/70">Auto-proceeding...</p>
      </div>

      <div class="card-actions mt-6 justify-end">
        <button
          class="btn btn-primary"
          onclick={() => {
            console.log('RangeValidation: Manual proceed button clicked');
            onActionComplete();
          }}>
          Proceed Manually
        </button>
      </div>
    </div>
  </div>
{:else if !validation}
  <div class="alert alert-error">
    <div>
      <h4 class="font-semibold">{m.validation_error()}</h4>
      <p>{m.unable_to_validate_values()}</p>
      <p class="mt-2 text-sm">Property: {property.key}</p>
      <p class="text-sm">Existing property loaded: {existingProperty ? 'Yes' : 'No'}</p>
    </div>
  </div>
{:else}
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body">
      <h3 class="card-title">
        {m.range_validation_for_property({ key: property.key })}
      </h3>

      <div class="mb-4">
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div class="stat rounded-lg bg-base-200">
            <div class="stat-title">{m.current_property_range()}</div>
            <div class="stat-value text-lg">
              {validation.currentRange.min ?? '∞'} - {validation.currentRange.max ??
                '∞'}
            </div>
            <div class="stat-desc">{m.existing_constraints()}</div>
          </div>

          <div class="stat rounded-lg bg-base-200">
            <div class="stat-title">{m.csv_data_range()}</div>
            <div class="stat-value text-lg">
              {validation.csvRange.min} - {validation.csvRange.max}
            </div>
            <div class="stat-desc">{m.values_in_import_data()}</div>
          </div>
        </div>
      </div>

      {#if validation.isValid}
        <div class="alert alert-success">
          <div>
            <h4 class="font-semibold">✓ {m.validation_passed()}</h4>
            <p>{m.all_values_within_range()}</p>
          </div>
        </div>

        <div class="card-actions mt-6 justify-end">
          <button class="btn btn-primary" onclick={handleProceed}>
            {m.proceed()}
          </button>
        </div>
      {:else}
        <div class="alert alert-error">
          <div>
            <h4 class="font-semibold">✗ {m.validation_failed()}</h4>
            <p>
              {m.values_outside_range({ count: validation.outOfRangeValues.length })}
            </p>
          </div>
        </div>

        <div class="mb-4">
          <h4 class="mb-2 font-semibold">{m.out_of_range_values()}</h4>
          <div class="overflow-x-auto">
            <table class="table-compact table table-zebra w-full">
              <thead>
                <tr>
                  <th>{m.original_value()}</th>
                  <th>{m.numeric_value()}</th>
                  <th>{m.issue()}</th>
                </tr>
              </thead>
              <tbody>
                {#each validation.outOfRangeValues.slice(0, 10) as item}
                  <tr>
                    <td class="font-mono text-sm">{item.value}</td>
                    <td>{item.numericValue}</td>
                    <td class="text-sm text-error">
                      {#if validation.currentRange.min !== null && item.numericValue < validation.currentRange.min}
                        {m.below_minimum({ min: validation.currentRange.min })}
                      {:else if validation.currentRange.max !== null && item.numericValue > validation.currentRange.max}
                        {m.above_maximum({ max: validation.currentRange.max })}
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if validation.outOfRangeValues.length > 10}
              <div class="mt-2 text-sm text-base-content/70">
                {m.and_more_values({ count: validation.outOfRangeValues.length - 10 })}
              </div>
            {/if}
          </div>
        </div>

        {#if showManualFix}
          <div class="alert alert-warning">
            <div>
              <h4 class="font-semibold">{m.manual_intervention_required()}</h4>
              <p class="mb-3">{m.manual_fix_options()}</p>

              <div class="text-sm">
                <p><strong>{m.suggested_new_range()}:</strong></p>
                <p>
                  {m.min()}: {suggestNewRange().min} |
                  {m.max()}: {suggestNewRange().max}
                </p>
              </div>

              <div class="mt-3">
                <p class="text-sm font-medium">{m.options()}:</p>
                <ul class="mt-1 list-inside list-disc text-sm">
                  <li>{m.update_property_range()}</li>
                  <li>{m.clean_csv_data_manually()}</li>
                </ul>
              </div>
            </div>
          </div>
        {/if}

        <div class="card-actions mt-6 justify-end">
          <button class="btn btn-ghost" onclick={handleAbort}>
            {m.abort_import()}
          </button>
          {#if !showManualFix}
            <button class="btn btn-warning" onclick={() => (showManualFix = true)}>
              {m.show_options()}
            </button>
          {/if}
        </div>
      {/if}
    </div>
  </div>
{/if}
