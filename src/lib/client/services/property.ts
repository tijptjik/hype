import { customAlphabet } from 'nanoid'
// I18N
import { m } from '$lib/i18n'
import { ensureLocaleEntryForWrite } from '$lib/i18n'
import { getI18n } from '$lib/i18n'
import { toLocaleKey } from '$lib/i18n'
// FORMS
import { updateFormData } from '$lib/client/services/form'
// ENUMS
import { FirstClassResource } from '$lib/enums'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type {
  Property,
  FeatureProperty,
  PropertyValue,
  UserContributedFeatureProperty,
  Feature,
  Locale,
  LocaleExtended,
  Id,
  RangeFilterValue,
  FeaturePropertyI18nDB,
  FeatureFromCollection,
  FormDataUpdaterForm,
  PropertyFormData,
  PropertyDiscriminator,
  PropertyNew,
  WritableI18nRecord,
  PropertyTranslationOrigin,
} from '$lib/types'

// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SORTING
//    - sortProperties
//    - sortPropertiesByTypeAndRank
//    - sortFeatureProperties
//
// 2. GROUPING
//    - getGroupedClassifierProperties
//
// 3. MUTATIONS
//    - Filter-state mutators
//      - toggleCategoricalPropertyValue
//      - setCategoricalPropertyFilter
//      - resetCategoricalPropertyFilter
//      - setRangePropertyFilter
//
// 3.1 PROJECT PROPERTY FORM :: INTERNAL HELPERS
//    - Form state access/mutation helpers
//      - rerankPropertiesByType
//      - getMutableProperties
//      - mutatePropertyFormData
//      - mutatePropertyById
//      - mutatePropertyValueById
//    - Form i18n factories
//      - toEmptyPropertyI18n
//      - toEmptyPropertyValueI18n
//    - Ordering helpers
//      - reorderRankedItems
//    - Translation orchestration helpers
//      - collectMissingPropertyTranslations
//      - requestPropertyTranslations
//      - applyPropertyTranslations
//
// 3.2 PROJECT PROPERTY FORM :: PUBLIC MUTATORS
//    - Read/filter helper
//      - getPropertiesByType
//      - getCurrentProjectProperties
//      - getProjectPropertyFieldsForIndex
//      - getPropertyFormIssues
//      - getPropertyIssuesForTypeFromFormIssues
//      - getPropertyIssueItemIdsForTypeFromFormIssues
//      - stopEvent
//      - scrollWithMovedProperty
//    - Property mutators
//      - addProjectPropertyForType
//      - removeProjectPropertyForType
//      - changeProjectPropertyRank
//      - updateProjectPropertyBase
//      - updateProjectPropertyI18n
//    - Property value mutators
//      - addProjectPropertyValue
//      - removeProjectPropertyValue
//      - reorderProjectPropertyValue
//      - updateProjectPropertyValueI18n
//    - Locale mutators
//      - translateProjectPropertyLocale
//      - resetProjectPropertyLocale
//
// 4. DISPLAY
//    - displaySelectedProperties
//    - displaySelectedFilters
//    - displayRangeFilter
//
// 5. FILTERING
//    - getFeatureIdsForProperties
//
// 6.1 FEATURE PROPERTY
//   :: GETTERS
//    - getFeatureCardDisplayProperties
//    - getFeatureCardEditableProperties
//    - getUserContributableProperties
//    - getLocalisedPropertyValues
//    - getFeatureProperty
//    - getUniversalSpecifierValue
//    - getI18nSpecifierValue
//    - getClassifierValueId
//
// 6.2 FEATURE PROPERTY
//   :: SETTERS
//    - updateFeatureProperty
//    - updateFeatureI18nProperty
//    - updateNewFeatureProperty
//    - updateNewFeatureI18nProperty
//    - handleCategoricalChange
//    - handleSpecifierChange

// ═══════════════════════
// 1. SORTING
// ═══════════════════════

/**
 * Sorts an array of properties by type and rank.
 *
 * @param properties - Array of properties to sort
 * @returns Sorted array of properties
 */
export function sortProperties<T extends { property?: Property }>(
  properties: T[],
): T[] {
  return [...properties].sort(sortPropertiesByTypeAndRank)
}

/**
 * Sorts an array of feature properties by the type and rank of their property.
 *
 * @param featureProperties - Array of feature properties to sort
 * @returns Sorted array of feature properties
 */
export function sortFeatureProperties(
  featureProperties: Omit<FeatureProperty, 'featureId'>[],
): Omit<FeatureProperty, 'featureId'>[] {
  // Sort the feature properties directly using the property field
  const sortedFeatureProperties = [...featureProperties].sort((a, b) =>
    sortPropertiesByTypeAndRank(a, b, (a, b) => {
      // Fallback sort by key if properties exist
      if (!a.property || !b.property) return 0
      return a.property.key.localeCompare(b.property.key)
    }),
  )

  return sortedFeatureProperties
}

/**
 * Sorts properties by type (classifiers first, then specifiers) and then by rank.
 * Lower rank values have higher priority.
 *
 * @param a - First property to compare
 * @param b - Second property to compare
 * @returns Sort comparison result
 */
export function sortPropertiesByTypeAndRank<T extends { property?: Property }>(
  a: T,
  b: T,
  fallbackSort?: (a: T, b: T) => number,
): number {
  // Check if both properties exist
  if (!a.property || !b.property) return 0

  // First sort by type: classifiers before specifiers
  const typeOrder = { classifier: 0, specifier: 1 }
  const typeA = typeOrder[a.property.type as keyof typeof typeOrder] ?? 2
  const typeB = typeOrder[b.property.type as keyof typeof typeOrder] ?? 2

  if (typeA !== typeB) {
    return typeA - typeB
  }

  // Then sort by rank (lower rank comes first)
  const rankA = a.property.rank ?? Infinity
  const rankB = b.property.rank ?? Infinity

  if (rankA !== rankB) {
    return rankA - rankB
  }

  // If ranks are equal, use fallback sort or default to alphabetical by key
  if (fallbackSort) {
    return fallbackSort(a, b)
  }
  return a.property.key.localeCompare(b.property.key)
}

