// REMOTE
import { featureForm, getFeatureForImport } from '$lib/api/server/feature.remote'
// I18N
import { toLocaleKey } from '$lib/i18n'
// SERVICES
import { toFeatureFormInput } from '$lib/client/services/feature'
// UTILS
import { nanoid } from 'nanoid'
// TYPES
import type { RemoteForm, RemoteFormInput } from '@sveltejs/kit'
import type { ImportCtx } from '$lib/context/import.svelte'
import type { Feature, AddressMeta } from '$lib/client/services/import/types'

type FeaturePointGeometry = {
  type: 'Point'
  coordinates: [number, number]
}

export interface FeatureResolutionData {
  rowIndex: number
  existing?: Feature
  submitted: Record<string, any>
  enriched: Record<string, any>
  merged: Feature
  saved?: Feature
  isNew: boolean
  hasProvidedIdWithoutMatch?: boolean
  acceptProvidedIdAsCreate?: boolean
  status: 'pending' | 'processing' | 'success' | 'error' | 'skipped' | 'unchanged'
  error?: string
}

export interface FeatureResolutionState {
  isProcessing: boolean
  currentIndex: number
  total: number
  results: FeatureResolutionData[]
  showPreview: boolean
  previewIndex: number
}

export interface FeatureResolutionStatusCounts {
  pending: number
  processing: number
  success: number
  error: number
  skipped: number
  unchanged: number
}

/**
 * Counts feature-resolution rows by processing status.
 *
 * @param results - Current feature resolution result rows.
 * @returns Status counts used by the import header and step body.
 */
export function getFeatureResolutionStatusCounts(
  results: FeatureResolutionData[],
): FeatureResolutionStatusCounts {
  return {
    pending: results.filter(result => result.status === 'pending').length,
    processing: results.filter(result => result.status === 'processing').length,
    success: results.filter(result => result.status === 'success').length,
    error: results.filter(result => result.status === 'error').length,
    skipped: results.filter(result => result.status === 'skipped').length,
    unchanged: results.filter(result => result.status === 'unchanged').length,
  }
}

/**
 * Returns whether resolution results are ready for export.
 *
 * @param results - Current feature resolution result rows.
 * @returns `true` when there is at least one row and no active/pending rows.
 */
export function canDownloadFeatureResolutionResults(
  results: FeatureResolutionData[],
): boolean {
  const counts = getFeatureResolutionStatusCounts(results)
  return counts.pending === 0 && counts.processing === 0 && results.length > 0
}

/**
 * Initializes feature resolution and stores the snapshot on the import context.
 *
 * @param importCtx - Active import context.
 * @param ignoreMissingFeatureIds - Whether supplied unknown IDs should be accepted.
 * @returns Initialized resolution rows.
 */
export async function refreshFeatureResolution(
  importCtx: ImportCtx,
  ignoreMissingFeatureIds: boolean,
): Promise<FeatureResolutionData[]> {
  try {
    const results = await initializeFeatureResolution(importCtx, {
      ignoreMissingFeatureIds,
    })
    importCtx.setFeatureResolutionResults(results)
    importCtx.updateFeatureResolution({
      total: results.length,
      currentIndex: 0,
    })
    return results
  } catch (error) {
    console.error('Failed to initialize feature resolution:', error)
    importCtx.setFeatureResolutionResults([])
    importCtx.updateFeatureResolution({
      total: 0,
      currentIndex: 0,
    })
    return []
  }
}

/**
 * Processes all pending feature-resolution rows in order.
 *
 * @param importCtx - Active import context.
 * @param results - Snapshot of current resolution rows.
 * @returns Resolves after all pending rows have been processed.
 */
