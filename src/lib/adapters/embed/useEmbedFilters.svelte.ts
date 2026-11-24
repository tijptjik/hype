// I18N
import { m } from '#lib/i18n.js'
import { embedLabel } from '#lib/embed/presentation.js'
// PROPERTIES
import {
  rangeDomain,
  isRangeProperty,
  formatRangeEndpoint,
} from '#lib/properties/range.js'
// TYPES
import type { useEmbedModel } from './useEmbedModel.svelte'
import type { useFilterPanelModel } from '#lib/adapters/panels/useFilterPanelModel.svelte.js'
import type { Property, PropertyValue } from '#lib/db/zod/schema/property.types.js'

/** Adapts public embed facets to the ordinary FiltersPanel renderer.
 * @param model Scoped public feature owner. @returns Controlled division/category filters.
 * @remarks All options and counts come from the included data; no global queries run.
 */
export function useEmbedFilters(
  model: ReturnType<typeof useEmbedModel>,
): ReturnType<typeof useFilterPanelModel> {
  let searchTerm = $state('')
  let hiddenClasses = $state<string[]>([])
  const divisions = $derived(
    Object.values(model.payload?.page.facets?.divisions ?? {}).filter(
      row => row.hasGeometry,
    ),
  )
  const groups = $derived.by(() => {
    const result = new Map<string, Map<string, Property>>()
    for (const feature of model.features)
      for (const item of feature.properties) {
        if (item.property?.type !== 'classifier') continue
        let properties = result.get(feature.layerId)
        if (!properties) {
          properties = new Map()
          result.set(feature.layerId, properties)
        }
        const definition = properties.get(item.propertyId) ?? {
          ...item.property,
          values: [],
        }
        properties.set(item.propertyId, definition)
        const values = (definition.values ?? []) as PropertyValue[]
        const propertyValue = item.propertyValue
        if (propertyValue && !values.some(value => value.id === propertyValue.id))
          definition.values = [...values, propertyValue]
      }
    return [...result].flatMap(([layerId, properties]) => {
      const layer = model.payload?.layers.find(row => row.id === layerId)
      if (!layer) return []
      return [
        {
          hierarchy: {
            layerId,
            layer: embedLabel(layer, model.lang, 'name', layer.name),
            organisation: embedLabel(
              { i18n: layer.organisationI18n },
              model.lang,
              'name',
              layer.organisationName,
            ),
            project: embedLabel(
              { i18n: layer.projectI18n },
              model.lang,
              'name',
              layer.projectName,
            ),
          },
          properties: [...properties.values()],
        },
      ]
    })
  })
  /** Projects one public classifier using the existing category/range controls.
   * @param property Public definition. @param layerId Owning included layer. @returns Filter control model.
   */
  function propertyFilter(
    property: Property,
    layerId: string,
  ): ReturnType<ReturnType<typeof useFilterPanelModel>['propertyFilter']> {
    const domain = rangeDomain(property)
    const rangeKey = `${layerId}:${property.id}`
    const options = new Map(
      (property.values ?? []).map(value => [
        value.id,
        embedLabel(value, model.lang, 'name', value.value ?? value.id),
      ]),
    )
    return {
      label: embedLabel(property, model.lang, 'label', property.key),
      options,
      get selectedIds() {
        return (property.values ?? [])
          .filter(value => model.categories.includes(`${property.id}:${value.id}`))
          .map(value => value.id)
      },
      get displayText() {
        const range = model.ranges[rangeKey]
        if (isRangeProperty(property) && range)
          return `${formatRangeEndpoint(property, range[0])} – ${formatRangeEndpoint(property, range[1])}`
        const selected = (property.values ?? []).filter(value =>
          model.categories.includes(`${property.id}:${value.id}`),
        )
        return selected.length
          ? selected.map(value => options.get(value.id)).join(', ')
          : m.filters__all()
      },
      get rangeValues(): [number, number] {
        return model.ranges[rangeKey] ?? [domain.min, domain.max]
      },
      definition: property,
      min: domain.min,
      max: domain.max,
      toggle(valueId: string): void {
        const key = `${property.id}:${valueId}`
        model.categories = model.categories.includes(key)
          ? model.categories.filter(id => id !== key)
          : [...model.categories, key]
      },
      setRange(value: [number, number]): void {
        const next = { ...model.ranges }
        if (value[0] === domain.min && value[1] === domain.max) delete next[rangeKey]
        else next[rangeKey] = value
        model.ranges = next
      },
    }
  }
  return {
    get divisionClasses() {
      return [...new Set(divisions.map(row => row.class ?? 'division'))]
        .sort()
        .map(value => ({ value, visible: !hiddenClasses.includes(value) }))
    },
    toggleDivisionClass(value) {
      hiddenClasses = hiddenClasses.includes(value)
        ? hiddenClasses.filter(item => item !== value)
        : [...hiddenClasses, value]
    },
    get searchTerm() {
      return searchTerm
    },
    setSearchTerm(value) {
      searchTerm = value
    },
    get selectedNeighbourhoodRefs() {
      return model.divisions
    },
    get visibleNeighbourhoodCount() {
      return divisions.length
    },
    get divisionCountsLoading() {
      return model.loading
    },
    get divisionsLoading() {
      return model.loading && !model.payload
    },
    get categoriesLoading() {
      return model.loading && !model.payload
    },
    get neighbourhoods() {
      return divisions
        .filter(row => !hiddenClasses.includes(row.class ?? 'division'))
        .map(row => ({
          id: row.id,
          i18n: row,
          count: row.count,
          selected: model.divisions.includes(row.id),
          name: embedLabel(row, model.lang, 'name', row.id),
          level: row.level,
          category: row.category,
          class: row.class,
        }))
        .filter(row =>
          row.name.toLocaleLowerCase().includes(searchTerm.toLocaleLowerCase()),
        )
    },
    get selectedNeighbourhoods() {
      return divisions
        .filter(row => model.divisions.includes(row.id))
        .map(row => ({ id: row.id, name: embedLabel(row, model.lang, 'name', row.id) }))
    },
    // The iframe has no global division-preview context; selecting still filters its loaded places.
    previewDivision: () => {},
    get categories() {
      return groups.map(group => ({
        ...group,
        selectedSummary: group.properties
          .map(property => propertyFilter(property, group.hierarchy.layerId))
          .filter(filter => filter.selectedIds.length > 0)
          .map(filter => filter.displayText)
          .join(' · '),
      }))
    },
    propertyFilter,
    get filterCount() {
      return {
        neighbourhoods: model.divisions.length,
        properties: model.categories.length + Object.keys(model.ranges).length,
      }
    },
    get hasActiveFilters() {
      return !!(
        model.divisions.length ||
        model.categories.length ||
        Object.keys(model.ranges).length
      )
    },
    get resetText() {
      return m.filters__reset()
    },
    reset() {
      model.divisions = []
      model.categories = []
      model.ranges = {}
    },
    resetDivisions() {
      model.divisions = []
    },
    toggleDivision(id) {
      model.divisions = model.divisions.includes(id)
        ? model.divisions.filter(value => value !== id)
        : [...model.divisions, id]
    },
  }
}
