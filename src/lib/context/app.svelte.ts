// DATA
import { QueryClient } from '@tanstack/svelte-query';
// NAVIGATION
import { goto } from '$app/navigation';
// GEO
import { bbox } from '@turf/bbox';
// I18N
import {
  getFallbackLocales,
  getLocale,
  setLocale,
  getI18n
} from '$lib/i18n';
// LIB
import { fetchOrThrow } from '$lib/index';
// SERVICES
import {
  debouncedUpdateUserAttribution,
  debouncedUpdateUserExperimental,
  debouncedUpdateUserLayers,
  debouncedUpdateUserPreferences,
  updateLocale
} from '$lib/client/services/user';
import {
  getFeatureIdsForNeighbourhoods,
  expandToSubNeighbourhoods,
} from '$lib/client/services/geospatial';
import { 
  getFeatureIdsForProperties, 
  sortProperties,
  updateNewFeatureProperty,
  updateNewFeatureI18nProperty
} from '$lib/client/services/property';
// CONTEXT
import { getContext, setContext } from 'svelte';
// SVELTE
import { SvelteMap } from 'svelte/reactivity';
// MARKERS
import { removeMarkerClass, addMarkerClass } from '$lib/map/markers';
// ENUMS
import { FirstClassResource, ResourcePath, ResourceRefKey } from '$lib/enums';
// TYPES
import type {
  Feature,
  Project,
  Layer,
  Organisation,
  Id,
  UserFeature,
  AppContextState,
  PanelState,
  ActiveCollection,
  Property,
  UserLayer,
  SessionUser,
  UserPreferences,
  Locale,
  CurrentUser,
  UserExperimental,
  DeepPartial,
  NewFeatureTask,
  FeatureProperty,
  FeaturePropertyI18nDB,
  ResourceTypeWithChildren,
  FeatureI18nFieldKeys,
  Task,
  Hub,
  Code,
  ResourceContext,
  Resource
} from '$lib/types';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { FeatureCollection, Feature as GeoJSONFeature } from 'geojson';
import { MOBILE_MAX_WIDTH } from '$lib/index';

export class AppCtx {
  // Maplibre Map instance
  map: MaplibreMap = $state()!;
  // Maplibre library instance (loaded globally)
  maplibre: any = $state(null);
  // Whether maplibre has been loaded
  isMaplibreLoaded: boolean = $state(false);
  // Tanstack Query Client instance
  queryClient: QueryClient;
  // User data (reactive)
  user: CurrentUser | SessionUser | null = $state(null);
  // Whether the map has been initialised
  isInitialised: boolean = $state(false);

  // Query map to store different query functions (can be overridden by AdminCtx)
  queryMap = new Map<
    FirstClassResource | 'userFeatures',
    {
      queryKey: () => any[];
      queryFn: () => Promise<any>;
    }
  >();

  // Cache for all resources
  cache = {
    organisation: new Map<Id, Organisation>(),
    project: new Map<Id, Project>(),
    layer: new Map<Id, Layer>(),
    feature: new Map<Id, Feature>(),
    task: new Map<Id, Task>(),
    hub: new Map<Id, Hub>(),
    property: new Map<Id, Property>()
  };

  // Features map for current state (rebuilt when state.resources.feature changes)
  private featuresMap = new SvelteMap<Id, Feature>();
  private organisationCodeToId = new Map<Code, Id>();
  private projectCodeToId = new Map<Code, Id>();
  private hubCodeToId = new Map<Code, Id>();

  // State
  state: AppContextState = $state({
    // Markers -- Which features are shown on the map
    markers: new Map(),
    // Active -- Which feature or collection is in focus on the map
    active: {
      feature: null,
      collection: null
    },
    // Filters -- Which neighbourhoods and properties being filtered for when showing features on the map
    filters: { neighbourhoods: [], properties: {} },
    // Prisms -- Which organisations, projects, and layers are pre-filtered when fetching features from the database
    prisms: { organisation: [], project: [], layer: [] },
    // Resources -- The resources fetched from the database (post prism-filtering, pre filters-filtering)
    resources: {
      organisation: [],
      project: [],
      layer: [],
      feature: [],
      task: [],
      hub: []
    },
    // User Features -- The user's wishlist and visited features
    userFeatures: {
      wishlisted: [],
      visited: []
    },
    // User Location -- The user's location
    userLocation: null,
    // ENHANCEMENT: Implement distancesFromUser
    // Distances from user -- The distances from the user to the features
    distancesFromUser: {},
    // Panels -- The panels that are open
    panels: {
      filters: false,
      maps: false,
      stars: false,
      settings: false
    }
  });

  // New Feature -- The new feature to be created
  newFeature: DeepPartial<NewFeatureTask> | null = $state(null);

  // Silly state to track if the map has been zoomed to a marker
  zoomToMarkerOnly: boolean = $state(false);

  // ═══════════════════════
  // QUERY KEYS
  // ═══════════════════════

  organisationsQueryKey = [FirstClassResource.organisation];
  projectsQueryKey = $derived([
    FirstClassResource.project,
    this.state.prisms.organisation
  ]);
  layersQueryKey = $derived([
    FirstClassResource.layer,
    this.state.prisms.organisation,
    this.state.prisms.project
  ]);
  featuresQueryKey = $derived([
    FirstClassResource.feature,
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.state.prisms.layer
  ]);
  propertiesQueryKey = $derived([
    'property',
    this.state.prisms.organisation,
    this.state.prisms.project
  ]);
  userFeaturesQueryKey = ['userFeatures'];
  userQueryKey = ['user'];

  // Constructor
  constructor(queryClient: QueryClient, user: SessionUser | null) {
    this.queryClient = queryClient;
    this.setUser(user);
    this.initializeQueryMap();
    // Note: keydown handlers are managed dynamically by the root layout
  }

  // Initialize default query map (can be overridden by AdminCtx)
  private initializeQueryMap = (): void => {
    this.queryMap.set(FirstClassResource.organisation, {
      queryKey: () => this.organisationsQueryKey,
      queryFn: () => this.organisationsQueryFn()
    });

    this.queryMap.set(FirstClassResource.project, {
      queryKey: () => this.projectsQueryKey,
      queryFn: () => this.projectsQueryFn()
    });

    this.queryMap.set(FirstClassResource.layer, {
      queryKey: () => this.layersQueryKey,
      queryFn: () => this.layersQueryFn()
    });

    this.queryMap.set(FirstClassResource.feature, {
      queryKey: () => this.featuresQueryKey,
      queryFn: () => this.featuresQueryFn()
    });

    // ADMIN ONLY
    this.queryMap.set(FirstClassResource.task, {
      queryKey: () => [FirstClassResource.task],
      queryFn: () => Promise.resolve([])
    });

    // ADMIN ONLY
    this.queryMap.set(FirstClassResource.hub, {
      queryKey: () => [FirstClassResource.hub],
      queryFn: () => Promise.resolve([])
    });

    // APP ONLY
    this.queryMap.set('userFeatures', {
      queryKey: () => this.userFeaturesQueryKey,
      queryFn: () => this.userFeaturesQueryFn()
    });

    // PROPERTIES
    this.queryMap.set(FirstClassResource.property, {
      queryKey: () => this.propertiesQueryKey,
      queryFn: () => this.propertiesQueryFn()
    });
  };

