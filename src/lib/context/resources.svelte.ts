// LIB
import { ADMIN_PATH } from '$lib/index';
// CONTEXT
import { getContext, setContext } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
// ENUMS
import {
  HierarchicalResource,
  HierarchicalResourcePath,
  HierarchicalResourceRefKey
} from '$lib/types';
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
  ResourceTypeWithChildren
} from '../types';
import type { UserRole } from '$lib/auth/utils';
import type { Page } from '@sveltejs/kit';
import { navigateOnAdmin } from '$lib/navigation';
const nullOrEquals = (a: any, b: any) => {
  return a == null || a === b;
};

export class ResourceState {
  // Tanstack Query Client instance
  queryClient: QueryClient;
  // User Roles
  userRoles: UserRole[];
  // Whether the queryClient has been initialised
  isInitialised: boolean = $state(false);

  // State
  state: ResourceStateType = $state({
    active: {
      resource: false,
      entity: false,
      facet: false
    },
    prisms: { organisation: [], project: [], layer: [] },
    resources: {
      organisation: [],
      project: [],
      layer: [],
      feature: [],
      task: []
    },
    filters: {
      organisation: { text: '', properties: {}, isPublished: null, isArchived: false },
      project: { text: '', properties: {}, isPublished: null, isArchived: false },
      layer: { text: '', properties: {}, isPublished: null, isArchived: false },
      feature: { text: '', properties: {}, isPublished: null, isArchived: false },
      task: { text: '', properties: {}, isReviewed: false }
    }
  });

  // Active Helpers
  activeResource = $derived(this.state.active.resource);
  activeEntity = $derived(this.state.active.entity);
  activeFacet = $derived(this.state.active.facet);

  activeEntityRefKey = $derived(
    HierarchicalResourceRefKey[
      this.activeResource as keyof typeof HierarchicalResourceRefKey
    ]
  );

  isShowIndex = $derived(
    this.activeResource && (this.activeEntity === null || this.activeEntity === false)
  );

  activeEntityHref = $derived(
    this.activeResource && this.activeEntity
      ? `${ADMIN_PATH}/${HierarchicalResourcePath[this.activeResource]}/${this.activeEntity}`
      : null
  );

  // QueryKeys
  organisationsQueryKey = [HierarchicalResource.organisation];
  projectsQueryKey = $derived([
    HierarchicalResource.project,
    this.state.prisms.organisation
  ]);
  layersQueryKey = $derived([
    HierarchicalResource.layer,
    this.state.prisms.organisation,
    this.state.prisms.project
  ]);
  featuresQueryKey = $derived([
    HierarchicalResource.feature,
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.state.prisms.layer
  ]);
  tasksQueryKey = $derived([
    HierarchicalResource.task,
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.state.filters[HierarchicalResource.task].isReviewed
  ]);

  // Constructor
  constructor(queryClient: QueryClient, userRoles: UserRole[]) {
    this.queryClient = queryClient;
    this.userRoles = userRoles;
    this.initializeQueries(queryClient);
  }

  // Helper method to build API URLs with filters
  private buildApiUrl(resource: HierarchicalResource, includeFilters = true): string {
    const path = HierarchicalResourcePath[resource];
    const params = new URLSearchParams();

    // Add isAdminView filter by default
    params.append('isAdminView', 'true');

    // Add isArchived / isReviewed filter by default
    if (resource !== HierarchicalResource.task) {
      params.append('isArchived', 'false');
    } else {
      const isReviewed = this.state.filters[HierarchicalResource.task].isReviewed;
      if (isReviewed !== null) {
        params.append('isReviewed', isReviewed!.toString());
      }
    }

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

  tasksQueryFn = async () => {
    const url = this.buildApiUrl(HierarchicalResource.task);
    return this.fetchOrThrow<Task[]>(url);
  };

  // Initialize Queries
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

    // Tasks query
    this.state.resources.task = await queryClient.fetchQuery({
      queryKey: this.tasksQueryKey,
      queryFn: this.tasksQueryFn
    });

    this.isInitialised = true;
  }

