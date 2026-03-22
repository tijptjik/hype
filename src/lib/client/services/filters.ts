// GUARDS
import { isFeature } from '$lib/types'
//I18N
import { getLocaleKey, m, supportedLocaleKeys, toLocaleCode } from '$lib/i18n'
// ENUMS
import { localeCodes } from '$lib/enums'
import type { FirstClassResource } from '$lib/enums'
// CONTEXT
import type { AdminCtx } from '../../context/admin.svelte'
// SERVICES
import { sortProperties } from '$lib/client/services/property'
// TYPES
import type {
  FilterTriState,
  FeatureTranslationFilterKey,
  FeatureViewFilters,
  PropertyFilterType,
  ResourceControlBarConfig,
  ResourceFilterConfigBase,
  ResourceFilterEntryConfig,
  ResourcePropertyFilterSectionConfig,
  ResourceFilterSection,
  ResourceSortConfig,
  ResourceSortItemConfig,
  ViewFilterResource,
  ViewFilters,
  LocaleKey,
  Id,
} from '$lib/types'
import type { ResourceControlBarLocaleToggleItem } from '$lib/bits/patterns/resource/resourceControlBar/components'
import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
import type { Hub } from '$lib/db/zod/schema/hub.types'
import type { Layer } from '$lib/db/zod/schema/layer.types'
import type { Organisation } from '$lib/db/zod/schema/organisation.types'
import type { Property } from '$lib/db/zod/schema/property.types'
import type { Project } from '$lib/db/zod/schema/project.types'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. I18N
// - getCurrentPropertyLabel
// - getNormalizedResourceTranslationLocales
// - getResourceActiveLocales
// - getResourceLocaleToggleItems
//
// 2. HANDLERS
// - getNextTriState
// - toggleResourceTranslationLocale
// - toggleResourceFilterState
//
// 3. FILTER DEFINITIONS
// - createToggleFilter
// - createTranslationFilter
// - createPropertyFilterSection
// - createSortable
// - createSortables
//
// 4. RESOURCE FILTER LOOKUPS
// - getResourceFilters
// - supportsTranslationLocales
// - isPropertyFilterSection
// - isStandardFilterSection
// - isTranslationFilterConfig
// - getPropertyFilters
// - getSortedPropertiesByType
// - isResourceFilterAtDefault
//
// 5. FILTER BAR RENDER MODELS
// - getFilterRenderItems
// - createResourceFilterRenderItem
// - getFilterSectionCount
//
// 6. FILTER STATE
// - getResourceFilterState
// - setResourceFilterState
// - getGenericTranslationFilterState
// - setGenericTranslationFilterState
//
// 7. FILTER STATE (FEATURE)
// - getFilterState
// - getSimpleFilterState
// - setFilterState
// - setSimpleFilterState
// - toggleFilterState
//
// 8. FILTER STATE (SPECIAL)
// - getTranslationFilterState
// - setTranslationFilterState
// - setPropertyFilterState
// - getFeatureTaskLabel
// ---

type FilterRenderItem = ResourceFilterConfigBase & {
  id: string
  type?: 'toggle' | 'translation'
  currentValue: FilterTriState
  onToggleFalse: () => void
  onToggleTrue: () => void
  onToggleChange: (_event?: Event) => void
}

type TranslationFilterShape = {
  translationLocales: Record<LocaleKey, boolean>
}

const resourceFilterDefaults: Partial<
  Record<ViewFilterResource, Record<string, unknown>>
> = {
  organisation: {
    isArchived: false,
  },
  project: {
    isArchived: false,
  },
  layer: {
    isArchived: false,
  },
  feature: {
    isArchived: false,
  },
  hub: {
    isArchived: false,
  },
}

/**
 * Matches free-text admin search input against core resource identifiers and localized text.
 * @param entity Resource to test.
 * @param query User-entered text query.
 * @param localeKey Active locale used to resolve localized fields.
 * @returns `true` when any candidate string contains the normalized query.
 */
export function matchesResourceTextQuery(
  entity: Organisation | Project | Layer | Feature | Hub | FeatureFromCollection,
  query: string,
  localeKey: LocaleKey,
): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery === '') return true

  const textObject = entity.i18n?.[localeKey] ?? entity.i18n?.en ?? null
  const contributor = isFeature(entity) ? entity.contributor?.name : ''
  const candidates = [
    'code' in entity ? entity.code : '',
    'id' in entity ? entity.id : '',
    textObject?.name,
    textObject?.title,
    textObject?.nameShort,
    textObject?.description,
    textObject?.displayAddress,
    contributor,
  ]

  return candidates.some(
    value => typeof value === 'string' && value.toLowerCase().includes(normalizedQuery),
  )
}

