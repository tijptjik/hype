// DATA
import subNeighbourhoods from '$lib/map/subNeighbourhoods.json';
import { QueryClient } from '@tanstack/svelte-query';
// NAVIGATION
import { goto } from '$app/navigation';
// GEO
import { bbox } from '@turf/bbox';
// I18N
import {
  getFPI18n,
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
// CONTEXT
import { getContext, setContext } from 'svelte';
// MARKERS
import { removeMarkerClass, addMarkerClass } from '$lib/map/markers';
// ENUMS
import { FirstClassResource, ResourcePath } from '$lib/enums';
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
  FeatureExtended,
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
  FeatureI18nFieldKeys
} from '$lib/types';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { FeatureCollection, Feature as GeoJSONFeature } from 'geojson';
import { MOBILE_MAX_WIDTH } from '$lib/index';

export class AppCtx {
  // Maplibre Map instance
  map: MaplibreMap = $state()!;
  // Tanstack Query Client instance
  queryClient: QueryClient;
  // User data (reactive)
  user: CurrentUser | SessionUser | null = $state(null);
  // Whether the map has been initialised
  isInitialised: boolean = $state(false);
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
  userFeaturesQueryKey = ['userFeatures'];
  userQueryKey = ['user'];

  // Constructor
  constructor(queryClient: QueryClient, user: SessionUser | null) {
    this.queryClient = queryClient;
    this.setUser(user);
  }

  init = async (userId: Id | null) => {
    await this.initializeQueries(this.queryClient, userId);
    this.postLayerMutation();
    this.postUserMutation();
  };

  reinitializeWithAuth = async () => {
    if (this.user?.id) {
      this.isInitialised = false;
      await this.initializeQueries(this.queryClient, this.user.id);
      this.postLayerMutation();
      this.postUserMutation();
    }
  };

  // METHOD : SuperAdmin check
  isSuperAdmin(): boolean {
    return this.user?.superAdmin === true;
  }

  // Helper method to build API URLs with filters
  private buildApiUrl = (
    resource: FirstClassResource,
    includeFilters = true
  ): string => {
    const path = ResourcePath[resource];
    const params = new URLSearchParams();

    // Add isArchived filter by default
    params.append('isArchived', 'false');
    params.append('isPublished', 'true');

    if (includeFilters) {
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

  organisationsQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.organisation);
    return fetchOrThrow<Organisation[]>(url);
  };

  projectsQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.project);
    return fetchOrThrow<Project[]>(url);
  };

  layersQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.layer);
    return fetchOrThrow<Layer[]>(url);
  };

  featuresQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.feature);
    return fetchOrThrow<Feature[]>(url);
  };

  userFeaturesQueryFn = async () => {
    if (!this.user?.id) {
      return [];
    }
    const response = await fetch(`/api/userFeatures?userId=${this.user.id}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    // Ensure we always return an array, even if API returns null/undefined
    return Array.isArray(data) ? data : [];
  };

  userQueryFn = async () => {
    if (!this.user?.id) {
      return null;
    }
    const response = await fetch(`/api/users/${this.user.id}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    return data as CurrentUser;
  };

  invalidateAndRefresh = async (resource: FirstClassResource | 'userFeatures') => {
    // Invalidate the query
    await this.invalidate(resource);
    // Refresh the resources
    await this.refresh(resource);
  };

  invalidate = async (resource: FirstClassResource | 'userFeatures') => {
    await this.queryClient.invalidateQueries({
      queryKey:
        resource === 'userFeatures'
          ? this.userFeaturesQueryKey
          : [FirstClassResource[resource]],
      refetchType: 'all',
      exact: false
    });
  };

  togglePrism = (resource: FirstClassResource, id: Id) => {
    const prisms = this.state.prisms[resource as ResourceTypeWithChildren];
    const index = prisms.indexOf(id);
    if (index === -1) {
      prisms.push(id);
    } else {
      prisms.splice(index, 1);
    }
    this.invalidateAndRefresh(resource);
  };

  // Toggle methods for hierarchical filters
  toggleOrganisation = (id: Id) => {
    this.togglePrism(FirstClassResource.organisation, id);
  };

  toggleProject = (id: Id) => {
    this.togglePrism(FirstClassResource.project, id);
  };

  toggleLayer = (id: Id) => {
    this.togglePrism(FirstClassResource.layer, id);
  };

  toggleFeature = (id: Id) => {
    this.togglePrism(FirstClassResource.feature, id);
  };

  // Cascades refresh to the next resource in the hierarchy
  refresh = async (resource: FirstClassResource | 'userFeatures') => {
    // Refresh the resources
    if (resource === 'project') {
      this.refreshProjects();
    } else if (resource === 'layer') {
      this.refreshLayers();
    } else if (resource === 'feature') {
      this.refreshFeatures();
    } else if (resource === 'userFeatures') {
      this.refreshUserFeatures();
    }
  };

  private initializeQueries = async (queryClient: QueryClient, userId: Id | null) => {
    // Only fetch data if user is authenticated
    if (!userId) {
      // Initialize empty data structures for unauthenticated users
      this.state.resources.organisation = [];
      this.state.resources.project = [];
      this.state.resources.layer = [];
      this.state.resources.feature = [];
      // TODO Limit to admin route
      this.state.resources.task = [];
      this.state.resources.hub = [];
      // TODO Limit to (app) route
      this.state.userFeatures = {
        wishlisted: [],
        visited: []
      };
      return;
    }

    // Organizations query
    this.state.resources.organisation = await queryClient.fetchQuery({
      queryKey: this.organisationsQueryKey,
      queryFn: this.organisationsQueryFn
    });

    // Projects query
    this.state.resources.project = await queryClient.fetchQuery({
      queryKey: this.projectsQueryKey,
      queryFn: this.projectsQueryFn
    });

    // Layers query
    this.state.resources.layer = await queryClient.fetchQuery({
      queryKey: this.layersQueryKey,
      queryFn: this.layersQueryFn
    });

    // Features query
    this.state.resources.feature = await queryClient.fetchQuery({
      queryKey: this.featuresQueryKey,
      queryFn: this.featuresQueryFn
    });

    // Tasks and hubs are initialized in AdminCtx for admin routes only
    this.state.resources.task = [];
    this.state.resources.hub = [];

    // Initialize user features
    this.state.userFeatures = await queryClient
      .fetchQuery({
        queryKey: this.userFeaturesQueryKey,
        queryFn: this.userFeaturesQueryFn
      })
      .then((uf) => ({
        wishlisted: (uf || []).filter((f: UserFeature) => f.isWishlisted),
        visited: (uf || []).filter((f: UserFeature) => f.isVisited)
      }));

    this.user = (await queryClient.fetchQuery({
      queryKey: this.userQueryKey,
      queryFn: this.userQueryFn
    })) as CurrentUser;

    this.isInitialised = true;
  };

  postLayerMutation = () => {
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
      this.refreshFeatures();
    }
  };

  postUserMutation = () => {
    if (this.user && 'userLayers' in this.user) {
      // Set default layers if user has userLayers
      this.state.prisms.layer =
        this.user.userLayers?.map((layer: UserLayer) => layer.layerId) ?? [];
    }
  };

  refreshProjects = async () => {
    this.state.resources.project = await this.queryClient.fetchQuery({
      queryKey: this.projectsQueryKey,
      queryFn: this.projectsQueryFn
    });
    this.syncProjectPrisms();
    this.refreshLayers();
  };

  refreshLayers = async () => {
    this.state.resources.layer = await this.queryClient.fetchQuery({
      queryKey: this.layersQueryKey,
      queryFn: this.layersQueryFn
    });
    this.syncLayerPrisms();
    this.postLayerMutation();
    this.refreshFeatures();
  };

  refreshFeatures = async () => {
    this.state.resources.feature = await this.queryClient.fetchQuery({
      queryKey: this.featuresQueryKey,
      queryFn: this.featuresQueryFn
    });
  };

  // Tasks and hubs refresh methods moved to AdminCtx

  refreshUserFeatures = async () => {
    this.state.userFeatures = await this.queryClient
      .fetchQuery({
        queryKey: this.userFeaturesQueryKey,
        queryFn: this.userFeaturesQueryFn
      })
      .then((uf) => ({
        wishlisted: (uf || []).filter((f: UserFeature) => f.isWishlisted),
        visited: (uf || []).filter((f: UserFeature) => f.isVisited)
      }));
  };

  syncProjectPrisms = async () => {
    this.state.prisms.project = this.state.prisms.project.filter((project) => {
      return this.state.resources.project.some((p) => p.id === project);
    });
  };

  syncLayerPrisms = async () => {
    this.state.prisms.layer = this.state.prisms.layer.filter((layer) => {
      return this.state.resources.layer.some((l) => l.id === layer);
    });
  };

  // FILTERS

  // FILTERS - NEIGHBOURHOODS

  toggleNeighbourhood = (name: string) => {
    const current = this.state.filters.neighbourhoods;
    this.state.filters.neighbourhoods = current.includes(name)
      ? current.filter((n) => n !== name).sort()
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

  resetFilters = () => {
    this.state.filters = { neighbourhoods: [], properties: {} };
    this.state.prisms.layer.forEach((layerId) => {
      this.initialiseCategoricalPropertyFilters(layerId);
      this.initialiseRangePropertyFilter(layerId);
    });
  };

  // PRISM RELATIONS

  getPrism = (resource: FirstClassResource) => {
    return this.state.prisms[resource as ResourceTypeWithChildren];
  };

  isPrism = (resource: FirstClassResource, id: Id) => {
    return this.state.prisms[resource as ResourceTypeWithChildren]?.includes(id);
  };

  getOrganisation = (project: Project): Organisation | undefined =>
    this.getOrganisationById(project.organisationId);

  getOrganisationById = (id: Id): Organisation | undefined =>
    this.state.resources.organisation.find((org) => org.id === id);

  getProject = (layer: Layer): Project | undefined =>
    this.getProjectById(layer.projectId);

  getProjectById = (id: Id): Project | undefined =>
    this.state.resources.project.find((proj) => proj.id === id);

  getLayer = (feature: Feature | FeatureExtended): Layer | undefined =>
    this.getLayerById(feature.layerId);

  getLayerById = (id: Id): Layer | undefined => {
    return this.state.resources.layer.find((layer) => layer.id === id);
  };
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

  // All Features by Id, given the active layers
  getAllFeatureIds = (): Id[] =>
    this.state.prisms.layer.length > 0
      ? this.state.resources.feature.map((f) => f.id)
      : [];

  // Features, given the selected Neighbourhoods (or all if none)
  getFeatureIdsForNeighbourhoods = (): Id[] => {
    if (this.state.filters.neighbourhoods.length === 0) {
      return this.featuresAll;
    }
    const neighbourhoodFeatures = this.state.filters.neighbourhoods.flatMap(
      (neighbourhood) => {
        return this.expandToSubNeighbourhoods(neighbourhood);
      }
    );
    return neighbourhoodFeatures.map((f) => f.id);
  };

  getFeatureIdsForProperties = (): Id[] => {
    // If there are no layers being filtered at all, return all features.
    if (Object.keys(this.propertyFilters).length === 0) {
      return this.featuresAll;
    }

    const featureList = Object.values(this.features);

    const filteredIds = featureList
      .filter((f: Feature) => {
        // Get filters specific to this feature's layer
        const layerSpecificFilters = this.propertyFilters[f.layerId];

        // If there are no filters defined for this feature's layer, it passes this check.
        if (!layerSpecificFilters || Object.keys(layerSpecificFilters).length === 0) {
          return true;
        }

        // Check if the feature matches ALL filters defined for its layer
        const allFiltersMatch = Object.entries(layerSpecificFilters).every(
          ([propertyKey, selectedValues]) => {
            // If the filter has no values (e.g., empty array for categorical), it matches all features for this property.
            if (Array.isArray(selectedValues) && selectedValues.length === 0) {
              return true;
            }

            // Get the feature's property object
            const featureProperty = f.properties.find(
              (p) => p.property?.key === propertyKey
            );

            // If the feature doesn't have this property defined, it cannot match the filter.
            if (!featureProperty) {
              return false;
            }

            // Use the propertyValue if available (typically for linked values), otherwise fallback to the direct value
            const featureValue = getFPI18n(featureProperty, this.getUserPreferences());

            // Let's also try getting the raw value without i18n
            const rawValue = featureProperty.value;

            // If the feature has the property but the value is null/undefined, it also cannot match.
            if (featureValue === undefined || featureValue === null) {
              return false;
            }

            // Special handling for "Unset" values - they should not match range filters
            if (
              featureValue === 'Unset' ||
              featureValue === '' ||
              rawValue === null ||
              rawValue === undefined
            ) {
              return false;
            }

            let match = false;
            // Check if the feature's value matches the filter criteria
            if (Array.isArray(selectedValues)) {
              // Handle categorical filters (multi-select) - Already checked for empty array above
              match = selectedValues.includes(featureValue);
            } else if (
              typeof selectedValues === 'object' &&
              selectedValues !== null && // Ensure selectedValues is not null
              'rangeMin' in selectedValues &&
              'rangeMax' in selectedValues
            ) {
              // Handle range filters
              const numericFeatureValue = Number(featureValue);
              match =
                !isNaN(numericFeatureValue) &&
                numericFeatureValue >= selectedValues.rangeMin &&
                numericFeatureValue <= selectedValues.rangeMax;
            } else {
              // Should not happen with current filter setting methods
              match = false;
            }
            return match;
          }
        );

        return allFiltersMatch;
      })
      .map((f) => f.id);

    return filteredIds;
  };

  // Features, given the selected Neighbourhoods and Properties
  getVisibleFeatureIds = (): Id[] => {
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
    this.state.active.feature = this.features[featureId];
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

  unhighlightAllFeatures = () => {
    // Remove "highlighted" class from all features
    this.state.resources.feature.forEach((f) => {
      removeMarkerClass(this, f.id, 'highlighted');
    });
  };

  resetActiveCollection = () => {
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

  // NAVIGATION METHODS

  navNext = (options: { isCardOpen: boolean } = { isCardOpen: true }) => {
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

  navPrevious = (options: { isCardOpen: boolean } = { isCardOpen: true }) => {
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
  ) => {
    if (index > 0) {
      this.setActiveFeature(this.state.active.collection?.items[index]?.id as Id, {
        ...options,
        focus: true
      });
    }
  };

  // MAP OPERATIONS -- REBOUNDING

  zoomToActiveCollection = () => {
    const features = this.getActiveCollection()?.items || [];
    this.zoomToFeatures(features);
  };

  zoomToActiveFeature = () => {
    const feature = this.getActiveFeature();
    if (!feature) return;
    this.zoomToFeatures([feature]);
  };

  zoomToFeatures = (features?: Feature[]) => {
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

  zoomToCoordinates = (coordinates: [number, number][]) => {
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

  expandToSubNeighbourhoods = (neighbourhoodKey: string) => {
    let neighbourhoodFeatures = [];
    if (neighbourhoodKey in subNeighbourhoods) {
      subNeighbourhoods[neighbourhoodKey as keyof typeof subNeighbourhoods].forEach(
        (n) => {
          neighbourhoodFeatures.push(
            ...this.state.resources.feature.filter(
              (feature) =>
                n ===
                (feature as FeatureExtended).i18n?.[getLocale()]?.addressProperties
                  ?.neighbourhood
            )
          );
        }
      );
    } else {
      neighbourhoodFeatures.push(
        ...this.state.resources.feature.filter(
          (feature) =>
            neighbourhoodKey ===
            (feature as FeatureExtended).i18n?.[getLocale()]?.addressProperties
              ?.neighbourhood
        )
      );
    }
    return neighbourhoodFeatures;
  };

  startCircularFlight = (center: [number, number], radiusKm: number = 5) => {
    if (!this.map) return;

    const STEPS = 360; // One step per degree
    const STEP_DURATION = 500; // milliseconds per step
    let currentAngle = 0;

    const animate = () => {
      // Convert angle to radians
      const angleRad = (currentAngle * Math.PI) / 180;

      // Calculate new position
      const newLng = center[0] + (radiusKm / 111.32) * Math.cos(angleRad);
      const newLat =
        center[1] +
        (radiusKm / (111.32 * Math.cos((center[1] * Math.PI) / 180))) *
          Math.sin(angleRad);

      // @ts-ignore
      this.map?.cachedFlyTo({
        center: [newLng, newLat],
        zoom: 13.5,
        speed: 0.04,
        curve: 1,
        easing: (t: number) => t,
        run: true // This will execute the animation
      });

      // Increment angle
      currentAngle = (currentAngle + 1) % 360;

      // Schedule next frame
      setTimeout(() => {
        requestAnimationFrame(animate);
      }, STEP_DURATION);
    };

    // Start animation
    animate();
  };

  // FEATURE COLLECTIONS -- Features

  features: Record<Id, Feature> = $derived(
    this.state.resources.feature.reduce(
      (acc, f) => {
        acc[f.id] = f;
        return acc;
      },
      {} as Record<Id, Feature>
    )
  );

  // FEATURE COLLECTIONS -- FeatureIds

  // FeatureIds for Active Layers
  featuresAll: Id[] = $derived.by(this.getAllFeatureIds);
  // FeatureIds for Selected Neighbourhoods
  featuresForNeighbourhoods: Id[] = $derived.by(this.getFeatureIdsForNeighbourhoods);
  // FeatureIds for Selected Properties
  featuresForProperties: Id[] = $derived.by(this.getFeatureIdsForProperties);
  // Intersection of Neighbourhoods and Properties featureIds
  featuresVisible: Id[] = $derived.by(this.getVisibleFeatureIds);
  // FeatureIds for Wishlisted Features
  featuresWishlisted: Id[] = $derived.by(this.getWishlistedFeatureIds);
  // FeatureIds for Visited Features
  featuresVisited: Id[] = $derived.by(this.getVisitedFeatureIds);

  // FILTER -- ACCESSORS

  // Accessor for Active Property Filters
  propertyFilters = $derived(this.state.filters.properties);

  setCategoricalPropertyFilter = (
    layerId: Id,
    propertyKey: string,
    values: string[]
  ) => {
    this.state.filters.properties![layerId] = {
      ...(this.state.filters.properties![layerId] || {}),
      [propertyKey]: values
    };
  };

  removeCategoricalPropertyFilter = (layerId: Id, propertyKey: string) => {
    delete this.state.filters.properties![layerId]?.[propertyKey];
  };

  setRangePropertyFilter = (
    layerId: Id,
    propertyKey: string,
    values: [number, number]
  ) => {
    // Only update if the values have actually changed to prevent unnecessary reactivity triggers
    if (
      this.state.filters.properties![layerId]?.[propertyKey]?.rangeMin !== values[0] ||
      this.state.filters.properties![layerId]?.[propertyKey]?.rangeMax !== values[1]
    ) {
      // Ensure the layer object exists
      if (!this.state.filters.properties![layerId]) {
        this.state.filters.properties![layerId] = {};
      }

      // Get the existing range filter or find the property definition to get global min/max
      const existingRangeFilter =
        this.state.filters.properties![layerId]?.[propertyKey] || {};

      // If globalMin/globalMax are missing, find them from the property definition
      let globalMin = existingRangeFilter.globalMin;
      let globalMax = existingRangeFilter.globalMax;

      if (globalMin === undefined || globalMax === undefined) {
        // Find the property definition to get the global min/max
        const layer = this.state.resources.layer.find((l) => l.id === layerId);
        if (layer) {
          const project = this.state.resources.project.find(
            (p) => p.id === layer.projectId
          );
          if (project) {
            const property = project.properties?.find((p) => p.key === propertyKey);
            if (
              property &&
              typeof property.min === 'number' &&
              typeof property.max === 'number'
            ) {
              globalMin = property.min;
              globalMax = property.max;
            }
          }
        }
      }

      this.state.filters.properties![layerId][propertyKey] = {
        globalMin,
        globalMax,
        rangeMin: values[0],
        rangeMax: values[1]
      };
    }
  };

  // FEATURE COLLECTIONS -- Utils

  getFeatureById = (id: Id): Feature | undefined => {
    return this.features[id];
  };

  getFeaturesByIds = (ids: Id[]): Feature[] => {
    return ids
      .map((id) => this.getFeatureById(id) || undefined)
      .filter((f) => f !== undefined);
  };

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
  togglePanel = (panel: keyof PanelState, closeAll: boolean = false) => {
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

  focusPanel = (position: 'left' | 'right') => {
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

  closeLeftPanel = () => {
    this.state.panels.filters = false;
    this.state.panels.maps = false;
  };

  closeRightPanel = () => {
    this.state.panels.stars = false;
    this.state.panels.settings = false;
  };

  closeAllPanels = () => {
    Object.keys(this.state.panels).forEach((panel) => {
      this.state.panels[panel as keyof PanelState] = false;
    });
  };

  openPanel = (panel: keyof PanelState) => {
    this.state.panels[panel] = true;
  };

  closePanel = (panel: keyof PanelState) => {
    this.state.panels[panel] = false;
  };

  // Refocus map on currently visible features
  zoomToAllVisibleFeatures = () => {
    const visibleFeatures = this.getVisibleFeatures();
    if (visibleFeatures.length > 0) {
      this.zoomToFeatures(visibleFeatures);
    }
  };

  // KEYDOWN HANDLERS
  registerKeydownHandlers = () => {
    document.addEventListener('keydown', this.handleKeydown);
  };

  handleKeydown = (event: KeyboardEvent) => {
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

  setNewFeature = (newFeature: DeepPartial<NewFeatureTask>) => {
    // Initialize with proper locale structure for all required locales
    if (newFeature.feature && !newFeature.feature.i18n) {
      const requiredLocales = ['en', 'zh-hant', 'zh-hans'];
      const currentLocale = getLocale();

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

  updateNewFeature = (newFeature: DeepPartial<NewFeatureTask>) => {
    this.newFeature = {
      ...this.newFeature,
      ...newFeature,
      feature: {
        ...this.newFeature?.feature,
        ...newFeature.feature
      }
    };
  };

  updateNewFeatureValue = (key: keyof NewFeatureTask['feature'], value: any) => {
    this.newFeature = {
      ...this.newFeature,
      feature: { ...this.newFeature?.feature, [key]: value }
    };
  };

  updateNewFeatureValueI18n = (
    key: FeatureI18nFieldKeys,
    value: any,
    locale: Locale = getLocale()
  ) => {
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

  updateNewFeatureProperty = (propertyId: Id, object: Partial<FeatureProperty>) => {
    if (!this.newFeature?.feature) {
      return;
    }

    // Initialize properties array if it doesn't exist
    if (!this.newFeature.feature.properties) {
      this.newFeature.feature.properties = [];
    }

    const propIndex = this.newFeature.feature.properties.findIndex(
      (p) => p!.propertyId === propertyId
    );

    let updatedProperties: any[];

    if (propIndex >= 0) {
      // Update existing property
      updatedProperties = [...this.newFeature.feature.properties];
      updatedProperties[propIndex] = {
        ...updatedProperties[propIndex]!,
        ...object
      };
    } else {
      // Create new property
      const newProperty = {
        id: '', // Will be set when saved
        propertyId,
        featureId: '', // Will be set when feature is created
        value: '',
        ...object
      };

      // Only add i18n if it's provided in the object
      if (object.i18n) {
        newProperty.i18n = object.i18n;
      }

      updatedProperties = [...this.newFeature.feature.properties, newProperty];
    }

    // Create a new newFeature object to ensure reactivity
    this.newFeature = {
      ...this.newFeature,
      feature: {
        ...this.newFeature.feature,
        properties: updatedProperties
      }
    };
  };

  updateNewFeatureI18nProperty = (
    propertyId: Id,
    object: Partial<FeaturePropertyI18nDB>,
    locale: Locale = getLocale()
  ) => {
    const propIndex = this.newFeature?.feature?.properties?.findIndex(
      (p) => p!.propertyId === propertyId
    );

    if (
      propIndex !== undefined &&
      propIndex >= 0 &&
      this.newFeature?.feature?.properties?.[propIndex]?.i18n
    ) {
      this.newFeature.feature.properties[propIndex].i18n![locale] = {
        ...this.newFeature.feature.properties[propIndex].i18n![locale as Locale]!,
        ...(object as { locale: Locale; value: string; valueGen: boolean })
      };
    }
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

  resetOrganisations = () => {
    this.state.prisms.organisation = [];
    this.invalidateAndRefresh(FirstClassResource.organisation);
  };

  resetProjects = () => {
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
}
export const MAP_STATE_KEY = Symbol('mapContext');

export const setAppCtx = (queryClient: QueryClient, user: SessionUser | null) => {
  const context = new AppCtx(queryClient, user);
  context.init(user?.id ?? null);
  return setContext(MAP_STATE_KEY, context);
};

export const getAppCtx = (): ReturnType<typeof setAppCtx> => getContext(MAP_STATE_KEY);
