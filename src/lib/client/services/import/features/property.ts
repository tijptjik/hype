// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
import { getImportCtx } from '$lib/context/import.svelte'
// API
import { getProjectProperties } from '$lib/api/server/property.remote'
// TYPES
import type {
  FieldDiscriminator,
  Locale,
  Property,
} from '$lib/client/services/import/types'

type EnrichedPropertyValue = {
  propertyId?: string
  propertyValueId?: string
  value?: string
  _error?: string
  translatedValues?: unknown
}

type RowPropertyEnrichment = {
  properties?: Record<string, EnrichedPropertyValue>
  [key: string]: unknown
}

type PropertyReconciliationEnrichment = {
  propertyId?: string
  propertyValueId?: string
  propertyType?: FieldDiscriminator
  resolvedValues?: Record<string, string | null | undefined>
  propertyValueMapping?: Record<string, string>
  resolvedData?: Record<string, string | null | undefined>
  translatedValues?: unknown
  enrichedData?: Map<number, Record<Locale, string>>
}

/**
 * Logs import property diagnostics with a stable prefix for console filtering.
 * @param stage - Import pipeline stage being inspected.
 * @param payload - Debug payload for the current property operation.
 * @returns Nothing.
 */
function logImportPropertyDebug(stage: string, payload: Record<string, unknown>): void {
  console.info(`[IMPORT_PROPERTY_DEBUG] ${stage}`, payload)
}

function normalizeToggleValue(value: string): 'true' | 'false' | null {
  const normalized = value.trim().toLowerCase()

  if (['true', '1', 'yes'].includes(normalized)) return 'true'
  if (['false', '0', 'no'].includes(normalized)) return 'false'

  return null
}

function isBooleanLikePropertyValueId(value: string | null | undefined): boolean {
  if (!value) return false
  return normalizeToggleValue(value) !== null
}

export function getPropertyType(
  propertyKey: string,
  fetchedProperties: Property[],
): FieldDiscriminator {
  if (!propertyKey || propertyKey === 'NEW') {
    return 'classifier' // Default for new properties
  }

  const property = fetchedProperties.find(p => p.key === propertyKey)
  return (property?.type as FieldDiscriminator | undefined) || 'classifier'
}

export async function fetchAvailablePropertyKeys(importCtx?: ImportCtx): Promise<void> {
  const ctx = importCtx || getImportCtx()
  const selectedProject = ctx.getSelectedProject()

  if (!selectedProject) {
    console.warn('No project selected for fetching property keys')
    return
  }

  try {
    ctx.setIsFetchingProperties(true)

    // Fetch properties for the selected project through the guarded remote boundary.
    const result = await getProjectProperties({
      projectId: selectedProject.id,
      meta: { isAdminRequest: true },
    })
    const properties = (Array.isArray(result.data) ? result.data : []) as Property[]
    ctx.setFetchedProperties(properties)

    // Extract just the keys for dropdown options
    const propertyKeys = properties.map(p => p.key)
    ctx.setAvailablePropertyKeys(propertyKeys)
  } catch (error) {
    console.error('Error fetching property keys:', error)
    ctx.setFetchedProperties([])
    ctx.setAvailablePropertyKeys([])
  } finally {
    ctx.setIsFetchingProperties(false)
  }
}

/**
 * Enrich feature data with validated property IDs and values
 */
