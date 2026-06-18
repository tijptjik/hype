// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. TYPES
// 1. ANALYSIS
// - analyzeFeatureTranslation
// - getFeatureTranslationStatusCounts
// - getFeatureTranslationScenarioSummaries
//
// 2. PERSISTENCE
// - saveFeatureTranslationResults
//
// 3. BATCHING
// - createFeatureTranslationBatches
// - processFeatureTranslations
// ---

// I18N
import { supportedLocaleKeys } from '$lib/i18n'
// TYPES
import type { ImportCtx } from '$lib/context/import.svelte'
import type { FeatureCSVColumn } from '$lib/client/services/import/types'
import type { LocaleKey } from '$lib/types'

/********************
 *  0. TYPES
 ************/
// +++ Types

export type FeatureTranslationField = 'title' | 'description'
export type FeatureTranslationScenarioKind = 1 | 2 | 3

export type FeatureTranslationScenario = {
  rowIndex: number
  scenario: FeatureTranslationScenarioKind
  sourceLocale: LocaleKey
  targetLocales: LocaleKey[]
  sourceText: string
  missingLocales: LocaleKey[]
  field: FeatureTranslationField
}

export type FeatureTranslationResultMap = Map<
  number,
  Partial<Record<LocaleKey, string>>
>

export type FeatureTranslationLocaleBlock = {
  locale: LocaleKey
  label: string
  glyph: string
  columns: {
    header: string
    field: FeatureTranslationField
  }[]
}

export type FeatureTranslationStatusCounts = {
  allTranslated: number
  missingTranslations: number
  translating: number
  notLinguistic: number
  totalRows: number
}

export type FeatureTranslationScenarioSummary = {
  scenario: FeatureTranslationScenarioKind
  title: string
  description: string
  count: number
  titleCount: number
  descriptionCount: number
  directions: string[]
}

export type FeatureTranslationAnalysis = {
  titleColumns: FeatureCSVColumn[]
  descriptionColumns: FeatureCSVColumn[]
  translationColumns: FeatureCSVColumn[]
  localeBlocks: FeatureTranslationLocaleBlock[]
  scenarios: FeatureTranslationScenario[]
  completedResults: FeatureTranslationResultMap
  statusCounts: FeatureTranslationStatusCounts
  scenarioSummaries: FeatureTranslationScenarioSummary[]
}

export type FeatureTranslationWorkItem = FeatureTranslationScenario & {
  scenarioIndex: number
  targetLocale: LocaleKey
}

export type FeatureTranslationBatchStatus = {
  footerStatus?: string
  updates?: Partial<ReturnType<ImportCtx['getTranslation']>>
}

export type FeatureTranslationRemoteTranslate = (params: {
  source: LocaleKey
  target: LocaleKey
  texts: string[]
}) => Promise<string[]>

const LOCALE_DETAILS: Record<LocaleKey, { label: string; glyph: string }> = {
  en: { label: 'English', glyph: 'EN' },
  zhHant: { label: 'Traditional Chinese', glyph: '繁' },
  zhHans: { label: 'Simplified Chinese', glyph: '简' },
}

// ---

/********************
 *  1. ANALYSIS
 ************/
// +++ Analysis

/**
 * Builds the complete translation view model for mapped feature title/description
 * columns and parsed CSV rows.
 *
 * @param importCtx - Import flow state owner.
 * @param completedResults - Translation results already returned by the remote API.
 * @param isTranslating - Whether the translation worker is currently active.
 * @returns Column grouping, scenario summaries, and row-level status counts.
 */
