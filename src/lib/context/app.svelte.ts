// DATA
import type { QueryClient } from '@tanstack/svelte-query'
// NAVIGATION
import { getUrlParam, navigate, updatePanelUrlParams } from '$lib/navigation'
// GEO
import { bbox } from '@turf/bbox'
// I18N
import { getFallbackLocales, getLocale, setLocale, getI18n } from '$lib/i18n'
// LIB
import { DUAL_PANEL_MIN_WIDTH, fetchOrThrow, isMobile, PANEL_WIDTH } from '$lib/index'
// SERVICES
import {
  debouncedUpdateUserAttribution,
  debouncedUpdateUserExperimental,
  debouncedUpdateUserLayers,
  debouncedUpdateUserPreferences,
  updateLocale,
} from '$lib/client/services/user'
import {
  getFeatureIdsForProperties,
  sortProperties,
} from '$lib/client/services/property'
import { primeFeatureStatsCache } from '$lib/client/services/stats'
// CONTEXT
import { getContext, setContext } from 'svelte'
// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// MARKERS
import { removeMarkerClass, addMarkerClass } from '$lib/map/markers'
// ENUMS
import {
  FirstClassResource,
  type HierarchicalResource,
  Panel,
  PanelLeft,
  PanelRight,
  ResourcePath,
  ResourceRefKey,
  type NewFeatureMode,
} from '$lib/enums'
// GUARDS
import { isFeature, isTask } from '$lib/types'
// TYPES
import type {
  ActiveCollection,
  AppContextState,
  Cache,
  Code,
  ControlMode,
  CurrentUser,
  DeepPartial,
  FacetType,
  Feature,
  FeatureFromCollection,
  FeatureI18nFieldKeys,
  FilterState,
  FilteredResources,
  FilterTriState,
  Hub,
  Id,
  Image,
  Layer,
  LayoutMode,
  Locale,
  NavigableResource,
  NewFeatureTask,
  Organisation,
  Project,
  Property,
  Resource,
  ResourceContext,
  ResourceTypeWithChildren,
  SessionUser,
  Task,
  UserExperimental,
  UserFeature,
  UserLayer,
  UserPreferences,
  HubOpts,
  UserProfile,
  Ref,
  HubOptsExtended,
} from '$lib/types'
import type { Map as MaplibreMap } from 'maplibre-gl'
import type { FeatureCollection, Feature as GeoJSONFeature } from 'geojson'
import type { PlaceCtx } from './place.svelte'

export class AppCtx {
  // Place Context
  placeCtx: PlaceCtx
  // Maplibre Map instance
  map: MaplibreMap = $state()!
  // Maplibre library instance (loaded globally)
  maplibre: any = $state(null)
  // Whether maplibre has been loaded
  isMaplibreLoaded: boolean = $state(false)
  // Tanstack Query Client instance
  queryClient: QueryClient
  // User data (reactive)
  user: UserProfile | CurrentUser | SessionUser | null = $state(null)
  // Whether the map has been initialised
  isInitialised: boolean = $state(false)
  // Whether the app is transitioning between states
  isTransitioning: boolean = $state(false)
  // Whether the app is in mobile mode
  isMobile: boolean = $state(false)

  // Query map to store different query functions (can be overridden by AdminCtx)
  queryMap = new Map<
    FirstClassResource | 'userFeatures',
    {
      queryKey: () => any[]
      queryFn: () => Promise<any>
    }
  >()

  // Cache for all resources
  cache: Cache = {
    organisation: new Map(),
    project: new Map(),
    layer: new Map(),
    feature: new Map(),
    task: new Map(),
    hub: new Map(),
    property: new SvelteMap(),
    image: new SvelteMap(),
    user: new SvelteMap(),
    stats: new SvelteMap(),
  }

  hub: HubOptsExtended | null = $state(null)

  // Features map for current state (rebuilt when state.resources.feature changes)
  private featuresMap = new SvelteMap<Id, FeatureFromCollection | Feature>()
  private organisationCodeToId = new Map<Code, Id>()
  private projectCodeToId = new Map<Code, Id>()
  private hubCodeToId = new Map<Code, Id>()

