// DOMAIN
import { FirstClassResource, type HierarchicalResource } from '#lib/enums.js'
import { getI18n, getLocaleKey } from '#lib/i18n.js'
import { matchesResourceTextQuery } from '#lib/client/services/filters.js'
import { isTask } from '#lib/utils/resourceGuards.js'
// TYPES
import type { Id, Prisms, Resource } from '#lib/types.js'
import type {
  FilterState,
  FilteredResources,
  ResourceSortState,
} from '#lib/client/services/filters.types.js'
import type {
  ViewFilters,
  FilterTriState,
} from '#lib/client/services/viewFilters.types.js'
import type { RangeFilterValue } from '#lib/client/services/propertyFilters.types.js'
import type {
  FeatureQueryInput,
  FeatureQueryFilters,
} from '#lib/api/services/featureQuery.types.js'
import type {
  PanelResourceType,
  ResourcePageInput,
} from '#lib/api/services/resourcePage.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type {
  Feature,
  FeatureFromCollection,
} from '#lib/db/zod/schema/feature.types.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { UserPreferences } from '#lib/db/zod/schema/user.types.js'
import type { DivisionCtx } from './division.svelte.js'

/** Inputs used to construct queries and initialize visible property filters. */
export interface ResourceFilterDependencies {
  prisms: () => Prisms
  rows: () => FilteredResources
  scopeKey: () => string
  isAdmin: () => boolean
  preferences: () => UserPreferences
  divisions: Pick<DivisionCtx, 'state' | 'divisionFilterCount' | 'resetDivisions'>
}

/** Owns filter intent, sorting and serializable query inputs without loading resources. */
export class ResourceFilters {
  /** @param dependencies Explicit query context and property metadata. */
  constructor(private readonly dependencies: ResourceFilterDependencies) {}

  /** Optional membership/flag filters compose with viewport, properties and neighbourhoods. */
  featureQueryFilters: FeatureQueryFilters = $state({})

  private defaultSortState: ResourceSortState = {
    sortBy: 'modifiedAt',
    sortOrder: 'desc',
  }

  private sortableResources: FirstClassResource[] = [
    FirstClassResource.organisation,
    FirstClassResource.project,
    FirstClassResource.layer,
    FirstClassResource.feature,
    FirstClassResource.task,
    FirstClassResource.hub,
    FirstClassResource.property,
    FirstClassResource.user,
  ]

  private defaultViewSorting = (): Record<FirstClassResource, ResourceSortState> =>
    Object.fromEntries(
      this.sortableResources.map(resource => [resource, { ...this.defaultSortState }]),
    ) as Record<FirstClassResource, ResourceSortState>

  /** Builds the complete identity of a compact panel view. */
  panelResourceInput = (type: PanelResourceType, q = ''): ResourcePageInput => ({
    type,
    conditions: {
      isArchived: false,
      isPublished: this.dependencies.isAdmin() ? null : true,
    },
    q: q.trim(),
    prisms: {
      organisation: [...this.dependencies.prisms().organisation],
      project: [...this.dependencies.prisms().project],
    },
    meta: {
      isAdminRequest: this.dependencies.isAdmin(),
      scope: this.dependencies.scopeKey(),
    },
  })

  /**
   * Builds the complete feature query for a view, optionally constrained to visible cells.
   * @param overrides - Search, membership, spatial or page options for an independent view.
   * @returns Serializable arguments shared by server reads and immediate cache previews.
   */
  featureQueryInput = (
    overrides: Partial<FeatureQueryInput> = {},
  ): FeatureQueryInput => ({
    prisms: {
      organisation: [...this.dependencies.prisms().organisation],
      project: [...this.dependencies.prisms().project],
      layer: [...this.dependencies.prisms().layer],
    },
    limit: 100,
    ...overrides,
    q: (overrides.q ?? this.values.feature.text ?? '').trim(),
    filters: {
      ...this.featureQueryFilters,
      properties: JSON.parse(JSON.stringify(this.values.feature.properties ?? {})),
      divisionIds: [
        ...this.dependencies.divisions.state.filters.feature.neighbourhood.include,
      ],
      excludeDivisionIds: [
        ...this.dependencies.divisions.state.filters.feature.neighbourhood.exclude,
      ],
      ...overrides.filters,
    },
    meta: {
      isAdminRequest: false,
      scope: this.dependencies.scopeKey(),
    },
  })