export function analyzeFeatureTranslation(
  importCtx: ImportCtx,
  completedResults: FeatureTranslationResultMap = new Map(),
  isTranslating = false,
): FeatureTranslationAnalysis {
  const titleColumns = getTranslationColumns(importCtx.getColumns(), 'title')
  const descriptionColumns = getTranslationColumns(
    importCtx.getColumns(),
    'description',
  )
  const translationColumns = [...titleColumns, ...descriptionColumns]
  const scenarios = getFeatureTranslationScenarios(
    importCtx.getData(),
    importCtx.getHeaders(),
    titleColumns,
    descriptionColumns,
  )
  const linguisticRowIndexes = getLinguisticRowIndexes(
    importCtx.getData(),
    importCtx.getHeaders(),
    translationColumns,
  )
  const storedResults = getStoredFeatureTranslationResults(importCtx, scenarios)
  const effectiveResults = mergeFeatureTranslationResults(
    storedResults,
    completedResults,
  )

  return {
    titleColumns,
    descriptionColumns,
    translationColumns,
    localeBlocks: getFeatureTranslationLocaleBlocks(translationColumns),
    scenarios,
    completedResults: effectiveResults,
    statusCounts: getFeatureTranslationStatusCounts({
      data: importCtx.getData(),
      scenarios,
      linguisticRowIndexes,
      completedResults: effectiveResults,
      isTranslating,
    }),
    scenarioSummaries: getFeatureTranslationScenarioSummaries(scenarios),
  }
}

/**
 * Computes row status counts for the import header.
 *
 * @param params - Parsed rows, detected translation scenarios, and current work state.
 * @returns Counts for complete, missing, active, and non-linguistic rows.
 */
export function getFeatureTranslationStatusCounts(params: {
  data: string[][]
  scenarios: FeatureTranslationScenario[]
  linguisticRowIndexes?: Set<number>
  completedResults: FeatureTranslationResultMap
  isTranslating: boolean
}): FeatureTranslationStatusCounts {
  const linguisticRowIndexes =
    params.linguisticRowIndexes ?? new Set(params.data.map((_, index) => index))
  const scenariosByRow = new Map<number, number[]>()
  params.scenarios.forEach((scenario, scenarioIndex) => {
    const scenarioIndexes = scenariosByRow.get(scenario.rowIndex) ?? []
    scenarioIndexes.push(scenarioIndex)
    scenariosByRow.set(scenario.rowIndex, scenarioIndexes)
  })

  let allTranslated = 0
  let missingTranslations = 0
  let translating = 0
  let notLinguistic = 0

  params.data.forEach((_, rowIndex) => {
    const scenarioIndexes = scenariosByRow.get(rowIndex) ?? []

    if (!linguisticRowIndexes.has(rowIndex) && scenarioIndexes.length === 0) {
      notLinguistic += 1
      return
    }

    if (scenarioIndexes.length === 0) {
      allTranslated += 1
      return
    }

    const isComplete = scenarioIndexes.every(scenarioIndex => {
      const scenario = params.scenarios[scenarioIndex]
      const result = params.completedResults.get(scenarioIndex)
      return scenario.targetLocales.every(locale => Boolean(result?.[locale]))
    })

    if (isComplete) {
      allTranslated += 1
      return
    }

    if (params.isTranslating) {
      translating += 1
      return
    }

    missingTranslations += 1
  })

  return {
    allTranslated,
    missingTranslations,
    translating,
    notLinguistic,
    totalRows: params.data.length,
  }
}

/**
 * Groups detected scenarios for compact presentation cards.
 *
 * @param scenarios - Row/field translation work items.
 * @returns Scenario cards with field counts and locale directions.
 */
export function getFeatureTranslationScenarioSummaries(
  scenarios: FeatureTranslationScenario[],
): FeatureTranslationScenarioSummary[] {
  return [1, 2, 3].map(scenario => {
    const scoped = scenarios.filter(item => item.scenario === scenario)
    return {
      scenario: scenario as FeatureTranslationScenarioKind,
      title: getScenarioTitle(scenario as FeatureTranslationScenarioKind),
      description: getScenarioDescription(scenario as FeatureTranslationScenarioKind),
      count: scoped.length,
      titleCount: scoped.filter(item => item.field === 'title').length,
      descriptionCount: scoped.filter(item => item.field === 'description').length,
      directions: Array.from(
        new Set(
          scoped.flatMap(item =>
            item.targetLocales.map(
              targetLocale => `${item.sourceLocale} -> ${targetLocale}`,
            ),
          ),
        ),
      ),
    }
  })
}

