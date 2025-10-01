<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// I18N
import { m } from '$lib/i18n';
// LIB
import { customAlphabet } from 'nanoid';
// TYPES
import type {
  CSVColumn,
  Property,
  PropertyNew,
  FieldComponentType,
  Locale,
  Id
} from '$lib/types';
// ENUMS
import { FirstClassResource } from '$lib/enums';

// NANOID
const nanoid = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$',
  12
);

type PropertyData = {
  key: string;
  columns: CSVColumn[];
  scenario: number;
};

type Props = {
  property: PropertyData;
  onActionComplete: () => void;
};

let { property, onActionComplete }: Props = $props();

const importCtx = getImportCtx();
const appCtx = getAppCtx();

// Analyze CSV data to determine component type and values
let analysis = $derived.by(() => {
  console.log('CategoricalCreation: Starting analysis for property:', property.key);

  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Collect all unique values
  const allValues = new Set<string>();
  let hasLocale = false;

  console.log(
    'CategoricalCreation: Property columns:',
    property.columns.map((c) => ({
      header: c.header,
      locale: c.locale,
      propertyKey: c.propertyKey
    }))
  );

  property.columns.forEach((col) => {
    const colIndex = headers.indexOf(col.header);
    hasLocale = hasLocale || Boolean(col.locale && col.locale !== 'None');

    console.log(
      `CategoricalCreation: Processing column "${col.header}" (index: ${colIndex}, locale: ${col.locale})`
    );

    data.forEach((row, rowIndex) => {
      if (row[colIndex] && row[colIndex].trim()) {
        const value = row[colIndex].trim();
        allValues.add(value);
        if (rowIndex < 3) {
          // Log first 3 values for debugging
          console.log(`CategoricalCreation: Found value "${value}" in row ${rowIndex}`);
        }
      }
    });
  });

  const uniqueValues = Array.from(allValues);
  console.log('CategoricalCreation: All unique values:', uniqueValues);
  console.log('CategoricalCreation: Has locale?', hasLocale);

  // Determine component type based on scenario and data
  let componentType: FieldComponentType = 'SelectField';

  if (!hasLocale) {
    console.log(
      'CategoricalCreation: No locale detected, checking for ToggleField/RangeField'
    );

    // Scenario 2 or 4 - check if all values are numbers or booleans
    const allNumbers = uniqueValues.every((val) => {
      const num = parseFloat(val);
      const isNumber = !isNaN(num);
      console.log(
        `CategoricalCreation: Value "${val}" -> number ${num}, isNumber: ${isNumber}`
      );
      return isNumber;
    });

    const allBooleans = uniqueValues.every((val) => {
      const lower = val.toLowerCase();
      const isBoolean = lower === 'true' || lower === 'false';
      console.log(
        `CategoricalCreation: Value "${val}" -> lowercase "${lower}", isBoolean: ${isBoolean}`
      );
      return isBoolean;
    });

    // Check for binary values (0/1) which should be treated as ToggleField
    const isBinaryToggle =
      uniqueValues.length === 2 && uniqueValues.sort().join(',') === '0,1';
    console.log('CategoricalCreation: Is binary toggle (0,1)?', isBinaryToggle);

    // Check for single value that is 0 or 1 (also should be toggle)
    const isSingleBinaryValue =
      uniqueValues.length === 1 && (uniqueValues[0] === '0' || uniqueValues[0] === '1');
    console.log(
      'CategoricalCreation: Is single binary value (0 or 1)?',
      isSingleBinaryValue
    );

    console.log('CategoricalCreation: All numbers?', allNumbers);
    console.log('CategoricalCreation: All booleans?', allBooleans);

    if (allBooleans || isBinaryToggle || isSingleBinaryValue) {
      componentType = 'ToggleField';
      console.log('CategoricalCreation: ✅ Set component type to ToggleField');
    } else if (allNumbers) {
      componentType = 'RangeField';
      console.log('CategoricalCreation: ✅ Set component type to RangeField');
    } else {
      console.log(
        'CategoricalCreation: ⚠️ Values are neither all booleans nor all numbers, defaulting to SelectField'
      );
    }
  } else {
    console.log('CategoricalCreation: Has locale, using SelectField');
  }

  const result = {
    uniqueValues,
    componentType,
    hasLocale,
    isNew: Boolean(property.columns[0]?.propertyKey === 'NEW')
  };

  console.log('CategoricalCreation: Final analysis result:', result);
  return result;
});

