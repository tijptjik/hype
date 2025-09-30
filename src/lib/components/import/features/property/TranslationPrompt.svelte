<script lang="ts">
// SVELTE
import { createEventDispatcher } from 'svelte';
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
const dispatch = createEventDispatcher();

// Analyze the data to understand locale coverage
let localeAnalysis = $derived.by(() => {
  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Get column indices for this property key
  const propertyColumns = property.columns.map((col) => {
    const index = headers.indexOf(col.header);
    return { column: col, index, locale: col.locale };
  });

  // Count non-empty values per locale
  const localeCounts: Record<string, number> = {};
  const localeColumns: Record<string, number> = {};

  propertyColumns.forEach(({ column, index, locale }) => {
    if (locale && locale !== 'None') {
      localeCounts[locale] = 0;
      localeColumns[locale] = index;

      data.forEach((row) => {
        if (row[index] && row[index].trim()) {
          localeCounts[locale]++;
        }
      });
    }
  });

  // Find the locale with the most data
  const sourceLocale =
    (Object.entries(localeCounts).sort(([, a], [, b]) => b - a)[0]?.[0] as Locale) ||
    'en';

  return {
    localeCounts,
    localeColumns,
    sourceLocale,
    hasCompleteData: checkDataCompleteness(data, localeColumns)
  };
});

function checkDataCompleteness(
  data: string[][],
  localeColumns: Record<string, number>
): boolean {
  const locales = Object.keys(localeColumns);
  if (locales.length < 2) return true; // Single locale, no issue

  // Check if rows with data in any locale have data in all locales
  for (const row of data) {
    const hasAnyData = locales.some((locale) => {
      const colIndex = localeColumns[locale];
      return row[colIndex] && row[colIndex].trim();
    });

    if (hasAnyData) {
      const hasAllData = locales.every((locale) => {
        const colIndex = localeColumns[locale];
        return row[colIndex] && row[colIndex].trim();
      });

      if (!hasAllData) {
        return false; // Found incomplete data
      }
    }
  }

  return true;
}

// Get sample values for display
let sampleValues = $derived.by(() => {
  const data = importCtx.getData();
  const headers = importCtx.getHeaders();

  // Get all unique non-empty values from all locale columns
  const allValues = new Set<string>();

  property.columns.forEach((col) => {
    const colIndex = headers.indexOf(col.header);
    data.forEach((row) => {
      if (row[colIndex] && row[colIndex].trim()) {
        allValues.add(row[colIndex].trim());
      }
    });
  });

  return Array.from(allValues).slice(0, 10);
});

// Form state
let translationChoice = $state<'translate' | 'copy'>('translate');
let selectedSourceLocale = $state<Locale>(localeAnalysis.sourceLocale);
let isProcessing = $state(false);

function handleAccept() {
  // Store the choice for this property
  importCtx.state.propertyReconciliation.translationChoices.set(property.key, {
    mode: translationChoice,
    sourceLocale: selectedSourceLocale
  });

  onActionComplete();
}
</script>

<div class="card bg-base-100 shadow-lg">
  <div class="card-body">
    <h3 class="card-title">
      {m.translation_options_for_property({ key: property.key })}
    </h3>

    <div class="mb-4">
      <div class="alert alert-info">
        <div>
          <div class="mb-2 font-semibold">
            {m.locale_analysis()}
          </div>
          <div class="space-y-1 text-sm">
            {#each Object.entries(localeAnalysis.localeCounts) as [locale, count]}
              <div>
                <strong>{locale}:</strong>
                {count}
                {m.non_empty_values()}
              </div>
            {/each}
          </div>
          {#if !localeAnalysis.hasCompleteData}
            <div class="mt-2 text-sm text-warning">
              ⚠️ {m.incomplete_locale_data_warning()}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <div class="mb-4">
      <h4 class="mb-2 font-semibold">{m.sample_values()}</h4>
      <div class="max-h-32 overflow-y-auto rounded bg-base-200 p-3">
        {#each sampleValues as value}
          <div class="border-b border-base-300 py-1 text-sm last:border-b-0">
            {value}
          </div>
        {/each}
      </div>
    </div>

    <div class="form-control mb-4">
      <label class="label">
        <span class="label-text font-semibold">{m.translation_method()}</span>
      </label>

      <div class="space-y-2">
        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="radio"
            bind:group={translationChoice}
            value="translate"
            class="radio-primary radio" />
          <div>
            <div class="font-medium">{m.translate_values()}</div>
            <div class="text-sm text-base-content/70">
              {m.translate_values_description()}
            </div>
          </div>
        </label>

        <label class="label cursor-pointer justify-start gap-3">
          <input
            type="radio"
            bind:group={translationChoice}
            value="copy"
            class="radio-primary radio" />
          <div>
            <div class="font-medium">{m.copy_values()}</div>
            <div class="text-sm text-base-content/70">
              {m.copy_values_description()}
            </div>
          </div>
        </label>
      </div>
    </div>

    {#if translationChoice === 'translate'}
      <div class="form-control mb-4">
        <label class="label">
          <span class="label-text">{m.source_language()}</span>
        </label>
        <select class="select select-bordered w-full" bind:value={selectedSourceLocale}>
          {#each Object.entries(localeAnalysis.localeCounts) as [locale, count]}
            <option value={locale}>
              {locale} ({count}
              {m.values()})
            </option>
          {/each}
        </select>
        <label class="label">
          <span class="label-text-alt">
            {m.source_language_help()}
          </span>
        </label>
      </div>
    {/if}

    <div class="card-actions justify-end">
      <button class="btn btn-primary" onclick={handleAccept} disabled={isProcessing}>
        {#if isProcessing}
          <span class="loading loading-spinner loading-sm"></span>
        {/if}
        {m.accept()}
      </button>
    </div>
  </div>
</div>