export async function processFeatureResolutionQueue(
  importCtx: ImportCtx,
  results: FeatureResolutionData[],
): Promise<void> {
  if (importCtx.getFeatureResolution().isProcessing) return
  importCtx.updateFeatureResolution({ isProcessing: true, currentIndex: 0 })

  for (let index = 0; index < results.length; index += 1) {
    if (results[index].status !== 'pending') continue

    importCtx.updateFeatureResolution({ currentIndex: index })

    try {
      const updatedResult = await processFeatureResolution(results[index], importCtx)
      importCtx.updateFeatureResolutionResult(index, updatedResult)
    } catch (error) {
      importCtx.updateFeatureResolutionResult(index, {
        ...results[index],
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  importCtx.updateFeatureResolution({ isProcessing: false })
}

/**
 * Returns the best available human-readable feature label.
 *
 * @param result - Feature resolution row.
 * @returns Feature title fallbacking to the CSV row number.
 */
export function getFeatureResolutionDisplayName(result: FeatureResolutionData): string {
  const submittedTitle =
    result.submitted?.i18n?.en?.title ||
    result.submitted?.i18n?.zhHant?.title ||
    result.submitted?.i18n?.zhHans?.title
  if (submittedTitle) return submittedTitle

  const mergedTitle =
    result.merged?.i18n?.en?.title || result.merged?.i18n?.zhHant?.title
  if (mergedTitle) return mergedTitle

  const existingTitle =
    result.existing?.i18n?.en?.title || result.existing?.i18n?.zhHant?.title
  if (existingTitle) return existingTitle

  return `Row ${result.rowIndex + 2}`
}

/**
 * Returns whether a resolution row will create a feature.
 *
 * @param result - Feature resolution row.
 * @returns `true` for new rows and accepted supplied IDs.
 */
export function isFeatureResolutionCreateResult(
  result: FeatureResolutionData,
): boolean {
  return Boolean(result.isNew || result.acceptProvidedIdAsCreate)
}

/**
 * Normalizes feature data for JSON preview display.
 *
 * @param value - Raw feature-ish value.
 * @returns Preview-safe value with CSV primitives normalized.
 */
export function toFeatureResolutionPreview(value: unknown): unknown {
  if (!value) return null

  const normalizeValue = (targetValue: unknown): unknown => {
    if (Array.isArray(targetValue)) {
      return targetValue.map(item => normalizeValue(item))
    }

    if (targetValue && typeof targetValue === 'object') {
      const next = Object.fromEntries(
        Object.entries(targetValue).map(([key, nested]) => [
          key,
          normalizeValue(nested),
        ]),
      )

      if ('rawAddress' in next) {
        next.addressProperties = {
          ...(next.addressProperties as Record<string, unknown> | undefined),
          rawAddress: next.rawAddress,
        }
        delete next.rawAddress
      }

      return next
    }

    if (typeof targetValue === 'string') {
      const trimmed = targetValue.trim()
      if (trimmed === 'true') return true
      if (trimmed === 'false') return false
      if (trimmed === 'null') return null
      if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
        return Number(trimmed)
      }
    }

    return targetValue
  }

  return normalizeValue(value)
}

/**
 * Returns the per-row error for a supplied feature ID missing from HYPE.
 *
 * @param result - Feature resolution row.
 * @returns Human-readable missing-ID error.
 */
export function getMissingProvidedFeatureIdError(
  result: FeatureResolutionData,
): string {
  return `Feature ${result.submitted.feature?.id || 'unknown'} is not in the database yet.`
}

/**
 * Applies a create/skip decision to all rows with supplied unknown feature IDs.
 *
 * @param importCtx - Active import context.
 * @param results - Current resolution rows.
 * @param acceptProvidedIdAsCreate - Whether to create using supplied IDs.
 * @returns Nothing.
 */
export function setAllMissingProvidedFeatureIdRows(
  importCtx: ImportCtx,
  results: FeatureResolutionData[],
  acceptProvidedIdAsCreate: boolean,
): void {
  results.forEach((result, index) => {
    if (!result.hasProvidedIdWithoutMatch) return
    importCtx.updateFeatureResolutionResult(index, {
      ...result,
      acceptProvidedIdAsCreate,
      status: acceptProvidedIdAsCreate ? 'pending' : 'skipped',
      error: acceptProvidedIdAsCreate
        ? undefined
        : getMissingProvidedFeatureIdError(result),
    })
  })
}

/**
 * Marks a single feature-resolution row as skipped.
 *
 * @param importCtx - Active import context.
 * @param result - Current row value.
 * @param index - Row index in the resolution list.
 * @returns Nothing.
 */
export function skipFeatureResolutionRecord(
  importCtx: ImportCtx,
  result: FeatureResolutionData,
  index: number,
): void {
  importCtx.updateFeatureResolutionResult(index, {
    ...result,
    acceptProvidedIdAsCreate: false,
    status: 'skipped',
    error: result.hasProvidedIdWithoutMatch
      ? getMissingProvidedFeatureIdError(result)
      : result.error,
  })
}

/**
 * Re-includes a skipped feature-resolution row for processing.
 *
 * @param importCtx - Active import context.
 * @param result - Current row value.
 * @param index - Row index in the resolution list.
 * @returns Nothing.
 */
export function includeFeatureResolutionRecord(
  importCtx: ImportCtx,
  result: FeatureResolutionData,
  index: number,
): void {
  importCtx.updateFeatureResolutionResult(index, {
    ...result,
    acceptProvidedIdAsCreate: result.hasProvidedIdWithoutMatch || false,
    status: 'pending',
    error: undefined,
  })
}

/**
 * Marks an errored feature-resolution row for retry.
 *
 * @param importCtx - Active import context.
 * @param result - Current row value.
 * @param index - Row index in the resolution list.
 * @returns Nothing.
 */
export function retryFeatureResolutionRecord(
  importCtx: ImportCtx,
  result: FeatureResolutionData,
  index: number,
): void {
  importCtx.updateFeatureResolutionResult(index, {
    ...result,
    status: 'pending',
    error: undefined,
  })
}

/**
 * Updates preview visibility for a feature-resolution row.
 *
 * @param importCtx - Active import context.
 * @param index - Row index to toggle.
 * @returns Whether the row is now open.
 */
export function toggleFeatureResolutionPreview(
  importCtx: ImportCtx,
  index: number,
): boolean {
  const resolution = importCtx.getFeatureResolution()
  const shouldOpen = !(resolution.showPreview && resolution.previewIndex === index)

  importCtx.updateFeatureResolution({
    showPreview: shouldOpen,
    previewIndex: index,
  })

  return shouldOpen
}

/**
 * Deeply compares preview values for changed-field rendering.
 *
 * @param obj1 - First value.
 * @param obj2 - Second value.
 * @returns `true` when values are deeply equal.
 */
export function deepEqualFeatureResolutionPreview(
  obj1: unknown,
  obj2: unknown,
): boolean {
  if (obj1 === obj2) return true
  if (obj1 == null || obj2 == null) return obj1 === obj2
  if (typeof obj1 !== typeof obj2) return false
  if (typeof obj1 !== 'object') return obj1 === obj2
  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) return false
    for (let index = 0; index < obj1.length; index += 1) {
      if (!deepEqualFeatureResolutionPreview(obj1[index], obj2[index])) return false
    }
    return true
  }

  const record1 = obj1 as Record<string, unknown>
  const record2 = obj2 as Record<string, unknown>
  const keys1 = Object.keys(record1)
  const keys2 = Object.keys(record2)
  if (keys1.length !== keys2.length) return false

  for (const key of keys1) {
    if (!keys2.includes(key)) return false
    if (!deepEqualFeatureResolutionPreview(record1[key], record2[key])) return false
  }

  return true
}

/**
 * Renders a compact HTML diff preview for existing versus merged feature data.
 *
 * @param existing - Current saved feature preview.
 * @param merged - Feature preview to be saved.
 * @param hideUnchanged - Whether unchanged fields should be omitted.
 * @returns HTML string for the preview pane.
 */
export function renderFeatureResolutionDiff(
  existing: Record<string, unknown>,
  merged: Record<string, unknown>,
  hideUnchanged: boolean,
): string {
  function renderValue(
    key: string,
    existingVal: unknown,
    mergedVal: unknown,
    indent = 0,
  ): string {
    const indentStr = '  '.repeat(indent)
    const isChanged = !deepEqualFeatureResolutionPreview(existingVal, mergedVal)
    const opacity = isChanged ? 'opacity-100' : 'opacity-50'

    if (hideUnchanged && !isChanged) return ''

    if (Array.isArray(mergedVal)) {
      const existingArray = Array.isArray(existingVal) ? existingVal : []
      let result = `${indentStr}<span class="${opacity}">${JSON.stringify(key)}: [</span>\n`
      const validItems: string[] = []

      for (let index = 0; index < mergedVal.length; index += 1) {
        const mergedItem = mergedVal[index] as Record<string, unknown> | unknown
        let existingItem: unknown = existingArray[index]

        if (mergedItem && typeof mergedItem === 'object') {
          const mergedRecord = mergedItem as Record<string, unknown>
          if (mergedRecord.featureId && mergedRecord.propertyId) {
            existingItem = existingArray.find(item => {
              const record = item as Record<string, unknown> | undefined
              return (
                record?.featureId === mergedRecord.featureId &&
                record?.propertyId === mergedRecord.propertyId
              )
            })
          } else if (mergedRecord.id) {
            existingItem = existingArray.find(item => {
              const record = item as Record<string, unknown> | undefined
              return record?.id === mergedRecord.id
            })
          }
        }

        if (
          mergedItem &&
          typeof mergedItem === 'object' &&
          ('id' in mergedItem || 'featureId' in mergedItem)
        ) {
          const mergedRecord = mergedItem as Record<string, unknown>
          const existingRecord = existingItem as Record<string, unknown> | undefined
          const itemChanged = !deepEqualFeatureResolutionPreview(
            existingRecord,
            mergedRecord,
          )
          if (!hideUnchanged || itemChanged) {
            let itemResult = `${indentStr}  {\n`

            if (!hideUnchanged) {
              if (mergedRecord.id) {
                itemResult += `${indentStr}    <span class="opacity-30">"id": ${JSON.stringify(mergedRecord.id)},</span>\n`
              }
              if (mergedRecord.featureId) {
                itemResult += `${indentStr}    <span class="opacity-30">"featureId": ${JSON.stringify(mergedRecord.featureId)},</span>\n`
              }
              if (mergedRecord.propertyId) {
                itemResult += `${indentStr}    <span class="opacity-30">"propertyId": ${JSON.stringify(mergedRecord.propertyId)},</span>\n`
              }
            }

            const nonIdKeys = Object.keys(mergedRecord).filter(
              targetKey => !['id', 'featureId', 'propertyId'].includes(targetKey),
            )

            nonIdKeys.forEach((objKey, keyIndex) => {
              const objResult = renderValue(
                objKey,
                existingRecord?.[objKey],
                mergedRecord[objKey],
                indent + 2,
              )
              if (objResult) {
                itemResult += objResult
                if (keyIndex < nonIdKeys.length - 1) itemResult += ','
                itemResult += '\n'
              }
            })

            itemResult += `${indentStr}  }`
            validItems.push(itemResult)
          }
        } else {
          const itemChanged = !deepEqualFeatureResolutionPreview(
            existingItem,
            mergedItem,
          )
          const itemOpacity = itemChanged ? 'opacity-100' : 'opacity-50'
          if (!hideUnchanged || itemChanged) {
            validItems.push(
              `${indentStr}  <span class="${itemOpacity}">${JSON.stringify(mergedItem, null, 2).replace(/\n/g, `\n${indentStr}  `)}</span>`,
            )
          }
        }
      }

      if (validItems.length > 0) {
        result += `${validItems.join(',\n')}\n`
      }

      result += `${indentStr}<span class="${opacity}">]</span>`
      return result
    }

    if (mergedVal && typeof mergedVal === 'object') {
      const existingRecord = existingVal as Record<string, unknown> | undefined
      const mergedRecord = mergedVal as Record<string, unknown>
      let result = `${indentStr}<span class="${opacity}">${JSON.stringify(key)}: {</span>\n`

      Object.keys(mergedRecord).forEach(objKey => {
        const objResult = renderValue(
          objKey,
          existingRecord?.[objKey],
          mergedRecord[objKey],
          indent + 1,
        )
        if (objResult) result += `${objResult},\n`
      })

      result += `${indentStr}<span class="${opacity}">}</span>`
      return result
    }

    return `${indentStr}<span class="${opacity}">${JSON.stringify(key)}: ${JSON.stringify(mergedVal)}</span>`
  }

  let html = '<pre class="text-xs">{\n'
  Object.keys(merged).forEach((key, index) => {
    const result = renderValue(key, existing[key], merged[key], 1)
    if (result) {
      html += result
      if (index < Object.keys(merged).length - 1) html += ','
      html += '\n'
    }
  })
  html += '}</pre>'

  return html
}

/**
 * Returns whether the row should be created rather than updated.
 */
function shouldCreateFeature(result: FeatureResolutionData): boolean {
  return Boolean(result.isNew || result.acceptProvidedIdAsCreate)
}

/**
 * Returns the warning shown when a provided feature id does not exist yet.
 */
function getMissingFeatureIdMessage(featureId: string): string {
  return `Feature ${featureId} is not in the database yet. Accept it to create a new feature with this id.`
}

const featureLookupCache = new Map<string, Promise<Feature | null>>()

/**
 * Prime the existing-feature lookup cache with one concurrent pass so the
 * remote `query.batch(...)` transport can collapse requests by id.
 */
async function prefetchExistingFeatures(featureIds: string[]): Promise<void> {
  const uniqueIds = Array.from(
    new Set(featureIds.map(featureId => featureId.trim()).filter(Boolean)),
  )

  await Promise.all(uniqueIds.map(featureId => fetchExistingFeature(featureId)))
}

/**
 * Serializes a remote form payload into hidden inputs so `RemoteForm.submit()`
 * can capture it through `new FormData(form)`.
 */
function appendHiddenInputs(form: HTMLFormElement, value: unknown, path = ''): void {
  if (value === undefined || value === null) return

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = path
    input.value = String(value)
    form.appendChild(input)
    return
  }

  if (value instanceof File) {
    const input = document.createElement('input')
    input.type = 'file'
    input.name = path
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(value)
    input.files = dataTransfer.files
    input.hidden = true
    form.appendChild(input)
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      appendHiddenInputs(form, item, `${path}[${index}]`)
    })
    return
  }

  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
      const nextPath = path ? `${path}.${key}` : key
      appendHiddenInputs(form, nested, nextPath)
    })
  }
}

