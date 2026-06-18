// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 0. IMPORT TYPES
// 1. CSV DROP ORCHESTRATION
// - getDropPayload
// - handleCSVDropEvent
//
// 2. CSV PARSING
// - parseCSVLine
// - parseCSV
// - getSampleValues
// - detectPropertyType
//
// 3. FLOW VIEW MODELS
// - getStepIndex
// - getHeaderProps
// - getFeatureImportHeaderStats
// - getFeatureImportHeaderProgressValue
// - getFeatureImportFooterProps
//
// 4. HEADER MAPPING
// - parseHeader
//
// 5. IMPORT DATA VALIDATION
// - markEmptyPropertyColumnsAsSkip
// - validateFeatureImportTitleColumns
// - validateFeatureImportLocationData
// - normalizeFeatureBooleanValue
// - enrichFeatureImportBooleanFields
//
// 6. PROJECT SELECTION
// - handleProjectSelection
//
// 7. DROP PROCESSING
// - handleCSVDrop
//
// 8. AVAILABLE FIELD OPTIONS
// - getAvailableFields
// ---

// ENUMS
import {
  FieldDiscriminator,
  FirstClassResource,
  type SupportedLocales,
} from '$lib/enums'
// I18N
import { m } from '$lib/i18n'
// TYPES
import type {
  Organisation,
  Project,
  Property,
  FeatureImportStep,
  FeatureCSVColumn,
  Resource,
} from '$lib/client/services/import/types'
import type {
  ImportFooterProps,
  ImportHeaderStatItem,
} from '$lib/bits/patterns/import/components/shared/importLayout.types'
import type { ImportCtx, ImportState } from '$lib/context/import.svelte'

/********************
 *  0. IMPORT TYPES
 ************/
// +++ Import Types

export interface CSVDropEvent {
  acceptedFiles: File[]
  type: 'features' | 'users' | 'events'
}

type CSVDropPayload =
  | CustomEvent<{
      acceptedFiles?: File[]
      type?: 'features' | 'users' | 'events' | 'images'
    }>
  | {
      acceptedFiles?: File[]
      type?: 'features' | 'users' | 'events' | 'images'
    }

type ParsedCSVData = {
  file: File
  headers: string[]
  data: string[][]
  stats: { valid: number; invalid: number; truncated: number }
}

type FeatureImportAppContext = {
  getResourceByIdSync: (
    resourceType: FirstClassResource,
    id: string,
  ) => Resource | undefined
}

export type FeatureResolutionStatusCounts = {
  pending: number
  processing: number
  success: number
  error: number
  skipped: number
  unchanged: number
}

export type GeoLookupStatusCounts = {
  completed: number
  errors: number
  matched: number
  noMatch: number
  total: number
  cacheSize: number
  status: 'loading' | 'ready' | 'processing' | 'paused' | 'complete'
}

type FeatureImportProgressParams = {
  currentStep: FeatureImportStep
  userValidation: ImportState['userValidation']
  layerValidation: ImportState['layerValidation']
  translation: ImportState['translation']
  geoLookupStatusCounts?: GeoLookupStatusCounts
  featureResolutionStatusCounts?: FeatureResolutionStatusCounts
}

type FeatureImportHeaderStatsParams = FeatureImportProgressParams & {
  stats: ImportState['stats']
}

type FeatureImportFooterPropsParams = {
  currentStep: FeatureImportStep
  stepIndex: number
  totalSteps: number
  selectedProject: Project | null
  userValidation: ImportState['userValidation']
  userResolution: ImportState['userResolution']
  layerValidation: ImportState['layerValidation']
  layerResolution: ImportState['layerResolution']
  translation: ImportState['translation']
  translationStartProcessing?: () => void
  translationIsProcessing: boolean
  translationFooterStatus: string
  columns: FeatureCSVColumn[]
  geoLookupClearCache?: () => void
  geoLookupPauseProcessing?: () => void
  geoLookupIsPaused: boolean
  geoLookupIsBusy: boolean
  geoLookupStartProcessing?: () => void
  geoLookupFooterStatus: string
  featureResolutionStatusCounts?: FeatureResolutionStatusCounts
  featureResolutionIsProcessing: boolean
  featureResolutionStartProcessing?: () => void
  propertyCanContinue?: boolean
  canCompleteUserResolution: boolean
  canCompleteLayerResolution: boolean
  onCancel: () => void
  onBack: () => void
  onContinue: () => void
  onResolve: () => void
  onCloseImportFlow: () => void
}

// ---

/********************
 *  1. CSV DROP ORCHESTRATION
 ************/
// +++ Csv Drop Orchestration

function getDropPayload(event: CSVDropPayload): {
  acceptedFiles?: File[]
  type?: 'features' | 'users' | 'events' | 'images'
} {
  return 'detail' in event ? (event.detail ?? {}) : event
}

/**
 * Normalizes a UI drop payload and stores parsed CSV import state in context.
 *
 * @param importCtx - Import flow controller that owns CSV and mapping state.
 * @param event - Drop payload from the pattern dropzone or a compatible event.
 * @returns A promise that resolves after the accepted CSV file has been parsed.
 * @remarks Unsupported import types are normalized by `handleCSVDrop`.
 */
export async function handleCSVDropEvent(
  importCtx: ImportCtx,
  event: CSVDropPayload,
): Promise<void> {
  const payload = getDropPayload(event)
  const csvEvent: CSVDropEvent = {
    acceptedFiles: payload.acceptedFiles ?? [],
    type:
      payload.type === 'features' ||
      payload.type === 'users' ||
      payload.type === 'events'
        ? payload.type
        : 'features',
  }

  console.info('CSV import drop received', {
    type: csvEvent.type,
    acceptedFiles: csvEvent.acceptedFiles.map(file => file.name),
  })

  await handleCSVDrop(csvEvent, (file: File, data: ParsedCSVData) => {
    console.info('CSV import parsed', {
      file: file.name,
      headers: data.headers.length,
      rows: data.data.length,
      stats: data.stats,
    })

    importCtx.setFile(file)
    importCtx.setHeaders(data.headers)
    importCtx.setData(data.data) // Store the complete dataset
    importCtx.setStats(data.stats)
    importCtx.setColumns(
      data.headers.map((header: string, index: number) => {
        const parsedHeader = parseHeader(header, undefined, data.data, index)
        return {
          header,
          sampleValues: getSampleValues(data.data, index),
          modelType: parsedHeader.modelType || 'SKIP',
          locale: parsedHeader.locale || 'None',
          field: parsedHeader.field || '',
          propertyKey: parsedHeader.propertyKey,
          propertyType: parsedHeader.propertyType,
          layerConstraint: parsedHeader.layerConstraint,
          extractedPropertyKey: parsedHeader.extractedPropertyKey,
        } as FeatureCSVColumn
      }),
    )

    // Enter the import flow; parent resources are selected inline on the page.
    importCtx.setShowAssociationModal(false)
    importCtx.setIsTypeSelected(true)
    importCtx.setCurrentStep('column-mapping')
    console.info('CSV import state ready', {
      showAssociationModal: importCtx.getShowAssociationModal(),
      currentStep: importCtx.getCurrentStep(),
      isTypeSelected: importCtx.getIsTypeSelected(),
    })
  })
}

// ---

/********************
 *  2. CSV PARSING
 ************/
// +++ Csv Parsing

