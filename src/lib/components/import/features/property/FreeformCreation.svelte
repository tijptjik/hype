<script lang="ts">
// SVELTE
import { createEventDispatcher, onMount } from 'svelte';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
import { getAppCtx } from '$lib/context/app.svelte';
// COMPONENTS
import PropertyFields from '$lib/components/forms/fields/Property.svelte';
// I18N
import { m } from '$lib/i18n';
// LIB
import { customAlphabet } from 'nanoid';
// TYPES
import type { CSVColumn, PropertyNew, Property, Id } from '$lib/types';
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
const dispatch = createEventDispatcher();

// Analyze the CSV data to determine component type
let componentType = $derived.by(() => {
  const sampleValues = property.columns[0]?.sampleValues || [];

  // Check if less than 5% of values are over 48 characters
  const longValues = sampleValues.filter((val) => val && val.length > 48);
  const longValuePercentage = longValues.length / sampleValues.length;

  return longValuePercentage < 0.05 ? 'InputField' : 'TextareaField';
});

// Determine if translatable based on scenario
let isTranslatable = $derived(property.scenario === 5); // Scenario 5 = translatable

// Property count is now handled by the API

// Translation state
let translatedLabels = $state<Record<string, string>>({});
let translatedPlaceholders = $state<Record<string, string>>({});
let isTranslating = $state(false);

// Generate stable property ID
let propertyId = $state(nanoid());

// Create form data for property creation
let formData = $derived.by(() => {
  const englishLabel = capitalizeKey(property.key);
  const englishPlaceholder = `Enter ${capitalizeKey(property.key)}`;

  return {
    id: propertyId,
    projectId: importCtx.getSelectedProject()?.id || '',
    type: 'specifier' as const,
    key: property.key,
    rank: 0, // Will be calculated properly by the API
    component: componentType as 'InputField' | 'TextareaField',
    isTranslatable: isTranslatable,
    values: null,
    min: null,
    max: null,
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
});

function capitalizeKey(key: string): string {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

// Translation function
async function translateToAllLocales() {
  if (isTranslating) return;

  isTranslating = true;
  console.log('FreeformCreation: Starting translation for property:', property.key);

  try {
    const englishLabel = capitalizeKey(property.key);
    const englishPlaceholder = `Enter ${capitalizeKey(property.key)}`;

    // Translate to Traditional Chinese
    const zhHantResponse = await fetch('/api/translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'en',
        target: 'zh-hant',
        texts: [englishLabel, englishPlaceholder]
      })
    });

    if (zhHantResponse.ok) {
      const [zhHantLabel, zhHantPlaceholder] = await zhHantResponse.json();
      translatedLabels['zh-hant'] = zhHantLabel;
      translatedPlaceholders['zh-hant'] = zhHantPlaceholder;
      console.log('FreeformCreation: Translated to zh-hant:', {
        zhHantLabel,
        zhHantPlaceholder
      });
    }

    // Translate to Simplified Chinese
    const zhHansResponse = await fetch('/api/translation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'en',
        target: 'zh-hans',
        texts: [englishLabel, englishPlaceholder]
      })
    });

    if (zhHansResponse.ok) {
      const [zhHansLabel, zhHansPlaceholder] = await zhHansResponse.json();
      translatedLabels['zh-hans'] = zhHansLabel;
      translatedPlaceholders['zh-hans'] = zhHansPlaceholder;
      console.log('FreeformCreation: Translated to zh-hans:', {
        zhHansLabel,
        zhHansPlaceholder
      });
    }
  } catch (error) {
    console.error('FreeformCreation: Translation error:', error);
    // Continue without translations - the empty strings will be used
  } finally {
    isTranslating = false;
  }
}

// Load translations when component mounts
onMount(() => {
  translateToAllLocales();
});

// Auto-proceed for simple freeform scenarios
let hasAutoProceeded = $state(false);

$effect(() => {
  if (
    !hasAutoProceeded &&
    !isSubmitting &&
    !isTranslating &&
    // Auto-proceed for simple cases that don't need user review
    componentType === 'InputField' &&
    !isTranslatable
  ) {
    console.log(
      'FreeformCreation: Auto-proceeding for simple InputField scenario - will create property'
    );
    hasAutoProceeded = true;

    // Auto-proceed by submitting the form after a short delay to show the form
    setTimeout(async () => {
      console.log(
        'FreeformCreation: Auto-submitting form for simple freeform property creation'
      );
      const fakeEvent = new Event('submit');
      await handleFormSubmit(fakeEvent);
    }, 1500);
  }
});

// Form state
let isSubmitting = $state(false);
let formErrors = $state<Record<string, string>>({});

async function handleFormSubmit(event: Event) {
  event.preventDefault();
  isSubmitting = true;
  formErrors = {};

  // Wait for translation to complete if still in progress
  if (isTranslating) {
    console.log('FreeformCreation: Waiting for translations to complete...');
    // Wait for translation to finish
    while (isTranslating) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const data = formData;
  console.log('FreeformCreation: Starting form submission');
  console.log('FreeformCreation: Form data:', JSON.stringify(data, null, 2));

  try {
    importCtx.updatePropertyReconciliation({ isProcessing: true });

    console.log('FreeformCreation: Sending POST request to /api/properties');
    const response = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        'FreeformCreation: API request failed:',
        response.status,
        response.statusText,
        errorText
      );
      throw new Error(`Failed to create property: ${response.statusText}`);
    }

    const createdProperty: Property = await response.json();
    console.log('FreeformCreation: Property created successfully:', createdProperty);

    // Store the property ID as enriched data for this property key
    console.log(
      'FreeformCreation: Storing enriched data for property key:',
      property.key
    );
    importCtx.setPropertyEnrichedData(property.key, {
      propertyId: createdProperty.id
    });

    // Update app context with new property
    console.log('FreeformCreation: Adding to app cache');
    appCtx.addToCache(FirstClassResource.property, createdProperty.id, createdProperty);

    console.log('FreeformCreation: Completing action');
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
      {m.create_new_freeform_property()}
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
            <li><strong>{m.component_type()}:</strong> {componentType}</li>
            <li>
              <strong>{m.translatable()}:</strong>
              {isTranslatable ? m.yes() : m.no()}
            </li>
            <li><strong>{m.rank()}:</strong> Auto-calculated</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="mb-4">
      <h4 class="mb-2 font-semibold">{m.sample_values()}</h4>
      <div class="max-h-32 overflow-y-auto rounded bg-base-200 p-3">
        {#each property.columns[0]?.sampleValues.slice(0, 10) || [] as value}
          <div class="border-b border-base-300 py-1 text-sm last:border-b-0">
            {value || m.empty_value()}
          </div>
        {/each}
      </div>
    </div>

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
