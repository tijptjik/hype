// I18N
import { getLocale } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
import { navigateOnAdmin } from '$lib/navigation';
import { fetchOrThrow } from '$lib/index';
// CONTEXT
import { getContext, setContext } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { AppCtx } from '$lib/context/app.svelte';
// ENUMS
import {
  ResourcePath,
  ResourceRefKey as ResourceRefKey,
  FirstClassResource
} from '$lib/enums';
// GUARDS
import { isHub } from '$lib/types';
// TYPES
import type {
  Organisation,
  Project,
  Layer,
  Feature,
  Id,
  ResourceState as ResourceStateType,
  FacetType,
  Task,
  Code,
  AdminFilterStates,
  AdminFilterState,
  Resource,
  ResourceTypeWithChildren,
  Hub,
  UserRoleDisco,
  SessionUser
} from '../types';

// State type for AdminCtx - only includes admin-specific state
type AdminResourceState = {
  active: {
    resource: FirstClassResource | false;
    entity: Id | Code | false;
    facet: FacetType | false;
  };
  filters: AdminFilterStates;
};

export class AdminCtx {
  // ═══════════════════════
  // TABLE OF CONTENTS
  // ═══════════════════════
  // 1. CONSTRUCTOR
  // 2. STATE
  //
  // 3.1 ACTIVE RESOURCES
  // 3.2 ACTIVE RESOURCE :: GETTERS
  // 3.3 ACTIVE RESOURCE :: SETTERS
  //
  // 4.1 ADMIN QUERY :: KEYS
  // 4.2 ADMIN QUERY :: URLS
  // 4.3 ADMIN QUERY :: FUNCTIONS
  // 4.4 ADMIN QUERY :: INIT
  // 4.5 ADMIN QUERY :: INVALIDATION
  //
  // 5.1 ADMIN FILTERS
  // 5.2 ADMIN FILTERS :: DERIVED
  // 5.3 ADMIN FILTERS :: MUTATION
  //
  // 6 ADMIN LOOKUPS
  // 7. NAVIGATION
  // 8. UTILS :: LAYOUT

  // Tanstack Query Client instance
  queryClient: QueryClient;
  // App Context
  appCtx: AppCtx;

  // ═══════════════════════
  // CONSTRUCTOR
  // ═══════════════════════

  constructor(queryClient: QueryClient, appCtx: AppCtx) {
    this.queryClient = queryClient;
    this.appCtx = appCtx;
    this.initializeQueries(queryClient);
  }

  // ═══════════════════════
  // STATE
  // ═══════════════════════

  state: AdminResourceState = $state({
    active: {
      resource: false,
      entity: false,
      facet: false
    },
    filters: {
      organisation: { text: '', properties: {}, isPublished: null, isArchived: false },
      project: { text: '', properties: {}, isPublished: null, isArchived: false },
      layer: { text: '', properties: {}, isPublished: null, isArchived: false },
      feature: { text: '', properties: {}, isPublished: null, isArchived: false },
      task: { text: '', properties: {}, isReviewed: false },
      hub: { text: '', properties: {}, isArchived: false }
    }
  });

  // ═══════════════════════
  // ACTIVE RESOURCES
  // ═══════════════════════

  activeResource = $derived(this.state.active.resource);
  activeEntity = $derived(this.state.active.entity);
  activeFacet = $derived(this.state.active.facet);

  activeEntityHref = $derived(
    this.activeResource && this.activeEntity
      ? `${ADMIN_PATH}/${ResourcePath[this.activeResource]}/${this.activeEntity}`
      : null
  );

  // ═══════════════════════
  // ACTIVE RESOURCE :: GETTERS
  // ═══════════════════════

  getEntities = (resource?: FirstClassResource) => {
    let resourceKey = resource ?? this.state.active.resource;
    if (!resourceKey) return [];
    return this.appCtx.state.resources[resourceKey];
  };

  getEntity(resource?: FirstClassResource, entityRef?: Id | Code, byId = false) {
    let resourceKey = resource ?? this.activeResource;
    let entityRefKey = byId ? 'id' : resourceKey ? ResourceRefKey[resourceKey] : null;
    if (!entityRefKey || !resourceKey) return null;
    return this.appCtx.state.resources[resourceKey].find(
      (entity) =>
        entity[entityRefKey as keyof Resource] ===
        (entityRef ? entityRef : this.activeEntity)
    );
  }