// ═══════════════════════
// 2. GROUPING
// ═══════════════════════

/**
 * Groups classifier properties per layer, and adds hierarchy information.
 *
 * @param appCtx - The application context
 * @returns Array of grouped classifier properties
 */
export const getGroupedClassifierProperties = async (
  appCtx: AppCtx,
): Promise<
  Array<{
    hierarchy: {
      organisation: string | null
      project: string | null
      layer: string | null
      layerId: string
    }
    properties: Property[]
  }>
> => {
  const results = await Promise.all(
    appCtx.getPrism(FirstClassResource.layer).map(async layerId => {
      // Get layer
      const layer = await appCtx.getLayerById(layerId)
      if (!layer) return null
      // Get project and organisation for this layer
      const { project, organisation } = await appCtx.getHierarchy(layer)
      if (!project || !organisation) return null

      // Get sorted classifier properties from layerProperties
      const properties = await appCtx.getClassifierPropertiesForLayer(layer)
      if (properties.length === 0) return null

      // Construct hierarchy info
      const hierarchy = {
        organisation: appCtx.getContextualOrganisationName(organisation),
        project: appCtx.getContextualProjectName(project),
        layer: appCtx.getContextualLayerName(layer),
        layerId: layer.id, // Pass layerId for direct filter access
      }

      return {
        hierarchy,
        properties,
      }
    }),
  )

  // Filter out nulls and empty groups
  return results.filter((group): group is NonNullable<typeof group> => group !== null)
}

// ═══════════════════════
// 3. MUTATIONS
// ═══════════════════════

// ───────────────────────
// 3.0 FILTER-STATE MUTATORS
// ───────────────────────

/**
 * Toggles a categorical property filter value.
 */
export function toggleCategoricalPropertyValue(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
  propertyValueId: Id,
): void {
  const currentSelection =
    appCtx.state.filters.feature.properties?.[layerId]?.[propertyId] ?? []
  const index = currentSelection.indexOf(propertyValueId)
  let newSelection: string[]

  if (index === -1) {
    newSelection = [...currentSelection, propertyValueId]
  } else {
    newSelection = currentSelection.filter((v: string) => v !== propertyValueId)
  }

  // Update context using the dedicated methods
  if (newSelection.length > 0) {
    setCategoricalPropertyFilter(appCtx, layerId, propertyId, newSelection)
  } else {
    // If selection becomes empty, remove the key from the filter object for this layer
    resetCategoricalPropertyFilter(appCtx, layerId, propertyId)
  }
}

/**
 * Sets a categorical property filter.
 */
export function setCategoricalPropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
  values: string[],
): void {
  if (!appCtx.state.filters.feature.properties) {
    appCtx.state.filters.feature.properties = {}
  }
  const propertyFilters = appCtx.state.filters.feature.properties
  propertyFilters[layerId] = {
    ...(propertyFilters[layerId] || {}),
    [propertyId]: values,
  }
  appCtx.zoomToAllVisibleFeatures()
}

/**
 * Removes a categorical property filter.
 */
export function resetCategoricalPropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
): void {
  const propertyFilters = appCtx.state.filters.feature.properties
  if (!propertyFilters?.[layerId]) return
  delete propertyFilters[layerId]?.[propertyId]
  appCtx.zoomToAllVisibleFeatures()
}

/**
 * Sets a range property filter.
 */
export function setRangePropertyFilter(
  appCtx: AppCtx,
  layerId: Id,
  propertyId: Id,
  values: [number, number],
): void {
  if (!appCtx.state.filters.feature.properties) {
    appCtx.state.filters.feature.properties = {}
  }
  const propertyFilters = appCtx.state.filters.feature.properties
  const layerPropertyFilters = propertyFilters[layerId]
  const nextRangeMin = Math.min(...values)
  const nextRangeMax = Math.max(...values)

  // Only update if the values have actually changed to prevent unnecessary reactivity triggers
  if (
    layerPropertyFilters?.[propertyId]?.rangeMin !== nextRangeMin ||
    layerPropertyFilters?.[propertyId]?.rangeMax !== nextRangeMax
  ) {
    // Ensure the layer object exists
    propertyFilters[layerId] ??= {}

    // Get the existing range filter or find the property definition to get global min/max
    const existingRangeFilter = propertyFilters[layerId]?.[propertyId] || {}

    // If globalMin/globalMax are missing, find them from the property definition
    let globalMin = existingRangeFilter.globalMin
    let globalMax = existingRangeFilter.globalMax

    if (globalMin === undefined || globalMax === undefined) {
      // Find the property definition to get the global min/max
      const property = appCtx.cache.property.get(propertyId)
      if (property) {
        globalMin = property.min
        globalMax = property.max
      }
    }

    propertyFilters[layerId][propertyId] = {
      globalMin,
      globalMax,
      rangeMin: nextRangeMin,
      rangeMax: nextRangeMax,
    }
    appCtx.zoomToAllVisibleFeatures()
  }
}

// ═══════════════════════
// 3.1 PROJECT PROPERTY FORM :: INTERNAL HELPERS
// ═══════════════════════

const propertyNanoId = customAlphabet(
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_$',
  12,
)

function rerankPropertiesByType(
  properties: Property[],
  fieldDiscriminator: PropertyDiscriminator,
): void {
  const propsOfType = properties.filter(
    property => property.type === fieldDiscriminator,
  )
  propsOfType.sort((a, b) => a.rank - b.rank)
  propsOfType.forEach((property, index) => {
    property.rank = index
  })
}

function getMutableProperties(data: PropertyFormData): Property[] {
  return (data.properties || []) as Property[]
}