// ---
/********************
 *  1. I18N
 ************/
// +++ I18n

/**
 * Resolves the display label for a property using the current locale key.
 * @param property Property definition to label.
 * @returns The localized property label, or the property id when unavailable.
 */
function getCurrentPropertyLabel(property: Property): string {
  return property.i18n?.[getLocaleKey()]?.label ?? property.id
}

/**
 * Normalizes translation-locale filter selection for a resource.
 * Keeps the current locale disabled and ensures at least one non-current locale stays active.
 * @param adminCtx Admin context containing current resource filter state.
 * @param resource Resource whose translation-locale filter state should be normalized.
 * @returns The normalized translation-locale map, or `null` when unsupported.
 */
function getNormalizedResourceTranslationLocales<T extends ViewFilterResource>(
  adminCtx: AdminCtx,
  resource: T,
): TranslationFilterShape['translationLocales'] | null {
  const resourceFilters = getResourceFilters(adminCtx, resource)
  if (!resourceFilters || !supportsTranslationLocales(resourceFilters)) {
    return null
  }

  const currentLocaleKey = getLocaleKey()
  const normalizedLocales = { ...resourceFilters.translationLocales }
  let hasActiveNonCurrentLocale = false

  for (const localeKey of supportedLocaleKeys) {
    if (localeKey === currentLocaleKey) {
      normalizedLocales[localeKey] = false
      continue
    }

    if (normalizedLocales[localeKey]) {
      hasActiveNonCurrentLocale = true
    }
  }

  if (!hasActiveNonCurrentLocale) {
    for (const localeKey of supportedLocaleKeys) {
      normalizedLocales[localeKey] = localeKey !== currentLocaleKey
    }
  }

  return normalizedLocales
}

/**
 * Resolves the active translation locales for a resource, excluding the current locale.
 * @param adminCtx Admin context containing current filter state.
 * @param resource Resource whose active translation locales should be read.
 * @returns The set of active translation locales.
 */
export function getResourceActiveLocales<T extends ViewFilterResource>(
  adminCtx: AdminCtx,
  resource: T,
): Set<LocaleKey> {
  const locales = new Set<LocaleKey>()
  const translationLocales = getNormalizedResourceTranslationLocales(adminCtx, resource)
  if (!translationLocales) {
    return locales
  }

  for (const [locale, isActive] of Object.entries(translationLocales)) {
    if (isActive) {
      locales.add(locale as LocaleKey)
    }
  }

  return locales
}

/**
 * Builds locale toggle item models for the resource filter bar.
 * @param adminCtx Admin context containing current filter state.
 * @param resource Resource whose locale toggles should be exposed.
 * @returns Locale toggle items for the filter bar UI.
 */
export function getResourceLocaleToggleItems<T extends ViewFilterResource>(
  adminCtx: AdminCtx,
  resource: T,
): ResourceControlBarLocaleToggleItem[] {
  const translationLocales = getNormalizedResourceTranslationLocales(adminCtx, resource)
  if (!translationLocales) {
    return []
  }

  return supportedLocaleKeys.map(localeKey => ({
    value: localeKey,
    label: localeCodes[toLocaleCode(localeKey)],
    selected: translationLocales[localeKey],
    onToggle: () => toggleResourceTranslationLocale(adminCtx, resource, localeKey),
  }))
}

// ---
/********************
 *  2. HANDLERS
 ************/
// +++ Handlers

/**
 * Advances a tri-state filter value through `null -> true -> false -> null`.
 * @param currentValue Current tri-state filter value.
 * @returns The next tri-state value.
 */
export function getNextTriState(currentValue: FilterTriState): FilterTriState {
  return currentValue === null ? true : currentValue === true ? false : null
}

/**
 * Toggles a resource translation locale while preserving a valid non-current selection.
 * @param adminCtx Admin context containing mutable filter state.
 * @param resource Resource whose translation locales should be updated.
 * @param locale Locale to toggle.
 * @returns Nothing.
 */