  // ═══════════════════════
  // ACTIVE RESOURCE :: SETTERS
  // ═══════════════════════

  setResource(resource: FirstClassResource | false) {
    this.state.active.resource = resource;
  }

  setEntity(entity: Id | Code | false, resource?: FirstClassResource) {
    // If the new entity is a different resource type to the current entity, update the state
    if (resource) {
      this.setResource(resource);
    }
    this.state.active.entity = entity;
  }

  setFacet(facet: FacetType | false) {
    this.state.active.facet = facet;
  }

  // ═══════════════════════
  // ADMIN QUERY KEYS
  // ═══════════════════════

  get tasksQueryKey() {
    return [
      FirstClassResource.task,
      this.appCtx.state.prisms.organisation,
      this.appCtx.state.prisms.project,
      this.state.filters[FirstClassResource.task].isReviewed
    ];
  }

  get hubsQueryKey() {
    return ['hub'];
  }

  // ═══════════════════════
  // ADMIN QUERY URLS
  // ═══════════════════════

  // Helper method to build API URLs with filters
  private buildApiUrl(resource: FirstClassResource, includeFilters = true): string {
    const path = ResourcePath[resource];
    const params = new URLSearchParams();

    // Add isArchived / isReviewed filter by default
    if (resource !== FirstClassResource.task) {
      // SuperAdmin users should see all archived resources, so don't force isArchived=false
      if (!this.appCtx.isSuperAdmin()) {
        params.append('isArchived', 'false');
      }
    } else {
      const isReviewed = this.state.filters[FirstClassResource.task].isReviewed;
      if (isReviewed !== null) {
        params.append('isReviewed', isReviewed!.toString());
      }
    }

    if (includeFilters) {
      // Add prism filters based on resource hierarchy
      if (resource !== FirstClassResource.organisation) {
        this.appCtx.state.prisms.organisation.forEach((org) =>
          params.append(FirstClassResource.organisation, org)
        );
      }

      if (
        resource !== FirstClassResource.organisation &&
        resource !== FirstClassResource.project
      ) {
        this.appCtx.state.prisms.project.forEach((proj) =>
          params.append(FirstClassResource.project, proj)
        );
      }

      if (resource === FirstClassResource.feature) {
        this.appCtx.state.prisms.layer.forEach((layer) =>
          params.append(FirstClassResource.layer, layer)
        );
      }
    }

    return `/api/${path}?${params.toString()}`;
  }

  // ═══════════════════════
  // ADMIN QUERY :: FUNCTIONS
  // ═══════════════════════

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

  tasksQueryFn = async () => {
    const url = this.buildApiUrl(FirstClassResource.task);
    return fetchOrThrow<Task[]>(url);
  };

  hubsQueryFn = async () => {
    if (!this.appCtx.isSuperAdmin()) return [];
    const url = this.buildApiUrl(FirstClassResource.hub);
    return fetchOrThrow<Hub[]>(url);
  };

  // ═══════════════════════
  // ADMIN QUERY :: INIT
  // ═══════════════════════

  private async initializeQueries(queryClient: QueryClient) {
    // Organizations query
    this.appCtx.state.resources.organisation = await queryClient.fetchQuery({
      queryKey: this.appCtx.organisationsQueryKey,
      queryFn: this.organisationsQueryFn
    });

    // Projects query
    this.appCtx.state.resources.project = await queryClient.fetchQuery({
      queryKey: this.appCtx.projectsQueryKey,
      queryFn: this.projectsQueryFn
    });

    // Layers query
    this.appCtx.state.resources.layer = await queryClient.fetchQuery({
      queryKey: this.appCtx.layersQueryKey,
      queryFn: this.layersQueryFn
    });

    // Features query
    this.appCtx.state.resources.feature = await queryClient.fetchQuery({
      queryKey: this.appCtx.featuresQueryKey,
      queryFn: this.featuresQueryFn
    });

    // Tasks query
    this.appCtx.state.resources.task = await queryClient.fetchQuery({
      queryKey: this.tasksQueryKey,
      queryFn: this.tasksQueryFn
    });

    // Hubs query (SuperAdmin only)
    if (this.appCtx.isSuperAdmin()) {
      this.appCtx.state.resources.hub = await queryClient.fetchQuery({
        queryKey: this.hubsQueryKey,
        queryFn: this.hubsQueryFn
      });
    }
  }

