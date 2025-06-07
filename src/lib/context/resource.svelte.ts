// I18N
import { getLocale } from '$lib/i18n';
// LIB
import { ADMIN_PATH } from '$lib/index';
import { navigateOnAdmin } from '$lib/navigation';
// CONTEXT
import { getContext, setContext } from 'svelte';
import { QueryClient } from '@tanstack/svelte-query';
// ENUMS
import {
  HierarchicalResource,
  ResourcePath,
  HierarchicalResourceRefKey,
  FirstClassResource
} from '$lib/enums';
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
  UserRoleDisco
} from '../types';
import type { Session } from '@auth/sveltekit';

export class ResourceState {
  // Tanstack Query Client instance
  queryClient: QueryClient;
  // User Roles
  userRoles: UserRoleDisco[];
  // Session for superAdmin check
  session: Session | null;
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
      task: [],
      hub: []
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
      ? `${ADMIN_PATH}/${ResourcePath[this.activeResource]}/${this.activeEntity}`
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
  hubsQueryKey = ['hub'];

  // METHOD : SuperAdmin check
  private isSuperAdmin(): boolean {
    return this.session?.user?.superAdmin === true;
  }

  // Constructor
  constructor(
    queryClient: QueryClient,
    session: Session | null = null,
    userRoles: UserRoleDisco[]
  ) {
    this.queryClient = queryClient;
    this.session = session;
    this.userRoles = userRoles;
    this.initializeQueries(queryClient);
  }

  // Update user roles (useful after form submissions that create new resources)
  setUserRoles(newUserRoles: UserRoleDisco[]) {
    this.userRoles = newUserRoles;
  }

  // Fetch fresh user roles from the database
  async refreshUserRoles() {
    try {
      const response = await fetch('/api/auth/user-roles');
      if (response.ok) {
        const data = await response.json();
        if (data.roles) {
          this.setUserRoles(data.roles);
        }
      } else {
        console.warn('Failed to fetch user roles:', response.statusText);
      }
    } catch (error) {
      console.warn('Error fetching user roles:', error);
    }
  }