export function toggleResourceTranslationLocale<T extends ViewFilterResource>(
  adminCtx: AdminCtx,
  resource: T,
  locale: LocaleKey,
): void {
  const resourceFilters = getResourceFilters(adminCtx, resource)
  if (!resourceFilters || !supportsTranslationLocales(resourceFilters)) {
    return
  }

  const currentLocaleKey = getLocaleKey()
  if (locale === currentLocaleKey) {
    return
  }

  const normalizedLocales = getNormalizedResourceTranslationLocales(adminCtx, resource)
  if (!normalizedLocales) {
    return
  }

  normalizedLocales[locale] = !normalizedLocales[locale]

  const hasActiveNonCurrentLocale = supportedLocaleKeys.some(
    supportedLocale =>
      supportedLocale !== currentLocaleKey && normalizedLocales[supportedLocale],
  )

  if (!hasActiveNonCurrentLocale) {
    normalizedLocales[locale] = true
  }

  const nextTranslationLocales = { ...resourceFilters.translationLocales }
  for (const supportedLocale of supportedLocaleKeys) {
    nextTranslationLocales[supportedLocale] =
      supportedLocale === currentLocaleKey ? false : normalizedLocales[supportedLocale]
  }

  adminCtx.appCtx.state.viewFilters[resource] = {
    ...resourceFilters,
    translationLocales: nextTranslationLocales,
  } as ViewFilters[T]
}

/**
 * Toggles a resource filter value against its current state.
 * @param adminCtx Admin context containing mutable view filter state.
 * @param resource Resource whose filter state should be updated.
 * @param filterKey Filter key within the resource state.
 * @param value Requested toggle target value.
 * @param activeLocales Optional active locales for translation writes.
 * @returns Nothing.
 */
export function toggleResourceFilterState<
  T extends keyof ViewFilters,
  K extends keyof ViewFilters[T],
>(
  adminCtx: AdminCtx,
  resource: T,
  filterKey: K,
  value: FilterTriState,
  activeLocales?: Set<LocaleKey>,
) {
  const currentState = getResourceFilterState(
    adminCtx,
    resource,
    filterKey,
    activeLocales,
  )
  const newValue = value === currentState ? null : value
  setResourceFilterState(adminCtx, resource, filterKey, newValue, activeLocales)
}

// ---
/********************
 *  3. FILTER DEFINITIONS
 ************/
// +++ Filter Definitions

/**
 * Creates a standard toggle filter definition.
 * @param key Filter state key.
 * @param config Display and refresh behavior for the filter.
 * @returns A normalized toggle filter config entry.
 */
export function createToggleFilter<K extends string>(
  key: K,
  config: Omit<ResourceFilterConfigBase, 'refreshResource'> & {
    refreshResource?: FirstClassResource
  },
): ResourceFilterEntryConfig & { key: K } {
  return {
    type: 'toggle',
    key,
    ...config,
  }
}

/**
 * Creates a translation-aware filter definition.
 * @param key Filter state key.
 * @param config Display and refresh behavior for the filter.
 * @returns A normalized translation filter config entry.
 */
export function createTranslationFilter<K extends string>(
  key: K,
  config: Omit<ResourceFilterConfigBase, 'refreshResource'> & {
    refreshResource?: FirstClassResource
  },
): ResourceFilterEntryConfig & { key: K } {
  return {
    type: 'translation',
    key,
    ...config,
  }
}

/**
 * Returns a property filter section config unchanged.
 * @param config Property section config to expose.
 * @returns The provided property section config.
 */
export function createPropertyFilterSection(
  config: ResourcePropertyFilterSectionConfig,
): ResourcePropertyFilterSectionConfig {
  return config
}

/**
 * Creates a single sortable item definition.
 * @param value Sort key value.
 * @param label UI label for the sort item.
 * @returns A sortable item config.
 */
export function createSortable(value: string, label: string): ResourceSortItemConfig {
  return { value, label }
}

/**
 * Wraps sortable items into a sort config object.
 * @param items Sort items to expose in the UI.
 * @returns A sort config containing the provided items.
 */
export function createSortables(items: ResourceSortItemConfig[]): ResourceSortConfig {
  return { items }
}

// ---
/********************
 *  4. RESOURCE FILTER LOOKUPS
 ************/
// +++ Resource Filter Lookups

/**
 * Reads the typed filter-state bucket for a resource.
 * @param adminCtx Admin context containing current view filters.
 * @param resource Resource whose filter state should be read.
 * @returns The resource filter state, or `null` when unavailable.
 */
function getResourceFilters<T extends ViewFilterResource>(
  adminCtx: AdminCtx,
  resource: T,
): ViewFilters[T] | null {
  const resourceFilters = adminCtx.appCtx.state?.viewFilters?.[resource]
  if (!resourceFilters || typeof resourceFilters !== 'object') return null
  return resourceFilters
}

