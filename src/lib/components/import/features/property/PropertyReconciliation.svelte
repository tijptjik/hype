<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
// COMPONENTS
import FreeformCreation from './FreeformCreation.svelte';
import TranslationPrompt from './TranslationPrompt.svelte';
import DataEnrichment from './DataEnrichment.svelte';
import ValueMatching from './ValueMatching.svelte';
import RangeValidation from './RangeValidation.svelte';
import CategoricalCreation from './CategoricalCreation.svelte';
// SERVICES
import { enrichFeaturesWithPropertyData } from '$lib/client/services/import/features/property';
// I18N
import { m } from '$lib/i18n';
// TYPES
import type { CSVColumn, FieldDiscriminator, Locale } from '$lib/types';

const importCtx = getImportCtx();
const state = importCtx.state;

console.log('🔧 PropertyReconciliation: Component mounted/initialized');

// Derive property columns that need processing
let propertyColumns = $derived.by(() => {
  const columns = state.columns.filter(
    (col) => col.modelType === 'Property' && col.field === 'value' && col.propertyKey
  );
  console.log('🔧 PropertyReconciliation: Found property columns:', columns.length);
  console.log(
    '🔧 PropertyReconciliation: Property columns:',
    columns.map((c) => ({
      header: c.header,
      modelType: c.modelType,
      field: c.field,
      locale: c.locale,
      propertyKey: c.propertyKey,
      propertyType: c.propertyType
    }))
  );
  return columns;
});

// Group columns by actual property key for processing
// For NEW properties, use extractedPropertyKey; for existing, use propertyKey
let propertyGroups = $derived.by(() => {
  const groups = new Map<string, CSVColumn[]>();
  propertyColumns.forEach((col) => {
    // Get the actual property key
    const actualKey =
      col.propertyKey === 'NEW' ? col.extractedPropertyKey : col.propertyKey;
    if (actualKey) {
      if (!groups.has(actualKey)) {
        groups.set(actualKey, []);
      }
      groups.get(actualKey)!.push(col);
    }
  });
  return groups;
});

