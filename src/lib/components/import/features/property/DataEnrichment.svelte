<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
// I18N
import { m } from '$lib/i18n';
// TYPES
import type { CSVColumn, Locale } from '$lib/types';

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
const supportedLocales: Locale[] = ['en', 'zh-hans', 'zh-hant'];

let isProcessing = $state(false);
let progress = $state(0);
let currentStep = $state('');
let error = $state<string | null>(null);

onMount(() => {
  enrichData();
});

// Auto-proceed after enrichment completes
$effect(() => {
  if (!isProcessing && !error && progress === 100) {
    console.log('DataEnrichment: Auto-proceeding after successful enrichment');
    // Auto-proceed after a short delay to show completion
    setTimeout(() => {
      onActionComplete();
    }, 1000);
  }
});

async function enrichData() {
  isProcessing = true;
  error = null;

  try {
    const choice = importCtx.state.propertyReconciliation.translationChoices.get(
      property.key
    );
    if (!choice) {
      throw new Error('No translation choice found for property');
    }

    currentStep = m.analyzing_data();
    progress = 10;

    const data = importCtx.getData();
    const headers = importCtx.getHeaders();

    // Map columns to their indices and locales
    const columnMap = new Map<Locale, number>();
    property.columns.forEach((col) => {
      if (col.locale && col.locale !== 'None') {
        const colIndex = headers.indexOf(col.header);
        columnMap.set(col.locale as Locale, colIndex);
      }
    });

    currentStep = m.processing_rows();
    progress = 20;

    // Process each row and enrich with locale data
    const enrichedData = new Map<number, any>();

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const rowData: any = {};

      // Check if this row has any data for this property
      const hasAnyData = Array.from(columnMap.values()).some(
        (colIndex) => row[colIndex] && row[colIndex].trim()
      );

      if (!hasAnyData) continue;

      if (choice.mode === 'copy') {
        // Copy mode: find the first non-empty value and copy to all locales
        let sourceValue = '';

        // Try to get value from columns in order of preference
        for (const [locale, colIndex] of columnMap.entries()) {
          if (row[colIndex] && row[colIndex].trim()) {
            sourceValue = row[colIndex].trim();
            break;
          }
        }

        // Copy to all locales
        supportedLocales.forEach((locale) => {
          rowData[locale] = sourceValue;
        });
      } else if (choice.mode === 'translate') {
        // Translation mode: get source value and translate to missing locales
        const sourceLocale = choice.sourceLocale!;
        const sourceColIndex = columnMap.get(sourceLocale);

        if (
          sourceColIndex !== undefined &&
          row[sourceColIndex] &&
          row[sourceColIndex].trim()
        ) {
          const sourceValue = row[sourceColIndex].trim();
          rowData[sourceLocale] = sourceValue;

          // Check which locales are missing and need translation
          const missingLocales: Locale[] = [];
          supportedLocales.forEach((locale) => {
            if (locale !== sourceLocale) {
              const colIndex = columnMap.get(locale);
              if (colIndex === undefined || !row[colIndex] || !row[colIndex].trim()) {
                missingLocales.push(locale);
              } else {
                // Use existing value
                rowData[locale] = row[colIndex].trim();
              }
            }
          });

          // If we have missing locales, we'll need to translate
          if (missingLocales.length > 0) {
            // We'll collect these for batch translation
            rowData._needsTranslation = missingLocales as any;
            rowData._sourceValue = sourceValue as any;
            rowData._sourceLocale = sourceLocale as any;
          }
        } else {
          // No source value, try to find value in other locales
          for (const [locale, colIndex] of columnMap.entries()) {
            if (row[colIndex] && row[colIndex].trim()) {
              const fallbackValue = row[colIndex].trim();
              rowData[sourceLocale] = fallbackValue;

              // Mark for translation to other locales
              const otherLocales = supportedLocales.filter((l) => l !== locale);
              rowData._needsTranslation = otherLocales as any;
              rowData._sourceValue = fallbackValue as any;
              rowData._sourceLocale = locale as any;
              break;
            }
          }
        }
      }

      if (Object.keys(rowData).length > 0) {
        enrichedData.set(rowIndex, rowData);
      }
    }

    currentStep = m.preparing_translations();
    progress = 40;

    // Handle translations if needed
    if (choice.mode === 'translate') {
      await processTranslations(enrichedData);
    }

    currentStep = m.storing_enriched_data();
    progress = 90;

    // Store enriched data in import context
    const existingData = importCtx.getPropertyEnrichedData(property.key) || {};

    // Convert enriched data to translatedValues format - this is a simplified version
    // In a real implementation, this would need to handle the enriched data properly
    const translatedValues: Record<Locale, string> = {
      en: '',
      'zh-hant': '',
      'zh-hans': ''
    };

    importCtx.setPropertyEnrichedData(property.key, {
      ...existingData,
      translatedValues: translatedValues
    });

    progress = 100;
    currentStep = m.complete();

    setTimeout(() => {
      onActionComplete();
    }, 500);
  } catch (err) {
    console.error('Error enriching data:', err);
    error = err instanceof Error ? err.message : 'Unknown error occurred';
    isProcessing = false;
  }
}