function mutatePropertyFormData(
  form: FormDataUpdaterForm<PropertyFormData>,
  mutator: (properties: Property[], data: PropertyFormData) => void,
): void {
  updateFormData(form, data => {
    const properties = getMutableProperties(data)
    mutator(properties, data)
    data.properties = properties
    return data
  })
}

function mutatePropertyById(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  mutator: (property: Property) => void,
): void {
  mutatePropertyFormData(form, properties => {
    const target = properties.find(property => property.id === propertyId)
    if (!target) return
    mutator(target)
  })
}

function mutatePropertyValueById(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  valueId: Id,
  mutator: (value: NonNullable<Property['values']>[number]) => void,
): void {
  mutatePropertyById(form, propertyId, property => {
    const target = property.values?.find(item => item.id === valueId)
    if (!target) return
    mutator(target)
  })
}

function toEmptyPropertyI18n(propertyId: Id): PropertyNew['i18n'] {
  return {
    en: {
      locale: 'en',
      propertyId,
      label: '',
      labelGen: false,
      placeholder: '',
      placeholderGen: false,
    },
    zhHans: {
      locale: 'zh-hans',
      propertyId,
      label: '',
      labelGen: false,
      placeholder: '',
      placeholderGen: false,
    },
    zhHant: {
      locale: 'zh-hant',
      propertyId,
      label: '',
      labelGen: false,
      placeholder: '',
      placeholderGen: false,
    },
  }
}

function toEmptyPropertyValueI18n(valueId: Id): PropertyValue['i18n'] {
  return {
    en: { propertyValueId: valueId, locale: 'en', value: '', valueGen: false },
    zhHans: {
      propertyValueId: valueId,
      locale: 'zh-hans',
      value: '',
      valueGen: false,
    },
    zhHant: {
      propertyValueId: valueId,
      locale: 'zh-hant',
      value: '',
      valueGen: false,
    },
  }
}

function reorderRankedItems<T extends { id: Id; rank: number }>(
  items: T[],
  itemId: Id,
  targetIndex: number,
): T[] | null {
  const sorted = [...items].sort((a, b) => a.rank - b.rank)
  const currentIndex = sorted.findIndex(item => item.id === itemId)
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sorted.length) return null
  if (currentIndex === targetIndex) return null

  const [moved] = sorted.splice(currentIndex, 1)
  sorted.splice(targetIndex, 0, moved)
  return sorted.map((item, index) => ({ ...item, rank: index }))
}

function collectMissingPropertyTranslations(
  property: Property,
  sourceLocale: Locale,
  targetLocale: Locale,
): { texts: string[]; origins: PropertyTranslationOrigin[] } | null {
  const texts: string[] = []
  const origins: PropertyTranslationOrigin[] = []

  const sourceFormLocale = toLocaleKey(sourceLocale)
  const targetFormLocale = toLocaleKey(targetLocale)
  const sourcePropertyI18n = (property.i18n as WritableI18nRecord | undefined)?.[
    sourceFormLocale
  ] as { label?: string; placeholder?: string } | undefined
  const targetPropertyI18n = (property.i18n as WritableI18nRecord | undefined)?.[
    targetFormLocale
  ] as { label?: string; placeholder?: string } | undefined
  if (!sourcePropertyI18n || !targetPropertyI18n) return null

  if (!targetPropertyI18n.label?.trim() && sourcePropertyI18n.label?.trim()) {
    texts.push(sourcePropertyI18n.label)
    origins.push({ type: 'label' })
  }
  if (
    !targetPropertyI18n.placeholder?.trim() &&
    sourcePropertyI18n.placeholder?.trim()
  ) {
    texts.push(sourcePropertyI18n.placeholder)
    origins.push({ type: 'placeholder' })
  }

  for (const value of property.values || []) {
    const sourceValue =
      (
        (value.i18n as WritableI18nRecord | undefined)?.[sourceFormLocale] as
          | { value?: string }
          | undefined
      )?.value?.trim() || ''
    const targetValue =
      (
        (value.i18n as WritableI18nRecord | undefined)?.[targetFormLocale] as
          | { value?: string }
          | undefined
      )?.value?.trim() || ''
    if (targetValue || !sourceValue) continue
    texts.push(sourceValue)
    origins.push({ type: 'value', valueId: value.id })
  }

  return { texts, origins }
}

async function requestPropertyTranslations(
  sourceLocale: Locale,
  targetLocale: Locale,
  texts: string[],
): Promise<string[] | null> {
  const response = await fetch('/api/translation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: sourceLocale,
      target: targetLocale,
      texts,
    }),
  })

  if (!response.ok) return null
  const translatedTexts = (await response.json()) as string[]
  if (!Array.isArray(translatedTexts)) return null
  return translatedTexts
}

function applyPropertyTranslations(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  targetLocale: Locale,
  origins: PropertyTranslationOrigin[],
  translatedTexts: string[],
): void {
  mutatePropertyById(form, propertyId, targetProperty => {
    origins.forEach((origin, index) => {
      const translatedText = translatedTexts[index]
      if (origin.type === 'value') {
        const targetValue = targetProperty.values?.find(
          value => value.id === origin.valueId,
        )
        if (!targetValue?.i18n) return
        const valueLocaleKey = toLocaleKey(targetLocale)
        if (!targetValue.i18n[valueLocaleKey]) return
        targetValue.i18n[valueLocaleKey].value = translatedText
        return
      }

      if (!targetProperty.i18n) return
      const propertyLocaleKey = toLocaleKey(targetLocale)
      if (!targetProperty.i18n[propertyLocaleKey]) return
      ;(targetProperty.i18n[propertyLocaleKey] as Record<string, unknown>)[
        origin.type
      ] = translatedText
    })
  })
}

// ═══════════════════════
// 3.2 PROJECT PROPERTY FORM :: PUBLIC MUTATORS
// ═══════════════════════