// Categorize property groups by scenario
let scenarios = $derived.by(() => {
  const categorized = {
    scenario1: [] as string[], // locale defined, NEW, categorical
    scenario2: [] as string[], // locale NONE, NEW, categorical
    scenario3: [] as string[], // locale defined, MATCHED, categorical
    scenario4: [] as string[], // locale NONE, MATCHED, categorical
    scenario5: [] as string[], // locale defined, NEW, freeform
    scenario6: [] as string[], // locale NONE, NEW, freeform
    scenario7: [] as string[], // locale defined, MATCHED, freeform
    scenario8: [] as string[] // locale NONE, MATCHED, freeform
  };

  propertyGroups.forEach((columns, key) => {
    const firstCol = columns[0];
    const hasLocale = firstCol.locale && firstCol.locale !== 'None';
    const isNew = firstCol.propertyKey === 'NEW';
    const isCategorical = firstCol.propertyType === 'classifier';

    console.log(`PropertyReconciliation: Categorizing property "${key}":`, {
      hasLocale,
      isNew,
      isCategorical,
      locale: firstCol.locale,
      propertyKey: firstCol.propertyKey,
      propertyType: firstCol.propertyType
    });

    if (hasLocale && isNew && isCategorical) {
      categorized.scenario1.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 1 (locale + NEW + categorical)`
      );
    } else if (!hasLocale && isNew && isCategorical) {
      categorized.scenario2.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 2 (no locale + NEW + categorical) - SHOULD BE TOGGLE/RANGE`
      );
    } else if (hasLocale && !isNew && isCategorical) {
      categorized.scenario3.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 3 (locale + MATCHED + categorical)`
      );
    } else if (!hasLocale && !isNew && isCategorical) {
      categorized.scenario4.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 4 (no locale + MATCHED + categorical) - VALUE MATCHING`
      );
    } else if (hasLocale && isNew && !isCategorical) {
      categorized.scenario5.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 5 (locale + NEW + freeform)`
      );
    } else if (!hasLocale && isNew && !isCategorical) {
      categorized.scenario6.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 6 (no locale + NEW + freeform)`
      );
    } else if (hasLocale && !isNew && !isCategorical) {
      categorized.scenario7.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 7 (locale + MATCHED + freeform)`
      );
    } else if (!hasLocale && !isNew && !isCategorical) {
      categorized.scenario8.push(key);
      console.log(
        `PropertyReconciliation: "${key}" -> Scenario 8 (no locale + MATCHED + freeform)`
      );
    }
  });

  return categorized;
});

// Processing order based on specification
let processingOrder = $derived.by(() => {
  return [
    // Scenario 8: No steps required, skip (excluded from processing)
    // Scenarios 5,6: Create new freeform properties (Action A)
    ...scenarios.scenario5,
    ...scenarios.scenario6,
    // Scenario 7: Translation prompt for existing freeform properties (Action B)
    ...scenarios.scenario7,
    // Scenario 3: Match values for existing categorical properties with locale (Action D)
    ...scenarios.scenario3,
    // Scenario 4: Match values for existing categorical properties without locale (Action D)
    ...scenarios.scenario4,
    // Scenario 1: Add new categorical properties and values (Action F)
    ...scenarios.scenario1,
    // Scenario 2: Add new categorical properties (toggle/range) (Action G)
    ...scenarios.scenario2
  ];
});

// Initialize processing
onMount(() => {
  initializeProcessing();
});

function initializeProcessing() {
  const recon = state.propertyReconciliation;

  // Check scenario 8 properties to ensure they actually have valid property IDs
  console.log(
    'PropertyReconciliation: Checking scenario 8 properties for valid IDs...'
  );
  const invalidScenario8Properties: string[] = [];

  scenarios.scenario8.forEach((key) => {
    const enrichedData = recon.enrichedData.get(key);
    const hasValidPropertyId =
      enrichedData?.propertyId && enrichedData.propertyId.trim() !== '';

    console.log(`PropertyReconciliation: Scenario 8 property "${key}":`, {
      hasEnrichedData: !!enrichedData,
      propertyId: enrichedData?.propertyId,
      hasValidPropertyId
    });

    if (!hasValidPropertyId) {
      console.warn(
        `PropertyReconciliation: Scenario 8 property "${key}" lacks valid propertyId - moving to processing queue`
      );
      invalidScenario8Properties.push(key);
    }
  });

  // Only skip scenario 8 properties that have valid property IDs
  const validScenario8Properties = scenarios.scenario8.filter(
    (key) => !invalidScenario8Properties.includes(key)
  );
  const toProcess = [
    ...processingOrder.filter((key) => !validScenario8Properties.includes(key)),
    ...invalidScenario8Properties
  ];

  console.log('PropertyReconciliation: Initializing processing');
  console.log('PropertyReconciliation: Processing order:', processingOrder);
  console.log(
    'PropertyReconciliation: Valid scenario 8 (skipped):',
    validScenario8Properties
  );
  console.log(
    'PropertyReconciliation: Invalid scenario 8 (moved to processing):',
    invalidScenario8Properties
  );
  console.log('PropertyReconciliation: Final processing queue:', toProcess);

  importCtx.updatePropertyReconciliation({
    pendingProperties: toProcess,
    currentPropertyIndex: 0,
    currentAction: 'none'
  });

  if (toProcess.length > 0) {
    console.log('PropertyReconciliation: Starting property processing');
    processNextProperty();
  } else {
    console.log(
      'PropertyReconciliation: No properties to process, enriching feature data and moving to translation step'
    );

    try {
      enrichFeaturesWithPropertyData(importCtx);
      console.log(
        'PropertyReconciliation: Property enrichment completed (no properties case)'
      );
    } catch (error) {
      console.error(
        'PropertyReconciliation: Error during property enrichment (no properties case):',
        error
      );
    }

    // All done, move to next step
    importCtx.setCurrentStep('translation');
  }
}

function processNextProperty() {
  console.log('PropertyReconciliation: processNextProperty called');
  const recon = state.propertyReconciliation;
  const currentKey = recon.pendingProperties[recon.currentPropertyIndex];

  console.log(
    'PropertyReconciliation: Current key:',
    currentKey,
    'at index:',
    recon.currentPropertyIndex
  );
  console.log('PropertyReconciliation: Pending properties:', recon.pendingProperties);

  if (!currentKey) {
    // All properties processed - now enrich feature data with property information
    console.log(
      'PropertyReconciliation: All properties processed, enriching feature data with property information'
    );

    // Validate that all properties have valid IDs before proceeding
    console.log('PropertyReconciliation: Validating all properties have valid IDs...');
    const recon = importCtx.getPropertyReconciliation();
    const invalidProperties: string[] = [];

    for (const [key, data] of recon.enrichedData.entries()) {
      if (!data.propertyId || data.propertyId.trim() === '') {
        invalidProperties.push(key);
        console.error(
          `PropertyReconciliation: Property "${key}" has invalid propertyId:`,
          data.propertyId
        );
      }
    }

    if (invalidProperties.length > 0) {
      console.error(
        'PropertyReconciliation: FATAL ERROR - Some properties lack valid propertyId values:',
        invalidProperties
      );
      console.error(
        'PropertyReconciliation: This will cause foreign key constraint errors during feature submission'
      );

      // Force re-processing of invalid properties
      const pendingProperties = importCtx.getPropertyReconciliation().pendingProperties;
      const newPendingProperties = [...pendingProperties, ...invalidProperties];

      importCtx.updatePropertyReconciliation({
        pendingProperties: newPendingProperties,
        currentPropertyIndex: pendingProperties.length, // Start from the invalid properties
        currentAction: 'none'
      });

      console.log(
        'PropertyReconciliation: Re-queuing invalid properties for processing:',
        invalidProperties
      );
      return; // Don't proceed to next step
    }

    try {
      enrichFeaturesWithPropertyData(importCtx);
      console.log(
        'PropertyReconciliation: Property enrichment completed, moving to translation step'
      );
    } catch (error) {
      console.error('PropertyReconciliation: Error during property enrichment:', error);
    }

    importCtx.setCurrentStep('translation');
    return;
  }

  // Determine action based on scenario
  let action: typeof recon.currentAction = 'none';

  // Check if this is a formerly Scenario 8 property that was moved to processing due to missing propertyId
  const isInvalidScenario8 = scenarios.scenario8.includes(currentKey);

  if (isInvalidScenario8) {
    console.log(
      `PropertyReconciliation: Processing invalid Scenario 8 property "${currentKey}" - treating as new categorical property`
    );
    action = 'categorical-creation';
  } else if (
    scenarios.scenario5.includes(currentKey) ||
    scenarios.scenario6.includes(currentKey)
  ) {
    action = 'freeform-creation';
  } else if (scenarios.scenario7.includes(currentKey)) {
    // Check if translation prompt is needed
    const columns = propertyGroups.get(currentKey) || [];
    const hasMultipleLocales = hasCompleteLocaleSet(columns);

    // Check if we already have a translation choice
    const hasChoice = state.propertyReconciliation.translationChoices.has(currentKey);

    if (hasMultipleLocales && !hasChoice) {
      action = 'translation-prompt';
    } else if (hasMultipleLocales && hasChoice) {
      action = 'data-enrichment';
    } else {
      action = 'freeform-creation';
    }
  } else if (scenarios.scenario3.includes(currentKey)) {
    action = 'value-matching';
  } else if (scenarios.scenario4.includes(currentKey)) {
    action = 'value-matching';
  } else if (
    scenarios.scenario1.includes(currentKey) ||
    scenarios.scenario2.includes(currentKey)
  ) {
    action = 'categorical-creation';
  }

  console.log('PropertyReconciliation: Setting action for', currentKey, 'to:', action);
  importCtx.updatePropertyReconciliation({ currentAction: action });
}

// Helper function to check if property has complete locale set
function hasCompleteLocaleSet(columns: CSVColumn[]) {
  const supportedLocales: Locale[] = ['en', 'zh-hans', 'zh-hant'];
  const columnLocales = new Set(columns.map((col) => col.locale).filter(Boolean));

  // Check if we have all locales AND if rows with data in any locale have data in all locales
  if (columnLocales.size < supportedLocales.length) return false;

  // TODO: Check data completeness across locales for rows
  return true;
}

function onActionComplete() {
  console.log('PropertyReconciliation: onActionComplete called');
  const recon = state.propertyReconciliation;
  const nextIndex = recon.currentPropertyIndex + 1;

  console.log(
    'PropertyReconciliation: Moving from index',
    recon.currentPropertyIndex,
    'to',
    nextIndex
  );

  importCtx.updatePropertyReconciliation({
    currentPropertyIndex: nextIndex,
    currentAction: 'none'
  });

  processNextProperty();
}

// Get current property data
let currentProperty = $derived.by(() => {
  const recon = state.propertyReconciliation;
  const currentKey = recon.pendingProperties[recon.currentPropertyIndex];
  if (!currentKey) return null;

  const property = {
    key: currentKey,
    columns: propertyGroups.get(currentKey) || [],
    scenario: getScenarioForKey(currentKey)
  };

  console.log('PropertyReconciliation: Current property derived:', property);
  console.log('PropertyReconciliation: Current action:', recon.currentAction);

  return property;
});

function getScenarioForKey(key: string): number {
  if (scenarios.scenario1.includes(key)) return 1;
  if (scenarios.scenario2.includes(key)) return 2;
  if (scenarios.scenario3.includes(key)) return 3;
  if (scenarios.scenario4.includes(key)) return 4;
  if (scenarios.scenario5.includes(key)) return 5;
  if (scenarios.scenario6.includes(key)) return 6;
  if (scenarios.scenario7.includes(key)) return 7;
  if (scenarios.scenario8.includes(key)) return 8;
  return 0;
}
</script>

<div class="mx-auto w-full max-w-4xl p-6">
  <div class="mb-6">
    <h2 class="mb-2 text-2xl font-bold">
      {m.property_reconciliation_title()}
    </h2>
    <p class="text-base-content/70">
      {m.property_reconciliation_description()}
    </p>
  </div>

  {#if state.propertyReconciliation.isProcessing}
    <div class="flex items-center justify-center p-8">
      <span class="loading loading-spinner loading-lg"></span>
      <span class="ml-3 text-lg">{m.processing()}...</span>
    </div>
  {:else if currentProperty}
    <div class="mb-4">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-lg font-semibold">
          {m.processing_property()}
          {currentProperty.key}
        </h3>
        <div class="text-sm text-base-content/70">
          {state.propertyReconciliation.currentPropertyIndex + 1} / {state
            .propertyReconciliation.pendingProperties.length}
        </div>
      </div>

      <div class="mb-4 rounded-lg bg-base-200 p-4">
        <div class="mb-2 text-sm text-base-content/70">
          {m.scenario()}: {currentProperty.scenario}
        </div>
        <div class="text-sm">
          {m.columns()}: {currentProperty.columns.map((col) => col.header).join(', ')}
        </div>
      </div>
    </div>

    {#if state.propertyReconciliation.currentAction === 'freeform-creation'}
      <FreeformCreation property={currentProperty} {onActionComplete} />
    {:else if state.propertyReconciliation.currentAction === 'translation-prompt'}
      <TranslationPrompt property={currentProperty} {onActionComplete} />
    {:else if state.propertyReconciliation.currentAction === 'data-enrichment'}
      <DataEnrichment property={currentProperty} {onActionComplete} />
    {:else if state.propertyReconciliation.currentAction === 'value-matching'}
      <ValueMatching property={currentProperty} {onActionComplete} />
    {:else if state.propertyReconciliation.currentAction === 'range-validation'}
      <RangeValidation property={currentProperty} {onActionComplete} />
    {:else if state.propertyReconciliation.currentAction === 'categorical-creation'}
      <CategoricalCreation property={currentProperty} {onActionComplete} />
    {/if}
  {:else}
    <div class="p-8 text-center">
      <div class="mb-2 text-lg font-semibold text-success">
        {m.property_reconciliation_complete()}
      </div>
      <p class="text-base-content/70">
        {m.proceeding_to_next_step()}
      </p>
    </div>
  {/if}
</div>
