<script lang="ts">
// SVELTE
import { onMount, untrack } from 'svelte'
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
// API
import { translateText } from '$lib/api/server/translation.remote'
// I18N
import { m, toLocaleKebab, toLocaleKey } from '$lib/i18n'
// ENUM
import { supportedLocaleKeys } from '$lib/enums'
// TYPES
import type {
  FeatureCSVColumn,
  Locale,
  LocaleKey,
} from '$lib/client/services/import/types'

type PropertyData = {
  key: string
  columns: FeatureCSVColumn[]
  scenario: number
}

type Props = {
  property: PropertyData
  onActionComplete: () => void
  footerAction?: () => void
  footerActionLabel?: string
  footerActionDisabled?: boolean
}

type TranslationChoice = {
  mode: 'translate' | 'copy'
  sourceLocale?: Locale
}

type EnrichedRowData = Partial<Record<Locale, string>> & {
  _needsTranslation?: LocaleKey[]
  _sourceValue?: string
  _sourceLocale?: LocaleKey
}

type LocaleAnalysis = {
  localeCounts: Partial<Record<LocaleKey, number>>
  localeColumns: Partial<Record<LocaleKey, number>>
  sourceLocale: LocaleKey
  hasCompleteData: boolean
}

let {
  property,
  onActionComplete,
  footerAction = $bindable(),
  footerActionLabel = $bindable(''),
  footerActionDisabled = $bindable(false),
}: Props = $props()

const importCtx = getImportCtx()

let isProcessing = $state(false)
let progress = $state(0)
let currentStep = $state('')
let error = $state<string | null>(null)
let completedRows = $state(0)
let totalRows = $state(0)
let activeChoice = $state<TranslationChoice | null>(null)
let hasCompleted = $state(false)

const localeAnalysis = $derived.by(() => analyzeLocaleCoverage(property.columns))
const sampleValues = $derived.by(() => getSampleValues(property.columns))
const localeCoverage = $derived.by(() =>
  supportedLocaleKeys.map(locale => ({
    locale,
    count: localeAnalysis.localeCounts[locale] || 0,
    hasColumn: Boolean(localeAnalysis.localeColumns[locale] !== undefined),
  })),
)

onMount(() => {
  void enrichData()
})

const footerContinueAction = () => {
  onActionComplete()
}

$effect(() => {
  syncFooterAction(hasCompleted, Boolean(error))
})

function analyzeLocaleCoverage(columns: FeatureCSVColumn[]): LocaleAnalysis {
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()
  const localeCounts: Partial<Record<LocaleKey, number>> = {}
  const localeColumns: Partial<Record<LocaleKey, number>> = {}

  columns.forEach(column => {
    if (!column.locale || column.locale === 'None') return

    const locale = toLocaleKey(column.locale)
    const columnIndex = headers.indexOf(column.header)
    if (columnIndex < 0) return

    localeColumns[locale] = columnIndex
    localeCounts[locale] = 0

    data.forEach(row => {
      if (row[columnIndex]?.trim()) {
        localeCounts[locale] = (localeCounts[locale] || 0) + 1
      }
    })
  })

  const sourceLocale =
    supportedLocaleKeys
      .map(locale => ({
        locale,
        count: localeCounts[locale] || 0,
      }))
      .sort((left, right) => right.count - left.count)[0]?.locale || 'en'

  const hasCompleteData = data.every(row => {
    const localesWithColumns = supportedLocaleKeys.filter(
      locale => localeColumns[locale] !== undefined,
    )
    if (localesWithColumns.length === 0) return true

    const hasAnyData = localesWithColumns.some(locale => {
      const columnIndex = localeColumns[locale]
      return columnIndex !== undefined && row[columnIndex]?.trim()
    })
    if (!hasAnyData) return true

    return localesWithColumns.every(locale => {
      const columnIndex = localeColumns[locale]
      return columnIndex !== undefined && row[columnIndex]?.trim()
    })
  })

  return {
    localeCounts,
    localeColumns,
    sourceLocale,
    hasCompleteData,
  }
}