  /**
   * Resolves the comparable value used to sort a resource in memory.
   *
   * @param resource - Resource type being sorted.
   * @param entity - Resource instance to read from.
   * @param sortBy - Active sort field.
   * @param userPreferences - I18n preferences used when sorting translated fields.
   * @returns Normalized string or numeric value suitable for comparison.
   * @remarks Translated text fields are resolved using the current user locale preferences so
   * client-side sorting matches the strings users actually see in the UI.
   */
  private getResourceSortValue(
    resource: FirstClassResource,
    entity: Resource,
    sortBy: string,
    userPreferences = this.dependencies.preferences(),
  ): string | number {
    if (sortBy === 'createdAt' || sortBy === 'modifiedAt') {
      const rawValue = (entity as Record<string, unknown>)[sortBy]
      // Convert timestamps once so in-memory sorting behaves like a numeric date sort.
      return typeof rawValue === 'string' ? Date.parse(rawValue) || 0 : 0
    }

    if (resource === FirstClassResource.feature) {
      const feature = entity as FeatureFromCollection
      const translatedValue =
        sortBy === 'title' || sortBy === 'description' || sortBy === 'displayAddress'
          ? getI18n(feature, sortBy, userPreferences, '') || ''
          : null

      if (typeof translatedValue === 'string') {
        return translatedValue.toLocaleLowerCase()
      }
    }

    if (sortBy === 'name' || sortBy === 'nameShort' || sortBy === 'description') {
      const translatedValue = getI18n(entity as never, sortBy, userPreferences, '')

      if (typeof translatedValue === 'string') {
        return translatedValue.toLocaleLowerCase()
      }
    }

    const rawValue = (entity as Record<string, unknown>)[sortBy]

    if (typeof rawValue === 'string') {
      return rawValue.toLocaleLowerCase()
    }

    if (typeof rawValue === 'number') {
      return rawValue
    }

    return ''
  }

  /**
   * Sorts an already-loaded resource collection without issuing another server request.
   *
   * @param resource - Resource type being sorted.
   * @param entities - Loaded entities to sort.
   * @param sorting - Requested sort state.
   * @returns A new array ordered according to the requested sort.
   * @remarks The sort falls back to `id` as a stable tiebreaker so repeated renders produce
   * deterministic ordering when primary sort values are equal.
   */
  sortLoadedResources<T extends Resource>(
    resource: FirstClassResource,
    entities: T[],
    sorting: ResourceSortState,
  ): T[] {
    const direction = sorting.sortOrder === 'asc' ? 1 : -1
    const userPreferences = this.dependencies.preferences()
    const sortableEntities = entities.map(entity => ({
      entity,
      sortValue: this.getResourceSortValue(
        resource,
        entity,
        sorting.sortBy,
        userPreferences,
      ),
    }))

    sortableEntities.sort((left, right) => {
      const leftValue = left.sortValue
      const rightValue = right.sortValue

      if (leftValue < rightValue) return -1 * direction
      if (leftValue > rightValue) return 1 * direction

      // Use a stable secondary key to avoid order flicker when values are identical.
      return left.entity.id.localeCompare(right.entity.id)
    })

    return sortableEntities.map(item => item.entity)
  }

  // FILTERS

  // FILTERS - GENERIC

  getFilterCount = (): { neighbourhoods: number; properties: number } => {
    return {
      neighbourhoods: this.dependencies.divisions.divisionFilterCount,
      properties: Object.entries(this.values.feature.properties || {}).reduce(
        (total, [_, layerFilters]) => {
          // For each layer, count its active property filters
          return (
            total +
            Object.entries(layerFilters).filter(
              ([_, values]) =>
                // Count arrays with values
                (Array.isArray(values) && values.length > 0) ||
                // Count range objects only if they differ from their global limits
                (typeof values === 'object' &&
                  values !== null &&
                  !Array.isArray(values) &&
                  'rangeMin' in values &&
                  'rangeMax' in values &&
                  'globalMin' in values &&
                  'globalMax' in values &&
                  (values.rangeMin !== values.globalMin ||
                    values.rangeMax !== values.globalMax)),
            ).length
          )
        },
        0,
      ),
    }
  }

