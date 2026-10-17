// DOMAIN
import { FirstClassResource } from '#lib/enums.js'
import { logMarkerBootstrap } from '#lib/debug/markerBootstrap.js'
// TYPES
import type { Prisms } from '#lib/types.js'
import type { FilteredResources } from '#lib/client/services/filters.types.js'
import type { Cache, CachedEntity } from './cache.types.js'
import type { ResourceClient } from '#lib/resources/resourceClient.svelte.js'
import type { AccountState } from './account.svelte.js'
import type { FeatureQueryChannel } from './featureQuery.types.js'
import type { FeatureQueryInput } from '#lib/api/services/featureQuery.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { Hub } from '#lib/db/zod/schema/hub.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { UserFeature } from '#lib/db/zod/schema/user.types.js'

/** Existing resource owners plus bounded callbacks for surface projections. */
export interface ResourceQueryDependencies {
  client: ResourceClient
  account: AccountState
  cache: Cache
  prisms: () => Prisms
  roleScope: () => string
  isAdmin: () => boolean
  retain: <K extends Exclude<keyof Cache, 'stats'>>(
    resource: K,
    rows: Array<CachedEntity<K>>,
  ) => void
  featuresChanged: (rows: FeatureFromCollection[]) => void
  afterLayers: (cascade: boolean, autoSelect: boolean, scope?: string) => Promise<void>
}

/** Coordinates request ordering and projections around ResourceClient; creates no additional cache. */
export class ResourceQueryCoordinator {
  rows: FilteredResources = $state({
    organisation: [],
    project: [],
    layer: [],
    feature: [],
    task: [],
    hub: [],
  })
  /** @param dependencies Existing client, account and explicit projection capabilities. */
  constructor(private readonly dependencies: ResourceQueryDependencies) {}

  isLoadingResources = $state(false)

  // Query map to store different query functions (can be overridden by AdminCtx)
  queryMap = new Map<
    FirstClassResource | 'userFeatures',
    {
      queryKey: () => unknown[]
      queryFn: () => Promise<unknown>
    }
  >()

  // Cache for all resources
  featureLoadState = $state<'idle' | 'loading' | 'partial' | 'complete' | 'error'>(
    'idle',
  )

  featureRefreshSerial = 0

  private resourceRefreshSerials = new Map<string, number>()

  /**
   * Starts a resource refresh and returns its serial for stale-response checks.
   *
   * @param resource - Resource whose previous refreshes must be superseded.
   * @returns The serial assigned to this refresh.
   */
  beginResourceRefresh = (resource: string): number => {
    const serial = (this.resourceRefreshSerials.get(resource) ?? 0) + 1
    this.resourceRefreshSerials.set(resource, serial)
    return serial
  }

  /**
   * Determines whether a resource response is still the newest response.
   *
   * @param resource - Resource associated with the request.
   * @param serial - Serial captured when the request started.
   * @returns Whether the response may update application state.
   */
  isCurrentResourceRefresh = (resource: string, serial: number): boolean =>
    this.resourceRefreshSerials.get(resource) === serial

  /**
   * Invalidates all tracked list refreshes before identity or cache transitions.
   *
   * @returns Nothing.
   */
  invalidateResourceRefreshes = (): void => {
    for (const [resource, serial] of this.resourceRefreshSerials) {
      this.resourceRefreshSerials.set(resource, serial + 1)
    }
  }

  getRequiredQueryConfig = (
    resource: FirstClassResource | 'userFeatures',
  ): {
    queryKey: unknown[]
    queryFn: () => Promise<unknown>
  } => {
    const config = this.queryMap.get(resource)
    if (!config) {
      throw new Error(`Missing query config for ${resource}`)
    }

    return {
      queryKey: config.queryKey(),
      queryFn: config.queryFn,
    }
  }