// Property count and ranking is now handled by the API

// Translation state
let translatedLabels = $state<Record<string, string>>({});
let translatedPlaceholders = $state<Record<string, string>>({});
let translatedPropertyValues = $state<Record<string, Record<string, string>>>({});
let isTranslating = $state(false);

// Generate stable property ID
let propertyId = $state(nanoid());

// Generate stable property value IDs
let propertyValueIds = $derived.by(() => {
  if (analysis.componentType === 'SelectField') {
    return analysis.uniqueValues.map(() => nanoid());
  }
  return [];
});

// Create form data for property creation
let formData = $derived.by(() => {
  console.log(
    'CategoricalCreation: Generating form data for component type:',
    analysis.componentType
  );

  const englishLabel = capitalizeKey(property.key);
  const englishPlaceholder = `Enter ${capitalizeKey(property.key)}`;

  // Generate property values for SelectField component
  // Note: ToggleField and RangeField don't need property values - they store values directly on featureProperty.value
  const propertyValues =
    analysis.componentType === 'SelectField'
      ? analysis.uniqueValues.map((value, index) => {
          console.log(
            'CategoricalCreation: Creating property value for SelectField:',
            value
          );
          const valueId = propertyValueIds[index];
          return {
            id: valueId,
            propertyId: propertyId,
            rank: index,
            i18n: {
              en: {
                propertyValueId: valueId,
                locale: 'en' as const,
                value: value,
                valueGen: false
              },
              'zh-hant': {
                propertyValueId: valueId,
                locale: 'zh-hant' as const,
                value: translatedPropertyValues[value]?.['zh-hant'] || '',
                valueGen: Boolean(translatedPropertyValues[value]?.['zh-hant'])
              },
              'zh-hans': {
                propertyValueId: valueId,
                locale: 'zh-hans' as const,
                value: translatedPropertyValues[value]?.['zh-hans'] || '',
                valueGen: Boolean(translatedPropertyValues[value]?.['zh-hans'])
              }
            }
          };
        })
      : null;

  console.log(
    'CategoricalCreation: Property values created:',
    propertyValues?.length || 0,
    'values'
  );

  const formDataResult = {
    id: propertyId,
    projectId: importCtx.getSelectedProject()?.id || '',
    type: 'classifier' as const,
    key: property.key,
    rank: 0, // Will be calculated properly by the API
    component: analysis.componentType,
    isTranslatable: analysis.hasLocale,
    values: propertyValues,
    min:
      analysis.componentType === 'RangeField'
        ? Math.floor(Math.min(...analysis.uniqueValues.map((v) => parseFloat(v))))
        : null,
    max:
      analysis.componentType === 'RangeField'
        ? Math.ceil(Math.max(...analysis.uniqueValues.map((v) => parseFloat(v))))
        : null,
    i18n: {
      en: {
        locale: 'en' as const,
        propertyId: propertyId,
        label: englishLabel,
        labelGen: false,
        placeholder: englishPlaceholder,
        placeholderGen: false
      },
      'zh-hant': {
        locale: 'zh-hant' as const,
        propertyId: propertyId,
        label: translatedLabels['zh-hant'] || '',
        labelGen: Boolean(translatedLabels['zh-hant']),
        placeholder: translatedPlaceholders['zh-hant'] || '',
        placeholderGen: Boolean(translatedPlaceholders['zh-hant'])
      },
      'zh-hans': {
        locale: 'zh-hans' as const,
        propertyId: propertyId,
        label: translatedLabels['zh-hans'] || '',
        labelGen: Boolean(translatedLabels['zh-hans']),
        placeholder: translatedPlaceholders['zh-hans'] || '',
        placeholderGen: Boolean(translatedPlaceholders['zh-hans'])
      }
    }
  };

  console.log('CategoricalCreation: Final form data structure:', {
    component: formDataResult.component,
    valuesCount: formDataResult.values?.length || 0,
    hasMin: formDataResult.min !== null,
    hasMax: formDataResult.max !== null,
    isTranslatable: formDataResult.isTranslatable
  });

  return formDataResult;
});