/**
 * Narrows resource filter state to variants that include translation locale controls.
 * @param resourceFilters Resource filter-state candidate.
 * @returns Whether the filter state exposes `translationLocales`.
 */
function supportsTranslationLocales(
  resourceFilters: ViewFilters[ViewFilterResource],
): resourceFilters is ViewFilters[ViewFilterResource] & TranslationFilterShape {
  return 'translationLocales' in resourceFilters
}

/**
 * Narrows a filter-bar section to a property-backed section definition.
 * @param section Filter section candidate.
 * @returns Whether the section is a property section.
 */
function isPropertyFilterSection(
  section: ResourceFilterSection,
): section is ResourcePropertyFilterSectionConfig {
  return 'type' in section && section.type === 'property'
}

/**
 * Narrows a filter-bar section to a standard section with explicit filter entries.
 * @param section Filter section candidate.
 * @returns Whether the section exposes a `filters` array.
 */
function isStandardFilterSection(
  section: ResourceFilterSection,
): section is Extract<ResourceFilterSection, { filters: ResourceFilterEntryConfig[] }> {
  return 'filters' in section
}

/**
 * Narrows a filter config entry to a translation-aware config.
 * @param filterConfig Filter config candidate.
 * @returns Whether the filter config is translation-based.
 */
function isTranslationFilterConfig(
  filterConfig: ResourceFilterEntryConfig,
): filterConfig is ResourceFilterEntryConfig & { type: 'translation' } {
  return filterConfig.type === 'translation'
}

/**
 * Reads the nested feature property-filter map.
 * @param adminCtx Admin context containing current feature filter state.
 * @returns The feature property-filter map, or `null` when unavailable.
 */
function getPropertyFilters(
  adminCtx: AdminCtx,
): FeatureViewFilters['properties'] | null {
  const propertyFilters = adminCtx.appCtx.state?.viewFilters?.feature?.properties
  if (!propertyFilters || typeof propertyFilters !== 'object') return null
  return propertyFilters
}

/**
 * Collects cached properties of a given type in stable sorted order.
 * @param adminCtx Admin context providing property cache access.
 * @param propertyType Property type to collect.
 * @returns Sorted properties of the requested type.
 */
function getSortedPropertiesByType(
  adminCtx: AdminCtx,
  propertyType: PropertyFilterType,
): Property[] {
  return sortProperties(
    [...adminCtx.appCtx.cache.property.values()]
      .filter((property: Property) => property.type === propertyType)
      .map(property => ({ property })),
  ).map(item => item.property)
}

/**
 * Checks whether a resource filter currently matches its configured default value.
 * @param resource Resource whose defaults should be consulted.
 * @param filterKey Filter key to compare.
 * @param value Current filter value.
 * @returns Whether the value matches the configured default.
 */
function isResourceFilterAtDefault<T extends ViewFilterResource>(
  resource: T,
  filterKey: string,
  value: unknown,
): boolean {
  const defaultValue = resourceFilterDefaults[resource]?.[filterKey]
  return defaultValue === value
}

/**
 * Creates a render-ready item model for a standard resource filter config entry.
 * @param adminCtx Admin context containing filter state and refresh actions.
 * @param resource Resource whose filter is being rendered.
 * @param filterConfig Filter config entry to materialize.
 * @param activeLocales Optional active locales for translation filters.
 * @returns A render-ready filter item with state and toggle handlers.
 */
function createResourceFilterRenderItem<T extends ViewFilterResource>(
  adminCtx: AdminCtx,
  resource: T,
  filterConfig: ResourceFilterEntryConfig,
  activeLocales?: Set<LocaleKey>,
): FilterRenderItem {
  const currentValue = isTranslationFilterConfig(filterConfig)
    ? getResourceFilterState(adminCtx, resource, filterConfig.key, activeLocales)
    : getResourceFilterState(adminCtx, resource, filterConfig.key)

  return {
    ...filterConfig,
    id: filterConfig.key,
    currentValue,
    onToggleFalse: () => {
      toggleResourceFilterState(
        adminCtx,
        resource,
        filterConfig.key,
        false,
        activeLocales,
      )

      if (filterConfig.refreshResource) {
        adminCtx.appCtx.refresh(filterConfig.refreshResource)
      }
    },
    onToggleTrue: () => {
      toggleResourceFilterState(
        adminCtx,
        resource,
        filterConfig.key,
        true,
        activeLocales,
      )

      if (filterConfig.refreshResource) {
        adminCtx.appCtx.refresh(filterConfig.refreshResource)
      }
    },
    onToggleChange: () => {
      const nextState = getNextTriState(currentValue)
      setResourceFilterState(
        adminCtx,
        resource,
        filterConfig.key,
        nextState,
        activeLocales,
      )

      if (filterConfig.refreshResource) {
        adminCtx.appCtx.refresh(filterConfig.refreshResource)
      }
    },
  }
}