  /**
   * Gives cached previews the same known hierarchy and user membership facts as the UI.
   * @returns Nothing after configuring each independent feature collection.
   */
  private configureFeatureQueries = (): void => {
    for (const query of Object.values(this.dependencies.client.featureQueries)) {
      query.setMatchContext({
        layerProjectId: id => this.dependencies.cache.layer.get(id)?.projectId,
        projectOrganisationId: id =>
          this.dependencies.cache.project.get(id)?.organisationId,
        listMembership: (row, list) => {
          if (list.userId && list.userId !== this.dependencies.account.user?.id)
            return undefined
          return this.dependencies.account.collections.membership(row.id, list.listId)
        },
      })
    }
  }

  /**
   * Loads one page for an independently scoped feature view.
   * @param channel - View whose page membership is being updated.
   * @param input - Complete query identity; spatial scope is optional.
   * @returns Completion of the first page, while fresh cached matches appear immediately.
   */
  loadFeatureQuery = async (
    channel: FeatureQueryChannel,
    input: FeatureQueryInput,
  ): Promise<void> => {
    const query = this.dependencies.client.featureQueries[channel]
    this.configureFeatureQueries()
    if (channel === 'map') this.featureLoadState = 'loading'
    try {
      await query.load(input)
    } catch (error) {
      if (channel === 'map' && query.isCurrent(input) && query.error === error)
        this.featureLoadState = 'error'
      throw error
    }
    // Superseded requests must not finish the newer view's loading indicator or retention.
    if (
      input.meta.scope !== this.dependencies.client.scopeKey ||
      !query.isCurrent(input)
    )
      return
    if (channel === 'map' && !query.loading) this.featureLoadState = 'complete'
    this.retainFeatureQueryRows(channel)
  }

  /**
   * Retains navigable feature records and current-user membership from fetched pages.
   * @param channel - Query whose current pages have settled.
   * @returns Nothing; map display membership remains independent of retained identities.
   */
  retainFeatureQueryRows = (channel: FeatureQueryChannel): void => {
    const query = this.dependencies.client.featureQueries[channel]
    for (const row of query.rows) this.dependencies.cache.feature.set(row.id, row)
    while (this.dependencies.cache.feature.size > 2_000) {
      const oldest = this.dependencies.cache.feature.keys().next().value
      if (!oldest) break
      const row = this.dependencies.cache.feature.get(oldest)
      if (!row) break
      this.dependencies.cache.feature.delete(oldest)
    }
    for (const page of query.pages) {
      if (!page.current?.userFeatures) continue
      this.dependencies.account.collections.mergePage(
        page.current.data.map(row => row.id),
        page.current.userFeatures,
      )
    }
  }