  // ═══════════════════════
  // ADMIN QUERY :: INVALIDATION
  // ═══════════════════════

  async invalidateAndRefresh(resource: FirstClassResource) {
    await this.appCtx.invalidate(resource);
    await this.refresh(resource);
  }

  // Cascades refresh to the next resource in the hierarchy
  // Cascades refresh to the next resource in the hierarchy
  refresh = async (resource: FirstClassResource) => {
    // Refresh the resources
    if (resource === 'organisation') {
      this.refreshOrganisation();
    } else if (resource === 'project') {
      this.refreshProjects();
    } else if (resource === 'layer') {
      this.refreshLayers();
    } else if (resource === 'feature') {
      this.refreshFeatures();
    } else if (resource === 'task') {
      this.refreshTasks();
    } else if (resource === 'hub') {
      this.refreshHubs();
    }
  };

  async refreshOrganisation() {
    this.appCtx.state.resources.organisation = await this.queryClient.fetchQuery({
      queryKey: this.appCtx.organisationsQueryKey,
      queryFn: this.organisationsQueryFn
    });
  }

  async refreshProjects() {
    this.appCtx.state.resources.project = await this.queryClient.fetchQuery({
      queryKey: this.appCtx.projectsQueryKey,
      queryFn: this.projectsQueryFn
    });
    this.appCtx.syncProjectPrisms();
    this.refreshLayers();
  }

  async refreshLayers() {
    this.appCtx.state.resources.layer = await this.queryClient.fetchQuery({
      queryKey: this.appCtx.layersQueryKey,
      queryFn: this.layersQueryFn
    });
    this.appCtx.syncLayerPrisms();
    this.refreshFeatures();
  }

  async refreshFeatures() {
    this.appCtx.state.resources.feature = await this.queryClient.fetchQuery({
      queryKey: this.appCtx.featuresQueryKey,
      queryFn: this.featuresQueryFn
    });
    this.refreshTasks();
  }

  async refreshTasks() {
    this.appCtx.state.resources.task = await this.queryClient.fetchQuery({
      queryKey: this.tasksQueryKey,
      queryFn: this.tasksQueryFn
    });
  }

  async refreshHubs() {
    if (!this.appCtx.isSuperAdmin()) return;
    this.appCtx.state.resources.hub = await this.queryClient.fetchQuery({
      queryKey: this.hubsQueryKey,
      queryFn: this.hubsQueryFn
    });
  }

  // ═══════════════════════
  // ADMIN FILTERS
  // ═══════════════════════

  getFilteredResource = <T extends Organisation | Project | Layer | Feature | Hub>(
    resource: FirstClassResource,
    filters = { text: true, state: true }
  ): T[] => {
    let filterKeys = ['isPublished', 'isArchived'];
    let query = this.state.filters[resource as keyof AdminFilterStates].text || '';
    // FULL SET
    let result = this.appCtx.state.resources[resource] as T[];
    // STATE FILTERS
    if (filters.state) {
      result = result.filter((entity) =>
        filterKeys.every((key) => this.booleanFilter(resource, entity, key))
      );
    }
    // TEXT FILTERS
    if (filters.text && resource !== FirstClassResource.hub) {
      result = result.filter((entity: T) => {
        if (!isHub(entity)) {
          return this.textFilter(
            resource as Omit<FirstClassResource, 'hub'> as FirstClassResource,
            entity,
            query
          );
        }
      });
    }
    return result;
  };

