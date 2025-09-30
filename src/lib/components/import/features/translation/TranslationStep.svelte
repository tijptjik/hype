<script lang="ts">
// SVELTE
import { onMount } from 'svelte';
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte';
// I18N
import { m } from '$lib/i18n';
// TYPES
import type { CSVColumn, Locale } from '$lib/types';

const importCtx = getImportCtx();

// Translation state
let isTranslating = $state(false);
let currentBatch = $state(0);
let totalBatches = $state(0);
let translationProgress = $state({ completed: 0, total: 0 });

// Translation scenarios
type TranslationScenario = {
  rowIndex: number;
  scenario: 1 | 2 | 3; // 1: single locale, 2: zh-hant+zh-hans, 3: en + one chinese
  sourceLocale: Locale;
  targetLocales: Locale[];
  sourceText: string;
  missingLocales: Locale[];
  field: 'title' | 'description'; // Track which field this is for
};

let translationScenarios = $state<TranslationScenario[]>([]);
let translationResults = $state<Map<number, Record<Locale, string>>>(new Map());

// Get title and description columns
let titleColumns = $derived.by(() => {
  const columns = importCtx
    .getColumns()
    .filter((col) => col.modelType === 'Feature' && col.field === 'title');
  return columns;
});

let descriptionColumns = $derived.by(() => {
  const columns = importCtx
    .getColumns()
    .filter((col) => col.modelType === 'Feature' && col.field === 'description');
  return columns;
});

// Combined columns for analysis
let translationColumns = $derived([...titleColumns, ...descriptionColumns]);

// Analyze data for translation needs
onMount(() => {
  analyzeTranslationNeeds();

  // Auto-start translation after analysis
  setTimeout(() => {
    if (!isTranslating && translationScenarios.length > 0) {
      console.log('🚀 Auto-starting translation process');
      startTranslation();
    } else if (!isTranslating) {
      console.log('📋 No translation needed, proceeding to next step');
      proceedToNextStep();
    }
  }, 500); // Small delay to ensure analysis is complete
});

function analyzeTranslationNeeds() {
  const data = importCtx.getData();
  const headers = importCtx.getHeaders();
  const scenarios: TranslationScenario[] = [];

  // Process both title and description fields
  const fieldAnalysis = [
    { field: 'title' as const, columns: titleColumns, required: true },
    { field: 'description' as const, columns: descriptionColumns, required: false }
  ];

  fieldAnalysis.forEach(({ field, columns, required }) => {
    if (columns.length === 0) {
      return;
    }

    // Create map of locale to column index for this field
    const localeToColumnIndex = new Map<Locale, number>();
    columns.forEach((col) => {
      const columnIndex = headers.findIndex((h) => h === col.header);
      if (columnIndex !== -1 && col.locale) {
        localeToColumnIndex.set(col.locale as Locale, columnIndex);
      }
    });

    // Analyze each row for this field
    data.forEach((row, index) => {
      const rowValues: Partial<Record<Locale, string>> = {};

      // Extract values for each locale
      localeToColumnIndex.forEach((columnIndex, locale) => {
        const value = row[columnIndex]?.trim();
        if (value) {
          rowValues[locale] = value;
        }
      });

      const availableLocales = Object.keys(rowValues) as Locale[];
      const localeCount = availableLocales.length;

      // For description fields, skip rows with no values (optional field)
      if (!required && localeCount === 0) {
        return; // Skip this row for optional fields with no data
      }

      if (localeCount === 1) {
        // Scenario 1: Only one locale specified
        const sourceLocale = availableLocales[0];
        const targetLocales: Locale[] = ['en', 'zh-hant', 'zh-hans'].filter(
          (l) => l !== sourceLocale
        ) as Locale[];

        scenarios.push({
          rowIndex: index,
          scenario: 1,
          sourceLocale,
          targetLocales,
          sourceText: rowValues[sourceLocale]!,
          missingLocales: targetLocales,
          field
        });
      } else if (localeCount === 2) {
        // Determine scenario based on which locales are present
        const hasEn = availableLocales.includes('en');
        const hasZhHant = availableLocales.includes('zh-hant');
        const hasZhHans = availableLocales.includes('zh-hans');

        if (hasZhHant && hasZhHans && !hasEn) {
          // Scenario 2: zh-hant + zh-hans, translate zh-hant to english
          scenarios.push({
            rowIndex: index,
            scenario: 2,
            sourceLocale: 'zh-hant',
            targetLocales: ['en'],
            sourceText: rowValues['zh-hant']!,
            missingLocales: ['en'],
            field
          });
        } else if (hasEn && (hasZhHant || hasZhHans)) {
          // Scenario 3: english + one chinese, translate chinese to missing chinese
          const chineseLocale = hasZhHant ? 'zh-hant' : 'zh-hans';
          const missingChinese = hasZhHant ? 'zh-hans' : 'zh-hant';

          scenarios.push({
            rowIndex: index,
            scenario: 3,
            sourceLocale: chineseLocale,
            targetLocales: [missingChinese],
            sourceText: rowValues[chineseLocale]!,
            missingLocales: [missingChinese],
            field
          });
        }
      }
      // If localeCount === 3, no translation needed
    });
  });

  translationScenarios = scenarios;
}