/**
 * Counts completed target-locale strings across all scenarios.
 *
 * @param targetAnalysis - Translation analysis snapshot to inspect.
 * @returns Number of translated target strings currently available.
 */
export function countCompletedFeatureTranslations(
  targetAnalysis: FeatureTranslationAnalysis,
): number {
  return targetAnalysis.scenarios.reduce((total, scenario, scenarioIndex) => {
    const result = targetAnalysis.completedResults.get(scenarioIndex)
    return (
      total +
      scenario.targetLocales.filter(targetLocale => Boolean(result?.[targetLocale]))
        .length
    )
  }, 0)
}

/**
 * Counts target locale strings that need remote translation.
 *
 * @param targetAnalysis - Translation analysis snapshot to inspect.
 * @returns Total target-locale strings across all scenarios.
 */
export function countFeatureTranslationTargets(
  targetAnalysis: FeatureTranslationAnalysis,
): number {
  return targetAnalysis.scenarios.reduce(
    (total, scenario) => total + scenario.targetLocales.length,
    0,
  )
}

/**
 * Copies a local translation analysis snapshot into import context.
 *
 * @param params - Import context, local results, processing state, and snapshot updates.
 * @returns Nothing.
 */
export function syncFeatureTranslationSnapshot(params: {
  importCtx: ImportCtx
  translationResults: FeatureTranslationResultMap
  isProcessing: boolean
  updates?: Partial<ReturnType<ImportCtx['getTranslation']>>
}): void {
  const snapshot = analyzeFeatureTranslation(
    params.importCtx,
    params.translationResults,
    params.isProcessing,
  )

  params.importCtx.updateTranslation({
    allTranslated: snapshot.statusCounts.allTranslated,
    missingTranslations: snapshot.statusCounts.missingTranslations,
    translating: snapshot.statusCounts.translating,
    notLinguistic: snapshot.statusCounts.notLinguistic,
    totalRows: snapshot.statusCounts.totalRows,
    totalTranslations: countFeatureTranslationTargets(snapshot),
    completedTranslations: countCompletedFeatureTranslations(snapshot),
    ...params.updates,
  })
}

/**
 * Marks context translation state as complete with current analysis counts.
 *
 * @param importCtx - Import flow state owner.
 * @param targetAnalysis - Analysis snapshot after translations have been saved.
 * @returns Nothing.
 */
export function markFeatureTranslationComplete(
  importCtx: ImportCtx,
  targetAnalysis: FeatureTranslationAnalysis,
): void {
  const targetTotalTranslations = countFeatureTranslationTargets(targetAnalysis)

  importCtx.updateTranslation({
    status: 'complete',
    allTranslated: targetAnalysis.statusCounts.allTranslated,
    missingTranslations: 0,
    translating: 0,
    notLinguistic: targetAnalysis.statusCounts.notLinguistic,
    totalRows: targetAnalysis.statusCounts.totalRows,
    totalTranslations: targetTotalTranslations,
    completedTranslations: targetTotalTranslations,
    currentBatch: 0,
    totalBatches: 0,
    error: undefined,
  })
}

/**
 * Finds feature title/description columns for a specific field.
 *
 * @param columns - All mapped CSV columns.
 * @param field - Feature text field to inspect.
 * @returns Matching feature columns with a supported locale.
 */
function getTranslationColumns(
  columns: FeatureCSVColumn[],
  field: FeatureTranslationField,
): FeatureCSVColumn[] {
  return columns.filter(
    column =>
      column.modelType === 'Feature' &&
      column.field === field &&
      toCanonicalLocale(column.locale) !== null,
  )
}