// ---
/********************
 *  5. FILTER BAR RENDER MODELS
 ************/
// +++ Filter Bar Render Models

/**
 * Resolves render-ready filter items for a filter bar section.
 * @param adminCtx Admin context containing filter state and caches.
 * @param filtersConfig Filter bar configuration for the current resource.
 * @param section Filter section to materialize.
 * @param isSuperAdmin Whether super-admin-only filters should be included.
 * @returns Render items for the provided section.
 */
export function getFilterRenderItems(
  adminCtx: AdminCtx,
  filtersConfig: ResourceControlBarConfig,
  section: ResourceFilterSection,
  isSuperAdmin: boolean,
): FilterRenderItem[] {
  if (isPropertyFilterSection(section)) {
    if (section.superAdminOnly && !isSuperAdmin) {
      return []
    }

    const propertyFilters = getPropertyFilters(adminCtx)
    return getSortedPropertiesByType(adminCtx, section.propertyType).map(property => {
      const currentValue = propertyFilters?.[property.id] ?? null
      return {
        id: property.id,
        label: getCurrentPropertyLabel(property),
        falseLabel: section.falseLabel ?? m.filters__no(),
        trueLabel: section.trueLabel ?? m.filters__has(),
        transformOffset: section.transformOffset,
        currentValue,
        onToggleFalse: () => {
          toggleFilterState(adminCtx, 'properties', false, property.id, undefined)

          if (section.refreshResource) {
            adminCtx.appCtx.refresh(section.refreshResource)
          }
        },
        onToggleTrue: () => {
          toggleFilterState(adminCtx, 'properties', true, property.id, undefined)

          if (section.refreshResource) {
            adminCtx.appCtx.refresh(section.refreshResource)
          }
        },
        onToggleChange: () => {
          setFilterState(
            adminCtx,
            'properties',
            getNextTriState(currentValue),
            property.id,
            undefined,
          )

          if (section.refreshResource) {
            adminCtx.appCtx.refresh(section.refreshResource)
          }
        },
      }
    })
  }

  if (!isStandardFilterSection(section)) {
    return []
  }

  const activeLocales = section.filters.some(filter => filter.type === 'translation')
    ? getResourceActiveLocales(adminCtx, filtersConfig.resource)
    : undefined

  return section.filters
    .filter(filter => !filter.superAdminOnly || isSuperAdmin)
    .map(filter =>
      createResourceFilterRenderItem(
        adminCtx,
        filtersConfig.resource,
        filter,
        activeLocales,
      ),
    )
}

/**
 * Counts the active filters in a filter bar section.
 * @param adminCtx Admin context containing current filter state.
 * @param filtersConfig Filter bar configuration for the current resource.
 * @param section Filter section to inspect.
 * @param isSuperAdmin Whether super-admin-only filters should be counted.
 * @returns The number of active filters in the section.
 */
export function getFilterSectionCount(
  adminCtx: AdminCtx,
  filtersConfig: ResourceControlBarConfig,
  section: ResourceFilterSection,
  isSuperAdmin: boolean,
): number {
  if (isPropertyFilterSection(section)) {
    if (section.superAdminOnly && !isSuperAdmin) {
      return 0
    }

    const propertyFilters = getPropertyFilters(adminCtx)
    if (!propertyFilters) {
      return 0
    }

    return getSortedPropertiesByType(adminCtx, section.propertyType).filter(
      property => {
        const value = propertyFilters[property.id]
        return value !== null && value !== undefined
      },
    ).length
  }

  if (!isStandardFilterSection(section)) {
    return 0
  }

  const resourceFilters = getResourceFilters(adminCtx, filtersConfig.resource)
  if (!resourceFilters) {
    return 0
  }

  const resourceFilterRecord = resourceFilters as Record<string, unknown>

  return section.filters.reduce((count, filter) => {
    if (filter.superAdminOnly && !isSuperAdmin) {
      return count
    }

    if (filter.type === 'translation') {
      const filterValue = resourceFilterRecord[filter.key]
      if (!filterValue || typeof filterValue !== 'object') {
        return count
      }

      return count + Object.values(filterValue).filter(value => value !== null).length
    }

    const value = resourceFilterRecord[filter.key]
    if (
      value !== null &&
      !isResourceFilterAtDefault(filtersConfig.resource, filter.key, value)
    ) {
      return count + 1
    }

    return count
  }, 0)
}

