// SERVICES
import { toProjectLicenseFilterCache } from '#lib/client/services/licence.js'
import type { Cache } from './cache.types.js'
import type { LocaleKey } from '#lib/types.js'
type LocalizedRecord = Record<string, unknown>
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
  cache: Pick<Cache, 'project' | 'property' | 'hub'>
  isSuperAdmin: () => boolean
  specifierTranslation: (feature: Feature) => boolean | null
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
  viewFilters: ViewFilters = $state(createDefaultViewFilters())
  sorting: Record<FirstClassResource, ResourceSortState> = $state(
    this.defaultViewSorting(),
  )

  getViewFilteredResource = <T extends Resource>(resource: FirstClassResource): T[] => {
    // HUB
    if (resource === FirstClassResource.hub) {
      const entities = this.getFilteredHub()
      return this.applyHubViewFilters(entities) as T[]
    }
    // TASKS
    if (resource === FirstClassResource.task) {
      const entities = this.getFilteredTask()
      return this.applyTaskViewFilters(entities) as T[]
    }
    // HIERARCHICAL RESOURCES
    const entities = this.getFilteredResource(resource)

    if (resource === FirstClassResource.feature) {
      return this.applyFeatureViewFilters(entities) as T[]
    } else if (resource === FirstClassResource.organisation) {
      return this.applyOrganisationViewFilters(entities) as T[]
    } else if (resource === FirstClassResource.project) {
      return this.applyProjectViewFilters(entities) as T[]
    } else if (resource === FirstClassResource.layer) {
      return this.applyLayerViewFilters(entities) as T[]
    }
    return entities as T[]
  }

  applyFeatureViewFilters = (entities: Resource[]): Resource[] => {
    const features = entities as Feature[]
    const filters = this.viewFilters.feature
    if (!filters) return features

    // Determine active locales from filter state
    const activeLocales = new Set<LocaleKey>()
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as LocaleKey)
      }
    }
    return features.filter(feature => {
      if (!this.filterByStatus(feature, filters)) return false
      if (!this.filterByAuthorship(feature, filters)) return false
      if (!this.filterByTranslation(feature, filters, activeLocales)) return false
      if (!this.filterByImages(feature, filters)) return false
      if (!this.filterByProperties(feature, filters)) return false
      return true
    })
  }

  // ═══════════════════════
  // ADMIN FILTERS :: HELPERS
  // ═══════════════════════

  /**
   * Filters features by their publication and review status flags.
   *
   * Note: isPendingReview has inverted logic - a filter value of `true`
   * means "show features NOT pending review" (where feature.isPendingReview is false).
   *
   * @param feature - The feature to evaluate
   * @param filters - Status filter settings
   * @returns true if feature passes all status filters
   */
  private filterByStatus = (
    feature: Feature,
    filters: ViewFilters['feature'],
  ): boolean => {
    if (filters.isPublished !== null && feature.isPublished !== filters.isPublished)
      return false
    if (filters.isArchived !== null && feature.isArchived !== filters.isArchived)
      return false
    if (filters.isIntangible !== null && feature.isIntangible !== filters.isIntangible)
      return false
    if (filters.isVisitable !== null && feature.isVisitable !== filters.isVisitable)
      return false

    // isPendingReview has inverted logic, so the check is flipped.
    // A filter value of `true` means "show features NOT pending review" (where feature.isPendingReview is false)
    if (
      filters.isPendingReview !== null &&
      feature.isPendingReview === filters.isPendingReview
    ) {
      return false
    }

    return true
  }

  /**
   * Filters features by whether they have user-authored content.
   *
   * Checks if features have non-generated titles and descriptions across
   * any locale. Features without i18n data are considered to have no content.
   *
   * @param feature - The feature to evaluate
   * @param filters - Authorship filter settings
   * @returns true if feature passes authorship filters
   */
  private filterByAuthorship = (
    feature: Feature,
    filters: ViewFilters['feature'],
  ): boolean => {
    if (!feature.i18n) {
      if (filters.hasTitle === true || filters.hasDescription === true) return false
      return true
    }

    const allLocales = Object.keys(feature.i18n) as LocaleKey[]

    if (filters.hasTitle !== null) {
      const hasTitle = allLocales.some(
        locale =>
          feature.i18n?.[locale]?.title &&
          feature.i18n[locale]?.title?.length > 1 &&
          !feature.i18n[locale]?.titleGen,
      )
      if (hasTitle !== filters.hasTitle) return false
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        locale =>
          feature.i18n?.[locale]?.description &&
          feature.i18n[locale]?.description?.length > 1 &&
          !feature.i18n[locale]?.descriptionGen,
      )
      if (hasDescription !== filters.hasDescription) return false
    }

    if (filters.hasDisplayAddress !== null) {
      const hasDisplayAddress = allLocales.some(
        locale =>
          feature.i18n?.[locale]?.displayAddress &&
          feature.i18n[locale]?.displayAddress?.length > 1,
      )
      // Count any non-empty display address, including generated content, for this admin filter.
      if (hasDisplayAddress !== filters.hasDisplayAddress) return false
    }

    if (
      !this.matchesProjectLicenseFilters(
        this.resolveProjectLicenseFilterCache(feature.projectId),
        filters,
      )
    ) {
      return false
    }

    return true
  }

  /**
   * Filters features by translation status across multiple locales and fields.
   *
   * For each translation field (title, description, address), checks if the feature
   * meets the translation requirements across all active locales. If ALL values
   * for a field are null/empty across all locales, the field is considered as
   * "no content to translate" and passes the filter.
   *
   * @param feature - The feature to evaluate
   * @param filters - Translation filter settings per locale
   * @param activeLocales - Set of locales to check
   * @returns true if feature passes all translation filters
   */
  private filterByTranslation = (
    feature: Feature,
    filters: ViewFilters['feature'],
    activeLocales: Set<LocaleKey>,
  ): boolean => {
    const translationChecks: {
      filterKey: 'isTitleTranslated' | 'isDescriptionTranslated' | 'isAddressTranslated'
      textField: 'title' | 'description' | 'displayAddress'
      genField: 'titleGen' | 'descriptionGen' | 'displayAddressGen'
    }[] = [
      { filterKey: 'isTitleTranslated', textField: 'title', genField: 'titleGen' },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen',
      },
      {
        filterKey: 'isAddressTranslated',
        textField: 'displayAddress',
        genField: 'displayAddressGen',
      },
    ]

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        locale => filters[filterKey]?.[locale] !== null,
      )
      if (!isAnyLocaleFiltered) continue

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(feature.i18n ?? {}).some(
        (i18n: LocalizedRecord) => {
          const text = i18n?.[textField]
          const isGenerated = i18n?.[genField] ?? false
          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        },
      )

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every(locale => {
          const i18n = feature.i18n?.[locale]
          if (!i18n) return false // No entry for this locale

          const text = i18n[textField as keyof typeof i18n]
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false

          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        })

        return allActiveLocalesTranslated
      }

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus()

      const allLocalesMatch = [...activeLocales].every(locale => {
        const filterValue = filters[filterKey]?.[locale]
        if (filterValue === null) return true
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true // ALL locales must be translated
        } else {
          return multiLocaleStatus === false // Some locales are not translated (but manual content exists)
        }
      })

      if (!allLocalesMatch) return false
    }

    // Handle specifier translation filter separately (global, not per-locale)
    const isSpecifierFiltered = [...activeLocales].some(
      locale => filters.isSpecifierTranslated?.[locale] !== null,
    )

    if (isSpecifierFiltered) {
      // Get the specifier translation status (tri-state: true, false, or null)
      const specifierStatus = this.dependencies.specifierTranslation(feature)

      // Check if any active locale has a filter set
      const specifierMatches = [...activeLocales].every(locale => {
        const filterValue = filters.isSpecifierTranslated?.[locale]
        if (filterValue === null) return true

        // If filtering for TRUE: Include features where specifiers are translated OR no source content exists (NULL case)
        // If filtering for FALSE: Include only features where specifiers exist AND are NOT translated (exclude NULL case)
        if (filterValue === true) {
          return specifierStatus === true || specifierStatus === null // TRUE includes NULL (no source content)
        } else {
          return specifierStatus === false // FALSE excludes NULL (requires source content to be false)
        }
      })

      if (!specifierMatches) return false
    }

    return true
  }

  /**
   * Filters features by image presence and publication status
   *
   * Supported filters
   * - hasImage - has at least one image
   * - isOneImagePublished - has at least one published image
   * - isAllImagePublished - ALL images must be published
   *
   * @param feature - The feature to filter
   * @param filters - The filters to apply
   * @returns True if the feature matches the filters, false otherwise
   */
  private filterByImages = (
    feature: Feature,
    filters: ViewFilters['feature'],
  ): boolean => {
    // Check if feature has the new count fields (from collection API)
    if ('imageCount' in feature && 'imagePublishedCount' in feature) {
      const imageCount = feature.imageCount as number
      const imagePublishedCount = feature.imagePublishedCount as number
      const hasImages = imageCount > 0

      if (filters.hasImage !== null) {
        if (filters.hasImage !== hasImages) return false
      }

      if (hasImages) {
        if (filters.isOneImagePublished !== null) {
          const hasAtLeastOnePublished = imagePublishedCount > 0
          if (filters.isOneImagePublished === true) {
            // TRUE: Show features with at least one published image
            if (!hasAtLeastOnePublished) return false
          } else {
            // FALSE: Show features where ALL images are unpublished
            if (hasAtLeastOnePublished) return false
          }
        }

        if (filters.isAllImagePublished !== null) {
          const allImagesPublished =
            imageCount > 0 && imagePublishedCount === imageCount
          if (filters.isAllImagePublished === true) {
            // TRUE: Show features where ALL images are published
            if (!allImagesPublished) return false
          } else {
            // FALSE: Show features that have NOT published ALL their images (at least one unpublished)
            if (allImagesPublished) return false
          }
        }
      } else {
        // No images case - in tri-state logic, features with no images should be excluded from BOTH true and false filters
        if (filters.isOneImagePublished !== null) {
          // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
          return false
        }

        if (filters.isAllImagePublished !== null) {
          // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
          return false
        }
      }
      return true
    }

    // Fallback to images array for individual feature API or compatibility
    const images = feature.images ?? []
    const hasImages = images.length > 0

    if (filters.hasImage !== null) {
      if (filters.hasImage !== hasImages) return false
    }

    if (hasImages) {
      if (filters.isOneImagePublished !== null) {
        // Note: isPublished is on the feature-image relationship, not the image itself
        const hasAtLeastOnePublished = images.some(
          featureImage => featureImage.isPublished,
        )
        if (filters.isOneImagePublished === true) {
          // TRUE: Show features with at least one published image
          if (!hasAtLeastOnePublished) return false
        } else {
          // FALSE: Show features where ALL images are unpublished
          if (hasAtLeastOnePublished) return false
        }
      }

      if (filters.isAllImagePublished !== null) {
        // Note: isPublished is on the feature-image relationship, not the image itself
        const allImagesPublished = images.every(
          featureImage => featureImage.isPublished,
        )
        if (filters.isAllImagePublished === true) {
          // TRUE: Show features where ALL images are published
          if (!allImagesPublished) return false
        } else {
          // FALSE: Show features that have NOT published ALL their images (at least one unpublished)
          if (allImagesPublished) return false
        }
      }
    } else {
      // No images case - in tri-state logic, features with no images should be excluded from BOTH true and false filters
      if (filters.isOneImagePublished !== null) {
        // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
        return false
      }

      if (filters.isAllImagePublished !== null) {
        // Features with no images don't pass either TRUE or FALSE filters (tri-state: null case)
        return false
      }
    }
    return true
  }

  // ═══════════════════════
  // ORGANISATION VIEW FILTERS
  // ═══════════════════════

  applyOrganisationViewFilters = (entities: Resource[]): Resource[] => {
    const organisations = entities as Organisation[]
    const filters = this.viewFilters.organisation
    if (!filters) return organisations

    // Determine active locales from filter state
    const activeLocales = new Set<LocaleKey>()
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as LocaleKey)
      }
    }

    return organisations.filter(organisation => {
      if (!this.filterOrganisationByStatus(organisation, filters)) return false
      if (!this.filterOrganisationByAuthorship(organisation, filters)) return false
      if (!this.filterOrganisationByTranslation(organisation, filters, activeLocales))
        return false
      if (!this.filterOrganisationByImages(organisation, filters)) return false
      return true
    })
  }

  private filterOrganisationByStatus = (
    organisation: Organisation,
    filters: ViewFilters['organisation'],
  ): boolean => {
    if (
      filters.isPublished !== null &&
      organisation.isPublished !== filters.isPublished
    )
      return false
    if (filters.isArchived !== null && organisation.isArchived !== filters.isArchived)
      return false
    return true
  }

  private filterOrganisationByAuthorship = (
    organisation: Organisation,
    filters: ViewFilters['organisation'],
  ): boolean => {
    if (!organisation.i18n) {
      if (
        filters.hasName === true ||
        filters.hasContextualName === true ||
        filters.hasDescription === true
      )
        return false
      return true
    }

    const allLocales = Object.keys(organisation.i18n) as LocaleKey[]

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        locale =>
          organisation.i18n?.[locale]?.name &&
          organisation.i18n[locale]?.name?.length > 1 &&
          !organisation.i18n[locale]?.nameGen,
      )
      if (hasName !== filters.hasName) return false
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        locale =>
          organisation.i18n?.[locale]?.nameShort &&
          organisation.i18n[locale]?.nameShort?.length > 1 &&
          !organisation.i18n[locale]?.nameShortGen,
      )
      if (hasContextualName !== filters.hasContextualName) return false
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        locale =>
          organisation.i18n?.[locale]?.description &&
          organisation.i18n[locale]?.description?.length > 1 &&
          !organisation.i18n[locale]?.descriptionGen,
      )
      if (hasDescription !== filters.hasDescription) return false
    }

    return true
  }

  private filterOrganisationByTranslation = (
    organisation: Organisation,
    filters: ViewFilters['organisation'],
    activeLocales: Set<LocaleKey>,
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated'
      textField: 'name' | 'nameShort' | 'description'
      genField: 'nameGen' | 'nameShortGen' | 'descriptionGen'
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen',
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen',
      },
    ]

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        locale => filters[filterKey]?.[locale] !== null,
      )
      if (!isAnyLocaleFiltered) continue

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(organisation.i18n ?? {}).some(
        (i18n: LocalizedRecord) => {
          const text = i18n?.[textField]
          const isGenerated = i18n?.[genField] ?? false
          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        },
      )

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every(locale => {
          const i18n = organisation.i18n?.[locale]
          if (!i18n) return false // No entry for this locale

          const text = i18n[textField as keyof typeof i18n]
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false

          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        })

        return allActiveLocalesTranslated
      }

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus()

      const allLocalesMatch = [...activeLocales].every(locale => {
        const filterValue = filters[filterKey]?.[locale]
        if (filterValue === null) return true
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true // ALL locales must be translated
        } else {
          return multiLocaleStatus === false // Some locales are not translated (but manual content exists)
        }
      })

      if (!allLocalesMatch) return false
    }

    return true
  }

  private filterOrganisationByImages = (
    organisation: Organisation,
    filters: ViewFilters['organisation'],
  ): boolean => {
    if (filters.hasImage !== null) {
      const hasImages = !!organisation.image
      if (filters.hasImage !== hasImages) return false
    }
    return true
  }

  private resolveProjectLicenseFilterCache(projectId?: string | null): {
    isAllRightsReserved: boolean
    isPublicDomain: boolean
    hasLicenseBy: boolean | null
    hasLicenseSa: boolean | null
    hasLicenseNc: boolean | null
    hasLicenseNd: boolean | null
  } | null {
    if (!projectId) return null
    const cachedProject = this.dependencies.cache.project.get(projectId)
    if (!cachedProject?.license) return null
    return toProjectLicenseFilterCache(cachedProject.license)
  }

  private matchesProjectLicenseFilters(
    cache: ReturnType<ResourceFilters['resolveProjectLicenseFilterCache']>,
    filters: ViewFilters['project'] | ViewFilters['layer'] | ViewFilters['feature'],
  ): boolean {
    const hasActiveLicenseFilter =
      filters.isAllRightsReserved !== null ||
      filters.isPublicDomain !== null ||
      filters.hasLicenseBy !== null ||
      filters.hasLicenseSa !== null ||
      filters.hasLicenseNc !== null ||
      filters.hasLicenseNd !== null

    if (!hasActiveLicenseFilter) return true
    if (!cache) return false

    if (
      filters.isAllRightsReserved !== null &&
      cache.isAllRightsReserved !== filters.isAllRightsReserved
    ) {
      return false
    }
    if (
      filters.isPublicDomain !== null &&
      cache.isPublicDomain !== filters.isPublicDomain
    ) {
      return false
    }
    if (filters.hasLicenseBy !== null && cache.hasLicenseBy !== filters.hasLicenseBy) {
      return false
    }
    if (filters.hasLicenseSa !== null && cache.hasLicenseSa !== filters.hasLicenseSa) {
      return false
    }
    if (filters.hasLicenseNc !== null && cache.hasLicenseNc !== filters.hasLicenseNc) {
      return false
    }
    if (filters.hasLicenseNd !== null && cache.hasLicenseNd !== filters.hasLicenseNd) {
      return false
    }

    return true
  }

  // ═══════════════════════
  // PROJECT VIEW FILTERS
  // ═══════════════════════

  applyProjectViewFilters = (entities: Resource[]): Resource[] => {
    const projects = entities as Project[]
    const filters = this.viewFilters.project
    if (!filters) return projects

    // Determine active locales from filter state
    const activeLocales = new Set<LocaleKey>()
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as LocaleKey)
      }
    }
    return projects.filter(project => {
      if (!this.filterProjectByStatus(project, filters)) return false
      if (!this.filterProjectByAuthorship(project, filters)) return false
      if (!this.filterProjectByTranslation(project, filters, activeLocales))
        return false
      if (!this.filterProjectByImages(project, filters)) return false
      return true
    })
  }

  private filterProjectByStatus = (
    project: Project,
    filters: ViewFilters['project'],
  ): boolean => {
    if (filters.isPublished !== null && project.isPublished !== filters.isPublished)
      return false
    if (filters.isArchived !== null && project.isArchived !== filters.isArchived)
      return false
    return true
  }

  private filterProjectByAuthorship = (
    project: Project,
    filters: ViewFilters['project'],
  ): boolean => {
    if (!project.i18n) {
      if (
        filters.hasName === true ||
        filters.hasContextualName === true ||
        filters.hasDescription === true
      ) {
        return false
      }
      return true
    }

    const allLocales = Object.keys(project.i18n) as LocaleKey[]

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        locale =>
          project.i18n?.[locale]?.name &&
          project.i18n[locale]?.name?.length > 1 &&
          !project.i18n[locale]?.nameGen,
      )
      if (hasName !== filters.hasName) return false
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        locale =>
          project.i18n?.[locale]?.nameShort &&
          project.i18n[locale]?.nameShort?.length > 1 &&
          !project.i18n[locale]?.nameShortGen,
      )
      if (hasContextualName !== filters.hasContextualName) return false
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        locale =>
          project.i18n?.[locale]?.description &&
          project.i18n[locale]?.description?.length > 1 &&
          !project.i18n[locale]?.descriptionGen,
      )
      if (hasDescription !== filters.hasDescription) return false
    }

    if (
      !this.matchesProjectLicenseFilters(
        toProjectLicenseFilterCache(project.license),
        filters,
      )
    ) {
      return false
    }

    return true
  }

  private filterProjectByTranslation = (
    project: Project,
    filters: ViewFilters['project'],
    activeLocales: Set<LocaleKey>,
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated'
      textField: 'name' | 'nameShort' | 'description'
      genField: 'nameGen' | 'nameShortGen' | 'descriptionGen'
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen',
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen',
      },
    ]

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        locale => filters[filterKey]?.[locale] !== null,
      )
      if (!isAnyLocaleFiltered) continue

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(project.i18n ?? {}).some(
        (i18n: LocalizedRecord) => {
          const text = i18n?.[textField]
          const isGenerated = i18n?.[genField] ?? false
          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        },
      )

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every(locale => {
          const i18n = project.i18n?.[locale]
          if (!i18n) return false // No entry for this locale

          const text = i18n[textField as keyof typeof i18n]
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false

          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        })

        return allActiveLocalesTranslated
      }

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus()

      const allLocalesMatch = [...activeLocales].every(locale => {
        const filterValue = filters[filterKey]?.[locale]
        if (filterValue === null) return true
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true // ALL locales must be translated
        } else {
          return multiLocaleStatus === false // Some locales are not translated (but manual content exists)
        }
      })

      if (!allLocalesMatch) return false
    }

    return true
  }

  private filterProjectByImages = (
    project: Project,
    filters: ViewFilters['project'],
  ): boolean => {
    if (filters.hasImage !== null) {
      const hasImages = !!project.image
      if (filters.hasImage !== hasImages) return false
    }
    return true
  }

  // ═══════════════════════
  // LAYER VIEW FILTERS
  // ═══════════════════════

  applyLayerViewFilters = (entities: Resource[]): Resource[] => {
    const layers = entities as Layer[]
    const filters = this.viewFilters.layer
    if (!filters) return layers

    // Determine active locales from filter state
    const activeLocales = new Set<LocaleKey>()
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as LocaleKey)
      }
    }
    return layers.filter(layer => {
      if (!this.filterLayerByStatus(layer, filters)) return false
      if (!this.filterLayerByAuthorship(layer, filters)) return false
      if (!this.filterLayerByTranslation(layer, filters, activeLocales)) return false
      return true
    })
  }

  private filterLayerByStatus = (
    layer: Layer,
    filters: ViewFilters['layer'],
  ): boolean => {
    if (filters.isPublished !== null && layer.isPublished !== filters.isPublished)
      return false
    if (filters.isArchived !== null && layer.isArchived !== filters.isArchived)
      return false
    return true
  }

  private filterLayerByAuthorship = (
    layer: Layer,
    filters: ViewFilters['layer'],
  ): boolean => {
    if (!layer.i18n) {
      if (
        filters.hasName === true ||
        filters.hasContextualName === true ||
        filters.hasDescription === true
      )
        return false
      return true
    }

    const allLocales = Object.keys(layer.i18n) as LocaleKey[]

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        locale =>
          layer.i18n?.[locale]?.name &&
          layer.i18n[locale]?.name?.length > 1 &&
          !layer.i18n[locale]?.nameGen,
      )
      if (hasName !== filters.hasName) return false
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        locale =>
          layer.i18n?.[locale]?.nameShort &&
          layer.i18n[locale]?.nameShort?.length > 1 &&
          !layer.i18n[locale]?.nameShortGen,
      )
      if (hasContextualName !== filters.hasContextualName) return false
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        locale =>
          layer.i18n?.[locale]?.description &&
          layer.i18n[locale]?.description?.length > 1 &&
          !layer.i18n[locale]?.descriptionGen,
      )
      if (hasDescription !== filters.hasDescription) return false
    }

    if (
      !this.matchesProjectLicenseFilters(
        this.resolveProjectLicenseFilterCache(layer.projectId),
        filters,
      )
    ) {
      return false
    }

    return true
  }

  private filterLayerByTranslation = (
    layer: Layer,
    filters: ViewFilters['layer'],
    activeLocales: Set<LocaleKey>,
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated'
      textField: 'name' | 'nameShort' | 'description'
      genField: 'nameGen' | 'nameShortGen' | 'descriptionGen'
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen',
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen',
      },
    ]

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        locale => filters[filterKey]?.[locale] !== null,
      )
      if (!isAnyLocaleFiltered) continue

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(layer.i18n ?? {}).some(
        (i18n: LocalizedRecord) => {
          const text = i18n?.[textField]
          const isGenerated = i18n?.[genField] ?? false
          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        },
      )

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every(locale => {
          const i18n = layer.i18n?.[locale]
          if (!i18n) return false // No entry for this locale

          const text = i18n[textField as keyof typeof i18n]
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false

          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        })

        return allActiveLocalesTranslated
      }

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus()

      const allLocalesMatch = [...activeLocales].every(locale => {
        const filterValue = filters[filterKey]?.[locale]
        if (filterValue === null) return true
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true // ALL locales must be translated
        } else {
          return multiLocaleStatus === false // Some locales are not translated (but manual content exists)
        }
      })

      if (!allLocalesMatch) return false
    }

    return true
  }

  // ═══════════════════════
  // TASK VIEW FILTERS
  // ═══════════════════════

  applyTaskViewFilters = (entities: Resource[]): Resource[] => {
    const tasks = entities as Task[]
    const filters = this.viewFilters.task
    if (!filters) return tasks

    return tasks.filter(task => {
      if (!this.filterTaskByStatus(task, filters)) return false
      if (!this.filterTaskByType(task, filters)) return false
      return true
    })
  }

  private filterTaskByStatus = (task: Task, filters: ViewFilters['task']): boolean => {
    if (filters.isReviewed !== null) {
      const filterIsReviewed = Boolean(filters.isReviewed)
      const taskIsReviewed = Boolean(task.isReviewed)
      if (taskIsReviewed !== filterIsReviewed) return false
    }

    if (filters.reviewOutcome !== null) {
      const expectedOutcome = filters.reviewOutcome ? 'accepted' : 'rejected'
      if (task.reviewOutcome !== expectedOutcome) return false
    }

    if (filters.reviewAction && task.reviewAction !== filters.reviewAction) {
      return false
    }

    return true
  }

  private filterTaskByType = (task: Task, filters: ViewFilters['task']): boolean => {
    if (filters.type && task.type !== filters.type) {
      return false
    }

    return true
  }

  /**
   * Resolves the richest available related entities for task text search.
   * Prefer embedded task relations and fall back to admin resource stores.
   */
  private getTaskSearchRelations = (
    task: Task,
  ): {
    feature: Feature | FeatureFromCollection | null
    project: Project | null
    organisation: Organisation | null
  } => {
    const feature =
      task.feature ??
      this.dependencies.rows().feature.find(feature => feature.id === task.featureId) ??
      null
    const project =
      (task.project as Project | null | undefined) ??
      this.dependencies.rows().project.find(project => project.id === task.projectId) ??
      null
    const organisation =
      (task.organisation as unknown as Organisation | null | undefined) ??
      this.dependencies
        .rows()
        .organisation.find(organisation => organisation.id === task.organisationId) ??
      null

    return {
      feature,
      project,
      organisation,
    }
  }

  /**
   * Matches task free-text queries against task fields and related resource text.
   */
  private matchesTaskTextQuery = (task: Task, query: string): boolean => {
    const normalizedQuery = query.trim().toLowerCase()
    if (normalizedQuery === '') return true

    const { feature, project, organisation } = this.getTaskSearchRelations(task)
    const localeKey = getLocaleKey()
    const localizedFeatureTitle =
      feature?.i18n?.[localeKey]?.title ?? feature?.i18n?.en?.title ?? ''

    return (
      (feature &&
        (this.textFilter(FirstClassResource.feature, feature, normalizedQuery) ||
          localizedFeatureTitle.toLowerCase().includes(normalizedQuery))) ||
      (project &&
        this.textFilter(FirstClassResource.project, project, normalizedQuery)) ||
      (organisation &&
        this.textFilter(
          FirstClassResource.organisation,
          organisation,
          normalizedQuery,
        )) ||
      task.message?.toLowerCase().includes(normalizedQuery) ||
      task.contributor?.name?.toLowerCase().includes(normalizedQuery)
    )
  }

  // ═══════════════════════
  // HUB VIEW FILTERS
  // ═══════════════════════

  applyHubViewFilters = (entities: Resource[]): Resource[] => {
    const hubs = entities as Hub[]
    const filters = this.viewFilters.hub
    if (!filters) return hubs

    // Determine active locales from filter state
    const activeLocales = new Set<LocaleKey>()
    for (const [locale, isActive] of Object.entries(filters.translationLocales)) {
      if (isActive) {
        activeLocales.add(locale as LocaleKey)
      }
    }

    return hubs.filter(hub => {
      if (!this.filterHubByStatus(hub, filters)) return false
      if (!this.filterHubByAuthorship(hub, filters)) return false
      if (!this.filterHubByTranslation(hub, filters, activeLocales)) return false
      if (!this.filterHubByImages(hub, filters)) return false
      return true
    })
  }

  private filterHubByStatus = (hub: Hub, filters: ViewFilters['hub']): boolean => {
    if (filters.isArchived !== null && hub.isArchived !== filters.isArchived)
      return false
    return true
  }

  private filterHubByAuthorship = (hub: Hub, filters: ViewFilters['hub']): boolean => {
    const allLocales = Object.keys(hub.i18n || {}) as LocaleKey[]

    if (filters.hasName !== null) {
      const hasName = allLocales.some(
        locale =>
          hub.i18n?.[locale]?.name &&
          hub.i18n[locale]?.name?.length > 1 &&
          !hub.i18n[locale]?.nameGen,
      )
      if (hasName !== filters.hasName) return false
    }

    if (filters.hasContextualName !== null) {
      const hasContextualName = allLocales.some(
        locale =>
          hub.i18n?.[locale]?.nameShort &&
          hub.i18n[locale]?.nameShort?.length > 1 &&
          !hub.i18n[locale]?.nameShortGen,
      )
      if (hasContextualName !== filters.hasContextualName) return false
    }

    if (filters.hasDescription !== null) {
      const hasDescription = allLocales.some(
        locale =>
          hub.i18n?.[locale]?.description &&
          hub.i18n[locale]?.description?.length > 1 &&
          !hub.i18n[locale]?.descriptionGen,
      )
      if (hasDescription !== filters.hasDescription) return false
    }

    return true
  }

  private filterHubByTranslation = (
    hub: Hub,
    filters: ViewFilters['hub'],
    activeLocales: Set<LocaleKey>,
  ): boolean => {
    const translationChecks: {
      filterKey:
        | 'isNameTranslated'
        | 'isContextualNameTranslated'
        | 'isDescriptionTranslated'
      textField: 'name' | 'nameShort' | 'description'
      genField: 'nameGen' | 'nameShortGen' | 'descriptionGen'
    }[] = [
      { filterKey: 'isNameTranslated', textField: 'name', genField: 'nameGen' },
      {
        filterKey: 'isContextualNameTranslated',
        textField: 'nameShort',
        genField: 'nameShortGen',
      },
      {
        filterKey: 'isDescriptionTranslated',
        textField: 'description',
        genField: 'descriptionGen',
      },
    ]

    for (const { filterKey, textField, genField } of translationChecks) {
      const isAnyLocaleFiltered = [...activeLocales].some(
        locale => filters[filterKey]?.[locale] !== null,
      )
      if (!isAnyLocaleFiltered) continue

      // First, check if ANY locale has manual (non-generated) content for this field
      const hasAnyManualContent = Object.values(hub.i18n ?? {}).some(
        (i18n: LocalizedRecord) => {
          const text = i18n?.[textField]
          const isGenerated = i18n?.[genField] ?? false
          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        },
      )

      // Calculate multi-locale translation status - ALL active locales must be translated for TRUE
      const calculateMultiLocaleTranslationStatus = (): boolean | null => {
        if (!hasAnyManualContent) {
          return null // No manual content anywhere
        }

        // Check if ALL active locales have manual translation
        const allActiveLocalesTranslated = [...activeLocales].every(locale => {
          const i18n = hub.i18n?.[locale]
          if (!i18n) return false // No entry for this locale

          const text = i18n[textField as keyof typeof i18n]
          const isGenerated = i18n[genField as keyof typeof i18n] ?? false

          return text && typeof text === 'string' && text.length > 0 && !isGenerated
        })

        return allActiveLocalesTranslated
      }

      const multiLocaleStatus = calculateMultiLocaleTranslationStatus()

      const allLocalesMatch = [...activeLocales].every(locale => {
        const filterValue = filters[filterKey]?.[locale]
        if (filterValue === null) return true
        // Use multi-locale status for filtering
        if (filterValue === true) {
          return multiLocaleStatus === true // ALL locales must be translated
        } else {
          return multiLocaleStatus === false // Some locales are not translated (but manual content exists)
        }
      })

      if (!allLocalesMatch) return false
    }

    return true
  }

  private filterHubByImages = (_hub: Hub, filters: ViewFilters['hub']): boolean => {
    if (filters.hasImage !== null) {
      // Hubs don't have direct image relationships, this filter is not applicable
      return true
    }
    return true
  }

  /**
   * Filters features by property presence and values.
   *
   * Handles both classifier and specifier property types:
   * - Classifier: Checks for presence/absence of a selected value
   * - Specifier: For translatable properties, checks across all locales;
   *   for non-translatable, checks single value
   *
   * @param feature - The feature to evaluate
   * @param filters - Property filter settings (propertyId -> boolean)
   * @returns true if feature passes all property filters
   */
  private filterByProperties = (
    feature: Feature | FeatureFromCollection,
    filters: ViewFilters['feature'],
  ): boolean => {
    const propertyFilters = filters.properties

    const propertyFilterIds = Object.keys(propertyFilters).filter(
      id => propertyFilters[id] !== null,
    )

    if (propertyFilterIds.length === 0) {
      return true // No active property filters
    }

    const PropertyCache = this.dependencies.cache.property

    for (const propertyId of propertyFilterIds) {
      const filterValue = propertyFilters[propertyId] // true or false
      const propertyDef = PropertyCache.get(propertyId) as Property
      const featureProp = feature.properties?.find(p => p.propertyId === propertyId)

      if (!propertyDef) continue

      if (propertyDef.type === 'classifier') {
        let hasValue = false

        if (propertyDef.component === 'RangeField') {
          // RangeField classifier: check if value is not undefined, null, or empty string
          hasValue =
            featureProp?.value !== undefined &&
            featureProp?.value !== null &&
            featureProp?.value !== ''
        } else {
          // SelectField classifier (default): check if there's a propertyValueId
          hasValue = !!featureProp?.propertyValueId
        }

        if (hasValue !== filterValue) return false
      } else if (propertyDef.type === 'specifier') {
        // For "specifier" properties, the filter checks for the presence or absence of a value.
        // If the property is translatable, it checks all locales for values.
        // - If filterValue is true: the feature must have at least one non-empty value in any locale.
        // - If filterValue is false: the feature must have all locales empty for this property.
        if (propertyDef.isTranslatable) {
          const allLocaleValues = featureProp?.i18n
            ? Object.values(featureProp.i18n).map(t => t.value)
            : []
          if (filterValue === true) {
            // ASSERT: Only features with at least one non-empty value in any locale pass.
            const hasSomeValue = allLocaleValues.some(v => v && v.length > 0)
            if (!hasSomeValue) return false
          } else {
            // ASSERT: Only features with all locales empty for this property pass.
            const allAreEmpty = allLocaleValues.every(v => !v || v.length === 0)
            if (!allAreEmpty) return false
          }
        } else {
          // For non-translatable specifiers, check the single value.
          // - If filterValue is true: the feature must have a non-empty value.
          // - If filterValue is false: the feature must have an empty or missing value.
          const hasValue = !!featureProp?.value && featureProp.value.length > 0
          if (hasValue !== filterValue) return false
        }
      }
    }

    return true
  }

  getFilteredTask = () => {
    const query = this.values.task.text || ''
    // FULL SET
    let result: Task[] = this.dependencies.rows().task

    // TEXT FILTER
    if (query) {
      result = result.filter(task => this.matchesTaskTextQuery(task, query))
    }

    return result
  }

  getFilteredHub = () => {
    if (!this.dependencies.isSuperAdmin()) return []
    const query = this.values.hub.text || ''
    // FULL SET
    let result: Hub[] = this.dependencies.rows().hub

    // Use cache if state is empty but cache has data
    if (result.length === 0) {
      const cacheHubs = Array.from(this.dependencies.cache.hub.values())
      if (cacheHubs.length > 0) {
        result = cacheHubs
      }
    }

    // TEXT FILTER - Simple text search on code and domain
    if (query) {
      result = result.filter(
        entity =>
          entity.code?.toLowerCase().includes(query.toLowerCase()) ||
          entity.domain?.toLowerCase().includes(query.toLowerCase()) ||
          entity.organisations?.some(org =>
            org.i18n?.[getLocaleKey()]?.name
              ?.toLowerCase()
              .includes(query.toLowerCase()),
          ),
      )
    }

    return result
  }
  /** Restores independent default admin filters. @returns Nothing. */
  resetViewFilters = (): void => {
    this.viewFilters = createDefaultViewFilters()
  }
}

/** @returns Fresh admin filter defaults, including independent locale objects. */
function createDefaultViewFilters(): ViewFilters {
  return {
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
  }
}