  init = async (userId: Id | null): Promise<void> => {
    // Only initialize if user is authenticated
    if (!userId) {
      // Initialize empty data structures for unauthenticated users
      this.state.resources.organisation = [];
      this.state.resources.project = [];
      this.state.resources.layer = [];
      this.state.resources.feature = [];
      this.state.resources.task = [];
      this.state.resources.hub = [];
      this.state.userFeatures = {
        wishlisted: [],
        visited: []
      };
      return;
    }

    // Use refreshOrganisations to trigger proper cascades and post-mutation logic
    await this.refreshOrganisations();

    // Initialize user data
    this.state.userFeatures = await this.queryClient
      .fetchQuery({
        queryKey: this.queryMap.get('userFeatures')!.queryKey(),
        queryFn: this.queryMap.get('userFeatures')!.queryFn
      })
      .then((uf) => ({
        wishlisted: (uf || []).filter((f: UserFeature) => f.isWishlisted),
        visited: (uf || []).filter((f: UserFeature) => f.isVisited)
      }));

    this.user = (await this.queryClient.fetchQuery({
      queryKey: this.userQueryKey,
      queryFn: this.userQueryFn
    })) as CurrentUser;

    this.postUserMutation();
    this.isInitialised = true;
  };

  reinitializeWithAuth = async (): Promise<void> => {
    if (this.user?.id) {
      this.isInitialised = false;
      await this.init(this.user.id);
    }
  };

  // METHOD : SuperAdmin check
  isSuperAdmin(): boolean {
    return this.user?.superAdmin === true;
  }

  // Helper method to build API URLs with filters
  private buildApiUrl = (
    resource: FirstClassResource,
    includePrisms: boolean = true,
    includeFilters: boolean = true
  ): string => {
    const path = ResourcePath[resource];
    const params = new URLSearchParams();

    // Add isArchived filter by default (except for properties which don't have these fields)
    if (includeFilters) {
      params.append('isArchived', 'false');
      params.append('isPublished', 'true');
    }

    if (includePrisms) {
      // Add prism filters based on resource hierarchy
      if (resource !== FirstClassResource.organisation) {
        this.state.prisms.organisation.forEach((org) =>
          params.append(FirstClassResource.organisation, org)
        );
      }

      if (
        resource !== FirstClassResource.organisation &&
        resource !== FirstClassResource.project
      ) {
        this.state.prisms.project.forEach((proj) =>
          params.append(FirstClassResource.project, proj)
        );
      }

      if (resource === FirstClassResource.feature) {
        this.state.prisms.layer.forEach((layer) =>
          params.append(FirstClassResource.layer, layer)
        );
      }
    }

    return `/api/${path}?${params.toString()}`;
  };

  organisationsQueryFn = async (): Promise<Organisation[]> => {
    const url = this.buildApiUrl(FirstClassResource.organisation);
    return fetchOrThrow<Organisation[]>(url);
  };

  projectsQueryFn = async (): Promise<Project[]> => {
    const url = this.buildApiUrl(FirstClassResource.project);
    return fetchOrThrow<Project[]>(url);
  };

  layersQueryFn = async (): Promise<Layer[]> => {
    const url = this.buildApiUrl(FirstClassResource.layer);
    return fetchOrThrow<Layer[]>(url);
  };

  featuresQueryFn = async (): Promise<Feature[]> => {
    const url = this.buildApiUrl(FirstClassResource.feature);
    return fetchOrThrow<Feature[]>(url);
  };

  propertiesQueryFn = async (): Promise<Property[]> => {
    const url = this.buildApiUrl(FirstClassResource.property, true, false);
    return fetchOrThrow<Property[]>(url);
  };

