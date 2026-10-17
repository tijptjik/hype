// SVELTE
import { getContext, setContext, untrack } from 'svelte'
// CONTEXT
import { SurfaceNavigation, setSurfaceNavigation } from './surfaceNavigation.svelte.js'
import { getHubs } from '#lib/api/hub.remote.js'
import { getFeatures } from '#lib/api/feature.remote.js'
import { getTasks } from '#lib/api/tasks.remote.js'
import {
  refreshRemoteQuery as runRemoteQuery,
  toSafeListResponse,
} from '#lib/remote/index.js'
import { debouncedUpdateUserPreferences } from '#lib/client/services/user.js'
// CONTEXT
import { ResourceIndexUi } from './resourceIndexUi.svelte.js'
import type { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
// ENUMS
import { FirstClassResource, type HierarchicalResource } from '#lib/enums.js'
// GUARDS
import { isTask } from '#lib/utils/resourceGuards.js'
// TYPES
import type { ListResponse, Id, Code, Resource, NavigableResource } from '#lib/types.js'
import type { FacetType } from '#lib/context/facets.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type {
  FilteredResources,
  FilterState,
  ResourceSortState,
} from '#lib/client/services/filters.types.js'
import type {
  Feature,
  FeatureFromCollection,
} from '#lib/db/zod/schema/feature.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { AdminPreferences } from '#lib/db/zod/schema/user.types.js'
import type { UserRoleDisco } from '#lib/types.js'

type LocalizedRecord = Record<string, unknown>

export class AdminCtx {
  readonly navigation = new SurfaceNavigation((type, ref) => {
    if (type === 'organisation' || type === 'project' || type === 'hub')
      return this.view.getResourceByRefSync(type, ref)?.id ?? null
    return ref
  })

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
  // 9. STATS

  // Remote queries own transport caching and refreshes.
  // Admin-owned resource view
  readonly listUi = new ResourceIndexUi()
  view!: ResourceViewCtx
  // Load State
  isInitialised: boolean = $state(false)
  isInitializing: boolean = $state(false)

  // ═══════════════════════
  // CONSTRUCTOR
  // ═══════════════════════

  constructor(view: ResourceViewCtx) {
    this.view = view

    // Only initialize if view is defined and has the required properties
    if (this.view?.queries.queryMap) {
      this.initializeAdminQueryMap()
    }
  }

  // Initialize admin-specific query map on view
  private initializeAdminQueryMap = (): void => {
    // Guard against undefined view
    if (!this.view?.queries.queryMap) {
      console.warn('AdminCtx: Cannot initialize query map - view not ready')
      return
    }

    // Override the default query functions with admin-specific ones
    // but reuse ResourceViewCtx query keys for common resources
    this.view.queries.queryMap.set(FirstClassResource.organisation, {
      queryKey: this.view.organisationsQueryKey,
      queryFn: () => this.organisationsQueryFn(),
    })

    this.view.queries.queryMap.set(FirstClassResource.project, {
      queryKey: this.view.projectsQueryKey,
      queryFn: () => this.projectsQueryFn(),
    })

    this.view.queries.queryMap.set(FirstClassResource.layer, {
      queryKey: this.view.layersQueryKey,
      queryFn: () => this.layersQueryFn(),
    })

    this.view.queries.queryMap.set(FirstClassResource.feature, {
      queryKey: this.view.featuresQueryKey,
      queryFn: () => this.featuresQueryFn(),
    })

    // PROPERTIES - reuse ResourceViewCtx query key and function
    this.view.queries.queryMap.set(FirstClassResource.property, {
      queryKey: this.view.propertiesQueryKey,
      queryFn: () => this.propertiesQueryFn(),
    })

    // Admin-specific resources with their own query keys
    this.view.queries.queryMap.set(FirstClassResource.task, {
      queryKey: () => this.tasksQueryKey,
      queryFn: () => this.tasksQueryFn(),
    })

    this.view.queries.queryMap.set(FirstClassResource.hub, {
      queryKey: () => this.hubsQueryKey,
      queryFn: () => this.hubsQueryFn(),
    })
  }

  // ═══════════════════════
  // ACTIVE RESOURCES
  // ═══════════════════════

  activeResourceType: NavigableResource | false = $derived(
    this.navigation.state.resourceType,
  )
  activeResourceRef: Id | Code | false = $derived(this.navigation.state.resourceRef)
  activeFacet: FacetType | false = $derived(this.navigation.state.facet)