  /**
   * Appends one server page to an active feature view.
   * @param channel - Independent list/search collection to extend.
   * @returns Completion after new IDs and membership state are retained.
   */
  loadMoreFeatureQuery = async (channel: FeatureQueryChannel): Promise<void> => {
    const scope = this.dependencies.client.scopeKey
    await this.dependencies.client.featureQueries[channel].next()
    if (scope === this.dependencies.client.scopeKey)
      this.retainFeatureQueryRows(channel)
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
    } else if (resource === 'property') {
      await this.refreshProperties()
    } else if (resource === 'userFeatures') {
      await this.refreshUserFeatures()
    }
  }

  /**
   * Refreshes organisations and reconciles their dependent filter scope.
   *
   * @param isCascading - Whether to refresh dependent projects.
   * @param expectedRoleScope - Optional identity scope that must still be current.
   * @returns Nothing after the organisation state is reconciled.
   */
  refreshOrganisations = async (
    isCascading: boolean = true,
    expectedRoleScope?: string,
  ): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.organisation)
    const query = this.getRequiredQueryConfig(FirstClassResource.organisation)
    const organisations = await (query.queryFn() as Promise<Organisation[]>)
    if (
      !this.isCurrentResourceRefresh(FirstClassResource.organisation, refreshSerial)
    ) {
      return
    }
    if (!(!expectedRoleScope || expectedRoleScope === this.dependencies.roleScope()))
      return

    this.rows.organisation = organisations
    // Efficiently sync organization cache (only add missing, remove stale)
    this.dependencies.retain('organisation', this.rows.organisation)
    // Sync organisation prisms to remove any invalid organisation IDs
    // Paged results do not establish whether a selected identity still exists.
    if (isCascading) {
      await this.refreshProjects(true, expectedRoleScope)
    }
  }

  /**
   * Refreshes projects and reconciles their dependent filter scope.
   *
   * @param isCascading - Whether to refresh dependent properties and layers.
   * @param expectedRoleScope - Optional identity scope that must still be current.
   * @returns Nothing after the project state is reconciled.
   */
  refreshProjects = async (
    isCascading: boolean = true,
    expectedRoleScope?: string,
  ): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.project)
    const query = this.getRequiredQueryConfig(FirstClassResource.project)
    const projects = await (query.queryFn() as Promise<Project[]>)
    if (!this.isCurrentResourceRefresh(FirstClassResource.project, refreshSerial)) {
      return
    }
    if (!(!expectedRoleScope || expectedRoleScope === this.dependencies.roleScope()))
      return

    this.rows.project = projects
    // Efficiently sync project cache (only add missing, remove stale)
    this.dependencies.retain('project', this.rows.project)
    // Sync project prisms to remove any invalid project IDs
    // Paged results do not establish whether a selected identity still exists.
    if (isCascading) {
      await this.refreshProperties(true, expectedRoleScope)
      await this.refreshLayers(true, true, expectedRoleScope)
    }
  }

  /**
   * Refreshes layers for the active hierarchy and reconciles layer filter state.
   *
   * @param isCascading - Whether dependent feature and profile data should refresh.
   * @param shouldAutoSelectSingleLayer - Whether one available layer is activated automatically.
   * @param expectedRoleScope - Optional identity scope that must still be current.
   * @returns A promise that resolves once the layer state has been reconciled.
   */
  refreshLayers = async (
    isCascading: boolean = true,
    shouldAutoSelectSingleLayer: boolean = true,
    expectedRoleScope?: string,
  ): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.layer)
    const query = this.getRequiredQueryConfig(FirstClassResource.layer)
    const layers = await (query.queryFn() as Promise<Layer[]>)
    if (!this.isCurrentResourceRefresh(FirstClassResource.layer, refreshSerial)) {
      return
    }
    if (!(!expectedRoleScope || expectedRoleScope === this.dependencies.roleScope()))
      return

    this.rows.layer = layers
    // Efficiently sync layer cache (only add missing, remove stale)
    this.dependencies.retain('layer', this.rows.layer)
    // Sync layer prisms to remove any layerIds which are no londer valid resources given the parent prism selection.
    // Paged results do not establish whether a selected identity still exists.
    // Also calls this.refreshFeatures()
    await this.dependencies.afterLayers(
      isCascading,
      shouldAutoSelectSingleLayer,
      expectedRoleScope,
    )
  }

  /**
   * Refreshes the feature collection for the current hierarchy and user scope.
   *
   * @param _isCascading - Reserved for the resource refresh contract.
   * @param expectedRoleScope - Optional scope captured before the request started.
   * @returns Nothing after current-scope feature data has been committed.
   * @remarks A background public-map request must not overwrite the image-bearing
   * collection fetched after an anonymous or account session is established.
   */
  refreshFeatures = async (
    _isCascading: boolean = true,
    expectedRoleScope?: string,
  ): Promise<void> => {
    const refreshSerial = ++this.featureRefreshSerial
    const selection = JSON.stringify(this.dependencies.prisms().layer)
    const query = this.getRequiredQueryConfig(FirstClassResource.feature)
    const features: FeatureFromCollection[] = await (query.queryFn() as Promise<
      FeatureFromCollection[]
    >)

    if (
      refreshSerial !== this.featureRefreshSerial ||
      selection !== JSON.stringify(this.dependencies.prisms().layer)
    ) {
      logMarkerBootstrap('stale feature data ignored after a newer refresh started', {
        refreshSerial,
        currentRefreshSerial: this.featureRefreshSerial,
        featureCount: features.length,
      })
      return
    }

    if (expectedRoleScope && expectedRoleScope !== this.dependencies.roleScope()) {
      logMarkerBootstrap('stale feature data ignored after identity change', {
        expectedRoleScope,
        currentRoleScope: this.dependencies.roleScope(),
        featureCount: features.length,
      })
      return
    }

    this.rows.feature = features
    // Retain entities shared with search and list queries; viewport membership is independent.
    for (const feature of features)
      this.dependencies.cache.feature.set(feature.id, feature)

    logMarkerBootstrap('feature data committed', {
      featureCount: features.length,
      imageBackedFeatureCount: features.filter(feature => Boolean(feature.image))
        .length,
      pointFeatureCount: features.filter(feature => feature.geometry?.type === 'Point')
        .length,
    })

    // Surface projections consume committed rows without taking over request lifetimes.
    this.dependencies.featuresChanged(features)
  }

  refreshTasks = async (_isCascading: boolean = true): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.task)
    const query = this.getRequiredQueryConfig(FirstClassResource.task)
    const tasks = await (query.queryFn() as Promise<Task[]>)
    if (!this.isCurrentResourceRefresh(FirstClassResource.task, refreshSerial)) {
      return
    }
    this.rows.task = tasks
    // Efficiently sync task cache (only add missing, remove stale)
    this.dependencies.retain('task', this.rows.task)
  }

  refreshHubs = async (_isCascading: boolean = true): Promise<void> => {
    if (!this.dependencies.isAdmin()) return
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.hub)
    const query = this.getRequiredQueryConfig(FirstClassResource.hub)
    const hubs = await (query.queryFn() as Promise<Hub[]>)
    if (!this.isCurrentResourceRefresh(FirstClassResource.hub, refreshSerial)) {
      return
    }
    this.rows.hub = hubs
    // Efficiently sync hub cache (only add missing, remove stale)
    this.dependencies.retain('hub', this.rows.hub)
  }

  /**
   * Refreshes property definitions for the active hierarchy.
   *
   * @param _isCascading - Reserved for the resource refresh contract.
   * @param expectedRoleScope - Optional identity scope that must still be current.
   * @returns Nothing after the property cache is reconciled.
   */
  refreshProperties = async (
    _isCascading: boolean = true,
    expectedRoleScope?: string,
  ): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.property)
    const query = this.getRequiredQueryConfig(FirstClassResource.property)
    const properties = await (query.queryFn() as Promise<Property[]>)
    if (!this.isCurrentResourceRefresh(FirstClassResource.property, refreshSerial)) {
      return
    }
    if (!(!expectedRoleScope || expectedRoleScope === this.dependencies.roleScope()))
      return

    // Efficiently sync property cache (only add missing, remove stale)
    this.dependencies.retain('property', properties)
  }

  refreshUserFeatures = async (_isCascading: boolean = true): Promise<void> => {
    const generation = this.dependencies.account.collections.beginRefresh()
    const refreshSerial = this.beginResourceRefresh('userFeatures')
    const userId = this.dependencies.account.user?.id ?? null
    const query = this.getRequiredQueryConfig('userFeatures')
    const userFeatures = await (query.queryFn() as Promise<UserFeature[]>)
    if (
      !this.isCurrentResourceRefresh('userFeatures', refreshSerial) ||
      userId !== (this.dependencies.account.user?.id ?? null)
    ) {
      return
    }

    this.dependencies.account.collections.replace(userFeatures || [], generation)
  }
}
