// I18N
import { m } from '$lib/i18n'
// API
import { createLayer, getLayer, getLayers } from '$lib/api/server/layer.remote'
import { getProjectProperties as getProjectPropertiesRemote } from '$lib/api/server/property.remote'
// CONTEXT
import type { ImportCtx } from '$lib/context/import.svelte'
// TYPES
import type {
  Layer,
  Property,
  Id,
  LayerValidationResult,
} from '$lib/client/services/import/types'
import type { LayerFormInput } from '$lib/db/zod/schema/layer.types'
// Layer validation and resolution functions for CSV import

type LayerReferencePart = {
  field: string
  value: string
  locale?: string
}

type LayerReference = {
  key: string
  label: string
  id?: string
  name?: string
  locale: string
  parts: LayerReferencePart[]
}

type LayerFormLocale = {
  name: string
  nameShort: string
  description: string
  nameGen: boolean
  nameShortGen: boolean
  descriptionGen: boolean
}

// LAYER FORM CONFIGURATION
export const LAYER_FIELDS = {
  name: {
    label: m.admin__forms_common_name_full(),
    component: 'InputField',
    isArray: false,
    isTranslated: true,
    isNested: false,
  },
  nameShort: {
    label: m.admin__forms_common_name_short(),
    component: 'InputField',
    isArray: false,
    isTranslated: true,
    isNested: false,
  },
  description: {
    label: m.feature__description(),
    component: 'TextareaField',
    isArray: false,
    isTranslated: true,
    isNested: false,
  },
}

// Helper function to safely transform i18n data
function transformI18nSafely(i18n: any): any {
  if (typeof i18n === 'object' && i18n !== null) {
    return i18n
  }
  try {
    return JSON.parse(i18n)
  } catch {
    return {}
  }
}

// Merge project properties into layer (copied from loadFormData logic)
function mergeProjectProperties(layer: Layer, properties: Property[]): Layer {
  // Get existing property IDs
  // Since it's a new layer, there are no existing property IDs
  const existingPropertyIds: Id[] = (layer.properties || [])
    .map(p => p.propertyId)
    .filter(id => id !== undefined) as Id[]

  // Ensure layer.properties is initialized to an array if it's not already
  if (!Array.isArray(layer.properties)) {
    layer.properties = []
  }

  // Add project properties that aren't already in the layer
  properties.forEach((projectProp: Property) => {
    if (!existingPropertyIds.includes(projectProp.id)) {
      if (typeof projectProp.i18n !== 'object' && projectProp.i18n) {
        projectProp.i18n = transformI18nSafely(projectProp.i18n)
      }
      // Create a conformed property object
      const conformedProjectProp: Property = {
        ...projectProp,
        values: projectProp.values || [], // Ensure values is an array
      }

      const layerProperty = {
        layerId: layer.id!, // Assuming layer.id is defined; handle if new layer might not have id
        propertyId: conformedProjectProp.id,
        isVisible: false,
        property: conformedProjectProp,
      }

      layer.properties.push(layerProperty as any) // Type assertion to avoid complex type issues
    }
  })
  return layer
}

// Get project properties for merging with new layer
async function getProjectProperties(projectId: string): Promise<Property[]> {
  try {
    const result = await getProjectPropertiesRemote({
      projectId,
      meta: { isAdminRequest: true },
    })
    return (Array.isArray(result.data) ? result.data : []) as Property[]
  } catch (error) {
    console.error('Error fetching project properties:', error)
    return []
  }
}

// Preload all layers for the project
export async function preloadLayers(projectId: string): Promise<any[]> {
  try {
    const result = await getLayers({
      conditions: {
        projectId,
        isPublished: null,
        isArchived: false,
      },
      pagination: { limit: 500, offset: 0 },
      meta: { isAdminRequest: true, profile: 'admin' },
    })
    return Array.isArray(result.data) ? result.data : []
  } catch (error) {
    console.error('Error preloading layers:', error)
    return []
  }
}