// ───────────────────────
// 3.2.1 READ/FILTER HELPERS
// ───────────────────────

export function getPropertiesByType(
  properties: Property[] | null | undefined,
  fieldDiscriminator: PropertyDiscriminator,
): Property[] {
  return (properties || [])
    .filter(property => property.type === fieldDiscriminator)
    .sort((a, b) => a.rank - b.rank)
}

export function getCurrentProjectProperties(
  form: FormDataUpdaterForm<{ properties?: Property[] }>,
): Property[] {
  return (form.fields.value().data?.properties ?? []).map(property => property)
}

export function getProjectPropertyFieldsForIndex(
  form: unknown,
  propertyIndex: number,
): unknown {
  const formFields = (
    form as {
      fields?: { data?: { properties?: unknown[] } }
    }
  )?.fields
  return formFields?.data?.properties?.[propertyIndex]
}

function getIssuePropertyIndex(issue: {
  message: string
  path?: Array<string | number>
}): number | null {
  const path = issue.path
  if (!Array.isArray(path)) return null
  const index = path[2]
  if (typeof index === 'number') return Number.isInteger(index) ? index : null
  if (typeof index === 'string' && /^\d+$/u.test(index)) return Number(index)
  return null
}

export function getPropertyFormIssues(
  issues: unknown[] | null | undefined,
): Array<{ message: string; path?: Array<string | number> }> {
  if (!Array.isArray(issues)) return []
  return issues.filter(issue => {
    if (!issue || typeof issue !== 'object' || !('path' in issue)) return false
    const path = (issue as { path?: unknown }).path
    return Array.isArray(path) && path[0] === 'data' && path[1] === 'properties'
  }) as Array<{ message: string; path?: Array<string | number> }>
}

export function getPropertyIssuesForTypeFromFormIssues(params: {
  issues: Array<{ message: string; path?: Array<string | number> }>
  properties: Property[]
  type: PropertyDiscriminator
}): string[] {
  const messages = params.issues
    .filter(issue => {
      const index = getIssuePropertyIndex(issue)
      if (index == null) {
        return params.properties.some(property => property.type === params.type)
      }
      return false
    })
    .map(issue => issue.message)
    .filter(Boolean)
  return Array.from(new Set(messages))
}

export function getPropertyIssueItemIdsForTypeFromFormIssues(params: {
  issues: Array<{ message: string; path?: Array<string | number> }>
  properties: Property[]
  type: PropertyDiscriminator
}): Id[] {
  const ids = params.issues
    .map(issue => {
      const index = getIssuePropertyIndex(issue)
      if (index == null) return null
      const property = params.properties[index]
      if (!property || property.type !== params.type) return null
      return property.id
    })
    .filter((id): id is Id => Boolean(id))
  return Array.from(new Set(ids))
}

export function stopEvent(event: Event): void {
  event.preventDefault()
  event.stopPropagation()
}

export async function scrollWithMovedProperty(
  propertyId: Id,
  move: () => void,
  afterMove: () => Promise<void>,
): Promise<void> {
  const getScrollContainer = (element: HTMLElement): HTMLElement | Window => {
    let current: HTMLElement | null = element.parentElement
    while (current) {
      const style = getComputedStyle(current)
      const canScrollY =
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        current.scrollHeight > current.clientHeight
      if (canScrollY) return current
      current = current.parentElement
    }
    return window
  }

  const getLayoutTopWithin = (
    element: HTMLElement,
    container: HTMLElement | Window,
  ): number => {
    let top = 0
    let current: HTMLElement | null = element
    while (current) {
      top += current.offsetTop
      const next = current.offsetParent as HTMLElement | null
      if (container !== window && next === container) break
      current = next
    }
    return top
  }

  const propertyElement = document.getElementById(`property-wrapper-${propertyId}`)
  if (!propertyElement) return
  const scrollContainer = getScrollContainer(propertyElement)
  const startTop = getLayoutTopWithin(propertyElement, scrollContainer)

  move()
  await afterMove()

  const movedElement = document.getElementById(`property-wrapper-${propertyId}`)
  if (!movedElement) return
  const endTop = getLayoutTopWithin(movedElement, scrollContainer)

  const delta = endTop - startTop
  if (!delta) return
  if (scrollContainer === window) {
    window.scrollBy({ top: delta, behavior: 'auto' })
    return
  }
  if (scrollContainer instanceof HTMLElement) {
    scrollContainer.scrollTop += delta
  }
}

// ───────────────────────
// 3.2.2 PROPERTY MUTATORS
// ───────────────────────

export function addProjectPropertyForType(
  form: FormDataUpdaterForm<PropertyFormData>,
  fieldDiscriminator: PropertyDiscriminator,
  projectId: string,
  classifierComponents: readonly string[],
  specifierComponents: readonly string[],
): void {
  const id = propertyNanoId(12)
  const component =
    fieldDiscriminator === 'classifier'
      ? classifierComponents[0]
      : specifierComponents[0]

  const newProperty: PropertyNew & { id: Id } = {
    id,
    projectId,
    type: fieldDiscriminator,
    key: id,
    rank: 0,
    component,
    isTranslatable: fieldDiscriminator === 'classifier',
    values: fieldDiscriminator === 'classifier' ? [] : null,
    min: null,
    max: null,
    i18n: toEmptyPropertyI18n(id),
  }

  mutatePropertyFormData(form, currentProperties => {
    currentProperties.unshift(newProperty as Property)
    rerankPropertiesByType(currentProperties, fieldDiscriminator)
  })
}

export function removeProjectPropertyForType(
  form: FormDataUpdaterForm<PropertyFormData>,
  fieldDiscriminator: PropertyDiscriminator,
  propertyId: Id,
): void {
  mutatePropertyFormData(form, currentProperties => {
    const propertyIndex = currentProperties.findIndex(
      property => property.id === propertyId,
    )
    if (propertyIndex >= 0) {
      currentProperties.splice(propertyIndex, 1)
      rerankPropertiesByType(currentProperties, fieldDiscriminator)
    }
  })
}