// ---
/********************
 *  6. FILTER STATE
 ************/
// +++ Filter State

/**
 * Reads a resource filter state value, aggregating translation filters when needed.
 * @param adminCtx Admin context containing current view filter state.
 * @param resource Resource whose filter state should be read.
 * @param filterKey Filter key within the resource state.
 * @param activeLocales Optional active locales for translation aggregation.
 * @returns The resolved tri-state filter value.
 */
export function getResourceFilterState<
  T extends keyof ViewFilters,
  K extends keyof ViewFilters[T],
>(
  adminCtx: AdminCtx,
  resource: T,
  filterKey: K,
  activeLocales?: Set<LocaleKey>,
): FilterTriState {
  const resourceFilters = adminCtx.appCtx.state?.viewFilters?.[resource]
  if (!resourceFilters || typeof resourceFilters !== 'object') return null

  // Handle translation filters
  if (
    typeof filterKey === 'string' &&
    filterKey.endsWith('Translated') &&
    activeLocales
  ) {
    return getGenericTranslationFilterState(
      adminCtx,
      resource,
      filterKey as string,
      activeLocales,
    )
  }

  // Handle simple filters
  const sectionFilters = resourceFilters[filterKey]
  if (sectionFilters === undefined || sectionFilters === null) return null
  return sectionFilters as FilterTriState
}

/**
 * Reads a translation filter value across the currently active locales for a resource.
 * @param adminCtx Admin context containing current view filter state.
 * @param resource Resource whose translation filter should be read.
 * @param filterKey Translation filter key.
 * @param activeLocales Locales that participate in the aggregated read.
 * @returns The aggregated tri-state translation value.
 */
export function getGenericTranslationFilterState<T extends keyof ViewFilters>(
  adminCtx: AdminCtx,
  resource: T,
  filterKey: string,
  activeLocales: Set<LocaleKey>,
): FilterTriState {
  const resourceFilters = adminCtx.appCtx.state?.viewFilters?.[resource]
  if (!resourceFilters || typeof resourceFilters !== 'object') return null

  const sectionFilters = (resourceFilters)[filterKey]
  if (!sectionFilters || typeof sectionFilters !== 'object') {
    return null
  }

  // Check values for active locales only
  const activeValues: FilterTriState[] = []
  for (const locale of activeLocales) {
    if (locale in sectionFilters) {
      activeValues.push((sectionFilters)[locale])
    } else {
      activeValues.push(null)
    }
  }

  // If no active locales or all null, return null
  if (activeValues.length === 0 || activeValues.every(v => v === null)) {
    return null
  }

  // Check if all active values are the same
  const firstNonNull = activeValues.find(v => v !== null)
  if (firstNonNull !== undefined) {
    const allSame = activeValues.every(v => v === null || v === firstNonNull)
    if (allSame) {
      return firstNonNull
    }
  }

  // Recover from inconsistent read state without mutating during render.
  return true
}

/**
 * Writes a resource filter state value, including locale fan-out for translation filters.
 * @param adminCtx Admin context containing mutable view filter state.
 * @param resource Resource whose filter state should be updated.
 * @param filterKey Filter key within the resource state.
 * @param newValue Next tri-state filter value.
 * @param activeLocales Optional active locales for translation writes.
 * @returns Nothing.
 */
export function setResourceFilterState<
  T extends keyof ViewFilters,
  K extends keyof ViewFilters[T],
>(
  adminCtx: AdminCtx,
  resource: T,
  filterKey: K,
  newValue: FilterTriState,
  activeLocales?: Set<LocaleKey>,
) {
  const resourceFilters = adminCtx.appCtx.state?.viewFilters?.[resource]
  if (!resourceFilters || typeof resourceFilters !== 'object') return

  // Handle translation filters
  if (
    typeof filterKey === 'string' &&
    filterKey.endsWith('Translated') &&
    activeLocales
  ) {
    setGenericTranslationFilterState(
      adminCtx,
      resource,
      filterKey as string,
      activeLocales,
      newValue,
    )
  } else {
    // Handle simple filters
    adminCtx.appCtx.state.viewFilters[resource] = {
      ...resourceFilters,
      [filterKey]: newValue,
    } as ViewFilters[T]
  }
}