/**
 * Attaches a remote form to a temporary DOM form so it can be submitted from
 * non-component import logic.
 */
async function submitRemoteForm<Input extends RemoteFormInput, Output>(
  remoteForm: RemoteForm<Input, Output>,
  value: Input,
  instanceId: string,
): Promise<{
  succeeded: boolean
  result: Output | undefined
  issues: Array<{ message: string; path: Array<string | number> }>
}> {
  if (typeof document === 'undefined') {
    throw new Error('Remote form submission requires a browser environment')
  }

  const formInstance = remoteForm.for(instanceId as never) as RemoteForm<Input, Output>
  const attachmentSymbol = Object.getOwnPropertySymbols(formInstance).find(symbol => {
    const value = (formInstance as Record<PropertyKey, unknown>)[symbol]
    return typeof value === 'function'
  })

  if (!attachmentSymbol) {
    throw new Error('Could not resolve remote form attachment')
  }

  const element = document.createElement('form')
  element.hidden = true
  document.body.appendChild(element)

  try {
    ;(formInstance as unknown as Record<PropertyKey, (node: HTMLFormElement) => void>)[
      attachmentSymbol
    ](element)
    appendHiddenInputs(element, value)
    const succeeded = await formInstance.submit()
    const issues = formInstance.fields.allIssues?.() ?? []
    return {
      succeeded,
      result: formInstance.result,
      issues,
    }
  } finally {
    element.remove()
  }
}

/**
 * Deep comparison function to check if two feature objects are essentially the same
 * Ignores createdAt, modifiedAt, and other timestamp fields
 */
function deepCompareFeatures(existing: Feature, merged: Feature): boolean {
  // Create clean copies without timestamp fields
  const cleanExisting = { ...existing } as Record<string, any>
  const cleanMerged = { ...merged } as Record<string, any>

  // Remove timestamp fields
  delete cleanExisting.createdAt
  delete cleanExisting.modifiedAt
  delete cleanMerged.createdAt
  delete cleanMerged.modifiedAt

  // Remove read-only fields that might differ
  delete (cleanExisting as any).contributor
  delete (cleanExisting as any).publisher
  delete (cleanExisting as any).image
  delete (cleanExisting as any).images
  delete (cleanMerged as any).contributor
  delete (cleanMerged as any).publisher
  delete (cleanMerged as any).image
  delete (cleanMerged as any).images

  // Deep comparison function
  function deepEqual(obj1: any, obj2: any): boolean {
    if (obj1 === obj2) return true

    if (obj1 == null || obj2 == null) return obj1 === obj2

    if (typeof obj1 !== typeof obj2) return false

    if (typeof obj1 !== 'object') return obj1 === obj2

    if (Array.isArray(obj1) !== Array.isArray(obj2)) return false

    if (Array.isArray(obj1)) {
      if (obj1.length !== obj2.length) return false
      for (let i = 0; i < obj1.length; i++) {
        if (!deepEqual(obj1[i], obj2[i])) return false
      }
      return true
    }

    const keys1 = Object.keys(obj1)
    const keys2 = Object.keys(obj2)

    if (keys1.length !== keys2.length) return false

    for (const key of keys1) {
      if (!keys2.includes(key)) return false
      if (!deepEqual(obj1[key], obj2[key])) return false
    }

    return true
  }

  return deepEqual(cleanExisting, cleanMerged)
}

/**
 * Initialize feature resolution process
 */
export async function initializeFeatureResolution(
  importCtx: ImportCtx,
  options: {
    ignoreMissingFeatureIds?: boolean
  } = {},
): Promise<FeatureResolutionData[]> {
  const data = importCtx.getData()
  const columns = importCtx.getColumns()
  const headers = importCtx.getHeaders()
  const ignoreMissingFeatureIds = options.ignoreMissingFeatureIds ?? true
  const featureIdColumn = columns.find(
    col => col.modelType === 'Feature' && col.field === 'id',
  )

  const results: FeatureResolutionData[] = []

  if (featureIdColumn) {
    const featureIdColumnIndex = headers.indexOf(featureIdColumn.header)
    if (featureIdColumnIndex !== -1) {
      await prefetchExistingFeatures(
        data.map(row => row[featureIdColumnIndex]?.trim() ?? ''),
      )
    }
  }

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    const submitted = extractSubmittedData(row, columns, headers)
    const enriched = importCtx.getRowEnrichedData(rowIndex) || {}
    let existing: Feature | undefined

    // Determine if this is a new feature or update based on ID field
    const isNew =
      !featureIdColumn || !row[headers.indexOf(featureIdColumn.header)]?.trim()

    // Pre-populate merged data for preview
    try {
      // For existing features, fetch the existing data and do deep comparison
      let status: 'pending' | 'unchanged' | 'skipped' = 'pending'
      let hasProvidedIdWithoutMatch = false
      let acceptProvidedIdAsCreate = false

      if (!isNew && submitted.feature?.id) {
        const featureId = submitted.feature.id

        try {
          existing = (await fetchExistingFeature(featureId)) ?? undefined
          if (!existing) {
            hasProvidedIdWithoutMatch = true
            acceptProvidedIdAsCreate = ignoreMissingFeatureIds
            status = ignoreMissingFeatureIds ? 'pending' : 'skipped'
          }
        } catch (error) {
          console.warn(`Could not fetch existing feature ${featureId}:`, error)
          hasProvidedIdWithoutMatch = true
          acceptProvidedIdAsCreate = ignoreMissingFeatureIds
          status = ignoreMissingFeatureIds ? 'pending' : 'skipped'
        }
      }

      const merged = mergeFeatureData(existing ?? null, submitted, enriched, importCtx)

      // For existing features, check if the merged data is essentially the same as existing
      if (!isNew && existing && merged) {
        const isUnchanged = deepCompareFeatures(existing, merged)
        if (isUnchanged) {
          status = 'unchanged'
        }
      }

      const result = {
        rowIndex,
        existing,
        submitted,
        enriched,
        merged,
        isNew,
        hasProvidedIdWithoutMatch,
        acceptProvidedIdAsCreate,
        status,
        error:
          hasProvidedIdWithoutMatch &&
          !acceptProvidedIdAsCreate &&
          submitted.feature?.id
            ? getMissingFeatureIdMessage(submitted.feature.id)
            : undefined,
      }

      results.push(result)
    } catch (error) {
      console.error(`Error pre-merging data for row ${rowIndex + 1}:`, error)
      // Create a minimal valid Feature object for error cases
      const errorFeature = {
        id: nanoid(12),
        organisationId: importCtx.getSelectedOrganisation()?.id || '',
        projectId: importCtx.getSelectedProject()?.id || '',
        layerId: '',
        contributorId: '',
        geometry: { type: 'Point', coordinates: [0, 0] },
        addressMeta: {},
        isPublished: false,
        publishedAt: null,
        publisherId: null,
        isPendingReview: false,
        isArchived: false,
        isIntangible: false,
        isVisitable: true,
        visitableAsOf: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        i18n: {},
        properties: [],
      } as unknown as Feature

      results.push({
        rowIndex,
        existing,
        submitted,
        enriched,
        merged: errorFeature,
        isNew,
        hasProvidedIdWithoutMatch: false,
        acceptProvidedIdAsCreate: false,
        status: 'pending',
        error:
          error instanceof Error ? error.message : 'Unknown error during data merge',
      })
    }
  }

  return results
}