export function changeProjectPropertyRank(
  form: FormDataUpdaterForm<PropertyFormData>,
  fieldDiscriminator: PropertyDiscriminator,
  propertyIdToMove: Id,
  direction: 'up' | 'down',
): void {
  mutatePropertyFormData(form, allProperties => {
    const relevantProps = allProperties.filter(
      property => property.type === fieldDiscriminator,
    )
    const ordered = [...relevantProps].sort((a, b) => a.rank - b.rank)
    const currentIndex = ordered.findIndex(property => property.id === propertyIdToMove)
    if (currentIndex < 0) return
    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
    const reordered = reorderRankedItems(relevantProps, propertyIdToMove, nextIndex)
    if (!reordered) return

    const rankById = new Map(reordered.map(property => [property.id, property.rank]))
    for (const property of allProperties) {
      if (property.type !== fieldDiscriminator || !rankById.has(property.id)) continue
      property.rank = rankById.get(property.id) as number
    }
  })
}

export function updateProjectPropertyBase(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  key: 'key' | 'component' | 'min' | 'max' | 'isTranslatable',
  value: string | number | null | boolean,
): void {
  mutatePropertyById(form, propertyId, target => {
    ;(target as Record<string, unknown>)[key] = value
  })
}

export function updateProjectPropertyI18n(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  locale: Locale,
  key: 'label' | 'placeholder' | 'labelGen' | 'placeholderGen',
  value: string | boolean,
): void {
  mutatePropertyById(form, propertyId, target => {
    const localeEntry = ensureLocaleEntryForWrite(
      target.i18n as WritableI18nRecord | undefined,
      locale,
    )
    if (!localeEntry) return
    localeEntry[key] = value
  })
}

// ───────────────────────
// 3.2.3 PROPERTY VALUE MUTATORS
// ───────────────────────

export function addProjectPropertyValue(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
): void {
  mutatePropertyById(form, propertyId, target => {
    const values = (target.values || []) as NonNullable<Property['values']>
    const valueId = propertyNanoId(12)
    values.push({
      id: valueId,
      propertyId,
      rank: values.length,
      i18n: toEmptyPropertyValueI18n(valueId),
    })
    target.values = values
  })
}

export function removeProjectPropertyValue(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  valueId: Id,
): void {
  mutatePropertyById(form, propertyId, target => {
    if (!target.values) return
    target.values = target.values
      .filter(value => value.id !== valueId)
      .map((value, index) => ({ ...value, rank: index }))
  })
}

export function reorderProjectPropertyValue(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  valueId: Id,
  targetIndex: number,
): void {
  mutatePropertyById(form, propertyId, target => {
    if (!target.values) return
    const reordered = reorderRankedItems(target.values, valueId, targetIndex)
    if (!reordered) return
    target.values = reordered
  })
}

export function updateProjectPropertyValueI18n(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  valueId: Id,
  locale: Locale,
  key: 'value',
  value: string,
): void {
  mutatePropertyValueById(form, propertyId, valueId, targetValue => {
    const localeEntry = ensureLocaleEntryForWrite(
      targetValue.i18n as WritableI18nRecord | undefined,
      locale,
    )
    if (!localeEntry) return
    localeEntry[key] = value
  })
}

// ───────────────────────
// 3.2.4 LOCALE MUTATORS
// ───────────────────────

export async function translateProjectPropertyLocale(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  sourceLocale: Locale,
  targetLocale: Locale,
): Promise<boolean> {
  const current = form.fields.value().data
  const property = (current?.properties || []).find(item => item.id === propertyId)
  if (!property) return false

  const translationPayload = collectMissingPropertyTranslations(
    property,
    sourceLocale,
    targetLocale,
  )
  if (!translationPayload || translationPayload.texts.length === 0) return false

  const translatedTexts = await requestPropertyTranslations(
    sourceLocale,
    targetLocale,
    translationPayload.texts,
  )
  if (
    !translatedTexts ||
    translatedTexts.length !== translationPayload.origins.length
  ) {
    return false
  }

  applyPropertyTranslations(
    form,
    propertyId,
    targetLocale,
    translationPayload.origins,
    translatedTexts,
  )

  return true
}

export function resetProjectPropertyLocale(
  form: FormDataUpdaterForm<PropertyFormData>,
  propertyId: Id,
  targetLocale: Locale,
): void {
  mutatePropertyById(form, propertyId, targetProperty => {
    const targetFormLocale = toLocaleKey(targetLocale)
    if (!targetProperty.i18n?.[targetFormLocale]) return

    targetProperty.i18n[targetFormLocale].label = ''
    targetProperty.i18n[targetFormLocale].placeholder = ''
    for (const value of targetProperty.values || []) {
      if (!value.i18n?.[targetFormLocale]) continue
      value.i18n[targetFormLocale].value = ''
    }
  })
}

// ═══════════════════════
// 4. DISPLAY
// ═══════════════════════

export function propertyValuesToLocalisedOptions(
  appCtx: AppCtx,
  propertyValues: PropertyValue[],
): Map<Id, string> {
  return new Map(
    propertyValues.map(pv => [
      pv.id,
      getI18n<PropertyValueI18nDB>(
        { i18n: (pv.i18n as Record<Locale, PropertyValueI18nDB>) ?? null },
        'value',
        appCtx.getUserPreferences(),
        m.jumpy_misty_panther_scold(),
      ),
    ]),
  )
}

/**
 * Formats the display text for selected values of a *single* categorical filter property.
 * Displays selected property values in a user-friendly format.
 */