function capitalizeKey(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Translation function
async function translateToAllLocales() {
  if (isTranslating) return;

  isTranslating = true;
  console.log('CategoricalCreation: Starting translation for property:', property.key);

  try {
    const englishLabel = capitalizeKey(property.key);
    const englishPlaceholder = `Enter ${capitalizeKey(property.key)}`;

    // Prepare all texts to translate (label, placeholder, and property values)
    const textsToTranslate = [englishLabel, englishPlaceholder];

    // Add property values if this is a SelectField
    if (analysis.componentType === 'SelectField') {
      textsToTranslate.push(...analysis.uniqueValues);
    }

    console.log('CategoricalCreation: Translating texts:', textsToTranslate);

    // Translate to Traditional Chinese
    const zhHantResponse = await fetch('/api/translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'en',
        target: 'zh-hant',
        texts: textsToTranslate
      })
    });

    if (zhHantResponse.ok) {
      const translations = await zhHantResponse.json();
      const [zhHantLabel, zhHantPlaceholder, ...zhHantPropertyValues] = translations;

      translatedLabels['zh-hant'] = zhHantLabel;
      translatedPlaceholders['zh-hant'] = zhHantPlaceholder;

      // Store property value translations
      if (analysis.componentType === 'SelectField') {
        analysis.uniqueValues.forEach((value, index) => {
          if (!translatedPropertyValues[value]) {
            translatedPropertyValues[value] = {};
          }
          translatedPropertyValues[value]['zh-hant'] =
            zhHantPropertyValues[index] || value;
        });
      }

      console.log('CategoricalCreation: Translated to zh-hant:', {
        zhHantLabel,
        zhHantPlaceholder,
        propertyValues:
          analysis.componentType === 'SelectField' ? zhHantPropertyValues : 'N/A'
      });
    }

    // Translate to Simplified Chinese
    const zhHansResponse = await fetch('/api/translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'en',
        target: 'zh-hans',
        texts: textsToTranslate
      })
    });

    if (zhHansResponse.ok) {
      const translations = await zhHansResponse.json();
      const [zhHansLabel, zhHansPlaceholder, ...zhHansPropertyValues] = translations;

      translatedLabels['zh-hans'] = zhHansLabel;
      translatedPlaceholders['zh-hans'] = zhHansPlaceholder;

      // Store property value translations
      if (analysis.componentType === 'SelectField') {
        analysis.uniqueValues.forEach((value, index) => {
          if (!translatedPropertyValues[value]) {
            translatedPropertyValues[value] = {};
          }
          translatedPropertyValues[value]['zh-hans'] =
            zhHansPropertyValues[index] || value;
        });
      }

      console.log('CategoricalCreation: Translated to zh-hans:', {
        zhHansLabel,
        zhHansPlaceholder,
        propertyValues:
          analysis.componentType === 'SelectField' ? zhHansPropertyValues : 'N/A'
      });
    }
  } catch (error) {
    console.error('CategoricalCreation: Translation error:', error);
    // Continue without translations - the empty strings will be used
  } finally {
    isTranslating = false;
  }
}

// Load translations when component mounts
onMount(() => {
  translateToAllLocales();
});

// Auto-proceed for simple ToggleField scenarios (binary 0/1 or true/false)
$effect(() => {
  if (
    analysis.componentType === 'ToggleField' &&
    !hasAutoProceeded &&
    analysis.isNew &&
    !analysis.hasLocale
  ) {
    // Check if it's a simple binary case that doesn't need user input
    const isBinaryToggle =
      analysis.uniqueValues.length === 2 &&
      analysis.uniqueValues.sort().join(',') === '0,1';

    const isSingleBinaryValue =
      analysis.uniqueValues.length === 1 &&
      (analysis.uniqueValues[0] === '0' || analysis.uniqueValues[0] === '1');

    const isBooleanValues = analysis.uniqueValues.every((val) => {
      const lower = val.toLowerCase();
      return lower === 'true' || lower === 'false';
    });

    if (isBinaryToggle || isSingleBinaryValue || isBooleanValues) {
      console.log(
        'CategoricalCreation: Auto-proceeding for simple ToggleField scenario - will create property'
      );
      hasAutoProceeded = true;

      // Auto-proceed by submitting the form after a short delay to show the analysis
      setTimeout(async () => {
        console.log(
          'CategoricalCreation: Auto-submitting form for ToggleField property creation'
        );
        const fakeEvent = new Event('submit');
        await handleFormSubmit(fakeEvent);
      }, 1500);
    }
  }
});