/**
 * Parses a single CSV line while preserving quoted delimiters and escaped quotes.
 *
 * @param line - Raw CSV row text.
 * @returns Parsed cell values with surrounding whitespace trimmed.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Handle escaped quotes
        current += '"'
        i++ // Skip the next quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

/**
 * Parses CSV text and filters rows that cannot be safely mapped to the header set.
 *
 * @param text - Raw CSV file contents.
 * @returns Parsed headers, valid row data, and row validity statistics.
 * @remarks Rows with too few cells are rejected; rows with too many cells are truncated.
 */
function parseCSV(text: string): {
  headers: string[]
  data: string[][]
  stats: { valid: number; invalid: number; truncated: number }
} {
  // Normalize line endings and remove BOM if present
  const normalizedText = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/^\uFEFF/, '')
  const lines = normalizedText.split('\n').filter(line => line.trim())

  if (lines.length === 0)
    return { headers: [], data: [], stats: { valid: 0, invalid: 0, truncated: 0 } }

  const headers = parseCSVLine(lines[0])
  const data = lines.slice(1).map(line => parseCSVLine(line))

  const stats = { valid: 0, invalid: 0, truncated: 0 }

  // Only accept rows with exact column count - reject sparse rows
  const validData = data.filter((row, index) => {
    if (row.length === headers.length) {
      stats.valid++
      return true
    } else if (row.length < headers.length) {
      stats.invalid++
      console.error(
        `CSV Parsing: Invalid row ${index + 2} (${stats.invalid} total invalid rows so far)`,
      )
      console.error(`Expected ${headers.length} columns, got ${row.length} columns`)
      console.error(`Headers:`, headers)
      console.error(`Row data:`, row)
      console.error(`---`)
      return false
    } else {
      stats.truncated++
      console.warn(
        `CSV Parsing: Truncated row ${index + 2} (${stats.truncated} total truncated rows so far)`,
      )
      console.warn(
        `Expected ${headers.length} columns, got ${row.length} columns - truncating extra columns`,
      )
      console.warn(`Original row:`, [...row])
      // Truncate rows if they have more columns than headers
      row.splice(headers.length)
      console.warn(`Truncated row:`, row)
      return true
    }
  })

  return { headers, data: validData, stats }
}

/**
 * Returns a small set of representative non-empty sample values for a column.
 *
 * @param data - Parsed CSV row data.
 * @param columnIndex - Index of the column to sample.
 * @param count - Maximum number of unique sample values to return.
 * @returns Unique sample values, or a placeholder when the column is empty.
 */
export function getSampleValues(
  data: string[][],
  columnIndex: number,
  count: number = 3,
): string[] {
  const values = data
    .map(row => row[columnIndex] || '')
    .filter(val => val.trim() !== '')

  if (values.length === 0) return ['No data']

  // Get unique values first
  const uniqueValues = [...new Set(values)]

  // If we have fewer unique values than requested, return all unique values
  if (uniqueValues.length <= count) return uniqueValues

  // Get random sample of unique values
  const shuffled = [...uniqueValues].sort(() => 0.5 - Math.random())
  return shuffled.slice(0, count)
}

/**
 * Infers the property field discriminator for a CSV column from its values.
 *
 * @param data - Parsed CSV row data.
 * @param columnIndex - Index of the property column.
 * @param hasLocale - Whether the header declared a locale for this property.
 * @returns The most likely property field discriminator.
 * @remarks This is heuristic by design; final reconciliation still validates values later.
 */
function detectPropertyType(
  data: string[][],
  columnIndex: number,
  hasLocale: boolean,
): FieldDiscriminator {
  // Get all non-empty values from the column
  const values = data
    .map(row => row[columnIndex] || '')
    .filter(val => val.trim() !== '')
    .map(val => val.trim())

  if (values.length === 0) return FieldDiscriminator.specifier // Default for empty columns

  // Check if all values are unique and no locale -> display type
  const uniqueValues = [...new Set(values)]
  if (uniqueValues.length === values.length && !hasLocale) {
    return FieldDiscriminator.display
  }

  // Check for boolean values (TRUE/FALSE pattern)
  const booleanPattern = /^(true|false|yes|no|1|0)$/i
  if (uniqueValues.every(val => booleanPattern.test(val))) {
    return FieldDiscriminator.classifier
  }

  // For categorical detection, analyze the full dataset
  const valueCounts = new Map<string, number>()
  values.forEach(val => {
    valueCounts.set(val, (valueCounts.get(val) || 0) + 1)
  })

  // Categorical detection logic
  const hasLimitedUniqueValues =
    uniqueValues.length <= 20 && values.length / 3 > uniqueValues.length

  if (hasLimitedUniqueValues) {
    // Calculate repetition ratio (how often values repeat)
    const totalOccurrences = Array.from(valueCounts.values()).reduce(
      (sum, count) => sum + count,
      0,
    )
    const totalUniqueValues = valueCounts.size
    const avgOccurrencePerValue = totalOccurrences / totalUniqueValues

    // If each unique value appears on average more than 1.5 times, it's likely categorical
    if (avgOccurrencePerValue > 1.5) {
      return FieldDiscriminator.classifier
    }

    // For smaller datasets (< 20 items), be more lenient
    if (values.length < 20) {
      const hasAnyRepetition = Array.from(valueCounts.values()).some(count => count > 1)
      if (hasAnyRepetition) {
        return FieldDiscriminator.classifier
      }
    }
  }

  // Default to freeform
  return FieldDiscriminator.specifier
}

// ---

/********************
 *  3. FLOW VIEW MODELS
 ************/
// +++ Flow View Models

/**
 * Converts a feature-import phase to its one-based progress index.
 *
 * @param step - Current feature import phase.
 * @returns One-based step index for the footer progress pips.
 */
export function getStepIndex(step: FeatureImportStep): number {
  const stepOrder: FeatureImportStep[] = [
    'column-mapping',
    'user-matching',
    'layer-matching',
    'property-matching',
    'translation',
    'geo-lookup',
    'feature-resolution',
    'finished',
  ]
  return stepOrder.indexOf(step) + 1
}

/**
 * Creates static header copy for a feature-import phase.
 *
 * @param currentStep - Current feature import phase.
 * @returns Header title, subtitle, and step metadata for the import header.
 */