export function displaySelectedProperties(
  selectedPropertyValueIds: Id[], // Array of selected display values (e.g., ["A", "B"])
  localisedOptions: Map<Id, string>, // Available display values from property definition
): string {
  if (!selectedPropertyValueIds || selectedPropertyValueIds.length === 0) {
    return m.filters__all()
  }

  if (selectedPropertyValueIds.length === 1) {
    return localisedOptions.get(selectedPropertyValueIds[0]) || '?'
  } else {
    // Format as "ValueA, ValueB & ValueC"
    const translatedValues = selectedPropertyValueIds.map(
      id => localisedOptions.get(id) || '?',
    )
    return (
      translatedValues.slice(0, -1).join(', ') +
      ' & ' +
      translatedValues[translatedValues.length - 1]
    )
  }
}

/**
 * Summarizes the *active* property filters for a given layer.
 */
export function displaySelectedFilters(
  appCtx: AppCtx,
  layerFilters: Record<Id, string[] | RangeFilterValue> | undefined, // Filters for the specific layer
  properties: Property[] | undefined, // Property definitions for the layer's project
): string {
  if (!layerFilters || !properties || Object.keys(layerFilters).length === 0) {
    return m.filters__none()
  }

  // Create a map for efficient property lookup by ID
  const propertyMap = new Map(properties.map(p => [p.id, p]))

  // Get active filter property IDs and their labels
  const activeFilterLabels: string[] = []

  for (const [propertyId, value] of Object.entries(layerFilters)) {
    let isActive = false

    // Check if filter is active
    if (Array.isArray(value)) {
      // Categorical: active if array is not empty
      isActive = value.length > 0
    } else if (
      typeof value === 'object' &&
      value !== null &&
      'rangeMin' in value &&
      'globalMin' in value
    ) {
      // Range: active if range differs from global min/max
      const rangeValue = value as RangeFilterValue
      isActive =
        rangeValue.rangeMin !== rangeValue.globalMin ||
        rangeValue.rangeMax !== rangeValue.globalMax
    }

    if (isActive) {
      // Look up property by ID (not key!)
      const property = propertyMap.get(propertyId)
      if (property) {
        const label =
          getI18n(property, 'label', appCtx.getUserPreferences()) || property.key
        activeFilterLabels.push(label)
      } else {
        // Fallback if property not found
        activeFilterLabels.push(propertyId)
      }
    }
  }

  if (activeFilterLabels.length === 0) {
    return m.filters__none()
  }

  // Format the summary string based on the count
  if (activeFilterLabels.length === 1) {
    return m.filters__filtering_for({
      properties: `<span class="text-sky-600 font-mono">${activeFilterLabels[0]}</span>`,
    })
  } else {
    // Format as "LabelA, LabelB & LabelC" for more than one
    const formattedLabels = activeFilterLabels.map(
      label => `<span class="text-sky-600 font-mono">${label}</span>`,
    )
    const lastLabel = formattedLabels.pop()
    return m.filters__filtering_for({
      properties: `${formattedLabels.join(', ')} & ${lastLabel}`,
    })
  }
}

export function displayRangeFilter(
  min: number,
  max: number,
  values: [number, number],
): string {
  if (min === values[0] && max === values[1]) {
    return m.filters__all()
  } else if (values[0] === values[1]) {
    return `${m.filters__only()} ${values[0]} ${m.menu_stars()}`
  } else {
    return m.filters__between({
      min: values[0],
      max: values[1],
    })
  }
}

// ═══════════════════════
// 5. FILTERING
// ═══════════════════════

/**
 * Gets feature IDs filtered by property filters.
 * Returns all features if no property filters are active.
 */
export function getFeatureIdsForProperties(appCtx: AppCtx): Id[] {
  // If there are no property filters at all, return all features
  if (Object.keys(appCtx.state.filters.feature.properties ?? {}).length === 0) {
    return Array.from(appCtx.features.keys())
  }

  const featureList = Array.from(appCtx.features.values())

  const filteredIds = featureList
    .filter((feature: Feature | FeatureFromCollection) => {
      // Get filters specific to this feature's layer
      const layerFilters = appCtx.state.filters.feature.properties?.[feature.layerId]

      // If no filters for this layer, feature passes
      if (!layerFilters || Object.keys(layerFilters).length === 0) {
        return true
      }

      // Check if feature matches ALL filters for its layer
      return Object.entries(layerFilters).every(([propertyId, filterValue]) => {
        // Empty categorical filter matches all
        if (Array.isArray(filterValue) && filterValue.length === 0) {
          return true
        }

        // Find the feature's property by property ID
        const featureProperty = feature.properties.find(
          (fp: FeatureProperty) => fp.propertyId === propertyId,
        )

        if (!featureProperty) {
          return false // Feature doesn't have this property
        }

        // Get the property definition to check type and component
        const property = appCtx.cache.property.get(propertyId)
        if (!property) {
          console.error(`Property definition not found for propertyId: ${propertyId}`)
          return true // Property definition not found, so we keep showing it
        }

        // Handle different property types and components
        if (property.type === 'classifier' && property.component === 'SelectField') {
          // Categorical filter: check if feature's PropertyValue ID is in selected IDs
          if (Array.isArray(filterValue)) {
            return featureProperty.propertyValueId
              ? filterValue.includes(featureProperty.propertyValueId)
              : false
          }
          return false
        } else if (
          property.type === 'classifier' &&
          property.component === 'RangeField'
        ) {
          // If the range filter is set in the globalMin/Max range we should not fail any features
          if (
            filterValue.rangeMin === filterValue.globalMin &&
            filterValue.rangeMax === filterValue.globalMax
          ) {
            return true
          }

          // Range filter: check if numeric value is within range
          if (
            typeof filterValue === 'object' &&
            filterValue !== null &&
            'rangeMin' in filterValue &&
            'rangeMax' in filterValue
          ) {
            // If no value available, consider it as not matching the filter
            if (!featureProperty.value) {
              return false
            }

            const numericValue = Number(featureProperty.value)
            return (
              !Number.isNaN(numericValue) &&
              numericValue >= filterValue.rangeMin &&
              numericValue <= filterValue.rangeMax
            )
          }
          return false
        }

        // For other property types/components, return true for now
        return true
      })
    })
    .map(feature => feature.id)

  return filteredIds
}