  resetFilters = (): void => {
    this.values = {
      organisation: { text: '', properties: {} },
      project: { text: '', properties: {} },
      layer: { text: '', properties: {} },
      feature: { text: '', properties: {} },
      task: { text: '', properties: {} },
      hub: { text: '', properties: {} },
      property: { text: '', properties: {} },
    }
    this.dependencies.divisions.resetDivisions()
    // Re-initialize property filters for active layers
    this.dependencies.prisms().layer.forEach(layerId => {
      this.initialiseCategoricalPropertyFilters(layerId)
      this.initialiseRangePropertyFilter(layerId)
    })
  }

  getFilteredResource = <
    T extends Organisation | Project | Layer | Feature | Hub | Task,
  >(
    resource: FirstClassResource | HierarchicalResource,
    filters = { text: true, state: true },
  ): T[] => {
    const query = this.values[resource as keyof FilterState].text || ''
    // FULL SET
    let result = this.dependencies.rows()[resource as keyof FilteredResources] as T[]
    // TIER 2 FILTERS :: Boolean State :: (App Wide)
    // TODO Implement these filters if the data responses get too large.
    // TIER 2 FILTERS :: Text :: (App Wide)
    if (filters.text && resource !== FirstClassResource.hub) {
      result = result.filter((entity: T) => {
        if (!isTask(entity)) {
          return this.textFilter(resource as FirstClassResource, entity, query)
        }
        return true
      })
    }

    return result
  }

  textFilter = <
    T extends Organisation | Project | Layer | Feature | Hub | FeatureFromCollection,
  >(
    _resource: FirstClassResource,
    entity: T,
    query: string,
  ) => {
    return matchesResourceTextQuery(entity, query, getLocaleKey())
  }

  initialiseCategoricalPropertyFilters = (layerId: Id) => {
    const layer = this.dependencies.rows().layer.find(l => l.id === layerId)
    if (!layer) {
      return
    }

    const project = this.dependencies.rows().project.find(p => p.id === layer.projectId)
    if (!project) {
      return
    }

    // Filter properties based on visibility in layer (similar logic to Categories.svelte)
    const classifierProperties =
      project.properties
        ?.filter(p => p.type === 'classifier')
        .filter(prop => {
          const layerProperty = layer.properties?.find(lp => lp.propertyId === prop.id)
          // Only consider properties visible in the layer AND not range fields
          return layerProperty?.isVisible !== false && prop.component !== 'RangeField'
        })
        // Ensure uniqueness by key within the project's properties relevant to this layer
        .filter(
          (prop, index, self) => index === self.findIndex(p => p.key === prop.key),
        ) || []

    // Ensure the layer's filter object exists
    if (!this.values.feature.properties) {
      this.values.feature.properties = {}
    }

    const featurePropertyFilters = this.values.feature.properties as unknown as Record<
      Id,
      Record<string, string[] | RangeFilterValue>
    >
    if (!featurePropertyFilters[layerId]) {
      featurePropertyFilters[layerId] = {}
    }

    const layerFilters = featurePropertyFilters[layerId] as Record<
      string,
      string[] | RangeFilterValue
    >

    // Initialize each classifier property with an empty array if not already set
    classifierProperties.forEach((property: Property) => {
      if (!(property.key in layerFilters)) {
        layerFilters[property.key] = []
      }
    })
  }

  initialiseRangePropertyFilter = (layerId: Id) => {
    const layer = this.dependencies.rows().layer.find(l => l.id === layerId)
    if (!layer) {
      return
    }

    const project = this.dependencies.rows().project.find(p => p.id === layer.projectId)
    if (!project) {
      return
    }

    // Find properties that are RangeFields and visible for this layer
    const rangeProperties =
      project.properties
        ?.filter(p => p.component === 'RangeField') // Identify range properties
        .filter(prop => {
          const layerProperty = layer.properties?.find(lp => lp.propertyId === prop.id)
          // Only consider properties visible in the layer
          return layerProperty?.isVisible !== false
        })
        // Ensure uniqueness by key
        .filter(
          (prop, index, self) => index === self.findIndex(p => p.key === prop.key),
        ) || []

    // Ensure the layer's filter object exists
    if (!this.values.feature.properties) {
      this.values.feature.properties = {}
    }

    const featurePropertyFilters = this.values.feature.properties as unknown as Record<
      Id,
      Record<string, string[] | RangeFilterValue>
    >
    if (!featurePropertyFilters[layerId]) {
      featurePropertyFilters[layerId] = {}
    }

    const layerFilters = featurePropertyFilters[layerId] as Record<
      string,
      string[] | RangeFilterValue
    >

    // Initialize each range property using its min/max if not already set
    rangeProperties.forEach((property: Property) => {
      // Validate that min and max exist and are numbers
      const min = property.min
      const max = property.max

      if (
        !(property.key in layerFilters) &&
        typeof min === 'number' &&
        typeof max === 'number'
      ) {
        const filterConfig = {
          globalMin: min,
          globalMax: max,
          rangeMin: min, // Default rangeMin to globalMin
          rangeMax: max, // Default rangeMax to globalMax
        }

        layerFilters[property.key] = filterConfig
      }
    })
  }