  // ═══════════════════════
  // ACTIVE RESOURCE :: SETTERS
  // ═══════════════════════

  /**
   * Proxies active resource type updates through the surface navigation model.
   *
   * @param resource - Resource type to activate, or `false` to clear it.
   * @returns Nothing.
   */
  setResourceType(resource: NavigableResource | false): void {
    this.navigation.setActiveResourceType(resource)
  }

  /**
   * Proxies active resource ref updates through the surface navigation model while skipping no-op writes.
   *
   * @param ref - Resource ref to activate, or `false` to clear it.
   * @param resource - Optional resource type to activate alongside the ref.
   * @returns Nothing.
   * @remarks This keeps admin navigation idempotent when URL sync or repeated selections
   * attempt to write the same resource state multiple times.
   */
  setResourceRef(ref: Id | Code | false, resource?: NavigableResource): void {
    // If the new entity is a different resource type to the current entity, update the state
    const sameRef = untrack(() => this.navigation.state.resourceRef) === ref
    const sameResource =
      resource === undefined ||
      untrack(() => this.navigation.state.resourceType) === resource
    // Avoid redundant navigation writes so admin panel effects do not re-run on no-op updates.
    if (sameRef && sameResource) return
    this.navigation.setActiveResourceRef(ref as Id | false, resource)
  }

  /**
   * Proxies facet changes through the surface navigation model while optionally updating ref and resource first.
   *
   * @param facet - Facet to activate, or `false` to clear it.
   * @param ref - Optional resource ref to set before updating the facet.
   * @param resource - Optional resource type to set before updating the facet.
   * @returns Nothing.
   */
  setFacet(
    facet: FacetType | false,
    ref?: Id | Code | false,
    resource?: NavigableResource,
  ): void {
    const sameFacet = untrack(() => this.navigation.state.facet) === facet
    const sameRef =
      ref === undefined || untrack(() => this.navigation.state.resourceRef) === ref
    const sameResource =
      resource === undefined ||
      untrack(() => this.navigation.state.resourceType) === resource
    // Keep facet updates idempotent because route sync may call this repeatedly with same values.
    if (sameFacet && sameRef && sameResource) return
    this.navigation.setActiveFacet(facet, ref as Id | false | undefined, resource)
  }

  // ═══════════════════════
  // ADMIN QUERY KEYS
  // ═══════════════════════

  get tasksQueryKey() {
    return [
      FirstClassResource.task,
      this.getTaskListPrisms().organisation,
      this.getTaskListPrisms().project,
      this.view.filters.viewFilters[FirstClassResource.task].isReviewed,
      this.view.filters.viewFilters[FirstClassResource.task].type,
      this.view.filters.sorting.task.sortBy,
      this.view.filters.sorting.task.sortOrder,
    ]
  }

  get hubsQueryKey() {
    return [
      'hub',
      this.view.filters.sorting.hub.sortBy,
      this.view.filters.sorting.hub.sortOrder,
    ]
  }

  // ═══════════════════════
  // ADMIN QUERY :: FUNCTIONS
  // ═══════════════════════

  /**
   * Builds the effective task prism scope for admin task queries.
   *
   * @returns Active prisms, or role-derived fallback prisms when the current admin scope is empty.
   */
  private getTaskListPrisms(): { organisation: string[]; project: string[] } {
    const activeOrganisationPrisms = this.view.scope.prisms.organisation
    const activeProjectPrisms = this.view.scope.prisms.project

    if (activeOrganisationPrisms.length > 0 || activeProjectPrisms.length > 0) {
      return {
        organisation: activeOrganisationPrisms,
        project: activeProjectPrisms,
      }
    }

    const userRoles = Array.isArray(this.view.user?.roles)
      ? (this.view.user.roles as UserRoleDisco[])
      : []

    return {
      organisation: userRoles
        .filter(
          (role): role is Extract<UserRoleDisco, { type: 'organisation' }> =>
            role.type === 'organisation' &&
            role.role === 'owner' &&
            typeof role.organisationId === 'string',
        )
        .map(role => role.organisationId),
      project: userRoles
        .filter(
          (role): role is Extract<UserRoleDisco, { type: 'project' }> =>
            role.type === 'project' &&
            typeof role.projectId === 'string' &&
            (role.role === 'owner' || role.role === 'maintainer'),
        )
        .map(role => role.projectId),
    }
  }

  /**
   * Fetches organisations for the admin view and stores list metadata for later UI decisions.
   *
   * @returns Organisation cards for the current admin prism and sort state.
   */
  organisationsQueryFn = async () => this.view.organisationsQueryFn()