// ═══════════════════════
// 6. FEATURE PROPERTY :: GETTERS
// ═══════════════════════

/**
 * Gets properties for a display FeatureCard.
 *
 * @param appCtx - The application context.
 * @param layerId - The ID of the layer to get the properties for.
 * @param feature - The feature to get the properties for.
 * @returns The properties for the feature.
 */
export function getFeatureCardDisplayProperties(
  appCtx: AppCtx,
  layerId: Id,
  feature: Feature,
): Omit<FeatureProperty, 'featureId'>[] {
  if (!layerId) {
    return []
  }
  // ASSERT : Layer exists
  const layer = appCtx.state.resources.layer.find(l => l.id === layerId)
  if (!layer) {
    console.warn(`Layer ${layerId} not found`)
    return []
  }

  // Get all visible properties for the layer (not just user contributable ones)
  const layerProperties =
    layer.properties
      ?.filter(layerProp => {
        const property = appCtx.cache.property.get(layerProp.propertyId)
        return (
          property &&
          (property.type === 'classifier' || property.type === 'specifier') &&
          layerProp.isVisible === true &&
          property.key !== 'grade'
        )
      })
      .map(layerProp => {
        const property = appCtx.cache.property.get(layerProp.propertyId)
        return {
          property,
          propertyId: layerProp.propertyId,
        }
      })
      .filter(
        (item): item is { property: Property; propertyId: Id } =>
          item.property !== undefined,
      ) || []

  // Map layer properties to feature properties, including the property definition
  return sortFeatureProperties(
    layerProperties
      .map(item => {
        const featureProperty = feature.properties.find(
          prop => prop.propertyId === item.propertyId,
        )
        if (featureProperty) {
          return {
            ...featureProperty,
            property: item.property,
          }
        }
        return null
      })
      .filter(
        (item): item is FeatureProperty & { property: Property } => item !== null,
      ),
  )
}

/**
 * Gets properties for an editable FeatureCard.
 *
 * @remark While properties are defined at the project level, at the
 * layer level (layerProperty) we define where they
 * are to be included for that particular layer (isVisible) and whether
 * they are editable by the public - i.e. whether they can be set as part
 * of a newFeature flow.
 */
export function getFeatureCardEditableProperties(
  appCtx: AppCtx,
  layerId: Id,
  isGradeProperty: boolean = false,
): Omit<FeatureProperty, 'featureId'>[] {
  if (!layerId) {
    return []
  }
  // ASSERT : Layer exists
  const layer = appCtx.cache.layer.get(layerId)
  if (!layer) {
    console.warn(`Layer ${layerId} not found`)
    return []
  }

  // Get categorical and specifier properties that are user contributable
  const layerProperties =
    layer.properties
      ?.filter(layerProp => {
        const property = appCtx.cache.property.get(layerProp.propertyId)
        return (
          property &&
          (property.type === 'classifier' || property.type === 'specifier') &&
          layerProp.isVisible === true &&
          layerProp.isUserContributable === true &&
          (isGradeProperty ? property.key === 'grade' : property.key !== 'grade')
        )
      })
      .map(layerProp => {
        const property = appCtx.cache.property.get(layerProp.propertyId)
        return {
          property,
          propertyId: layerProp.propertyId,
        }
      })
      .filter(
        (item): item is { property: Property; propertyId: Id } =>
          item.property !== undefined,
      ) || []

  return sortFeatureProperties(layerProperties)
}

/**
 * Gets property values for a categorical property from the cache.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns A map of property value IDs to their localised values.
 */
export function getLocalisedPropertyValues(
  appCtx: AppCtx,
  propertyId: Id,
): Map<Id, string> {
  const property = appCtx.cache.property.get(propertyId)
  if (!property?.values) return new Map<Id, string>()
  return propertyValuesToLocalisedOptions(appCtx, property.values)
}

/**
 * Gets a feature property by property ID from the new feature context.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @param featureId - Optional feature ID to get the property for.
 * If not provided, the property will be searched for in the new feature context.
 */
export function getFeatureProperty(
  appCtx: AppCtx,
  propertyId: Id,
  featureId?: Id | null,
): FeatureProperty | null {
  if (!featureId) {
    // ASSERT : newFeature exists
    if (!appCtx.newFeature?.feature?.properties) return null
    return appCtx.newFeature.feature.properties.find(
      p => p && p.propertyId === propertyId,
    ) as FeatureProperty | null
  } else {
    return appCtx.features
      .get(featureId)
      ?.properties.find(p => p && p.propertyId === propertyId) as FeatureProperty | null
  }
}

/**
 * Gets the universal specifier value for a property.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns The universal specifier value for the property.
 */
export function getUniversalSpecifierValue(
  appCtx: AppCtx,
  propertyId: Id,
): string | undefined | null {
  const featureProperty = getFeatureProperty(appCtx, propertyId)
  if (!featureProperty) return null
  return featureProperty.value
}

/**
 * Gets the i18n specifier value for a property in the current locale.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns The i18n specifier value for the property.
 */
export function getI18nSpecifierValue(
  appCtx: AppCtx,
  propertyId: Id,
): string | undefined {
  const featureProperty = getFeatureProperty(appCtx, propertyId)
  if (!featureProperty) return undefined
  const result = getI18n<FeaturePropertyI18nDB>(
    {
      i18n:
        (featureProperty.i18n as Record<Locale, FeaturePropertyI18nDB> | undefined) ??
        null,
    },
    'value',
    appCtx.getUserPreferences(),
  )
  return result ?? undefined
}

