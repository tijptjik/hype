<script lang="ts">
// SVELTE
import { untrack } from 'svelte'
// CONTEXT
import { getImportCtx } from '$lib/context/import.svelte'
// I18N
import { m, toLocaleKey } from '$lib/i18n'
// ENUMS
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

type LocaleAnalysis = {
  localeCounts: Partial<Record<LocaleKey, number>>
  localeColumns: Partial<Record<LocaleKey, number>>
  suggestedSourceLocale: LocaleKey
  suggestedTargetLocales: LocaleKey[]
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

let translationChoice = $state<'translate' | 'copy'>('translate')

const localeAnalysis = $derived.by(() => analyzeLocaleCoverage(property.columns))
const sampleValues = $derived.by(() => getSampleValues(property.columns))
const localeCoverage = $derived.by(() =>
  supportedLocaleKeys.map(locale => ({
    locale,
    count: localeAnalysis.localeCounts[locale] || 0,
    hasColumn: Boolean(localeAnalysis.localeColumns[locale] !== undefined),
  })),
)

const footerAcceptAction = () => {
  handleAccept()
}

$effect(() => {
  syncFooterAction(false)
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

  const localesPresent = supportedLocaleKeys.filter(
    locale => localeColumns[locale] !== undefined,
  )
  const { sourceLocale, targetLocales } = inferTranslationPlan(localesPresent)

  return {
    localeCounts,
    localeColumns,
    suggestedSourceLocale: sourceLocale,
    suggestedTargetLocales: targetLocales,
    hasCompleteData: checkDataCompleteness(data, localeColumns),
  }
}

function checkDataCompleteness(
  data: string[][],
  localeColumns: Partial<Record<LocaleKey, number>>,
): boolean {
  const locales = Object.keys(localeColumns) as LocaleKey[]
  if (locales.length < 2) return true

  for (const row of data) {
    const hasAnyData = locales.some(locale => {
      const columnIndex = localeColumns[locale]
      return columnIndex !== undefined && row[columnIndex]?.trim()
    })

    if (!hasAnyData) continue

    const hasAllData = locales.every(locale => {
      const columnIndex = localeColumns[locale]
      return columnIndex !== undefined && row[columnIndex]?.trim()
    })

    if (!hasAllData) {
      return false
    }
  }

  return true
}

function getSampleValues(columns: FeatureCSVColumn[]): string[] {
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()
  const columnIndices = columns.map(column => ({
    locale: column.locale ? toLocaleKey(column.locale) : null,
    index: headers.indexOf(column.header),
  }))

  return data
    .map(row => {
      const enValue = columnIndices.find(column => column.locale === 'en')?.index ?? -1
      if (enValue >= 0 && row[enValue]?.trim()) return row[enValue].trim()

      const zhHantValue =
        columnIndices.find(column => column.locale === 'zhHant')?.index ?? -1
      if (zhHantValue >= 0 && row[zhHantValue]?.trim()) return row[zhHantValue].trim()

      const zhHansValue =
        columnIndices.find(column => column.locale === 'zhHans')?.index ?? -1
      if (zhHansValue >= 0 && row[zhHansValue]?.trim()) return row[zhHansValue].trim()

      return null
    })
    .filter((value): value is string => Boolean(value))
    .slice(0, 12)
}

function syncFooterAction(disabled: boolean): void {
  untrack(() => {
    if (footerAction !== footerAcceptAction) {
      footerAction = footerAcceptAction
    }
    if (footerActionLabel !== m.accept()) {
      footerActionLabel = m.accept()
    }
    if (footerActionDisabled !== disabled) {
      footerActionDisabled = disabled
    }
  })
}

function handleAccept(): void {
  importCtx.state.propertyReconciliation.translationChoices.set(property.key, {
    mode: translationChoice,
    sourceLocale: localeAnalysis.suggestedSourceLocale as Locale,
  })

  onActionComplete()
}

function inferTranslationPlan(localesPresent: LocaleKey[]): {
  sourceLocale: LocaleKey
  targetLocales: LocaleKey[]
} {
  if (localesPresent.length <= 1) {
    const sourceLocale = localesPresent[0] ?? 'en'
    return {
      sourceLocale,
      targetLocales: supportedLocaleKeys.filter(locale => locale !== sourceLocale),
    }
  }

  const hasEn = localesPresent.includes('en')
  const hasZhHant = localesPresent.includes('zhHant')
  const hasZhHans = localesPresent.includes('zhHans')

  if (hasZhHant && hasZhHans) {
    return {
      sourceLocale: 'zhHant',
      targetLocales: hasEn ? [] : ['en'],
    }
  }

  if (hasEn && hasZhHant) {
    return {
      sourceLocale: 'zhHant',
      targetLocales: ['zhHans'],
    }
  }

  if (hasEn && hasZhHans) {
    return {
      sourceLocale: 'zhHans',
      targetLocales: ['zhHant'],
    }
  }

  const fallback = localesPresent[0] ?? 'en'
  return {
    sourceLocale: fallback,
    targetLocales: supportedLocaleKeys.filter(locale => locale !== fallback),
  }
}
</script>

<div class="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 gap-4 lg:grid-cols-5">
  <section
    class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-info/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-3"
  >
    <div class="mb-5 flex items-start justify-between gap-4">
      <div>
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-info"
        >
          Existing translatable property
        </div>
        <h3 class="mt-2 text-2xl font-black tracking-tight">{property.key}</h3>
      </div>
      <div
        class="rounded-full border border-info/25 bg-info/10 px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-info"
      >
        Scenario {property.scenario}
      </div>
    </div>

    <div class="space-y-3">
      <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
        >
          {m.locale_analysis()}
        </div>
        <div class="mt-3 grid gap-3 md:grid-cols-3">
          {#each localeCoverage as coverage}
            <div class="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div
                class="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-base-content/45"
              >
                {coverage.locale}
              </div>
              <div class="mt-2 text-lg font-black text-base-content/90">
                {coverage.count}
              </div>
              <div class="text-sm text-base-content/65">
                {m.non_empty_values()}
              </div>
            </div>
          {/each}
        </div>

        {#if !localeAnalysis.hasCompleteData}
          <div class="mt-4 rounded-2xl border border-warning/25 bg-warning/8 p-4">
            <div class="font-semibold text-warning">
              {m.incomplete_locale_data_warning()}
            </div>
            <p class="mt-2 text-sm text-warning/80">
              Missing locale values will be filled from the source locale you choose
              below.
            </p>
          </div>
        {/if}
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
        >
          {m.translation_method()}
        </div>

        <div class="mt-3 space-y-3">
          <div
            class={`flex gap-3 rounded-2xl border p-4 transition ${
              translationChoice === 'translate'
                ? 'border-success/30 bg-success/10'
                : 'border-white/10 bg-black/20'
            }`}
          >
            <input
              id="translate-values"
              type="radio"
              bind:group={translationChoice}
              value="translate"
              class="radio radio-primary mt-0.5"
            >
            <div>
              <div class="font-semibold">{m.translate_values()}</div>
              <div class="mt-1 text-sm text-base-content/70">
                {m.translate_values_description()}
              </div>
            </div>
          </div>

          <div
            class={`flex gap-3 rounded-2xl border p-4 transition ${
              translationChoice === 'copy'
                ? 'border-info/30 bg-info/10'
                : 'border-white/10 bg-black/20'
            }`}
          >
            <input
              id="copy-values"
              type="radio"
              bind:group={translationChoice}
              value="copy"
              class="radio radio-primary mt-0.5"
            >
            <div>
              <div class="font-semibold">{m.copy_values()}</div>
              <div class="mt-1 text-sm text-base-content/70">
                {m.copy_values_description()}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
        <div
          class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
        >
          {m.source_language()}
        </div>
        <div class="mt-2 font-mono text-base text-base-content/90">
          {localeAnalysis.suggestedSourceLocale}
        </div>
        <p class="mt-2 text-sm text-base-content/65">
          {translationChoice === 'translate'
            ? `Translations will use ${localeAnalysis.suggestedSourceLocale} as the source locale.`
            : `Missing locales will be copied from ${localeAnalysis.suggestedSourceLocale}.`}
        </p>
      </div>
    </div>
  </section>

  <section
    class="relative flex min-h-96 flex-col overflow-hidden rounded-3xl border border-warning/25 bg-black/[0.45] p-5 shadow-[var(--shadow-mini)] backdrop-blur-xl lg:col-span-2"
  >
    <div class="mb-5">
      <div
        class="font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-warning"
      >
        {sampleValues.length} {sampleValues.length === 1 ? 'sample' : 'samples'}
      </div>
      <h3 class="mt-2 text-xl font-black tracking-tight">{m.sample_values()}</h3>
    </div>

    <div
      class="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04]"
    >
      {#each sampleValues as value}
        <div
          class="border-b border-white/10 px-4 py-3 font-mono text-sm text-base-content/80 last:border-b-0"
        >
          {value}
        </div>
      {/each}
    </div>

    <div class="mt-4 rounded-2xl border border-white/10 bg-white/[0.055] p-4">
      <div
        class="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-base-content/50"
      >
        Translation plan
      </div>
      <p class="mt-2 text-sm leading-relaxed text-base-content/70">
        {translationChoice === 'translate'
          ? `Missing locale values will be translated from ${localeAnalysis.suggestedSourceLocale} to ${localeAnalysis.suggestedTargetLocales.join(', ') || 'none'}.`
          : `Missing locale values will be copied from ${localeAnalysis.suggestedSourceLocale} to ${localeAnalysis.suggestedTargetLocales.join(', ') || 'none'}.`}
      </p>
    </div>
  </section>
</div>