  /**
   * Fetches projects for the admin view and stores list metadata for later UI decisions.
   *
   * @returns Project cards for the current admin prism and sort state.
   */
  projectsQueryFn = async () => this.view.projectsQueryFn()

  /**
   * Fetches layers for the admin view and stores list metadata for later UI decisions.
   *
   * @returns Layer cards for the current admin prism and sort state.
   */
  layersQueryFn = async () => this.view.layersQueryFn()

  /**
   * Fetches features for the admin view and stores list metadata for later UI decisions.
   *
   * @returns Feature cards for the current admin prism and sort state.
   */
  featuresQueryFn = async () => {
    const query = getFeatures({
      conditions: this.view.isSuperAdmin()
        ? { isArchived: null, isPublished: null }
        : { isArchived: false, isPublished: null },
      prisms: this.view.scope.prisms,
      sorting: this.view.filters.sorting.feature,
      meta: { ...this.view.resources.queryMeta, profile: 'card' },
    })
    this.view.cacheCtx.featureCollectionScope = this.view.resources.scopeKey
    this.view.cacheCtx.featureCollection = query
    const result = toSafeListResponse<FeatureFromCollection>(
      await runRemoteQuery(query),
    )
    // Persist response metadata so sorting and pagination-aware UI can reuse it without refetching.
    this.view.setListQueryMeta(this.view.featuresQueryKey(), result)
    return result.data
  }