export function getHeaderProps(currentStep: FeatureImportStep) {
  const stepIndex = getStepIndex(currentStep)
  const totalSteps = 8 // column-mapping, user-matching, layer-matching, property-matching, translation, geo-lookup, feature-resolution, finished

  switch (currentStep) {
    case 'column-mapping':
      return {
        title: 'Select Project & Map CSV Columns',
        subtitle:
          "Choose the destination project, then map each CSV column to the appropriate data model field. Columns marked as 'SKIP' will be ignored.",
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    case 'user-matching':
      return {
        title: 'Match Users',
        subtitle: 'Validating user references in your CSV data.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    case 'layer-matching':
      return {
        title: 'Match Layers',
        subtitle: 'Validating layer references in your CSV data.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    case 'property-matching':
      return {
        title: 'Match Properties',
        subtitle: 'Validating property references in your CSV data.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    case 'translation':
      return {
        title: m.feature_import__translation_step_title(),
        subtitle: m.feature_import__translation_step_subtitle(),
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    case 'geo-lookup':
      return {
        title: 'Geo Lookup',
        subtitle: 'Looking up geographic coordinates for addresses.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    case 'feature-resolution':
      return {
        title: 'Feature Resolution',
        subtitle: 'Reconciling data and uploading features to the system.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    case 'finished':
      return {
        title: 'Import Complete',
        subtitle: 'Your CSV data has been successfully imported.',
        showProgress: true,
        currentStep: stepIndex,
        totalSteps,
      }
    default:
      return {
        title: 'Import CSV Data',
        subtitle: 'Process your CSV file for import.',
        showProgress: false,
        currentStep: 1,
        totalSteps,
      }
  }
}

/**
 * Builds header stat chips for the active feature-import phase.
 *
 * @param params - Current phase and validation/resolution snapshots.
 * @returns Stat chip data for the import header.
 * @remarks The component supplies reactive snapshots; this helper owns only the
 * phase-specific presentation decisions.
 */
export function getFeatureImportHeaderStats(
  params: FeatureImportHeaderStatsParams,
): ImportHeaderStatItem[] {
  const {
    currentStep,
    stats,
    userValidation,
    layerValidation,
    translation,
    featureResolutionStatusCounts,
  } = params

  if (currentStep === 'column-mapping') {
    return [
      { label: 'Valid', value: stats.valid, tone: 'success' },
      {
        label: 'Invalid',
        value: stats.invalid,
        tone: stats.invalid > 0 ? 'error' : 'neutral',
      },
      {
        label: 'Truncated',
        value: stats.truncated,
        tone: stats.truncated > 0 ? 'warning' : 'neutral',
      },
    ]
  }

  if (currentStep === 'user-matching') {
    if (userValidation.showUserSelection || userValidation.showUserResolution) {
      return []
    }

    if (userValidation.isValidating) {
      return [
        {
          label: 'Validated',
          value: `${userValidation.progress} / ${userValidation.total}`,
          tone: 'info',
        },
      ]
    }

    if (userValidation.results.length > 0) {
      const validCount = userValidation.results.filter(result => result.isValid).length
      const invalidCount = userValidation.results.length - validCount

      return [
        { label: 'Valid', value: validCount, tone: 'success' },
        {
          label: 'Invalid',
          value: invalidCount,
          tone: invalidCount > 0 ? 'error' : 'neutral',
        },
      ]
    }
  }

  if (currentStep === 'layer-matching') {
    if (layerValidation.showLayerSelection || layerValidation.showLayerResolution) {
      return []
    }

    if (layerValidation.isValidating) {
      return [
        {
          label: 'Validated',
          value: `${layerValidation.progress} / ${layerValidation.total}`,
          tone: 'info',
        },
      ]
    }

    if (layerValidation.results.length > 0) {
      const validCount = layerValidation.results.filter(result => result.isValid).length
      const invalidCount = layerValidation.results.length - validCount

      return [
        { label: 'Valid', value: validCount, tone: 'success' },
        {
          label: 'Invalid',
          value: invalidCount,
          tone: invalidCount > 0 ? 'error' : 'neutral',
        },
      ]
    }
  }

  if (currentStep === 'translation') {
    return [
      {
        label: m.feature_import__translation_stat_all_translated(),
        value: translation.allTranslated,
        tone: 'success',
      },
      {
        label: m.feature_import__translation_stat_missing_translations(),
        value: translation.missingTranslations,
        tone: translation.missingTranslations > 0 ? 'warning' : 'neutral',
      },
      {
        label: m.feature_import__translation_stat_translating(),
        value: translation.translating,
        tone: translation.translating > 0 ? 'info' : 'neutral',
      },
      {
        label: m.feature_import__translation_stat_not_linguistic(),
        value: translation.notLinguistic,
        tone: 'neutral',
      },
    ]
  }

  if (currentStep === 'geo-lookup' && params.geoLookupStatusCounts) {
    const geo = params.geoLookupStatusCounts
    return [
      {
        label: 'Completed',
        value: `${geo.completed} / ${geo.total}`,
        tone: geo.completed > 0 ? 'success' : 'neutral',
      },
      {
        label: 'Errors',
        value: geo.errors,
        tone: geo.errors > 0 ? 'error' : 'neutral',
      },
      {
        label: 'Matched',
        value: geo.matched,
        tone: geo.matched > 0 ? 'success' : 'neutral',
      },
      {
        label: 'No Match',
        value: geo.noMatch,
        tone: geo.noMatch > 0 ? 'warning' : 'neutral',
      },
      {
        label: 'Cache',
        value: geo.cacheSize,
        tone: 'info',
      },
    ]
  }

  if (currentStep === 'feature-resolution' && featureResolutionStatusCounts) {
    return [
      {
        label: 'Pending',
        value: featureResolutionStatusCounts.pending,
        tone: 'neutral',
      },
      {
        label: 'Processing',
        value: featureResolutionStatusCounts.processing,
        tone: featureResolutionStatusCounts.processing > 0 ? 'warning' : 'neutral',
      },
      {
        label: 'Success',
        value: featureResolutionStatusCounts.success,
        tone: 'success',
      },
      {
        label: 'Errors',
        value: featureResolutionStatusCounts.error,
        tone: featureResolutionStatusCounts.error > 0 ? 'error' : 'neutral',
      },
      {
        label: 'Skipped',
        value: featureResolutionStatusCounts.skipped,
        tone: 'info',
      },
    ]
  }

  if (currentStep === 'finished' && featureResolutionStatusCounts) {
    return [
      {
        label: 'Success',
        value: featureResolutionStatusCounts.success,
        tone: 'success',
      },
      {
        label: 'Errors',
        value: featureResolutionStatusCounts.error,
        tone: featureResolutionStatusCounts.error > 0 ? 'error' : 'neutral',
      },
      {
        label: 'Skipped',
        value: featureResolutionStatusCounts.skipped,
        tone: 'info',
      },
      {
        label: 'Unchanged',
        value: featureResolutionStatusCounts.unchanged,
        tone: 'neutral',
      },
    ]
  }

  return []
}

/**
 * Calculates the import header progress bar value for phases with active work.
 *
 * @param params - Current phase and validation/resolution status snapshots.
 * @returns A percentage value for the header progress bar, or `null` when hidden.
 * @remarks This helper is intentionally context-free so the Svelte component owns
 * reactive reads while this service owns the phase-specific progress decisions.
 */
export function getFeatureImportHeaderProgressValue(
  params: FeatureImportProgressParams,
): number | null {
  const {
    currentStep,
    userValidation,
    layerValidation,
    translation,
    geoLookupStatusCounts,
    featureResolutionStatusCounts,
  } = params

  if (currentStep === 'user-matching') {
    return userValidation.isValidating && userValidation.total > 0
      ? (userValidation.progress / userValidation.total) * 100
      : null
  }

  if (currentStep === 'layer-matching') {
    return layerValidation.isValidating && layerValidation.total > 0
      ? (layerValidation.progress / layerValidation.total) * 100
      : null
  }

  if (currentStep === 'translation') {
    return translation.totalTranslations > 0
      ? (translation.completedTranslations / translation.totalTranslations) * 100
      : translation.status === 'complete'
        ? 100
        : null
  }

  if (currentStep === 'geo-lookup' && geoLookupStatusCounts) {
    return geoLookupStatusCounts.total > 0
      ? ((geoLookupStatusCounts.completed + geoLookupStatusCounts.errors) /
          geoLookupStatusCounts.total) *
          100
      : null
  }

  if (
    (currentStep === 'feature-resolution' || currentStep === 'finished') &&
    featureResolutionStatusCounts
  ) {
    const total =
      featureResolutionStatusCounts.pending +
      featureResolutionStatusCounts.processing +
      featureResolutionStatusCounts.success +
      featureResolutionStatusCounts.error +
      featureResolutionStatusCounts.skipped +
      featureResolutionStatusCounts.unchanged
    const completed =
      featureResolutionStatusCounts.success +
      featureResolutionStatusCounts.error +
      featureResolutionStatusCounts.skipped +
      featureResolutionStatusCounts.unchanged

    return total > 0 ? (completed / total) * 100 : null
  }

  return null
}

/**
 * Builds footer actions and affordances for the current feature-import phase.
 *
 * @param params - Current phase state, callback actions, and validation snapshots.
 * @returns Props for the import footer pattern component.
 * @remarks The returned callbacks are provided by the Svelte component/page layer;
 * this service only decides which callback and labels are active for each phase.
 */
export function getFeatureImportFooterProps(
  params: FeatureImportFooterPropsParams,
): ImportFooterProps {
  const baseProps: ImportFooterProps = {
    showPips: true,
    currentStep: params.stepIndex,
    totalSteps: params.totalSteps,
  }

  if (params.currentStep === 'column-mapping') {
    return {
      ...baseProps,
      onBack: params.onCancel,
      onContinue: params.onContinue,
      continueDisabled: !params.selectedProject,
    }
  }

  if (params.currentStep === 'user-matching') {
    const invalidCount = params.userValidation.results.filter(
      result => !result.isValid,
    ).length

    if (params.userValidation.showUserSelection) {
      return {
        ...baseProps,
        onBack: params.onBack,
        onContinue: params.onContinue,
        continueDisabled: !params.userValidation.fallbackUserId,
      }
    }

    if (params.userValidation.showUserResolution) {
      const resolvedCount = params.userResolution.resolutions.size
      const totalCount = params.userResolution.invalidValues.length
      return {
        ...baseProps,
        onBack: params.onBack,
        onContinue: params.onContinue,
        continueDisabled: !params.canCompleteUserResolution,
        rightMetaText: `Resolved: ${resolvedCount} / ${totalCount}`,
      }
    }

    if (
      params.userValidation.results.length > 0 &&
      !params.userValidation.isValidating
    ) {
      if (invalidCount === 0) {
        return {
          ...baseProps,
          onBack: params.onBack,
          onContinue: params.onContinue,
        }
      }

      return {
        ...baseProps,
        onBack: params.onBack,
        onContinue: params.onResolve,
        continueLabel: `Resolve ${invalidCount} Invalid User${invalidCount > 1 ? 's' : ''}`,
      }
    }
  }

  if (params.currentStep === 'layer-matching') {
    const invalidCount = params.layerValidation.results.filter(
      result => !result.isValid,
    ).length

    if (params.layerValidation.showLayerSelection) {
      return {
        ...baseProps,
        onBack: params.onBack,
        onContinue: params.onContinue,
        continueDisabled: !params.layerValidation.fallbackLayerId,
      }
    }

    if (params.layerValidation.showLayerResolution) {
      const resolvedCount = params.layerResolution.resolutions.size
      const totalCount = params.layerResolution.invalidValues.length

      return {
        ...baseProps,
        onBack: params.onBack,
        onContinue: params.onContinue,
        continueDisabled: !params.canCompleteLayerResolution,
        rightMetaText: `Resolved: ${resolvedCount} / ${totalCount}`,
      }
    }

    if (
      params.layerValidation.results.length > 0 &&
      !params.layerValidation.isValidating
    ) {
      if (invalidCount === 0) {
        return {
          ...baseProps,
          onBack: params.onBack,
          onContinue: params.onContinue,
        }
      }

      return {
        ...baseProps,
        onBack: params.onBack,
        onContinue: params.onResolve,
        continueLabel: `Resolve ${invalidCount} Invalid Layer${invalidCount > 1 ? 's' : ''}`,
      }
    }
  }

  if (params.currentStep === 'property-matching') {
    return {
      ...baseProps,
      onBack: params.onBack,
      onContinue: params.propertyCanContinue ? params.onContinue : undefined,
      // Property reconciliation handles its own navigation.
    }
  }

  if (params.currentStep === 'translation') {
    const isComplete = params.translation.status === 'complete'
    const isBusy =
      params.translationIsProcessing || params.translation.status === 'translating'
    const hasWork = params.translation.totalTranslations > 0

    return {
      ...baseProps,
      onBack: params.onBack,
      onContinue: isComplete ? params.onContinue : params.translationStartProcessing,
      continueLabel: isComplete
        ? m.continue()
        : hasWork
          ? isBusy
            ? m.feature_import__translation_footer_translating()
            : m.feature_import__translation_footer_start()
          : m.continue(),
      continueDisabled: !isComplete && (!params.translationStartProcessing || isBusy),
      leftMetaText: params.translationFooterStatus,
      rightMetaText: hasWork
        ? m.feature_import__translation_footer_translated({
            completed: params.translation.completedTranslations,
            total: params.translation.totalTranslations,
          })
        : '',
    }
  }

  if (params.currentStep === 'geo-lookup') {
    const canStartGeoLookup =
      params.columns.some(
        column => column.field === 'displayAddress' || column.field === 'rawAddress',
      ) || params.columns.some(column => column.field === 'latitude')

    return {
      ...baseProps,
      onBack: params.onBack,
      onSecondary: params.geoLookupClearCache,
      secondaryPlacement: 'left',
      secondaryLabel: 'Clear Cache',
      secondaryDisabled: false,
      onContinue: params.geoLookupIsBusy
        ? params.geoLookupPauseProcessing
        : params.geoLookupStartProcessing,
      continueLabel: params.geoLookupIsBusy
        ? params.geoLookupIsPaused
          ? 'Resume'
          : 'Pause'
        : canStartGeoLookup
          ? 'Start Geocoding'
          : 'Continue',
      continueDisabled: params.geoLookupIsBusy
        ? !params.geoLookupPauseProcessing
        : !params.geoLookupStartProcessing,
      leftMetaText: params.geoLookupFooterStatus,
    }
  }

  if (params.currentStep === 'feature-resolution') {
    const pending = params.featureResolutionStatusCounts?.pending ?? 0
    const processing = params.featureResolutionStatusCounts?.processing ?? 0
    const hasCompletedResolution =
      pending === 0 && processing === 0 && !params.featureResolutionIsProcessing

    return {
      ...baseProps,
      onBack: params.onBack,
      onContinue: hasCompletedResolution
        ? params.onContinue
        : params.featureResolutionStartProcessing,
      continueLabel: hasCompletedResolution ? 'Continue' : 'Start Processing',
      continueDisabled: hasCompletedResolution
        ? false
        : !params.featureResolutionStartProcessing ||
          pending === 0 ||
          processing > 0 ||
          params.featureResolutionIsProcessing,
    }
  }

  if (params.currentStep === 'finished') {
    return {
      ...baseProps,
      onContinue: params.onCloseImportFlow,
      continueLabel: 'Finish',
    }
  }

  return baseProps
}

// ---

/********************
 *  4. HEADER MAPPING
 ************/
// +++ Header Mapping

/**
 * Parses a CSV header into the import column model used by feature imports.
 *
 * @param header - Raw CSV header text.
 * @param _project - Selected project context reserved for project-aware parsing.
 * @param data - Parsed CSV rows used for heuristic property type detection.
 * @param columnIndex - Index of the column being parsed.
 * @param fetchedProperties - Project properties already available to the import flow.
 * @param selectedLocale - Locale to use when no locale is specified in the header.
 * @returns Partial column mapping metadata inferred from the header syntax.
 * @remarks Header syntax supports explicit model prefixes, i18n suffixes, and
 * property layer constraints such as `property[layer@foo].ownership`.
 */
export function parseHeader(
  header: string,
  _project?: Project,
  data?: string[][],
  columnIndex?: number,
  fetchedProperties: Property[] = [],
  selectedLocale: string = 'en',
): Partial<FeatureCSVColumn> {
  const parsed: Partial<FeatureCSVColumn> = {
    modelType: 'SKIP',
    locale: 'None',
    field: '',
    propertyKey: undefined,
    propertyType: undefined,
    layerConstraint: undefined,
  }

  // Handle property syntax with optional locale and layer constraints
  // property[locale=en,layer@wetmarket].ownership or property[layer@wetmarket].ownership
  const propertyMatch = header.match(/^property\[([^\]]+)\]\.(.+)$/)
  if (propertyMatch) {
    const [, constraintSpec, fieldPath] = propertyMatch
    parsed.modelType = 'Property'
    parsed.field = fieldPath

    // Extract property key from the field path - handle new .id and .valueId syntax
    const fieldParts = fieldPath.split('.')
    let extractedPropertyKey: string
    let actualField: string

    if (
      fieldParts.length > 1 &&
      (fieldParts[fieldParts.length - 1] === 'id' ||
        fieldParts[fieldParts.length - 1] === 'valueId')
    ) {
      // Handle property[layer@ALL].chain.id or property[layer@ALL].chain.valueId
      extractedPropertyKey = fieldParts[fieldParts.length - 2]
      actualField = fieldParts[fieldParts.length - 1] // 'id' or 'valueId'
    } else {
      // Handle property[layer@ALL].chain (value field)
      extractedPropertyKey = fieldParts[fieldParts.length - 1]
      actualField = 'value'
    }

    // Parse constraints - need to be careful with comma splitting when curly braces are present
    const constraints: string[] = []
    let current = ''
    let braceDepth = 0

    for (let i = 0; i < constraintSpec.length; i++) {
      const char = constraintSpec[i]
      if (char === '{') {
        braceDepth++
      } else if (char === '}') {
        braceDepth--
      } else if (char === ',' && braceDepth === 0) {
        constraints.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    constraints.push(current.trim())

    for (const constraint of constraints) {
      // Handle both 'locale=' and 'local=' for backward compatibility
      const localeMatch = constraint.match(/^local(?:e)?=(.+)$/)
      if (localeMatch) {
        // Normalize locale variations
        let normalizedLocale = localeMatch[1].toLowerCase().replace('-', '')
        if (normalizedLocale === 'zhhant') {
          normalizedLocale = 'zh-hant'
        } else if (normalizedLocale === 'zhhans') {
          normalizedLocale = 'zh-hans'
        } else {
          normalizedLocale = localeMatch[1].toLowerCase()
        }
        parsed.locale = normalizedLocale as SupportedLocales
      }

      const layerMatch = constraint.match(/^layer@(.+)$/)
      if (layerMatch) {
        let layerSpec = layerMatch[1]

        // Remove curly braces if present
        if (layerSpec.startsWith('{') && layerSpec.endsWith('}')) {
          layerSpec = layerSpec.slice(1, -1)
        }

        if (layerSpec === 'ALL') {
          parsed.layerConstraint = { type: 'all', layers: ['ALL'] }
        } else {
          // Split by comma and trim each layer code
          const layers = layerSpec.split(',').map(l => l.trim())
          parsed.layerConstraint = { type: 'multiple', layers }
        }
      }
    }

    // Store the extracted property key separately
    parsed.extractedPropertyKey = extractedPropertyKey

    // Check if property key exists in the fetched property keys
    const existingProperty = fetchedProperties.find(p => p.key === extractedPropertyKey)
    if (existingProperty) {
      // If it exists, default to selecting that existing property
      parsed.propertyKey = extractedPropertyKey
      parsed.field = actualField // Use the actual field (value, id, or valueId)
      parsed.propertyType = existingProperty.type as FieldDiscriminator
    } else {
      // If it doesn't exist, default to NEW (which will use the extracted key)
      parsed.propertyKey = 'NEW'
      parsed.field = actualField // Use the actual field (value, id, or valueId)

      // Detect property type for new properties (only for value fields)
      if (actualField === 'value' && data && columnIndex !== undefined) {
        const hasLocale = Boolean(parsed.locale && parsed.locale !== 'None')
        parsed.propertyType = detectPropertyType(data, columnIndex, hasLocale)
      } else {
        parsed.propertyType = FieldDiscriminator.specifier // Default
      }
    }

    return parsed
  }

  // Handle i18n syntax: model.i18n[locale=locale].field or modelI18n[locale=locale].field
  const i18nMatch =
    header.match(/^(feature|layer)\.i18n\[local(?:e)?=([^}]+)\]\.(.+)$/) ||
    header.match(/^(feature|layer)I18n\[local(?:e)?=([^}]+)\]\.(.+)$/)
  if (i18nMatch) {
    const [, model, rawLocale, field] = i18nMatch

    // Check if this is an addressProperties field
    if (field.startsWith('addressProperties.')) {
      parsed.modelType = 'Address'
      parsed.field = field.replace('addressProperties.', '') // Remove the prefix
    } else {
      parsed.modelType = (model.charAt(0).toUpperCase() + model.slice(1)) as
        | 'Feature'
        | 'Layer'
      parsed.field = field

      // `featureId` and `locale` are derived relation/locale metadata in i18n rows.
      // Generation flags are real locale-specific booleans and should stay importable.
      const derivedI18nFields = ['featureId', 'locale']
      if (derivedI18nFields.includes(field)) {
        parsed.modelType = 'SKIP'
        parsed.field = ''
      }
    }

    // Normalize locale variations
    let normalizedLocale = rawLocale.toLowerCase().replace('-', '')
    if (normalizedLocale === 'zhhant') {
      normalizedLocale = 'zh-hant'
    } else if (normalizedLocale === 'zhhans') {
      normalizedLocale = 'zh-hans'
    } else {
      // Keep original format for en and properly formatted locales
      normalizedLocale = rawLocale.toLowerCase()
    }

    parsed.locale = normalizedLocale as SupportedLocales
    return parsed
  }

  // Handle shortform locale syntax: model[locale=locale].field
  const shortFormMatch = header.match(/^(feature|layer)\[local(?:e)?=([^\]]+)\]\.(.+)$/)
  if (shortFormMatch) {
    const [, model, rawLocale, field] = shortFormMatch
    parsed.modelType = (model.charAt(0).toUpperCase() + model.slice(1)) as
      | 'Feature'
      | 'Layer'

    // Normalize locale variations (same logic as i18n)
    let normalizedLocale = rawLocale.toLowerCase().replace('-', '')
    if (normalizedLocale === 'zhhant') {
      normalizedLocale = 'zh-hant'
    } else if (normalizedLocale === 'zhhans') {
      normalizedLocale = 'zh-hans'
    } else {
      normalizedLocale = rawLocale.toLowerCase()
    }

    parsed.locale = normalizedLocale as SupportedLocales
    parsed.field = field
    return parsed
  }

  // Handle coordinate syntax
  const coordinateMatches = [
    { pattern: /^feature\.geometry\.coordinates\[0\]$/, field: 'longitude' },
    { pattern: /^feature\.geometry\.coordinates\[1\]$/, field: 'latitude' },
    { pattern: /^feature\.(latitude|lat)$/, field: 'latitude' },
    { pattern: /^feature\.(longitude|lng|long|lon)$/, field: 'longitude' },
    { pattern: /^feature\.geometry\.(lat|latitude)$/, field: 'latitude' },
    { pattern: /^feature\.geometry\.(lng|lon|long|longitude)$/, field: 'longitude' },
  ]

  for (const { pattern, field } of coordinateMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'Feature'
      parsed.locale = 'None'
      parsed.field = field
      return parsed
    }
  }

  // Handle direct feature fields
  const featureFieldMatches = [
    { pattern: /^feature\.id$/, field: 'id' },
    { pattern: /^feature\.archived$/, field: 'archived' },
    { pattern: /^feature\.intangible$/, field: 'intangible' },
    { pattern: /^feature\.visitable$/, field: 'visitable' },
    { pattern: /^feature\.lastSeen$/, field: 'lastSeen' },
    { pattern: /^feature\.published$/, field: 'published' },
    // Boolean field patterns with is prefix
    { pattern: /^feature\.isPublished$/, field: 'published' },
    { pattern: /^feature\.isArchived$/, field: 'archived' },
    { pattern: /^feature\.isVisitable$/, field: 'visitable' },
    { pattern: /^feature\.isIntangible$/, field: 'intangible' },
  ]

  for (const { pattern, field } of featureFieldMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'Feature'
      parsed.locale = 'None'
      parsed.field = field
      return parsed
    }
  }

  // Handle user fields
  const userFieldMatches = [
    { pattern: /^user\.id$/, field: 'id' },
    { pattern: /^user\.email$/, field: 'email' },
    { pattern: /^user\.username$/, field: 'username' },
  ]

  for (const { pattern, field } of userFieldMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'User'
      parsed.field = field
      return parsed
    }
  }

  // Auto-detect user field type based on column data
  if (data && columnIndex !== undefined && header.toLowerCase().includes('user')) {
    const nonEmptyValues = data
      .map(row => row[columnIndex] || '')
      .filter(val => val.trim() !== '')

    if (nonEmptyValues.length > 0) {
      // Check if all non-empty values have @ symbol (email)
      const allHaveAtSymbol = nonEmptyValues.every(val => val.includes('@'))

      // Check if all non-empty values are 12, 16, 24, or 32 characters (ID)
      const validIdLengths = [12, 16, 24, 32]
      const allAreValidIds = nonEmptyValues.every(val =>
        validIdLengths.includes(val.trim().length),
      )

      if (allHaveAtSymbol) {
        parsed.modelType = 'User'
        parsed.field = 'email'
        return parsed
      } else if (allAreValidIds) {
        parsed.modelType = 'User'
        parsed.field = 'id'
        return parsed
      } else {
        parsed.modelType = 'User'
        parsed.field = 'username'
        return parsed
      }
    }
  }

  // Handle layer fields
  const layerFieldMatches = [
    { pattern: /^layer\.id$/, field: 'id' },
    { pattern: /^layer\.name$/, field: 'name' },
  ]

  for (const { pattern, field } of layerFieldMatches) {
    if (pattern.test(header)) {
      parsed.modelType = 'Layer'
      parsed.locale =
        field === 'name' ? (selectedLocale as FeatureCSVColumn['locale']) : 'None'
      parsed.field = field
      return parsed
    }
  }

  // Auto-detect layer field type based on column data
  if (data && columnIndex !== undefined && header.toLowerCase().includes('layer')) {
    const nonEmptyValues = data
      .map(row => row[columnIndex] || '')
      .filter(val => val.trim() !== '')

    if (nonEmptyValues.length > 0) {
      // Check if all non-empty values are 12, 16, 24, or 32 characters (ID)
      const validIdLengths = [12, 16, 24, 32]
      const allAreValidIds = nonEmptyValues.every(val =>
        validIdLengths.includes(val.trim().length),
      )

      if (allAreValidIds) {
        parsed.modelType = 'Layer'
        parsed.locale = 'None'
        parsed.field = 'id'
        return parsed
      } else {
        parsed.modelType = 'Layer'
        parsed.locale = selectedLocale as FeatureCSVColumn['locale']
        parsed.field = 'name'
        return parsed
      }
    }
  }

  // Handle Address model syntax: address[locale=locale].field
  const addressMatch = header.match(/^address\[local(?:e)?=([^\]]+)\]\.(.+)$/)
  if (addressMatch) {
    const [, rawLocale, field] = addressMatch
    parsed.modelType = 'Address'

    // Normalize locale variations
    let normalizedLocale = rawLocale.toLowerCase().replace('-', '')
    if (normalizedLocale === 'zhhant') {
      normalizedLocale = 'zh-hant'
    } else if (normalizedLocale === 'zhhans') {
      normalizedLocale = 'zh-hans'
    } else {
      normalizedLocale = rawLocale.toLowerCase()
    }

    parsed.locale = normalizedLocale as SupportedLocales
    parsed.field = field
    return parsed
  }

  // Handle AddressMeta model syntax: addressMeta.field
  const addressMetaMatch = header.match(/^addressMeta\.(.+)$/)
  if (addressMetaMatch) {
    const [, field] = addressMetaMatch
    parsed.modelType = 'AddressMeta'
    parsed.locale = 'None'
    parsed.field = field

    // Skip auto-generated addressMeta fields by default
    const autoGeneratedAddressMetaFields = [
      'addressReverseGen',
      'addressForwardGen',
      'confidenceForwardGeocoder',
      'addressForwardGeocoder',
      // Note: addressReverseGeocoder is removed - it can be user-provided
    ]
    if (autoGeneratedAddressMetaFields.includes(field)) {
      parsed.modelType = 'SKIP'
      parsed.field = ''
    }

    return parsed
  }

  return parsed
}

// ---

/********************
 *  5. IMPORT DATA VALIDATION
 ************/
// +++ Import Data Validation

/**
 * Marks empty property value columns as skipped before continuing validation.
 *
 * @param importCtx - Import flow controller containing parsed CSV data.
 * @returns Nothing; updates column mappings in the import context.
 */
export function markEmptyPropertyColumnsAsSkip(importCtx: ImportCtx): void {
  const columns = importCtx.getColumns()
  const data = importCtx.getData()

  columns.forEach(column => {
    if (column.modelType !== 'Property' || column.field !== 'value') return

    const columnIndex = importCtx.getColumnIndex(column)
    const values = data
      .map(row => row[columnIndex])
      .filter(value => value?.trim())
      .map(value => value.trim())

    // Empty property columns should not block the import.
    if (values.length === 0) {
      column.modelType = 'SKIP'
      column.field = ''
      column.propertyKey = undefined
      column.propertyType = undefined
      column.layerConstraint = undefined
      column.extractedPropertyKey = undefined
    }
  })

  importCtx.setColumns([...columns])
}

/**
 * Validates that mapped feature title columns have values in at least one locale.
 *
 * @param importCtx - Import flow controller containing mapped columns and rows.
 * @returns Validation result and reviewable error messages.
 */
export function validateFeatureImportTitleColumns(importCtx: ImportCtx): {
  isValid: boolean
  errors: string[]
} {
  const columns = importCtx.getColumns()
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()
  const errors: string[] = []

  const titleColumns = columns.filter(
    column => column.modelType === 'Feature' && column.field === 'title',
  )
  const descriptionColumns = columns.filter(
    column => column.modelType === 'Feature' && column.field === 'description',
  )

  if (titleColumns.length === 0) {
    return { isValid: true, errors: [] }
  }

  const titleLocaleToColumnIndex = new Map<string, number>()
  titleColumns.forEach(column => {
    const columnIndex = headers.indexOf(column.header)
    if (columnIndex !== -1 && column.locale) {
      titleLocaleToColumnIndex.set(column.locale, columnIndex)
    }
  })

  const descriptionLocaleToColumnIndex = new Map<string, number>()
  descriptionColumns.forEach(column => {
    const columnIndex = headers.indexOf(column.header)
    if (columnIndex !== -1 && column.locale) {
      descriptionLocaleToColumnIndex.set(column.locale, columnIndex)
    }
  })

  const rowsWithoutTitles: number[] = []
  const rowsWithoutDescriptions: number[] = []

  data.forEach((row, index) => {
    let hasAnyTitle = false
    let hasAnyDescription = false

    titleLocaleToColumnIndex.forEach(columnIndex => {
      const value = row[columnIndex]?.trim()
      if (value && value.length > 0) {
        hasAnyTitle = true
      }
    })

    descriptionLocaleToColumnIndex.forEach(columnIndex => {
      const value = row[columnIndex]?.trim()
      if (value && value.length > 0) {
        hasAnyDescription = true
      }
    })

    if (!hasAnyTitle) {
      rowsWithoutTitles.push(index + 2)
      console.warn(`Row ${index + 2} has no title in any locale:`, row)
    }

    if (descriptionColumns.length > 0 && !hasAnyDescription) {
      rowsWithoutDescriptions.push(index + 2)
      console.info(`Row ${index + 2} has no description in any locale:`, row)
    }
  })

  if (rowsWithoutTitles.length > 0) {
    errors.push(
      `Found ${rowsWithoutTitles.length} rows without titles in any locale.\n` +
        `Rows: ${rowsWithoutTitles.slice(0, 10).join(', ')}` +
        `${rowsWithoutTitles.length > 10 ? '...' : ''}\n\n` +
        'Please ensure every row has a title value in at least one locale column.',
    )
  }

  if (rowsWithoutDescriptions.length > 0) {
    console.info(
      `Info: ${rowsWithoutDescriptions.length} rows have no descriptions (optional field)`,
    )
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Validates that mapped rows contain either address or coordinate location data.
 *
 * @param importCtx - Import flow controller containing mapped columns and rows.
 * @returns Validation result and reviewable error messages.
 */
export function validateFeatureImportLocationData(importCtx: ImportCtx): {
  isValid: boolean
  errors: string[]
} {
  const columns = importCtx.getColumns()
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()
  const errors: string[] = []

  const addressColumns = columns.filter(
    column =>
      column.modelType === 'Feature' &&
      (column.field === 'displayAddress' || column.field === 'rawAddress'),
  )
  const latitudeColumns = columns.filter(
    column => column.modelType === 'Feature' && column.field === 'latitude',
  )
  const longitudeColumns = columns.filter(
    column => column.modelType === 'Feature' && column.field === 'longitude',
  )

  if (
    addressColumns.length === 0 &&
    latitudeColumns.length === 0 &&
    longitudeColumns.length === 0
  ) {
    errors.push(
      'No location data columns found.\n\n' +
        'Please map at least one of the following:\n' +
        '- Address columns (displayAddress field)\n' +
        '- Coordinate columns (latitude/longitude fields)',
    )
    return { isValid: false, errors }
  }

  const addressLocaleToColumnIndex = new Map<string, number>()
  addressColumns.forEach(column => {
    const columnIndex = headers.indexOf(column.header)
    if (columnIndex !== -1 && column.locale) {
      addressLocaleToColumnIndex.set(column.locale, columnIndex)
    }
  })

  const latitudeColumnIndex =
    latitudeColumns.length > 0 ? headers.indexOf(latitudeColumns[0].header) : -1
  const longitudeColumnIndex =
    longitudeColumns.length > 0 ? headers.indexOf(longitudeColumns[0].header) : -1

  const rowsWithoutLocation: number[] = []

  data.forEach((row, index) => {
    let hasAddress = false
    let hasCoordinates = false

    addressLocaleToColumnIndex.forEach(columnIndex => {
      const value = row[columnIndex]?.trim()
      if (value && value.length > 0) {
        hasAddress = true
      }
    })

    if (latitudeColumnIndex !== -1 && longitudeColumnIndex !== -1) {
      const latitude = row[latitudeColumnIndex]?.trim()
      const longitude = row[longitudeColumnIndex]?.trim()
      if (
        latitude &&
        longitude &&
        !Number.isNaN(Number.parseFloat(latitude)) &&
        !Number.isNaN(Number.parseFloat(longitude))
      ) {
        hasCoordinates = true
      }
    }

    if (!hasAddress && !hasCoordinates) {
      rowsWithoutLocation.push(index + 2)
      console.warn(`Row ${index + 2} has no location data:`, row)
    }
  })

  if (rowsWithoutLocation.length > 0) {
    errors.push(
      `Found ${rowsWithoutLocation.length} rows without location data.\n` +
        `Rows: ${rowsWithoutLocation.slice(0, 10).join(', ')}` +
        `${rowsWithoutLocation.length > 10 ? '...' : ''}\n\n` +
        'Each row must have EITHER:\n' +
        '- An address in at least one locale, OR\n' +
        '- Valid latitude and longitude coordinates\n\n' +
        'Please provide location data for all rows or remove rows without location information.',
    )
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Normalizes common CSV boolean spellings into booleans.
 *
 * @param value - Raw CSV cell value.
 * @returns Parsed boolean value, or `null` when the value is empty/unsupported.
 */
export function normalizeFeatureBooleanValue(
  value: string | null | undefined,
): boolean | null {
  if (!value) return null

  const normalizedValue = value.toString().trim().toUpperCase()

  if (['TRUE', '1', 'YES', 'Y'].includes(normalizedValue)) {
    return true
  }

  if (['FALSE', '0', 'NO', 'N'].includes(normalizedValue)) {
    return false
  }

  return null
}

/**
 * Adds normalized feature boolean fields to per-row enriched data.
 *
 * @param importCtx - Import flow controller containing mapped columns and rows.
 * @returns Nothing; updates row enrichment data in the import context.
 */
export function enrichFeatureImportBooleanFields(importCtx: ImportCtx): void {
  const columns = importCtx.getColumns()
  const data = importCtx.getData()
  const headers = importCtx.getHeaders()
  const booleanFieldMap = new Map<string, string>([
    ['isPublished', 'isPublished'],
    ['published', 'isPublished'],
    ['isArchived', 'isArchived'],
    ['archived', 'isArchived'],
    ['isVisitable', 'isVisitable'],
    ['visitable', 'isVisitable'],
    ['isIntangible', 'isIntangible'],
    ['intangible', 'isIntangible'],
  ])

  const booleanColumns = columns.filter(
    column =>
      column.modelType === 'Feature' &&
      column.field &&
      booleanFieldMap.has(column.field),
  )

  if (booleanColumns.length === 0) return

  data.forEach((row, rowIndex) => {
    const enrichedData = (importCtx.getRowEnrichedData(rowIndex) || {}) as {
      feature?: Record<string, boolean>
    }

    if (!enrichedData.feature) {
      enrichedData.feature = {}
    }
    const featureData = enrichedData.feature

    booleanColumns.forEach(column => {
      const columnIndex = headers.indexOf(column.header)
      if (columnIndex === -1 || !column.field) return

      const normalizedValue = normalizeFeatureBooleanValue(row[columnIndex])
      if (normalizedValue === null) return

      const canonicalFieldName = booleanFieldMap.get(column.field)
      if (!canonicalFieldName) return

      featureData[canonicalFieldName] = normalizedValue
    })

    importCtx.setRowEnrichedData(rowIndex, enrichedData)
  })
}

// ---

/********************
 *  6. PROJECT SELECTION
 ************/
// +++ Project Selection

/**
 * Applies the selected project and re-parses CSV column mappings with project context.
 *
 * @param selectedProject - Destination project selected by the user.
 * @param importCtx - Import flow controller that owns CSV mapping state.
 * @param appCtx - Application context used to resolve the parent organisation.
 * @param fetchAvailablePropertyKeys - Loader for project-scoped property metadata.
 * @param setTypeSelected - Callback that marks the import type as selected.
 * @returns A promise that resolves after project metadata and columns are refreshed.
 */
export async function handleProjectSelection(
  selectedProject: Project,
  importCtx: ImportCtx,
  appCtx: FeatureImportAppContext,
  fetchAvailablePropertyKeys: (ctx?: ImportCtx) => Promise<void>,
  setTypeSelected: (selected: boolean) => void,
) {
  // Cast to Project type and store
  importCtx.setSelectedProject(selectedProject)

  // Get the organisation for this project
  const organisation = appCtx.getResourceByIdSync(
    FirstClassResource.organisation,
    selectedProject.organisationId,
  ) as Organisation | undefined

  importCtx.setSelectedOrganisation(organisation ?? null)

  // Fetch available property keys for the selected project
  await fetchAvailablePropertyKeys(importCtx)

  // Re-parse headers now that we know the project context
  importCtx.setColumns(
    importCtx.getHeaders().map((header: string, index: number) => {
      const parsedHeader = parseHeader(
        header,
        selectedProject,
        importCtx.getData(),
        index,
        importCtx.getFetchedProperties() || [],
        importCtx.getSelectedLocale() || 'en',
      )
      return {
        header,
        sampleValues: getSampleValues(importCtx.getData(), index),
        modelType: parsedHeader.modelType || 'SKIP',
        locale: parsedHeader.locale || 'None',
        field: parsedHeader.field || '',
        propertyKey: parsedHeader.propertyKey,
        propertyType: parsedHeader.propertyType,
        layerConstraint: parsedHeader.layerConstraint,
        extractedPropertyKey: parsedHeader.extractedPropertyKey,
      }
    }),
  )

  importCtx.setShowAssociationModal(false)
  importCtx.setCurrentStep('column-mapping')
  setTypeSelected(true)
}

// ---

/********************
 *  7. DROP PROCESSING
 ************/
// +++ Drop Processing

/**
 * Reads the first accepted CSV file and emits parsed data to the caller.
 *
 * @param event - CSV drop event containing accepted files and import type.
 * @param onFileProcessed - Callback that receives the parsed file payload.
 * @returns A promise that resolves when file reading and parsing complete.
 * @remarks Only feature CSV imports are currently handled by this service.
 */
export async function handleCSVDrop(
  event: CSVDropEvent,
  onFileProcessed: (file: File, data: ParsedCSVData) => void,
): Promise<void> {
  const { acceptedFiles, type } = event

  if (type !== 'features') {
    console.warn(`${type} import is not yet implemented`)
    return
  }

  if (acceptedFiles.length === 0) return

  const file = acceptedFiles[0]

  try {
    console.info('CSV import reading file', {
      name: file.name,
      size: file.size,
      type: file.type,
    })
    const text = await file.text()
    const { headers, data, stats } = parseCSV(text)

    if (headers.length === 0) {
      console.error('Invalid CSV file: No headers found')
      return
    }

    const processedData = {
      file,
      headers,
      data, // Include the complete dataset
      stats,
    }

    onFileProcessed(file, processedData)
  } catch (error) {
    console.error('Error processing CSV file:', error)
  }
}

// ---

/********************
 *  8. AVAILABLE FIELD OPTIONS
 ************/
// +++ Available Field Options

/**
 * Lists valid target fields for a model/locale/property mapping combination.
 *
 * @param modelType - CSV column model discriminator.
 * @param locale - Locale selected for translatable fields, or `None`.
 * @param propertyKey - Optional property key for property-value columns.
 * @returns Allowed field names for the mapping selector.
 */
export function getAvailableFields(
  modelType: string,
  locale: string | undefined,
  propertyKey?: string,
): string[] {
  if (modelType === 'Feature') {
    if (!locale || locale === 'None') {
      return [
        'id',
        'latitude',
        'longitude',
        'archived',
        'published',
        'intangible',
        'visitable',
        'lastSeen',
      ]
    } else {
      return [
        'title',
        'titleGen',
        'description',
        'descriptionGen',
        'displayAddress',
        'displayAddressGen',
        'rawAddress',
      ]
    }
  } else if (modelType === 'User') {
    return ['id', 'email', 'username']
  } else if (modelType === 'Property') {
    // If property key is NEW, only allow 'value' field
    if (propertyKey === 'NEW') {
      return ['value']
    }
    if (!locale || locale === 'None') {
      return ['id', 'value', 'valueId']
    } else {
      return ['id', 'value']
    }
  } else if (modelType === 'Layer') {
    if (!locale || locale === 'None') {
      return ['id']
    } else {
      return [
        'name',
        'nameGen',
        'nameShort',
        'nameShortGen',
        'description',
        'descriptionGen',
      ]
    }
  } else if (modelType === 'Address') {
    // Address properties from AddressProperties type - always require locale
    if (!locale || locale === 'None') {
      return []
    } else {
      return [
        'formattedAddress',
        'rawAddress',
        'unitPortion',
        'unitNumber',
        'unitType',
        'floorNumber',
        'floorType',
        'premisesName',
        'buildingName',
        'buildingNumberFrom',
        'buildingNumberTo',
        'blockType',
        'blockNumber',
        'blockTypeBeforeNumber',
        'phaseName',
        'phaseNumber',
        'estateName',
        'lotNumber',
        'lotType',
        'streetName',
        'intersection',
        'neighbourhood',
        'macrohood',
        'district',
        'area',
        'country',
      ]
    }
  } else if (modelType === 'AddressMeta') {
    // AddressMeta properties - non-translatable
    return [
      'geoAddressCode',
      'nearestLampPostNumber',
      'googlePlaceId',
      'plusCode',
      'longitude',
      'latitude',
      'rawLongitude',
      'rawLatitude',
      'distanceFromPoint',
      'confidenceForwardGeocoder',
      'addressForwardGeocoder',
      'addressReverseGeocoder',
      'addressReverseGen',
      'addressForwardGen',
    ]
  }
  return []
}

// ---