function getSampleValues(columns: FeatureCSVColumn[]): string[] {
  const values = new Set<string>()
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()

  columns.forEach(column => {
    const columnIndex = headers.indexOf(column.header)
    if (columnIndex < 0) return

    data.forEach(row => {
      const value = row[columnIndex]?.trim()
      if (value) values.add(value)
    })
  })

  return Array.from(values).slice(0, 12)
}

function resolveTranslationChoice(): TranslationChoice {
  const storedChoice = importCtx.state.propertyReconciliation.translationChoices.get(
    property.key,
  )
  if (storedChoice) {
    return storedChoice
  }

  // Default behavior for existing translatable properties:
  // translate missing locales from the locale with the widest coverage.
  return {
    mode: 'translate',
    sourceLocale: localeAnalysis.sourceLocale,
  }
}

async function enrichData(): Promise<void> {
  isProcessing = true
  error = null
  completedRows = 0
  hasCompleted = false

  try {
    const choice = resolveTranslationChoice()
    activeChoice = choice

    currentStep = m.analyzing_data()
    progress = 10

    const data = importCtx.getData()
    totalRows = data.length

    currentStep = m.processing_rows()
    progress = 20

    const enrichedRows = buildRowEnrichment(choice)

    currentStep =
      choice.mode === 'translate'
        ? m.preparing_translations()
        : m.storing_enriched_data()
    progress = 40

    if (choice.mode === 'translate') {
      await processTranslations(enrichedRows)
    }

    currentStep = m.storing_enriched_data()
    progress = 90

    const existingData = importCtx.getPropertyEnrichedData(property.key) || {}
    const matchedProperty = importCtx
      .getFetchedProperties()
      .find(candidate => candidate.key === property.key)
    importCtx.setPropertyEnrichedData(property.key, {
      ...existingData,
      propertyId: existingData.propertyId || matchedProperty?.id,
      propertyType: existingData.propertyType || matchedProperty?.type || 'specifier',
      enrichedData: enrichedRows,
      translatedValues: getFallbackTranslatedValues(enrichedRows),
    })

    progress = 100
    currentStep = m.complete()
    hasCompleted = true
  } catch (err) {
    console.error('Error enriching data:', err)
    error = err instanceof Error ? err.message : 'Unknown error occurred'
  } finally {
    isProcessing = false
  }
}

function getFallbackTranslatedValues(
  enrichedRows: Map<number, EnrichedRowData>,
): Record<Locale, string> {
  const firstRow = enrichedRows.values().next().value

  return {
    en: firstRow?.en || '',
    'zh-hant': firstRow?.['zh-hant'] || '',
    'zh-hans': firstRow?.['zh-hans'] || '',
  }
}

function buildRowEnrichment(choice: TranslationChoice): Map<number, EnrichedRowData> {
  const data = importCtx.getData()
  const rows = new Map<number, EnrichedRowData>()
  const localeColumns = localeAnalysis.localeColumns

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    const rowData: EnrichedRowData = {}

    const availableLocales = supportedLocaleKeys.filter(locale => {
      const columnIndex = localeColumns[locale]
      return columnIndex !== undefined && row[columnIndex]?.trim()
    })

    if (availableLocales.length === 0) continue

    if (choice.mode === 'copy') {
      const sourceLocale = selectAutoSourceLocale(availableLocales)
      const sourceColumnIndex = localeColumns[sourceLocale]
      const sourceValue =
        sourceColumnIndex !== undefined ? row[sourceColumnIndex]?.trim() || '' : ''
      if (!sourceValue) continue

      supportedLocaleKeys.forEach(localeKey => {
        rowData[toLocaleKebab(localeKey)] = sourceValue
      })
    } else {
      const sourceLocale = selectAutoSourceLocale(availableLocales)
      const sourceColumnIndex = localeColumns[sourceLocale]
      const sourceValue =
        sourceColumnIndex !== undefined ? row[sourceColumnIndex]?.trim() || '' : ''
      if (!sourceValue) continue

      rowData[toLocaleKebab(sourceLocale)] = sourceValue

      supportedLocaleKeys.forEach(localeKey => {
        if (localeKey === sourceLocale) return

        const columnIndex = localeColumns[localeKey]
        const existingValue =
          columnIndex !== undefined ? row[columnIndex]?.trim() || '' : ''

        if (existingValue) {
          rowData[toLocaleKebab(localeKey)] = existingValue
          return
        }

        rowData._needsTranslation = [...(rowData._needsTranslation || []), localeKey]
        rowData._sourceValue = sourceValue
        rowData._sourceLocale = sourceLocale
      })
    }

    if (Object.keys(rowData).length > 0) {
      rows.set(rowIndex, rowData)
    }
  }

  return rows
}