/**
 * Extract submitted data from CSV row
 */
function extractSubmittedData(
  row: string[],
  columns: any[],
  headers: string[],
): Record<string, any> {
  const submitted: Record<string, any> = {
    feature: {},
    i18n: {},
    properties: {},
    user: {},
    layer: {},
    addressMeta: {},
    addressProperties: {},
  }

  columns.forEach((column, index) => {
    const value = row[index]?.trim()
    if (!value || column.modelType === 'SKIP') return

    const headerIndex = headers.indexOf(column.header)
    if (headerIndex === -1) return

    switch (column.modelType) {
      case 'Feature':
        if (column.locale && column.locale !== 'None') {
          if (!submitted.i18n[column.locale]) {
            submitted.i18n[column.locale] = {}
          }
          submitted.i18n[column.locale][column.field] = value
        } else {
          submitted.feature[column.field] = value
        }
        break

      case 'User':
        submitted.user[column.field] = value
        break

      case 'Layer':
        submitted.layer[column.field] = value
        break

      case 'Property':
        if (!submitted.properties[column.extractedPropertyKey || column.propertyKey]) {
          submitted.properties[column.extractedPropertyKey || column.propertyKey] = {}
        }
        submitted.properties[column.extractedPropertyKey || column.propertyKey][
          column.field
        ] = value
        break

      case 'AddressMeta':
        submitted.addressMeta[column.field] = value
        break

      case 'Address':
        if (column.locale && column.locale !== 'None') {
          if (!submitted.addressProperties[column.locale]) {
            submitted.addressProperties[column.locale] = {}
          }
          submitted.addressProperties[column.locale][column.field] = value
        }
        break
    }
  })

  return submitted
}

/**
 * Fetch existing feature via the remote feature query.
 */
export async function fetchExistingFeature(featureId: string): Promise<Feature | null> {
  try {
    if (!featureLookupCache.has(featureId)) {
      featureLookupCache.set(
        featureId,
        Promise.resolve(
          getFeatureForImport({
            id: featureId,
            meta: { isAdminRequest: true },
          }),
        ).then(result => (result.data as Feature | null | undefined) ?? null),
      )
    }

    return await featureLookupCache.get(featureId)!
  } catch (error) {
    console.error('Error fetching existing feature:', error)
    throw error
  }
}

/**
 * Merge data according to the priority rules specified
 */
export function mergeFeatureData(
  existing: Feature | null,
  submitted: Record<string, any>,
  enriched: Record<string, any>,
  importCtx: ImportCtx,
): Feature {
  const merged: Feature = existing
    ? (() => {
        const { contributor, publisher, image, images, ...cleanExisting } = existing
        return cleanExisting as unknown as Feature
      })()
    : ({
        id: submitted.feature?.id || nanoid(12), // Use submitted ID if available, otherwise generate new
        organisationId: importCtx.getSelectedOrganisation()?.id || '',
        projectId: importCtx.getSelectedProject()?.id || '',
        layerId: '',
        contributorId: '',
        geometry: {
          type: 'Point',
          coordinates: getCoordinates(submitted, enriched), // Default to HK coordinates
        },
        addressMeta: {},
        isPublished: false,
        publishedAt: null,
        publisherId: null,
        isPendingReview: false,
        isArchived: false,
        isIntangible: false,
        isVisitable: true,
        visitableAsOf: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        i18n: {},
        properties: [],
        // Exclude read-only fields: contributor, publisher, image, images
      } as unknown as Feature)

  // Update basic feature fields
  // Priority: enriched (normalized) > submitted

  // Log enriched boolean values if present
  if (enriched.feature) {
    const booleanFields = ['isPublished', 'isArchived', 'isIntangible', 'isVisitable']
    const enrichedBooleans = booleanFields.filter(
      field => enriched.feature[field] !== undefined,
    )
    if (enrichedBooleans.length > 0) {
    }
  }

  // isPublished
  if (enriched.feature?.isPublished !== undefined) {
    merged.isPublished = enriched.feature.isPublished
  } else if (submitted.feature.isPublished !== undefined) {
    merged.isPublished =
      submitted.feature.isPublished === 'true' || submitted.feature.isPublished === true
  } else if (submitted.feature.published !== undefined) {
    merged.isPublished =
      submitted.feature.published === 'true' || submitted.feature.published === true
  }

  // isArchived
  if (enriched.feature?.isArchived !== undefined) {
    merged.isArchived = enriched.feature.isArchived
  } else if (submitted.feature.archived !== undefined) {
    merged.isArchived =
      submitted.feature.archived === 'true' || submitted.feature.archived === true
  }

  // isIntangible
  if (enriched.feature?.isIntangible !== undefined) {
    merged.isIntangible = enriched.feature.isIntangible
  } else if (submitted.feature.intangible !== undefined) {
    merged.isIntangible =
      submitted.feature.intangible === 'true' || submitted.feature.intangible === true
  }

  // isVisitable
  if (enriched.feature?.isVisitable !== undefined) {
    merged.isVisitable = enriched.feature.isVisitable
  } else if (submitted.feature.visitable !== undefined) {
    merged.isVisitable =
      submitted.feature.visitable === 'true' || submitted.feature.visitable === true
  }

  if (submitted.feature.lastSeen) {
    merged.visitableAsOf = submitted.feature.lastSeen
  }

  // Merge addressMeta (priority: submitted > enriched > existing)
  merged.addressMeta = mergeAddressMeta(
    existing?.addressMeta || {},
    enriched.addressMeta || enriched.feature?.addressMeta || {},
    submitted.addressMeta || {},
  )

  // Update layer and contributor IDs
  merged.layerId = getLayerId(submitted, enriched, importCtx)
  merged.contributorId = getContributorId(submitted, enriched, importCtx)

  // Merge i18n data (including translations from translation step)
  merged.i18n = mergeI18nData(
    existing?.i18n || {},
    enriched.feature?.i18n || enriched.i18n || {}, // Fix: geocoded data is in enriched.feature.i18n
    submitted.i18n || {},
    enriched, // Pass full enriched data to access translations
    merged.id, // Pass feature ID for i18n records
  )

  // Merge properties
  merged.properties = mergeProperties(
    existing?.properties || [],
    enriched.properties || {},
    submitted.properties || {},
    merged.id, // Pass the feature ID
    importCtx, // Pass import context for validation results
  )

  return merged
}

/**
 * Get coordinates with priority: submitted > enriched
 * Returns [longitude, latitude] or null if not found
 */
function getCoordinates(
  submitted: Record<string, any>,
  enriched: Record<string, any>,
): [number, number] | null {
  // 1. Check submitted feature fields
  if (
    submitted.feature?.longitude !== undefined &&
    submitted.feature?.latitude !== undefined
  ) {
    const longitude = parseFloat(submitted.feature.longitude)
    const latitude = parseFloat(submitted.feature.latitude)
    if (!isNaN(longitude) && !isNaN(latitude)) {
      // Check if coordinates might be swapped (common data error)
      // Longitude should be -180 to 180, Latitude should be -90 to 90
      // Hong Kong: ~114°E, ~22°N
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        console.warn(
          `🚨 [getCoordinates] Invalid coordinate ranges detected in submitted.feature: longitude=${longitude}, latitude=${latitude}`,
        )
      } else if (
        Math.abs(longitude) <= 90 &&
        Math.abs(latitude) <= 180 &&
        Math.abs(longitude) < Math.abs(latitude)
      ) {
        console.warn(
          `⚠️ [getCoordinates] Coordinates might be swapped in submitted.feature: longitude=${longitude}, latitude=${latitude}. ` +
            `Consider swapping if this is Hong Kong data (expected: ~114°E, ~22°N)`,
        )
        console.warn(
          `⚠️ [getCoordinates] If swapped, coordinates would be: longitude=${latitude}, latitude=${longitude}`,
        )
      }

      return [longitude, latitude] as [number, number]
    }
  }

  // 2. Check submitted addressMeta
  if (
    submitted.addressMeta?.longitude !== undefined &&
    submitted.addressMeta?.latitude !== undefined
  ) {
    const longitude = parseFloat(submitted.addressMeta.longitude)
    const latitude = parseFloat(submitted.addressMeta.latitude)
    if (!isNaN(longitude) && !isNaN(latitude)) {
      // Check if coordinates might be swapped (common data error)
      if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
        console.warn(
          `🚨 [getCoordinates] Invalid coordinate ranges detected in submitted.addressMeta: longitude=${longitude}, latitude=${latitude}`,
        )
      } else if (
        Math.abs(longitude) <= 90 &&
        Math.abs(latitude) <= 180 &&
        Math.abs(longitude) < Math.abs(latitude)
      ) {
        console.warn(
          `⚠️ [getCoordinates] Coordinates might be swapped in submitted.addressMeta: longitude=${longitude}, latitude=${latitude}. ` +
            `Consider swapping if this is Hong Kong data (expected: ~114°E, ~22°N)`,
        )
        console.warn(
          `⚠️ [getCoordinates] If swapped, coordinates would be: longitude=${latitude}, latitude=${longitude}`,
        )
      }

      return [longitude, latitude] as [number, number]
    }
  }

  // 3. Check enriched feature geometry
  if (
    enriched.feature?.geometry?.coordinates &&
    Array.isArray(enriched.feature.geometry.coordinates) &&
    enriched.feature.geometry.coordinates.length >= 2
  ) {
    const longitude = parseFloat(enriched.feature.geometry.coordinates[0])
    const latitude = parseFloat(enriched.feature.geometry.coordinates[1])
    if (!isNaN(longitude) && !isNaN(latitude)) {
      return [longitude, latitude] as [number, number]
    }
  }

  // 4. Check enriched addressMeta
  if (
    enriched.addressMeta?.longitude !== undefined &&
    enriched.addressMeta?.latitude !== undefined
  ) {
    const longitude = parseFloat(enriched.addressMeta.longitude)
    const latitude = parseFloat(enriched.addressMeta.latitude)
    if (!isNaN(longitude) && !isNaN(latitude)) {
      return [longitude, latitude] as [number, number]
    }
  }

  const defaultCoordinates: [number, number] = [114.1736, 22.2875]

  return defaultCoordinates
}