  tasksQueryFn = async () => {
    const taskPrisms = this.getTaskListPrisms()
    try {
      const result = toSafeListResponse<Task>(
        (await runRemoteQuery(
          getTasks({
            conditions: {
              isReviewed:
                this.view.filters.viewFilters[FirstClassResource.task].isReviewed,
              type: this.view.filters.viewFilters[FirstClassResource.task].type,
            },
            prisms: taskPrisms,
            sorting: this.view.filters.sorting.task,
            meta: { ...this.view.resources.queryMeta },
          }),
        )) as ListResponse<Task> | undefined,
      )
      this.view.setListQueryMeta(this.tasksQueryKey, result)
      return result.data
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 403
      ) {
        this.view.setListQueryMeta(this.tasksQueryKey, {
          data: [],
          totalCount: 0,
          hasMore: false,
          nextOffset: null,
        })
        return []
      }

      throw error
    }
  }

  propertiesQueryFn = async () => {
    const remoteList = this.view.remoteMap[FirstClassResource.property].list
    if (!remoteList) {
      throw new Error('Property remote list function is not configured.')
    }
    const result = toSafeListResponse<Property>(
      (await runRemoteQuery(
        remoteList({
          conditions: {},
          prisms: this.view.scope.prisms,
          meta: { ...this.view.resources.queryMeta },
        }),
      )) as ListResponse<Property> | undefined,
    )
    return result.data
  }

  /**
   * Fetches hubs for the admin view and stores list metadata for later UI decisions.
   *
   * @returns Hub cards for the current admin sort state, or an empty list for non-admin users.
   */
  hubsQueryFn = async () => {
    if (!this.view.isAdmin()) return []
    try {
      const result = toSafeListResponse<Hub>(
        (await runRemoteQuery(
          getHubs({
            conditions: this.view.isSuperAdmin()
              ? { isArchived: null, isPublished: null }
              : { isArchived: false, isPublished: null },
            sorting: this.view.filters.sorting.hub,
            meta: { ...this.view.resources.queryMeta, profile: 'card' },
          }),
        )) as ListResponse<Hub> | undefined,
      )
      // Persist response metadata so sorting and pagination-aware UI can reuse it without refetching.
      this.view.setListQueryMeta(this.hubsQueryKey, result)
      return result.data
    } catch (err) {
      const status =
        typeof err === 'object' && err && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : undefined
      if (status === 403) return []
      throw err
    }
  }

  // Initialize data using view's refresh methods
  init = async (): Promise<void> => {
    if (this.isInitialised || this.isInitializing) return

    // Ensure query map is initialized if it wasn't done in constructor
    if (this.view?.queries.queryMap && !this.isInitialised) {
      this.initializeAdminQueryMap()
    }

    this.isInitializing = true

    try {
      // Initialise only the selected admin resource; panels load their own independent pages.
      const resource = this.navigation.getActiveResourceType()
      if (resource === FirstClassResource.organisation)
        await this.view.queries.refreshOrganisations(false)
      else if (resource === FirstClassResource.project)
        await this.view.queries.refreshProjects(false)
      else if (resource === FirstClassResource.layer)
        await this.view.queries.refreshLayers(false, false)
      else if (resource === FirstClassResource.feature)
        await this.view.queries.refreshFeatures(false)
      else if (resource === FirstClassResource.hub) await this.refreshHubs(false)
      else if (resource === FirstClassResource.task)
        await this.invalidateAndRefresh(resource)

      this.isInitialised = true
    } finally {
      this.isInitializing = false
    }
  }

  refreshHubs = async (isCascading: boolean = true): Promise<void> => {
    await this.view.queries.refreshHubs(isCascading)
  }

  // ═══════════════════════
  // ADMIN QUERY :: INVALIDATION
  // ═══════════════════════

  async invalidateAndRefresh(resource: FirstClassResource) {
    await this.view.invalidate(resource)
    if (resource === FirstClassResource.hub) {
      await this.refreshHubs()
      return
    }
    await this.view.queries.refresh(resource)
  }

  /**
   * Targeted invalidation for image uploads - delegates to view
   * @param resource - The resource type to invalidate
   * @param resourceId - The ID of the specific resource to invalidate
   */
  async invalidateResourceTargeted(resource: FirstClassResource, resourceId: Id) {
    await this.view.invalidateResourceTargeted(resource, resourceId)
  }

  // ═══════════════════════
  // ADMIN FILTERS
  // ═══════════════════════

  getFilteredResource = <
    T extends Organisation | Project | Layer | Feature | Hub | Task,
  >(
    resource: FirstClassResource | HierarchicalResource,
    filters = { text: true, state: true },
  ): T[] => {
    const query = this.view.filters.values[resource as keyof FilterState].text || ''
    // FULL SET
    let result = this.view.queries.rows[resource as keyof FilteredResources] as T[]
    // TIER 2 FILTERS :: Boolean State :: (App Wide)
    // TODO Implement these filters if the data responses get too large.
    // TIER 2 FILTERS :: Text :: (App Wide)
    if (filters.text && resource !== FirstClassResource.hub) {
      result = result.filter((entity: T) => {
        if (!isTask(entity)) {
          return this.view.filters.textFilter(
            resource as FirstClassResource,
            entity,
            query,
          )
        }
        return true
      })
    }

    return result
  }

  // ═══════════════════════
  // ADMIN FILTERS :: DERIVED
  // ═══════════════════════

  // Filtered Helpers
  filteredOrganisations = $derived.by(() => {
    return this.view.filteredOrganisations
  })
  filteredProjects = $derived.by(() => {
    return this.view.filteredProjects
  })
  filteredLayers = $derived.by(() => {
    return this.view.filteredLayers
  }) as Layer[]
  filteredFeatures = $derived.by(() => {
    return this.view.filteredFeatures
  })

  filteredTasks = $derived.by(() => {
    this.view.queries.rows.task
    this.view.filters.values.task
    return this.view.filters.getFilteredTask()
  })
  filteredHubs = $derived.by(() => {
    if (!this.view.isSuperAdmin()) return []
    this.view.queries.rows.hub
    this.view.filters.values.hub
    return this.view.filters.getFilteredHub()
  })

  /**
   * Updates admin view sorting and reuses loaded results when the full list is already present.
   *
   * @param resource - Resource type whose sort state is changing.
   * @param next - Partial sort state update.
   * @returns Nothing.
   * @remarks When the current query metadata says there are no more pages, the method sorts the
   * loaded entities in memory and updates both app state and query cache instead of refetching.
   */
  setViewSorting = async (
    resource: FirstClassResource,
    next: Partial<ResourceSortState>,
  ): Promise<void> => {
    const current = this.view.filters.sorting[resource]
    const queryEntry = this.view.queries.queryMap.get(resource)
    const currentQueryKey = queryEntry?.queryKey() ?? []
    const currentQueryMeta = this.view.getListQueryMeta(currentQueryKey)
    const nextSorting = {
      ...current,
      ...next,
    }

    if (
      current.sortBy === nextSorting.sortBy &&
      current.sortOrder === nextSorting.sortOrder
    ) {
      return
    }

    this.view.filters.sorting[resource] = nextSorting

    if (
      queryEntry &&
      currentQueryMeta?.hasMore === false &&
      resource !== FirstClassResource.task &&
      resource !== FirstClassResource.property &&
      resource !== FirstClassResource.user
    ) {
      const nextQueryKey = queryEntry.queryKey()
      const currentEntities = this.view.queries.rows[resource] as Resource[]
      // Re-sort locally when the full collection is already loaded to avoid an unnecessary request.
      const sortedEntities = this.view.filters.sortLoadedResources(
        resource,
        currentEntities,
        nextSorting,
      )

      this.view.setSortedResourceState(resource, sortedEntities)
      // Keep cached metadata aligned with the new in-memory sort result.
      this.view.setListQueryMeta(nextQueryKey, {
        data: sortedEntities,
        totalCount: currentQueryMeta.totalCount ?? sortedEntities.length,
        limit: currentQueryMeta.limit,
        offset: currentQueryMeta.offset,
        hasMore: false,
        nextOffset: null,
        sortBy: nextSorting.sortBy,
        sortOrder: nextSorting.sortOrder,
        appliedFilters: currentQueryMeta.appliedFilters,
        q: currentQueryMeta.q,
        durationMs: currentQueryMeta.durationMs,
      })
      return
    }

    if (resource === FirstClassResource.organisation) {
      await this.view.queries.refreshOrganisations(false)
      return
    }
    if (resource === FirstClassResource.project) {
      await this.view.queries.refreshProjects(false)
      return
    }
    if (resource === FirstClassResource.layer) {
      await this.view.queries.refreshLayers(false)
      return
    }
    if (resource === FirstClassResource.feature) {
      await this.view.queries.refreshFeatures(false)
      return
    }
    if (resource === FirstClassResource.task) {
      await this.view.queries.refreshTasks(false)
      return
    }
    if (resource === FirstClassResource.hub) {
      await this.view.queries.refreshHubs(false)
    }
  }

  // ═══════════════════════
  // ADMIN PREFERENCES
  // ═══════════════════════

  /** Saves an admin preference through shared account data. @param code Preference name. @param value New setting. @returns Nothing. */
  setAdminPreference = (code: keyof AdminPreferences, value: boolean): void => {
    if (!this.view.user) return
    const preferences = this.view.getUserPreferences()
    const nextPreferences = {
      ...preferences,
      admin: { ...preferences.admin, [code]: value },
    }
    this.view.updateUserPreferences(nextPreferences)
    debouncedUpdateUserPreferences(this.view.user.id, nextPreferences)
  }

  // ═══════════════════════
  // UTILS :: LAYOUT
  // ═══════════════════════

  hasManyEntities = (resource: FirstClassResource | HierarchicalResource) => {
    return this.view.queries.rows[resource as keyof FilteredResources].length > 3
  }

  isViewportContained = $derived(
    this.navigation.state.resourceRef === false ||
      this.navigation.state.facet === 'address' ||
      this.navigation.state.facet === 'images' ||
      (this.navigation.state.resourceType === 'feature' &&
        (this.navigation.state.facet === 'core' ||
          this.navigation.state.facet === false)) ||
      (this.activeResourceType === 'task' && this.activeResourceRef),
  )

  isShowIndex = $derived(
    this.activeResourceType &&
      (this.activeResourceRef === null || this.activeResourceRef === false),
  )
}