/**
 * Writes a translation filter value across the active locales for a resource.
 * @param adminCtx Admin context containing mutable view filter state.
 * @param resource Resource whose translation filter should be updated.
 * @param filterKey Translation filter key.
 * @param activeLocales Locales that should receive the new value.
 * @param value Next tri-state filter value.
 * @returns Nothing.
 */
export function setGenericTranslationFilterState<T extends keyof ViewFilters>(
  adminCtx: AdminCtx,
  resource: T,
  filterKey: string,
  activeLocales: Set<LocaleKey>,
  value: FilterTriState,
) {
  const resourceFilters = adminCtx.appCtx.state?.viewFilters?.[resource]
  if (!resourceFilters || typeof resourceFilters !== 'object') return

  const existingSectionFilters = (resourceFilters)[filterKey]
  const sectionFilters =
    existingSectionFilters && typeof existingSectionFilters === 'object'
      ? { ...existingSectionFilters }
      : {
          en: null,
          zhHant: null,
          zhHans: null,
        }

  // Set all locales: inactive ones to null, active ones to the provided value
  const translationLocales = (resourceFilters).translationLocales
  for (const locale of Object.keys(translationLocales)) {
    if (activeLocales.has(locale as LocaleKey)) {
      ;(sectionFilters)[locale] = value
    } else {
      ;(sectionFilters)[locale] = null
    }
  }

  adminCtx.appCtx.state.viewFilters[resource] = {
    ...resourceFilters,
    [filterKey]: sectionFilters,
  } as ViewFilters[T]
}

// ---
/********************
 *  7. FILTER STATE (FEATURE)
 ************/
// +++ Filter State (Feature)

/**
 * Reads feature-specific filter state while delegating simple cases to the generic resource path.
 * @param adminCtx Admin context containing current feature filter state.
 * @param filterKey Feature filter key to read.
 * @param propertyId Optional property id for nested property filters.
 * @param activeLocales Optional active locales for translation aggregation.
 * @returns The resolved feature filter state value.
 */
function getFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  propertyId?: Id,
  activeLocales?: Set<LocaleKey>,
): FilterTriState {
  if (
    filterKey === 'isTitleTranslated' ||
    filterKey === 'isDescriptionTranslated' ||
    filterKey === 'isSpecifierTranslated' ||
    filterKey === 'isAddressTranslated'
  ) {
    if (!activeLocales) return null
    return getTranslationFilterState(adminCtx, filterKey, activeLocales)
  }

  if (filterKey === 'properties' && propertyId) {
    return getSimpleFilterState(adminCtx, 'properties', propertyId)
  }

  return getResourceFilterState(
    adminCtx,
    'feature',
    filterKey as keyof ViewFilters['feature'],
    activeLocales,
  )
}

/**
 * Reads a simple feature filter value, optionally from a nested property bucket.
 * @param adminCtx Admin context containing current feature filter state.
 * @param filterKey Feature filter key to read.
 * @param propertyId Optional property id for nested property filters.
 * @returns The current feature filter value.
 */
export function getSimpleFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  propertyId?: Id,
): FilterTriState | any {
  if (!propertyId) {
    return getResourceFilterState(
      adminCtx,
      'feature',
      filterKey as keyof ViewFilters['feature'],
    )
  }

  const featureFilters = getResourceFilters(adminCtx, 'feature')
  if (!featureFilters) return null

  const sectionFilters = featureFilters[filterKey]
  if (
    sectionFilters &&
    typeof sectionFilters === 'object' &&
    propertyId &&
    propertyId in sectionFilters
  ) {
    return (sectionFilters)[propertyId]
  }

  return null
}

/**
 * Writes feature-specific filter state while delegating simple cases to the generic resource path.
 * @param adminCtx Admin context containing mutable feature filter state.
 * @param filterKey Feature filter key to update.
 * @param newValue Next tri-state filter value.
 * @param propertyId Optional property id for nested property filters.
 * @param activeLocales Optional active locales for translation writes.
 * @returns Nothing.
 */
export function setFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  newValue: FilterTriState,
  propertyId?: Id,
  activeLocales?: Set<LocaleKey>,
) {
  // Set the new state
  if (
    filterKey === 'isTitleTranslated' ||
    filterKey === 'isDescriptionTranslated' ||
    filterKey === 'isSpecifierTranslated' ||
    filterKey === 'isAddressTranslated'
  ) {
    if (!activeLocales) return
    setTranslationFilterState(adminCtx, filterKey, activeLocales, newValue)
    return
  }

  if (filterKey === 'properties' && propertyId) {
    setPropertyFilterState(adminCtx, propertyId, newValue)
    return
  }

  setResourceFilterState(
    adminCtx,
    'feature',
    filterKey as keyof ViewFilters['feature'],
    newValue,
    activeLocales,
  )
}