/**
 * Merge addressMeta with priority: submitted > enriched > existing
 */
function mergeAddressMeta(
  existing: AddressMeta,
  enriched: AddressMeta,
  submitted: AddressMeta,
): AddressMeta {
  return {
    ...existing,
    ...enriched,
    ...submitted,
  }
}

/**
 * Get layer ID from submitted data, enriched data, or fallback
 */
function getLayerId(
  submitted: Record<string, any>,
  enriched: Record<string, any>,
  importCtx: ImportCtx,
): string {
  // Check enriched layer ID
  if (enriched.layer?.id) {
    return enriched.layer.id
  }

  // Check layer validation fallback first (most common case)
  const layerValidation = importCtx.getLayerValidation()

  if (layerValidation.fallbackLayerId) {
    return layerValidation.fallbackLayerId
  }

  // Check selected layer
  const selectedLayer = importCtx.getSelectedLayer()
  if (selectedLayer?.id) {
    return selectedLayer.id
  }

  // Check layer resolution (for cases where layers were resolved)
  const layerResolution = importCtx.getLayerResolution()

  if (layerResolution.resolutions.size > 0) {
    const firstResolution = Array.from(layerResolution.resolutions.values())[0]
    if (firstResolution?.layerId) {
      return firstResolution.layerId
    }
  }

  // Check submitted layer ID last so invalid CSV values do not override the
  // explicit layer selected/resolved during import reconciliation.
  if (submitted.layer?.id) {
    return submitted.layer.id
  }

  console.error('❌ No layer ID found in any source')
  console.error('Debug info:', {
    submitted: submitted.layer,
    enriched: enriched.layer,
    selectedLayer,
    layerValidation,
    layerResolution,
    allLayers: importCtx.getAllLayers(),
    layersLoaded: importCtx.getLayersLoaded(),
  })

  // Last resort: try to find a suitable layer
  const allLayers = importCtx.getAllLayers()

  if (allLayers.length === 1) {
    // Also save this as the fallback for future use
    const layerValidation = importCtx.getLayerValidation()
    layerValidation.fallbackLayerId = allLayers[0].id
    importCtx.setLayerValidation(layerValidation)
    return allLayers[0].id
  }

  if (allLayers.length > 1) {
    // If multiple layers, try to find a reasonable default (first one)
    const layerValidation = importCtx.getLayerValidation()
    layerValidation.fallbackLayerId = allLayers[0].id
    importCtx.setLayerValidation(layerValidation)
    return allLayers[0].id
  }

  throw new Error('No layer ID available for feature - no layers found in project')
}

/**
 * Get contributor ID from submitted data, enriched data, or fallback
 */
function getContributorId(
  submitted: Record<string, any>,
  enriched: Record<string, any>,
  importCtx: ImportCtx,
): string {
  // Check submitted user ID
  if (submitted.user?.id) {
    return submitted.user.id
  }

  // Check enriched user ID
  if (enriched.user?.id) {
    return enriched.user.id
  }

  // Check user validation fallback first (most common case)
  const userValidation = importCtx.getUserValidation()

  if (userValidation.fallbackUserId) {
    return userValidation.fallbackUserId
  }

  // Check user resolution (for cases where users were resolved)
  const userResolution = importCtx.getUserResolution()

  if (userResolution.resolutions.size > 0) {
    const firstResolution = Array.from(userResolution.resolutions.values())[0]
    if (firstResolution?.userId) {
      return firstResolution.userId
    }
  }

  console.error('❌ No contributor ID found in any source')
  console.error('Debug info:', {
    submitted: submitted.user,
    enriched: enriched.user,
    userValidation,
    userResolution,
  })

  throw new Error('No contributor ID available for feature')
}

/**
 * Merge i18n data with priority: submitted > enriched > existing
 * Also integrates translation data from the translation step
 */