  getFilteredTask = () => {
    let query = this.state.filters.task.text || '';
    // FULL SET
    let result: Task[] = this.appCtx.state.resources.task;

    // STATE FILTERS - isReviewed filter
    if (this.state.filters.task.isReviewed !== null) {
      result = result.filter((entity) =>
        this.booleanFilter(FirstClassResource.task, entity, 'isReviewed')
      );
    }

    // TEXT FILTER
    if (query) {
      result = result.filter((entity) => {
        // Get related entities using IDs
        const feature = this.appCtx.state.resources.feature.find(
          (f) => f.id === entity.featureId
        );
        const project = this.appCtx.state.resources.project.find(
          (p) => p.id === entity.projectId
        );
        const organisation = this.appCtx.state.resources.organisation.find(
          (o) => o.id === entity.organisationId
        );

        return (
          (feature && this.textFilter(FirstClassResource.feature, feature, query)) ||
          (project && this.textFilter(FirstClassResource.project, project, query)) ||
          (organisation &&
            this.textFilter(FirstClassResource.organisation, organisation, query)) ||
          entity.message?.toLowerCase().includes(query.toLowerCase())
        );
      });
    }

    return result;
  };

  getFilteredHub = () => {
    if (!this.appCtx.isSuperAdmin()) return [];
    let query = this.state.filters.hub.text || '';
    // FULL SET
    let result: Hub[] = this.appCtx.state.resources.hub;

    // STATE FILTERS
    result = result.filter((entity) =>
      ['isArchived'].every((key) => this.booleanFilter('hub' as any, entity, key))
    );

    // TEXT FILTER - Simple text search on code and domain
    if (query) {
      result = result.filter(
        (entity) =>
          entity.code?.toLowerCase().includes(query.toLowerCase()) ||
          entity.domain?.toLowerCase().includes(query.toLowerCase()) ||
          entity.organisations?.some((org) =>
            org.i18n?.[getLocale()]?.name?.toLowerCase().includes(query.toLowerCase())
          )
      );
    }

    return result;
  };

  booleanFilter = (
    resource: FirstClassResource,
    entity: Resource,
    property: string
  ) => {
    const filterState = this.state.filters[resource as keyof AdminFilterStates];
    const filterValue = filterState[property as keyof AdminFilterState];
    return filterValue === null || filterValue === entity[property as keyof Resource];
  };

  textFilter = <T extends Organisation | Project | Layer | Feature>(
    resource: FirstClassResource,
    entity: T,
    query: string
  ) => {
    const textObject = entity.i18n?.[getLocale()];
    if (!textObject) return false;
    return (
      query === '' ||
      textObject.name?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.title?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.nameShort?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.description?.toLowerCase().includes(query.toLowerCase()) ||
      textObject.address?.toLowerCase().includes(query.toLowerCase())
    );
  };

  // ═══════════════════════
  // ADMIN FILTERS :: DERIVED
  // ═══════════════════════

  // Filtered Helpers
  filteredOrganisations = $derived.by(() => {
    // Explicitly access reactive dependencies so Svelte tracks them
    this.appCtx.state.resources.organisation;
    this.state.filters.organisation;
    return this.getFilteredResource<Organisation>(FirstClassResource.organisation);
  });
  filteredProjects = $derived.by(() => {
    this.appCtx.state.resources.project;
    this.state.filters.project;
    return this.getFilteredResource<Project>(FirstClassResource.project);
  });
  filteredLayers = $derived.by(() => {
    this.appCtx.state.resources.layer;
    this.state.filters.layer;
    return this.getFilteredResource<Layer>(FirstClassResource.layer);
  }) as Layer[];
  filteredFeatures = $derived.by(() => {
    this.appCtx.state.resources.feature;
    this.state.filters.feature;
    return this.getFilteredResource<Feature>(FirstClassResource.feature);
  });
  filteredTasks = $derived.by(() => {
    this.appCtx.state.resources.task;
    this.state.filters.task;
    return this.getFilteredTask();
  });
  filteredHubs = $derived.by(() => {
    if (!this.appCtx.isSuperAdmin()) return [];
    this.appCtx.state.resources.hub;
    this.state.filters.hub;
    return this.getFilteredHub();
  });

  // ═══════════════════════
  // ADMIN FILTERS :: MUTATION
  // ═══════════════════════

  toggleFilter = (
    resource: FirstClassResource,
    property: 'isPublished' | 'isArchived' | 'isReviewed'
  ) => {
    this.state.filters[resource][property] = !this.state.filters[resource][property];
  };

  // PRISM RELATIONS