export function enrichFeaturesWithPropertyData(importCtx: ImportCtx): void {
  const data = importCtx.getData()
  const columns = importCtx.getColumns()
  const headers = importCtx.getHeaders()
  const propertyReconciliation = importCtx.getPropertyReconciliation()

  // Find property columns
  const propertyColumns = columns.filter(col => col.modelType === 'Property')
  if (propertyColumns.length === 0) {
    return
  }

  logImportPropertyDebug('enrichment:start', {
    rowCount: data.length,
    propertyColumnCount: propertyColumns.length,
    reconciliationKeys: Array.from(propertyReconciliation.enrichedData.keys()),
  })

  // Get column indices for property columns
  const propertyColumnIndices = propertyColumns.map(col => ({
    index: headers.indexOf(col.header),
    field: col.field,
    propertyKey: col.extractedPropertyKey || col.propertyKey,
    locale: col.locale,
  }))

  // Enrich each row with property data
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    const enriched = (importCtx.getRowEnrichedData(rowIndex) ||
      {}) as RowPropertyEnrichment

    if (!enriched.properties) {
      enriched.properties = {}
    }
    const rowProperties = enriched.properties

    // Check each property column for this row
    for (const { index, field, propertyKey, locale } of propertyColumnIndices) {
      const propertyValue = row[index]?.trim()

      if (propertyValue && propertyKey && field === 'value') {
        // Get enriched data for this property key
        const enrichedData = propertyReconciliation.enrichedData.get(propertyKey) as
          | PropertyReconciliationEnrichment
          | undefined
        const matchedProperty = importCtx
          .getFetchedProperties()
          .find(property => property.key === propertyKey)

        if (!enrichedData && !matchedProperty) {
          console.warn('[IMPORT_PROPERTY_DEBUG] enrichment:missing-property-source', {
            rowIndex,
            propertyKey,
            rawValue: propertyValue,
            locale,
          })
        }

        if (enrichedData || matchedProperty) {
          // Initialize property object if it doesn't exist
          if (!rowProperties[propertyKey]) {
            rowProperties[propertyKey] = {}
          }

          // Set the property ID
          if (enrichedData?.propertyId) {
            rowProperties[propertyKey].propertyId = enrichedData.propertyId
          } else if (matchedProperty?.id) {
            rowProperties[propertyKey].propertyId = matchedProperty.id
          }

          if (!rowProperties[propertyKey].propertyId) {
            console.error(
              `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: Missing propertyId for property "${propertyKey}". Dropping unresolved property shell before submission.`,
              {
                propertyKey,
                matchedPropertyId: matchedProperty?.id,
                reconciliationPropertyId: enrichedData?.propertyId,
              },
            )
            delete rowProperties[propertyKey]
            continue
          }

          // Determine property type
          const propertyType: FieldDiscriminator =
            enrichedData?.propertyType ||
            (matchedProperty?.type as FieldDiscriminator | undefined) ||
            'classifier'
          const isClassifier = propertyType === 'classifier'
          const isRangeField = matchedProperty?.component === 'RangeField'
          const isToggleField = matchedProperty?.component === 'ToggleField'
          const resolvedDataKey = `${locale || 'en'}:${propertyValue}`
          const hasExplicitIgnore =
            enrichedData?.resolvedData &&
            Object.hasOwn(enrichedData.resolvedData, resolvedDataKey) &&
            enrichedData.resolvedData[resolvedDataKey] === null

          let resolvedMappedValue: string | null = null

          if (
            enrichedData?.resolvedData &&
            Object.hasOwn(enrichedData.resolvedData, resolvedDataKey)
          ) {
            resolvedMappedValue = enrichedData.resolvedData[resolvedDataKey] || null
          }
          if (!resolvedMappedValue && enrichedData?.resolvedValues) {
            resolvedMappedValue = enrichedData.resolvedValues[propertyValue] || null
          }
          if (
            !resolvedMappedValue &&
            enrichedData?.resolvedData &&
            Object.hasOwn(enrichedData.resolvedData, propertyValue)
          ) {
            resolvedMappedValue = enrichedData.resolvedData[propertyValue] || null
          }

          // Try to resolve propertyValueId from mapping
          let propertyValueId = enrichedData?.propertyValueId || null

          // For classifiers, we MUST find a propertyValueId from the mapping
          if (!propertyValueId && !isRangeField && !isToggleField) {
            if (resolvedMappedValue) {
              propertyValueId = resolvedMappedValue
            }
            // Check resolvedValues first (expected structure)
            if (!propertyValueId && enrichedData?.resolvedValues) {
              propertyValueId = enrichedData.resolvedValues[propertyValue] || null
            }
            // Check propertyValueMapping (alternate structure)
            if (!propertyValueId && enrichedData?.propertyValueMapping) {
              propertyValueId = enrichedData.propertyValueMapping[propertyValue] || null
            }
            // Check resolvedData (another alternate structure)
            if (!propertyValueId && enrichedData?.resolvedData) {
              propertyValueId = enrichedData.resolvedData[propertyValue] || null
            }
          }

          // Handle based on property type and whether we found a propertyValueId
          if (isToggleField && isBooleanLikePropertyValueId(propertyValueId)) {
            propertyValueId = null
          }

          if (propertyValueId) {
            // Has propertyValueId - store the reference, skip the value
            rowProperties[propertyKey].propertyValueId = propertyValueId
          } else if (hasExplicitIgnore) {
            delete rowProperties[propertyKey]
          } else if (isRangeField || isToggleField) {
            const valueToStore = isToggleField
              ? resolvedMappedValue ||
                normalizeToggleValue(propertyValue) ||
                propertyValue
              : resolvedMappedValue || propertyValue
            if (valueToStore) {
              rowProperties[propertyKey].value = valueToStore
            } else {
              delete rowProperties[propertyKey]
            }
          } else if (isClassifier) {
            // Classifier MUST have propertyValueId - this is an error state
            console.error(
              `🔧 [PROPERTY_ENRICHMENT] Row ${rowIndex + 1}: ❌ CRITICAL ERROR: Classifier property "${propertyKey}" has no propertyValueId for value "${propertyValue}". ` +
                `This should have been created during reconciliation. Available mappings:`,
              {
                resolvedValues: enrichedData?.resolvedValues,
                propertyValueMapping: enrichedData?.propertyValueMapping,
                resolvedData: enrichedData?.resolvedData,
              },
            )
            // Store value as fallback to avoid data loss, but this indicates a bug
            rowProperties[propertyKey].value = propertyValue
            rowProperties[propertyKey]._error =
              'Missing propertyValueId for classifier field'
          } else {
            // Non-classifier - store the direct value (this is correct)
            rowProperties[propertyKey].value = propertyValue
          }

          // Store translated values if available
          const rowTranslatedValues = enrichedData?.enrichedData?.get(rowIndex)
          if (rowTranslatedValues) {
            rowProperties[propertyKey].translatedValues = rowTranslatedValues
          } else if (enrichedData?.translatedValues) {
            rowProperties[propertyKey].translatedValues = enrichedData.translatedValues
          }

          logImportPropertyDebug('enrichment:row-property', {
            rowIndex,
            propertyKey,
            rawValue: propertyValue,
            locale,
            propertyId: rowProperties[propertyKey]?.propertyId,
            propertyType,
            component: matchedProperty?.component,
            isClassifier,
            isRangeField,
            isToggleField,
            resolvedDataKey,
            resolvedMappedValue,
            resolvedPropertyValueId: propertyValueId,
            storedPropertyValueId: rowProperties[propertyKey]?.propertyValueId,
            storedValue: rowProperties[propertyKey]?.value,
            hasTranslatedValues: Boolean(rowProperties[propertyKey]?.translatedValues),
            error: rowProperties[propertyKey]?._error,
          })
        }
      }
    }

    logImportPropertyDebug('enrichment:row-final', {
      rowIndex,
      properties: rowProperties,
    })
    importCtx.setRowEnrichedData(rowIndex, enriched)
  }
}

export function validatePropertyColumns(importCtx?: ImportCtx): {
  isValid: boolean
  errors: string[]
} {
  const ctx = importCtx || getImportCtx()
  const errors: string[] = []

  // Property validation is now minimal - the main validation happens during property reconciliation
  // We only validate for obvious structural issues, not data content
  const propertyColumns = ctx
    .getColumns()
    .filter(col => col.modelType === 'Property' && col.field === 'value')

  for (const column of propertyColumns) {
    const columnIndex = ctx.getColumnIndex(column)
    const data = ctx.getData()

    // Get all non-empty values for this column
    const values = data
      .map(row => row[columnIndex])
      .filter((val): val is string => Boolean(val?.trim()))
      .map(val => val.trim())

    // Only check if column is completely empty (which might indicate a mapping error)
    if (values.length === 0) {
      errors.push(
        `Column "${column.header}" (Property: ${column.extractedPropertyKey || column.propertyKey || 'NEW'}) appears to be empty. ` +
          `Please ensure this column contains property values or set it to SKIP if not needed.`,
      )
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}