// Auto-proceed for simple SelectField scenarios (small number of unique values)
$effect(() => {
  if (
    analysis.componentType === 'SelectField' &&
    !hasAutoProceeded &&
    analysis.isNew &&
    !analysis.hasLocale &&
    // Auto-proceed for small select fields that don't need user review
    analysis.uniqueValues.length <= 5
  ) {
    console.log(
      'CategoricalCreation: Auto-proceeding for simple SelectField scenario - will create property'
    );
    hasAutoProceeded = true;

    // Auto-proceed by submitting the form after a short delay to show the analysis
    setTimeout(async () => {
      console.log(
        'CategoricalCreation: Auto-submitting form for SelectField property creation'
      );
      const fakeEvent = new Event('submit');
      await handleFormSubmit(fakeEvent);
    }, 1500);
  }
});

// Form state
let isSubmitting = $state(false);
let formErrors = $state<Record<string, string>>({});
let hasAutoProceeded = $state(false);

async function handleFormSubmit(event: Event) {
  if (event) {
    event.preventDefault();
  }
  isSubmitting = true;
  formErrors = {};

  // Wait for translation to complete if still in progress
  if (isTranslating) {
    console.log('CategoricalCreation: Waiting for translations to complete...');
    // Wait for translation to finish
    while (isTranslating) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const data = formData;
  console.log('CategoricalCreation: Starting form submission');
  console.log('CategoricalCreation: Form data:', JSON.stringify(data, null, 2));

  try {
    importCtx.updatePropertyReconciliation({ isProcessing: true });

    console.log('CategoricalCreation: Sending POST request to /api/properties');
    const response = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'CategoricalCreation: API request failed:',
        response.status,
        response.statusText,
        errorText
      );
      throw new Error(`Failed to create property: ${response.statusText}`);
    }

    const createdProperty: Property = await response.json();
    console.log('CategoricalCreation: Property created successfully:', createdProperty);

    // Property values are now created as part of the property submission - no separate API call needed
    console.log('CategoricalCreation: Property values were created with the property');

    // Store the property ID and property value IDs as enriched data
    console.log(
      'CategoricalCreation: Storing enriched data for property key:',
      property.key
    );

    // For SelectField properties, also store property value mappings
    const enrichedData: any = {
      propertyId: createdProperty.id
    };

    if (analysis.componentType === 'SelectField' && createdProperty.values) {
      // Create mapping from CSV value to property value ID
      const valueMapping: Record<string, string> = {};
      analysis.uniqueValues.forEach((csvValue, index) => {
        const matchingPropertyValue = createdProperty.values?.find(
          (pv) => pv.i18n?.en?.value === csvValue
        );
        if (matchingPropertyValue) {
          valueMapping[csvValue] = matchingPropertyValue.id;
        }
      });
      enrichedData.propertyValueMapping = valueMapping;
      console.log('CategoricalCreation: Property value mapping:', valueMapping);
    }

    // For ToggleField properties, create boolean value mappings
    if (analysis.componentType === 'ToggleField' && createdProperty.values) {
      const valueMapping: Record<string, string> = {};
      createdProperty.values.forEach((pv) => {
        const booleanValue = pv.i18n?.en?.value;
        if (booleanValue === 'true' || booleanValue === 'false') {
          // Map both 'TRUE'/'FALSE' and 'true'/'false' to the same property value ID
          valueMapping[booleanValue.toUpperCase()] = pv.id;
          valueMapping[booleanValue.toLowerCase()] = pv.id;
        }
      });
      enrichedData.propertyValueMapping = valueMapping;
      console.log('CategoricalCreation: Boolean value mapping:', valueMapping);
    }

    console.log('CategoricalCreation: Final enriched data to store:', enrichedData);
    importCtx.setPropertyEnrichedData(property.key, enrichedData);

    // Verify storage immediately
    const storedData = importCtx.getPropertyEnrichedData(property.key);
    console.log('CategoricalCreation: Verified stored enriched data:', storedData);

    // Also verify it's in the reconciliation state
    const reconciliation = importCtx.getPropertyReconciliation();
    console.log(
      'CategoricalCreation: Reconciliation enrichedData size after storage:',
      reconciliation.enrichedData.size
    );
    console.log(
      'CategoricalCreation: All reconciliation keys after storage:',
      Array.from(reconciliation.enrichedData.keys())
    );
    const storedInReconciliation = reconciliation.enrichedData.get(property.key);
    console.log(
      'CategoricalCreation: Data stored in reconciliation for key:',
      property.key,
      storedInReconciliation
    );

    // Update app context with new property
    console.log('CategoricalCreation: Adding to app cache');
    appCtx.addToCache(FirstClassResource.property, createdProperty.id, createdProperty);

    console.log('CategoricalCreation: Completing action');
    importCtx.updatePropertyReconciliation({ isProcessing: false });
    onActionComplete();
  } catch (error) {
    console.error('Error creating property:', error);
    importCtx.updatePropertyReconciliation({ isProcessing: false });
    formErrors.general =
      error instanceof Error ? error.message : 'Unknown error occurred';
  } finally {
    isSubmitting = false;
  }
}