export const ADMINCTX_KEY = Symbol('adminCtx')

export const setAdminCtx = (view: ResourceViewCtx) => {
  const context = new AdminCtx(view)
  setSurfaceNavigation(context.navigation)
  return setContext(ADMINCTX_KEY, context)
}

export const getAdminCtx = (): AdminCtx => {
  const ctx = getContext<AdminCtx | undefined>(ADMINCTX_KEY)
  if (!ctx) {
    // Return a safe proxy object that prevents errors when AdminCtx isn't ready
    return new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'isInitialised') return false
          if (prop === 'setFacet') return () => {}
          if (prop === 'filteredOrganisations') return []
          if (prop === 'filteredProjects') return []
          if (prop === 'filteredLayers') return []
          if (prop === 'filteredFeatures') return []
          if (prop === 'filteredTasks') return []
          if (prop === 'filteredHubs') return []
          if (prop === 'activeResourceType') return false
          if (prop === 'activeResourceRef') return false
          if (prop === 'activeFacet') return false
          if (prop === 'isShowIndex') return false
          if (prop === 'isViewportContained') return true
          if (prop === 'view')
            return {
              isInitialised: false,
              state: { resources: {} },
              getResourceByRefSync: () => undefined,
            }
          return undefined
        },
      },
    ) as AdminCtx
  }
  return ctx
}
