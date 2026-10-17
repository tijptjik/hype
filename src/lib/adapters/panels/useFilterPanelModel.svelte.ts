// SVELTE
import { untrack } from 'svelte'
// I18N
import { getI18n, m } from '#lib/i18n.js'
// SERVICES
import {
  displayRangeFilter,
  displaySelectedFilters,
  displaySelectedProperties,
  getGroupedClassifierProperties,
  propertyValuesToLocalisedOptions,
  setRangePropertyFilter,
  toggleCategoricalPropertyValue,
} from '#lib/client/services/property.js'
import { filterDivisions, getDivisionName } from '#lib/client/services/geospatial.js'
// ENUMS
import { FirstClassResource, OmniMode } from '#lib/enums.js'
// TYPES
import type { AppCtx } from '#lib/context/app.svelte.js'
import type { OmniCtx } from '#lib/context/omni.svelte.js'
import type { Id } from '#lib/types.js'
import type { RangeFilterValue } from '#lib/client/services/propertyFilters.types.js'
import type { Property, PropertyValue } from '#lib/db/zod/schema/property.types.js'

type ClassifierGroup = Awaited<
  ReturnType<typeof getGroupedClassifierProperties>
>[number]
type SelectedPropertyFilter = string[] | RangeFilterValue

/** Reads nested property filters through their intended layer/property shape. */
function getPropertyFilterMap(
  app: AppCtx,
): Record<string, Record<string, SelectedPropertyFilter>> | undefined {
  return app.state.filters.feature.properties as unknown as
    | Record<string, Record<string, SelectedPropertyFilter>>
    | undefined
}

/**
 * Owns filter data, summaries and map/filter mutations for the route.
 * @param app - Route-owned resource and filter context.
 * @param omni - Route-owned search/map presentation context.
 * @returns Filter panel data and callbacks for controlled Bits patterns.
 */
export function useFilterPanelModel(app: AppCtx, omni: OmniCtx) {
  let searchTerm = $state('')
  let groups = $state<ClassifierGroup[]>([])

  // Refresh classifier groups when the active layer selection changes.
  $effect(() => {
    const prismSignature = app.getPrism(FirstClassResource.layer).join('|')
    untrack(() => {
      void getGroupedClassifierProperties(app).then(nextGroups => {
        if (prismSignature === app.getPrism(FirstClassResource.layer).join('|'))
          groups = nextGroups
      })
    })
  })

  const selectedNeighbourhoodRefs = $derived(app.divisionCtx.getFilteredDivisions())
  const visibleNeighbourhoodCount = $derived(
    [...app.divisionCtx.divisionFeatureCounts.values()].filter(count => count > 0)
      .length,
  )

  /** Builds label, selection and mutation data for one classifier control. */
  function propertyFilter(property: Property, layerId: Id) {
    const values = (property.values as PropertyValue[]) || []
    const options = propertyValuesToLocalisedOptions(app, values)
    const getSelection = () => getPropertyFilterMap(app)?.[layerId]?.[property.id]
    return {
      get label() {
        return getI18n(property, 'label', app.getUserPreferences(), property.key)
      },
      get options() {
        return options
      },
      get selectedIds() {
        const selected = getSelection()
        return Array.isArray(selected) ? selected : []
      },
      get displayText() {
        const selected = getSelection() ?? []
        return Array.isArray(selected)
          ? displaySelectedProperties(selected, options)
          : displayRangeFilter(property.min ?? 0, property.max ?? 100, [
              selected.rangeMin ?? property.min ?? 0,
              selected.rangeMax ?? property.max ?? 100,
            ])
      },
      get rangeValues(): [number, number] {
        const selected = getSelection()
        return [
          !Array.isArray(selected) && selected?.rangeMin !== undefined
            ? selected.rangeMin
            : (property.min ?? 0),
          !Array.isArray(selected) && selected?.rangeMax !== undefined
            ? selected.rangeMax
            : (property.max ?? 100),
        ]
      },
      min: property.min ?? 0,
      max: property.max ?? 100,
      toggle: (valueId: Id) =>
        toggleCategoricalPropertyValue(app, layerId, property.id, valueId),
      setRange: (range: [number, number]) =>
        setRangePropertyFilter(app, layerId, property.id, range),
    }
  }

  return {
    get searchTerm() {
      return searchTerm
    },
    setSearchTerm: (value: string) => {
      searchTerm = value
    },
    get selectedNeighbourhoodRefs() {
      return selectedNeighbourhoodRefs
    },
    get visibleNeighbourhoodCount() {
      return visibleNeighbourhoodCount
    },
    get neighbourhoods() {
      const counts = app.divisionCtx.divisionFeatureCounts
      const preferences = app.getUserPreferences()
      return filterDivisions(app, searchTerm).map(([id, i18n]) => ({
        id,
        i18n,
        count: counts.get(id) ?? 0,
        selected: selectedNeighbourhoodRefs.includes(id),
        name: getDivisionName(i18n, preferences),
        level: i18n.level,
        category: i18n.category,
      }))
    },
    get selectedNeighbourhoods() {
      const preferences = app.getUserPreferences()
      return selectedNeighbourhoodRefs.map(id => {
        const division = app.divisionCtx.divisions.get(id)
        return { id, name: division ? getDivisionName(division, preferences) : id }
      })
    },
    get categories() {
      const filters = getPropertyFilterMap(app)
      return groups.map(group => ({
        ...group,
        selectedSummary: displaySelectedFilters(
          app,
          filters?.[group.hierarchy.layerId],
          group.properties,
        ),
      }))
    },
    propertyFilter,
    get filterCount() {
      return app.getFilterCount()
    },
    get hasActiveFilters() {
      const count = app.getFilterCount()
      return count.neighbourhoods > 0 || count.properties > 0
    },
    get resetText() {
      const count = app.getFilterCount()
      if (count.neighbourhoods && count.properties) {
        return `${m.filters__clear()} ${m.filters__reset_count_neighbourhoods({ neighbourhoods: count.neighbourhoods })} & ${m.filters__reset_count_properties({ properties: count.properties })}`
      }
      if (count.neighbourhoods)
        return `${m.filters__clear()} ${m.filters__reset_count_neighbourhoods({ neighbourhoods: count.neighbourhoods })}`
      if (count.properties)
        return `${m.filters__clear()} ${m.filters__reset_count_properties({ properties: count.properties })}`
      return m.filters__reset()
    },
    reset: () => app.resetFilters(),
    resetDivisions: () => app.divisionCtx.resetDivisions(),
    toggleDivision: (id: string) => {
      app.divisionCtx.toggleDivision(id)
      app.zoomToAllVisibleFeatures()
      omni.setMode(OmniMode.search)
    },
  }
}