/**
 * Creates per-locale column blocks for the translation overview.
 *
 * @param columns - Supported title/description columns.
 * @returns Locale-first column groups in supported locale order.
 */
function getFeatureTranslationLocaleBlocks(
  columns: FeatureCSVColumn[],
): FeatureTranslationLocaleBlock[] {
  return supportedLocaleKeys.map(locale => ({
    locale,
    ...LOCALE_DETAILS[locale],
    columns: columns
      .filter(column => toCanonicalLocale(column.locale) === locale)
      .map(column => ({
        header: column.header,
        field: column.field as FeatureTranslationField,
      })),
  }))
}

/**
 * Detects all row/field translation work items for the current CSV.
 *
 * @param data - Parsed CSV body rows.
 * @param headers - Parsed CSV header names.
 * @param titleColumns - Mapped title columns.
 * @param descriptionColumns - Mapped description columns.
 * @returns Translation scenarios that can be resolved from available locale values.
 */
function getFeatureTranslationScenarios(
  data: string[][],
  headers: string[],
  titleColumns: FeatureCSVColumn[],
  descriptionColumns: FeatureCSVColumn[],
): FeatureTranslationScenario[] {
  const scenarios: FeatureTranslationScenario[] = []
  const fieldAnalysis = [
    { field: 'title' as const, columns: titleColumns, required: true },
    { field: 'description' as const, columns: descriptionColumns, required: false },
  ]

  fieldAnalysis.forEach(({ field, columns, required }) => {
    if (columns.length === 0) return

    const localeToColumnIndex = new Map<LocaleKey, number>()
    columns.forEach(column => {
      const columnIndex = headers.indexOf(column.header)
      const locale = toCanonicalLocale(column.locale)
      if (columnIndex !== -1 && locale) {
        localeToColumnIndex.set(locale, columnIndex)
      }
    })

    data.forEach((row, index) => {
      const rowValues: Partial<Record<LocaleKey, string>> = {}

      localeToColumnIndex.forEach((columnIndex, locale) => {
        const value = row[columnIndex]?.trim()
        if (value) {
          rowValues[locale] = value
        }
      })

      const availableLocales = Object.keys(rowValues) as LocaleKey[]
      const localeCount = availableLocales.length

      if (!required && localeCount === 0) return

      pushTranslationScenario({
        scenarios,
        rowIndex: index,
        field,
        rowValues,
        availableLocales,
      })
    })
  })

  return scenarios
}

/**
 * Rehydrates translation results previously saved into row enriched data.
 *
 * @param importCtx - Import flow state owner.
 * @param scenarios - Current translation scenarios.
 * @returns Completed translations keyed by scenario index.
 */
function getStoredFeatureTranslationResults(
  importCtx: ImportCtx,
  scenarios: FeatureTranslationScenario[],
): FeatureTranslationResultMap {
  const results: FeatureTranslationResultMap = new Map()

  scenarios.forEach((scenario, scenarioIndex) => {
    const enriched = importCtx.getRowEnrichedData(scenario.rowIndex) as
      | {
          titleTranslations?: Partial<Record<LocaleKey, string>>
          descriptionTranslations?: Partial<Record<LocaleKey, string>>
        }
      | undefined
    const fieldTranslations =
      scenario.field === 'title'
        ? enriched?.titleTranslations
        : enriched?.descriptionTranslations

    scenario.targetLocales.forEach(targetLocale => {
      const value = fieldTranslations?.[targetLocale]
      if (!value) return

      const scenarioResults = results.get(scenarioIndex) ?? {}
      scenarioResults[targetLocale] = value
      results.set(scenarioIndex, scenarioResults)
    })
  })

  return results
}

/**
 * Merges stored and newly generated translation results.
 *
 * @param storedResults - Results already persisted to row enriched data.
 * @param completedResults - Results from the current mounted translation run.
 * @returns A merged result map, preferring current-run values.
 */