function mergeI18nData(
  existing: Record<string, any>,
  enriched: Record<string, any>,
  submitted: Record<string, any>,
  enrichedFull: Record<string, any>,
  featureId: string,
): Record<string, any> {
  const merged: Record<string, any> = {}

  // Helper to ensure locale object has required fields
  function ensureLocaleFields(localeObj: any, locale: string): any {
    return {
      ...localeObj,
      featureId: featureId,
      locale: locale,
    }
  }

  function getCanonicalLocaleKey(locale: string): string {
    return toLocaleKey(locale as Parameters<typeof toLocaleKey>[0])
  }

  function ensureLocaleBucket(locale: string): string {
    const localeKey = getCanonicalLocaleKey(locale)
    if (!merged[localeKey]) merged[localeKey] = {}
    return localeKey
  }

  // Normalize any existing persisted locale keys before applying import updates.
  Object.keys(existing).forEach(locale => {
    const localeKey = ensureLocaleBucket(locale)
    merged[localeKey] = {
      ...merged[localeKey],
      ...existing[locale],
    }
  })

  // Merge enriched data
  Object.keys(enriched).forEach(locale => {
    const localeKey = ensureLocaleBucket(locale)

    Object.keys(enriched[locale]).forEach(field => {
      if (field === 'addressProperties') {
        // Complete replacement for addressProperties
        if (
          enriched[locale][field] &&
          Object.keys(enriched[locale][field]).length > 0
        ) {
          merged[localeKey][field] = enriched[locale][field]
        }
      } else {
        merged[localeKey][field] = enriched[locale][field]
      }
    })

    // Set generation flags for enriched data - preserve existing flags if they exist
    if (
      enriched[locale].displayAddress &&
      merged[localeKey].displayAddressGen === undefined
    ) {
      merged[localeKey].displayAddressGen = true
    } else if (enriched[locale].displayAddress) {
    }
  })

  // Merge submitted data (highest priority)
  Object.keys(submitted).forEach(locale => {
    const localeKey = ensureLocaleBucket(locale)

    Object.keys(submitted[locale]).forEach(field => {
      if (field === 'addressProperties') {
        // Complete replacement for addressProperties if any non-empty values exist
        const submittedAddressProps = submitted[locale][field]
        if (
          submittedAddressProps &&
          Object.values(submittedAddressProps).some(val => val && String(val).trim())
        ) {
          merged[localeKey][field] = submittedAddressProps
        }
      } else {
        merged[localeKey][field] = submitted[locale][field]
      }
    })

    // Set generation flags for submitted data (human verified)
    if (submitted[locale].title) {
      merged[localeKey].titleGen = false // Human provided
    }
    if (submitted[locale].description) {
      merged[localeKey].descriptionGen = false // Human provided
    }
    if (submitted[locale].displayAddress) {
      merged[localeKey].displayAddressGen = false // Human provided
    }
  })

  // Integrate translation data from translation step
  // Look for titleTranslations, descriptionTranslations, etc.
  if (enrichedFull.titleTranslations) {
    Object.keys(enrichedFull.titleTranslations).forEach(locale => {
      const localeKey = ensureLocaleBucket(locale)
      merged[localeKey].title = enrichedFull.titleTranslations[locale]
      merged[localeKey].titleGen = true // Generated from translation
    })
  }

  if (enrichedFull.descriptionTranslations) {
    Object.keys(enrichedFull.descriptionTranslations).forEach(locale => {
      const localeKey = ensureLocaleBucket(locale)
      merged[localeKey].description = enrichedFull.descriptionTranslations[locale]
      merged[localeKey].descriptionGen = true // Generated from translation
    })
  }

  if (enrichedFull.rawAddressTranslations) {
    Object.keys(enrichedFull.rawAddressTranslations).forEach(locale => {
      const localeKey = ensureLocaleBucket(locale)
      merged[localeKey].rawAddress = enrichedFull.rawAddressTranslations[locale]
    })
  }

  if (enrichedFull.addressPropertiesTranslations) {
    Object.keys(enrichedFull.addressPropertiesTranslations).forEach(locale => {
      const localeKey = ensureLocaleBucket(locale)
      merged[localeKey].addressProperties =
        enrichedFull.addressPropertiesTranslations[locale]
    })
  }

  // Handle displayAddress translations with proper generation flags
  if (enrichedFull.displayAddressTranslations) {
    Object.keys(enrichedFull.displayAddressTranslations).forEach(locale => {
      const localeKey = ensureLocaleBucket(locale)
      // Only set if not already set by submitted data (which has higher priority)
      if (!merged[localeKey].displayAddress) {
        merged[localeKey].displayAddress =
          enrichedFull.displayAddressTranslations[locale]
        merged[localeKey].displayAddressGen = true // Generated from translation
      }
    })
  }

  // Add addressProperties from enriched feature i18n data if missing
  if (enrichedFull.feature?.i18n) {
    Object.keys(enrichedFull.feature.i18n).forEach(locale => {
      const localeKey = ensureLocaleBucket(locale)

      const enrichedLocaleData = enrichedFull.feature.i18n[locale]

      // Add addressProperties if missing
      const enrichedAddressProps = enrichedLocaleData?.addressProperties
      if (enrichedAddressProps && !merged[localeKey].addressProperties) {
        merged[localeKey].addressProperties = enrichedAddressProps
      }

      // Add displayAddress and displayAddressGen if missing (but only if not set by translations or submitted)
      if (enrichedLocaleData?.displayAddress && !merged[localeKey].displayAddress) {
        merged[localeKey].displayAddress = enrichedLocaleData.displayAddress
        if (merged[localeKey].displayAddressGen === undefined) {
          merged[localeKey].displayAddressGen =
            enrichedLocaleData.displayAddressGen ?? true
        }
      }
    })
  }

  // Ensure all locale objects have required fields
  Object.keys(merged).forEach(locale => {
    merged[locale] = ensureLocaleFields(merged[locale], locale)
  })

  return merged
}

/**
 * Merge properties with special rules
 * Uses validation results from property-matching step to get correct IDs
 */
function mergeProperties(
  existingProperties: any[],
  enrichedProperties: Record<string, any>,
  submittedProperties: Record<string, any>,
  featureId: string,
  importCtx: ImportCtx,
): any[] {
  const merged: any[] = []
  const processedKeys = new Set<string>()

  // Get property enriched data from property reconciliation step
  const propertyReconciliation = importCtx.getPropertyReconciliation()

  // Log all enriched data entries
  propertyReconciliation.enrichedData.forEach((data, key) => {})

  // If enrichedData is empty, let's check the full reconciliation state
  if (propertyReconciliation.enrichedData.size === 0) {
    // Let's also check if the property reconciliation was ever run
  }

  // Also check if we can get property type information
  const fetchedProperties = importCtx.getFetchedProperties()

  // Create a map of property keys to their resolved IDs
  const propertyKeyToId = new Map<string, string>()

  // Add enriched properties from property reconciliation
  propertyReconciliation.enrichedData.forEach((data, key) => {
    if (data.propertyId) {
      propertyKeyToId.set(key, data.propertyId)
    }
  })

  // Keep existing properties that aren't referenced by submitted or enriched
  existingProperties.forEach(prop => {
    const propertyKey = prop.property?.key
    if (
      propertyKey &&
      !submittedProperties[propertyKey] &&
      !enrichedProperties[propertyKey]
    ) {
      merged.push(prop)
    }
  })

  // Add submitted properties
  Object.keys(submittedProperties).forEach(key => {
    const submittedProp = submittedProperties[key]
    processedKeys.add(key)

    // Try to get propertyId from enriched properties first, then from reconciliation data
    const enrichedPropData = enrichedProperties[key]
    const propertyId =
      enrichedPropData?.propertyId || propertyKeyToId.get(key) || submittedProp.id || ''
    const enrichedData = propertyReconciliation.enrichedData.get(key)

    // Resolve property value ID from mapping or direct value
    // Priority: submitted > enriched properties > reconciliation data
    let propertyValueId =
      submittedProp.valueId ||
      enrichedPropData?.propertyValueId ||
      enrichedData?.propertyValueId ||
      null

    // Check if we have a property value mapping for this value
    if (!propertyValueId && enrichedData?.resolvedValues && submittedProp.value) {
      const mappedValueId = enrichedData.resolvedValues[submittedProp.value]
      propertyValueId = mappedValueId || null
    }

    merged.push({
      featureId: featureId,
      propertyId: propertyId,
      propertyValueId: propertyValueId,
      value: propertyValueId ? null : submittedProp.value || null, // If propertyValueId exists, value should be null
      i18n: null, // TODO: Implement featurePropertyI18n
    })

    const finalValue = propertyValueId ? null : submittedProp.value || null

    // Special logging for boolean values
    if (submittedProp.value === 'TRUE' || submittedProp.value === 'FALSE') {
    }
  })

  // Add enriched properties (only if not already processed)
  Object.keys(enrichedProperties).forEach(key => {
    if (!processedKeys.has(key)) {
      const enrichedProp = enrichedProperties[key]
      const propertyId =
        enrichedProp.propertyId || propertyKeyToId.get(key) || enrichedProp.id || ''
      const enrichedData = propertyReconciliation.enrichedData.get(key)

      // Resolve property value ID from mapping or direct value
      let propertyValueId =
        enrichedProp.propertyValueId || enrichedData?.propertyValueId || null

      // Check if we have a property value mapping for this value
      if (!propertyValueId && enrichedData?.resolvedValues && enrichedProp.value) {
        propertyValueId = enrichedData.resolvedValues[enrichedProp.value] || null
      }

      merged.push({
        featureId: featureId,
        propertyId: propertyId,
        propertyValueId: propertyValueId,
        value: propertyValueId ? null : enrichedProp.value || null, // If propertyValueId exists, value should be null
        i18n: null, // TODO: Implement featurePropertyI18n
      })
    }
  })

  return merged
}

/**
 * Parse superform validation error response using the same approach as form.svelte.ts
 */
function parseSuperformError(errorData: any): string {
  try {
    if (Array.isArray(errorData?.issues)) {
      return `Validation errors:\n${errorData.issues.map((issue: { message: string; path?: Array<string | number> }) => `• ${issue.path?.length ? `${issue.path.join('.')}: ` : ''}${issue.message}`).join('\n')}`
    }

    if (errorData.type === 'failure' && errorData.data?.errors) {
      // Handle superform validation errors similar to form.svelte.ts
      const errors = errorData.data.errors
      const errorMessages: string[] = []

      // Recursively extract error messages from the errors object
      function extractErrors(obj: any, path: string = ''): void {
        if (typeof obj === 'object' && obj !== null) {
          if (Array.isArray(obj)) {
            obj.forEach((item, index) => {
              if (typeof item === 'string') {
                errorMessages.push(`${path}[${index}]: ${item}`)
              } else {
                extractErrors(item, `${path}[${index}]`)
              }
            })
          } else {
            Object.keys(obj).forEach(key => {
              const value = obj[key]
              const currentPath = path ? `${path}.${key}` : key

              if (typeof value === 'string') {
                errorMessages.push(`${currentPath}: ${value}`)
              } else if (Array.isArray(value)) {
                value.forEach((item, index) => {
                  if (typeof item === 'string') {
                    errorMessages.push(`${currentPath}[${index}]: ${item}`)
                  }
                })
              } else if (typeof value === 'object') {
                extractErrors(value, currentPath)
              }
            })
          }
        }
      }

      extractErrors(errors)

      if (errorMessages.length > 0) {
        return `Validation errors:\n${errorMessages.map(err => `• ${err}`).join('\n')}`
      }
    }

    // Fallback to original error message
    return errorData.message || 'Validation failed'
  } catch (parseError) {
    console.error('Error parsing superform validation:', parseError)
    return errorData.message || 'Validation failed - unable to parse error details'
  }
}