  userFeaturesQueryFn = async (): Promise<UserFeature[]> => {
    if (!this.user?.id) {
      return [];
    }
    const response = await fetch(`/api/userFeatures?userId=${this.user.id}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    // Ensure we always return an array, even if API returns null/undefined
    return Array.isArray(data) ? data : [];
  };

  userQueryFn = async (): Promise<CurrentUser | null> => {
    if (!this.user?.id) {
      return null;
    }
    const response = await fetch(`/api/users/${this.user.id}`);
    if (!response.ok) throw new Error('Network response was not ok');
    return (await response.json()) as CurrentUser;
  };

  invalidateAndRefresh = async (
    resource: FirstClassResource | 'userFeatures'
  ): Promise<void> => {
    // Invalidate the query
    await this.invalidate(resource);
    // Refresh the resources
    await this.refresh(resource);
  };

  invalidate = async (resource: FirstClassResource | 'userFeatures'): Promise<void> => {
    // Clear relevant caches when invalidating (forces fresh data)
    if (resource === FirstClassResource.organisation) {
      this.cache.organisation.clear();
      this.organisationCodeToId.clear();
    } else if (resource === FirstClassResource.project) {
      this.cache.project.clear();
      this.projectCodeToId.clear();
    } else if (resource === FirstClassResource.layer) {
      this.cache.layer.clear();
    } else if (resource === FirstClassResource.feature) {
      this.cache.feature.clear();
      this.featuresMap.clear();
    } else if (resource === FirstClassResource.task) {
      this.cache.task.clear();
    } else if (resource === FirstClassResource.hub) {
      this.cache.hub.clear();
      this.hubCodeToId.clear();
    } else if (resource === FirstClassResource.property) {
      this.cache.property.clear();
    }

    await this.queryClient.invalidateQueries({
      queryKey:
        resource === 'userFeatures'
          ? this.userFeaturesQueryKey
          : [FirstClassResource[resource]],
      refetchType: 'all',
      exact: false
    });
  };

  togglePrism = (resource: FirstClassResource, id: Id): void => {
    const prisms = this.state.prisms[resource as ResourceTypeWithChildren];
    const index = prisms.indexOf(id);
    if (index === -1) {
      prisms.push(id);
    } else {
      prisms.splice(index, 1);
    }
    this.refresh(resource);
  };

  // Toggle methods for hierarchical filters
  toggleOrganisation = (id: Id): void => {
    this.togglePrism(FirstClassResource.organisation, id);
  };

  toggleProject = (id: Id): void => {
    this.togglePrism(FirstClassResource.project, id);
  };

  toggleLayer = (id: Id): void => {
    this.togglePrism(FirstClassResource.layer, id);
  };

  toggleFeature = (id: Id): void => {
    this.togglePrism(FirstClassResource.feature, id);
  };

  // Cascades refresh to the next resource in the hierarchy
  refresh = async (resource: FirstClassResource | 'userFeatures'): Promise<void> => {
    // Refresh the resources
    if (resource === 'organisation') {
      await this.refreshOrganisations();
    } else if (resource === 'project') {
      await this.refreshProjects();
    } else if (resource === 'layer') {
      await this.refreshLayers();
    } else if (resource === 'feature') {
      await this.refreshFeatures();
    } else if (resource === 'task') {
      await this.refreshTasks();
    } else if (resource === 'hub') {
      await this.refreshHubs();
    } else if (resource === 'property') {
      await this.refreshProperties();
    } else if (resource === 'userFeatures') {
      await this.refreshUserFeatures();
    }
  };

  refreshOrganisations = async (): Promise<void> => {
    this.state.resources.organisation = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.organisation)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.organisation)!.queryFn
    });
    // Efficiently sync organization cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.organisation, this.state.resources.organisation);
    // Efficiently sync organisation code-to-ID mapping
    this.syncCodeToIdMap(this.organisationCodeToId, this.state.resources.organisation);
    await this.refreshProjects();
    await this.refreshHubs();
  };

  refreshProjects = async (): Promise<void> => {
    this.state.resources.project = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.project)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.project)!.queryFn
    });
    // Efficiently sync project cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.project, this.state.resources.project);
    // Efficiently sync project code-to-ID mapping
    this.syncCodeToIdMap(this.projectCodeToId, this.state.resources.project);
    this.syncProjectPrisms();
    await this.refreshProperties();
    await this.refreshLayers();
    // Sync layer prisms after layers are refreshed (when projects change, available layers change)
    this.syncLayerPrisms();
  };

  refreshLayers = async (): Promise<void> => {
    this.state.resources.layer = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.layer)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.layer)!.queryFn
    });
    // Efficiently sync layer cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.layer, this.state.resources.layer);
    // Also calls this.refreshFeatures()
    await this.postLayerMutation();
  };

  refreshFeatures = async (): Promise<void> => {
    this.state.resources.feature = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.feature)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.feature)!.queryFn
    });
    // Efficiently sync feature cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.feature, this.state.resources.feature);
    this.rebuildFeaturesMap();
  };

  refreshTasks = async (): Promise<void> => {
    this.state.resources.task = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.task)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.task)!.queryFn
    });
    // Efficiently sync task cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.task, this.state.resources.task);
  };

  refreshHubs = async (): Promise<void> => {
    if (!this.isSuperAdmin()) return;
    this.state.resources.hub = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.hub)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.hub)!.queryFn
    });
    // Efficiently sync hub cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.hub, this.state.resources.hub);
    // Efficiently sync hub code-to-ID mapping
    this.syncCodeToIdMap(this.hubCodeToId, this.state.resources.hub);
  };

  refreshProperties = async (): Promise<void> => {
    const properties = await this.queryClient.fetchQuery({
      queryKey: this.queryMap.get(FirstClassResource.property)!.queryKey(),
      queryFn: this.queryMap.get(FirstClassResource.property)!.queryFn
    });
    // Efficiently sync property cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.property, properties);
  };

  refreshUserFeatures = async (): Promise<void> => {
    this.state.userFeatures = await this.queryClient
      .fetchQuery({
        queryKey: this.queryMap.get('userFeatures')!.queryKey(),
        queryFn: this.queryMap.get('userFeatures')!.queryFn
      })
      .then((uf) => ({
        wishlisted: (uf || []).filter((f: UserFeature) => f.isWishlisted),
        visited: (uf || []).filter((f: UserFeature) => f.isVisited)
      }));

    // If active collection is a walk, refresh it and handle navigation
    this.postUserFeaturesMutation();
  };

  /*
   * Handles user features mutation and refreshes the active walk collection
   * If a user has their stars selected as an ActiveCollection (Walk), then we
   * ensure that the collection count is updated and the card navigates to
   * the next item on the list, or returns home if the list is empty.
   */
  postUserFeaturesMutation = (): void => {
    const activeCollection = this.getActiveCollection();
    if (!activeCollection || activeCollection.type !== 'walk') {
      return;
    }

    const currentActiveFeature = this.getActiveFeature();
    let updatedItems: Feature[] = [];

    // Get updated items based on walk type
    if (activeCollection.id === 'stars') {
      updatedItems = this.getWishlistedFeatures();
    }
    // TODO: Add other walk types when implemented

    // If the collection is now empty, reset and navigate to home
    if (updatedItems.length === 0) {
      this.resetActiveCollection();
      goto('/');
      return;
    }

    // Update the collection with new items
    this.setActiveCollection(
      {
        ...activeCollection,
        items: updatedItems
      },
      {
        highlight: false,
        focus: false,
        activateFirst: false,
        focusFirst: false
      }
    );

    // Handle navigation if current feature is no longer in the collection
    if (currentActiveFeature) {
      const isCurrentFeatureStillInCollection = updatedItems.some(
        (f) => f.id === currentActiveFeature.id
      );

      if (!isCurrentFeatureStillInCollection) {
        // Find the next feature to navigate to
        const currentIndex = activeCollection.items.findIndex(
          (f) => f.id === currentActiveFeature.id
        );

        let nextFeature: Feature | null = null;

        // Try to get the next feature in the original list
        if (currentIndex >= 0 && currentIndex < updatedItems.length) {
          nextFeature = updatedItems[currentIndex];
        } else if (updatedItems.length > 0) {
          // If current index is out of bounds, get the last item
          nextFeature = updatedItems[updatedItems.length - 1];
        }

        if (nextFeature) {
          this.setActiveFeature(nextFeature.id, { focus: true, isCardOpen: true });
        }
      }
    }
  };

  syncProjectPrisms = () => {
    const filteredProjects = this.state.prisms.project.filter((project) => {
      return this.state.resources.project.some((p) => p.id === project);
    });

    // Only update if the array actually changed
    if (
      filteredProjects.length !== this.state.prisms.project.length ||
      !filteredProjects.every((id, index) => id === this.state.prisms.project[index])
    ) {
      this.state.prisms.project = filteredProjects;
    }
  };

  syncLayerPrisms = () => {
    const filteredLayers = this.state.prisms.layer.filter((layer) => {
      return this.state.resources.layer.some((l) => l.id === layer);
    });

    // Use Set comparison for proper array equality check
    const currentSet = new Set(this.state.prisms.layer);
    const filteredSet = new Set(filteredLayers);
    
    // Check if sets are different (different lengths or different contents)
    const shouldUpdate = 
      currentSet.size !== filteredSet.size ||
      !Array.from(currentSet).every(id => filteredSet.has(id));
    
    // Only update if the array actually changed
    if (shouldUpdate) {
      this.state.prisms.layer = filteredLayers;
    }
  };

  postLayerMutation = async (): Promise<void> => {
    const currentLayerIds = new Set(this.state.prisms.layer);
    const existingFilterLayerIds = new Set(
      Object.keys(this.state.filters.properties || {})
    );

    // Initialise filters for newly added layers
    currentLayerIds.forEach((layerId) => {
      if (!existingFilterLayerIds.has(layerId)) {
        // Call initialization functions for the new layer
        this.initialiseCategoricalPropertyFilters(layerId);
        this.initialiseRangePropertyFilter(layerId);
      }
    });

    // Remove filters for layers that are no longer active
    existingFilterLayerIds.forEach((layerId) => {
      if (!currentLayerIds.has(layerId)) {
        delete this.state.filters.properties![layerId];
      }
    });

    // Only refresh features if user is authenticated
    if (this.user?.id) {
      await this.refreshFeatures();
      await this.refreshTasks();
    }
  };

  postUserMutation = (): void => {
    if (this.user && 'userLayers' in this.user) {
      // Set default layers if user has userLayers
      this.state.prisms.layer =
        this.user.userLayers?.map((layer: UserLayer) => layer.layerId) ?? [];
    }
  };

  // ═══════════════════════
  // CODE TO ID MAPPINGS
  // ═══════════════════════

  getOrganisationIdByCode = (code: Code): Id | undefined => {
    return this.organisationCodeToId.get(code);
  };

  getProjectIdByCode = (code: Code): Id | undefined => {
    return this.projectCodeToId.get(code);
  };

  getHubIdByCode = (code: Code): Id | undefined => {
    return this.hubCodeToId.get(code);
  };

  // FILTERS

  // FILTERS - NEIGHBOURHOODS

  toggleNeighbourhood = (name: string) => {
    const current = this.state.filters.neighbourhoods;
    this.state.filters.neighbourhoods = current.includes(name)
      ? current.filter((n) => n !== name)
      : [...current, name].sort();
  };

  resetNeighbourhoods = () => {
    this.state.filters.neighbourhoods = [];
  };

  // getNeighbourhoodParams(): URLSearchParams {
  //   const params = new URLSearchParams();
  //   this.state.filters.neighbourhoods.forEach((n) => {
  //     params.append('addressProperties.neighbourhood', n);
  //   });
  //   return params;
  // }

  // FILTERS - GENERIC

  getFilterCount = (): { neighbourhoods: number; properties: number } => {
    return {
      neighbourhoods: this.state.filters.neighbourhoods.length,
      properties: Object.entries(this.state.filters.properties || {}).reduce(
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
                    values.rangeMax !== values.globalMax))
            ).length
          );
        },
        0
      )
    };
  };

  resetFilters = (): void => {
    this.state.filters = { neighbourhoods: [], properties: {} };
    // Re-initialize property filters for active layers
    this.state.prisms.layer.forEach((layerId) => {
      this.initialiseCategoricalPropertyFilters(layerId);
      this.initialiseRangePropertyFilter(layerId);
    });
  };

  // PRISM RELATIONS

  getPrism = (resource: FirstClassResource): Id[] => {
    return this.state.prisms[resource as ResourceTypeWithChildren];
  };

  isPrism = (resource: FirstClassResource, id: Id): boolean => {
    return this.state.prisms[resource as ResourceTypeWithChildren]?.includes(id);
  };

  // Helper method to fetch resource by ID with cache miss handling
  private fetchResourceById = async <T>(
    resource: FirstClassResource,
    ref: Id
  ): Promise<T | undefined> => {
    // Guard against undefined or invalid IDs
    if (!ref || ref === 'undefined') {
      return undefined;
    }

    let refKey = ResourceRefKey[resource as keyof typeof ResourceRefKey];

    try {
      const response = await fetch(
        `/api/${ResourcePath[resource]}/${ref}${refKey === 'code' ? '?byId=true' : ''}`
      );
      if (!response.ok) return undefined;
      return await response.json();
    } catch {
      return undefined;
    }
  };

  getOrganisationById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true
  ): Promise<Organisation | undefined> => {
    // Check cache first
    let org = this.cache.organisation.get(id);
    if (org) return org;

    if (fetchOnCacheMiss) {
      org = await this.fetchResourceById<Organisation>(
        FirstClassResource.organisation,
        id
      );
      if (org) {
        this.cache.organisation.set(id, org);
        return org;
      }
    }

    return undefined;
  };

  getProjectById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true
  ): Promise<Project | undefined> => {
    // Check cache first
    let project = this.cache.project.get(id);
    if (project) return project;

    if (fetchOnCacheMiss) {
      project = await this.fetchResourceById<Project>(FirstClassResource.project, id);
      if (project) {
        this.cache.project.set(id, project);
        return project;
      }
    }

    return undefined;
  };

  getLayerById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true
  ): Promise<Layer | undefined> => {
    // Check cache first
    let layer = this.cache.layer.get(id);
    if (layer) return layer;

    if (fetchOnCacheMiss) {
      layer = await this.fetchResourceById<Layer>(FirstClassResource.layer, id);
      if (layer) {
        this.cache.layer.set(id, layer);
        return layer;
      }
    }

    return undefined;
  };

  getFeatureById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true
  ): Promise<Feature | undefined> => {
    // Check cache first
    let feature = this.cache.feature.get(id);
    if (feature) return feature;

    if (fetchOnCacheMiss) {
      feature = await this.fetchResourceById<Feature>(FirstClassResource.feature, id);
      if (feature) {
        this.cache.feature.set(id, feature);
        return feature;
      }
    }

    return undefined;
  };

  getTaskById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true
  ): Promise<Task | undefined> => {
    // Check cache first
    let task = this.cache.task.get(id);
    if (task) return task;

    if (fetchOnCacheMiss) {
      task = await this.fetchResourceById<Task>(FirstClassResource.task, id);
      if (task) {
        this.cache.task.set(id, task);
        return task;
      }
    }

    return undefined;
  };

  getHubById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true
  ): Promise<Hub | undefined> => {
    // Check cache first
    let hub = this.cache.hub.get(id);
    if (hub) return hub;

    if (fetchOnCacheMiss) {
      hub = await this.fetchResourceById<Hub>(FirstClassResource.hub, id);
      if (hub) {
        this.cache.hub.set(id, hub);
        return hub;
      }
    }

    return undefined;
  };

  getPropertyById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true
  ): Promise<Property | undefined> => {
    // Check cache first
    let property = this.cache.property.get(id);
    if (property) return property;

    if (fetchOnCacheMiss) {
      // Properties don't have their own API endpoint, they come with projects
      // For now, return undefined if not cached
      return undefined;
    }

    return undefined;
  };

  // Helper method to get visible classifier properties for a layer
  getClassifierPropertiesForLayer = async (layer: Layer): Promise<Property[]> => {
    if (!layer.properties) return [];

    // Get Properties associated with LayerProperties
    const properties = layer.properties
      .filter((lp) => lp.isVisible !== false)
      .map((lp) => this.cache.property.get(lp.propertyId));

    // Filter classifiers then sort by rank
    return sortProperties(
      properties
        .filter(
          (prop): prop is Property => prop !== undefined && prop.type === 'classifier'
        )
        .map((p) => ({ property: p }))
    ).map((item) => item.property!);
  };

  getResourceById = async (
    resource: FirstClassResource,
    id: Id
  ): Promise<Resource | undefined> => {
    switch (resource) {
      case FirstClassResource.organisation:
        return await this.getOrganisationById(id);
      case FirstClassResource.project:
        return await this.getProjectById(id);
      case FirstClassResource.layer:
        return await this.getLayerById(id);
      case FirstClassResource.feature:
        return await this.getFeatureById(id);
      case FirstClassResource.task:
        return await this.getTaskById(id);
      case FirstClassResource.hub:
        return await this.getHubById(id);
    }
  };

  getResourceByRef = async (
    resource: FirstClassResource,
    ref: Id | Code
  ): Promise<Resource | undefined> => {
    switch (resource) {
      case FirstClassResource.organisation:
        return await this.getOrganisationById(
          this.getOrganisationIdByCode(ref as Code)! as Id
        );
      case FirstClassResource.project:
        return await this.getProjectById(this.getProjectIdByCode(ref as Code)! as Id);
      case FirstClassResource.layer:
        return await this.getLayerById(ref as Id);
      case FirstClassResource.feature:
        return await this.getFeatureById(ref as Id);
      case FirstClassResource.task:
        return await this.getTaskById(ref as Id);
      case FirstClassResource.hub:
        return await this.getHubById(this.getHubIdByCode(ref as Code)! as Id);
    }
  };

  // ================================================
  // HIERARCHY METHODS
  // ================================================

  getHierarchyForTask = async (task: Task): Promise<ResourceContext> => {
    const feature = await this.getFeatureById(task.featureId as Id);
    if (!feature)
      return {
        feature: undefined,
        layer: undefined,
        project: undefined,
        organisation: undefined
      };
    return await this.getHierarchy(feature);
  };

  // Synchronous version that uses cache only (for UI components)
  getHierarchySync = (
    resource: Feature | Layer | Project | Organisation
  ): ResourceContext => {
    // Determine what type of resource we have and build hierarchy accordingly
    let layer: Layer | undefined;
    let project: Project | undefined;
    let organisation: Organisation | undefined;

    if ('layerId' in resource) {
      // Feature - get its layer, then project, then organisation from cache
      layer = this.cache.layer.get(resource.layerId);
      if (layer) {
        project = this.cache.project.get(layer.projectId);
        if (project) {
          organisation = this.cache.organisation.get(project.organisationId);
        }
      }
    } else if ('projectId' in resource) {
      // Layer - use itself, get its project, then organisation from cache
      layer = resource as Layer;
      project = this.cache.project.get(layer.projectId);
      if (project) {
        organisation = this.cache.organisation.get(project.organisationId);
      }
    } else if ('organisationId' in resource) {
      // Project - use itself, get its organisation from cache
      project = resource as Project;
      organisation = this.cache.organisation.get(project.organisationId);
    } else {
      // Organisation - use itself
      organisation = resource as Organisation;
    }

    return {
      feature: 'layerId' in resource ? (resource as Feature) : undefined,
      layer,
      project,
      organisation
    };
  };

  getHierarchy = async (
    resource: Feature | Layer | Project | Organisation
  ): Promise<ResourceContext> => {
    // Determine what type of resource we have and build hierarchy accordingly
    let layer: Layer | undefined;
    let project: Project | undefined;
    let organisation: Organisation | undefined;

    if ('layerId' in resource) {
      // Feature - get its layer, then project, then organisation
      layer = await this.getLayerById(resource.layerId);
      if (layer) {
        project = await this.getProjectById(layer.projectId);
        if (project) {
          organisation = await this.getOrganisationById(project.organisationId);
        }
      }
    } else if ('projectId' in resource) {
      // Layer - use itself, get its project, then organisation
      layer = resource as Layer;
      project = await this.getProjectById(layer.projectId);
      if (project) {
        organisation = await this.getOrganisationById(project.organisationId);
      }
    } else if ('organisationId' in resource) {
      // Project - use itself, get its organisation
      project = resource as Project;
      organisation = await this.getOrganisationById(project.organisationId);
    } else {
      // Organisation - use itself
      organisation = resource as Organisation;
    }

    return {
      feature: 'layerId' in resource ? (resource as Feature) : undefined,
      layer,
      project,
      organisation
    };
  };

  // ================================================
  // COUNT METHODS
  // ================================================

  // COUNT METHODS
  getOrganisationProjectCount = (organisationId: Id): number =>
    this.state.resources.project.filter((p) => p.organisationId === organisationId)
      .length;

  getProjectLayerCount = (projectId: Id): number =>
    this.state.resources.layer.filter((l) => l.projectId === projectId).length;

  // CONTEXTUAL NAME METHODS
  getContextualOrganisationName = (
    organisation: Organisation,
    hideIfOnly: boolean = true
  ): string | null => {
    const projectCount = this.getOrganisationProjectCount(organisation.id);
    if (hideIfOnly && projectCount === 1) {
      return null;
    }
    return getI18n(organisation, 'nameShort', this.getUserPreferences());
  };

  getContextualProjectName = (
    project?: Project,
    hideIfOnly: boolean = true
  ): string | null => {
    if (!project?.organisationId) return null;
    const organisationProjectCount = this.getOrganisationProjectCount(
      project.organisationId
    );
    if (hideIfOnly && organisationProjectCount === 1) {
      return null;
    }
    return (
      getI18n(project, 'nameShort', this.getUserPreferences()) ||
      getI18n(project, 'name', this.getUserPreferences())
    );
  };

  getContextualLayerName = (
    layer: Layer,
    hideIfOnly: boolean = true
  ): string | null => {
    const projectLayerCount = this.getProjectLayerCount(layer.projectId);
    if (hideIfOnly && projectLayerCount === 1) {
      return null;
    }
    return (
      getI18n(layer, 'nameShort', this.getUserPreferences()) ||
      getI18n(layer, 'name', this.getUserPreferences())
    );
  };

  // FEATURE COLLECTIONS

  // Features, given the selected Neighbourhoods (or all if none)
  getFeatureIdsForNeighbourhoods = (): Id[] => {
    return getFeatureIdsForNeighbourhoods(this);
  };

  getFeatureIdsForProperties = (): Id[] => {
    return getFeatureIdsForProperties(this);
  };

  // Features, given the selected Neighbourhoods and Properties
  getVisibleFeatureIds = (): Id[] => {
    // If no layers are selects, return none.
    if (this.state.prisms.layer.length === 0) {
      return [];
    }
    return Array.from(
      new Set(this.featuresForNeighbourhoods).intersection(
        new Set(this.featuresForProperties)
      )
    );
  };

  // Features (for Active Layers) that are on the user's wishlist
  getWishlistedFeatureIds = (): Id[] => {
    return this.state.userFeatures?.wishlisted?.map((wl) => wl.featureId!) || [];
  };

  // Features (for Active Layers) that the user has visited
  getVisitedFeatureIds = (): Id[] => {
    return this.state.userFeatures?.visited?.map((wl) => wl.featureId!) || [];
  };

  getWishlistUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures?.wishlisted || [];
  };

  getVisitedUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures?.visited || [];
  };

  // Features Collection -- Subsets

  getActiveCollection = (): ActiveCollection => this.state.active.collection;

  setActiveCollection = (
    collection: ActiveCollection,
    options: {
      highlight: boolean;
      focus: boolean;
      activateFirst: boolean;
      focusFirst: boolean;
      openCard?: boolean;
    } = {
      highlight: false,
      focus: false,
      activateFirst: true,
      focusFirst: false,
      openCard: false
    }
  ) => {
    this.state.active.collection = collection;
    if (options.highlight) {
      this.highlightActiveCollection({ focus: options.focus });
    }
    if (options.activateFirst) {
      if (collection?.items.length && collection.items.length > 0) {
        this.setActiveFeature(collection.items[0].id, {
          focus: options.focusFirst
        });
      }
    }
  };

  resetActiveCollection = (): void => {
    // Remove "highlighted" class from all features
    this.unhighlightAllFeatures();
    // Reset active collection
    this.state.active.collection = null;
    // Remove 'active' class from the active feature
    this.state.active.feature?.id &&
      removeMarkerClass(this, this.state.active.feature.id);
    // Reset active feature
    this.state.active.feature = null;
  };

  getActiveFeature = (): Feature | null => this.state.active.feature;

  setActiveFeature = (
    featureId: Id,
    options: { focus: boolean; isCardOpen?: boolean | null } = {
      focus: false,
      isCardOpen: null
    }
  ) => {
    // Remove active state from previous feature
    if (this.state.active.feature) {
      removeMarkerClass(this, this.state.active.feature.id);
    }
    // Set active state to new feature
    this.state.active.feature = this.features.get(featureId)!;
    // TODO : Add "active" class to the feature on the map
    addMarkerClass(this, featureId);
    if (options.focus) {
      if (options.isCardOpen === false) {
        this.zoomToActiveFeature();
      } else {
        goto(`/features/${featureId}`);
      }
    }
  };

  highlightActiveCollection = (options: { focus: boolean } = { focus: false }) => {
    // Remove "highlighted" class from all features
    this.unhighlightAllFeatures();
    // Add "highlighted" class to all features in the active collection
    const features = this.getActiveCollection()?.items || [];
    if (features.length > 0) {
      features.forEach((f) => {
        addMarkerClass(this, f.id, 'highlighted');
      });
    }
    if (options.focus) {
      this.zoomToActiveCollection();
    }
  };

  unhighlightAllFeatures = (): void => {
    // Remove "highlighted" class from all features
    this.state.resources.feature.forEach((f) => {
      removeMarkerClass(this, f.id, 'highlighted');
    });
  };

  // NAVIGATION METHODS

  navNext = (options: { isCardOpen: boolean } = { isCardOpen: true }): void => {
    let navIndex =
      this.state.active.collection?.items.findIndex(
        (item) => item.id === this.state.active.feature?.id
      ) ?? -1;
    if (navIndex < (this.state.active.collection?.items.length || 1) - 1) {
      this.setActiveFeature(
        this.state.active.collection?.items[navIndex + 1]?.id as Id,
        {
          ...options,
          focus: true
        }
      );
    }
  };

  navPrevious = (options: { isCardOpen: boolean } = { isCardOpen: true }): void => {
    let navIndex =
      this.state.active.collection?.items.findIndex(
        (item) => item.id === this.state.active.feature?.id
      ) ?? -1;
    if (navIndex > 0) {
      this.setActiveFeature(
        this.state.active.collection?.items[navIndex - 1]?.id as Id,
        {
          ...options,
          focus: true
        }
      );
    }
  };

  navToIndex = (
    index: number,
    options: { isCardOpen: boolean } = { isCardOpen: true }
  ): void => {
    if (index > 0) {
      this.setActiveFeature(this.state.active.collection?.items[index]?.id as Id, {
        ...options,
        focus: true
      });
    }
  };

  // MAP OPERATIONS -- REBOUNDING

  zoomToActiveCollection = (): void => {
    const features = this.getActiveCollection()?.items || [];
    this.zoomToFeatures(features);
  };

  zoomToActiveFeature = (): void => {
    const feature = this.getActiveFeature();
    if (!feature) return;
    this.zoomToFeatures([feature]);
  };

  zoomToFeatures = (features?: Feature[]): void => {
    if (!this.map) return;

    // Use provided features or current state features
    const featuresToZoom = features || this.getFeaturesByIds(this.featuresVisible);
    if (!featuresToZoom.length) return;

    // Create a FeatureCollection
    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: featuresToZoom.map((f) => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: f.properties
      })) as GeoJSONFeature[]
    };
    const padding =
      window.innerWidth <= MOBILE_MAX_WIDTH
        ? {
            top: 48,
            bottom: 50,
            right: 50,
            left: 50
          }
        : {
            top: 150,
            bottom: 50,
            right:
              50 + (this.state.panels.filters || this.state.panels.settings ? 210 : 0),
            left: 50 + (this.state.panels.maps || this.state.panels.stars ? 210 : 0)
          };
    try {
      // Convert to WGS84 and get bounds
      const bounds = bbox(featureCollection);

      // @ts-ignore
      this.map.cachedFitBounds(
        [
          [bounds[0], bounds[1]], // southwestern corner
          [bounds[2], bounds[3]] // northeastern corner
        ],
        {
          center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
          padding,
          maxZoom: 18,
          duration: 2500,
          run: true
        }
      );
    } catch (error) {
      console.error('Error zooming to features:', error);
    }
  };

  zoomToCoordinates = (coordinates: [number, number][]): void => {
    if (!this.map) return;

    // Create a FeatureCollection
    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: coordinates.map((c) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: c
        },
        properties: {}
      })) as GeoJSONFeature[]
    };

    const bounds = bbox(featureCollection);

    // @ts-ignore
    this.map.cachedFitBounds(
      [
        [bounds[0], bounds[1]], // southwestern corner
        [bounds[2], bounds[3]] // northeastern corner
      ],
      {
        center: { lon: (bounds[0] + bounds[2]) / 2, lat: (bounds[1] + bounds[3]) / 2 },
        padding: {
          top: 150,
          bottom: 150,
          right: 50,
          left: 50
        },
        maxZoom: 20,
        duration: 2500,
        run: true
      }
    );
  };

  // FILTER Utils

  expandToSubNeighbourhoods = (neighbourhoodKey: string): Feature[] => {
    return expandToSubNeighbourhoods(this, neighbourhoodKey);
  };


  // ═══════════════════════
  // REACTIVE FEATURE COLLECTIONS
  // ═══════════════════════

  // Efficiently update features map from current state.resources.feature
  private rebuildFeaturesMap = () => {
    const newFeatures = this.state.resources.feature;
    const newFeatureIds = new Set(newFeatures.map((f) => f.id));

    // Remove features that are no longer in the result set
    for (const [id] of this.featuresMap) {
      if (!newFeatureIds.has(id)) {
        this.featuresMap.delete(id);
      }
    }

    // Add new features or update existing ones
    newFeatures.forEach((feature) => {
      this.featuresMap.set(feature.id, feature);
    });
  };

  // Public getter for features map (O(1) lookup, no rebuilding on access)
  get features(): SvelteMap<Id, Feature> {
    return this.featuresMap;
  }

  // FEATURE COLLECTIONS -- FeatureIds (Fixed $derived approach)

  // FeatureIds for Selected Neighbourhoods
  featuresForNeighbourhoods: Id[] = $derived(
    (this.featuresMap.size && this.getFeatureIdsForNeighbourhoods()) || []
  ) as Id[];

  // FeatureIds for Selected Properties
  featuresForProperties: Id[] = $derived(
    (this.featuresMap.size && this.getFeatureIdsForProperties()) || []
  ) as Id[];

  // Intersection of Neighbourhoods and Properties featureIds
  featuresVisible: Id[] = $derived(this.getVisibleFeatureIds());
  // FeatureIds for Wishlisted Features
  featuresWishlisted: Id[] = $derived(this.getWishlistedFeatureIds()) as Id[];
  // FeatureIds for Visited Features
  featuresVisited: Id[] = $derived(this.getVisitedFeatureIds()) as Id[];

  // FILTER -- ACCESSORS

  // Accessor for Active Property Filters
  // TODO Make properties more efficient and first-class citizens
  propertyFilters = $derived(this.state.filters.properties);

  // FEATURE COLLECTIONS -- Utils

  getFeaturesByIds = (ids: Id[]): Feature[] =>
    ids.map((id) => this.features.get(id)).filter((f) => f !== undefined);

  // FEATURE COLLECTIONS -- Convenience Methods

  getVisibleFeatures = (): Feature[] => {
    return this.getFeaturesByIds(this.featuresVisible);
  };

  getWishlistedFeatures = (): Feature[] => {
    return this.getFeaturesByIds(this.featuresWishlisted);
  };

  getVisitedFeatures = (): Feature[] => {
    return this.getFeaturesByIds(this.featuresVisited);
  };

  getNeighbourhoodFeatures = (neighbourhood: string): Feature[] => {
    return this.expandToSubNeighbourhoods(neighbourhood);
  };

  // Panel methods
  togglePanel = (panel: keyof PanelState, closeAll: boolean = false): void => {
    const leftPanels = ['maps', 'stars'];
    const rightPanels = ['filters', 'settings'];
    const currentState = this.state.panels[panel];
    // If left panel is open, close it when toggling a left panel
    if (leftPanels.includes(panel)) {
      this.closePanel(leftPanels.filter((p) => p !== panel)[0] as keyof PanelState);
    } else if (rightPanels.includes(panel)) {
      this.closePanel(rightPanels.filter((p) => p !== panel)[0] as keyof PanelState);
    }
    if (closeAll) {
      this.closeAllPanels();
    }
    if (currentState) {
      this.closePanel(panel);
    } else {
      this.openPanel(panel);
      if (window.innerWidth > MOBILE_MAX_WIDTH) {
        this.focusPanel(leftPanels.includes(panel) ? 'left' : 'right');
      }
    }
  };

  focusPanel = (position: 'left' | 'right'): void => {
    let panelElement = null;
    setTimeout(() => {
      panelElement = document.getElementById(`${position}-panel`);
      const inputElement = panelElement?.querySelector('input');
      if (inputElement) {
        inputElement.focus();
      } else {
        panelElement?.focus();
      }
    }, 250);
  };

  closeLeftPanel = (): void => {
    this.state.panels.maps = false;
    this.state.panels.stars = false;
  };

  closeRightPanel = (): void => {
    this.state.panels.filters = false;
    this.state.panels.settings = false;
  };

  closeAllPanels = (): void => {
    Object.keys(this.state.panels).forEach((panel) => {
      this.state.panels[panel as keyof PanelState] = false;
    });
  };

  openPanel = (panel: keyof PanelState): void => {
    this.state.panels[panel] = true;
  };

  closePanel = (panel: keyof PanelState): void => {
    this.state.panels[panel] = false;
  };

  // Refocus map on currently visible features
  zoomToAllVisibleFeatures = (): void => {
    const visibleFeatures = this.getVisibleFeatures();
    if (visibleFeatures.length > 0) {
      this.zoomToFeatures(visibleFeatures);
    }
  };

  // KEYDOWN HANDLERS
  registerKeydownHandlers = (): void => {
    document.addEventListener('keydown', this.handleKeydown);
  };

  unregisterKeydownHandlers = (): void => {
    document.removeEventListener('keydown', this.handleKeydown);
  };

  handleKeydown = (event: KeyboardEvent): void => {
    let keyMatched = false;

    if (event.key === '1') {
      this.togglePanel('maps');
      keyMatched = true;
    } else if (event.key === '2') {
      this.togglePanel('filters');
      keyMatched = true;
    } else if (event.key === '3') {
      this.togglePanel('stars');
      keyMatched = true;
    } else if (event.key === '4') {
      this.togglePanel('settings');
      keyMatched = true;
    }

    if (keyMatched) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // NEW FEATURE

  setNewFeature = (newFeature: DeepPartial<NewFeatureTask>): void => {
    // Initialize with proper locale structure for all required locales
    if (newFeature.feature && !newFeature.feature.i18n) {
      const requiredLocales = ['en', 'zh-hant', 'zh-hans'];

      newFeature.feature.i18n = {};
      requiredLocales.forEach((locale) => {
        newFeature.feature!.i18n![locale as Locale] = {
          ...newFeature.feature!.i18n![locale as Locale],
          locale: locale,
          title: undefined,
          description: undefined
        } as any;
      });
    }
    this.newFeature = newFeature;
  };

  updateNewFeature = (newFeature: DeepPartial<NewFeatureTask>): void => {
    this.newFeature = {
      ...this.newFeature,
      ...newFeature,
      feature: {
        ...this.newFeature?.feature,
        ...newFeature.feature
      }
    };
  };

  updateNewFeatureValue = (key: keyof NewFeatureTask['feature'], value: any): void => {
    this.newFeature = {
      ...this.newFeature,
      feature: { ...this.newFeature?.feature, [key]: value }
    };
  };

  updateNewFeatureValueI18n = (
    key: FeatureI18nFieldKeys,
    value: any,
    locale: Locale = getLocale()
  ): void => {
    this.newFeature = {
      ...this.newFeature,
      feature: {
        ...this.newFeature?.feature,
        i18n: {
          ...this.newFeature?.feature?.i18n,
          [locale]: {
            ...this.newFeature?.feature?.i18n?.[locale],
            [key]: value
          }
        } as any
      }
    };
  };


  getNewFeature = (): DeepPartial<NewFeatureTask> | null => {
    return this.newFeature;
  };

  resetNewFeature = () => {
    this.newFeature = null;
  };

  // USER DATA
  setUser = async (user: CurrentUser | SessionUser | null) => {
    this.user = user;
  };

  getUser = (): CurrentUser | SessionUser | null => {
    return this.user;
  };

  resetUser = () => {
    this.user = null;
  };

  getUserPreferences = (withDefaults: boolean = true): UserPreferences => {
    // If no user, return default preferences
    if (!this.user) {
      return {
        fallbackLocales: getFallbackLocales(getLocale()) as Locale[],
        allowMachineTranslation: false,
        preferFallbackInCurrentLocale: false,
        isTranslateButtonVisible: true
      };
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
            (this.user as CurrentUser).preferences.isTranslateButtonVisible ?? true
        }
      : ((this.user as CurrentUser).preferences as UserPreferences);
  };

  updateUserPreferences = (preferences: UserPreferences) => {
    (this.user as CurrentUser).preferences = {
      ...(this.user as CurrentUser).preferences,
      ...preferences
    };
  };

  setLocale = async (locale: Locale) => {
    (this.user as CurrentUser).locale = locale;
    await updateLocale((this.user as CurrentUser).id, locale);
    // I18N : Update Paraglide's locale, triggers a page reload
    setLocale(locale);
  };

  setFallbackLocales = (localeCode: Locale, checked: boolean) => {
    const currentFallbacks =
      (this.user as CurrentUser).preferences.fallbackLocales || [];
    if (checked) {
      if (!currentFallbacks.includes(localeCode)) {
        (this.user as CurrentUser).preferences.fallbackLocales = [
          ...currentFallbacks,
          localeCode
        ];
      }
    } else {
      (this.user as CurrentUser).preferences.fallbackLocales = currentFallbacks.filter(
        (lc) => lc !== localeCode
      );
    }
    debouncedUpdateUserPreferences(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).preferences as UserPreferences
    );
  };

  setAdvancedFeature = (code: keyof UserPreferences, value: boolean) => {
    ((this.user as CurrentUser).preferences[code] as boolean) = value;
    debouncedUpdateUserPreferences(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).preferences as UserPreferences
    );
  };

  setUserAttribution = async (
    attribution: string,
    onSuccess?: (attribution: string) => void,
    onError?: (error: any) => void
  ) => {
    (this.user as CurrentUser).attribution = attribution;
    await debouncedUpdateUserAttribution(
      (this.user as CurrentUser).id,
      attribution,
      onSuccess,
      onError
    );
  };

  getUserLayers = (): UserLayer[] => {
    return (this.user as CurrentUser).userLayers;
  };

  getUserLayerIds = (): string[] => {
    return (this.user as CurrentUser).userLayers.map(
      (layer: UserLayer) => layer.layerId
    );
  };

  setUserLayer = (layerId: string, checked: boolean) => {
    const currentUserLayers = (this.user as CurrentUser).userLayers || [];
    if (checked) {
      if (!currentUserLayers.some((ul) => ul.layerId === layerId)) {
        (this.user as CurrentUser).userLayers = [
          ...currentUserLayers,
          {
            userId: (this.user as CurrentUser).id,
            layerId,
            isVisibleOnLoad: true
          }
        ];
      }
    } else {
      (this.user as CurrentUser).userLayers = currentUserLayers.filter(
        (ul) => ul.layerId !== layerId
      );
    }
    debouncedUpdateUserLayers(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).userLayers
    );
  };

  setExperimental = (featureCode: keyof UserExperimental, checked: boolean) => {
    const currentExperimental = (this.user as CurrentUser).experimental || {};
    (this.user as CurrentUser).experimental = {
      ...currentExperimental,
      [featureCode]: checked
    };
    debouncedUpdateUserExperimental(
      (this.user as CurrentUser).id,
      (this.user as CurrentUser).experimental
    );
  };

  // Clear all cache maps (for actual data reset scenarios)
  clearAllCaches = (): void => {
    this.cache.organisation.clear();
    this.cache.project.clear();
    this.cache.layer.clear();
    this.cache.feature.clear();
    this.cache.task.clear();
    this.cache.hub.clear();
    this.cache.property.clear();
    this.featuresMap.clear();
    this.organisationCodeToId.clear();
    this.projectCodeToId.clear();
    this.hubCodeToId.clear();
  };

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetOrganisations = () => {
    this.state.prisms.organisation = [];
    this.refreshOrganisations();
  };

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetProjects = () => {
    this.state.prisms.project = [];
    this.refreshProjects();
  };

  // Force refresh methods for when you actually need to invalidate and fetch fresh data
  forceRefreshOrganisations = () => {
    this.state.prisms.organisation = [];
    this.invalidateAndRefresh(FirstClassResource.organisation);
  };

  forceRefreshProjects = () => {
    this.state.prisms.project = [];
    this.invalidateAndRefresh(FirstClassResource.project);
  };

  // TODO : Clear the Omnibar when a layer is toggled
  addLayer = (id: Id) => {
    this.state.prisms.layer.push(id);
    this.postLayerMutation();
  };

  removeLayer = (id: Id) => {
    this.state.prisms.layer = this.state.prisms.layer.filter((l) => l !== id);
    this.postLayerMutation();
  };

  setLayers = (layers: Id[]) => {
    this.state.prisms.layer = layers;
    this.postLayerMutation();
  };

  resetLayers = () => {
    this.state.prisms.layer = [];
    this.postLayerMutation();
  };

  initialiseCategoricalPropertyFilters = (layerId: Id) => {
    const layer = this.state.resources.layer.find((l) => l.id === layerId);
    if (!layer) {
      return;
    }

    const project = this.state.resources.project.find((p) => p.id === layer.projectId);
    if (!project) {
      return;
    }

    // Filter properties based on visibility in layer (similar logic to Categories.svelte)
    const classifierProperties =
      project.properties
        ?.filter((p) => p.type === 'classifier')
        .filter((prop) => {
          const layerProperty = layer.properties?.find(
            (lp) => lp.propertyId === prop.id
          );
          // Only consider properties visible in the layer AND not range fields
          return layerProperty?.isVisible !== false && prop.component !== 'RangeField';
        })
        // Ensure uniqueness by key within the project's properties relevant to this layer
        .filter(
          (prop, index, self) => index === self.findIndex((p) => p.key === prop.key)
        ) || [];

    // Ensure the layer's filter object exists
    if (!this.state.filters.properties![layerId]) {
      this.state.filters.properties![layerId] = {};
    }

    const layerFilters = this.state.filters.properties![layerId];

    // Initialize each classifier property with an empty array if not already set
    classifierProperties.forEach((property: Property) => {
      if (!(property.key in layerFilters)) {
        layerFilters[property.key] = [];
      }
    });
  };

  initialiseRangePropertyFilter = (layerId: Id) => {
    const layer = this.state.resources.layer.find((l) => l.id === layerId);
    if (!layer) {
      return;
    }

    const project = this.state.resources.project.find((p) => p.id === layer.projectId);
    if (!project) {
      return;
    }

    // Find properties that are RangeFields and visible for this layer
    const rangeProperties =
      project.properties
        ?.filter((p) => p.component === 'RangeField') // Identify range properties
        .filter((prop) => {
          const layerProperty = layer.properties?.find(
            (lp) => lp.propertyId === prop.id
          );
          // Only consider properties visible in the layer
          return layerProperty?.isVisible !== false;
        })
        // Ensure uniqueness by key
        .filter(
          (prop, index, self) => index === self.findIndex((p) => p.key === prop.key)
        ) || [];

    // Ensure the layer's filter object exists
    if (!this.state.filters.properties![layerId]) {
      this.state.filters.properties![layerId] = {};
    }

    const layerFilters = this.state.filters.properties![layerId];

    // Initialize each range property using its min/max if not already set
    rangeProperties.forEach((property: Property) => {
      // Validate that min and max exist and are numbers
      const min = property.min;
      const max = property.max;

      if (
        !(property.key in layerFilters) &&
        typeof min === 'number' &&
        typeof max === 'number'
      ) {
        const filterConfig = {
          globalMin: min,
          globalMax: max,
          rangeMin: min, // Default rangeMin to globalMin
          rangeMax: max // Default rangeMax to globalMax
        };

        layerFilters[property.key] = filterConfig;
      }
    });
  };

  // ═══════════════════════
  // CACHE UPDATE UTILITIES
  // ═══════════════════════

  // Generic map sync - only add missing items and remove stale ones (no overwrites)
  private syncMap = <K, V, T>(
    map: Map<K, V>,
    newItems: T[],
    getKey: (item: T) => K,
    getValue?: (item: T) => V
  ): void => {
    const newKeys = new Set(newItems.map(getKey));

    // Remove entries that are no longer in the result set
    for (const [key] of map) {
      if (!newKeys.has(key)) {
        map.delete(key);
      }
    }

    // Only add entries that aren't already present
    newItems.forEach((item) => {
      const key = getKey(item);
      if (!map.has(key)) {
        map.set(key, getValue ? getValue(item) : (item as unknown as V));
      }
    });
  };

  // Convenience methods using the generic syncMap
  private syncCacheMap = <T extends { id: Id }>(
    cache: Map<Id, T>,
    newItems: T[]
  ): void => {
    this.syncMap(cache, newItems, (item) => item.id);
  };

  private syncCodeToIdMap = <T extends { id: Id; code: Code }>(
    codeMap: Map<Code, Id>,
    newItems: T[]
  ): void => {
    this.syncMap(
      codeMap,
      newItems,
      (item) => item.code,
      (item) => item.id
    );
  };
}
export const APPCTX_KEY = Symbol('mapContext');

export const setAppCtx = (queryClient: QueryClient, user: SessionUser | null) => {
  const context = new AppCtx(queryClient, user);
  // Don't initialize immediately - let the session watcher handle it after mount
  return setContext(APPCTX_KEY, context);
};

export const getAppCtx = (): ReturnType<typeof setAppCtx> => getContext(APPCTX_KEY);