function mergeFeatureTranslationResults(
  storedResults: FeatureTranslationResultMap,
  completedResults: FeatureTranslationResultMap,
): FeatureTranslationResultMap {
  const merged: FeatureTranslationResultMap = new Map(storedResults)

  completedResults.forEach((result, scenarioIndex) => {
    merged.set(scenarioIndex, {
      ...(merged.get(scenarioIndex) ?? {}),
      ...result,
    })
  })

  return merged
}

/**
 * Adds a scenario for a field when the available locale combination is supported.
 *
 * @param params - Row field locale values and the mutable scenario collection.
 * @returns Nothing; scenarios are appended to `params.scenarios`.
 */
function pushTranslationScenario(params: {
  scenarios: FeatureTranslationScenario[]
  rowIndex: number
  field: FeatureTranslationField
  rowValues: Partial<Record<LocaleKey, string>>
  availableLocales: LocaleKey[]
}): void {
  const localeCount = params.availableLocales.length

  if (localeCount === 1) {
    const sourceLocale = params.availableLocales[0]
    const targetLocales = supportedLocaleKeys.filter(locale => locale !== sourceLocale)
    params.scenarios.push({
      rowIndex: params.rowIndex,
      scenario: 1,
      sourceLocale,
      targetLocales,
      sourceText: params.rowValues[sourceLocale] ?? '',
      missingLocales: targetLocales,
      field: params.field,
    })
    return
  }

  if (localeCount !== 2) return

  const hasEn = params.availableLocales.includes('en')
  const hasZhHant = params.availableLocales.includes('zhHant')
  const hasZhHans = params.availableLocales.includes('zhHans')

  if (hasZhHant && hasZhHans && !hasEn) {
    params.scenarios.push({
      rowIndex: params.rowIndex,
      scenario: 2,
      sourceLocale: 'zhHant',
      targetLocales: ['en'],
      sourceText: params.rowValues.zhHant ?? '',
      missingLocales: ['en'],
      field: params.field,
    })
    return
  }

  if (hasEn && (hasZhHant || hasZhHans)) {
    const chineseLocale = hasZhHant ? 'zhHant' : 'zhHans'
    const missingChinese = hasZhHant ? 'zhHans' : 'zhHant'
    params.scenarios.push({
      rowIndex: params.rowIndex,
      scenario: 3,
      sourceLocale: chineseLocale,
      targetLocales: [missingChinese],
      sourceText: params.rowValues[chineseLocale] ?? '',
      missingLocales: [missingChinese],
      field: params.field,
    })
  }
}

/**
 * Finds rows with at least one mapped title or description value.
 *
 * @param data - Parsed CSV body rows.
 * @param headers - Parsed CSV header names.
 * @param columns - Mapped feature title/description columns.
 * @returns Row indexes that contain linguistic feature values.
 */
function getLinguisticRowIndexes(
  data: string[][],
  headers: string[],
  columns: FeatureCSVColumn[],
): Set<number> {
  const columnIndexes = columns
    .map(column => headers.indexOf(column.header))
    .filter(index => index >= 0)

  return new Set(
    data
      .map((row, rowIndex) =>
        columnIndexes.some(columnIndex => row[columnIndex]?.trim()) ? rowIndex : -1,
      )
      .filter(rowIndex => rowIndex >= 0),
  )
}

/**
 * Converts locale metadata from CSV mapping into form-locale keys.
 *
 * @param locale - CSV column locale metadata.
 * @returns Canonical locale key, or null when the locale is not translatable.
 */
function toCanonicalLocale(locale: unknown): LocaleKey | null {
  if (typeof locale !== 'string' || locale === 'None') return null

  const normalizedLocale = locale.trim().toLowerCase().replace(/_/gu, '-')
  if (normalizedLocale === 'en') return 'en'
  if (normalizedLocale === 'zhhant' || normalizedLocale === 'zh-hant') {
    return 'zhHant'
  }
  if (normalizedLocale === 'zhhans' || normalizedLocale === 'zh-hans') {
    return 'zhHans'
  }

  return supportedLocaleKeys.includes(locale as LocaleKey)
    ? (locale as LocaleKey)
    : null
}