// Translation batching and processing
async function startTranslation() {
  isTranslating = true;
  currentBatch = 0;
  translationProgress = { completed: 0, total: translationScenarios.length };

  try {
    // Group scenarios by source->target locale pairs for batching
    const batchGroups = new Map<string, TranslationScenario[]>();

    translationScenarios.forEach((scenario) => {
      scenario.targetLocales.forEach((targetLocale) => {
        const key = `${scenario.sourceLocale}->${targetLocale}`;
        if (!batchGroups.has(key)) {
          batchGroups.set(key, []);
        }
        batchGroups.get(key)!.push(scenario);
      });
    });

    // Process each translation direction
    for (const [direction, scenarios] of batchGroups) {
      const [sourceLocale, targetLocale] = direction.split('->') as [Locale, Locale];
      await processBatchGroup(scenarios, sourceLocale, targetLocale);
    }

    saveTranslationResults();
    proceedToNextStep();
  } catch (error) {
    console.error('🌐 TranslationStep: Translation error:', error);
  } finally {
    isTranslating = false;
  }
}

async function processBatchGroup(
  scenarios: TranslationScenario[],
  sourceLocale: Locale,
  targetLocale: Locale
) {
  const batches = createTranslationBatches(scenarios.map((s) => s.sourceText));
  totalBatches = batches.length;

  for (let i = 0; i < batches.length; i++) {
    currentBatch = i + 1;

    try {
      const response = await fetch('/api/translation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: sourceLocale,
          target: targetLocale,
          texts: batches[i]
        })
      });

      if (!response.ok) {
        throw new Error(`Translation API failed: ${response.statusText}`);
      }

      const translations = (await response.json()) as string[];

      // Map translations back to scenarios
      const batchStartIndex = batches
        .slice(0, i)
        .reduce((sum, batch) => sum + batch.length, 0);
      translations.forEach((translation, index) => {
        const scenarioIndex = batchStartIndex + index;
        const scenario = scenarios[scenarioIndex];

        if (!translationResults.has(scenario.rowIndex)) {
          translationResults.set(scenario.rowIndex, {} as Record<Locale, string>);
        }

        const rowResults = translationResults.get(scenario.rowIndex)!;
        rowResults[targetLocale] = translation;

        translationProgress.completed++;
      });

      // Small delay between batches to avoid overwhelming the API
      if (i < batches.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`🌐 TranslationStep: Error in batch ${currentBatch}:`, error);
      throw error;
    }
  }
}

function createTranslationBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let currentBatch: string[] = [];
  let currentCharCount = 0;

  const MAX_ELEMENTS = 1000;
  const MAX_CHARS = 50000;

  texts.forEach((text) => {
    const textLength = text.length;

    // Check if adding this text would exceed limits
    if (
      currentBatch.length >= MAX_ELEMENTS ||
      (currentCharCount + textLength > MAX_CHARS && currentBatch.length > 0)
    ) {
      // Start new batch
      batches.push([...currentBatch]);
      currentBatch = [];
      currentCharCount = 0;
    }

    currentBatch.push(text);
    currentCharCount += textLength;
  });

  // Add final batch if not empty
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

function saveTranslationResults() {
  // Group results by field type
  const titleTranslations = new Map<number, Record<Locale, string>>();
  const descriptionTranslations = new Map<number, Record<Locale, string>>();

  // Separate results by field type
  translationScenarios.forEach((scenario) => {
    const rowResults = translationResults.get(scenario.rowIndex);
    if (rowResults) {
      scenario.targetLocales.forEach((targetLocale) => {
        if (rowResults[targetLocale]) {
          const targetMap =
            scenario.field === 'title' ? titleTranslations : descriptionTranslations;

          if (!targetMap.has(scenario.rowIndex)) {
            targetMap.set(scenario.rowIndex, {} as Record<Locale, string>);
          }

          const existing = targetMap.get(scenario.rowIndex)!;
          existing[targetLocale] = rowResults[targetLocale];
        }
      });
    }
  });

  // Save translation results as enriched data
  const allRowIndices = new Set([
    ...titleTranslations.keys(),
    ...descriptionTranslations.keys()
  ]);

  allRowIndices.forEach((rowIndex) => {
    const existingData = importCtx.getRowEnrichedData(rowIndex) || {};
    const updates: any = { ...existingData };

    if (titleTranslations.has(rowIndex)) {
      updates.titleTranslations = titleTranslations.get(rowIndex);
    }

    if (descriptionTranslations.has(rowIndex)) {
      updates.descriptionTranslations = descriptionTranslations.get(rowIndex);
    }

    importCtx.setRowEnrichedData(rowIndex, updates);
  });
}