/**
 * Submit feature to API (POST for new, PUT for existing)
 */
export async function submitFeature(
  feature: Feature,
  isCreate: boolean,
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const payload = toFeatureFormInput({
      ...feature,
      geometry: toNumericPointGeometry(feature.geometry),
    } as Feature)
    payload.meta = {
      ...payload.meta,
      mode: isCreate ? 'create' : 'update',
      isAdminRequest: true,
    }

    if (isCreate) {
      payload.meta.id = feature.id
      delete payload.meta.updatedAt
    }

    const submission = await submitRemoteForm(
      featureForm,
      payload as RemoteFormInput & typeof payload,
      `feature-import-${feature.id}`,
    )

    if (!submission.succeeded) {
      return {
        success: false,
        error: parseSuperformError({ issues: submission.issues }),
      }
    }

    return {
      success: true,
      id: submission.result?.data?.id ?? feature.id,
    }
  } catch (error) {
    console.error('Feature submission error:', error)
    return {
      success: false,
      error: parseSuperformError(error),
    }
  }
}

/**
 * Converts imported GeoJSON point coordinates to numbers before remote submission.
 *
 * @param geometry - Candidate feature geometry from merged import data.
 * @returns Point geometry with numeric coordinates, or the original geometry when it is not a point.
 */
function toNumericPointGeometry(geometry: unknown): unknown {
  const point = geometry as { type?: unknown; coordinates?: unknown }
  if (point?.type !== 'Point' || !Array.isArray(point.coordinates)) {
    return geometry
  }

  const longitude = Number(point.coordinates[0])
  const latitude = Number(point.coordinates[1])
  if (Number.isNaN(longitude) || Number.isNaN(latitude)) {
    return geometry
  }

  return {
    type: 'Point',
    coordinates: [longitude, latitude],
  } satisfies FeaturePointGeometry
}

/**
 * Process a single feature resolution
 */
export async function processFeatureResolution(
  resolutionData: FeatureResolutionData,
  importCtx: ImportCtx,
): Promise<FeatureResolutionData> {
  // Keep unapproved provided ids out of the batch until the user decides.
  if (resolutionData.status === 'skipped' && !resolutionData.acceptProvidedIdAsCreate) {
    return resolutionData
  }

  const updated: FeatureResolutionData = { ...resolutionData, status: 'processing' }
  const isCreate = shouldCreateFeature(updated)

  try {
    // Fetch existing feature if this row still resolves to an update.
    if (!isCreate && updated.submitted.feature?.id && !updated.existing) {
      const existingFeature = await fetchExistingFeature(updated.submitted.feature.id)
      updated.existing = existingFeature || undefined
    }

    // Merge current persisted data with submitted/enriched import values.
    updated.merged = mergeFeatureData(
      updated.existing || null,
      updated.submitted,
      updated.enriched,
      importCtx,
    )

    if (!isCreate && updated.existing && updated.merged) {
      const isUnchanged = deepCompareFeatures(updated.existing, updated.merged)
      if (isUnchanged) {
        updated.status = 'unchanged'
        return updated
      }
    }

    // Verify the target row still exists before running an update submission.
    if (!isCreate && updated.merged.id) {
      try {
        const stillExists = await fetchExistingFeature(updated.merged.id)
        if (!stillExists) {
          updated.status = 'error'
          updated.error = `Feature ${updated.merged.id} no longer exists and cannot be updated`
          return updated
        }
      } catch (error) {
        updated.status = 'error'
        updated.error = `Could not verify feature ${updated.merged.id} exists: ${error instanceof Error ? error.message : 'Unknown error'}`
        return updated
      }
    }

    const result = await submitFeature(updated.merged, isCreate)

    if (result.success) {
      updated.status = 'success'

      const savedFeatureId = result.id ?? updated.merged.id
      try {
        const savedFeature = await fetchExistingFeature(savedFeatureId)
        if (savedFeature) {
          updated.saved = savedFeature
        } else {
          updated.saved = updated.merged
        }
      } catch (fetchError) {
        console.warn(
          `Could not fetch saved feature ${savedFeatureId} after submission:`,
          fetchError,
        )
        updated.saved = updated.merged
      }
    } else {
      updated.status = 'error'
      updated.error = result.error
    }
  } catch (error) {
    updated.status = 'error'
    updated.error = error instanceof Error ? error.message : 'Unknown error occurred'
  }

  return updated
}

/**
 * Flatten feature data into CSV import structure format
 * Includes all data from API including PropertyValueI18n values
 */
