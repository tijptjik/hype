<script lang="ts">
// SVELTE
import { onMount } from 'svelte'
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// I18N
import { m } from '$lib/i18n'
// API
import { translateText } from '$lib/api/server/translation.remote'
// SERVICES
import {
  analyzeFeatureTranslation,
  countCompletedFeatureTranslations,
  countFeatureTranslationTargets,
  markFeatureTranslationComplete,
  processFeatureTranslations,
  saveFeatureTranslationResults,
  syncFeatureTranslationSnapshot,
  type FeatureTranslationResultMap,
} from '$lib/client/services/import/features/translation'
// COMPONENTS
import TranslationLocaleBlock from './TranslationLocaleBlock.svelte'
import TranslationNeedSummary from './TranslationNeedSummary.svelte'
import TranslationScenarioCard from './TranslationScenarioCard.svelte'
type Props = {
  importCtx: ImportCtx
  startProcessing?: () => void
  isProcessing?: boolean
  footerStatus?: string
}

let {
  importCtx,
  startProcessing = $bindable(),
  isProcessing = $bindable(false),
  footerStatus = $bindable(''),
}: Props = $props()

let translationResults = $state<FeatureTranslationResultMap>(new Map())

const analysis = $derived(
  analyzeFeatureTranslation(importCtx, translationResults, isProcessing),
)
const totalTranslations = $derived(countFeatureTranslationTargets(analysis))
const completedTranslations = $derived(countCompletedFeatureTranslations(analysis))
const rowsNeedingTranslation = $derived(
  analysis.statusCounts.missingTranslations + analysis.statusCounts.translating,
)

/**
 * Starts the translation job from the footer or automatic mount trigger.
 *
 * @returns Resolves after translation completes or fails.
 */
async function startTranslation(): Promise<void> {
  if (isProcessing) return

  if (analysis.scenarios.length === 0) {
    markTranslationComplete()
    proceedToNextStep()
    return
  }

  isProcessing = true
  footerStatus = `Preparing ${totalTranslations} translations`
  syncTranslationSnapshot({
    status: 'translating',
    error: undefined,
    currentBatch: 0,
    totalBatches: 0,
  })

  try {
    translationResults = await processFeatureTranslations({
      analysis,
      translationResults,
      translateText: async params => await translateText(params),
      onBatchStatus: ({ footerStatus: nextFooterStatus, updates }) => {
        if (nextFooterStatus) {
          footerStatus = nextFooterStatus
        }
        syncTranslationSnapshot(updates)
      },
    })
    saveFeatureTranslationResults(importCtx, analysis.scenarios, translationResults)
    markTranslationComplete()
    proceedToNextStep()
  } catch (error) {
    console.error('Translation step failed:', error)
    footerStatus = 'Translation failed'
    importCtx.updateTranslation({
      status: 'error',
      error: error instanceof Error ? error.message : 'Translation failed',
    })
  } finally {
    isProcessing = false
  }
}

/**
 * Copies the current local translation snapshot into import context.
 *
 * @param updates - Additional state values to merge into the snapshot.
 * @returns Nothing.
 */
function syncTranslationSnapshot(
  updates: Partial<ReturnType<ImportCtx['getTranslation']>> = {},
): void {
  syncFeatureTranslationSnapshot({
    importCtx,
    translationResults,
    isProcessing,
    updates,
  })
}

/**
 * Marks context translation state as complete with current analysis counts.
 *
 * @returns Nothing.
 */
function markTranslationComplete(): void {
  footerStatus = 'Translation complete'
  markFeatureTranslationComplete(
    importCtx,
    analyzeFeatureTranslation(importCtx, translationResults, false),
  )
}

/**
 * Advances only when the user has not navigated away during async translation.
 *
 * @returns Nothing.
 */
function proceedToNextStep(): void {
  if (importCtx.getCurrentStep() === 'translation') {
    importCtx.setCurrentStep('geo-lookup')
  }
}

onMount(() => {
  startProcessing = startTranslation
  const currentStatus = importCtx.getTranslation().status

  if (currentStatus === 'complete') {
    isProcessing = false
    footerStatus = 'Translation complete'
    syncTranslationSnapshot({ status: 'complete' })
    return
  }

  if (currentStatus === 'translating') {
    isProcessing = true
    footerStatus = 'Translation in progress'
    syncTranslationSnapshot({ status: 'translating' })
    return
  }

  syncTranslationSnapshot({ status: 'idle' })

  queueMicrotask(() => {
    void startTranslation()
  })
})
</script>

<div class="relative mx-2 flex min-h-full flex-col gap-5 py-4 sm:py-5 lg:py-6">
  <div class="relative z-10 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
    {#each analysis.localeBlocks as block}
      <TranslationLocaleBlock {block} />
    {/each}
  </div>

  <TranslationNeedSummary
    {rowsNeedingTranslation}
    isTranslating={isProcessing}
    {completedTranslations}
    {totalTranslations}
  />

  {#if analysis.translationColumns.length === 0}
    <section
      class="rounded-3xl border border-warning/25 bg-warning/8 p-5 text-warning shadow-[var(--shadow-mini)]"
    >
      <h3 class="text-lg font-black tracking-tight">
        {m.feature_import__translation_no_columns_title()}
      </h3>
      <p class="mt-2 text-sm leading-relaxed text-warning/80">
        {m.feature_import__translation_no_columns_description()}
      </p>
    </section>
  {:else}
    <div class="relative z-10 grid flex-1 grid-cols-1 gap-4 lg:grid-cols-3">
      {#each analysis.scenarioSummaries as summary}
        <TranslationScenarioCard {summary} />
      {/each}
    </div>
  {/if}
</div>
