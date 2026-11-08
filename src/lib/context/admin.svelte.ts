// SVELTE
import { getContext, setContext, untrack } from 'svelte'
// CONTEXT
import { SurfaceNavigation, setSurfaceNavigation } from './surfaceNavigation.svelte.js'
import { getHubs } from '#lib/api/hub.remote.js'
import { getFeatures } from '#lib/api/feature.remote.js'
import { getFeatureIndexPage } from '#lib/api/featureIndex.remote.js'
import { getTasks } from '#lib/api/tasks.remote.js'
import {
  refreshRemoteQuery as runRemoteQuery,
  toSafeListResponse,
  readFreshRemoteQuery,
} from '#lib/remote/index.js'
import { debouncedUpdateUserPreferences } from '#lib/client/services/user.js'
// I18N
import { getLocaleKey } from '#lib/i18n.js'
// CONTEXT
import { FeatureMultilingualState } from './featureMultilingual.svelte.js'
import { ResourceIndexUi } from './resourceIndexUi.svelte.js'
import type { FeatureIndexQuery } from '#lib/features/indexQuery.js'
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
  FeatureListParamsByProfile,
} from '#lib/db/zod/schema/feature.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { AdminPreferences } from '#lib/db/zod/schema/user.types.js'

export class AdminCtx {
  readonly featureMultilingual = new FeatureMultilingualState()
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
  // Retain only ordered identities from the index, including remote search matches.
  private featureIndexSequence = $state.raw<{
    key: string
    rows: { id: string }[]
    complete: boolean
  } | null>(null)
  featureIndexReady = $state(false)
  featureHasMore = $state(false)
  featureLoadingMore = $state(false)
  featurePageError = $state<unknown>(null)
  private featureNextOffset = 0
  private featurePageKey = ''
  private featurePageRevision = 0
  private featureIndexLoad: {
    key: string
    promise: Promise<FeatureFromCollection[]>
  } | null = null
  private featurePageQuery: typeof this.view.cacheCtx.featureCollection
  private featureFirstPageIds = new Set<string>()
  private navigationPage = $state.raw<{
    key: string
    rows: { id: string }[]
    offset: number
    complete: boolean
  } | null>(null)
  private navigationLoad: { key: string; promise: Promise<void> } | null = null
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
      this.view.resources.scopeKey,
      this.view.filters.values.task.text,
      this.view.filters.viewFilters.task.reviewAction,
      this.view.filters.viewFilters.task.reviewOutcome,
      this.getTaskListPrisms().organisation,
      this.getTaskListPrisms().project,
      this.getTaskListPrisms().layer,
      this.view.filters.viewFilters[FirstClassResource.task].isReviewed,
      this.view.filters.viewFilters[FirstClassResource.task].type,
      this.view.filters.sorting.task.sortBy,
      this.view.filters.sorting.task.sortOrder,
    ]
  }

  get hubsQueryKey() {
    return [
      'hub',
      this.view.resources.scopeKey,
      this.view.filters.values.hub.text,
      JSON.stringify(this.view.filters.viewFilters.hub),
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
   * @returns Explicit organisation, project, and layer prisms; empty means all server-authorized tasks.
   */
  private getTaskListPrisms(): {
    organisation: string[]
    project: string[]
    layer: string[]
  } {
    return {
      organisation: this.view.scope.prisms.organisation,
      project: this.view.scope.prisms.project,
      layer: this.view.scope.prisms.layer,
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
   * Identifies the Feature page owner, including explicit cache resets.
   * @returns Serialized access, query and cache-generation identity.
   */
  private getFeaturePageKey(): string {
    return JSON.stringify([
      this.view.resources.scopeKey,
      this.view.cacheCtx.generation,
      this.view.featuresQueryKey(),
    ])
  }

  /**
   * Fetches features for the admin view and stores list metadata for later UI decisions.
   *
   * @returns Feature cards for the current admin prism and sort state.
   */
  featuresQueryFn = async (): Promise<FeatureFromCollection[]> => {
    const key = this.getFeaturePageKey()
    if (this.featureIndexLoad?.key === key) return this.featureIndexLoad.promise
    const promise = this.loadFeatureIndexPage(key)
    this.featureIndexLoad = { key, promise }
    try {
      return await promise
    } finally {
      if (this.featureIndexLoad?.promise === promise) this.featureIndexLoad = null
    }
  }

  /** Read the first index page and invalidate continuation work from earlier reads.
   * @param key Captured account, hierarchy and sort identity.
   * @returns Feature cards; the query coordinator rejects stale scope responses.
   */
  private async loadFeatureIndexPage(key: string): Promise<FeatureFromCollection[]> {
    // The index starts with a bounded page; detail routes never invoke this bootstrap.
    const revision = ++this.featurePageRevision
    this.featurePageKey = key
    this.featurePageError = null
    this.featureIndexReady = false
    this.featureHasMore = false
    this.featureLoadingMore = false
    const query = getFeatures({
      ...this.featureListInput(),
      pagination: { limit: 50, offset: 0 },
    })
    this.view.cacheCtx.featureCollectionScope = this.view.resources.scopeKey
    this.view.cacheCtx.featureCollection = query
    this.featurePageQuery = query
    const result = await runRemoteQuery(query)
      .then(value => toSafeListResponse<FeatureFromCollection>(value))
      .catch(error => {
        if (this.isCurrentFeaturePage(key, revision)) this.featurePageError = error
        throw error
      })
    if (this.isCurrentFeaturePage(key, revision)) {
      this.featureFirstPageIds = new Set(result.data.map(row => row.id))
      this.featureIndexReady = true
      this.featureHasMore = result.hasMore ?? false
      this.featureNextOffset = result.nextOffset ?? result.data.length
      this.view.setListQueryMeta(this.view.featuresQueryKey(), result)
    }
    return result.data
  }

  /** Check both request generation and live scope before accepting page state.
   * @param key Scope captured by the request.
   * @param revision First-page generation captured by the request.
   * @returns Whether the response still belongs to this index.
   */
  private isCurrentFeaturePage(key: string, revision: number): boolean {
    return (
      revision === this.featurePageRevision &&
      key === this.featurePageKey &&
      key === this.getFeaturePageKey()
    )
  }

  /** Reconcile native first-page overrides without discarding retained later pages.
   * @param query Native collection handle observed by the admin layout.
   * @param current Its latest payload, including optimistic updates.
   * @returns Nothing; another surface or scope cannot replace this index.
   */
  syncFeatureCollection(
    query: typeof this.view.cacheCtx.featureCollection,
    current: Pick<ListResponse<FeatureFromCollection>, 'data'>,
  ): void {
    if (
      !this.featureIndexReady ||
      query !== this.featurePageQuery ||
      !this.isCurrentFeaturePage(this.featurePageKey, this.featurePageRevision) ||
      this.view.cacheCtx.featureCollectionScope !== this.view.resources.scopeKey
    )
      return
    const firstIds = new Set(current.data.map(row => row.id))
    const laterRows = this.view.queries.rows.feature.filter(
      row => !this.featureFirstPageIds.has(row.id) && !firstIds.has(row.id),
    )
    this.featureFirstPageIds = firstIds
    this.view.queries.rows.feature = [...current.data, ...laterRows]
  }

  /** Build a shared authorized list scope for pages and lightweight traversal.
   * @returns Feature conditions, hierarchy and ordering with native access metadata.
   */
  private featureListInput(): FeatureListParamsByProfile<'card'> {
    return {
      conditions: this.view.isSuperAdmin()
        ? { isArchived: null, isPublished: null }
        : { isArchived: false, isPublished: null },
      prisms: this.view.scope.prisms,
      sorting: this.view.filters.sorting.feature,
      meta: { ...this.view.resources.queryMeta, profile: 'card' as const },
    }
  }

  /** Reuse the retained index when returning from a detail page in the same scope.
   * @returns Completion of the first page if this account/filter scope has not loaded.
   */
  async ensureFeatureIndex(): Promise<void> {
    if (this.featureIndexReady && this.featurePageKey === this.getFeaturePageKey())
      return
    await this.view.queries.refreshFeatures(false)
  }

  /** Append one bounded index page without replacing already rendered rows.
   * @returns Completion; stale scopes and overlapping scroll requests cannot append.
   */
  async loadMoreFeatures(): Promise<void> {
    if (!this.featureIndexReady || !this.featureHasMore || this.featureLoadingMore)
      return
    const key = this.featurePageKey
    const revision = this.featurePageRevision
    if (!this.isCurrentFeaturePage(key, revision)) return
    this.featureLoadingMore = true
    this.featurePageError = null
    try {
      const result = await runRemoteQuery(
        getFeatures({
          ...this.featureListInput(),
          pagination: { limit: 50, offset: this.featureNextOffset },
        }),
      )
      if (!this.isCurrentFeaturePage(key, revision)) return
      const hasMore = result.hasMore ?? false
      const nextOffset =
        result.nextOffset ?? this.featureNextOffset + result.data.length
      // Preserve the last valid page and cursor when the server continuation stalls.
      if (hasMore && (result.data.length === 0 || nextOffset <= this.featureNextOffset))
        throw new Error('Feature pagination did not advance')
      const rows = new Map(this.view.queries.rows.feature.map(row => [row.id, row]))
      for (const row of result.data) {
        rows.set(row.id, row)
        this.view.cache.feature.set(row.id, row)
      }
      this.view.queries.rows.feature = [...rows.values()]
      this.featureHasMore = hasMore
      this.featureNextOffset = nextOffset
    } catch (error) {
      if (this.isCurrentFeaturePage(key, revision)) this.featurePageError = error
    } finally {
      if (revision === this.featurePageRevision) this.featureLoadingMore = false
    }
  }

  /** Fill just enough ordered IDs to resolve a detail page's neighbours.
   * @param featureId The requested record, which loads independently of traversal.
   * @returns Background traversal completion; account/filter changes discard stale pages.
   * @remarks Retained index matches remain authoritative. Complex client-only filters
   * use bounded card pages so their existing predicates never become unfiltered neighbours.
   */
  async ensureFeatureNavigation(featureId: string): Promise<void> {
    const key = this.getFeatureIndexKey()
    const retained = this.featureIndexSequence
    if (retained?.key === key && retained.complete) return
    if (this.navigationLoad?.key === key) {
      await this.navigationLoad.promise
      if (key !== this.getFeatureIndexKey()) return
      return this.ensureFeatureNavigation(featureId)
    }
    const state =
      this.navigationPage?.key === key
        ? this.navigationPage
        : { key, rows: [], offset: 0, complete: false }
    const index = state.rows.findIndex(row => row.id === featureId)
    if (state.complete || (index >= 0 && index < state.rows.length - 1)) return
    const promise = this.loadFeatureNavigationPages(featureId, state)
    this.navigationLoad = { key, promise }
    try {
      await promise
    } finally {
      if (this.navigationLoad?.promise === promise) this.navigationLoad = null
    }
  }

  /** Traverse bounded pages until both neighbours are known or the matching list ends.
   * @param featureId Anchor whose neighbours are needed.
   * @param state Captured scope, retained IDs and next page position.
   * @returns Completion without delaying the editor or retaining feature relation graphs.
   */
  private async loadFeatureNavigationPages(
    featureId: string,
    state: { key: string; rows: { id: string }[]; offset: number; complete: boolean },
  ): Promise<void> {
    const input = this.featureListInput()
    const values = this.view.filters.values.feature
    let rows = [...state.rows],
      offset = state.offset,
      complete = state.complete
    while (!complete && state.key === this.getFeatureIndexKey()) {
      // Navigation uses the same server filters as rows and count, hydrating only IDs.
      const result = await runRemoteQuery(
        getFeatureIndexPage({
          ...input,
          sorting: input.sorting as FeatureIndexQuery['sorting'],
          filters: this.view.filters.viewFilters.feature,
          q: values.text?.trim() || undefined,
          idsOnly: true,
          includeCount: false,
          pagination: { limit: 100, offset },
        }),
      )
      if (state.key !== this.getFeatureIndexKey()) return
      const matches = result.data
      const ids = new Set(rows.map(row => row.id))
      rows = [
        ...rows,
        ...matches.filter(row => !ids.has(row.id)).map(row => ({ id: row.id })),
      ]
      complete = !result.hasMore
      const nextOffset = result.nextOffset ?? offset + result.data.length
      // Reject broken continuations before retaining the page or issuing another read.
      if (!complete && nextOffset <= offset)
        throw new Error('Feature navigation pagination did not advance')
      offset = nextOffset
      this.navigationPage = { key: state.key, rows, offset, complete }
      const index = rows.findIndex(row => row.id === featureId)
      if (index >= 0 && index < rows.length - 1) return
    }
  }

  private readonly metadataReadSerials = new Map<'task' | 'hub', number>()

  /**
   * Captures ownership of a task or hub metadata response before its remote read.
   * @param resource Resource whose earlier reads are superseded.
   * @param queryKey Current filter and sort identity provider.
   * @returns Guard for publishing metadata only within the original active view.
   */
  private beginMetadataRead(
    resource: 'task' | 'hub',
    queryKey: () => unknown[],
  ): () => boolean {
    const serial = (this.metadataReadSerials.get(resource) ?? 0) + 1
    this.metadataReadSerials.set(resource, serial)
    const key = JSON.stringify(queryKey())
    const scope = this.view.resources.scopeKey
    const generation = this.view.cacheCtx.generation
    return () =>
      this.metadataReadSerials.get(resource) === serial &&
      key === JSON.stringify(queryKey()) &&
      scope === this.view.resources.scopeKey &&
      generation === this.view.cacheCtx.generation
  }

  /**
   * Fetches tasks and retains metadata only for the request's current query and view.
   * @returns Task rows, or an empty list when the request is forbidden.
   */
  tasksQueryFn = async (): Promise<Task[]> => {
    const isCurrent = this.beginMetadataRead('task', () => this.tasksQueryKey)
    const taskPrisms = this.getTaskListPrisms()
    try {
      const result = toSafeListResponse<Task>(
        (await runRemoteQuery(
          getTasks({
            q: this.view.filters.values.task.text,
            conditions: {
              reviewAction: this.view.filters.viewFilters.task.reviewAction || null,
              reviewOutcome:
                this.view.filters.viewFilters.task.reviewOutcome == null
                  ? null
                  : this.view.filters.viewFilters.task.reviewOutcome
                    ? 'accepted'
                    : 'rejected',
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
      if (isCurrent()) this.view.setListQueryMeta(this.tasksQueryKey, result)
      return result.data
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        error.status === 403
      ) {
        if (isCurrent()) {
          this.view.setListQueryMeta(this.tasksQueryKey, {
            data: [],
            totalCount: 0,
            hasMore: false,
            nextOffset: null,
          })
        }
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

  hubCountLoading = $state(false)

  /**
   * Fetches hubs for the admin view and stores list metadata for later UI decisions.
   *
   * @returns Hub cards for the current admin sort state, or an empty list for non-admin users.
   */
  hubsQueryFn = async (): Promise<Hub[]> => {
    const isCurrent = this.beginMetadataRead('hub', () => this.hubsQueryKey)
    if (!this.view.isAdmin()) return []
    const input = {
      q: this.view.filters.values.hub.text,
      indexFilters: this.view.filters.viewFilters.hub,
      conditions: this.view.isSuperAdmin()
        ? { isArchived: null, isPublished: null }
        : { isArchived: false, isPublished: null },
      sorting: this.view.filters.sorting.hub,
      meta: { ...this.view.resources.queryMeta, profile: 'card' as const },
    }
    this.hubCountLoading = true
    // Metadata has its own completion path so counting cannot delay hub cards.
    void readFreshRemoteQuery(getHubs({ ...input, includeCount: true, countOnly: true }))
      .then(result => {
        if (isCurrent()) this.view.setListQueryMeta(this.hubsQueryKey, result)
      })
      .catch(() => {
        if (isCurrent()) this.view.setListQueryMeta(this.hubsQueryKey, { data: [], totalCount: null })
      })
      .finally(() => { if (isCurrent()) this.hubCountLoading = false })
    try {
      const result = await readFreshRemoteQuery(getHubs({ ...input, includeCount: false }))
      return result.data as Hub[]
    } catch (err) {
      const status =
        typeof err === 'object' && err && 'status' in err
          ? Number((err as { status?: unknown }).status)
          : undefined
      if (status === 403) return []
      throw err
    }
  }

  /**
   * Initializes the active admin resource for the current account scope.
   * @returns Completion of this initialization attempt.
   * @remarks Route owners load data after mounting; bootstrap only wires queries for this scope.
   */
  init = async (): Promise<void> => {
    if (this.isInitialised || this.isInitializing) return

    // Ensure query map is initialized if it wasn't done in constructor
    if (this.view?.queries.queryMap && !this.isInitialised) {
      this.initializeAdminQueryMap()
    }

    this.isInitializing = true
    const scope = this.view.resources.scopeKey

    try {
      // Index and detail routes own their reads; mounting must not await a duplicate list.
      this.isInitialised = scope === this.view.resources.scopeKey
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

  /** Identifies the filters, ordering and account that own the Feature index.
   * @returns A traversal scope shared by the index and detail route.
   */
  private getFeatureIndexKey(): string {
    return JSON.stringify([
      this.getFeaturePageKey(),
      getLocaleKey(),
      this.view.filters.values.feature,
      this.view.filters.viewFilters.feature,
    ])
  }

  /** Current account/filter identity observed by background detail traversal. */
  get featureNavigationScope(): string {
    return this.getFeatureIndexKey()
  }

  /** Retains the index's matching order when opening and stepping through Features.
   * @param rows Final ordered matches, before the temporary search-focus display cap.
   * @param complete Whether every matching page is retained.
   * @returns Nothing.
   * @remarks Keep remote search matches even when they are absent from the base query.
   */
  rememberFeatureIndex(rows: readonly { id: string }[], complete = true): void {
    this.featureIndexSequence = {
      key: this.getFeatureIndexKey(),
      rows: rows.map(({ id }) => ({ id })),
      complete,
    }
  }

  /** Resolves the index sequence, or the same active filters for a direct detail visit.
   * @returns Ordered Feature identities for previous/next navigation.
   * @remarks A changed account, prism, locale, sort or filter invalidates retained matches.
   */
  get featureNavigationRows(): { id: string }[] {
    const key = this.getFeatureIndexKey()
    if (this.featureIndexSequence?.key === key && this.featureIndexSequence.complete)
      return this.featureIndexSequence.rows
    if (this.navigationPage?.key === key) return this.navigationPage.rows
    if (this.featureIndexSequence?.key === key) return this.featureIndexSequence.rows
    return this.view.filters.getViewFilteredResource<Feature>(
      FirstClassResource.feature,
    )
  }

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
      resource !== FirstClassResource.location &&
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
