// DATA
import subNeighbourhoods from '$lib/map/subNeighbourhoods.json';
import { QueryClient } from '@tanstack/svelte-query';
// NAVIGATION
import { goto } from '$app/navigation';
// GEO
import { bbox } from '@turf/bbox';
// CONTEXT
import { getContext, setContext } from 'svelte';
// MARKERS
import { removeMarkerClass, addMarkerClass } from '$lib/map/markers';
// ENUMS
import { HierarchicalResource, HierarchicalResourcePath } from '$lib/types';
// TYPES
import type {
  Feature,
  Project,
  Layer,
  Organisation,
  Code,
  Id,
  UserFeature,
  mapContextState,
  PanelState,
  ActiveCollection,
  Property
} from '$lib/types';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { FeatureCollection, Feature as GeoJSONFeature } from 'geojson';
import { MOBILE_MAX_WIDTH } from '$lib';

export class mapContext {
  // Maplibre Map instance
  map: MaplibreMap | undefined = $state();
  // Tanstack Query Client instance
  queryClient: QueryClient;
  // User ID
  userId: string | null;
  // Whether the map has been initialised
  isInitialised: boolean = $state(false);

  // State
  state: mapContextState = $state({
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
      feature: []
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

  // Silly state to track if the map has been zoomed to a marker
  zoomToMarkerOnly: boolean = $state(false);

  // QueryKeys
  organisationsQueryKey = ['organisations'];
  projectsQueryKey = $derived(['projects', this.state.prisms.organisation]);
  layersQueryKey = $derived([
    'layers',
    this.state.prisms.organisation,
    this.state.prisms.project
  ]);
  featuresQueryKey = $derived([
    'features',
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.state.prisms.layer
  ]);
  userFeaturesQueryKey = ['userFeatures'];

  // Constructor
  constructor(queryClient: QueryClient, userId: string, userLayers: string[]) {
    this.queryClient = queryClient;
    if (userId !== '') {
      this.userId = userId;
      this.state.prisms.layer = userLayers || [];
    } else {
      this.userId = null;
    }
  }

  async init() {
    await this.initializeQueries(this.queryClient);
    this.postLayerMutation();
  }

  // Helper method to build API URLs with filters
  private buildApiUrl(resource: HierarchicalResource, includeFilters = true): string {
    const path = HierarchicalResourcePath[resource];
    const params = new URLSearchParams();

    // Add isArchived filter by default
    params.append('isArchived', 'false');
    params.append('isPublished', 'true');

    if (includeFilters) {
      // Add prism filters based on resource hierarchy
      if (resource !== HierarchicalResource.organisation) {
        this.state.prisms.organisation.forEach((org) =>
          params.append(HierarchicalResource.organisation, org)
        );
      }

      if (
        resource !== HierarchicalResource.organisation &&
        resource !== HierarchicalResource.project
      ) {
        this.state.prisms.project.forEach((proj) =>
          params.append(HierarchicalResource.project, proj)
        );
      }

      if (resource === HierarchicalResource.feature) {
        this.state.prisms.layer.forEach((layer) =>
          params.append(HierarchicalResource.layer, layer)
        );
      }
    }

    return `/api/${path}?${params.toString()}`;
  }

  private async fetchOrThrow<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return (await response.json()) as T;
  }

  organisationsQueryFn = async () => {
    const url = this.buildApiUrl(HierarchicalResource.organisation);
    return this.fetchOrThrow<Organisation[]>(url);
  };

  projectsQueryFn = async () => {
    const url = this.buildApiUrl(HierarchicalResource.project);
    return this.fetchOrThrow<Project[]>(url);
  };

  layersQueryFn = async () => {
    const url = this.buildApiUrl(HierarchicalResource.layer);
    return this.fetchOrThrow<Layer[]>(url);
  };

  featuresQueryFn = async () => {
    const url = this.buildApiUrl(HierarchicalResource.feature);
    return this.fetchOrThrow<Feature[]>(url);
  };

  userFeaturesQueryFn = async () => {
    const response = await fetch(`/api/userFeatures?userId=${this.userId}`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  };

  async invalidateAndRefresh(resource: HierarchicalResource | 'userFeatures') {
    // Invalidate the query
    this.queryClient.invalidateQueries({
      queryKey:
        resource === 'userFeatures'
          ? this.userFeaturesQueryKey
          : [HierarchicalResource[resource]],
      refetchType: 'all',
      exact: false
    });

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
  }

  private async initializeQueries(queryClient: QueryClient) {
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

    // Initialize user features
    this.state.userFeatures = await queryClient
      .fetchQuery({
        queryKey: this.userFeaturesQueryKey,
        queryFn: this.userFeaturesQueryFn
      })
      .then((uf) => ({
        wishlisted: uf.filter((f: UserFeature) => f.isWishlisted),
        visited: uf.filter((f: UserFeature) => f.isVisited)
      }));

    this.isInitialised = true;
  }

  // Toggle methods for hierarchical filters
  toggleOrganisation(id: Id) {
    const orgs = this.state.prisms.organisation;
    const index = orgs.indexOf(id);
    if (index === -1) {
      orgs.push(id);
    } else {
      orgs.splice(index, 1);
    }
    this.refreshProjects();
  }

  toggleProject(id: Id) {
    const projs = this.state.prisms.project;
    const index = projs.indexOf(id);
    if (index === -1) {
      projs.push(id);
    } else {
      projs.splice(index, 1);
    }
    this.refreshLayers();
  }

  // TODO : Clear the Omnibar when a layer is toggled
  toggleLayer(id: Id) {
    const layers = this.state.prisms.layer;
    const index = layers.indexOf(id);
    if (index === -1) {
      this.addLayer(id);
    } else {
      this.removeLayer(id);
    }
  }

  addLayer(id: Id) {
    this.state.prisms.layer.push(id);
    this.postLayerMutation();
  }

  removeLayer(id: Id) {
    this.state.prisms.layer = this.state.prisms.layer.filter((l) => l !== id);
    this.postLayerMutation();
  }

  setLayers(layers: Id[]) {
    this.state.prisms.layer = layers;
    this.postLayerMutation();
  }

  initialiseCategoricalPropertyFilters(layerId: Id) {
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
  }

  initialiseRangePropertyFilter(layerId: Id) {
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
        layerFilters[property.key] = {
          globalMin: min,
          globalMax: max,
          rangeMin: min, // Default rangeMin to globalMin
          rangeMax: max // Default rangeMax to globalMax
        };
      }
    });
  }

  postLayerMutation() {
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

    this.refreshFeatures();
  }

  async refreshProjects() {
    this.state.resources.project = await this.queryClient.fetchQuery({
      queryKey: this.projectsQueryKey,
      queryFn: this.projectsQueryFn
    });
    this.syncProjectPrisms();
    this.refreshLayers();
  }

  async refreshLayers() {
    this.state.resources.layer = await this.queryClient.fetchQuery({
      queryKey: this.layersQueryKey,
      queryFn: this.layersQueryFn
    });
    this.syncLayerPrisms();
    this.postLayerMutation();
    this.refreshFeatures();
  }

  async refreshFeatures() {
    this.state.resources.feature = await this.queryClient.fetchQuery({
      queryKey: this.featuresQueryKey,
      queryFn: this.featuresQueryFn
    });
  }

  async refreshUserFeatures() {
    this.state.userFeatures = await this.queryClient
      .fetchQuery({
        queryKey: this.userFeaturesQueryKey,
        queryFn: this.userFeaturesQueryFn
      })
      .then((uf) => ({
        wishlisted: uf.filter((f: UserFeature) => f.isWishlisted),
        visited: uf.filter((f: UserFeature) => f.isVisited)
      }));
  }

  async syncProjectPrisms() {
    this.state.prisms.project = this.state.prisms.project.filter((project) => {
      return this.state.resources.project.some((p) => p.id === project);
    });
  }

  async syncLayerPrisms() {
    this.state.prisms.layer = this.state.prisms.layer.filter((layer) => {
      return this.state.resources.layer.some((l) => l.id === layer);
    });
  }

  // FILTERS

  // FILTERS - NEIGHBOURHOODS

  toggleNeighbourhood(name: string) {
    const current = this.state.filters.neighbourhoods;
    this.state.filters.neighbourhoods = current.includes(name)
      ? current.filter((n) => n !== name).sort()
      : [...current, name].sort();
  }

  clearNeighbourhoods() {
    this.state.filters.neighbourhoods = [];
  }

  // getNeighbourhoodParams(): URLSearchParams {
  //   const params = new URLSearchParams();
  //   this.state.filters.neighbourhoods.forEach((n) => {
  //     params.append('addressProperties.neighbourhood', n);
  //   });
  //   return params;
  // }

  // FILTERS - GENERIC

  getFilterCount(): { neighbourhoods: number; properties: number } {
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
  }

  resetFilters() {
    this.state.filters = { neighbourhoods: [], properties: {} };
    this.state.prisms.layer.forEach((layerId) => {
      this.initialiseCategoricalPropertyFilters(layerId);
      this.initialiseRangePropertyFilter(layerId);
    });
  }

  // PRISM RELATIONS

  getOrganisation = (project: Project): Organisation | undefined =>
    project
      ? this.state.resources.organisation.find(
          (org) => org.id === project.organisationId
        )
      : undefined;

  getProject = (layer: Layer): Project | undefined =>
    layer
      ? this.state.resources.project.find((proj) => proj.id === layer.projectId)
      : undefined;

  getLayer = (feature: Feature): Layer | undefined =>
    this.state.resources.layer.find((layer) => layer.id === feature.layerId);

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
              (p) => p.property.key === propertyKey
            );

            // If the feature doesn't have this property defined, it cannot match the filter.
            if (!featureProperty) {
              return false;
            }

            // Use the propertyValue if available (typically for linked values), otherwise fallback to the direct value
            const featureValue =
              featureProperty.propertyValue?.value ?? featureProperty.value;

            // If the feature has the property but the value is null/undefined, it also cannot match.
            if (featureValue === undefined || featureValue === null) {
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
    return this.state.userFeatures.wishlisted.map((wl) => wl.featureId);
  };

  // Features (for Active Layers) that the user has visited
  getVisitedFeatureIds = (): Id[] => {
    return this.state.userFeatures.visited.map((wl) => wl.featureId);
  };

  getWishlistUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures.wishlisted || [];
  };

  getVisitedUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures.visited || [];
  };

  // Features Collection -- Subsets

  getActiveCollection = (): ActiveCollection | null => this.state.active.collection;

  setActiveCollection(
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
  ) {
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
  }

  getActiveFeature = (): Feature | null => this.state.active.feature;

  setActiveFeature(
    featureId: Id,
    options: { focus: boolean; isCardOpen?: boolean | null } = {
      focus: false,
      isCardOpen: null
    }
  ) {
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
  }

  highlightActiveCollection(options: { focus: boolean } = { focus: false }) {
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
  }

  unhighlightAllFeatures() {
    // Remove "highlighted" class from all features
    this.state.resources.feature.forEach((f) => {
      removeMarkerClass(this, f.id, 'highlighted');
    });
  }

  resetActiveCollection() {
    // Remove "highlighted" class from all features
    this.unhighlightAllFeatures();
    // Reset active collection
    this.state.active.collection = null;
    // Remove 'active' class from the active feature
    this.state.active.feature?.id &&
      removeMarkerClass(this, this.state.active.feature.id);
    // Reset active feature
    this.state.active.feature = null;
  }

  // NAVIGATION METHODS

  navNext(options: { isCardOpen: boolean } = { isCardOpen: true }) {
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
  }

  navPrevious(options: { isCardOpen: boolean } = { isCardOpen: true }) {
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
  }

  navToIndex(index: number, options: { isCardOpen: boolean } = { isCardOpen: true }) {
    if (index > 0) {
      this.setActiveFeature(this.state.active.collection?.items[index]?.id as Id, {
        ...options,
        focus: true
      });
    }
  }

  // MAP OPERATIONS -- REBOUNDING

  zoomToActiveCollection() {
    const features = this.getActiveCollection()?.items || [];
    this.zoomToFeatures(features);
  }

  zoomToActiveFeature() {
    const feature = this.getActiveFeature();
    if (!feature) return;
    this.zoomToFeatures([feature]);
  }

  zoomToFeatures(features?: Feature[]) {
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
    const padding = {
      top: 150,
      bottom: 50,
      right: 50 + (this.state.panels.filters || this.state.panels.settings ? 210 : 0),
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
  }

  zoomToCoordinates(coordinates: [number, number][]) {
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
  }
  // FILTER Utils

  expandToSubNeighbourhoods(neighbourhoodKey: string) {
    let neighbourhoodFeatures = [];
    if (neighbourhoodKey in subNeighbourhoods) {
      subNeighbourhoods[neighbourhoodKey as keyof typeof subNeighbourhoods].forEach(
        (n) => {
          neighbourhoodFeatures.push(
            ...this.state.resources.feature.filter(
              (feature) => n === feature.addressProperties?.neighbourhood
            )
          );
        }
      );
    } else {
      neighbourhoodFeatures.push(
        ...this.state.resources.feature.filter(
          (feature) => neighbourhoodKey === feature.addressProperties?.neighbourhood
        )
      );
    }
    return neighbourhoodFeatures;
  }

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
      // Ensure the property object exists and merge values
      const existingRangeFilter =
        this.state.filters.properties![layerId]?.[propertyKey] || {};
      this.state.filters.properties![layerId][propertyKey] = {
        ...existingRangeFilter, // Preserve globalMin/globalMax
        rangeMin: values[0],
        rangeMax: values[1]
      };
    }
  };

  // FEATURE COLLECTIONS -- Utils

  getFeatureById = (id: Id): Feature => {
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

  startCircularFlight(center: [number, number], radiusKm: number = 5) {
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
  }

  // Panel methods
  togglePanel(panel: keyof PanelState, closeAll: boolean = false) {
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
  }

  focusPanel(position: 'left' | 'right') {
    let panelElement = null;
    setTimeout(() => {
      panelElement = document.getElementById(`${position}-panel`);
      const inputElement = panelElement?.querySelector('input');
      console.log(panelElement, inputElement);
      if (inputElement) {
        inputElement.focus();
      } else {
        panelElement?.focus();
      }
    }, 250);
  }

  closeLeftPanel() {
    this.state.panels.filters = false;
    this.state.panels.maps = false;
  }

  closeRightPanel() {
    this.state.panels.stars = false;
    this.state.panels.settings = false;
  }

  closeAllPanels() {
    Object.keys(this.state.panels).forEach((panel) => {
      this.state.panels[panel as keyof PanelState] = false;
    });
  }

  openPanel(panel: keyof PanelState) {
    this.state.panels[panel] = true;
  }

  closePanel(panel: keyof PanelState) {
    this.state.panels[panel] = false;
  }
  // KEYDOWN HANDLERS
  registerKeydownHandlers() {
    document.addEventListener('keydown', this.handleKeydown);
  }

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
}
export const MAP_STATE_KEY = Symbol('mapContext');

export const setMapContext = (
  queryClient: QueryClient,
  userId: string,
  userLayers: string[]
) => {
  const context = new mapContext(queryClient, userId, userLayers);
  context.init();
  return setContext(MAP_STATE_KEY, context);
};

export const getMapContext = (): ReturnType<typeof setMapContext> =>
  getContext(MAP_STATE_KEY);