function selectAutoSourceLocale(availableLocales: LocaleKey[]): LocaleKey {
  if (availableLocales.length <= 1) {
    return availableLocales[0] ?? 'en'
  }

  const hasEn = availableLocales.includes('en')
  const hasZhHant = availableLocales.includes('zhHant')
  const hasZhHans = availableLocales.includes('zhHans')

  if (hasZhHant && hasZhHans) {
    return 'zhHant'
  }

  if (hasEn && hasZhHant) {
    return 'zhHant'
  }

  if (hasEn && hasZhHans) {
    return 'zhHans'
  }

  return availableLocales[0] ?? 'en'
}

async function processTranslations(
  enrichedRows: Map<number, EnrichedRowData>,
): Promise<void> {
  const translationBatches = new Map<
    string,
    {
      sourceLocale: LocaleKey
      targetLocale: LocaleKey
      texts: string[]
      rowIndices: number[]
    }
  >()

  enrichedRows.forEach((rowData, rowIndex) => {
    if (!rowData._needsTranslation || !rowData._sourceValue || !rowData._sourceLocale)
      return

    rowData._needsTranslation.forEach(targetLocale => {
      const batchKey = `${rowData._sourceLocale}->${targetLocale}`

      if (!translationBatches.has(batchKey)) {
        translationBatches.set(batchKey, {
          sourceLocale: rowData._sourceLocale,
          targetLocale,
          texts: [],
          rowIndices: [],
        })
      }

      const batch = translationBatches.get(batchKey)
      if (!batch) return
      batch.texts.push(rowData._sourceValue)
      batch.rowIndices.push(rowIndex)
    })
  })

  currentStep = m.translating_values()
  let batchIndex = 0
  const totalBatches = translationBatches.size || 1

  for (const [batchKey, batch] of translationBatches.entries()) {
    try {
      currentStep = m.translating_batch({
        current: batchIndex + 1,
        total: translationBatches.size,
      })
      progress = 40 + ((batchIndex + 1) / totalBatches) * 40

      const translations = await translateText({
        source: batch.sourceLocale,
        target: batch.targetLocale,
        texts: batch.texts,
      })

      batch.rowIndices.forEach((rowIndex, textIndex) => {
        const rowData = enrichedRows.get(rowIndex)
        const translatedValue = translations[textIndex]
        if (!rowData || !translatedValue) return
        rowData[toLocaleKebab(batch.targetLocale)] = translatedValue
      })

      batchIndex += 1
      completedRows += batch.rowIndices.length
    } catch (translationError) {
      console.error(`Translation batch failed for ${batchKey}:`, translationError)
    }
  }

  enrichedRows.forEach(rowData => {
    delete rowData._needsTranslation
    delete rowData._sourceValue
    delete rowData._sourceLocale
  })
}

function retryEnrichment(): void {
  void enrichData()
}

function syncFooterAction(isComplete: boolean, hasError: boolean): void {
  untrack(() => {
    if (isComplete && !hasError) {
      if (footerAction !== footerContinueAction) {
        footerAction = footerContinueAction
      }
      if (footerActionLabel !== m.continue()) {
        footerActionLabel = m.continue()
      }
      if (footerActionDisabled) {
        footerActionDisabled = false
      }
      return
    }

    if (footerAction !== undefined) {
      footerAction = undefined
    }
    if (footerActionLabel !== '') {
      footerActionLabel = ''
    }
    if (footerActionDisabled) {
      footerActionDisabled = false
    }
  })
}
</script>