  togglePrism = (resource: HierarchicalResource, id: Id) => {
    const prisms = this.state.prisms[resource as ResourceTypeWithChildren];
    const index = prisms.indexOf(id);
    if (index === -1) {
      prisms.push(id);
    } else {
      prisms.splice(index, 1);
    }
    this.cascadeRefreshResources(resource);
  };

  cascadeRefreshResources = async (resource: HierarchicalResource) => {
    if (resource === HierarchicalResource.organisation) {
      this.refreshProjects();
    } else if (resource === HierarchicalResource.project) {
      this.refreshLayers();
    } else if (resource === HierarchicalResource.layer) {
      this.refreshFeatures();
    }
  };

  refreshResources = async (resource: HierarchicalResource) => {
    if (resource === HierarchicalResource.organisation) {
      this.refreshOrganisation();
    } else if (resource === HierarchicalResource.project) {
      this.refreshProjects();
    } else if (resource === HierarchicalResource.layer) {
      this.refreshLayers();
    } else if (resource === HierarchicalResource.feature) {
      this.refreshFeatures();
    } else if (resource === HierarchicalResource.task) {
      this.refreshTasks();
    }
  };

  // Toggle methods for hierarchical filters
  toggleOrganisation(id: Id) {
    this.togglePrism(HierarchicalResource.organisation, id);
  }

  toggleProject(id: Id) {
    this.togglePrism(HierarchicalResource.project, id);
  }

  toggleLayer(id: Id) {
    this.togglePrism(HierarchicalResource.layer, id);
  }

  toggleFeature(id: Id) {
    this.togglePrism(HierarchicalResource.feature, id);
  }

  async refreshOrganisation() {
    this.state.resources.organisation = await this.queryClient.fetchQuery({
      queryKey: this.organisationsQueryKey,
      queryFn: this.organisationsQueryFn
    });
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
    this.refreshFeatures();
  }

  async refreshFeatures() {
    this.state.resources.feature = await this.queryClient.fetchQuery({
      queryKey: this.featuresQueryKey,
      queryFn: this.featuresQueryFn
    });
    this.refreshTasks();
  }