// Search layers function (filters preloaded layers)
export function searchLayers(query: string, allLayers: any[]): any[] {
  if (!query.trim()) {
    return allLayers
  }

  const searchTerm = query.toLowerCase()
  return allLayers.filter(layer => {
    const name = layer.i18n?.en?.name?.toLowerCase() || ''
    const description = layer.i18n?.en?.description?.toLowerCase() || ''
    return name.includes(searchTerm) || description.includes(searchTerm)
  })
}

// Layer validation functions
export async function validateLayerById(
  layerId: string,
  projectId: string,
): Promise<boolean> {
  try {
    const layers = await preloadLayers(projectId)
    return layers.some(layer => layer.id === layerId || layer.code === layerId)
  } catch (error) {
    console.error('Error validating layer by ID:', error)
    return false
  }
}

export async function validateLayerByName(
  layerName: string,
  projectId: string,
  locale: string = 'en',
): Promise<{ isValid: boolean; layerId?: string }> {
  try {
    const layers = await preloadLayers(projectId)

    // Search through the layers to find one with matching name in the specified locale
    for (const layer of layers) {
      const layerName_i18n = layer.i18n?.[locale]?.name
      if (layerName_i18n && layerName_i18n.toLowerCase() === layerName.toLowerCase()) {
        return { isValid: true, layerId: layer.id }
      }
    }

    return { isValid: false }
  } catch (error) {
    console.error('Error validating layer by name:', error)
    return { isValid: false }
  }
}

// Layer selection functions
export function handleLayerSearch(query: string, allLayers: any[]): any[] {
  return searchLayers(query, allLayers)
}

export function handleLayerSearchFocus(allLayers: any[]): any[] {
  return allLayers
}

export function selectLayer(layer: any): { layer: any; layerId: string } {
  return { layer, layerId: layer.id }
}

// Layer resolution search function
export function handleLayerResolutionSearch(query: string, allLayers: any[]): any[] {
  return searchLayers(query, allLayers)
}

// Layer resolution functions
export function setLayerResolution(
  invalidValue: string,
  layerId: string,
  layerData: any,
  resolutions: Map<string, { layerId: string; layerData?: any }>,
): Map<string, { layerId: string; layerData?: any }> {
  resolutions.set(invalidValue, { layerId, layerData })
  return new Map(resolutions)
}

export function removeLayerResolution(
  invalidValue: string,
  resolutions: Map<string, { layerId: string; layerData?: any }>,
): Map<string, { layerId: string; layerData?: any }> {
  resolutions.delete(invalidValue)
  return new Map(resolutions)
}

export function selectLayerForResolution(
  invalidValue: string,
  layer: any,
  resolutions: Map<string, { layerId: string; layerData?: any }>,
): Map<string, { layerId: string; layerData?: any }> {
  return setLayerResolution(invalidValue, layer.id, layer, resolutions)
}

export function resetLayerResolution(
  invalidValue: string,
  resolutions: Map<string, { layerId: string; layerData?: any }>,
): Map<string, { layerId: string; layerData?: any }> {
  return removeLayerResolution(invalidValue, resolutions)
}

export function canCompleteLayerResolution(
  invalidValues: string[],
  resolutions: Map<string, { layerId: string; layerData?: any }>,
): boolean {
  return invalidValues.every(value => resolutions.has(value))
}

/**
 * Extracts a likely layer name from a validation label for creation prefill.
 *
 * @param invalidValue - Layer validation label such as `name: Parks | id: abc`.
 * @returns A user-facing prefill string for the layer creation form.
 */
export function getLayerCreationPrefill(invalidValue: string): string {
  const nameMatch = invalidValue.match(/(?:^|\|\s*)name:\s*([^|]+)/)
  return nameMatch?.[1]?.trim() || invalidValue
}

/**
 * Splits a layer validation label into displayable key/value parts.
 *
 * @param invalidValue - Layer validation label composed of `key: value` segments.
 * @returns Ordered display parts for the layer-resolution UI.
 */
export function getLayerResolutionParts(
  invalidValue: string,
): Array<{ key: string; value: string }> {
  return invalidValue
    .split('|')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [rawKey, ...rest] = part.split(':')
      return {
        key: rawKey?.trim() || 'value',
        value: rest.join(':').trim(),
      }
    })
}