  getResourcePath = (resource?: FirstClassResource) => {
    const resourceKey = resource ?? this.state.active.resource;
    if (!resourceKey) return null;
    return ResourcePath[resourceKey];
  };

  // ═══════════════════════
  // ADMIN LOOKUPS
  // ═══════════════════════

  getEntityRef = (resource: FirstClassResource, id: Id) => {
    if (!resource) return false;
    const refKey = ResourceRefKey[resource];
    const entity = this.appCtx.state.resources[resource].find(
      (entity) => entity.id === id
    );
    if (!entity) return false;
    return entity[refKey as keyof Resource];
  };

  getEntityPath = (resource: FirstClassResource, id: Id) => {
    const ref = this.getEntityRef(resource, id);
    if (!ref) return null;
    return `${this.getResourcePath(resource)}/${ref}`;
  };

  // Hierarchical Resource Helpers
  getAscendantOrSelf = (
    entity: Resource,
    resource: FirstClassResource,
    ascendantResource: FirstClassResource
  ): Resource | null => {
    // If the resource is the same as the ascendant resource, return itself
    if (resource === ascendantResource) return entity;
    // Organisation is the top level resource
    if (resource === FirstClassResource.organisation) return null;
    // Go through the hierarchy to find the ascendant
    let isDescendant = false;
    if (
      resource == FirstClassResource.feature &&
      ascendantResource != FirstClassResource.feature
    ) {
      entity = this.appCtx.getLayer(entity as Feature) as Layer;
      isDescendant = true;
    }
    if (
      (resource == FirstClassResource.layer || isDescendant) &&
      ascendantResource != FirstClassResource.layer
    ) {
      entity = this.appCtx.getProject(entity as Layer) as Project;
      isDescendant = true;
    }
    if (
      (resource == FirstClassResource.project || isDescendant) &&
      ascendantResource != FirstClassResource.project
    ) {
      entity = this.appCtx.getOrganisation(entity as Project) as Organisation;
      isDescendant = true;
    }
    // Return the ascendant or null if an invalid ancestry relationship was provided
    return isDescendant ? entity : null;
  };

  // ═══════════════════════
  // NAVIGATION
  // ═══════════════════════

  /**
   * Navigates to the next task. If the current task is the last task, it will navigate to the previous task. If no tasks are available, it will navigate to the overview.
   */

  goToNextTask = () => {
    let nextIndex;
    const currentIndex = this.filteredTasks.findIndex(
      (task) => task.id === this.activeEntity
    );
    const taskCount = this.filteredTasks.length;

    if (currentIndex !== -1) {
      if (currentIndex < taskCount - 1) {
        nextIndex = currentIndex + 1;
      } else if (currentIndex === taskCount - 1 && taskCount > 1) {
        nextIndex = currentIndex - 1;
      } else {
        nextIndex = undefined;
      }
    }
    const nextTaskId =
      nextIndex !== undefined ? this.filteredTasks[nextIndex].id : undefined;
    this.invalidateAndRefresh(FirstClassResource.task);
    navigateOnAdmin(this, FirstClassResource.task!, nextTaskId);
  };

  // ═══════════════════════
  // UTILS :: LAYOUT
  // ═══════════════════════

  hasManyEntities = (resource: FirstClassResource) => {
    return this.appCtx.state.resources[resource].length > 3;
  };

  isViewportContained = $derived(
    this.activeEntity == false ||
      this.activeFacet == 'address' ||
      this.activeFacet == 'images' ||
      (this.activeResource == 'feature' &&
        (this.activeFacet == 'core' || this.activeFacet == false)) ||
      (this.activeResource == 'task' && this.activeEntity)
  );

  isShowIndex = $derived(
    this.activeResource && (this.activeEntity === null || this.activeEntity === false)
  );
}

export const HIERARCHICAL_RESOURCE_STATE_KEY = Symbol('adminCtx');

export const setAdminCtx = (queryClient: QueryClient, appCtx: AppCtx) =>
  setContext(HIERARCHICAL_RESOURCE_STATE_KEY, new AdminCtx(queryClient, appCtx));

export const getAdminCtx = (): ReturnType<typeof setAdminCtx> =>
  getContext(HIERARCHICAL_RESOURCE_STATE_KEY);