  async refreshTasks() {
    this.state.resources.task = await this.queryClient.fetchQuery({
      queryKey: this.tasksQueryKey,
      queryFn: this.tasksQueryFn
    });
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

  async invalidateAndRefresh(resource: HierarchicalResource) {
    // Invalidate the session
    // TODO Find a way to invalidate the userRoles

    // Invalidate the query
    this.queryClient.invalidateQueries({
      queryKey: [HierarchicalResource[resource]],
      refetchType: 'all',
      exact: false
    });
    // Refresh the resources
    this.refreshResources(resource);
  }

  // FILTERS

  getFilteredResource = (
    resource: HierarchicalResource,
    filters = { text: true, state: true, access: true }
  ) => {
    let filterKeys = ['isPublished', 'isArchived'];
    let query = this.state.filters[resource as keyof AdminFilterStates].text || '';
    // FULL SET
    let result = this.state.resources[resource];
    // STATE FILTERS
    result = result.filter((entity) =>
      filters.state
        ? filterKeys.every((key) => this.booleanFilter(resource, entity, key))
        : true
    );
    // TEXT FILTERS
    result = result.filter((entity) =>
      filters.text ? this.textFilter(resource, entity, query) : true
    );
    // ACCESS FILTERS
    result = filters.access ? this.accessFilter(resource, result) : result;

    return result;
  };

  accessFilter = (resource: HierarchicalResource, result: Resource[]) => {
    if (resource === HierarchicalResource.organisation) {
      return result.filter((organisation) =>
        this.hasOrganisationRole(organisation.id as Id)
      );
    } else if (resource === HierarchicalResource.project) {
      return result.filter((project) => this.hasProjectRole(project.id as Id));
    } else if (resource === HierarchicalResource.layer) {
      return result.filter((layer) => this.hasProjectRole(layer.projectId! as Id));
    } else if (resource === HierarchicalResource.feature) {
      return result.filter((feature) => {
        const layer = this.getLayer(feature as Feature);
        return !layer ? false : this.hasProjectRole(layer!.projectId as Id);
      });
    }
  };

  hasOrganisationRole = (organisationId: Id) => {
    return this.userRoles.some(
      (role) =>
        role.type === HierarchicalResource.organisation &&
        role.resourceId === organisationId
    );
  };

  hasProjectRole = (projectId: Id) => {
    return this.userRoles.some(
      (role) =>
        role.type === HierarchicalResource.project && role.resourceId === projectId
    );
  };

  getFilteredTask = () => {
    let filterKeys = ['isReviewed', 'isArchived'];
    let query = this.state.filters.task.text || '';
    const result = this.state.resources.task.filter(
      (entity) =>
        (filterKeys.every((key) =>
          this.booleanFilter(HierarchicalResource.task, entity, key)
        ) &&
          (this.textFilter(HierarchicalResource.task, entity.feature, query) ||
            this.textFilter(HierarchicalResource.task, entity.project, query) ||
            this.textFilter(HierarchicalResource.task, entity.organisation, query))) ||
        entity.message?.toLowerCase().includes(query.toLowerCase())
    );
    return result;
  };

  booleanFilter = (
    resource: HierarchicalResource,
    entity: Resource,
    property: string
  ) => {
    const filterState = this.state.filters[resource as keyof AdminFilterStates];
    const filterValue = filterState[property as keyof AdminFilterState];
    return filterValue === null || filterValue === entity[property as keyof Resource];
  };

  textFilter = (resource: HierarchicalResource, entity: Resource, query: string) => {
    return (
      query === '' ||
      entity.name?.toLowerCase().includes(query.toLowerCase()) ||
      entity.title?.toLowerCase().includes(query.toLowerCase()) ||
      entity.nameShort?.toLowerCase().includes(query.toLowerCase()) ||
      entity.description?.toLowerCase().includes(query.toLowerCase()) ||
      entity.address?.toLowerCase().includes(query.toLowerCase())
    );
  };

  // Filtered Helpers
  filteredOrganisations = $derived(
    this.getFilteredResource(HierarchicalResource.organisation)
  );
  filteredProjects = $derived(this.getFilteredResource(HierarchicalResource.project));
  filteredLayers = $derived(this.getFilteredResource(HierarchicalResource.layer));
  filteredFeatures = $derived(this.getFilteredResource(HierarchicalResource.feature));
  filteredTasks = $derived(this.getFilteredTask());

  toggleFilter = (
    resource: HierarchicalResource,
    property: 'isPublished' | 'isArchived' | 'isReviewed'
  ) => {
    this.state.filters[resource][property] = !this.state.filters[resource][property];
  };

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

  getResourcePath = (resource?: HierarchicalResource) => {
    const resourceKey = resource ?? this.state.active.resource;
    if (!resourceKey) return null;
    return HierarchicalResourcePath[resourceKey];
  };

  getEntityRef = (resource: HierarchicalResource, id: Id) => {
    if (!resource) return false;
    const refKey = HierarchicalResourceRefKey[resource];
    const entity = this.state.resources[resource].find((entity) => entity.id === id);
    if (!entity) return false;
    return entity[refKey as keyof Resource];
  };

  getEntityPath = (resource: HierarchicalResource, id: Id) => {
    const ref = this.getEntityRef(resource, id);
    if (!ref) return null;
    return `${this.getResourcePath(resource)}/${ref}`;
  };

  // Hierarchical Resource Helpers
  getAscendantOrSelf = (
    entity: Resource,
    resource: HierarchicalResource,
    ascendantResource: HierarchicalResource
  ): Resource | null => {
    // If the resource is the same as the ascendant resource, return itself
    if (resource === ascendantResource) return entity;
    // Organisation is the top level resource
    if (resource === HierarchicalResource.organisation) return null;
    // Go through the hierarchy to find the ascendant
    let isDescendant = false;
    if (
      resource == HierarchicalResource.feature &&
      ascendantResource != HierarchicalResource.feature
    ) {
      entity = this.getLayer(entity as Feature) as Layer;
      isDescendant = true;
    }
    if (
      (resource == HierarchicalResource.layer || isDescendant) &&
      ascendantResource != HierarchicalResource.layer
    ) {
      entity = this.getProject(entity as Layer) as Project;
      isDescendant = true;
    }
    if (
      (resource == HierarchicalResource.project || isDescendant) &&
      ascendantResource != HierarchicalResource.project
    ) {
      entity = this.getOrganisation(entity as Project) as Organisation;
      isDescendant = true;
    }
    // Return the ascendant or null if an invalid ancestry relationship was provided
    return isDescendant ? entity : null;
  };

  // setActiveFromPage(page: Page) {
  //   const path = page.url.pathname;
  //   const resourceType = this.getResourceFromPath(path);
  //   if (resourceType) {
  //     this.setResource(resourceType);
  //     this.setEntity(this.getEntityFromPath(path), resourceType);
  //     if (page.url.hash) {
  //       this.setFacet(this.getFacetFromHash(page.url.hash));
  //     }
  //   }
  // }

  // getResourceFromPath = (path: string): HierarchicalResource | false => {
  //   const pathParts = path.replace(ADMIN_PATH, '').split('/').filter(Boolean);
  //   if (pathParts.length == 0) return false;
  //   return reversePath.get(pathParts[0]) ?? false;
  // };

  // getEntityFromPath = (path: string): Id | Code | false => {
  //   const pathParts = path.replace(ADMIN_PATH, '').split('/').filter(Boolean);
  //   if (pathParts.length <= 1) return false;
  //   return pathParts[1];
  // };

  // getFacetFromHash = (hash: string): FacetType => {
  //   return hash.replace('#', '') as FacetType;
  // };

  setResource(resource: HierarchicalResource) {
    this.state.active.resource = resource;
  }

  setEntity(entity: Id | Code | false, resource?: HierarchicalResource) {
    // If the new entity is a different resource type to the current entity, update the state
    if (resource) {
      this.setResource(resource);
    }
    this.state.active.entity = entity;
  }

  setFacet(facet: FacetType | false) {
    this.state.active.facet = facet;
  }

  getEntities = (resource?: HierarchicalResource) => {
    let resourceKey = resource ?? this.state.active.resource;
    if (!resourceKey) return [];
    return this.state.resources[resourceKey];
  };

  getEntity(resource?: HierarchicalResource, entityRef?: Id | Code, byId = false) {
    let resourceKey = resource ?? (this.activeResource as HierarchicalResource);
    let entityRefKey = byId ? 'id' : HierarchicalResourceRefKey[resourceKey];
    if (!entityRefKey) return null;
    return this.state.resources[resourceKey].find(
      (entity) =>
        entity[entityRefKey as keyof Resource] ===
        (entityRef ? entityRef : this.activeEntity)
    );
  }
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
    this.invalidateAndRefresh(HierarchicalResource.task);
    navigateOnAdmin(this, HierarchicalResource.task, nextTaskId);
  };

  // GENERIC UTILS
  hasManyEntities = (resource: HierarchicalResource) => {
    return this.state.resources[resource].length > 3;
  };
}

export const HIERARCHICAL_RESOURCE_STATE_KEY = Symbol('hierarchicalResourceState');

export const setHierarchicalResourceState = (
  queryClient: QueryClient,
  userRoles: UserRole[]
) =>
  setContext(
    HIERARCHICAL_RESOURCE_STATE_KEY,
    new ResourceState(queryClient, userRoles)
  );

export const getHierarchicalResourceState = (): ReturnType<
  typeof setHierarchicalResourceState
> => getContext(HIERARCHICAL_RESOURCE_STATE_KEY);