function getLayerDisplayName(layer: any): string {
  return layer?.i18n?.en?.name || layer?.code || layer?.id || 'Unknown Layer'
}

function getLayerNameForLocale(layer: any, locale: string): string {
  return layer?.i18n?.[locale]?.name || layer?.i18n?.en?.name || ''
}

function normalizeLayerFormLocale(
  localeData: any,
  fallbackName: string,
): LayerFormLocale {
  const name = String(localeData?.name || fallbackName || '').trim()
  const nameShort = String(localeData?.nameShort || name || fallbackName || '').trim()

  return {
    name,
    nameShort,
    description: String(localeData?.description || ''),
    nameGen: Boolean(localeData?.nameGen),
    nameShortGen: Boolean(localeData?.nameShortGen),
    descriptionGen: Boolean(localeData?.descriptionGen),
  }
}

function toLayerFormI18n(i18n: Record<string, any> | undefined): {
  en: LayerFormLocale
  zhHant: LayerFormLocale
  zhHans: LayerFormLocale
} {
  const fallbackName =
    i18n?.en?.name || i18n?.zhHant?.name || i18n?.zhHans?.name || 'Imported Layer'

  return {
    en: normalizeLayerFormLocale(i18n?.en, fallbackName),
    zhHant: normalizeLayerFormLocale(i18n?.zhHant, fallbackName),
    zhHans: normalizeLayerFormLocale(i18n?.zhHans, fallbackName),
  }
}

function toLayerReferenceKey(parts: LayerReferencePart[]): string {
  return parts
    .map(part => `${part.field}:${part.value}`)
    .sort()
    .join(' | ')
}

function toLayerReferenceLabel(parts: LayerReferencePart[]): string {
  return parts
    .map(part => `${part.field}: ${part.value}`)
    .sort()
    .join(' | ')
}

function getLayerReferences(
  layerColumns: any[],
  sampleData: string[][],
  headers: string[],
  fallbackLocale: string,
): LayerReference[] {
  const layerColumnRefs = layerColumns
    .map(col => ({
      index: headers.indexOf(col.header),
      field: col.field,
      locale: col.locale && col.locale !== 'None' ? col.locale : fallbackLocale,
    }))
    .filter(col => col.index >= 0 && (col.field === 'id' || col.field === 'name'))

  const referencesByKey = new Map<string, LayerReference>()

  for (const row of sampleData) {
    const parts: LayerReferencePart[] = []

    for (const col of layerColumnRefs) {
      const value = row[col.index]?.trim()
      if (!value) continue
      parts.push({
        field: col.field,
        value,
        locale: col.locale,
      })
    }

    if (parts.length === 0) continue

    const key = toLayerReferenceKey(parts)
    if (referencesByKey.has(key)) continue

    const id = parts.find(part => part.field === 'id')?.value
    const namePart = parts.find(part => part.field === 'name')
    referencesByKey.set(key, {
      key,
      label: toLayerReferenceLabel(parts),
      id,
      name: namePart?.value,
      locale: namePart?.locale ?? fallbackLocale,
      parts,
    })
  }

  return Array.from(referencesByKey.values())
}

function findLayerByReference(reference: LayerReference, allLayers: any[]): any | null {
  const byId = reference.id
    ? allLayers.find(layer => layer.id === reference.id || layer.code === reference.id)
    : null
  if (byId) {
    if (!reference.name) return byId

    const name = getLayerNameForLocale(byId, reference.locale)
    if (name && name.toLowerCase() === reference.name.toLowerCase()) return byId

    // Prefer the explicit id when both id and name are present but the imported
    // label is stale; ids are the canonical layer identity.
    return byId
  }

  if (!reference.name) return null

  return (
    allLayers.find(layer => {
      const name = getLayerNameForLocale(layer, reference.locale)
      return name && name.toLowerCase() === reference.name!.toLowerCase()
    }) ?? null
  )
}