function proceedToNextStep() {
  importCtx.setCurrentStep('geo-lookup');
}

function skipTranslation() {
  proceedToNextStep();
}
</script>

<div class="space-y-6">
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body">
      <h2 class="card-title">Feature Title Translation</h2>

      <p class="text-base-content/70">
        Ensure all feature titles are available in all supported locales (English,
        Traditional Chinese, Simplified Chinese).
      </p>

      {#if translationColumns.length === 0}
        <div class="alert alert-warning">
          <div>
            <h3 class="font-semibold">No Translation Columns Found</h3>
            <p>
              No columns were mapped to feature titles or descriptions. Translation step
              will be skipped.
            </p>
          </div>
        </div>
      {:else}
        <div class="stats shadow">
          <div class="stat">
            <div class="stat-title">Title Columns</div>
            <div class="stat-value text-2xl">{titleColumns.length}</div>
            <div class="stat-desc">
              {titleColumns.length > 0
                ? titleColumns.map((c) => `${c.header} (${c.locale})`).join(', ')
                : 'None mapped'}
            </div>
          </div>

          <div class="stat">
            <div class="stat-title">Description Columns</div>
            <div class="stat-value text-2xl">{descriptionColumns.length}</div>
            <div class="stat-desc">
              {descriptionColumns.length > 0
                ? descriptionColumns.map((c) => `${c.header} (${c.locale})`).join(', ')
                : 'None mapped (optional)'}
            </div>
          </div>

          <div class="stat">
            <div class="stat-title">Rows Needing Translation</div>
            <div class="stat-value text-2xl">{translationScenarios.length}</div>
            <div class="stat-desc">
              {#if translationScenarios.length === 0}
                All rows have complete translations
              {:else}
                Various translation scenarios detected
              {/if}
            </div>
          </div>
        </div>

        {#if translationScenarios.length > 0}
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">Translation Scenarios</h3>
            <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
              {#each [1, 2, 3] as scenarioNum}
                {@const scenarioCount = translationScenarios.filter(
                  (s) => s.scenario === scenarioNum
                ).length}
                {@const titleCount = translationScenarios.filter(
                  (s) => s.scenario === scenarioNum && s.field === 'title'
                ).length}
                {@const descCount = translationScenarios.filter(
                  (s) => s.scenario === scenarioNum && s.field === 'description'
                ).length}
                <div class="stat rounded-lg bg-base-200">
                  <div class="stat-title">Scenario {scenarioNum}</div>
                  <div class="stat-value text-lg">{scenarioCount}</div>
                  <div class="stat-desc">
                    {#if scenarioNum === 1}
                      Single locale specified
                    {:else if scenarioNum === 2}
                      Chinese locales only
                    {:else}
                      English + one Chinese
                    {/if}
                    <br />
                    <small>{titleCount} title, {descCount} description</small>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        {#if isTranslating}
          <div class="space-y-4">
            <h3 class="text-lg font-semibold">Translation in Progress</h3>

            <div class="space-y-2">
              <div class="flex justify-between text-sm">
                <span>Current Batch: {currentBatch}/{totalBatches}</span>
                <span
                  >{translationProgress.completed}/{translationProgress.total} translations</span>
              </div>

              <progress
                class="progress progress-primary w-full"
                value={translationProgress.completed}
                max={translationProgress.total}></progress>
            </div>

            <div class="alert alert-info">
              <div>
                <h4 class="font-semibold">Please wait</h4>
                <p>
                  Translating feature titles to ensure complete multilingual coverage.
                </p>
              </div>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    <div class="card-actions justify-end p-6 pt-0">
      {#if !isTranslating}
        {#if translationScenarios.length > 0}
          <button class="btn btn-primary" onclick={startTranslation}>
            Start Translation
          </button>
        {:else}
          <button class="btn btn-primary" onclick={skipTranslation}>
            Continue to Next Step
          </button>
        {/if}
      {/if}
    </div>
  </div>
</div>