  state: AppContextState = $state({
    // Markers -- Which features are shown on the map
    markers: new Map(),
    // Active -- Which feature or collection is in focus on the map
    active: {
      feature: null,
      collection: null,
    },
    // ═══════════════════════
    // 3-TIER FILTER SYSTEM
    // ═══════════════════════
    // TIER 1: PRISMS -- Which organisations, projects, and layers are pre-filtered when fetching features from the database
    // Applied at the server level to constrain the result set of first-class resources available
    prisms: { organisation: [], project: [], layer: [] },
    // TIER 2: APP FILTERS -- Which neighbourhoods and properties being filtered for when showing features on the map
    // Applied in the app regardless of view - affects all features displayed on the map and in collections
    filters: {
      organisation: { text: '', properties: {} },
      project: { text: '', properties: {} },
      layer: { text: '', properties: {} },
      feature: { text: '', properties: {} },
      task: { text: '', properties: {} },
      hub: { text: '', properties: {} },
      property: { text: '', properties: {} },
    },
    // TIER 3: VIEW FILTERS -- Handled by individual admin views (e.g., AppCtx.state.viewFilters)
    // Only affect the current route/view they are applied on, not the underlying data or map view
    // Resources -- The resources fetched from the database (post prism-filtering, pre filters-filtering)
    resources: {
      organisation: [],
      project: [],
      layer: [],
      feature: [],
      task: [],
      hub: [],
    },
    // User Features -- The user's wishlist and visited features
    userFeatures: {
      wishlisted: [],
      visited: [],
    },
    // User Location -- The user's location
    userLocation: null,
    // ENHANCEMENT: Implement distancesFromUser
    // Distances from user -- The distances from the user to the features
    distancesFromUser: {},
    nav: {
      resourceType: false,
      resourceRef: false,
      facet: false,
    },
    panels: {
      admin: {
        isOpen: false,
        isOpenVisually: false,
      },
      profile: {
        isOpen: false,
        isOpenVisually: false,
        ctx: {
          username: null,
          userData: null,
          observePrisms: true,
        },
      },
      filters: {
        isOpen: false,
        isOpenVisually: false,
      },
      prisms: {
        isOpen: false,
        isOpenVisually: false,
      },
      stars: {
        isOpen: false,
        isOpenVisually: false,
      },
      settings: {
        isOpen: false,
        isOpenVisually: false,
      },
      hub: {
        isOpen: false,
        isOpenVisually: false,
      },
    },
    // Header state for unified header system
    header: {
      icon: null,
      title: '',
      facetTabs: new Map(),
      actions: {
        showAddButton: false,
        showSearch: false,
        showLayoutModes: false,
        showControlModes: false,
        showFormActions: false,
      },
    },
    // UI state for each resource type
    ui: {
      controlMode: {
        organisation: 'hidden',
        project: 'hidden',
        layer: 'hidden',
        feature: 'filter',
        task: 'filter',
        hub: 'hidden',
        user: 'hidden',
      },
      layoutMode: {
        organisation: 'card',
        project: 'card',
        layer: 'card',
        feature: 'table',
        task: 'table',
        hub: 'card',
        user: 'table',
      },
    },
    // TIER 3: VIEW FILTERS - Only affect current route/view
    viewFilters: {
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
          'zh-hant': true,
          'zh-hans': true,
        },
        isNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isContextualNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isDescriptionTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
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
        hasAttribution: null,
        hasLicense: null,

        // Translation related
        translationLocales: {
          en: false,
          'zh-hant': true,
          'zh-hans': true,
        },
        isNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isContextualNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isDescriptionTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isAttributionTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isLicenseTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
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

        // Translation related
        translationLocales: {
          en: false,
          'zh-hant': true,
          'zh-hans': true,
        },
        isNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isContextualNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isDescriptionTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
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

        // Translation related
        translationLocales: {
          en: false, // Default: English not selected
          'zh-hant': true,
          'zh-hans': true,
        },
        isTitleTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isDescriptionTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isSpecifierTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isAddressTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        // Property related
        properties: {} as Record<Id, FilterTriState>,
      },
      task: {
        // Status related
        isReviewed: false,
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
          'zh-hant': false,
          'zh-hans': false,
        },
        isNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isContextualNameTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
        isDescriptionTranslated: {
          en: null,
          'zh-hant': null,
          'zh-hans': null,
        },
      },
    },
  })

  // New Feature -- The new feature to be created
  newFeature: DeepPartial<NewFeatureTask> | null = $state(null)
  newFeatureMode: NewFeatureMode | null = $state(null)

  // Silly state to track if the map has been zoomed to a marker
  zoomToMarkerOnly: boolean = $state(false)

  // ═══════════════════════
  // QUERY KEYS
  // ═══════════════════════

  organisationsQueryKey = () => [FirstClassResource.organisation, this.isAdmin()]
  projectsQueryKey = () => [
    FirstClassResource.project,
    this.state.prisms.organisation,
    this.isAdmin(),
  ]
  layersQueryKey = () => [
    FirstClassResource.layer,
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.isAdmin(),
  ]
  featuresQueryKey = () => [
    FirstClassResource.feature,
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.state.prisms.layer,
    this.isAdmin(),
  ]
  propertiesQueryKey = () => [
    'property',
    this.state.prisms.organisation,
    this.state.prisms.project,
  ]
  userFeaturesQueryKey = () => ['userFeatures']
  userQueryKey = () => [
    FirstClassResource.user,
    this.state.panels.profile.ctx?.username || this.user?.id,
    ...(this.state.panels.profile.ctx?.observePrisms
      ? [
          this.state.prisms.organisation,
          this.state.prisms.project,
          this.state.prisms.layer,
        ]
      : []),
  ]

  // Form context reference for header form actions
  formCtx: any = $state(null)

  // Constructor
  constructor(queryClient: QueryClient, placeCtx: PlaceCtx, user: SessionUser | null) {
    this.queryClient = queryClient
    this.placeCtx = placeCtx
    this.setUser(user)
    this.initializeQueryMap()
    // Note: keydown handlers are managed dynamically by the root layout
  }

  // Initialize default query map (can be overridden by AdminCtx)
  private initializeQueryMap = (): void => {
    this.queryMap.set(FirstClassResource.organisation, {
      queryKey: this.organisationsQueryKey,
      queryFn: () => this.organisationsQueryFn(),
    })

    this.queryMap.set(FirstClassResource.project, {
      queryKey: this.projectsQueryKey,
      queryFn: () => this.projectsQueryFn(),
    })

    this.queryMap.set(FirstClassResource.layer, {
      queryKey: this.layersQueryKey,
      queryFn: () => this.layersQueryFn(),
    })

    this.queryMap.set(FirstClassResource.feature, {
      queryKey: this.featuresQueryKey,
      queryFn: () => this.featuresQueryFn(),
    })

    // ADMIN ONLY
    this.queryMap.set(FirstClassResource.task, {
      queryKey: () => [FirstClassResource.task],
      queryFn: () => Promise.resolve([]),
    })

    // ADMIN ONLY
    this.queryMap.set(FirstClassResource.hub, {
      queryKey: () => [FirstClassResource.hub],
      queryFn: () => Promise.resolve([]),
    })

    // APP ONLY
    this.queryMap.set('userFeatures', {
      queryKey: this.userFeaturesQueryKey,
      queryFn: () => this.userFeaturesQueryFn(),
    })

    this.queryMap.set(FirstClassResource.user, {
      queryKey: this.userQueryKey,
      queryFn: () => this.userQueryFn(),
    })

    // PROPERTIES
    this.queryMap.set(FirstClassResource.property, {
      queryKey: this.propertiesQueryKey,
      queryFn: () => this.propertiesQueryFn(),
    })
  }

  init = async (userId: Id | null): Promise<void> => {
    // Only initialize if user is authenticated
    if (!userId) {
      // Initialize empty data structures for unauthenticated users
      this.state.resources.organisation = []
      this.state.resources.project = []
      this.state.resources.layer = []
      this.state.resources.feature = []
      this.state.resources.task = []
      this.state.resources.hub = []
      this.state.userFeatures = {
        wishlisted: [],
        visited: [],
      }
      return
    }
    // Initialize stats cache
    this.initStatsCache()
    // Use parallel fetching for initial load
    await this.initialFetch()
    // Prevent init from running again, unless the user (re)authenticates
    // see reinitializeWithAuth()
    this.isInitialised = true
  }

  initialFetch = async (): Promise<void> => {
    // Fetch all resources in parallel without cascading
    await Promise.all([
      // All resource types in parallel
      this.refreshOrganisations(false),
      this.refreshProjects(false),
      this.refreshLayers(false),
      this.refreshProperties(false),
      this.refreshFeatures(false),
      this.refreshUserProfile(false),
      this.refreshUserFeatures(false),
      this.isAdmin() ? this.refreshHubs(false) : Promise.resolve(),
      this.isAdmin() ? this.refreshTasks(false) : Promise.resolve(),
    ])
  }

  initStatsCache = (): void => {
    Object.values(FirstClassResource).forEach(resourceType => {
      this.cache.stats.set(resourceType, new SvelteMap())
    })
  }

  reinitializeWithAuth = async (): Promise<void> => {
    if (this.user?.id) {
      this.isInitialised = false
      await this.init(this.user.id)
    }
  }

  // ASSERT :: User is SuperAdmin
  isSuperAdmin(): boolean {
    return this.user?.superAdmin === true
  }

  // ASSERT :: App is in admin dashboard
  isAdmin(): boolean {
    // Check if we're in admin interface - can be determined by URL path
    return (
      typeof window !== 'undefined' && window.location.pathname.startsWith('/admin')
    )
  }

  // Helper method to build API URLs with filters
  private buildApiUrl = (
    resource: FirstClassResource,
    ref?: Ref,
    includePrisms: boolean = true,
    includeFilters: boolean = true,
  ): string => {
    const path = ResourcePath[resource] + (ref ? `/${ref}` : '')
    const params = new URLSearchParams()

    // Add isArchived filter by default (except for properties which don't have these fields)
    if (includeFilters) {
      params.append('isArchived', 'false')
      params.append('isPublished', 'true')
    }

    if (includePrisms) {
      // Add prism filters based on resource hierarchy
      if (resource !== FirstClassResource.organisation) {
        this.state.prisms.organisation.forEach(org =>
          params.append(FirstClassResource.organisation, org),
        )
      }

      if (
        resource !== FirstClassResource.organisation &&
        resource !== FirstClassResource.project
      ) {
        this.state.prisms.project.forEach(proj =>
          params.append(FirstClassResource.project, proj),
        )
      }

      if (
        resource === FirstClassResource.feature ||
        resource === FirstClassResource.user
      ) {
        this.state.prisms.layer.forEach(layer =>
          params.append(FirstClassResource.layer, layer),
        )
      }
    }

    return `/api/${path}?${params.toString()}`
  }

  organisationsQueryFn = async (): Promise<Organisation[]> => {
    const url = this.buildApiUrl(FirstClassResource.organisation)
    return fetchOrThrow<Organisation[]>(url)
  }

  projectsQueryFn = async (): Promise<Project[]> => {
    const url = this.buildApiUrl(FirstClassResource.project)
    return fetchOrThrow<Project[]>(url)
  }

  layersQueryFn = async (): Promise<Layer[]> => {
    const url = this.buildApiUrl(FirstClassResource.layer)
    return fetchOrThrow<Layer[]>(url)
  }

  featuresQueryFn = async (): Promise<FeatureFromCollection[]> => {
    const url = this.buildApiUrl(FirstClassResource.feature)
    return fetchOrThrow<FeatureFromCollection[]>(url)
  }

  propertiesQueryFn = async (): Promise<Property[]> => {
    const url = this.buildApiUrl(FirstClassResource.property, undefined, true, false)
    return fetchOrThrow<Property[]>(url)
  }

  userFeaturesQueryFn = async (): Promise<UserFeature[]> => {
    if (!this.user?.id) {
      return []
    }
    const response = await fetch(`/api/userFeatures?userId=${this.user.id}`)
    if (!response.ok) throw new Error('Network response was not ok')
    const data = await response.json()
    // Ensure we always return an array, even if API returns null/undefined
    return Array.isArray(data) ? data : []
  }

  userQueryFn = async (): Promise<UserProfile | null> => {
    const includePrisms = this.state.panels.profile.ctx?.observePrisms
    const userRef = this.state.panels.profile.ctx?.username || this.user?.id
    const url = this.buildApiUrl(FirstClassResource.user, userRef, includePrisms)
    return fetchOrThrow<UserProfile>(url)
  }

  invalidateAndRefresh = async (
    resource: FirstClassResource | 'userFeatures',
  ): Promise<void> => {
    // Invalidate the query
    await this.invalidate(resource)
    // Refresh the resources
    await this.refresh(resource)
  }

  /**
   * Targeted invalidation for image uploads - only invalidates and refreshes the specific resource
   * without triggering cascading refreshes. Updates the cache for that resource.
   * @param resource - The resource type to invalidate
   * @param resourceId - The ID of the specific resource to invalidate
   */
  invalidateResourceTargeted = async (
    resource: FirstClassResource,
    resourceId: Id,
  ): Promise<void> => {
    // Get the specific query key for this resource
    const queryKey = this.queryMap.get(resource)?.queryKey()

    if (!queryKey) {
      console.warn(`No query key found for resource: ${resource}`)
      return
    }

    // Invalidate queries for this resource type
    await this.queryClient.invalidateQueries({
      queryKey,
      refetchType: 'active',
      exact: true,
    })

    // Refresh only the specific resource without cascading
    await this.refreshResourceTargeted(resource, resourceId)
  }

  /**
   * Refresh a specific resource without triggering cascades
   * @param resource - The resource type to refresh
   * @param resourceId - The ID of the specific resource to refresh
   */
  private refreshResourceTargeted = async (
    resource: FirstClassResource,
    resourceId: Id,
  ): Promise<void> => {
    try {
      // Fetch the updated resource data
      const updatedResource = await this.fetchResourceById(resource, resourceId)

      if (updatedResource) {
        // Update the cache with the new resource data
        this.cache[resource].set(resourceId, updatedResource)

        // For features, also update the featuresMap
        if (resource === FirstClassResource.feature) {
          this.addFeatureToMap(updatedResource as Feature)
        }

        // Update the resources array if the resource exists there
        this.updateResourceInArray(resource, updatedResource)
      }
    } catch (error) {
      console.error(`Failed to refresh resource ${resource}:${resourceId}`, error)
    }
  }

  /**
   * Update a resource in the appropriate resources array
   * @param resource - The resource type
   * @param updatedResource - The updated resource data
   */
  private updateResourceInArray = (
    resource: FirstClassResource,
    updatedResource: any,
  ): void => {
    const resourceArray =
      this.state.resources[resource as keyof typeof this.state.resources]
    if (resourceArray && Array.isArray(resourceArray)) {
      const index = resourceArray.findIndex((r: any) => r.id === updatedResource.id)
      if (index !== -1) {
        resourceArray[index] = updatedResource
      }
    }
  }

  invalidate = async (
    resource: FirstClassResource | 'userFeatures' | 'user',
  ): Promise<void> => {
    const resourcesToInvalidate = [resource]
    // Clear relevant caches when invalidating (forces fresh data)
    if (resource === FirstClassResource.organisation) {
      this.cache.organisation.clear()
      this.organisationCodeToId.clear()
    } else if (resource === FirstClassResource.project) {
      this.cache.project.clear()
      this.projectCodeToId.clear()
      this.cache.property.clear()
      resourcesToInvalidate.push(FirstClassResource.property)
    } else if (resource === FirstClassResource.layer) {
      this.cache.layer.clear()
    } else if (resource === FirstClassResource.feature) {
      this.cache.feature.clear()
      this.featuresMap.clear()
    } else if (resource === FirstClassResource.task) {
      this.cache.task.clear()
    } else if (resource === FirstClassResource.hub) {
      this.cache.hub.clear()
      this.hubCodeToId.clear()
      this.cache.organisation.clear()
      resourcesToInvalidate.push(FirstClassResource.organisation)
    } else if (resource === FirstClassResource.property) {
      this.cache.property.clear()
    } else if (resource === 'user') {
      // TODO Should we clear the profile panel too?
      this.cache.user.clear()
    }

    resourcesToInvalidate.forEach(async resource => {
      await this.queryClient.invalidateQueries({
        queryKey:
          resource === 'userFeatures'
            ? this.userFeaturesQueryKey()
            : [FirstClassResource[resource]],
        refetchType: 'all',
        exact: false,
      })
    })
  }

  togglePrism = async (resource: FirstClassResource, id: Id): Promise<void> => {
    const prisms = this.state.prisms[resource as ResourceTypeWithChildren]
    const index = prisms.indexOf(id)
    if (index === -1) {
      prisms.push(id)
    } else {
      prisms.splice(index, 1)
    }
    // Refresh all the dependent resources
    if (resource === FirstClassResource.organisation) {
      await this.refreshProjects()
      await this.refreshHubs()
    } else if (resource === FirstClassResource.project) {
      await this.refreshProperties()
      await this.refreshLayers()
    } else if (resource === FirstClassResource.layer) {
      // Only refresh features if user is authenticated
      if (this.user?.id) {
        await this.refreshFeatures()
        if (this.isAdmin()) {
          await this.refreshTasks()
        }
      }
      // Only refresh if we have a username in the profile context
      if (this.state.panels.profile.ctx?.username) {
        await this.refreshUserProfile()
      }
    }
  }

  // Toggle methods for hierarchical filters
  toggleOrganisation = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.organisation, id)
  }

  toggleProject = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.project, id)
  }

  toggleLayer = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.layer, id)
  }

  toggleFeature = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.feature, id)
  }

  // Cascades refresh to the next resource in the hierarchy
  refresh = async (resource: FirstClassResource | 'userFeatures'): Promise<void> => {
    // Refresh the resources
    if (resource === 'organisation') {
      await this.refreshOrganisations()
    } else if (resource === 'project') {
      await this.refreshProjects()
    } else if (resource === 'layer') {
      await this.refreshLayers()
    } else if (resource === 'feature') {
      await this.refreshFeatures()
    } else if (resource === 'task') {
      await this.refreshTasks()
    } else if (resource === 'hub') {
      await this.refreshHubs()
    } else if (resource === 'property') {
      await this.refreshProperties()
    } else if (resource === 'userFeatures') {
      await this.refreshUserFeatures()
    }
  }

  refreshOrganisations = async (isCascading: boolean = true): Promise<void> => {
    this.state.resources.organisation = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.organisation)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.organisation)!.queryFn,
    })
    // Efficiently sync organization cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.organisation, this.state.resources.organisation)
    // Efficiently sync organisation code-to-ID mapping
    this.syncCodeToIdMap(this.organisationCodeToId, this.state.resources.organisation)
    // Sync organisation prisms to remove any invalid organisation IDs
    this.syncOrganisationPrisms()
    if (isCascading) {
      await this.refreshProjects()
      await this.refreshHubs()
    }
  }

  refreshProjects = async (isCascading: boolean = true): Promise<void> => {
    this.state.resources.project = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.project)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.project)!.queryFn,
    })
    // Efficiently sync project cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.project, this.state.resources.project)
    // Efficiently sync project code-to-ID mapping
    this.syncCodeToIdMap(this.projectCodeToId, this.state.resources.project)
    // Sync project prisms to remove any invalid project IDs
    this.syncProjectPrisms()
    if (isCascading) {
      await this.refreshProperties()
      await this.refreshLayers()
    }
  }

  refreshLayers = async (isCascading: boolean = true): Promise<void> => {
    this.state.resources.layer = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.layer)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.layer)!.queryFn,
    })
    // Efficiently sync layer cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.layer, this.state.resources.layer)
    // Sync layer prisms to remove any layerIds which are no londer valid resources given the parent prism selection.
    this.syncLayerPrisms()
    // Also calls this.refreshFeatures()
    await this.postLayerMutation(isCascading)
  }

  refreshFeatures = async (isCascading: boolean = true): Promise<void> => {
    const features: FeatureFromCollection[] = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.feature)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.feature)!.queryFn,
    })
    this.state.resources.feature = features
    this.syncCacheMap(this.cache.feature, features)

    // Pre-populate stats cache for this feature
    features.forEach(feature => {
      primeFeatureStatsCache(this, feature)
    })

    // Rebuild the featureId to feature map
    this.rebuildFeaturesMap()

    // Rebuild the neighbourhoodRef to featureIds map
    this.placeCtx.setNeighbourhoodFeatures(
      this.getPrism(FirstClassResource.layer).length > 0 ? features : [],
    )
  }

  refreshTasks = async (isCascading: boolean = true): Promise<void> => {
    this.state.resources.task = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.task)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.task)!.queryFn,
    })
    // Efficiently sync task cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.task, this.state.resources.task)
  }

  setTaskResourceAndCache = (task: Task): void => {
    const existingTask = this.state.resources.task.find(t => t.id === task.id)
    if (existingTask) {
      this.state.resources.task = this.state.resources.task.map(t =>
        t.id === task.id ? task : t,
      )
    } else {
      this.state.resources.task = [...this.state.resources.task, task]
    }
    this.cache.task.set(task.id, task)
  }

  refreshHubs = async (isCascading: boolean = true): Promise<void> => {
    if (!this.isSuperAdmin()) return
    this.state.resources.hub = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.hub)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.hub)!.queryFn,
    })
    // Efficiently sync hub cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.hub, this.state.resources.hub)
    // Efficiently sync hub code-to-ID mapping
    this.syncCodeToIdMap(this.hubCodeToId, this.state.resources.hub)
  }

  refreshProperties = async (isCascading: boolean = true): Promise<void> => {
    const properties = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.property)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.property)!.queryFn,
    })
    // Efficiently sync property cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.property, properties)
  }

  refreshUserFeatures = async (isCascading: boolean = true): Promise<void> => {
    this.state.userFeatures = await this.queryClient
      .fetchQuery({
        queryKey: this.queryMap.get('userFeatures')!.queryKey(),
        queryFn: this.queryMap.get('userFeatures')!.queryFn,
      })
      .then(uf => ({
        wishlisted: (uf || []).filter((f: UserFeature) => f.isWishlisted),
        visited: (uf || []).filter((f: UserFeature) => f.isVisited),
      }))

    // If active collection is a walk, refresh it and handle navigation
    this.postUserFeaturesMutation()
  }

  refreshUserProfile = async (isCascading: boolean = true): Promise<void> => {
    const user = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.user)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.user)!.queryFn,
    })
    this.state.panels.profile.ctx!.userData = user
  }

  /*
   * Handles user features mutation and refreshes the active walk collection
   * If a user has their stars selected as an ActiveCollection (Walk), then we
   * ensure that the collection count is updated and the card navigates to
   * the next item on the list, or returns home if the list is empty.
   */
  postUserFeaturesMutation = (): void => {
    const activeCollection = this.getActiveCollection()
    if (!activeCollection || activeCollection.type !== 'walk') {
      return
    }

    const currentActiveFeature = this.getActiveFeature()
    let updatedItems: (FeatureFromCollection | Feature)[] = []

    // Get updated items based on walk type
    if (activeCollection.id === 'stars') {
      updatedItems = this.getWishlistedFeatures()
    } else if (activeCollection.id === 'visited') {
      updatedItems = this.getVisitedFeatures()
    }
    // TODO: Add other walk types when implemented

    // If the collection is now empty, reset and navigate to home
    if (updatedItems.length === 0) {
      this.resetActiveCollection()
      navigate('/')
      return
    }

    // Update the collection with new items
    this.setActiveCollection(
      {
        ...activeCollection,
        items: updatedItems,
      },
      {
        highlight: false,
        focus: false,
      },
    )

    // Handle navigation if current feature is no longer in the collection
    if (currentActiveFeature) {
      const isCurrentFeatureStillInCollection = updatedItems.some(
        f => f.id === currentActiveFeature.id,
      )

      if (!isCurrentFeatureStillInCollection) {
        // Find the next feature to navigate to
        const currentIndex = activeCollection.items.findIndex(
          f => f.id === currentActiveFeature.id,
        )

        let nextFeature: FeatureFromCollection | Feature | null = null

        // Try to get the next feature in the original list
        if (currentIndex >= 0 && currentIndex < updatedItems.length) {
          nextFeature = updatedItems[currentIndex]
        } else if (updatedItems.length > 0) {
          // If current index is out of bounds, get the last item
          nextFeature = updatedItems[updatedItems.length - 1]
        }

        if (nextFeature) {
          this.setActiveFeature(nextFeature.id, { focus: true, openCard: true })
        }
      }
    }
  }

  // ═══════════════════════
  // PRISMS
  // ═══════════════════════

  //* Removes organisation from prisms if they are no longer in the resources.
  // This should rarely happen as we always fetch all organisations. But it could happen in cases where an organisation is unpublished or deleted.
  syncOrganisationPrisms = () => {
    const filteredOrganisations = this.state.prisms.organisation.filter(
      organisation => {
        return this.state.resources.organisation.some(o => o.id === organisation)
      },
    )

    // Only update if the array actually changed
    if (
      filteredOrganisations.length !== this.state.prisms.organisation.length ||
      !filteredOrganisations.every(
        (id, index) => id === this.state.prisms.organisation[index],
      )
    ) {
      this.state.prisms.organisation = filteredOrganisations
    }
  }

  //* Removes project from prisms if they are no longer in the resources.
  // This typically is required when an organisation prism is set, and a
  // previously active prism is no longer valid given that the related
  // organisation is not selected as a prism.
  syncProjectPrisms = () => {
    const filteredProjects = this.state.prisms.project.filter(project => {
      return this.state.resources.project.some(p => p.id === project)
    })

    // Only update if the array actually changed
    if (
      filteredProjects.length !== this.state.prisms.project.length ||
      !filteredProjects.every((id, index) => id === this.state.prisms.project[index])
    ) {
      this.state.prisms.project = filteredProjects
    }
  }

  //* Removes layer from prisms if they are no longer in the resources.
  // This typically is required when a organisation or project prism is set,
  // and a previously active prism is no longer valid given that the related
  // project or organisation is not selected as a prism.
  syncLayerPrisms = () => {
    const filteredLayers = this.state.prisms.layer.filter(layer => {
      return this.state.resources.layer.some(l => l.id === layer)
    })

    // Use Set comparison for proper array equality check
    const currentSet = new Set(this.state.prisms.layer)
    const filteredSet = new Set(filteredLayers)

    // Check if sets are different (different lengths or different contents)
    const shouldUpdate =
      currentSet.size !== filteredSet.size ||
      !Array.from(currentSet).every(id => filteredSet.has(id))

    // Only update if the array actually changed
    if (shouldUpdate) {
      this.state.prisms.layer = filteredLayers
    }
  }

  postLayerMutation = async (isCascading: boolean = true): Promise<void> => {
    // Auto-select single layer if there's only one available and none selected
    if (
      this.state.resources.layer.length === 1 &&
      this.state.prisms.layer.length === 0
    ) {
      this.toggleLayer(this.state.resources.layer[0].id)
    }

    const currentLayerIds = new Set(this.state.prisms.layer)
    const existingFilterLayerIds = new Set(
      Object.keys(this.state.filters.feature.properties || {}),
    )

    // Initialise filters for newly added layers
    currentLayerIds.forEach(layerId => {
      if (!existingFilterLayerIds.has(layerId)) {
        // Call initialization functions for the new layer
        this.initialiseCategoricalPropertyFilters(layerId)
        this.initialiseRangePropertyFilter(layerId)
      }
    })

    // Remove filters for layers that are no longer active
    existingFilterLayerIds.forEach(layerId => {
      if (!currentLayerIds.has(layerId)) {
        delete this.state.filters.feature.properties![layerId]
      }
    })

    if (isCascading) {
      // Only refresh features if user is authenticated
      if (this.user?.id) {
        await this.refreshFeatures()
        if (this.isAdmin()) {
          await this.refreshTasks()
        }
      }
      // Only refresh if we have a username in the profile context
      if (this.state.panels.profile.ctx?.username) {
        await this.refreshUserProfile()
      }
    }
  }

  postUserMutation = (): void => {
    if (this.user && 'userLayers' in this.user) {
      // Set default layers if user has userLayers
      this.state.prisms.layer =
        this.user.userLayers?.map((layer: UserLayer) => layer.layerId) ?? []
    }

    // Set admin panel state based on user preferences
    if (this.isAdmin() && this.user && 'preferences' in this.user) {
      const isPrimaryPanelCollapsed =
        (this.user as CurrentUser).preferences?.admin?.isPrimaryPanelCollapsed ?? false
      if (!isPrimaryPanelCollapsed) {
        this.openPanel(Panel.admin, false)
      }
    }
  }

  // ═══════════════════════
  // CODE TO ID MAPPINGS
  // ═══════════════════════

  getOrganisationIdByCode = (code: Code): Id | undefined => {
    return this.organisationCodeToId.get(code)
  }

  getProjectIdByCode = (code: Code): Id | undefined => {
    return this.projectCodeToId.get(code)
  }

  getHubIdByCode = (code: Code): Id | undefined => {
    return this.hubCodeToId.get(code)
  }

  // ═══════════════════════
  // CODE TO ID MAPPINGS
  // ═══════════════════════

  getOrganisationCodeById = (id: Id): Code | undefined => {
    // Reverse lookup: find the code for a given ID
    for (const [code, orgId] of this.organisationCodeToId) {
      if (orgId === id) {
        return code
      }
    }
    return undefined
  }

  getProjectCodeById = (id: Id): Code | undefined => {
    // Reverse lookup: find the code for a given ID
    for (const [code, projectId] of this.projectCodeToId) {
      if (projectId === id) {
        return code
      }
    }
    return undefined
  }

  getHubCodeById = (id: Id): Code | undefined => {
    // Reverse lookup: find the code for a given ID
    for (const [code, hubId] of this.hubCodeToId) {
      if (hubId === id) {
        return code
      }
    }
    return undefined
  }

  // FILTERS

  // FILTERS - GENERIC

  getFilterCount = (): { neighbourhoods: number; properties: number } => {
    return {
      neighbourhoods: this.placeCtx.neighbourhoodFilterCount,
      properties: Object.entries(this.state.filters.feature.properties || {}).reduce(
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
    this.state.filters = {
      organisation: { text: '', properties: {} },
      project: { text: '', properties: {} },
      layer: { text: '', properties: {} },
      feature: { text: '', properties: {} },
      task: { text: '', properties: {} },
      hub: { text: '', properties: {} },
      property: { text: '', properties: {} },
    }
    this.placeCtx.resetNeighbourhoods()
    // Re-initialize property filters for active layers
    this.state.prisms.layer.forEach(layerId => {
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
    const query = this.state.filters[resource as keyof FilterState].text || ''
    // FULL SET
    let result = this.state.resources[resource as keyof FilteredResources] as T[]
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
    resource: FirstClassResource,
    entity: T,
    query: string,
  ) => {
    const textObject = entity.i18n?.[getLocale()]
    const contributor = isFeature(entity) ? entity.contributor?.name : ''
    if (!textObject) return false
    return (
      query === '' ||
      textObject.name?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.title?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.nameShort?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.description?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.displayAddress?.toLowerCase().includes(query.toLowerCase()) ||
      contributor?.toLowerCase().includes(query.toLowerCase())
    )
  }

  // Filtered Helpers
  filteredOrganisations = $derived.by(() => {
    // Explicitly access reactive dependencies so Svelte tracks them
    this.state.resources.organisation
    this.state.filters.organisation
    return this.getFilteredResource<Organisation>(FirstClassResource.organisation)
  })
  filteredProjects = $derived.by(() => {
    this.state.resources.project
    this.state.filters.project
    return this.getFilteredResource<Project>(FirstClassResource.project)
  })
  filteredLayers = $derived.by(() => {
    this.state.resources.layer
    this.state.filters.layer
    return this.getFilteredResource<Layer>(FirstClassResource.layer)
  }) as Layer[]
  filteredFeatures = $derived.by(() => {
    this.state.resources.feature
    this.state.filters.feature
    return this.getFilteredResource<Feature>(FirstClassResource.feature)
  })

  // PRISM RELATIONS

  getPrism = (resource: FirstClassResource): Id[] => {
    return this.state.prisms[resource as ResourceTypeWithChildren]
  }

  isPrism = (resource: FirstClassResource, id: Id): boolean => {
    return this.state.prisms[resource as ResourceTypeWithChildren]?.includes(id)
  }

  // Helper method to fetch resource by ID with cache miss handling
  private fetchResourceById = async (resource: FirstClassResource, ref: Id) => {
    if (!ref || ref === 'undefined') {
      return undefined
    }

    const refKey = ResourceRefKey[resource as keyof typeof ResourceRefKey]

    try {
      const response = await fetch(
        `/api/${ResourcePath[resource]}/${ref}${refKey === 'code' ? '?byId=true' : ''}`,
      )
      if (!response.ok) return undefined
      return await response.json()
    } catch {
      return undefined
    }
  }

  getOrganisationById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Organisation | undefined> => {
    // Check cache first
    let org = this.cache.organisation.get(id)
    if (org) return org

    if (fetchOnCacheMiss) {
      org = await this.fetchResourceById(FirstClassResource.organisation, id)
      if (org) {
        this.cache.organisation.set(id, org)
        return org
      }
    }

    return undefined
  }

  getProjectById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Project | undefined> => {
    // Check cache first
    let project = this.cache.project.get(id)
    if (project) return project

    if (fetchOnCacheMiss) {
      project = await this.fetchResourceById(FirstClassResource.project, id)
      if (project) {
        this.cache.project.set(id, project)
        return project
      }
    }

    return undefined
  }

  getLayerById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Layer | undefined> => {
    // Check cache first
    let layer = this.cache.layer.get(id)
    if (layer) return layer

    if (fetchOnCacheMiss) {
      layer = await this.fetchResourceById(FirstClassResource.layer, id)
      if (layer) {
        this.cache.layer.set(id, layer)
        return layer
      }
    }

    return undefined
  }

  getFeatureById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<FeatureFromCollection | Feature | undefined> => {
    // Check cache first
    let feature = this.cache.feature.get(id)
    if (feature) return feature

    if (fetchOnCacheMiss) {
      feature = await this.fetchResourceById(FirstClassResource.feature, id)
      if (feature) {
        this.cache.feature.set(id, feature)
        this.addFeatureToMap(feature as Feature)
        return feature
      }
    }

    return undefined
  }

  /**
   * Sets a feature in the cache and adds it to the Feature SvelteMap.
   * @remarks This is used to update the cache with the Entity API response,
   * instead of the FeatureFromCollection which is loaded and cached by default.
   * @param feature - The feature to set in the cache
   */
  setFeatureById = (feature: Feature) => {
    this.cache.feature.set(feature.id, feature)
    this.addFeatureToMap(feature)
  }

  getTaskById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Task | undefined> => {
    // Check cache first
    let task = this.cache.task.get(id)
    if (task) return task

    if (fetchOnCacheMiss) {
      task = await this.fetchResourceById(FirstClassResource.task, id)
      if (task) {
        this.cache.task.set(id, task)
        return task
      }
    }

    return undefined
  }

  getHubById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Hub | undefined> => {
    // Check cache first
    let hub = this.cache.hub.get(id)
    if (hub) return hub

    if (fetchOnCacheMiss) {
      hub = await this.fetchResourceById(FirstClassResource.hub, id)
      if (hub) {
        this.cache.hub.set(id, hub)
        return hub
      }
    }

    return undefined
  }

  getPropertyById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Property | undefined> => {
    // Check cache first
    const property = this.cache.property.get(id)
    if (property) return property

    if (fetchOnCacheMiss) {
      // Properties don't have their own API endpoint, they come with projects
      // For now, return undefined if not cached
      return undefined
    }

    return undefined
  }

  getUserByUsername = async (username: string): Promise<UserProfile | undefined> => {
    const user = this.cache.user.get(username)
    if (user) return user

    const response = await this.fetchResourceById(FirstClassResource.user, username)
    if (response) {
      this.cache.user.set(username, response)
      return response
    }

    return undefined
  }

  // Helper method to get visible classifier properties for a layer
  getClassifierPropertiesForLayer = async (layer: Layer): Promise<Property[]> => {
    if (!layer.properties) return []

    // Get Properties associated with LayerProperties
    const properties = layer.properties
      .filter(lp => lp.isVisible !== false)
      .map(lp => this.cache.property.get(lp.propertyId!))

    // Filter classifiers then sort by rank
    return sortProperties(
      properties
        .filter(
          (prop): prop is Property => prop !== undefined && prop.type === 'classifier',
        )
        .map(p => ({ property: p })),
    ).map(item => item.property!)
  }

  getResourceById = async (
    resource: FirstClassResource,
    id: Id,
  ): Promise<Resource | undefined> => {
    switch (resource) {
      case FirstClassResource.organisation:
        return await this.getOrganisationById(id)
      case FirstClassResource.project:
        return await this.getProjectById(id)
      case FirstClassResource.layer:
        return await this.getLayerById(id)
      case FirstClassResource.feature:
        return await this.getFeatureById(id)
      case FirstClassResource.task:
        return await this.getTaskById(id)
      case FirstClassResource.hub:
        return await this.getHubById(id)
    }
  }

  getResourceByRef = async (
    resource: FirstClassResource,
    ref: Id | Code,
  ): Promise<Resource | undefined> => {
    switch (resource) {
      case FirstClassResource.organisation:
        return await this.getOrganisationById(
          this.getOrganisationIdByCode(ref as Code)! as Id,
        )
      case FirstClassResource.project:
        return await this.getProjectById(this.getProjectIdByCode(ref as Code)! as Id)
      case FirstClassResource.layer:
        return await this.getLayerById(ref as Id)
      case FirstClassResource.feature:
        return await this.getFeatureById(ref as Id)
      case FirstClassResource.task:
        return await this.getTaskById(ref as Id)
      case FirstClassResource.hub:
        return await this.getHubById(this.getHubIdByCode(ref as Code)! as Id)
    }
  }

  // ================================================
  // MODE METHODS
  // ================================================

  setLayoutMode = (mode: LayoutMode) => {
    const resourceType = this.getActiveResourceType()
    if (resourceType) {
      this.state.ui.layoutMode[resourceType] = mode
    }
  }

  setControlMode = (mode: ControlMode) => {
    const resourceType = this.getActiveResourceType()
    if (resourceType) {
      this.state.ui.controlMode[resourceType] = mode
    }
  }

  // ================================================
  // HIERARCHY METHODS
  // ================================================

  getHierarchyForTask = async (task: Task): Promise<ResourceContext> => {
    const feature = await this.getFeatureById(task.featureId as Id)
    if (!feature)
      return {
        feature: undefined,
        layer: undefined,
        project: undefined,
        organisation: undefined,
      }
    return await this.getHierarchy(feature)
  }

  // Synchronous version that uses cache only (for UI components)
  getHierarchySync = (
    resource: Feature | Layer | Project | Organisation | Task,
  ): ResourceContext => {
    // Determine what type of resource we have and build hierarchy accordingly
    let layer: Layer | undefined
    let project: Project | undefined
    let organisation: Organisation | undefined

    if ('layerId' in resource) {
      // Feature or Task - get its layer, then project, then organisation from cache
      layer = this.cache.layer.get(resource.layerId)
      if (layer) {
        project = this.cache.project.get(layer.projectId)
        if (project) {
          organisation = this.cache.organisation.get(project.organisationId)
        }
      }
    } else if ('projectId' in resource) {
      // Layer - use itself, get its project, then organisation from cache
      layer = resource as Layer
      project = this.cache.project.get(layer.projectId)
      if (project) {
        organisation = this.cache.organisation.get(project.organisationId)
      }
    } else if ('organisationId' in resource) {
      // Project - use itself, get its organisation from cache
      project = resource as Project
      organisation = this.cache.organisation.get(project.organisationId)
    } else {
      // Organisation - use itself
      organisation = resource as Organisation
    }

    return {
      feature: 'layerId' in resource ? (resource as Feature) : undefined,
      layer,
      project,
      organisation,
    }
  }

  getHierarchy = async (
    resource:
      | FeatureFromCollection
      | Feature
      | Layer
      | Project
      | Organisation
      | Task
      | Image,
  ): Promise<ResourceContext> => {
    const featurePromise =
      'featureId' in resource && resource.featureId
        ? this.getFeatureById(resource.featureId).then(f => f as FeatureFromCollection)
        : 'layerId' in resource
          ? Promise.resolve(resource as FeatureFromCollection)
          : Promise.resolve(undefined)

    const layerPromise =
      'layerId' in resource && resource.layerId
        ? this.getLayerById(resource.layerId)
        : 'projectId' in resource
          ? Promise.resolve(resource as Layer)
          : featurePromise.then(f => (f ? this.getLayerById(f.layerId) : undefined))

    const projectPromise =
      'projectId' in resource && resource.projectId
        ? this.getProjectById(resource.projectId)
        : 'organisationId' in resource
          ? Promise.resolve(resource as Project)
          : layerPromise.then(l => (l ? this.getProjectById(l.projectId) : undefined))

    const organisationPromise =
      'organisationId' in resource && resource.organisationId
        ? this.getOrganisationById(resource.organisationId)
        : !('featureId' in resource) &&
            !('layerId' in resource) &&
            !('projectId' in resource) &&
            !('organisationId' in resource)
          ? Promise.resolve(resource as Organisation)
          : projectPromise.then(p =>
              p ? this.getOrganisationById(p.organisationId) : undefined,
            )

    const [feature, layer, project, organisation] = await Promise.all([
      featurePromise,
      layerPromise,
      projectPromise,
      organisationPromise,
    ])

    return {
      feature,
      layer,
      project,
      organisation,
    }
  }

  // ================================================
  // COUNT METHODS
  // ================================================

  // COUNT METHODS
  getOrganisationCount = (): number => this.state.resources.organisation.length

  getOrganisationProjectCount = (organisationId: Id): number =>
    this.state.resources.project.filter(p => p.organisationId === organisationId).length

  getProjectLayerCount = (projectId: Id): number =>
    this.state.resources.layer.filter(l => l.projectId === projectId).length

  // CONTEXTUAL NAME METHODS
  getContextualOrganisationName = (
    organisation: Organisation,
    hideIfOnly: boolean = true,
  ): string | null => {
    const projectCount = this.getOrganisationProjectCount(organisation.id)
    if (hideIfOnly && projectCount === 1) {
      return null
    }
    return getI18n(organisation, 'nameShort', this.getUserPreferences())
  }

  getContextualProjectName = (
    project?: Project,
    hideIfOnly: boolean = true,
  ): string | null => {
    if (!project?.organisationId) return null
    const organisationProjectCount = this.getOrganisationProjectCount(
      project.organisationId,
    )
    if (hideIfOnly && organisationProjectCount === 1) {
      return null
    }
    return (
      getI18n(project, 'nameShort', this.getUserPreferences()) ||
      getI18n(project, 'name', this.getUserPreferences())
    )
  }

  getContextualLayerName = (
    layer: Layer,
    hideIfOnly: boolean = true,
  ): string | null => {
    const projectLayerCount = this.getProjectLayerCount(layer.projectId)
    if (hideIfOnly && projectLayerCount === 1) {
      return null
    }
    return (
      getI18n(layer, 'nameShort', this.getUserPreferences()) ||
      getI18n(layer, 'name', this.getUserPreferences())
    )
  }

  getContextualFeatureName = (feature: FeatureFromCollection): string | null => {
    return getI18n(feature, 'title', this.getUserPreferences())
  }

  // FEATURE COLLECTIONS

  // Features, given the selected Neighbourhoods (or all if none)
  getFeatureIdsForNeighbourhoods = (): Id[] => {
    if (this.placeCtx.neighbourhoodFilterCount === 0) {
      return Array.from(this.features.keys())
    }
    return this.placeCtx.getFeaturesForFilteredNeighbourhoods()
  }

  getFeatureIdsForProperties = (): Id[] => {
    return getFeatureIdsForProperties(this)
  }

  // Features, given the selected Neighbourhoods and Properties
  getVisibleFeatureIds = (): Id[] => {
    // If no layers are selects, return none.
    if (this.state.prisms.layer.length === 0) {
      return []
    }
    return Array.from(
      new Set(this.featuresForNeighbourhoods).intersection(
        new Set(this.featuresForProperties),
      ),
    )
  }

  // Features (for Active Layers) that are on the user's wishlist
  getWishlistedFeatureIds = (): Id[] => {
    return this.state.userFeatures?.wishlisted?.map(wl => wl.featureId!) || []
  }

  // Features (for Active Layers) that the user has visited
  getVisitedFeatureIds = (): Id[] => {
    return this.state.userFeatures?.visited?.map(wl => wl.featureId!) || []
  }

  getWishlistUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures?.wishlisted || []
  }

  getVisitedUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures?.visited || []
  }

  // Features Collection -- Subsets

  getActiveCollection = (): ActiveCollection => this.state.active.collection

  setActiveCollection = (
    collection: ActiveCollection,
    options: {
      activeFeatureId?: string
      focus?: boolean
      focusFeature?: boolean
      highlight?: boolean
      openCard?: boolean
      openCardDelay?: number
      isCardOpen?: boolean
      navOptions?: Record<string, any>
    },
  ) => {
    const optionsWithDefaults = {
      highlight: true,
      focus: true,
      focusFeature: true,
      openCard: true,
      openCardDelay: 0,
      ...options,
    }
    this.state.active.collection = collection

    // Handle feature activation
    this.postActiveCollectionMutation(optionsWithDefaults)
  }

  private postActiveCollectionMutation = (options: {
    activeFeatureId?: string
    highlight?: boolean
    focus?: boolean
    focusFeature?: boolean
    openCard?: boolean
    openCardDelay?: number
    isCardOpen?: boolean
    navOptions?: Record<string, any>
  }) => {
    const optionsWithDefaults = {
      highlight: true,
      focus: true,
      focusFeature: true,
      openCard: true,
      openCardDelay: 0,
      ...options,
    }
    const collection = this.state.active.collection
    if (!collection?.items.length) return

    if (options.highlight) {
      this.highlightActiveCollection({ focus: optionsWithDefaults.focus })
    }

    // Determine which feature to activate, default to first
    let featureIdToActivate: string | null = collection.items[0].id

    if (options.activeFeatureId) {
      // Check if the specific feature exists in the collection
      const featureExists = collection.items.some(
        item => item.id === optionsWithDefaults.activeFeatureId,
      )
      if (featureExists) {
        featureIdToActivate = optionsWithDefaults.activeFeatureId || null
      } else {
        console.error(
          'Feature not found in collection',
          optionsWithDefaults.activeFeatureId,
        )
      }
    }

    if (featureIdToActivate) {
      this.setActiveFeature(featureIdToActivate, {
        focus: optionsWithDefaults.focusFeature,
        openCard: optionsWithDefaults.openCard,
        openCardDelay: optionsWithDefaults.openCardDelay,
        isCardOpen: optionsWithDefaults.isCardOpen,
        navOptions: optionsWithDefaults.navOptions,
      })
    }
  }

  resetActiveCollection = (): void => {
    // Remove "highlighted" class from all features
    this.unhighlightAllFeatures()
    // Reset active collection
    this.state.active.collection = null
    // Remove 'active' class from the active feature
    this.state.active.feature?.id &&
      removeMarkerClass(this, this.state.active.feature.id)
    // Reset active feature
    this.state.active.feature = null
  }

  getActiveFeature = (): FeatureFromCollection | Feature | null =>
    this.state.active.feature

  setActiveFeature = (
    featureId: Id,
    options: {
      focus?: boolean
      openCard?: boolean | null
      openCardDelay?: number
      isCardOpen?: boolean
      navOptions?: Record<string, any>
    },
  ) => {
    const optionsWithDefaults = {
      focus: true,
      openCard: true,
      openCardDelay: 0,
      ...options,
    }
    // Pre-mutation: cleanup from previous feature
    this.preActiveFeatureMutation()

    // Set active state to new feature
    this.state.active.feature = this.features.get(featureId)!

    // Post-mutation: setup new feature
    this.postActiveFeatureMutation(featureId, optionsWithDefaults)
  }

  private preActiveFeatureMutation = () => {
    // Remove active state from previous feature
    this.isTransitioning = true
    if (this.state.active.feature) {
      removeMarkerClass(this, this.state.active.feature.id)
    }
  }

  private postActiveFeatureMutation = (
    featureId: Id,
    options: {
      focus?: boolean
      openCard?: boolean | null
      openCardDelay?: number
      isCardOpen?: boolean
      navOptions?: Record<string, any>
    },
  ) => {
    const optionsWithDefaults = {
      focus: true,
      openCard: true,
      openCardDelay: 0,
      ...options,
    }
    // TODO : Add "active" class to the feature on the map
    addMarkerClass(this, featureId)

    if (optionsWithDefaults.focus || optionsWithDefaults.openCard) {
      if (!optionsWithDefaults.isCardOpen && optionsWithDefaults.openCard) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('OmniCtx.openCard'))
        }, optionsWithDefaults.openCardDelay)
      }
      navigate(FirstClassResource.feature, featureId, optionsWithDefaults.navOptions)
    }
    // Reset transition state
    setTimeout(() => {
      this.isTransitioning = false
    }, 2000)
  }

  highlightActiveCollection = (options: { focus: boolean } = { focus: false }) => {
    // Remove "highlighted" class from all features
    this.unhighlightAllFeatures()
    // Add "highlighted" class to all features in the active collection
    const features = this.getActiveCollection()?.items || []
    if (features.length > 0) {
      features.forEach(f => {
        addMarkerClass(this, f.id, 'highlighted')
      })
    }
    if (options.focus) {
      this.zoomToActiveCollection()
    }
  }

  unhighlightAllFeatures = (): void => {
    // Remove "highlighted" class from all features
    this.state.resources.feature.forEach(f => {
      removeMarkerClass(this, f.id, 'highlighted')
    })
  }

  // NAVIGATION METHODS

  getHorizontalOffset = (): number => {
    // Return 0 on mobile
    if (isMobile()) {
      return 0
    }

    // Check if any left panels are open using PanelLeft enum
    const leftPanelOpen = this.isLeftPanelOpen()

    // Check if any right panels are open using PanelRight enum
    const rightPanelOpen = this.isRightPanelOpen()

    // Calculate offset based on panel state
    if (leftPanelOpen && rightPanelOpen) {
      return 0 // Both panels open, center the content
    } else if (leftPanelOpen) {
      return PANEL_WIDTH / 2 // Left panel open, shift right
    } else if (rightPanelOpen) {
      return -PANEL_WIDTH / 2 // Right panel open, shift left
    } else {
      return 0 // No panels open
    }
  }

  // Helper methods for panel state
  isLeftPanelOpen = (): boolean => {
    return Object.values(PanelLeft).some(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  isRightPanelOpen = (): boolean => {
    return Object.values(PanelRight).some(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  getOpenLeftPanels = (): PanelLeft[] => {
    return Object.values(PanelLeft).filter(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  getOpenRightPanels = (): PanelRight[] => {
    return Object.values(PanelRight).filter(panel =>
      this.isPanelOpen(panel as unknown as Panel),
    )
  }

  isPanelOnLeft = (panel: Panel): boolean => {
    return Object.values(PanelLeft).includes(panel as unknown as PanelLeft)
  }

  isPanelOnRight = (panel: Panel): boolean => {
    return Object.values(PanelRight).includes(panel as unknown as PanelRight)
  }

  // MAP OPERATIONS -- REBOUNDING

  zoomToActiveCollection = (): void => {
    const features = this.getActiveCollection()?.items || []
    this.zoomToFeatures(features)
  }

  zoomToActiveFeature = (): void => {
    const feature = this.getActiveFeature()
    if (!feature) return
    this.zoomToFeatures([feature])
  }

  zoomToFeatures = (features?: (FeatureFromCollection | Feature)[]): void => {
    if (!this.map) return

    // Use provided features or current state features
    const featuresToZoom = features || this.getFeaturesByIds(this.featuresVisible)
    if (!featuresToZoom.length) return

    // Create a FeatureCollection
    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: featuresToZoom.map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: f.properties,
      })) as GeoJSONFeature[],
    }
    const padding = isMobile()
      ? {
          top: 48,
          bottom: 50,
          right: 50,
          left: 50,
        }
      : {
          top: 150,
          bottom: 50,
          right: 50 + (this.isRightPanelOpen() ? PANEL_WIDTH / 2 : 0),
          left: 50 + (this.isLeftPanelOpen() ? PANEL_WIDTH / 2 : 0),
        }
    try {
      // Convert to WGS84 and get bounds
      const bounds = bbox(featureCollection)

      // @ts-expect-error
      this.map.cachedFitBounds(
        [
          [bounds[0], bounds[1]], // southwestern corner
          [bounds[2], bounds[3]], // northeastern corner
        ],
        {
          center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
          padding,
          maxZoom: 18,
          duration: 2500,
          run: true,
        },
      )
    } catch (error) {
      console.error('Error zooming to features:', error)
    }
  }

  zoomToCoordinates = (coordinates: [number, number][]): void => {
    if (!this.map) return

    // Create a FeatureCollection
    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: coordinates.map(c => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: c,
        },
        properties: {},
      })) as GeoJSONFeature[],
    }

    const bounds = bbox(featureCollection)

    // @ts-expect-error
    this.map.cachedFitBounds(
      [
        [bounds[0], bounds[1]], // southwestern corner
        [bounds[2], bounds[3]], // northeastern corner
      ],
      {
        center: { lon: (bounds[0] + bounds[2]) / 2, lat: (bounds[1] + bounds[3]) / 2 },
        padding: {
          top: 150,
          bottom: 150,
          right: 50,
          left: 50,
        },
        maxZoom: 20,
        duration: 2500,
        run: true,
      },
    )
  }

  // ═══════════════════════
  // REACTIVE FEATURE COLLECTIONS
  // ═══════════════════════

  // Efficiently update features map from current state.resources.feature
  private rebuildFeaturesMap = () => {
    const newFeatures = this.state.resources.feature
    const newFeatureIds = new Set(newFeatures.map(f => f.id))

    // Remove features that are no longer in the result set
    for (const [id] of this.featuresMap) {
      if (!newFeatureIds.has(id)) {
        this.featuresMap.delete(id)
      }
    }

    // Add new features or update existing ones
    newFeatures.forEach(feature => {
      this.featuresMap.set(feature.id, feature)
    })
  }

  addFeatureToMap = (feature: FeatureFromCollection | Feature) => {
    this.featuresMap.set(feature.id, feature)
  }

  // Public getter for features map
  get features(): SvelteMap<Id, FeatureFromCollection | Feature> {
    return this.featuresMap
  }

  // FEATURE COLLECTIONS -- FeatureIds

  // FeatureIds for Selected Neighbourhoods
  featuresForNeighbourhoods: Id[] = $derived(
    (this.placeCtx.state.contains.feature.neighbourhood &&
      this.placeCtx.state.filters.feature.neighbourhood.include &&
      this.getFeatureIdsForNeighbourhoods()) ||
      [],
  ) as Id[]

  // FeatureIds for Selected Properties
  featuresForProperties: Id[] = $derived(
    (this.featuresMap.size && this.getFeatureIdsForProperties()) || [],
  ) as Id[]

  // Intersection of Neighbourhoods and Properties featureIds
  featuresVisible: Id[] = $derived(this.getVisibleFeatureIds())
  // FeatureIds for Wishlisted Features
  featuresWishlisted: Id[] = $derived(this.getWishlistedFeatureIds()) as Id[]
  // FeatureIds for Visited Features
  featuresVisited: Id[] = $derived(this.getVisitedFeatureIds()) as Id[]

  // FEATURE COLLECTIONS -- Utils

  getFeaturesByIds = (ids: Id[]): (FeatureFromCollection | Feature)[] =>
    ids.map(id => this.features.get(id)).filter(f => f !== undefined)

  // FEATURE COLLECTIONS -- Convenience Methods

  getVisibleFeatures = (): (FeatureFromCollection | Feature)[] => {
    return this.getFeaturesByIds(this.featuresVisible)
  }

  getWishlistedFeatures = (): (FeatureFromCollection | Feature)[] => {
    return this.getFeaturesByIds(this.featuresWishlisted)
  }

  getVisitedFeatures = (): (FeatureFromCollection | Feature)[] => {
    return this.getFeaturesByIds(this.featuresVisited)
  }

  // Active Navigation State Methods

  setActiveResourceType = (resourceType: NavigableResource | false): void => {
    this.state.nav.resourceType = resourceType
  }

  setActiveResourceRef = (
    resourceRef: Id | false,
    resourceType?: NavigableResource | false,
  ): void => {
    if (resourceType) {
      this.setActiveResourceType(resourceType)
    }
    this.state.nav.resourceRef = resourceRef
  }

  setActiveFacet = (
    facet: FacetType | false,
    resourceRef?: Id | false,
    resourceType?: NavigableResource | false,
  ): void => {
    if (resourceRef) {
      this.setActiveResourceRef(resourceRef, resourceType)
    }
    this.state.nav.facet = facet
  }

  getActiveResourceType = (): NavigableResource | false => {
    return this.state.nav.resourceType
  }
  getActiveResourceRef = (): Id | false => {
    return this.state.nav.resourceRef
  }
  getActiveResourceId = (): Id | null => {
    const activeResourceType = this.getActiveResourceType()
    const resourceRef = this.getActiveResourceRef()
    if (typeof resourceRef === 'string') {
      if (activeResourceType == FirstClassResource.organisation) {
        return this.getOrganisationIdByCode(resourceRef as Code) ?? null
      } else if (activeResourceType == FirstClassResource.project) {
        return this.getProjectIdByCode(resourceRef as Code) ?? null
      } else if (activeResourceType == FirstClassResource.hub) {
        return this.getHubIdByCode(resourceRef as Code) ?? null
      } else {
        return resourceRef
      }
    }
    return null
  }
  getActiveFacet = (): FacetType | false => {
    return this.state.nav.facet
  }

  // Panel methods
  togglePanel = (panel: Panel, updateUrl: boolean = true): void => {
    const currentState = this.isPanelOpen(panel)

    // Close other panels on the same side first (without updating URL individually)
    if (this.isPanelOnLeft(panel)) {
      this.getOpenLeftPanels()
        .filter(p => p !== (panel as unknown as PanelLeft))
        .forEach(p => this.closePanel(p as unknown as Panel, false))
    } else if (this.isPanelOnRight(panel)) {
      this.getOpenRightPanels()
        .filter(p => p !== (panel as unknown as PanelRight))
        .forEach(p => this.closePanel(p as unknown as Panel, false))
    }

    if (window.innerWidth < DUAL_PANEL_MIN_WIDTH) {
      // Close all panels first, then toggle the target panel based on original state
      this.closeAllPanels(false)
      if (!currentState) {
        // Panel was closed, so open it
        this.openPanel(panel, false)
        if (!isMobile()) {
          this.focusPanel(this.isPanelOnLeft(panel) ? 'left' : 'right')
        }
      }
      // If panel was open, leave it closed (toggle behavior)
    } else {
      // Toggle the current panel
      if (currentState) {
        this.closePanel(panel, false)
      } else {
        this.openPanel(panel, false)
        if (!isMobile()) {
          this.focusPanel(this.isPanelOnLeft(panel) ? 'left' : 'right')
        }
      }
    }

    // Update URL once at the end with the final panel state (only if updateUrl is true)
    if (updateUrl && typeof window !== 'undefined') {
      const panelState = Object.fromEntries(
        Object.entries(this.state.panels).map(([key, value]) => [key, value.isOpen]),
      )
      updatePanelUrlParams(panelState, this)
    }
  }

  focusPanel = (position: 'left' | 'right'): void => {
    let panelElement = null
    setTimeout(() => {
      panelElement = document.getElementById(`${position}-panel`)
      const inputElement = panelElement?.querySelector('input')
      if (inputElement) {
        inputElement.focus()
      } else {
        panelElement?.focus()
      }
    }, 250)
  }

  closeLeftPanel = (): void => {
    this.getOpenLeftPanels().forEach((panel: PanelLeft) => {
      this.closePanel(panel as unknown as Panel, false)
    })
  }

  closeRightPanel = (): void => {
    this.getOpenRightPanels().forEach((panel: PanelRight) => {
      this.closePanel(panel as unknown as Panel, false)
    })
  }

  closeAllPanels = (updateUrl: boolean = true): void => {
    Object.keys(this.state.panels).forEach(panel => {
      this.closePanel(panel as unknown as Panel, false)
    })
    if (updateUrl && typeof window !== 'undefined') {
      const panelState = Object.fromEntries(
        Object.entries(this.state.panels).map(([key, value]) => [key, value.isOpen]),
      )
      updatePanelUrlParams(panelState, this)
    }
  }

  openPanel = (panel: Panel, updateUrl: boolean = true): void => {
    this.state.panels[panel].isOpen = true

    // Handle stateful parameters for specific panels
    if (updateUrl && typeof window !== 'undefined') {
      const panelState = Object.fromEntries(
        Object.entries(this.state.panels).map(([key, value]) => [key, value.isOpen]),
      )
      updatePanelUrlParams(panelState, this)
    }
  }

  closePanel = (panel: Panel, updateUrl: boolean = true): void => {
    this.state.panels[panel].isOpen = false
    if (updateUrl && typeof window !== 'undefined') {
      const panelState = Object.fromEntries(
        Object.entries(this.state.panels).map(([key, value]) => [key, value.isOpen]),
      )
      updatePanelUrlParams(panelState, this)
    }
  }

  isPanelOpen = (panel: Panel): boolean => {
    return this.state.panels[panel].isOpen ?? false
  }

  isPanelNarrow = (panel: Panel): boolean => {
    return (!this.isPanelOpenOrVisual(Panel.admin) && panel === Panel.admin) || false
  }

  // Visual-only panel methods for auto-hide behavior
  openPanelVisually = (panel: Panel): void => {
    this.state.panels[panel].isOpenVisually = true
  }

  closePanelVisually = (panel: Panel): void => {
    this.state.panels[panel].isOpenVisually = false
  }

  isPanelOpenVisually = (panel: Panel): boolean => {
    return this.state.panels[panel].isOpenVisually ?? false
  }

  isPanelOpenOrVisual = (panel: Panel): boolean => {
    return this.isPanelOpen(panel) || this.isPanelOpenVisually(panel)
  }

  // Helper method to open profile panel with username context
  setPanelCtx = (panel: Panel, key: string, value: string | undefined | null): void => {
    // Set username context if provided
    if (value && this.state.panels[panel].ctx) {
      ;(this.state.panels[panel].ctx as any)[key] = value
    }
  }

  // Refocus map on currently visible features
  zoomToAllVisibleFeatures = (): void => {
    const visibleFeatures = this.getVisibleFeatures()
    if (visibleFeatures.length > 0) {
      this.zoomToFeatures(visibleFeatures)
    }
  }

  // KEYDOWN HANDLERS
  registerKeydownHandlers = (): void => {
    document.addEventListener('keydown', this.handleKeydown)
  }

  unregisterKeydownHandlers = (): void => {
    document.removeEventListener('keydown', this.handleKeydown)
  }

  handleKeydown = (event: KeyboardEvent): void => {
    // Skip global keyboard shortcuts when any input element is focused
    const activeElement = document.activeElement
    if (
      activeElement &&
      (activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.getAttribute('contenteditable') === 'true')
    ) {
      return
    }

    let keyMatched = false

    if (event.key === '1') {
      if (this.isAdmin()) {
        this.togglePanel(Panel.admin)
      } else {
        if (this.hub?.isCore) {
          this.togglePanel(Panel.prisms)
        } else {
          this.togglePanel(Panel.hub)
        }
      }
      keyMatched = true
    } else if (event.key === '2') {
      if (this.isAdmin()) {
        this.togglePanel(Panel.settings)
      } else {
        this.togglePanel(Panel.filters)
      }
      keyMatched = true
    } else if (event.key === '3') {
      this.togglePanel(Panel.stars)
      keyMatched = true
    } else if (event.key === '4') {
      this.togglePanel(Panel.settings)
      keyMatched = true
    } else if (event.key === '5') {
      // If no username param is set, use the user's username
      this.setPanelCtx(
        Panel.profile,
        'username',
        getUrlParam('username') || this.getUser()?.username,
      )
      this.togglePanel(Panel.profile)
      keyMatched = true
    }

    if (keyMatched) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  // NEW FEATURE

  setNewFeatureMode = (mode: NewFeatureMode | null): void => {
    this.newFeatureMode = mode
  }

  resetNewFeatureMode = (): void => {
    this.newFeatureMode = null
  }

  getNewFeatureMode = (): NewFeatureMode | null => {
    return this.newFeatureMode
  }

  setNewFeature = (newFeature: DeepPartial<NewFeatureTask>): void => {
    // Initialize with proper locale structure for all required locales
    if (newFeature.feature && !newFeature.feature.i18n) {
      const requiredLocales = ['en', 'zh-hant', 'zh-hans']

      newFeature.feature.i18n = {}
      requiredLocales.forEach(locale => {
        newFeature.feature!.i18n![locale as Locale] = {
          ...newFeature.feature!.i18n![locale as Locale],
          locale: locale,
          title: undefined,
          description: undefined,
        } as any
      })
    }
    this.newFeature = newFeature
  }

  updateNewFeature = (newFeature: DeepPartial<NewFeatureTask>): void => {
    this.newFeature = {
      ...this.newFeature,
      ...newFeature,
      feature: {
        ...this.newFeature?.feature,
        ...newFeature.feature,
      },
    }
  }

  updateNewFeatureValue = (key: keyof NewFeatureTask['feature'], value: any): void => {
    this.newFeature = {
      ...this.newFeature,
      feature: { ...this.newFeature?.feature, [key]: value },
    }
  }

  updateNewFeatureValueI18n = (
    key: FeatureI18nFieldKeys,
    value: any,
    locale: Locale = getLocale(),
  ): void => {
    this.newFeature = {
      ...this.newFeature,
      feature: {
        ...this.newFeature?.feature,
        i18n: {
          ...this.newFeature?.feature?.i18n,
          [locale]: {
            ...this.newFeature?.feature?.i18n?.[locale],
            [key]: value,
          },
        } as any,
      },
    }
  }

  getNewFeature = (): DeepPartial<NewFeatureTask> | null => {
    return this.newFeature
  }

  resetNewFeature = () => {
    this.newFeature = null
  }

  // USER DATA
  setUser = async (user: CurrentUser | SessionUser | null) => {
    this.user = user
    this.postUserMutation()
  }

  getUser = (): UserProfile | CurrentUser | SessionUser | null => {
    return this.user
  }

  resetUser = () => {
    this.user = null
  }

  getUserPreferences = (withDefaults: boolean = true): UserPreferences => {
    // If no user, return default preferences
    if (!this.user) {
      return {
        fallbackLocales: getFallbackLocales(getLocale()) as Locale[],
        allowMachineTranslation: false,
        preferFallbackInCurrentLocale: false,
        isTranslateButtonVisible: true,
        admin: {
          isAdminMapCollapsed: false,
          isPrimaryPanelCollapsed: false,
          isPrimaryPanelAutoHide: false,
        },
      }
    }

    return withDefaults
      ? {
          fallbackLocales:
            ((this.user as CurrentUser).preferences.fallbackLocales as Locale[]) ??
            (getFallbackLocales(getLocale()) as Locale[]),
          allowMachineTranslation:
            (this.user as CurrentUser).preferences.allowMachineTranslation ?? false,
          preferFallbackInCurrentLocale:
            (this.user as CurrentUser).preferences.preferFallbackInCurrentLocale ??
            false,
          isTranslateButtonVisible:
            (this.user as CurrentUser).preferences.isTranslateButtonVisible ?? true,
          admin: {
            isAdminMapCollapsed:
              (this.user as CurrentUser).preferences.admin?.isAdminMapCollapsed ??
              false,
            isPrimaryPanelCollapsed:
              (this.user as CurrentUser).preferences.admin?.isPrimaryPanelCollapsed ??
              false,
            isPrimaryPanelAutoHide:
              (this.user as CurrentUser).preferences.admin?.isPrimaryPanelAutoHide ??
              false,
          },
        }
      : ((this.user as CurrentUser).preferences as UserPreferences)
  }

  updateUserPreferences = (preferences: UserPreferences) => {
    ;(this.user as CurrentUser).preferences = {
      ...(this.user as CurrentUser).preferences,
      ...preferences,
      admin: {
        ...(this.user as CurrentUser).preferences.admin,
        ...preferences.admin,
      },
    }
  }

  setLocale = async (locale: Locale) => {
    ;(this.user as CurrentUser).locale = locale
    await updateLocale((this.user as CurrentUser).id, locale)
    // I18N : Update Paraglide's locale, triggers a page reload
    setLocale(locale)
  }

  setFallbackLocales = (localeCode: Locale, checked: boolean) => {
    const currentFallbacks =
      (this.user as CurrentUser).preferences.fallbackLocales || []
    if (checked) {
      if (!currentFallbacks.includes(localeCode)) {
        ;(this.user as CurrentUser).preferences.fallbackLocales = [
          ...currentFallbacks,
          localeCode,
        ]
      }
    } else {
      ;(this.user as CurrentUser).preferences.fallbackLocales = currentFallbacks.filter(
        lc => lc !== localeCode,
      )
    }
    debouncedUpdateUserPreferences(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).preferences as UserPreferences,
    )
  }

  setAdvancedFeature = (code: keyof UserPreferences, value: boolean) => {
    ;((this.user as CurrentUser).preferences[code] as boolean) = value
    debouncedUpdateUserPreferences(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).preferences as UserPreferences,
    )
  }

  setUserAttribution = async (
    attribution: string,
    onSuccess?: (attribution: string) => void,
    onError?: (error: any) => void,
  ) => {
    ;(this.user as CurrentUser).attribution = attribution
    await debouncedUpdateUserAttribution(
      (this.user as CurrentUser).id,
      attribution,
      onSuccess,
      onError,
    )
  }

  setUserDisplayUsername = async (
    displayUsername: string,
    onSuccess?: (displayUsername: string) => void,
    onError?: (error: any) => void,
  ) => {
    if (!this.user) return

    // Import validation and conversion functions
    const { validateDisplayUsername, makeUrlSafeUsername } = await import(
      '$lib/utils/username'
    )

    // Validate before proceeding
    if (!validateDisplayUsername(displayUsername)) {
      onError?.(
        new Error(
          'Invalid display username: spaces and special characters are not allowed',
        ),
      )
      return
    }

    // Create URL-safe username (matching server logic)
    const urlSafeUsername = makeUrlSafeUsername(displayUsername)

    // Update user state immediately for optimistic updates (match what server will return)
    this.setUser({
      ...this.user,
      displayUsername,
      username: urlSafeUsername,
    } as CurrentUser)

    // Use generic debounced update function directly
    const { debouncedUpdateUser } = await import('$lib/client/services/user')

    await debouncedUpdateUser(
      (this.user as CurrentUser).id,
      { displayUsername },
      {
        delay: 300,
        timerKey: 'displayUsername',
        onSuccess: () => onSuccess?.(displayUsername),
        onError,
      },
    )
  }

  getUserLayers = (): UserLayer[] => {
    return (this.user as CurrentUser).userLayers
  }

  getUserLayerIds = (): string[] => {
    return (this.user as CurrentUser).userLayers.map(
      (layer: UserLayer) => layer.layerId,
    )
  }

  setUserLayer = (layerId: string, checked: boolean) => {
    const currentUserLayers = (this.user as CurrentUser).userLayers || []
    if (checked) {
      if (!currentUserLayers.some(ul => ul.layerId === layerId)) {
        ;(this.user as CurrentUser).userLayers = [
          ...currentUserLayers,
          {
            userId: (this.user as CurrentUser).id,
            layerId,
            isVisibleOnLoad: true,
          },
        ]
      }
    } else {
      ;(this.user as CurrentUser).userLayers = currentUserLayers.filter(
        ul => ul.layerId !== layerId,
      )
    }
    debouncedUpdateUserLayers(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).userLayers,
    )
  }

  setExperimental = (featureCode: keyof UserExperimental, checked: boolean) => {
    const currentExperimental = (this.user as CurrentUser).experimental || {}
    ;(this.user as CurrentUser).experimental = {
      ...currentExperimental,
      [featureCode]: checked,
    }
    debouncedUpdateUserExperimental(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).experimental as UserExperimental,
    )
  }

  /**
   * Clears all images arrays from the feature cache
   * This forces fresh API calls for image data
   */
  clearFeatureCacheImages = (): void => {
    for (const [featureId, feature] of this.cache.feature) {
      if (feature && typeof feature === 'object' && 'images' in feature) {
        // Set images to undefined to force fresh API fetch
        ;(feature as any).images = undefined
      }
    }
  }

  // Clear all cache maps (for actual data reset scenarios)
  clearAllCaches = (): void => {
    this.cache.organisation.clear()
    this.cache.project.clear()
    this.cache.layer.clear()
    this.cache.feature.clear()
    this.cache.task.clear()
    this.cache.hub.clear()
    this.cache.property.clear()
    this.cache.image.clear()
    this.cache.user.clear()
    this.featuresMap.clear()
    this.organisationCodeToId.clear()
    this.projectCodeToId.clear()
    this.hubCodeToId.clear()
  }

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetOrganisations = async () => {
    this.state.prisms.organisation = []
    await this.refreshOrganisations()
  }

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetProjects = async () => {
    this.state.prisms.project = []
    await this.refreshProjects()
  }

  // Force refresh methods for when you actually need to invalidate and fetch fresh data
  forceRefreshOrganisations = async () => {
    this.state.prisms.organisation = []
    await this.invalidateAndRefresh(FirstClassResource.organisation)
  }

  forceRefreshProjects = async () => {
    this.state.prisms.project = []
    await this.invalidateAndRefresh(FirstClassResource.project)
  }

  // TODO : Clear the Omnibar when a layer is toggled
  addLayer = (id: Id) => {
    this.state.prisms.layer.push(id)
    this.postLayerMutation()
  }

  removeLayer = (id: Id) => {
    this.state.prisms.layer = this.state.prisms.layer.filter(l => l !== id)
    this.postLayerMutation()
  }

  setLayers = (layers: Id[]) => {
    this.state.prisms.layer = layers
    this.postLayerMutation()
  }

  resetLayers = () => {
    this.state.prisms.layer = []
    this.postLayerMutation()
  }

  initialiseCategoricalPropertyFilters = (layerId: Id) => {
    const layer = this.state.resources.layer.find(l => l.id === layerId)
    if (!layer) {
      return
    }

    const project = this.state.resources.project.find(p => p.id === layer.projectId)
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
    if (!this.state.filters.feature.properties![layerId]) {
      this.state.filters.feature.properties![layerId] = {}
    }

    const layerFilters = this.state.filters.feature.properties![layerId]

    // Initialize each classifier property with an empty array if not already set
    classifierProperties.forEach((property: Property) => {
      if (!(property.key in layerFilters)) {
        ;(layerFilters as any)[property.key] = []
      }
    })
  }

  initialiseRangePropertyFilter = (layerId: Id) => {
    const layer = this.state.resources.layer.find(l => l.id === layerId)
    if (!layer) {
      return
    }

    const project = this.state.resources.project.find(p => p.id === layer.projectId)
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
    if (!this.state.filters.feature.properties![layerId]) {
      this.state.filters.feature.properties![layerId] = {}
    }

    const layerFilters = this.state.filters.feature.properties![layerId]

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

        ;(layerFilters as any)[property.key] = filterConfig
      }
    })
  }

  // ═══════════════════════
  //
  // ═══════════════════════
  setHub = (hub: HubOptsExtended) => {
    this.hub = hub
  }

  resetHub = () => {
    this.hub = null
  }

  // ═══════════════════════
  // CACHE UPDATE UTILITIES
  // ═══════════════════════

  // Generic map sync - only add missing items and remove stale ones (no overwrites)
  private syncMap = <K, V, T>(
    map: Map<K, V>,
    newItems: T[],
    getKey: (item: T) => K,
    getValue?: (item: T) => V,
  ): void => {
    const newKeys = new Set(newItems.map(getKey))

    // Remove entries that are no longer in the result set
    for (const [key] of map) {
      if (!newKeys.has(key)) {
        map.delete(key)
      }
    }

    // Only add entries that aren't already present
    newItems.forEach(item => {
      const key = getKey(item)
      if (!map.has(key)) {
        map.set(key, getValue ? getValue(item) : (item as unknown as V))
      }
    })
  }

  // Convenience methods using the generic syncMap
  private syncCacheMap = <T extends { id: Id }>(
    cache: Map<Id, T>,
    newItems: T[],
  ): void => {
    this.syncMap(cache, newItems, item => item.id)
  }

  private syncCodeToIdMap = <T extends { id: Id; code: Code }>(
    codeMap: Map<Code, Id>,
    newItems: T[],
  ): void => {
    this.syncMap(
      codeMap,
      newItems,
      item => item.code,
      item => item.id,
    )
  }

  addToCache = (resource: FirstClassResource, id: Id, item: any): void => {
    this.cache[resource].set(id, item)
  }

  // Header management methods
  setHeaderState = (headerState: Partial<typeof this.state.header>): void => {
    this.state.header = { ...this.state.header, ...headerState }
  }

  setFormContext = (formCtx: any): void => {
    this.formCtx = formCtx
  }

  clearFormContext = (): void => {
    this.formCtx = null
  }

  // Derived values for header
  isIndex = $derived(this.state.nav.resourceRef === false)
  headerResourceType = $derived(this.state.nav.resourceType)
  headerResourceRef = $derived(this.state.nav.resourceRef)

  getResourceByIdSync = (
    resource: FirstClassResource,
    id: Id,
  ): Resource | undefined => {
    switch (resource) {
      case FirstClassResource.organisation:
        return this.cache.organisation.get(id)
      case FirstClassResource.project:
        return this.cache.project.get(id)
      case FirstClassResource.layer:
        return this.cache.layer.get(id)
      case FirstClassResource.feature:
        return this.features.get(id)
      case FirstClassResource.task:
        return this.cache.task.get(id)
      case FirstClassResource.hub:
        return this.cache.hub.get(id)
    }
  }

  getResourceByRefSync = (
    resource: FirstClassResource,
    ref: Id | Code,
  ): Resource | undefined => {
    switch (resource) {
      case FirstClassResource.organisation:
        return this.cache.organisation.get(
          this.getOrganisationIdByCode(ref as Code) ?? (ref as Id),
        )
      case FirstClassResource.project:
        return this.cache.project.get(
          this.getProjectIdByCode(ref as Code) ?? (ref as Id),
        )
      case FirstClassResource.layer:
        return this.cache.layer.get(ref as Id)
      case FirstClassResource.feature:
        return this.features.get(ref as Id)
      case FirstClassResource.task:
        return this.cache.task.get(ref as Id)
      case FirstClassResource.hub:
        return this.cache.hub.get(this.getHubIdByCode(ref as Code) ?? (ref as Id))
    }
  }
}
export const APPCTX_KEY = Symbol('mapContext')

export const setAppCtx = (queryClient: QueryClient, user: SessionUser | null) => {
  const context = new AppCtx(queryClient, user)
  // Don't initialize immediately - let the session watcher handle it after mount
  return setContext(APPCTX_KEY, context)
}

export const getAppCtx = (): ReturnType<typeof setAppCtx> => getContext(APPCTX_KEY)