/**
 * Returns the human title for a scenario card.
 *
 * @param scenario - Scenario kind.
 * @returns Short display title.
 */
function getScenarioTitle(scenario: FeatureTranslationScenarioKind): string {
  if (scenario === 1) return 'Single Locale'
  if (scenario === 2) return 'Chinese Pair'
  return 'Chinese Bridge'
}

/**
 * Returns explanatory text for a scenario card.
 *
 * @param scenario - Scenario kind.
 * @returns One-sentence scenario description.
 */
function getScenarioDescription(scenario: FeatureTranslationScenarioKind): string {
  if (scenario === 1) return 'One locale is present; the other two are generated.'
  if (scenario === 2)
    return 'Traditional and Simplified Chinese exist; English is generated.'
  return 'English and one Chinese locale exist; the missing Chinese locale is generated.'
}

// ---

/********************
 *  2. PERSISTENCE
 ************/
// +++ Persistence

/**
 * Stores translated title and description values into per-row enriched data.
 *
 * @param importCtx - Import flow state owner.
 * @param scenarios - Translation scenarios that produced the results.
 * @param translationResults - Translated values keyed by scenario index.
 * @returns Nothing; row enriched data is updated in place through `ImportCtx`.
 */
export function saveFeatureTranslationResults(
  importCtx: ImportCtx,
  scenarios: FeatureTranslationScenario[],
  translationResults: FeatureTranslationResultMap,
): void {
  const titleTranslations = new Map<number, Partial<Record<LocaleKey, string>>>()
  const descriptionTranslations = new Map<number, Partial<Record<LocaleKey, string>>>()

  scenarios.forEach((scenario, scenarioIndex) => {
    const scenarioResults = translationResults.get(scenarioIndex)
    if (!scenarioResults) return

    scenario.targetLocales.forEach(targetLocale => {
      const translatedValue = scenarioResults[targetLocale]
      if (!translatedValue) return

      const targetMap =
        scenario.field === 'title' ? titleTranslations : descriptionTranslations
      const existing = targetMap.get(scenario.rowIndex) ?? {}
      existing[targetLocale] = translatedValue
      targetMap.set(scenario.rowIndex, existing)
    })
  })

  const allRowIndices = new Set([
    ...titleTranslations.keys(),
    ...descriptionTranslations.keys(),
  ])

  allRowIndices.forEach(rowIndex => {
    const existingData = importCtx.getRowEnrichedData(rowIndex) || {}
    const updates: Record<string, unknown> = { ...existingData }

    if (titleTranslations.has(rowIndex)) {
      updates.titleTranslations = titleTranslations.get(rowIndex)
    }

    if (descriptionTranslations.has(rowIndex)) {
      updates.descriptionTranslations = descriptionTranslations.get(rowIndex)
    }

    importCtx.setRowEnrichedData(rowIndex, updates)
  })
}

// ---

/********************
 *  3. BATCHING
 ************/
// +++ Batching

/**
 * Splits translation text into remote-call batches.
 *
 * @param texts - Source text values for one source/target locale direction.
 * @returns Batches constrained by remote API element and character limits.
 */
export function createFeatureTranslationBatches(texts: string[]): string[][] {
  const batches: string[][] = []
  let currentBatch: string[] = []
  let currentCharCount = 0
  const maxElements = 1000
  const maxChars = 50000

  texts.forEach(text => {
    const textLength = text.length

    if (
      currentBatch.length >= maxElements ||
      (currentCharCount + textLength > maxChars && currentBatch.length > 0)
    ) {
      batches.push([...currentBatch])
      currentBatch = []
      currentCharCount = 0
    }

    currentBatch.push(text)
    currentCharCount += textLength
  })

  if (currentBatch.length > 0) {
    batches.push(currentBatch)
  }

  return batches
}