  // Helper method to build API URLs with filters
  private buildApiUrl(resource: HierarchicalResource, includeFilters = true): string {
    const path = ResourcePath[resource];
    const params = new URLSearchParams();

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

  hubsQueryFn = async () => {
    if (!this.isSuperAdmin()) return [];
    const url = this.buildApiUrl('hub' as any);
    return this.fetchOrThrow<Hub[]>(url);
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

    // Hubs query (SuperAdmin only)
    if (this.isSuperAdmin()) {
      this.state.resources.hub = await queryClient.fetchQuery({
        queryKey: this.hubsQueryKey,
        queryFn: this.hubsQueryFn
      });
    }

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

  refreshResources = async (resource: HierarchicalResource | 'hub') => {
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
    } else if (resource === 'hub') {
      this.refreshHubs();
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

  async refreshHubs() {
    if (!this.isSuperAdmin()) return;
    this.state.resources.hub = await this.queryClient.fetchQuery({
      queryKey: this.hubsQueryKey,
      queryFn: this.hubsQueryFn
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
    // Invalidate the query
    this.queryClient.invalidateQueries({
      queryKey: [HierarchicalResource[resource]],
      refetchType: 'all',
      exact: false
    });
    // Refresh the resources
    this.refreshResources(resource);
  }

  // TYPE GUARDS
  private isOrganisation = (entity: any): entity is Organisation =>
    'code' in entity && 'url' in entity;

  private isProject = (entity: any): entity is Project =>
    'organisationId' in entity && 'code' in entity;

  private isLayer = (entity: any): entity is Layer =>
    'projectId' in entity && 'metadata' in entity;

  private isFeature = (entity: any): entity is Feature =>
    'layerId' in entity && 'geometry' in entity;

  private isHub = (entity: any): entity is Hub =>
    'organisation' in entity && 'domain' in entity;

  // FILTERS

  getFilteredResource = <T extends Organisation | Project | Layer | Feature | Hub>(
    resource: FirstClassResource,
    // filters = { text: true, state: true, access: true }
    filters = { text: true, state: true }
  ): T[] => {
    let filterKeys = ['isPublished', 'isArchived'];
    let query = this.state.filters[resource as keyof AdminFilterStates].text || '';
    // FULL SET
    let result = this.state.resources[resource] as T[];
    // STATE FILTERS
    if (filters.state) {
      result = result.filter((entity) =>
        filterKeys.every((key) => this.booleanFilter(resource, entity, key))
      );
    }
    // TEXT FILTERS
    if (filters.text && resource !== FirstClassResource.hub) {
      result = result.filter((entity: T) => {
        if (!this.isHub(entity)) {
          return this.textFilter(
            resource as Omit<FirstClassResource, 'hub'> as HierarchicalResource,
            entity,
            query
          );
        }
      });
    }
    // ACCESS FILTERS
    // if (filters.access) {
    // const accessResult = this.accessFilter(resource, result) as T[];
    // result = accessResult || result;
    // }
    return result;
  };

  // TODO REMOVE this once it's confirmed that it's not necessary.
  // Access is enforced on the server, so this would be redundant.
  // accessFilter = <T extends Organisation | Project | Layer | Feature>(
  //   resource: HierarchicalResource,
  //   result: T[]
  // ) => {
  //   if (resource === HierarchicalResource.organisation) {
  //     return result.filter(
  //       (entity) =>
  //         this.isOrganisation(entity) && this.hasOrganisationRole(entity.id as Id)
  //     );
  //   } else if (resource === HierarchicalResource.project) {
  //     return result.filter(
  //       (entity) => this.isProject(entity) && this.hasProjectRole(entity.id as Id)
  //     );
  //   } else if (resource === HierarchicalResource.layer) {
  //     return result.filter(
  //       (entity) => this.isLayer(entity) && this.hasProjectRole(entity.projectId as Id)
  //     );
  //   } else if (resource === HierarchicalResource.feature) {
  //     return result.filter((entity) => {
  //       if (!this.isFeature(entity)) return false;
  //       const layer = this.getLayer(entity);
  //       return layer ? this.hasProjectRole(layer.projectId as Id) : false;
  //     });
  //   }
  //   return result;
  // };

  hasOrganisationRole = (organisationId: Id) => {
    return this.userRoles.some(
      (role) =>
        role.type === HierarchicalResource.organisation &&
        role.organisation.id === organisationId
    );
  };

  hasProjectRole = (projectId: Id) => {
    return this.userRoles.some(
      (role) =>
        role.type === HierarchicalResource.project && role.project.id === projectId
    );
  };

  getFilteredTask = () => {
    let query = this.state.filters.task.text || '';
    // FULL SET
    let result: Task[] = this.state.resources.task;

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
        const feature = this.state.resources.feature.find(
          (f) => f.id === entity.featureId
        );
        const project = this.state.resources.project.find(
          (p) => p.id === entity.projectId
        );
        const organisation = this.state.resources.organisation.find(
          (o) => o.id === entity.organisationId
        );

        return (
          (feature && this.textFilter(HierarchicalResource.feature, feature, query)) ||
          (project && this.textFilter(HierarchicalResource.project, project, query)) ||
          (organisation &&
            this.textFilter(HierarchicalResource.organisation, organisation, query)) ||
          entity.message?.toLowerCase().includes(query.toLowerCase())
        );
      });
    }

    return result;
  };

  getFilteredHub = () => {
    if (!this.isSuperAdmin()) return [];
    let query = this.state.filters.hub.text || '';
    // FULL SET
    let result: Hub[] = this.state.resources.hub;

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
          entity.organisation?.i18n?.[getLocale()]?.name
            ?.toLowerCase()
            .includes(query.toLowerCase())
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
    resource: HierarchicalResource,
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

  // Filtered Helpers
  filteredOrganisations = $derived.by(() => {
    // Explicitly access reactive dependencies so Svelte tracks them
    this.state.resources.organisation;
    this.state.filters.organisation;
    return this.getFilteredResource<Organisation>(FirstClassResource.organisation);
  });
  filteredProjects = $derived.by(() => {
    this.state.resources.project;
    this.state.filters.project;
    return this.getFilteredResource<Project>(FirstClassResource.project);
  });
  filteredLayers = $derived.by(() => {
    this.state.resources.layer;
    this.state.filters.layer;
    return this.getFilteredResource<Layer>(FirstClassResource.layer);
  }) as Layer[];
  filteredFeatures = $derived.by(() => {
    this.state.resources.feature;
    this.state.filters.feature;
    return this.getFilteredResource<Feature>(FirstClassResource.feature);
  });
  filteredTasks = $derived.by(() => {
    this.state.resources.task;
    this.state.filters.task;
    return this.getFilteredTask();
  });
  filteredHubs = $derived.by(() => {
    if (!this.isSuperAdmin()) return [];
    this.state.resources.hub;
    this.state.filters.hub;
    return this.getFilteredHub();
  });

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
    return ResourcePath[resourceKey];
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

  setResource(resource: HierarchicalResource | false) {
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
  session: Session | null = null,
  userRoles: UserRoleDisco[]
) =>
  setContext(
    HIERARCHICAL_RESOURCE_STATE_KEY,
    new ResourceState(queryClient, session, userRoles)
  );

export const getHierarchicalResourceState = (): ReturnType<
  typeof setHierarchicalResourceState
> => getContext(HIERARCHICAL_RESOURCE_STATE_KEY);