function getLayerReferenceForRow(
  row: string[],
  layerColumnIndices: Array<{ index: number; field: string; locale?: string }>,
  fallbackLocale: string,
): LayerReference | null {
  const parts: LayerReferencePart[] = []

  for (const col of layerColumnIndices) {
    const value = row[col.index]?.trim()
    if (!value) continue
    parts.push({
      field: col.field,
      value,
      locale: col.locale && col.locale !== 'None' ? col.locale : fallbackLocale,
    })
  }

  if (parts.length === 0) return null

  const namePart = parts.find(part => part.field === 'name')
  return {
    key: toLayerReferenceKey(parts),
    label: toLayerReferenceLabel(parts),
    id: parts.find(part => part.field === 'id')?.value,
    name: namePart?.value,
    locale: namePart?.locale ?? fallbackLocale,
    parts,
  }
}

// Layer validation orchestration
export async function validateLayers(
  layerColumns: any[],
  sampleData: string[][],
  headers: string[],
  projectId: string,
  locale: string,
  onProgress: (progress: number, total: number) => void,
  onResults: (results: LayerValidationResult[]) => void,
): Promise<{ invalidCount: number; results: LayerValidationResult[] }> {
  const layerReferences = getLayerReferences(layerColumns, sampleData, headers, locale)
  const results: LayerValidationResult[] = []
  const allLayers = await preloadLayers(projectId)

  // Validate each unique row-level layer reference.
  for (let i = 0; i < layerReferences.length; i++) {
    const reference = layerReferences[i]

    try {
      const layer = findLayerByReference(reference, allLayers)
      results.push({
        value: reference.label,
        isValid: Boolean(layer),
        layerId: layer?.id,
        error: layer ? undefined : 'Layer not found',
        i18n: layer?.i18n,
      })
    } catch (error) {
      results.push({
        value: reference.label,
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      })
    }

    onProgress(i + 1, layerReferences.length)

    // Small delay to show progress
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  onResults(results)

  // Check if all validations passed
  const invalidResults = results.filter(r => !r.isValid)
  return { invalidCount: invalidResults.length, results }
}

/**
 * Enrich feature data with validated layer IDs
 */
export function enrichFeaturesWithLayerData(
  importCtx: ImportCtx,
  validationResults: LayerValidationResult[],
): void {
  const data = importCtx.getData()
  const columns = importCtx.getColumns()
  const headers = importCtx.getHeaders()

  // Find layer columns
  const layerColumns = columns.filter(col => col.modelType === 'Layer')
  if (layerColumns.length === 0) {
    // If no layer columns, all features should use the fallback layer
    const layerValidation = importCtx.getLayerValidation()
    if (layerValidation.fallbackLayerId) {
      // Get all layers to find the fallback layer name
      const allLayers = importCtx.getAllLayers()
      const fallbackLayer = allLayers.find(
        layer => layer.id === layerValidation.fallbackLayerId,
      )

      for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
        const enriched = importCtx.getRowEnrichedData(rowIndex) || {}
        enriched.layer = {
          id: layerValidation.fallbackLayerId,
          name: fallbackLayer?.i18n?.en?.name || 'Unknown Layer',
        }
        importCtx.setRowEnrichedData(rowIndex, enriched)
      }
    }
    return
  }

  // Create a map of layer values to layer IDs and layer data
  const layerValueToId = new Map<string, string>()
  const layerIdToData = new Map<string, any>()

  // Get all layers to build a mapping of ID to layer data
  const allLayers = importCtx.getAllLayers()
  allLayers.forEach(layer => {
    if (layer.id) {
      layerIdToData.set(layer.id, layer)
    }
  })

  validationResults.forEach(result => {
    if (result.isValid && result.layerId) {
      layerValueToId.set(result.value, result.layerId)
    }
  })

  // Also check layer resolution for any resolved values
  const layerResolution = importCtx.getLayerResolution()
  layerResolution.resolutions.forEach((resolution, invalidValue) => {
    if (resolution.layerId) {
      layerValueToId.set(invalidValue, resolution.layerId)
      // Also store the layer data if available
      if (resolution.layerData) {
        layerIdToData.set(resolution.layerId, resolution.layerData)
      }
    }
  })

  // Get column indices for layer columns
  const layerColumnIndices = layerColumns
    .map(col => ({
      index: headers.indexOf(col.header),
      field: col.field || '',
      locale: col.locale,
    }))
    .filter(col => col.index >= 0 && (col.field === 'id' || col.field === 'name'))

  // Enrich each row with layer data
  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]
    const enriched = (importCtx.getRowEnrichedData(rowIndex) || {}) as {
      layer?: { id: string; name: string }
      [key: string]: unknown
    }
    const reference = getLayerReferenceForRow(
      row,
      layerColumnIndices,
      importCtx.getSelectedLocale() || 'en',
    )

    if (reference && layerValueToId.has(reference.label)) {
      const layerId = layerValueToId.get(reference.label)!
      const layerData = layerIdToData.get(layerId)
      const enrichedLayer = {
        id: layerId,
        name: layerData
          ? getLayerDisplayName(layerData)
          : reference.name || reference.id || reference.label,
      }

      enriched.layer = enrichedLayer
    }

    // Check each layer column for this row
    if (!enriched.layer) {
      for (const { index } of layerColumnIndices) {
        const layerValue = row[index]?.trim()
        if (layerValue && layerValueToId.has(layerValue)) {
          const layerId = layerValueToId.get(layerValue)!
          const layerData = layerIdToData.get(layerId)

          enriched.layer = {
            id: layerId,
            name: layerData ? getLayerDisplayName(layerData) : layerValue,
          }

          break // Use first matching layer column
        }
      }
    }

    // If no layer found but we have a fallback, use it
    if (!enriched.layer) {
      const layerValidation = importCtx.getLayerValidation()
      if (layerValidation.fallbackLayerId) {
        const fallbackLayerData = layerIdToData.get(layerValidation.fallbackLayerId)

        enriched.layer = {
          id: layerValidation.fallbackLayerId,
          name: fallbackLayerData?.i18n?.en?.name || 'Unknown Layer',
        }
      }
    }

    importCtx.setRowEnrichedData(rowIndex, enriched)
  }
}