<div class="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
  <section
    class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-warning/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-3"
  >
    <div class="mb-5">
      <div
        class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-warning"
      >
        {m.enriching_property_data({ key: property.key })}
      </div>
      <h3 class="mt-2 text-2xl font-black tracking-tight">{property.key}</h3>
    </div>

    {#if error}
      <div class="rounded-2xl border border-error/30 bg-error/15 p-4">
        <h4 class="font-semibold text-error">{m.enrichment_error()}</h4>
        <p class="mt-2 text-sm text-base-content/80">{error}</p>
      </div>
      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          class="btn btn-ghost rounded-full px-5"
          onclick={retryEnrichment}
        >
          {m.retry()}
        </button>
        <button
          type="button"
          class="btn btn-primary rounded-full px-5"
          onclick={onActionComplete}
        >
          {m.skip()}
        </button>
      </div>
    {:else if isProcessing}
      <div class="space-y-4">
        <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
          <div class="mb-2 flex items-center justify-between text-sm">
            <span class="font-medium">{currentStep}</span>
            <span class="font-mono text-base-content/65">{Math.round(progress)}%</span>
          </div>
          <progress
            class="progress progress-primary h-2 w-full"
            value={progress}
            max="100"
          ></progress>
          <div class="mt-3 flex items-center gap-2 text-sm text-base-content/70">
            <span class="loading loading-spinner loading-sm"></span>
            {m.please_wait()}
          </div>
        </div>

        <div class="grid gap-3 md:grid-cols-3">
          <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
            >
              {m.source_locale()}
            </div>
            <div class="mt-2 font-mono text-sm text-base-content/85">
              {activeChoice?.sourceLocale || localeAnalysis.sourceLocale}
            </div>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
            >
              {m.translation_mode()}
            </div>
            <div class="mt-2 font-mono text-sm text-base-content/85">
              {activeChoice?.mode || 'translate'}
            </div>
          </div>
          <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
            <div
              class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
            >
              {m.rows()}
            </div>
            <div class="mt-2 font-mono text-sm text-base-content/85">
              {completedRows}
              / {totalRows}
            </div>
          </div>
        </div>
      </div>
    {:else if hasCompleted}
      <div class="rounded-2xl border border-success/25 bg-success/10 p-4">
        <div class="text-lg font-semibold text-success">
          ✓ {m.enrichment_complete()}
        </div>
        <p class="mt-2 text-sm text-base-content/75">{m.data_has_been_processed()}</p>
      </div>
    {:else}
      <div
        class="rounded-2xl border border-white/10 bg-white/[0.055] p-4 text-sm text-base-content/70"
      >
        {m.processing_rows()}
      </div>
    {/if}
  </section>

  <section
    class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-info/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-2"
  >
    <div class="mb-5">
      <div
        class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-info"
      >
        {property.columns[0]?.header.split('.').join(' / ')}
      </div>
      <h3 class="mt-2 text-xl font-black tracking-tight">{m.locale_analysis()}</h3>
    </div>

    <div class="space-y-3">
      {#each localeCoverage as block}
        <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
          <div class="flex items-center justify-between gap-3">
            <div class="font-mono text-sm text-base-content/85">{block.locale}</div>
            <div
              class={`rounded-full px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.18em] ${
                block.hasColumn
                  ? 'border border-info/25 bg-info/10 text-info'
                  : 'border border-white/10 bg-white/5 text-base-content/45'
              }`}
            >
              {block.count}
              {m.values()}
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div
        class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
      >
        {m.sample_values()}
      </div>
      <div class="mt-3 space-y-2">
        {#each sampleValues as value}
          <div
            class="border-b border-white/10 pb-2 font-mono text-sm text-base-content/80 last:border-b-0 last:pb-0"
          >
            {value}
          </div>
        {/each}
      </div>
      {#if !localeAnalysis.hasCompleteData}
        <div
          class="mt-4 rounded-2xl border border-warning/25 bg-warning/10 p-3 text-sm text-warning"
        >
          {m.missing_locale_values_auto_translated()}
        </div>
      {/if}
    </div>
  </section>
</div>