/**
 * Writes a simple or nested feature filter value.
 * @param adminCtx Admin context containing mutable feature filter state.
 * @param filterKey Feature filter key to update.
 * @param value Next tri-state filter value.
 * @param propertyId Optional property id for nested property filters.
 * @returns Nothing.
 */
export function setSimpleFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  value: FilterTriState,
  propertyId?: Id,
) {
  if (!propertyId) {
    setResourceFilterState(
      adminCtx,
      'feature',
      filterKey as keyof ViewFilters['feature'],
      value,
    )
    return
  }

  const featureFilters = getResourceFilters(adminCtx, 'feature')
  if (!featureFilters) return

  const sectionFilters = featureFilters[filterKey]
  if (sectionFilters && typeof sectionFilters === 'object') {
    adminCtx.appCtx.state.viewFilters.feature = {
      ...featureFilters,
      [filterKey]: {
        ...(sectionFilters as Record<string, FilterTriState>),
        [propertyId]: value,
      },
    }
  }
}

/**
 * Toggles a feature filter value against its current state.
 * @param adminCtx Admin context containing mutable feature filter state.
 * @param filterKey Feature filter key to update.
 * @param value Requested toggle target value.
 * @param propertyId Optional property id for nested property filters.
 * @param activeLocales Optional active locales for translation writes.
 * @returns Nothing.
 */
export function toggleFilterState<K extends keyof FeatureViewFilters>(
  adminCtx: AdminCtx,
  filterKey: K,
  value: FilterTriState,
  propertyId?: Id,
  activeLocales?: Set<LocaleKey>,
) {
  // GET
  const currentState = getFilterState(adminCtx, filterKey, propertyId, activeLocales)
  // DETERMINE
  const newValue = value === currentState ? null : value
  // SET
  setFilterState(adminCtx, filterKey, newValue, propertyId, activeLocales)
}

// ---
/********************
 *  8. FILTER STATE (SPECIAL)
 ************/
// +++ Filter State (Special)

/**
 * Reads a feature translation filter state across the active locales.
 * @param adminCtx Admin context containing current feature filter state.
 * @param filterKey Translation filter key to read.
 * @param activeLocales Locales that participate in the aggregated read.
 * @returns The aggregated tri-state translation value.
 */
export function getTranslationFilterState<K extends FeatureTranslationFilterKey>(
  adminCtx: AdminCtx,
  filterKey: K,
  activeLocales: Set<LocaleKey>,
): FilterTriState {
  return getGenericTranslationFilterState(adminCtx, 'feature', filterKey, activeLocales)
}

/**
 * Writes a feature translation filter state across the active locales.
 * @param adminCtx Admin context containing mutable feature filter state.
 * @param filterKey Translation filter key to update.
 * @param activeLocales Locales that should receive the new value.
 * @param value Next tri-state filter value.
 * @returns Nothing.
 */
export function setTranslationFilterState<K extends FeatureTranslationFilterKey>(
  adminCtx: AdminCtx,
  filterKey: K,
  activeLocales: Set<LocaleKey>,
  value: FilterTriState,
) {
  setGenericTranslationFilterState(adminCtx, 'feature', filterKey, activeLocales, value)
}

/**
 * Writes a nested property filter state value.
 * @param adminCtx Admin context containing mutable feature filter state.
 * @param propertyId Property id whose filter value should be updated.
 * @param value Next tri-state filter value.
 * @returns Nothing.
 */
export function setPropertyFilterState(
  adminCtx: AdminCtx,
  propertyId: string,
  value: FilterTriState,
) {
  setSimpleFilterState(adminCtx, 'properties', value, propertyId)
}

/**
 * Resolves the localized label for a feature task chip.
 * @param filterDef Filter definition providing optional override labels.
 * @param targetState Target boolean state for the label.
 * @param isTranslation Whether the label is for a translation task.
 * @returns The localized chip label.
 */
export function getFeatureTaskLabel(
  filterDef: any,
  targetState: boolean,
  isTranslation: boolean = false,
): string {
  if (isTranslation) {
    return !targetState ? m.filters__todo() : m.filters__done()
  }

  if (!targetState) {
    return (
      filterDef.falseLabel ||
      (filterDef.invertBoolean ? m.filters__only() : m.filters__not())
    )
  } else {
    return (
      filterDef.trueLabel ||
      (filterDef.invertBoolean ? m.filters__not() : m.filters__only())
    )
  }
}