// Layer creation functions
export function showLayerCreationForm(importCtx: ImportCtx, prefillValue?: string) {
  importCtx.setIsCreatingLayer(true)

  // Get the selected locale from step 1
  const selectedLocale = importCtx.getSelectedLocale() || 'en'

  // Initialize the layer form with pre-filled data if provided
  const emptyLayer = {
    i18n: {
      en: {
        name: selectedLocale === 'en' ? prefillValue || '' : '',
        nameGen: !(selectedLocale === 'en' && prefillValue),
        nameShort: selectedLocale === 'en' ? prefillValue || '' : '',
        nameShortGen: !(selectedLocale === 'en' && prefillValue),
        description: '',
      },
      zhHant: {
        name: selectedLocale === 'zhHant' ? prefillValue || '' : '',
        nameGen: !(selectedLocale === 'zhHant' && prefillValue),
        nameShort: selectedLocale === 'zhHant' ? prefillValue || '' : '',
        nameShortGen: !(selectedLocale === 'zhHant' && prefillValue),
        description: '',
      },
      zhHans: {
        name: selectedLocale === 'zhHans' ? prefillValue || '' : '',
        nameGen: !(selectedLocale === 'zhHans' && prefillValue),
        nameShort: selectedLocale === 'zhHans' ? prefillValue || '' : '',
        nameShortGen: !(selectedLocale === 'zhHans' && prefillValue),
        description: '',
      },
    },
  }

  // Store draft layer data directly in import context; the flow mutates it as controlled state.
  importCtx.setLayerForm(emptyLayer as LayerFormInput['data'])
}

export function hideLayerCreationForm(importCtx: ImportCtx) {
  importCtx.setIsCreatingLayer(false)
  importCtx.setLayerForm(null)
  importCtx.setActiveLayerCreation(null)
}