async function processTranslations(enrichedData: Map<number, any>) {
  const translationBatches = new Map<
    string,
    {
      sourceLocale: Locale;
      targetLocale: Locale;
      texts: string[];
      rowIndices: number[];
    }
  >();

  // Group translation requests by source->target locale pairs
  enrichedData.forEach((rowData, rowIndex) => {
    if (rowData._needsTranslation && rowData._sourceValue && rowData._sourceLocale) {
      const sourceLocale = rowData._sourceLocale as Locale;
      const sourceValue = rowData._sourceValue as string;
      const targetLocales = rowData._needsTranslation as Locale[];

      targetLocales.forEach((targetLocale) => {
        const batchKey = `${sourceLocale}->${targetLocale}`;

        if (!translationBatches.has(batchKey)) {
          translationBatches.set(batchKey, {
            sourceLocale,
            targetLocale,
            texts: [],
            rowIndices: []
          });
        }

        const batch = translationBatches.get(batchKey)!;
        batch.texts.push(sourceValue);
        batch.rowIndices.push(rowIndex);
      });
    }
  });

  currentStep = m.translating_values();
  let batchIndex = 0;
  const totalBatches = translationBatches.size;

  // Process each translation batch
  for (const [batchKey, batch] of translationBatches.entries()) {
    try {
      currentStep = m.translating_batch({
        current: batchIndex + 1,
        total: totalBatches,
        from: batch.sourceLocale,
        to: batch.targetLocale
      });

      progress = 40 + (batchIndex / totalBatches) * 40;

      const response = await fetch('/api/translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: batch.sourceLocale,
          target: batch.targetLocale,
          texts: batch.texts
        })
      });

      if (!response.ok) {
        throw new Error(`Translation failed: ${response.statusText}`);
      }

      const translations: string[] = await response.json();

      // Apply translations back to enriched data
      batch.rowIndices.forEach((rowIndex, textIndex) => {
        const rowData = enrichedData.get(rowIndex);
        if (rowData && translations[textIndex]) {
          rowData[batch.targetLocale] = translations[textIndex];
        }
      });

      batchIndex++;
    } catch (err) {
      console.error(`Translation batch failed for ${batchKey}:`, err);
      // Continue with other batches but log the error
    }
  }

  // Clean up translation metadata
  enrichedData.forEach((rowData) => {
    delete (rowData as any)._needsTranslation;
    delete (rowData as any)._sourceValue;
    delete (rowData as any)._sourceLocale;
  });
}
</script>

<div class="card bg-base-100 shadow-lg">
  <div class="card-body">
    <h3 class="card-title">
      {m.enriching_property_data({ key: property.key })}
    </h3>

    {#if error}
      <div class="alert alert-error">
        <div>
          <h4 class="font-semibold">{m.enrichment_error()}</h4>
          <p>{error}</p>
        </div>
      </div>

      <div class="card-actions mt-4 justify-end">
        <button class="btn btn-ghost" onclick={() => (error = null)}>
          {m.retry()}
        </button>
        <button class="btn btn-primary" onclick={onActionComplete}>
          {m.skip()}
        </button>
      </div>
    {:else if isProcessing}
      <div class="space-y-4">
        <div>
          <div class="mb-2 flex justify-between text-sm">
            <span>{currentStep}</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <progress class="progress progress-primary w-full" value={progress} max="100"
          ></progress>
        </div>

        <div class="text-center text-base-content/70">
          <span class="loading loading-spinner loading-sm mr-2"></span>
          {m.please_wait()}
        </div>
      </div>
    {:else}
      <div class="text-center">
        <div class="mb-2 text-lg font-semibold text-success">
          ✓ {m.enrichment_complete()}
        </div>
        <p class="text-base-content/70">
          {m.data_has_been_processed()}
        </p>
      </div>
    {/if}
  </div>
</div>