/**
 * Processes translation work grouped by source/target locale direction.
 *
 * @param params - Analysis, current results, remote translator, and status callback.
 * @returns Updated translation result map after all remote batches complete.
 */
export async function processFeatureTranslations(params: {
  analysis: FeatureTranslationAnalysis
  translationResults: FeatureTranslationResultMap
  translateText: FeatureTranslationRemoteTranslate
  onBatchStatus?: (status: FeatureTranslationBatchStatus) => void
}): Promise<FeatureTranslationResultMap> {
  let nextResults = new Map(params.translationResults)
  const groupedWork = getGroupedFeatureTranslationWork(params.analysis.scenarios)
  const groupedBatches = groupedWork.map(([direction, items]) => ({
    direction,
    items,
    batches: createFeatureTranslationBatches(items.map(item => item.sourceText)),
  }))
  const totalBatches = groupedBatches.reduce(
    (total, group) => total + group.batches.length,
    0,
  )
  let batchNumber = 0

  params.onBatchStatus?.({ updates: { totalBatches } })

  for (const group of groupedBatches) {
    const [sourceLocale, targetLocale] = group.direction.split('->') as [
      LocaleKey,
      LocaleKey,
    ]

    for (let index = 0; index < group.batches.length; index += 1) {
      batchNumber += 1
      params.onBatchStatus?.({
        footerStatus: `Batch ${batchNumber} / ${totalBatches}: ${sourceLocale} -> ${targetLocale}`,
        updates: { currentBatch: batchNumber },
      })

      const translations = await params.translateText({
        source: sourceLocale,
        target: targetLocale,
        texts: group.batches[index],
      })

      const batchStartIndex = group.batches
        .slice(0, index)
        .reduce((sum, batch) => sum + batch.length, 0)
      nextResults = saveFeatureTranslationBatchResults({
        translationResults: nextResults,
        items: group.items,
        batchStartIndex,
        targetLocale,
        translations,
      })
      params.onBatchStatus?.({
        updates: {
          status: 'translating',
          currentBatch: batchNumber,
          totalBatches,
        },
      })

      if (index < group.batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500))
      }
    }
  }

  return nextResults
}

/**
 * Groups work items by remote translation direction.
 *
 * @param scenarios - Translation work scenarios to group.
 * @returns Direction-keyed work items for batching.
 */
function getGroupedFeatureTranslationWork(
  scenarios: FeatureTranslationScenario[],
): [string, FeatureTranslationWorkItem[]][] {
  const batchGroups = new Map<string, FeatureTranslationWorkItem[]>()

  scenarios.forEach((scenario, scenarioIndex) => {
    scenario.targetLocales.forEach(targetLocale => {
      const key = `${scenario.sourceLocale}->${targetLocale}`
      const items = batchGroups.get(key) ?? []
      items.push({ ...scenario, scenarioIndex, targetLocale })
      batchGroups.set(key, items)
    })
  })

  return Array.from(batchGroups.entries())
}

/**
 * Saves translated strings from one remote batch into a new result map.
 *
 * @param params - Current results, direction-scoped items, and translated strings.
 * @returns Updated translation result map.
 */
function saveFeatureTranslationBatchResults(params: {
  translationResults: FeatureTranslationResultMap
  items: FeatureTranslationWorkItem[]
  batchStartIndex: number
  targetLocale: LocaleKey
  translations: string[]
}): FeatureTranslationResultMap {
  const nextResults = new Map(params.translationResults)

  params.translations.forEach((translation, index) => {
    const item = params.items[params.batchStartIndex + index]
    if (!item) return

    const scenarioResults = nextResults.get(item.scenarioIndex) ?? {}
    scenarioResults[params.targetLocale] = translation
    nextResults.set(item.scenarioIndex, scenarioResults)
  })

  return nextResults
}

// ---