export async function submitLayerForm(importCtx: ImportCtx, event: Event) {
  event.preventDefault()
  const layerForm = importCtx.getLayerForm()
  if (!layerForm || !importCtx.getSelectedProject()) return

  importCtx.setIsSubmittingLayer(true)

  try {
    const currentFormData = layerForm as LayerFormInput['data']

    const selectedProject = importCtx.getSelectedProject()!

    // Fetch project properties and create layer properties for the new layer
    const projectProperties = await getProjectProperties(selectedProject.id)

    // Create layer properties array for the new layer
    const layerProperties = projectProperties.map((projectProp: Property) => {
      if (typeof projectProp.i18n !== 'object' && projectProp.i18n) {
        projectProp.i18n = transformI18nSafely(projectProp.i18n)
      }

      // Transform property i18n from array to object format (keyed by locale)
      const transformedPropertyI18n: Record<string, any> = {}
      if (Array.isArray(projectProp.i18n)) {
        projectProp.i18n.forEach((i18nItem: any) => {
          if (i18nItem.locale) {
            transformedPropertyI18n[i18nItem.locale] = i18nItem
          }
        })
      } else if (projectProp.i18n && typeof projectProp.i18n === 'object') {
        // Already in object format, just ensure locale field is present
        Object.entries(projectProp.i18n).forEach(([locale, data]: [string, any]) => {
          transformedPropertyI18n[locale] = {
            ...data,
            locale,
          }
        })
      }

      // Transform property values i18n from array to object format as well
      const transformedValues = (projectProp.values || []).map((value: any) => {
        const transformedValueI18n: Record<string, any> = {}
        if (Array.isArray(value.i18n)) {
          value.i18n.forEach((i18nItem: any) => {
            if (i18nItem.locale) {
              transformedValueI18n[i18nItem.locale] = i18nItem
            }
          })
        } else if (value.i18n && typeof value.i18n === 'object') {
          Object.entries(value.i18n).forEach(([locale, data]: [string, any]) => {
            transformedValueI18n[locale] = {
              ...data,
              locale,
            }
          })
        }

        return {
          ...value,
          i18n: transformedValueI18n,
        }
      })

      // Create a conformed property object
      const conformedProjectProp: Property = {
        ...projectProp,
        i18n: transformedPropertyI18n,
        values: transformedValues,
      }

      return {
        propertyId: conformedProjectProp.id,
        isVisible: false,
        isUserContributable: false,
      }
    })

    const layerData = {
      metadata: currentFormData.metadata ?? {},
      isDefaultVisible: Boolean(currentFormData.isDefaultVisible),
      projectId: selectedProject.id,
      organisationId: selectedProject.organisationId, // Required by layer schema
      properties: layerProperties, // Include all project properties
      i18n: toLayerFormI18n(currentFormData.i18n),
    }

    const created = await createLayer({
      meta: {
        mode: 'create',
        isAdminRequest: true,
      },
      data: layerData,
    })

    if (!created.data?.id) {
      throw new Error('Layer creation did not return a layer id')
    }

    const createdLayerState = await getLayer({
      ref: created.data.id,
      refKey: 'id',
      meta: { isAdminRequest: true, profile: 'admin' },
    })
    const newLayer = createdLayerState.data as Layer | null
    if (!newLayer) throw new Error('Created layer could not be loaded')

    // Add the new layer to the allLayers list so it can be found in searches
    const currentLayers = importCtx.getAllLayers()
    importCtx.setAllLayers([...currentLayers, newLayer])

    // Select the newly created layer
    importCtx.setSelectedLayer(newLayer)
    const layerValidation = importCtx.getLayerValidation()
    layerValidation.fallbackLayerId = newLayer.id
    importCtx.setLayerValidation(layerValidation)

    // If we're in layer resolution mode, auto-assign this new layer to the specific value being resolved
    if (layerValidation.showLayerResolution) {
      const activeLayerCreation = importCtx.getActiveLayerCreation()
      if (activeLayerCreation) {
        const layerResolution = importCtx.getLayerResolution()
        const newResolutions = new Map(layerResolution.resolutions)

        // Only assign the new layer to the specific invalid value that triggered this creation
        newResolutions.set(activeLayerCreation, {
          layerId: newLayer.id,
          layerData: newLayer,
        })

        importCtx.setLayerResolution({
          invalidValues: layerResolution.invalidValues,
          resolutions: newResolutions,
        })
      }
    }

    // Hide the form
    hideLayerCreationForm(importCtx)
  } catch (error) {
    console.error('Error creating layer:', error)
  } finally {
    importCtx.setIsSubmittingLayer(false)
  }
}
