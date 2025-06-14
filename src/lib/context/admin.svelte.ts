// I18N
import { getLocale } from '$lib/i18n';
// LIB
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
  FirstClassResource,
  HierarchicalResource
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
  FacetType,
  Task,
  Code,
  AdminFilterStates,
  AdminFilterState,
  Resource,
  Hub
} from '../types';

// State type for AdminCtx - only includes admin-specific state
type AdminResourceState = {
  active: {
    resourceType: FirstClassResource | false;
    resourceRef: Id | Code | false;
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
    this.initializeAdminQueryMap();
  }

  // Initialize admin-specific query map on appCtx
  private initializeAdminQueryMap = (): void => {
    // Override the default query functions with admin-specific ones
    // but reuse AppCtx query keys for common resources
    this.appCtx.queryMap.set(FirstClassResource.organisation, {
      queryKey: () => this.appCtx.organisationsQueryKey,
      queryFn: () => this.organisationsQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.project, {
      queryKey: () => this.appCtx.projectsQueryKey,
      queryFn: () => this.projectsQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.layer, {
      queryKey: () => this.appCtx.layersQueryKey,
      queryFn: () => this.layersQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.feature, {
      queryKey: () => this.appCtx.featuresQueryKey,
      queryFn: () => this.featuresQueryFn()
    });

    // Admin-specific resources with their own query keys
    this.appCtx.queryMap.set(FirstClassResource.task, {
      queryKey: () => this.tasksQueryKey,
      queryFn: () => this.tasksQueryFn()
    });

    this.appCtx.queryMap.set(FirstClassResource.hub, {
      queryKey: () => this.hubsQueryKey,
      queryFn: () => this.hubsQueryFn()
    });
  };

  // ═══════════════════════
  // STATE
  // ═══════════════════════

  state: AdminResourceState = $state({
    active: {
      resourceType: false,
      resourceRef: false,
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

  activeResourceType: FirstClassResource | false = $derived(
    this.state.active.resourceType
  );
  activeResourceRef: Id | Code | false = $derived(this.state.active.resourceRef);
  activeFacet: FacetType | false = $derived(this.state.active.facet);

  // ═══════════════════════
  // ACTIVE RESOURCE :: SETTERS
  // ═══════════════════════

  setResourceType(resource: FirstClassResource | false): void {
    this.state.active.resourceType = resource;
  }

  setResourceRef(ref: Id | Code | false, resource?: FirstClassResource): void {
    // If the new entity is a different resource type to the current entity, update the state
    if (resource) {
      this.setResourceType(resource);
    }
    this.state.active.resourceRef = ref;
  }

  setFacet(
    facet: FacetType | false,
    ref?: Id | Code | false,
    resource?: FirstClassResource
  ): void {
    if (ref) this.setResourceRef(ref, resource);
    if (resource) this.setResourceType(resource);
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

  // Initialize data using appCtx's refresh methods
  init = async (): Promise<void> => {
    // Use AppCtx's cascading refresh logic but with admin query functions
    await this.appCtx.refreshOrganisations();
  };

  // ═══════════════════════
  // ADMIN QUERY :: INVALIDATION
  // ═══════════════════════

  async invalidateAndRefresh(resource: FirstClassResource) {
    await this.appCtx.invalidate(resource);
    await this.appCtx.refresh(resource);
  }

  // ═══════════════════════
  // ADMIN FILTERS
  // ═══════════════════════

  getFilteredResource = <T extends Organisation | Project | Layer | Feature | Hub>(
    resource: FirstClassResource | HierarchicalResource,
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
    resource: FirstClassResource | HierarchicalResource,
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

  // ═══════════════════════
  // ADMIN LOOKUPS
  // ═══════════════════════

  getEntityPath = (resource: FirstClassResource, id: Id) => {
    const ref = this.getResourceRef(resource, id);
    if (!ref) return null;
    return `${this.getResourcePathPart(resource)}/${ref}`;
  };

  getResourceRef = (resource: FirstClassResource, id: Id) => {
    if (!resource) return false;
    const refKey = ResourceRefKey[resource];
    const entity = this.appCtx.cache[resource].get(id);
    if (!entity) return false;
    return entity[refKey as keyof Resource];
  };

  getResourcePathPart = (resource?: FirstClassResource) => {
    const resourceKey = resource ?? this.state.active.resourceType;
    if (!resourceKey) return null;
    return ResourcePath[resourceKey];
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
      (task) => task.id === this.activeResourceRef
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

  hasManyEntities = (resource: FirstClassResource | HierarchicalResource) => {
    return this.appCtx.state.resources[resource].length > 3;
  };

  isViewportContained = $derived(
    this.activeResourceRef == false ||
      this.activeFacet == 'address' ||
      this.activeFacet == 'images' ||
      (this.activeResourceType == 'feature' &&
        (this.activeFacet == 'core' || this.activeFacet == false)) ||
      (this.activeResourceType == 'task' && this.activeResourceRef)
  );

  isShowIndex = $derived(
    this.activeResourceType &&
      (this.activeResourceRef === null || this.activeResourceRef === false)
  );
}

export const HIERARCHICAL_RESOURCE_STATE_KEY = Symbol('adminCtx');

export const setAdminCtx = (queryClient: QueryClient, appCtx: AppCtx) =>
  setContext(HIERARCHICAL_RESOURCE_STATE_KEY, new AdminCtx(queryClient, appCtx));

export const getAdminCtx = (): ReturnType<typeof setAdminCtx> =>
  getContext(HIERARCHICAL_RESOURCE_STATE_KEY);