  // ═══════════════════════
  // 3-TIER FILTER SYSTEM
  // ═══════════════════════
  // TIER 1: PRISMS -- Which organisations, projects, and layers are pre-filtered when fetching features from the database
  // Applied at the server level to constrain the result set of first-class resources available
  // TIER 2: APP FILTERS -- Which neighbourhoods and properties being filtered for when showing features on the map
  // Sent to feature queries for every view, with cached matches providing immediate previews.
  values: FilterState = $state({
    organisation: { text: '', properties: {} },
    project: { text: '', properties: {} },
    layer: { text: '', properties: {} },
    feature: { text: '', properties: {} },
    task: { text: '', properties: {} },
    hub: { text: '', properties: {} },
    property: { text: '', properties: {} },
  })

  // TIER 3: VIEW FILTERS - Only affect current route/view
  viewFilters: ViewFilters = $state({
    organisation: {
      // Status related
      isPublished: null,
      isArchived: false,

      // Image related
      hasImage: null,

      // Authorship related
      hasName: null,
      hasContextualName: null,
      hasDescription: null,

      // Translation related
      translationLocales: {
        en: false, // Default: English not selected
        zhHant: true,
        zhHans: true,
      },
      isNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isContextualNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isDescriptionTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
    },
    project: {
      // Status related
      isPublished: null,
      isArchived: false,

      // Image related
      hasImage: null,

      // Authorship related
      hasName: null,
      hasContextualName: null,
      hasDescription: null,
      isAllRightsReserved: null,
      isPublicDomain: null,
      hasLicenseBy: null,
      hasLicenseSa: null,
      hasLicenseNc: null,
      hasLicenseNd: null,

      // Translation related
      translationLocales: {
        en: false,
        zhHant: true,
        zhHans: true,
      },
      isNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isContextualNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isDescriptionTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
    },
    layer: {
      // Status related
      isPublished: null,
      isArchived: false,

      // Authorship related
      hasName: null,
      hasContextualName: null,
      hasDescription: null,
      isAllRightsReserved: null,
      isPublicDomain: null,
      hasLicenseBy: null,
      hasLicenseSa: null,
      hasLicenseNc: null,
      hasLicenseNd: null,

      // Translation related
      translationLocales: {
        en: false,
        zhHant: true,
        zhHans: true,
      },
      isNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isContextualNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isDescriptionTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
    },
    feature: {
      // Status related
      isPublished: null,
      isPendingReview: null,
      isArchived: false,
      isIntangible: null,
      isVisitable: null,

      // Image related
      hasImage: null,
      isOneImagePublished: null,
      isAllImagePublished: null,

      // Authorship related
      hasTitle: null,
      hasDescription: null,
      hasDisplayAddress: null,
      isAllRightsReserved: null,
      isPublicDomain: null,
      hasLicenseBy: null,
      hasLicenseSa: null,
      hasLicenseNc: null,
      hasLicenseNd: null,

      // Translation related
      translationLocales: {
        en: false, // Default: English not selected
        zhHant: true,
        zhHans: true,
      },
      isTitleTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isDescriptionTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isSpecifierTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isAddressTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      // Property related
      properties: {} as Record<Id, FilterTriState>,
    },
    task: {
      // Status related
      isReviewed: false,
      reviewOutcome: null,
      reviewAction: null,
      type: null,
    },
    hub: {
      // Status related
      isArchived: false,

      // Image related
      hasImage: null,

      // Authorship related
      hasName: null,
      hasContextualName: null,
      hasDescription: null,

      // Translation related
      translationLocales: {
        en: false,
        zhHant: true,
        zhHans: true,
      },
      isNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isContextualNameTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
      isDescriptionTranslated: {
        en: null,
        zhHant: null,
        zhHans: null,
      },
    },
  })

  sorting: Record<FirstClassResource, ResourceSortState> = $state(
    this.defaultViewSorting(),
  )
}
