// SVELTE
import { untrack } from 'svelte'
// I18N
import { getI18n, m } from '$lib/i18n'
// SERVICES
import {
  displayRangeFilter,
  displaySelectedFilters,
  displaySelectedProperties,
  getGroupedClassifierProperties,
  propertyValuesToLocalisedOptions,
  setRangePropertyFilter,
  toggleCategoricalPropertyValue,
} from '$lib/client/services/property'
import {
  filterPlaces,
  getNeighbourhoodsAsResources,
} from '$lib/client/services/geospatial'
// ENUMS
import { FirstClassResource, OmniMode } from '$lib/enums'
// TYPES
import type { AppCtx } from '$lib/context/app.svelte'
import type { OmniCtx } from '$lib/context/omni.svelte'
import type { Id } from '$lib/types'
import type { RangeFilterValue } from '$lib/client/services/propertyFilters.types'
import type { Property, PropertyValue } from '$lib/db/zod/schema/property.types'

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

  const selectedNeighbourhoodRefs = $derived(app.placeCtx.getFilteredNeighbourhoods())
  const visibleNeighbourhoodCount = $derived(
    [...app.placeCtx.neighbourhoodFeatureCounts.values()].filter(count => count > 0)
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
      const counts = app.placeCtx.neighbourhoodFeatureCounts
      const preferences = app.getUserPreferences()
      return filterPlaces(app, searchTerm).map(([id, i18n]) => ({
        id,
        i18n,
        count: counts.get(id) ?? 0,
        selected: selectedNeighbourhoodRefs.includes(id),
        name: getI18n(i18n, 'name', preferences, undefined, true),
        district: getI18n(i18n, 'district', preferences, undefined, true),
        area: getI18n(i18n, 'area', preferences, undefined, true).replace(
          'Hong Kong',
          'HK',
        ),
      }))
    },
    get selectedNeighbourhoods() {
      const resources = getNeighbourhoodsAsResources()
      const preferences = app.getUserPreferences()
      return selectedNeighbourhoodRefs.map(id => ({
        id,
        name: getI18n(
          resources.find(resource => resource.id === id),
          'name',
          preferences,
          id,
        ),
      }))
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
    resetNeighbourhoods: () => app.placeCtx.resetNeighbourhoods(),
    toggleNeighbourhood: (id: string) => {
      app.placeCtx.toggleNeighbourhood(id)
      app.zoomToAllVisibleFeatures()
      omni.setMode(OmniMode.search)
    },
  }
}