let isFormVisible = $state(true);
</script>

<div class="card bg-base-100 shadow-lg">
  <div class="card-body">
    <h3 class="card-title">
      {m.create_new_categorical_property()}
    </h3>

    <div class="mb-4">
      <div class="alert alert-info">
        <div class="flex flex-col">
          <div class="mb-2 font-semibold">
            {m.property_creation_details()}
          </div>
          <ul class="space-y-1 text-sm">
            <li><strong>{m.api_name()}:</strong> {property.key}</li>
            <li>
              <strong>{m.ui_name()}:</strong>
              {capitalizeKey(property.key)} (English)
            </li>
            <li><strong>{m.placeholder()}:</strong> Enter {property.key} (English)</li>
            <li><strong>{m.component_type()}:</strong> {analysis.componentType}</li>
            <li>
              <strong>{m.translatable()}:</strong>
              {analysis.hasLocale ? m.yes() : m.no()}
            </li>
            <li><strong>{m.rank()}:</strong> Auto-calculated</li>
            {#if analysis.componentType === 'RangeField'}
              <li><strong>{m.min_value()}:</strong> {formData.min}</li>
              <li><strong>{m.max_value()}:</strong> {formData.max}</li>
            {/if}
          </ul>
        </div>
      </div>
    </div>

    <div class="mb-4">
      <h4 class="mb-2 font-semibold">
        {#if analysis.componentType === 'SelectField'}
          {m.unique_values_to_create()} ({analysis.uniqueValues.length})
        {:else if analysis.componentType === 'ToggleField'}
          {m.boolean_values()}
        {:else if analysis.componentType === 'RangeField'}
          {m.numeric_range()}
        {/if}
      </h4>
      <div class="max-h-32 overflow-y-auto rounded bg-base-200 p-3">
        {#each analysis.uniqueValues.slice(0, 10) as value}
          <div class="border-b border-base-300 py-1 text-sm last:border-b-0">
            {value}
          </div>
        {/each}
        {#if analysis.uniqueValues.length > 10}
          <div class="pt-2 text-xs text-base-content/70">
            {m.and_more_values({ count: analysis.uniqueValues.length - 10 })}
          </div>
        {/if}
      </div>
    </div>

    {#if analysis.componentType === 'ToggleField'}
      <div class="alert alert-warning mb-4">
        <div>
          <h4 class="font-semibold">{m.toggle_field_notice()}</h4>
          <p class="text-sm">
            {m.toggle_field_description()}
          </p>
        </div>
      </div>
    {/if}

    {#if isFormVisible}
      <form method="POST" onsubmit={handleFormSubmit}>
        <div class="card-actions mt-6 justify-end">
          <button
            type="button"
            class="btn btn-ghost"
            onclick={() => (isFormVisible = false)}>
            {m.cancel()}
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={isSubmitting || isTranslating}>
            {#if isSubmitting}
              <span class="loading loading-spinner loading-sm"></span>
              {m.create_property()}
            {:else if isTranslating}
              <span class="loading loading-spinner loading-sm"></span>
              Translating...
            {:else}
              {m.create_property()}
            {/if}
          </button>
        </div>
      </form>
    {:else}
      <div class="card-actions justify-end">
        <button class="btn btn-ghost" onclick={() => (isFormVisible = true)}>
          {m.show_form()}
        </button>
        <button class="btn btn-primary" onclick={onActionComplete}>
          {m.skip()}
        </button>
      </div>
    {/if}

    {#if Object.keys(formErrors).length > 0}
      <div class="alert alert-error mt-4">
        <div>
          <h4 class="font-semibold">{m.form_errors()}</h4>
          <ul class="mt-2 text-sm">
            {#each Object.entries(formErrors) as [field, error]}
              <li>{field}: {error}</li>
            {/each}
          </ul>
        </div>
      </div>
    {/if}
  </div>
</div>