function flattenFeatureData(
  feature: Feature,
  columns: any[],
  enriched?: Record<string, any>,
  submitted?: Record<string, any>,
): Record<string, any> {
  const flattened: Record<string, any> = {}
  const featureI18n = feature.i18n as Record<string, any> | undefined
  const pointGeometry = feature.geometry as
    | { coordinates?: [number, number] }
    | undefined
  const addressMeta = feature.addressMeta as Record<string, any> | undefined

  // Helper function to get property value by key
  function getPropertyValue(propertyKey: string): string | null {
    const property = feature.properties?.find(p => p.property?.key === propertyKey)
    return property?.value || null
  }

  // Helper function to get property ID by key
  function getPropertyId(propertyKey: string): string | null {
    const property = feature.properties?.find(p => p.property?.key === propertyKey)
    return property?.propertyId || null
  }

  // Helper function to get property value ID by key
  function getPropertyValueId(propertyKey: string): string | null {
    const property = feature.properties?.find(p => p.property?.key === propertyKey)
    return property?.propertyValueId || null
  }

  // Helper function to get property value i18n by key and locale
  function getPropertyValueI18n(propertyKey: string, locale: string): string | null {
    const property = feature.properties?.find(p => p.property?.key === propertyKey)
    const propertyValueI18n = property?.propertyValue?.i18n as
      | Record<string, any>
      | undefined
    if (propertyValueI18n?.[locale]) {
      return propertyValueI18n[locale].value || null
    }
    return null
  }

  // Helper function to get i18n value by locale and field
  function getI18nValue(locale: string, field: string): string | null {
    return featureI18n?.[locale]?.[field] || null
  }

  // Helper function to get address property by locale and field
  function getAddressProperty(locale: string, field: string): string | null {
    return featureI18n?.[locale]?.addressProperties?.[field] || null
  }

  // Map of field names to canonical "is" prefixed version for boolean fields
  const booleanFieldMap: Record<string, string> = {
    published: 'isPublished',
    isPublished: 'isPublished',
    archived: 'isArchived',
    isArchived: 'isArchived',
    visitable: 'isVisitable',
    isVisitable: 'isVisitable',
    intangible: 'isIntangible',
    isIntangible: 'isIntangible',
  }

  // Process each column to create flattened keys
  columns.forEach(column => {
    let value: any = null
    let key: string = ''

    switch (column.modelType) {
      case 'Feature':
        if (column.locale && column.locale !== 'None') {
          // Feature i18n fields
          key = `feature.i18n[locale=${column.locale}].${column.field}`
          value = getI18nValue(column.locale, column.field)
        } else {
          // Feature direct fields - handle coordinate mapping
          if (column.field === 'latitude') {
            key = `feature.latitude`
            value = pointGeometry?.coordinates?.[1] || null
          } else if (column.field === 'longitude') {
            key = `feature.longitude`
            value = pointGeometry?.coordinates?.[0] || null
          } else {
            // Map boolean field names to canonical "is" prefixed version
            const actualFieldName = booleanFieldMap[column.field] || column.field
            key = `feature.${column.field}`
            value = feature[actualFieldName as keyof Feature] || null
          }
        }
        break

      case 'User':
        key = `user.${column.field}`
        if (column.field === 'id') {
          // Use enriched user ID if available, otherwise contributorId
          value = enriched?.user?.id || feature.contributorId
        } else if (column.field === 'email') {
          value = submitted?.user?.email || null
        } else if (column.field === 'username') {
          value = submitted?.user?.username || null
        }
        break

      case 'Layer':
        key = `layer.${column.field}`
        if (column.field === 'id') {
          value = feature.layerId
        } else if (column.field === 'name') {
          // Get layer name from enriched data or try to fetch from layer i18n
          value = enriched?.layer?.name || null
        }
        break

      case 'Property': {
        // Use new format: property[layer@ALL].propertyKey instead of property[layer@propertyKey].value
        const propertyKey = column.extractedPropertyKey || column.propertyKey
        if (column.field === 'value') {
          key = `property[layer@ALL].${propertyKey}`
          // First try to get from submitted data, then from feature data
          value =
            submitted?.properties?.[propertyKey]?.value || getPropertyValue(propertyKey)
        } else if (column.field === 'valueId') {
          key = `property[layer@ALL].${propertyKey}.valueId`
          value = getPropertyValueId(propertyKey)
        }
        break
      }

      case 'AddressMeta':
        key = `addressMeta.${column.field}`
        value = addressMeta?.[column.field] || null
        break

      case 'Address':
        if (column.locale && column.locale !== 'None') {
          key = `feature.i18n[locale=${column.locale}].${column.field}`
          value = getAddressProperty(column.locale, column.field)
        }
        break
    }

    if (key) {
      flattened[key] = value
    }
  })

  // Add coordinates as feature.latitude and feature.longitude (not nested)
  if (pointGeometry?.coordinates) {
    flattened['feature.latitude'] = pointGeometry.coordinates[1]
    flattened['feature.longitude'] = pointGeometry.coordinates[0]
  }

  // Always export boolean feature fields (regardless of column mapping)
  flattened['feature.isPublished'] = feature.isPublished ?? false
  flattened['feature.isArchived'] = feature.isArchived ?? false
  flattened['feature.isIntangible'] = feature.isIntangible ?? false
  flattened['feature.isVisitable'] = feature.isVisitable ?? true

  // Add layer information
  flattened['layer.id'] = feature.layerId
  if (enriched?.layer?.name) {
    flattened['layer.name'] = enriched.layer.name
  }

  // Add user information from enriched and submitted data
  if (enriched?.user?.id) {
    flattened['user.id'] = enriched.user.id
  }
  if (submitted?.user?.email) {
    flattened['user.email'] = submitted.user.email
  }
  if (submitted?.user?.username) {
    flattened['user.username'] = submitted.user.username
  }

  // Create a map of propertyId to propertyKey from submitted/enriched data
  const propertyIdToKey = new Map<string, string>()

  // First, collect property keys from submitted data
  if (submitted?.properties) {
    Object.keys(submitted.properties).forEach(key => {
      const propData = submitted.properties[key]
      if (propData?.id) {
        propertyIdToKey.set(propData.id, key)
      }
    })
  }

  // Then from enriched data (may override submitted if more complete)
  if (enriched?.properties) {
    Object.entries(enriched.properties).forEach(([key, propData]: [string, any]) => {
      if (propData?.propertyId) {
        propertyIdToKey.set(propData.propertyId, key)
      }
    })
  }

  // Add all feature properties with the new structure
  feature.properties?.forEach(prop => {
    // Get property key from the populated property object, or lookup from map
    const propertyKey = prop.property?.key || propertyIdToKey.get(prop.propertyId)

    if (propertyKey) {
      // Add the property value
      flattened[`property[layer@ALL].${propertyKey}`] = prop.value

      // Add the propertyId
      flattened[`property[layer@ALL].${propertyKey}.id`] = prop.propertyId

      // Add the property value ID if it exists
      if (prop.propertyValueId) {
        flattened[`property[layer@ALL].${propertyKey}.valueId`] = prop.propertyValueId
      }

      // Add PropertyValueI18n values for each locale
      if (prop.propertyValue?.i18n) {
        Object.entries(prop.propertyValue.i18n).forEach(([locale, i18nValue]) => {
          if (i18nValue?.value) {
            flattened[`property[locale=${locale},layer@ALL].${propertyKey}.value`] =
              i18nValue.value
          }
        })
      }
    } else {
      console.warn(
        `❌ [flattenFeatureData] Could not determine property key for propertyId: ${prop.propertyId}`,
        {
          propertyHasKey: !!prop.property?.key,
          propertyIdInMap: propertyIdToKey.has(prop.propertyId),
          availableKeys: Array.from(propertyIdToKey.keys()),
        },
      )
    }
  })

  // Also add property metadata from enriched data for properties that may not be in feature.properties
  if (enriched?.properties) {
    Object.entries(enriched.properties).forEach(
      ([propertyKey, propertyData]: [string, any]) => {
        // Only add if not already processed above
        const existingProperty = feature.properties?.find(
          p => p.property?.key === propertyKey,
        )
        if (!existingProperty) {
          // Add metadata for properties that have enriched data but aren't in the feature
          if (propertyData.propertyId) {
            flattened[`property[layer@ALL].${propertyKey}.id`] = propertyData.propertyId
          }
          if (propertyData.propertyValueId) {
            flattened[`property[layer@ALL].${propertyKey}.valueId`] =
              propertyData.propertyValueId
          }
          // Value might come from submitted data
          const submittedValue = submitted?.properties?.[propertyKey]?.value
          if (submittedValue !== undefined) {
            flattened[`property[layer@ALL].${propertyKey}`] = submittedValue
          }
        } else {
          // Even if property exists, make sure we have the metadata from enriched data
          if (
            propertyData.propertyId &&
            !flattened[`property[layer@ALL].${propertyKey}.id`]
          ) {
            flattened[`property[layer@ALL].${propertyKey}.id`] = propertyData.propertyId
          }
          if (
            propertyData.propertyValueId &&
            !flattened[`property[layer@ALL].${propertyKey}.valueId`]
          ) {
            flattened[`property[layer@ALL].${propertyKey}.valueId`] =
              propertyData.propertyValueId
          }
        }
      },
    )
  }

  // Add all i18n data with proper locale formatting
  if (feature.i18n) {
    Object.entries(feature.i18n).forEach(([locale, localeData]) => {
      Object.entries(localeData).forEach(([field, value]) => {
        if (field !== 'addressProperties') {
          flattened[`feature.i18n[locale=${locale}].${field}`] = value
        } else if (typeof value === 'object' && value !== null) {
          // Handle addressProperties as nested object
          Object.entries(value).forEach(([addressField, addressValue]) => {
            flattened[
              `feature.i18n[locale=${locale}].addressProperties.${addressField}`
            ] = addressValue
          })
        }
      })
    })
  }

  // Add all addressMeta fields
  if (feature.addressMeta) {
    Object.entries(feature.addressMeta).forEach(([field, value]) => {
      flattened[`addressMeta.${field}`] = value
    })
  }

  return flattened
}

/**
 * Generate download data for processed results
 */
export function generateDownloadData(
  results: FeatureResolutionData[],
  columns: any[],
): any[] {
  return results.map(result => {
    const baseData = {
      status: result.status,
      error: result.error,
      existing: result.existing || null,
      submitted: result.submitted,
      enriched: result.enriched,
      saved: result.saved || null,
    }

    // For successful submissions, use the actual saved data for flattening
    if (result.status === 'success' && result.saved) {
      const flattened = flattenFeatureData(
        result.saved,
        columns,
        result.enriched,
        result.submitted,
      )
      return {
        ...baseData,
        flattened,
      }
    }

    // For unchanged records, use the existing data for flattening
    if (result.status === 'unchanged' && result.existing) {
      const flattened = flattenFeatureData(
        result.existing,
        columns,
        result.enriched,
        result.submitted,
      )
      return {
        ...baseData,
        flattened,
      }
    }

    // For other cases with merged data, use merged data for flattening
    if (result.merged && (result.status === 'error' || result.status === 'pending')) {
      try {
        const flattened = flattenFeatureData(
          result.merged,
          columns,
          result.enriched,
          result.submitted,
        )
        return {
          ...baseData,
          flattened,
        }
      } catch (flattenError) {
        console.warn('Could not flatten data:', flattenError)
        return {
          ...baseData,
          flattened: null,
        }
      }
    }

    return {
      ...baseData,
      flattened: null,
    }
  })
}

/**
 * Downloads feature-resolution results as a JSON artifact.
 *
 * @param importCtx - Active import context.
 * @param results - Current feature-resolution result rows.
 * @returns Nothing.
 */
export function downloadFeatureResolutionResults(
  importCtx: ImportCtx,
  results: FeatureResolutionData[],
): void {
  const columns = importCtx.getColumns()
  const downloadData = generateDownloadData(results, columns)
  const timestamp = new Date()
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(':', '-')
  const filename = `hype.hk-batch-upload-results-${timestamp}.json`

  const blob = new Blob([JSON.stringify(downloadData, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