/**
 * Gets the classifier value ID for a property.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to get the values for.
 * @returns The classifier value ID for the property.
 */
export function getClassifierValueId(
  appCtx: AppCtx,
  propertyId: Id,
): string | undefined {
  const featureProperty = getFeatureProperty(appCtx, propertyId)
  const valueId = featureProperty?.propertyValueId
  return valueId && valueId !== null ? valueId : undefined
}

// ═══════════════════════
// 6. FEATURE PROPERTY :: SETTERS
// ═══════════════════════

/**
 * Updates a feature property in the new feature context.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param updates - The updates to apply to the property.
 */
export function updateFeatureProperty(
  appCtx: AppCtx,
  propertyId: Id,
  updates: Partial<FeatureProperty>,
): void {
  const existingProperty = getFeatureProperty(appCtx, propertyId)

  if (existingProperty) {
    // Update existing property
    Object.assign(existingProperty, updates)
  } else {
    // Create new property
    updateNewFeatureProperty(appCtx, propertyId, updates)
  }
}

/**
 * Updates a feature property's i18n value.
 *
 * @remark This function is used to provide a way to update the i18n value of a property.
 * By default we assume that the user is making a contribution in their own locale.
 * @todo Add UI support for providing values in other locales (i.e. allow users-translatable)
 * values.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param locale - The locale to update the property for.
 * @param value - The value to update the property to.
 * @param valueGen - Whether the value is generated.
 */
export function updateFeatureI18nProperty(
  appCtx: AppCtx,
  propertyId: Id,
  locale: Locale,
  value: string,
  valueGen: boolean = false,
): void {
  const existingProperty = getFeatureProperty(appCtx, propertyId)

  if (existingProperty) {
    // Update existing property's i18n
    if (!existingProperty.i18n) {
      existingProperty.i18n = {}
    }
    existingProperty.i18n[locale] = { locale, value, valueGen }
  } else {
    // Create new property with i18n
    updateNewFeatureProperty(appCtx, propertyId, {
      value: '',
      i18n: { [locale]: { locale, value, valueGen } },
    })
  }
}

/**
 * Updates a property in the new feature context
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param object - The object to update the property with.
 */
export function updateNewFeatureProperty(
  appCtx: AppCtx,
  propertyId: Id,
  object: Partial<FeatureProperty>,
): void {
  if (!appCtx.newFeature?.feature) {
    return
  }

  // Initialize properties array if it doesn't exist
  if (!appCtx.newFeature.feature.properties) {
    appCtx.newFeature.feature.properties = []
  }

  const currentProperties = appCtx.newFeature.feature.properties
  const propIndex = currentProperties.findIndex(p => p.propertyId === propertyId)

  let updatedProperties: UserContributedFeatureProperty[]

  if (propIndex >= 0) {
    // Update existing property
    updatedProperties = [...currentProperties]
    const current = updatedProperties[propIndex]
    if (!current) return
    updatedProperties[propIndex] = {
      ...current,
      ...object,
    }
  } else {
    // Create new property
    const fallbackProperty = appCtx.cache.property.get(propertyId)
    const resolvedProperty =
      (object as { property?: Property }).property ?? fallbackProperty
    if (!resolvedProperty) return

    const newProperty: UserContributedFeatureProperty = {
      property: resolvedProperty,
      propertyId,
      value: '',
      ...object,
    }

    // Only add i18n if it's provided in the object
    if (object.i18n) {
      newProperty.i18n = object.i18n
    }

    updatedProperties = [...appCtx.newFeature.feature.properties, newProperty]
  }

  // Create a new newFeature object to ensure reactivity
  appCtx.newFeature = {
    ...appCtx.newFeature,
    feature: {
      ...appCtx.newFeature.feature,
      properties: updatedProperties,
    },
  }
}

/**
 * Updates a feature property's i18n value in the new feature context
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param object - The object to update the property with.
 * @param locale - The locale to update the property for.
 */
export function updateNewFeatureI18nProperty(
  appCtx: AppCtx,
  propertyId: Id,
  object: Partial<FeaturePropertyI18nDB>,
  locale: Locale,
): void {
  const properties = appCtx.newFeature?.feature?.properties
  if (!properties) return

  const propIndex = properties.findIndex(p => p.propertyId === propertyId)
  if (propIndex < 0) return

  const targetProperty = properties[propIndex]
  if (!targetProperty) return
  targetProperty.i18n ??= {}

  const currentLocaleEntry = targetProperty.i18n[locale] ?? {
    locale,
    value: '',
    valueGen: false,
  }

  targetProperty.i18n[locale] = {
    ...currentLocaleEntry,
    ...(object as Partial<typeof currentLocaleEntry>),
    locale,
  }
}

/**
 * Handles categorical property change for new features.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param propertyValueId - The ID of the property value to update.
 */
export function handleCategoricalChange(
  appCtx: AppCtx,
  propertyId: Id,
  propertyValueId: Id,
): void {
  updateFeatureProperty(appCtx, propertyId, {
    propertyValueId: propertyValueId,
  })
}

/**
 * Handles specifier property change for new features.
 *
 * @param appCtx - The application context.
 * @param propertyId - The ID of the property to update.
 * @param locale - The locale to update the property for.
 * @param newValue - The new value to update the property to.
 */
export function handleSpecifierChange(
  appCtx: AppCtx,
  propertyId: Id,
  locale: LocaleExtended,
  newValue: string,
): void {
  const property = appCtx.cache.property.get(propertyId)

  if (property?.isTranslatable && locale !== 'core') {
    // Translatable property - use i18n structure
    updateFeatureI18nProperty(appCtx, propertyId, locale as Locale, newValue)
  } else {
    // Non-translatable property - just set value
    updateFeatureProperty(appCtx, propertyId, {
      value: newValue,
    })
  }
}
