// SVELTE
import { getContext, setContext } from 'svelte'
import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'
import { createHierarchyClient } from '#lib/resources/hierarchyClient.js'
import { resourceProviders } from '#lib/resources/providers.js'
import { CacheCtx } from './cache.svelte'
import {
  getDefaultLayerResources,
  getPinnedResource,
} from '#lib/api/resources.remote.js'
import type {
  PanelResourceType,
  PanelResource,
} from '#lib/api/services/resourcePage.types.js'
// DATA
// NAVIGATION
// GEO
// I18N
import { getFallbackLocales, getLocale, getLocaleKey, getI18n } from '#lib/i18n.js'
// LIB
import {
  getOrganisation,
  getOrganisationsWhichHaveLayers,
} from '#lib/api/organisation.remote.js'
import { getHub, getHubs } from '#lib/api/hub.remote.js'
import { getProject, getProjects } from '#lib/api/project.remote.js'
import { getLayer, getLayers } from '#lib/api/layer.remote.js'
import { getFeature, getFeatures } from '#lib/api/feature.remote.js'
import { getProperties, getProperty } from '#lib/api/property.remote.js'
import { getUser, getUserFeatures, getUserLayers } from '#lib/api/user.remote.js'
// SERVICES
import { debouncedUpdateUserAttribution } from '#lib/client/services/user.js'
// AUTH
import {
  getFeatureIdsForProperties,
  sortProperties,
} from '#lib/client/services/property.js'
import {
  getCachedFeatureSpecifierTranslation,
  calculateSpecifierTranslation,
  primeFeatureStatsCache,
} from '#lib/client/services/stats.js'
import {
  refreshRemoteQuery as runRemoteQuery,
  toSafeListResponse,
} from '#lib/remote/index.js'
// CONTEXT
// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// MARKERS
// ENUMS
import { FirstClassResource, Panel } from '#lib/enums.js'
// TYPES
import type { Cache } from '#lib/context/cache.types.js'
import type {
  Code,
  Id,
  Locale,
  Resource,
  ResourceContext,
  ListResponse,
  UserRoleDisco,
} from '#lib/types.js'
import type { FilteredResources } from '#lib/client/services/filters.types.js'
import type { FeatureSpatialQuery } from '#lib/api/services/featureQuery.types.js'
import type { Task } from '#lib/db/zod/schema/task.types.js'
import type { Image } from '#lib/db/zod/schema/image.types.js'
import type { Property } from '#lib/db/zod/schema/property.types.js'
import type { Organisation } from '#lib/db/zod/schema/organisation.types.js'
import type { Project } from '#lib/db/zod/schema/project.types.js'
import type { Layer } from '#lib/db/zod/schema/layer.types.js'
import type { Hub, HubOptsExtended } from '#lib/db/zod/schema/hub.types.js'
import type {
  CurrentUser,
  UserFeature,
  UserLayer,
  UserPreferences,
  UserProfile,
} from '#lib/db/zod/schema/user.types.js'
import type { DivisionCtx } from './division.svelte'
// CONTEXT
import type { AccountState, AccountUser } from './account.svelte.js'
import { ResourceQueryCoordinator } from './resourceQueries.svelte.js'
import { ResourceFilters } from './resourceFilters.svelte.js'
import { ResourceScope } from './resourceScope.svelte.js'
import { FeatureDraft } from './featureDraft.svelte.js'
import { SurfaceInteractions } from './surfaceInteractions.svelte.js'
import { PanelController } from './panels.svelte.js'
import { SurfaceLayout, setSurfaceLayoutCtx } from './surfaceLayout.svelte.js'
import type { ResponsiveCtx } from './responsive.svelte'
import type {
  Feature,
  FeatureFromCollection,
} from '#lib/db/zod/schema/feature.types.js'
// TYPES
import type { EntityResponse } from '#lib/types.js'
import type {
  OrganisationProfile,
  OrganisationListParamsByProfile,
  OrganisationListByProfile,
  OrganisationGetParamsByProfile,
  OrganisationEntityByProfile,
} from '#lib/db/zod/schema/organisation.types.js'
import type {
  HubProfile,
  HubListParamsByProfile,
  HubListByProfile,
  HubGetParamsByProfile,
  HubEntityByProfile,
} from '#lib/db/zod/schema/hub.types.js'
import type {
  LayerProfile,
  LayerListParamsByProfile,
  LayerListByProfile,
  LayerGetParamsByProfile,
  LayerEntityByProfile,
} from '#lib/db/zod/schema/layer.types.js'

/* ----------------- */
// CTX STATE :: RESOURCE VIEW
/* -------- */

type ResourceViewState = {
  userLocation: {
    coords: {
      accuracy: number
      altitude: number | null
      altitudeAccuracy: number | null
      heading: number | null
      latitude: number
      longitude: number
      speed: number | null
    }
    timestamp: number
  } | null
  distancesFromUser: Record<Id, number>
  // TIER 3: VIEW FILTERS - Only affect current route/view
}

type RemoteListFn<Params, Result> = (params: Params) => Promise<ListResponse<Result>>

type RemoteGetFn<Params, Result> = (params: Params) => Promise<EntityResponse<Result>>

type OrganisationRemoteListFn = <P extends OrganisationProfile = OrganisationProfile>(
  params: OrganisationListParamsByProfile<P>,
) => Promise<ListResponse<OrganisationListByProfile<P>>>

type OrganisationRemoteGetFn = <P extends OrganisationProfile = OrganisationProfile>(
  params: OrganisationGetParamsByProfile<P>,
) => Promise<EntityResponse<OrganisationEntityByProfile<P>>>

type HubRemoteListFn = <P extends HubProfile = HubProfile>(
  params: HubListParamsByProfile<P>,
) => Promise<ListResponse<HubListByProfile<P>>>

type HubRemoteGetFn = <P extends HubProfile = HubProfile>(
  params: HubGetParamsByProfile<P>,
) => Promise<EntityResponse<HubEntityByProfile<P>>>

type LayerRemoteListFn = <P extends LayerProfile = LayerProfile>(
  params: LayerListParamsByProfile<P>,
) => Promise<ListResponse<LayerListByProfile<P>>>

type LayerRemoteGetFn = <P extends LayerProfile = LayerProfile>(
  params: LayerGetParamsByProfile<P>,
) => Promise<EntityResponse<LayerEntityByProfile<P>>>

type RemoteMapEntry<
  ListParams = unknown,
  ListResult = unknown,
  GetParams = unknown,
  GetResult = unknown,
> = {
  list?: RemoteListFn<ListParams, ListResult>
  get?: RemoteGetFn<GetParams, GetResult>
}

type RemoteMapEntryByResource = {
  [FirstClassResource.organisation]: {
    list?: OrganisationRemoteListFn
    get?: OrganisationRemoteGetFn
  }
  [FirstClassResource.hub]: {
    list?: HubRemoteListFn
    get?: HubRemoteGetFn
  }
  [FirstClassResource.project]: RemoteMapEntry
  [FirstClassResource.layer]: {
    list?: LayerRemoteListFn
    get?: LayerRemoteGetFn
  }
  [FirstClassResource.feature]: RemoteMapEntry
  [FirstClassResource.task]: RemoteMapEntry
  [FirstClassResource.property]: RemoteMapEntry
  [FirstClassResource.user]: RemoteMapEntry
}

type RemoteMap = { [Key in FirstClassResource]: RemoteMapEntryByResource[Key] }

export class ResourceViewCtx {
  private releaseMembership: () => void = () => {}
  readonly queries: ResourceQueryCoordinator
  readonly filters: ResourceFilters
  readonly scope = new ResourceScope({
    account: () => this.account,
    hub: () => this.hub,
    loadedLayers: () => this.queries.rows.layer,
    projects: () => this.cache.project.values(),
    layers: () => this.cache.layer.values(),
    getHubIdByCode: code => this.getHubIdByCode(code),
    isExpectedRoleScopeCurrent: scope => this.isExpectedRoleScopeCurrent(scope),
    refreshOrganisations: () => this.queries.refreshOrganisations(),
    refreshProjects: cascade => this.queries.refreshProjects(cascade),
    refreshProperties: () => this.queries.refreshProperties(),
    refreshLayers: (cascade, autoSelect) =>
      this.queries.refreshLayers(cascade, autoSelect),
    refreshLayerDependents: async () => {
      await this.queries.refreshFeatures()
      if (this.user?.id && this.isAdmin()) await this.queries.refreshTasks()
      if (this.panels.state.profile.ctx?.username) await this.refreshUserProfile()
    },
    postLayerMutation: (cascade, autoSelect) =>
      this.postLayerMutation(cascade, autoSelect),
    invalidateAndRefresh: resource => this.invalidateAndRefresh(resource),
  })
  // Remote queries own transport caching and refreshes.
  // Division context
  divisionCtx!: DivisionCtx
  // Surface-owned panel state and geometry
  readonly panels = new PanelController({
    loadProfile: () => this.refreshUserProfile(false),
    invalidateProfile: () => {
      this.queries.beginResourceRefresh(FirstClassResource.user)
    },
  })
  /**
   * Geometry for one route-owned application area (a "surface"): for example,
   * the public map experience owned by AppCtx, or /admin owned by AdminCtx.view.
   * Routes within that area share its main-region measurements and panel offsets;
   * another surface has its own layout while sharing root viewport measurements.
   */
  readonly layout: SurfaceLayout
  // Root browser measurements
  responsiveCtx!: ResponsiveCtx
  // Root-owned identity and self-profile enrichment; standalone views can supply their own store.
  readonly account: AccountState
  private appliedAccountRevision = -1

  /** Reads presentation data without owning or mutating session identity. @returns The account snapshot. */
  get user(): AccountUser | null {
    return this.account.user
  }
  // Whether this resource view has completed its initialization
  isInitialised: boolean = $state(false)
  // Whether the app is in mobile mode
  isMobile: boolean = $state(false)

  listQueryMeta = new Map<string, Omit<ListResponse<unknown>, 'data'>>()

  // Remote function map for list/get queries (parallel to queryMap).
  remoteMap: RemoteMap = {
    [FirstClassResource.organisation]: {},
    [FirstClassResource.project]: {},
    [FirstClassResource.layer]: {},
    [FirstClassResource.feature]: {},
    [FirstClassResource.task]: {},
    [FirstClassResource.hub]: {},
    [FirstClassResource.property]: {},
    [FirstClassResource.user]: {},
  }
  readonly cacheCtx: CacheCtx
  readonly resources: ResourceClient
  readonly hierarchy: ReturnType<typeof createHierarchyClient>
  cache: Cache
  featureViewport: FeatureSpatialQuery | undefined = $state.raw()

  hub: HubOptsExtended | null = $state(null)

  // Features map for current state (rebuilt when state.resources.feature changes)
  private featuresMap = new SvelteMap<Id, FeatureFromCollection | Feature>()
  private organisationCodeToId = new Map<Code, Id>()
  private projectCodeToId = new Map<Code, Id>()
  private hubCodeToId = new Map<Code, Id>()

  state: ResourceViewState = $state({
    // TIER 3: VIEW FILTERS -- Handled by individual admin views (e.g., AppCtx.state.viewFilters)
    // Only affect the current route/view they are applied on, not the underlying data or map view
    // Resources -- The resources fetched from the database (post prism-filtering, pre filters-filtering)
    // User Location -- The user's location
    userLocation: null,
    // ENHANCEMENT: Implement distancesFromUser
    // Distances from user -- The distances from the user to the features
    distancesFromUser: {},
  })

  readonly draft = new FeatureDraft()
  readonly interactions: SurfaceInteractions

  // ═══════════════════════
  // QUERY KEYS
  // ═══════════════════════

  private disposed = false

  getRoleScopeQueryKey = (): string => {
    if (this.disposed) return 'disposed'
    const userId = this.account.session?.id ?? 'anonymous'
    const roles = this.getUserRoles()

    const roleSignature = roles
      .map((role: UserRoleDisco) => {
        if (role.type === 'organisation') {
          return `organisation:${role.organisationId}:${role.role}`
        }
        if (role.type === 'project') {
          return `project:${role.projectId}:${role.role}`
        }
        return `hub:${role.hubId}:${role.role}`
      })
      .sort((left: string, right: string) => left.localeCompare(right))
      .join('|')

    const anonymous = this.account.session?.isAnonymous
    const superAdmin = this.account.session?.superAdmin
    return `${userId}::${Boolean(anonymous)}::${Boolean(superAdmin)}::${roleSignature}`
  }

  /**
   * Determines whether work started for an identity scope can still update state.
   *
   * @param expectedRoleScope - Identity scope captured before an asynchronous request.
   * @returns Whether the scope is unchanged, or no scope was supplied.
   * @remarks Public-map bootstrap runs in the background on authentication routes. Its
   * responses must not update the account-scoped hierarchy after sign-in completes.
   */
  isExpectedRoleScopeCurrent = (expectedRoleScope?: string): boolean =>
    !expectedRoleScope || expectedRoleScope === this.getRoleScopeQueryKey()

  /**
   * Reads roles without depending on unrelated profile hydration.
   * @returns Authoritative session roles used to distinguish authorized query scopes.
   */
  private getUserRoles = (): UserRoleDisco[] => {
    // Session roles are authoritative before preference and user-layer hydration.
    // Requiring those unrelated fields changes the scope during parallel bootstrap.
    const roles = this.account.session?.roles ?? []
    return Array.isArray(roles) ? roles : []
  }

  organisationsQueryKey = () => [
    FirstClassResource.organisation,
    this.getRoleScopeQueryKey(),
    this.isAdmin(),
    this.filters.sorting.organisation.sortBy,
    this.filters.sorting.organisation.sortOrder,
  ]
  projectsQueryKey = () => [
    FirstClassResource.project,
    this.getRoleScopeQueryKey(),
    this.scope.prisms.organisation,
    this.isAdmin(),
    this.filters.sorting.project.sortBy,
    this.filters.sorting.project.sortOrder,
  ]
  layersQueryKey = () => [
    FirstClassResource.layer,
    this.getRoleScopeQueryKey(),
    this.scope.prisms.organisation,
    this.scope.prisms.project,
    this.isAdmin(),
    this.filters.sorting.layer.sortBy,
    this.filters.sorting.layer.sortOrder,
  ]
  featuresQueryKey = () => [
    FirstClassResource.feature,
    this.getRoleScopeQueryKey(),
    this.scope.prisms.organisation,
    this.scope.prisms.project,
    this.scope.prisms.layer,
    this.isAdmin(),
    this.filters.sorting.feature.sortBy,
    this.filters.sorting.feature.sortOrder,
  ]
  propertiesQueryKey = () => [
    'property',
    this.getRoleScopeQueryKey(),
    this.scope.prisms.organisation,
    this.scope.prisms.project,
  ]
  userFeaturesQueryKey = () => ['userFeatures', this.user?.id ?? 'no-user']
  userQueryKey = () => [
    FirstClassResource.user,
    this.getRoleScopeQueryKey(),
    this.panels.state.profile.ctx?.username || this.user?.id,
    ...(this.panels.state.profile.ctx?.observePrisms
      ? [
          this.scope.prisms.organisation,
          this.scope.prisms.project,
          this.scope.prisms.layer,
        ]
      : []),
  ]

  // Constructor
  constructor(
    divisionCtx: DivisionCtx,
    account: AccountState,
    responsiveCtx: ResponsiveCtx,
    cacheCtx: CacheCtx = new CacheCtx(resourceProviders),
    readonly surface: 'app' | 'admin' = 'app',
  ) {
    this.account = account
    this.cacheCtx = cacheCtx
    this.cache = cacheCtx.managedByRoot
      ? cacheCtx.createEntityStore()
      : cacheCtx.entities
    this.resources = new ResourceClient(
      cacheCtx,
      () =>
        `${this.getRoleScopeQueryKey()}:${this.hub?.id ?? this.hub?.code ?? ''}:${getLocaleKey()}:${this.surface}`,
      this.cache,
      () => this.isAdmin(),
    )
    this.queries = new ResourceQueryCoordinator({
      client: this.resources,
      account: this.account,
      cache: this.cache,
      prisms: () => this.scope.prisms,
      roleScope: () => this.getRoleScopeQueryKey(),
      isAdmin: () => this.isAdmin(),
      retain: (resource, rows) => {
        for (const row of rows)
          this.cache[resource].set(row.id, {
            ...this.cache[resource].get(row.id),
            ...row,
          } as never)
        if (resource === 'organisation')
          this.syncCodeToIdMap(this.organisationCodeToId, rows as Organisation[])
        if (resource === 'project')
          this.syncCodeToIdMap(this.projectCodeToId, rows as Project[])
        if (resource === 'hub') this.syncCodeToIdMap(this.hubCodeToId, rows as Hub[])
      },
      featuresChanged: features => {
        features.forEach(feature => {
          primeFeatureStatsCache(this, feature)
        })
        this.rebuildFeaturesMap()
        this.divisionCtx.setDivisionFeatures(
          this.scope.prisms.layer.length > 0 ? features : [],
        )
      },
      afterLayers: (cascade, autoSelect, scope) =>
        this.postLayerMutation(cascade, autoSelect, scope),
    })
    this.hierarchy = createHierarchyClient(this.resources)
    this.divisionCtx = divisionCtx
    this.filters = new ResourceFilters({
      cache: this.cache,
      isSuperAdmin: () => this.isSuperAdmin(),
      specifierTranslation: feature =>
        getCachedFeatureSpecifierTranslation(this, feature, f =>
          calculateSpecifierTranslation(f),
        ),
      prisms: () => this.scope.prisms,
      rows: () => this.queries.rows,
      scopeKey: () => this.resources.scopeKey,
      isAdmin: () => this.isAdmin(),
      preferences: () => this.getUserPreferences(),
      divisions: divisionCtx,
    })
    this.responsiveCtx = responsiveCtx
    this.layout = new SurfaceLayout(responsiveCtx, this.panels)
    this.syncAccount()
    this.releaseMembership = this.account.collections.subscribe(() =>
      this.onUserFeaturesChanged(),
    )
    this.initializeRemoteMap()
    this.initializeQueryMap()
    this.interactions = new SurfaceInteractions(
      this.panels,
      this.account,
      () => this.isAdmin(),
      () => Boolean(this.hub?.isCore),
    )
    // Note: keydown handlers are managed dynamically by the surface layout
  }

  private initializeRemoteMap = (): void => {
    this.remoteMap[FirstClassResource.organisation] = {
      list: getOrganisationsWhichHaveLayers,
      get: getOrganisation,
    }
    this.remoteMap[FirstClassResource.project] = {
      list: getProjects as unknown as RemoteListFn<unknown, unknown>,
      get: getProject as unknown as RemoteGetFn<unknown, unknown>,
    }
    this.remoteMap[FirstClassResource.layer] = {
      list: getLayers,
      get: getLayer,
    }
    this.remoteMap[FirstClassResource.feature] = {
      list: getFeatures as unknown as RemoteListFn<unknown, unknown>,
      get: getFeature as unknown as RemoteGetFn<unknown, unknown>,
    }
    this.remoteMap[FirstClassResource.hub] = {
      list: getHubs,
      get: getHub,
    }
    this.remoteMap[FirstClassResource.property] = {
      list: getProperties as unknown as RemoteListFn<unknown, unknown>,
      get: getProperty as unknown as RemoteGetFn<unknown, unknown>,
    }
    this.remoteMap[FirstClassResource.user] = {
      get: getUser as unknown as RemoteGetFn<unknown, unknown>,
    }
  }

  // Initialize default query map (can be overridden by AdminCtx)
  private initializeQueryMap = (): void => {
    this.queries.queryMap.clear()

    this.queries.queryMap.set(FirstClassResource.organisation, {
      queryKey: this.organisationsQueryKey,
      queryFn: () => this.organisationsQueryFn(),
    })

    this.queries.queryMap.set(FirstClassResource.project, {
      queryKey: this.projectsQueryKey,
      queryFn: () => this.projectsQueryFn(),
    })

    this.queries.queryMap.set(FirstClassResource.layer, {
      queryKey: this.layersQueryKey,
      queryFn: () => this.layersQueryFn(),
    })

    this.queries.queryMap.set(FirstClassResource.feature, {
      queryKey: this.featuresQueryKey,
      queryFn: () => this.featuresQueryFn(),
    })

    // ADMIN ONLY
    this.queries.queryMap.set(FirstClassResource.task, {
      queryKey: () => [FirstClassResource.task],
      queryFn: () => Promise.resolve([]),
    })

    // ADMIN ONLY
    this.queries.queryMap.set(FirstClassResource.hub, {
      queryKey: () => [FirstClassResource.hub],
      queryFn: () => Promise.resolve([]),
    })

    // APP ONLY
    this.queries.queryMap.set('userFeatures', {
      queryKey: this.userFeaturesQueryKey,
      queryFn: () => this.userFeaturesQueryFn(),
    })

    this.queries.queryMap.set(FirstClassResource.user, {
      queryKey: this.userQueryKey,
      queryFn: () => this.userQueryFn(),
    })

    // PROPERTIES
    this.queries.queryMap.set(FirstClassResource.property, {
      queryKey: this.propertiesQueryKey,
      queryFn: () => this.propertiesQueryFn(),
    })
  }

  /** Initialises shared view bookkeeping without loading another surface's resources. */
  init = async (_userId: Id | null, _loadFeatures: boolean = false): Promise<void> => {
    this.initStatsCache()
    this.isInitialised = true
  }

  // Hydrate persisted layer defaults once during app bootstrap so hub prism setup
  // can resolve the initial active layers without coupling to profile panel refreshes.
  hydrateCurrentUserLayers = async (): Promise<void> => {
    const accountRevision = this.account.revision
    const userId = this.user?.id
    const roleScope = this.getRoleScopeQueryKey()
    if (!userId) {
      return
    }

    const userLayersResponse = (await runRemoteQuery(
      getUserLayers({
        userId,
      }),
    )) as { data?: UserLayer[] | null }

    if (
      accountRevision !== this.account.revision ||
      userId !== this.user?.id ||
      roleScope !== this.getRoleScopeQueryKey()
    ) {
      return
    }

    this.account.applyProfile(
      {
        userLayers: Array.isArray(userLayersResponse.data)
          ? userLayersResponse.data
          : [],
      },
      accountRevision,
    )

    this.postUserMutation()
  }

  initStatsCache = (): void => {
    Object.values(FirstClassResource).forEach(resourceType => {
      this.cache.stats.set(resourceType, new SvelteMap())
    })
  }

  reinitializeWithAuth = async (): Promise<void> => {
    if (this.user?.id) {
      this.isInitialised = false
      await this.init(this.user.id)
    }
  }

  // ASSERT :: User is SuperAdmin
  isSuperAdmin(): boolean {
    return Boolean(this.account.session?.superAdmin === true)
  }

  // ASSERT :: App is in admin dashboard
  isAdmin(): boolean {
    return this.surface === 'admin'
  }

  /** Loads the complete default selection metadata without loading the complete panel lists. */
  loadDefaultLayerResources = async (scope?: string): Promise<void> => {
    const expected = scope ?? this.getRoleScopeQueryKey()
    const rows = await runRemoteQuery(
      getDefaultLayerResources({ meta: this.filters.panelResourceInput('layer').meta }),
    )
    if (!this.isExpectedRoleScopeCurrent(expected)) return
    this.scope.selectionLayers = rows as unknown as Layer[]
    this.retainPanelRows('layer', rows)
  }

  /** Resolves selected layers outside page one through the shared native batch query. */
  loadPinnedLayers = async (scope?: string): Promise<void> => {
    const expected = scope ?? this.getRoleScopeQueryKey()
    const meta = this.filters.panelResourceInput('layer').meta
    const selection = JSON.stringify(this.scope.prisms.layer)
    const rows = await Promise.all(
      this.scope.prisms.layer.map(id =>
        getPinnedResource({ type: 'layer', id, profile: 'default', meta }),
      ),
    )
    if (
      !this.isExpectedRoleScopeCurrent(expected) ||
      selection !== JSON.stringify(this.scope.prisms.layer)
    )
      return
    const available = rows.filter((row): row is PanelResource => row !== null)
    this.retainPanelRows('layer', available)
    const projectIds = [
      ...new Set(available.flatMap(row => ('projectId' in row ? [row.projectId] : []))),
    ]
    const projects = await Promise.all(
      projectIds.map(id =>
        getPinnedResource({ type: 'project', id, profile: 'default', meta }),
      ),
    )
    if (
      !this.isExpectedRoleScopeCurrent(expected) ||
      selection !== JSON.stringify(this.scope.prisms.layer)
    )
      return
    this.retainPanelRows(
      'project',
      projects.filter((row): row is PanelResource => row !== null),
    )
    const ids = new Set(available.map(row => row.id))
    this.scope.prisms.layer = this.scope.prisms.layer.filter(id => ids.has(id))
  }

  /** Loads a first compact page independently of other hierarchy collections. */
  loadPanelResource = async (type: PanelResourceType): Promise<PanelResource[]> => {
    const list = this.resources.lists[type]
    await list.load(this.filters.panelResourceInput(type, list.search), true)
    return list.rows
  }

  /** Retains loaded identities without using cache membership as list membership. */
  retainPanelRows = (type: PanelResourceType, rows: PanelResource[]): void => {
    const store = this.cache[type] as Map<string, PanelResource>
    for (const row of rows)
      if (!row.id.startsWith('pending:'))
        store.set(row.id, { ...store.get(row.id), ...row })
  }

  organisationsQueryFn = async (): Promise<Organisation[]> => {
    return (await this.loadPanelResource('organisation')) as unknown as Organisation[]
  }
  projectsQueryFn = async (): Promise<Project[]> => {
    return (await this.loadPanelResource('project')) as unknown as Project[]
  }

  layersQueryFn = async (): Promise<Layer[]> => {
    return (await this.loadPanelResource('layer')) as unknown as Layer[]
  }

  /**
   * Loads one bounded map page instead of draining every selected layer's cursor.
   * @returns Current viewport features, with additional pages available explicitly.
   */
  /** Surface-specific feature loading is supplied by public or admin orchestration. @returns No implicit map query. */
  featuresQueryFn = async (): Promise<FeatureFromCollection[]> => []

  propertiesQueryFn = async (): Promise<Property[]> => {
    const remoteList = this.remoteMap[FirstClassResource.property].list
    if (!remoteList) {
      throw new Error('Property remote list function is not configured.')
    }
    const result = toSafeListResponse<Property>(
      (await runRemoteQuery(
        remoteList({
          conditions: {},
          prisms: this.scope.prisms,
        }),
      )) as ListResponse<Property> | undefined,
    )
    return result.data
  }

  userFeaturesQueryFn = async (): Promise<UserFeature[]> => {
    if (!this.user?.id) {
      return []
    }
    const response = (await runRemoteQuery(
      getUserFeatures({
        userId: this.user.id,
        sorting: {
          sortBy: 'modifiedAt',
          sortOrder: 'desc',
        },
      }),
    )) as unknown as { data?: UserFeature[] | null }
    return Array.isArray(response.data) ? response.data : []
  }

  userQueryFn = async (): Promise<UserProfile | null> => {
    const requestedUsername = this.panels.state.profile.ctx?.username?.trim() || null
    const isSelfProfile =
      !requestedUsername || requestedUsername === (this.user?.username ?? null)
    const userRef = isSelfProfile ? this.user?.id : requestedUsername
    if (!userRef) return null

    const refKey = isSelfProfile ? 'id' : 'username'
    const profile = isSelfProfile ? 'self' : 'detail'

    const response = (await runRemoteQuery(
      getUser({
        ref: userRef,
        refKey,
        ...(this.panels.state.profile.ctx?.observePrisms
          ? { prisms: this.scope.prisms }
          : {}),
        meta: {
          profile,
        },
      }),
    )) as { data?: UserProfile | null }

    return response.data ?? null
  }

  invalidateAndRefresh = async (
    resource: FirstClassResource | 'userFeatures',
  ): Promise<void> => {
    // Invalidate the query
    await this.invalidate(resource)
    // Refresh the resources
    await this.queries.refresh(resource)
  }

  /**
   * Targeted invalidation for image uploads - only invalidates and refreshes the specific resource
   * without triggering cascading refreshes. Updates the cache for that resource.
   * @param resource - The resource type to invalidate
   * @param resourceId - The ID of the specific resource to invalidate
   */
  invalidateResourceTargeted = async (
    resource: FirstClassResource,
    resourceId: Id,
  ): Promise<void> => {
    // Get the specific query key for this resource
    const queryKey = this.queries.queryMap.get(resource)?.queryKey()

    if (!queryKey) {
      console.warn(`No query key found for resource: ${resource}`)
      return
    }

    // The targeted refresh below explicitly refreshes the remote query.

    // Refresh only the specific resource without cascading
    await this.refreshResourceTargeted(resource, resourceId)
  }

  /**
   * Refresh a specific resource without triggering cascades
   * @param resource - The resource type to refresh
   * @param resourceId - The ID of the specific resource to refresh
   */
  private refreshResourceTargeted = async (
    resource: FirstClassResource,
    resourceId: Id,
  ): Promise<void> => {
    try {
      // Fetch the updated resource data
      const updatedResource = await this.fetchResourceById(resource, resourceId)

      if (updatedResource) {
        // Update the cache with the new resource data
        this.cache[resource].set(resourceId, updatedResource)

        // For features, also update the featuresMap
        if (resource === FirstClassResource.feature) {
          this.addFeatureToMap(updatedResource as Feature)
        }

        // Update the resources array if the resource exists there
        if (resource in this.queries.rows) {
          this.updateResourceInArray(
            resource as keyof FilteredResources,
            updatedResource as FilteredResources[keyof FilteredResources][number],
          )
        }
      }
    } catch (error) {
      console.error(`Failed to refresh resource ${resource}:${resourceId}`, error)
    }
  }

  /**
   * Converts a query key into a stable map key for storing list response metadata.
   *
   * @param queryKey - TanStack query key for a resource list.
   * @returns Serialized key suitable for `listQueryMeta`.
   * @remarks Metadata is tracked separately from cached list data so UI logic can read
   * pagination and sort state without duplicating full query responses in app state.
   */
  private toQueryMetaKey(queryKey: unknown[]): string {
    return JSON.stringify(queryKey)
  }

  /**
   * Stores list response metadata for a query while excluding the entity array payload.
   *
   * @param queryKey - TanStack query key for the fetched list.
   * @param response - Full list response returned by the remote API.
   * @returns Nothing.
   * @remarks The data array stays in TanStack Query and resource state; only the metadata is
   * retained here for pagination-aware admin and collection interactions.
   */
  setListQueryMeta<T>(queryKey: unknown[], response: ListResponse<T>): void {
    const { data: _data, ...meta } = response
    this.listQueryMeta.set(this.toQueryMetaKey(queryKey), meta)
  }

  /**
   * Returns cached list metadata for a previously fetched query key.
   *
   * @param queryKey - TanStack query key for the list.
   * @returns The stored response metadata, or `null` when nothing has been cached yet.
   */
  getListQueryMeta(queryKey: unknown[]): Omit<ListResponse<unknown>, 'data'> | null {
    return this.listQueryMeta.get(this.toQueryMetaKey(queryKey)) ?? null
  }

  /**
   * Writes a sorted entity list back into the resource state for the matching resource type.
   *
   * @param resource - Resource type whose state should be updated.
   * @param entities - Sorted entity array to persist into app state.
   * @returns Nothing.
   * @remarks Feature updates also rebuild dependent caches so map and neighbourhood views stay
   * aligned with the reordered feature collection.
   */
  setSortedResourceState<T extends Resource>(
    resource: FirstClassResource,
    entities: T[],
  ): void {
    if (resource === FirstClassResource.organisation) {
      this.queries.rows.organisation = entities as Organisation[]
      return
    }

    if (resource === FirstClassResource.project) {
      this.queries.rows.project = entities as Project[]
      return
    }

    if (resource === FirstClassResource.layer) {
      this.queries.rows.layer = entities as Layer[]
      return
    }

    if (resource === FirstClassResource.feature) {
      const features = entities as FeatureFromCollection[]
      this.queries.rows.feature = features
      // Rebuild derived feature lookups after replacing the entire feature list.
      this.rebuildFeaturesMap()
      // Keep neighbourhood-specific derived state in sync with the sorted feature collection.
      this.divisionCtx.setDivisionFeatures(
        this.scope.getPrism(FirstClassResource.layer).length > 0 ? features : [],
      )
      return
    }

    if (resource === FirstClassResource.task) {
      this.queries.rows.task = entities as Task[]
      return
    }

    if (resource === FirstClassResource.hub) {
      this.queries.rows.hub = entities as Hub[]
    }
  }

  /**
   * Update a resource in the appropriate resources array
   * @param resource - The resource type
   * @param updatedResource - The updated resource data
   */
  private updateResourceInArray = <K extends keyof FilteredResources>(
    resource: K,
    updatedResource: FilteredResources[K][number],
  ): void => {
    const resourceArray = this.queries.rows[resource]
    const index = resourceArray.findIndex(
      resourceItem => resourceItem.id === updatedResource.id,
    )
    if (index !== -1) {
      resourceArray[index] = updatedResource
    }
  }

  invalidate = async (
    resource: FirstClassResource | 'userFeatures' | 'user',
  ): Promise<void> => {
    const resourcesToInvalidate = [resource]
    // Clear relevant caches when invalidating (forces fresh data)
    if (resource === FirstClassResource.organisation) {
      this.cache.organisation.clear()
      this.organisationCodeToId.clear()
    } else if (resource === FirstClassResource.project) {
      this.cache.project.clear()
      this.projectCodeToId.clear()
      this.cache.property.clear()
      resourcesToInvalidate.push(FirstClassResource.property)
    } else if (resource === FirstClassResource.layer) {
      this.cache.layer.clear()
    } else if (resource === FirstClassResource.feature) {
      this.cache.feature.clear()
      this.featuresMap.clear()
    } else if (resource === FirstClassResource.task) {
      this.cache.task.clear()
    } else if (resource === FirstClassResource.hub) {
      this.cache.hub.clear()
      this.hubCodeToId.clear()
      this.cache.organisation.clear()
      resourcesToInvalidate.push(FirstClassResource.organisation)
    } else if (resource === FirstClassResource.property) {
      this.cache.property.clear()
    } else if (resource === 'user') {
      // TODO Should we clear the profile panel too?
      this.cache.user.clear()
    }

    // Invalidate request generations; subsequent refreshes go directly to the server.
    for (const resourceType of resourcesToInvalidate) {
      this.queries.beginResourceRefresh(resourceType)
    }
  }

  setTaskResourceAndCache = (task: Task): void => {
    const existingTask = this.queries.rows.task.find(t => t.id === task.id)
    if (existingTask) {
      this.queries.rows.task = this.queries.rows.task.map(t =>
        t.id === task.id ? task : t,
      )
    } else {
      this.queries.rows.task = [...this.queries.rows.task, task]
    }

    if (task.organisation) {
      this.cache.organisation.set(
        task.organisation.id,
        task.organisation as unknown as Organisation,
      )
      if (task.organisation.code) {
        this.organisationCodeToId.set(task.organisation.code, task.organisation.id)
      }
    }

    if (task.project) {
      // Task payloads can carry a partial project shape, so preserve richer cached fields
      // such as mapStyle when refreshing the task editor state.
      const existingProject = this.cache.project.get(task.project.id)
      this.cache.project.set(task.project.id, {
        ...existingProject,
        ...task.project,
      } as Project)
      if (task.project.code) {
        this.projectCodeToId.set(task.project.code, task.project.id)
      }
    }

    if (task.feature) {
      const existingFeature = this.cache.feature.get(task.feature.id)
      this.cache.feature.set(task.feature.id, {
        ...existingFeature,
        ...task.feature,
      } as Feature)
    }

    this.cache.task.set(task.id, task)
  }

  refreshUserProfile = async (_isCascading: boolean = true): Promise<void> => {
    const refreshSerial = this.queries.beginResourceRefresh(FirstClassResource.user)
    const accountRevision = this.account.revision
    const userId = this.user?.id ?? null
    const query = this.queries.getRequiredQueryConfig(FirstClassResource.user)
    const user = await (query.queryFn() as Promise<UserProfile | null>)
    if (
      !this.queries.isCurrentResourceRefresh(FirstClassResource.user, refreshSerial) ||
      accountRevision !== this.account.revision ||
      userId !== (this.user?.id ?? null)
    ) {
      return
    }
    const currentUsername = this.user?.username?.trim() || null
    const requestedUsername = this.panels.state.profile.ctx?.username?.trim() || null
    const isSelfProfile =
      !requestedUsername ||
      (currentUsername !== null && requestedUsername === currentUsername)

    if (isSelfProfile && user) {
      this.account.applyProfile(user, accountRevision)
      this.postUserMutation()
    }

    if (this.panels.state.profile.ctx) {
      this.panels.state.profile.ctx.userData = user
    }
  }

  /**
   * Reconciles property filters and dependent data after an active-layer change.
   *
   * @param isCascading - Whether dependent feature and profile data should refresh.
   * @param shouldAutoSelectSingleLayer - Whether one available layer is activated automatically.
   * @param expectedRoleScope - Optional identity scope that must still be current.
   * @returns A promise that resolves once dependent layer state is up to date.
   */
  postLayerMutation = async (
    isCascading: boolean = true,
    shouldAutoSelectSingleLayer: boolean = true,
    expectedRoleScope?: string,
  ): Promise<void> => {
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    // A page (or search result) cannot establish that only one layer exists.
    // Default selection is resolved from the independent default-layer metadata.
    void shouldAutoSelectSingleLayer
    this.queries.featureRefreshSerial++
    await this.loadPinnedLayers(expectedRoleScope)
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    const currentLayerIds = new Set(this.scope.prisms.layer)
    const existingFilterLayerIds = new Set(
      Object.keys(this.filters.values.feature.properties || {}),
    )

    // Initialise filters for newly added layers
    currentLayerIds.forEach(layerId => {
      if (!existingFilterLayerIds.has(layerId)) {
        // Call initialization functions for the new layer
        this.filters.initialiseCategoricalPropertyFilters(layerId)
        this.filters.initialiseRangePropertyFilter(layerId)
      }
    })

    // Remove filters for layers that are no longer active
    existingFilterLayerIds.forEach(layerId => {
      if (!currentLayerIds.has(layerId)) {
        delete this.filters.values.feature.properties?.[layerId]
      }
    })

    if (isCascading) {
      // Public maps also need to follow active-layer changes.
      await this.queries.refreshFeatures()
      if (this.user?.id) {
        if (this.isAdmin()) {
          await this.queries.refreshTasks()
        }
      }
      // Only refresh if we have a username in the profile context
      if (this.panels.state.profile.ctx?.username) {
        await this.refreshUserProfile()
      }
    }
  }

  postUserMutation = (): void => {
    // Set admin panel state based on user preferences
    if (this.isAdmin() && this.user && 'preferences' in this.user) {
      const isPrimaryPanelCollapsed =
        this.user.preferences?.admin?.isPrimaryPanelCollapsed ?? false
      if (!isPrimaryPanelCollapsed) {
        this.panels.openPanel(Panel.admin, false)
      }
    }
  }

  // ═══════════════════════
  // CODE TO ID MAPPINGS
  // ═══════════════════════

  getOrganisationIdByCode = (code: Code): Id | undefined => {
    return this.organisationCodeToId.get(code)
  }

  getProjectIdByCode = (code: Code): Id | undefined => {
    return this.projectCodeToId.get(code)
  }

  getHubIdByCode = (code: Code): Id | undefined => {
    return this.hubCodeToId.get(code)
  }

  // ═══════════════════════
  // CODE TO ID MAPPINGS
  // ═══════════════════════

  getOrganisationCodeById = (id: Id): Code | undefined => {
    // Reverse lookup: find the code for a given ID
    for (const [code, orgId] of this.organisationCodeToId) {
      if (orgId === id) {
        return code
      }
    }
    return undefined
  }

  getProjectCodeById = (id: Id): Code | undefined => {
    // Reverse lookup: find the code for a given ID
    for (const [code, projectId] of this.projectCodeToId) {
      if (projectId === id) {
        return code
      }
    }
    return undefined
  }

  getHubCodeById = (id: Id): Code | undefined => {
    // Reverse lookup: find the code for a given ID
    for (const [code, hubId] of this.hubCodeToId) {
      if (hubId === id) {
        return code
      }
    }
    return undefined
  }

  // Filtered Helpers
  filteredOrganisations = $derived.by(() => {
    // Explicitly access reactive dependencies so Svelte tracks them
    this.queries.rows.organisation
    this.filters.values.organisation
    return this.filters.getFilteredResource<Organisation>(
      FirstClassResource.organisation,
    )
  })
  filteredProjects = $derived.by(() => {
    this.queries.rows.project
    this.filters.values.project
    return this.filters.getFilteredResource<Project>(FirstClassResource.project)
  })
  filteredLayers = $derived.by(() => {
    this.queries.rows.layer
    this.filters.values.layer
    return this.filters.getFilteredResource<Layer>(FirstClassResource.layer)
  }) as Layer[]
  filteredFeatures = $derived.by(() => {
    this.queries.rows.feature
    this.filters.values.feature
    return this.filters.getFilteredResource<Feature>(FirstClassResource.feature)
  })

  // Helper method to fetch resource by ID with cache miss handling
  private fetchResourceById = async (
    resource: FirstClassResource,
    ref: Id,
  ): Promise<unknown> => {
    if (!ref || ref === 'undefined') return undefined
    const remoteGet = this.remoteMap[resource]?.get as
      | ((
          params: unknown,
        ) => import('#lib/context/featureQuery.types.js').ResourceDetailHandle['query'])
      | undefined
    if (!remoteGet) return undefined
    const scope = this.getRoleScopeQueryKey()
    const input = {
      ref,
      refKey: 'id' as const,
      meta: { isAdminRequest: this.isAdmin(), profile: 'default' as const },
    }
    // Typed hierarchy providers retain profile inference at the standard client boundary.
    const detail =
      resource === FirstClassResource.organisation
        ? this.hierarchy.organisations.detail(input)
        : resource === FirstClassResource.project
          ? this.hierarchy.projects.detail(input)
          : resource === FirstClassResource.layer
            ? this.hierarchy.layers.detail(input)
            : this.resources.detail(
                resource,
                input,
                () =>
                  remoteGet({
                    ...input,
                    meta: { ...input.meta, scope: this.resources.scopeKey },
                  }) as import('$app/server').RemoteQuery<
                    import('#lib/types.js').EntityResponse<unknown>
                  >,
              )
    try {
      const data = await detail.load()
      if (data && scope === this.getRoleScopeQueryKey())
        (this.cache[resource] as Map<string, unknown>).set(ref, data)
      return data
    } finally {
      detail.release()
    }
  }

  getOrganisationById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Organisation | undefined> => {
    // Check cache first
    let org = this.cache.organisation.get(id)
    if (org && !fetchOnCacheMiss) return org

    if (fetchOnCacheMiss) {
      org = await this.fetchResourceById(FirstClassResource.organisation, id)
      if (org) {
        this.cache.organisation.set(id, org)
        return org
      }
    }

    return undefined
  }

  getProjectById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Project | undefined> => {
    // Check cache first
    let project = this.cache.project.get(id)
    if (project && !fetchOnCacheMiss) return project

    if (fetchOnCacheMiss) {
      project = await this.fetchResourceById(FirstClassResource.project, id)
      if (project) {
        this.cache.project.set(id, project)
        return project
      }
    }

    return undefined
  }

  getLayerById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Layer | undefined> => {
    // Check cache first
    let layer = this.cache.layer.get(id)
    if (layer && !fetchOnCacheMiss) return layer

    if (fetchOnCacheMiss) {
      layer = await this.fetchResourceById(FirstClassResource.layer, id)
      if (layer) {
        this.cache.layer.set(id, layer)
        return layer
      }
    }

    return undefined
  }

  getFeatureById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<FeatureFromCollection | Feature | undefined> => {
    // Check cache first
    let feature = this.cache.feature.get(id)
    if (feature && !fetchOnCacheMiss) return feature

    if (fetchOnCacheMiss) {
      feature = await this.fetchResourceById(FirstClassResource.feature, id)
      if (feature) {
        this.cache.feature.set(id, feature)
        this.addFeatureToMap(feature as Feature)
        return feature
      }
    }

    return undefined
  }

  /**
   * Sets a feature in the cache and adds it to the Feature SvelteMap.
   * @remarks This is used to update the cache with the Entity API response,
   * instead of the FeatureFromCollection which is loaded and cached by default.
   * @param feature - The feature to set in the cache
   */
  setFeatureById = (feature: Feature) => {
    this.cache.feature.set(feature.id, feature)
    this.addFeatureToMap(feature)
  }

  getTaskById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Task | undefined> => {
    // Check cache first
    let task = this.cache.task.get(id)
    if (task) return task

    if (fetchOnCacheMiss) {
      task = await this.fetchResourceById(FirstClassResource.task, id)
      if (task) {
        this.cache.task.set(id, task)
        return task
      }
    }

    return undefined
  }

  getHubById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Hub | undefined> => {
    // Check cache first
    let hub = this.cache.hub.get(id)
    if (hub) return hub

    if (fetchOnCacheMiss) {
      hub = await this.fetchResourceById(FirstClassResource.hub, id)
      if (hub) {
        this.cache.hub.set(id, hub)
        return hub
      }
    }

    return undefined
  }

  getPropertyById = async (
    id: Id,
    fetchOnCacheMiss: boolean = true,
  ): Promise<Property | undefined> => {
    // Check cache first
    const property = this.cache.property.get(id)
    if (property) return property

    if (fetchOnCacheMiss) {
      // Properties don't have their own API endpoint, they come with projects
      // For now, return undefined if not cached
      return undefined
    }

    return undefined
  }

  getUserByUsername = async (username: string): Promise<UserProfile | undefined> => {
    const user = this.cache.user.get(username)
    if (user) return user

    const response = await this.fetchResourceById(FirstClassResource.user, username)
    if (response) {
      this.cache.user.set(username, response)
      return response
    }

    return undefined
  }

  // Helper method to get visible classifier properties for a layer
  getClassifierPropertiesForLayer = async (layer: Layer): Promise<Property[]> => {
    if (!layer.properties) return []

    // Get Properties associated with LayerProperties
    const properties = layer.properties
      .filter(lp => lp.isVisible !== false)
      .map(lp => (lp.propertyId ? this.cache.property.get(lp.propertyId) : undefined))

    // Filter classifiers then sort by rank
    return sortProperties(
      properties
        .filter(
          (prop): prop is Property => prop !== undefined && prop.type === 'classifier',
        )
        .map(p => ({ property: p })),
    ).map(item => item.property)
  }

  getResourceById = async (
    resource: FirstClassResource,
    id: Id,
  ): Promise<Resource | undefined> => {
    switch (resource) {
      case FirstClassResource.organisation:
        return await this.getOrganisationById(id)
      case FirstClassResource.project:
        return await this.getProjectById(id)
      case FirstClassResource.layer:
        return await this.getLayerById(id)
      case FirstClassResource.feature:
        return await this.getFeatureById(id)
      case FirstClassResource.task:
        return await this.getTaskById(id)
      case FirstClassResource.hub:
        return await this.getHubById(id)
    }
  }

  getResourceByRef = async (
    resource: FirstClassResource,
    ref: Id | Code,
  ): Promise<Resource | undefined> => {
    switch (resource) {
      case FirstClassResource.organisation: {
        const code = ref as Code
        const cachedId = this.getOrganisationIdByCode(code)
        if (cachedId) {
          const cached = await this.getOrganisationById(cachedId, false)
          if (cached) return cached
        }

        const remote = (await runRemoteQuery(
          getOrganisation({
            ref: String(ref),
            refKey: 'code',
          }),
        )) as { data?: Organisation | null }

        if (!remote?.data) return undefined

        this.cache.organisation.set(remote.data.id, remote.data)
        this.organisationCodeToId.set(remote.data.code, remote.data.id)
        return remote.data
      }
      case FirstClassResource.project:
        return await this.getProjectById(
          this.getProjectIdByCode(ref as Code) ?? (ref as Id),
        )
      case FirstClassResource.layer:
        return await this.getLayerById(ref as Id)
      case FirstClassResource.feature:
        return await this.getFeatureById(ref as Id)
      case FirstClassResource.task:
        return await this.getTaskById(ref as Id)
      case FirstClassResource.hub: {
        const code = ref as Code
        const cachedId = this.getHubIdByCode(code)
        if (cachedId) {
          const cached = await this.getHubById(cachedId, false)
          if (cached) return cached
        }

        const remote = (await runRemoteQuery(
          getHub({
            ref: String(ref),
            refKey: 'code',
          }),
        )) as { data?: Hub | null }
        if (!remote?.data) return undefined

        this.cache.hub.set(remote.data.id, remote.data)
        this.hubCodeToId.set(remote.data.code, remote.data.id)
        return remote.data
      }
    }
  }

  // ================================================
  // HIERARCHY METHODS
  // ================================================

  getHierarchyForTask = async (task: Task): Promise<ResourceContext> => {
    const feature = await this.getFeatureById(task.featureId as Id)
    if (!feature)
      return {
        feature: undefined,
        layer: undefined,
        project: undefined,
        organisation: undefined,
      }
    return await this.getHierarchy(feature)
  }

  // Synchronous version that uses cache only (for UI components)
  getHierarchySync = (
    resource: Feature | FeatureFromCollection | Layer | Project | Organisation | Task,
  ): ResourceContext => {
    // Determine what type of resource we have and build hierarchy accordingly
    let layer: Layer | undefined
    let project: Project | undefined
    let organisation: Organisation | undefined
    const resolvedLayerId =
      'featureId' in resource && resource.feature?.layerId
        ? resource.feature.layerId
        : 'layerId' in resource
          ? resource.layerId
          : undefined

    if (resolvedLayerId) {
      // Feature or Task - get its layer, then project, then organisation from cache
      layer = this.cache.layer.get(resolvedLayerId)
      if (layer) {
        project = this.cache.project.get(layer.projectId)
        if (project) {
          organisation = this.cache.organisation.get(project.organisationId)
        }
      }
    } else if ('projectId' in resource) {
      // Layer - use itself, get its project, then organisation from cache
      layer = resource as Layer
      project = this.cache.project.get(layer.projectId)
      if (project) {
        organisation = this.cache.organisation.get(project.organisationId)
      }
    } else if ('organisationId' in resource) {
      // Project - use itself, get its organisation from cache
      project = resource as Project
      organisation = this.cache.organisation.get(project.organisationId)
    } else {
      // Organisation - use itself
      organisation = resource as Organisation
    }

    if ('organisationId' in resource)
      organisation =
        this.cache.organisation.get(resource.organisationId) ?? organisation
    if ('projectId' in resource)
      project = this.cache.project.get(resource.projectId) ?? project
    if ('ancestors' in resource && resource.ancestors) {
      const ancestors = resource.ancestors as {
        organisation?: Organisation
        project?: Project
      }
      organisation = ancestors.organisation ?? organisation
      project = ancestors.project ?? project
    }

    return {
      feature:
        'featureId' in resource
          ? ((resource.feature as Feature | undefined) ?? undefined)
          : 'layerId' in resource
            ? (resource as Feature)
            : undefined,
      layer,
      project,
      organisation,
    }
  }

  getHierarchy = async (
    resource:
      | FeatureFromCollection
      | Feature
      | Layer
      | Project
      | Organisation
      | Task
      | Image,
  ): Promise<ResourceContext> => {
    const featurePromise =
      'featureId' in resource && resource.featureId
        ? this.getFeatureById(resource.featureId).then(f => f as FeatureFromCollection)
        : 'layerId' in resource
          ? Promise.resolve(resource as FeatureFromCollection)
          : Promise.resolve(undefined)

    const layerPromise =
      'layerId' in resource && resource.layerId
        ? this.getLayerById(resource.layerId)
        : 'projectId' in resource
          ? Promise.resolve(resource as Layer)
          : featurePromise.then(f => (f ? this.getLayerById(f.layerId) : undefined))

    const projectPromise =
      'projectId' in resource && resource.projectId
        ? this.getProjectById(resource.projectId)
        : 'organisationId' in resource
          ? Promise.resolve(resource as Project)
          : layerPromise.then(l => (l ? this.getProjectById(l.projectId) : undefined))

    const organisationPromise =
      'organisationId' in resource && resource.organisationId
        ? this.getOrganisationById(resource.organisationId)
        : !('featureId' in resource) &&
            !('layerId' in resource) &&
            !('projectId' in resource) &&
            !('organisationId' in resource)
          ? Promise.resolve(resource as Organisation)
          : projectPromise.then(p =>
              p ? this.getOrganisationById(p.organisationId) : undefined,
            )

    const [feature, layer, project, organisation] = await Promise.all([
      featurePromise,
      layerPromise,
      projectPromise,
      organisationPromise,
    ])

    return {
      feature,
      layer,
      project,
      organisation,
    }
  }

  // ================================================
  // COUNT METHODS
  // ================================================

  // COUNT METHODS
  getOrganisationCount = (): number => this.queries.rows.organisation.length

  getOrganisationProjectCount = (organisationId: Id): number =>
    this.queries.rows.project.filter(p => p.organisationId === organisationId).length

  getProjectLayerCount = (projectId: Id): number =>
    this.queries.rows.layer.filter(l => l.projectId === projectId).length

  // CONTEXTUAL NAME METHODS
  getContextualOrganisationName = (
    organisation: Organisation,
    hideIfOnly: boolean = true,
    useFallbacks: boolean = true,
  ): string | null => {
    const projectCount = this.getOrganisationProjectCount(organisation.id)
    if (hideIfOnly && projectCount === 1) {
      return null
    }
    const preferences = this.getUserPreferences()
    const i18nPrefs = useFallbacks
      ? preferences
      : { ...preferences, fallbackLocales: [] }
    const shortName =
      getI18n(organisation, 'nameShort', i18nPrefs, '', !useFallbacks) || ''
    const name = getI18n(organisation, 'name', i18nPrefs, '', !useFallbacks) || ''
    return shortName || name || '-'
  }

  getContextualProjectName = (
    project?: Project,
    hideIfOnly: boolean = true,
    useFallbacks: boolean = true,
  ): string | null => {
    if (!project?.organisationId) return null
    const organisationProjectCount = this.getOrganisationProjectCount(
      project.organisationId,
    )
    if (hideIfOnly && organisationProjectCount === 1) {
      return null
    }
    const preferences = this.getUserPreferences()
    const i18nPrefs = useFallbacks
      ? preferences
      : { ...preferences, fallbackLocales: [] }
    const shortName = getI18n(project, 'nameShort', i18nPrefs, '', !useFallbacks) || ''
    const name = getI18n(project, 'name', i18nPrefs, '', !useFallbacks) || ''
    return shortName || name || '-'
  }

  getContextualLayerName = (
    layer: Layer | undefined,
    hideIfOnly: boolean = true,
    useFallbacks: boolean = true,
  ): string | null => {
    if (!layer) {
      return null
    }
    const projectLayerCount = this.getProjectLayerCount(layer.projectId)
    if (hideIfOnly && projectLayerCount === 1) {
      return null
    }
    const preferences = this.getUserPreferences()
    const i18nPrefs = useFallbacks
      ? preferences
      : { ...preferences, fallbackLocales: [] }
    const shortName = getI18n(layer, 'nameShort', i18nPrefs, '', !useFallbacks) || ''
    const name = getI18n(layer, 'name', i18nPrefs, '', !useFallbacks) || ''
    return shortName || name || '-'
  }

  getContextualFeatureName = (feature: FeatureFromCollection): string | null => {
    return getI18n(feature, 'title', this.getUserPreferences())
  }

  // FEATURE COLLECTIONS

  // Features, given the selected Neighbourhoods (or all if none)
  getFeatureIdsForNeighbourhoods = (): Id[] => {
    if (this.divisionCtx.divisionFilterCount === 0) {
      return Array.from(this.features.keys())
    }
    return this.divisionCtx.getFeaturesForFilteredDivisions()
  }

  getFeatureIdsForProperties = (): Id[] => {
    return getFeatureIdsForProperties(this)
  }

  // Features for active layers, given the selected Neighbourhoods and Properties.
  getVisibleFeatureIds = (): Id[] => {
    // Avoid showing stale markers while an active-layer feature refresh is in flight.
    if (this.scope.prisms.layer.length === 0) {
      return []
    }

    const activeLayerIds = new Set(this.scope.prisms.layer)
    return Array.from(
      new Set(this.featuresForNeighbourhoods).intersection(
        new Set(this.featuresForProperties),
      ),
    ).filter(featureId => {
      const layerId = this.features.get(featureId)?.layerId
      return layerId !== undefined && activeLayerIds.has(layerId)
    })
  }

  // Features (for Active Layers) that are on the user's wishlist
  getWishlistedFeatureIds = (): Id[] => {
    return (this.account.collections.state?.wishlisted ?? [])
      .map(wl => wl.featureId)
      .filter((featureId): featureId is Id => Boolean(featureId))
  }

  // Features (for Active Layers) that the user has visited
  getVisitedFeatureIds = (): Id[] => {
    return (this.account.collections.state?.visited ?? [])
      .map(wl => wl.featureId)
      .filter((featureId): featureId is Id => Boolean(featureId))
  }

  // ═══════════════════════
  // REACTIVE FEATURE COLLECTIONS
  // ═══════════════════════

  // Efficiently update features map from current state.resources.feature
  private rebuildFeaturesMap = () => {
    const newFeatures = this.queries.rows.feature
    const newFeatureIds = new Set(newFeatures.map(f => f.id))

    // Remove features that are no longer in the result set
    for (const [id] of this.featuresMap) {
      if (!newFeatureIds.has(id)) {
        this.featuresMap.delete(id)
      }
    }

    // Add new features or update existing ones
    newFeatures.forEach(feature => {
      this.featuresMap.set(feature.id, feature)
    })
  }

  addFeatureToMap = (feature: FeatureFromCollection | Feature) => {
    this.featuresMap.set(feature.id, feature)
  }

  // Public getter for features map
  get features(): SvelteMap<Id, FeatureFromCollection | Feature> {
    return this.featuresMap
  }

  // FEATURE COLLECTIONS -- FeatureIds

  // FeatureIds for Selected Neighbourhoods
  featuresForNeighbourhoods: Id[] = $derived(
    (this.divisionCtx.state.contains.feature.neighbourhood &&
      this.divisionCtx.state.filters.feature.neighbourhood.include &&
      this.getFeatureIdsForNeighbourhoods()) ||
      [],
  ) as Id[]

  // FeatureIds for Selected Properties
  featuresForProperties: Id[] = $derived(
    (this.featuresMap.size && this.getFeatureIdsForProperties()) || [],
  ) as Id[]

  // Intersection of Neighbourhoods and Properties featureIds
  featuresVisible: Id[] = $derived(this.getVisibleFeatureIds())
  // FeatureIds for Wishlisted Features
  featuresWishlisted: Id[] = $derived(this.getWishlistedFeatureIds()) as Id[]
  // FeatureIds for Visited Features
  featuresVisited: Id[] = $derived(this.getVisitedFeatureIds()) as Id[]

  // FEATURE COLLECTIONS -- Utils

  getFeaturesByIds = (ids: Id[]): (FeatureFromCollection | Feature)[] =>
    ids
      .map(id => this.cache.feature.get(id) ?? this.features.get(id))
      .filter(f => f !== undefined)

  // FEATURE COLLECTIONS -- Convenience Methods

  /** Returns the current resource view's visible rows. @returns Visible feature records. */
  getVisibleFeatures = (): (FeatureFromCollection | Feature)[] =>
    this.getFeaturesByIds(this.featuresVisible)

  getWishlistedFeatures = (): (FeatureFromCollection | Feature)[] => {
    return this.getFeaturesByIds(this.featuresWishlisted)
  }

  getVisitedFeatures = (): (FeatureFromCollection | Feature)[] => {
    return this.getFeaturesByIds(this.featuresVisited)
  }

  /** Notifies the owning surface after user-feature membership changes. @returns Nothing. */
  onUserFeaturesChanged: () => void = () => {}

  /** Notifies the owning surface when identity-bound projections must be cleared. @returns Nothing. */
  onAccountScopeChanged: () => void = () => {}

  // USER DATA
  /** Reconciles this view after the root account changes. @returns Nothing. */
  syncAccount = (): void => {
    if (this.appliedAccountRevision === this.account.revision) {
      this.postUserMutation()
      return
    }
    this.appliedAccountRevision = this.account.revision
    this.draft.reset()
    this.draft.resetMode()

    // Identity and role changes alter query scope and must supersede prior responses.
    this.queries.featureRefreshSerial += 1
    this.queries.invalidateResourceRefreshes()

    // Identity-bound records must never survive guest/account or role transitions.
    this.cache.user.clear()
    this.onAccountScopeChanged()
    if (this.panels.state.profile.ctx) {
      this.panels.state.profile.ctx.userData = null
    }

    // Root invalidates shared retention; each surface clears only its own projections.
    if (!this.cacheCtx.managedByRoot) this.cacheCtx.clear()
    else {
      for (const store of Object.values(this.cache)) store.clear()
      for (const list of Object.values(this.resources.lists)) list.clear()
      for (const query of Object.values(this.resources.featureQueries)) query.clear()
    }
    this.scope.selectionLayers = []
    this.featuresMap.clear()
    this.queries.featureLoadState = 'idle'
    for (const resource of [
      'organisation',
      'project',
      'layer',
      'feature',
      'task',
      'hub',
    ] as const)
      this.queries.rows[resource] = []
    this.postUserMutation()
  }

  /**
   * Applies saved self-profile fields to the shared account presentation data.
   *
   * @param profile - Persisted self-profile fields returned by a remote mutation.
   * @param revision Account revision captured before the save.
   * @returns Whether the update still belongs to the current account.
   */
  applyUserProfile = (
    profile: Partial<CurrentUser> | UserProfile,
    revision: number = this.account.revision,
  ): boolean => {
    if (!this.account.applyProfile(profile, revision)) return false
    this.postUserMutation()
    return true
  }

  /** Reads saved preferences with optional defaults. @param withDefaults Whether to fill absent values. @returns View preferences. */
  getUserPreferences = (withDefaults: boolean = true): UserPreferences => {
    const preferences = this.user?.preferences
    if (!withDefaults && preferences) return preferences as UserPreferences
    // If no user or preference payload exists, provide the same locale-aware defaults.
    return {
      fallbackLocales:
        (preferences?.fallbackLocales as Locale[] | null) ??
        (getFallbackLocales(getLocale()) as Locale[]),
      allowMachineTranslation: preferences?.allowMachineTranslation ?? false,
      preferFallbackInCurrentLocale:
        preferences?.preferFallbackInCurrentLocale ?? false,
      isTranslateButtonVisible: preferences?.isTranslateButtonVisible ?? true,
      admin: {
        isAdminMapCollapsed: preferences?.admin?.isAdminMapCollapsed ?? false,
        isPrimaryPanelCollapsed: preferences?.admin?.isPrimaryPanelCollapsed ?? false,
        isPrimaryPanelAutoHide: preferences?.admin?.isPrimaryPanelAutoHide ?? false,
      },
    }
  }

  /** Updates shared preferences without altering the session. @param preferences Saved preference fields. @returns Nothing. */
  updateUserPreferences = (preferences: UserPreferences): void => {
    this.account.applyProfile({
      preferences: {
        ...this.getUserPreferences(),
        ...preferences,
        admin: {
          ...this.getUserPreferences().admin,
          ...preferences.admin,
        },
      },
    })
  }

  setUserAttribution = async (
    attribution: string,
    onSuccess?: (attribution: string) => void,
    onError?: (error: unknown) => void,
  ) => {
    const userId = this.account.session?.id
    if (!userId) return
    this.account.applyProfile({ attribution })
    await debouncedUpdateUserAttribution(userId, attribution, onSuccess, onError)
  }

  /**
   * Commits saved layer defaults to local user and map state.
   *
   * @param layers - Persisted default-visible layer rows returned by the remote mutation.
   * @param hub - The hub identity used for the mutation, including code-only startup state.
   * @param revision - Account lifetime that initiated the save.
   * @returns Nothing after replacing the current hub's saved layer defaults.
   */
  applyUserLayerDefaults = (
    layers: UserLayer[],
    hub: { id?: Id | null; code?: string | null },
    revision: number = this.account.revision,
  ): void => {
    if (!this.user || revision !== this.account.revision) return

    const resolvedHubId = layers[0]?.hubId ?? hub.id ?? null
    const currentHubLayerIds = new Set(this.queries.rows.layer.map(layer => layer.id))

    // Replace only rows associated with this hub, including code-only bootstrap state.
    const retainedLayers = this.user.userLayers.filter(layer => {
      if (resolvedHubId && layer.hubId === resolvedHubId) return false
      if (hub.code && layer.hubCode === hub.code) return false
      return !currentHubLayerIds.has(layer.layerId)
    })

    if (resolvedHubId && hub.code) {
      this.hubCodeToId.set(hub.code, resolvedHubId)
    }
    if (resolvedHubId && this.hub && !this.hub.id) {
      this.hub = { ...this.hub, id: resolvedHubId }
    }

    this.account.applyProfile({ userLayers: [...retainedLayers, ...layers] })
    this.scope.setLayers(layers.map(layer => layer.layerId))
  }

  /**
   * Clears all images arrays from the feature cache
   * This forces fresh API calls for image data
   */
  clearFeatureCacheImages = (): void => {
    for (const [_featureId, feature] of this.cache.feature) {
      if (feature && typeof feature === 'object' && 'images' in feature) {
        // Set images to undefined to force fresh API fetch
        feature.images = undefined
      }
    }
  }

  /** Releases this surface without invalidating compatible native details. @returns Nothing. */
  dispose(): void {
    if (this.cacheCtx.featureCollectionScope === this.resources.scopeKey) {
      this.cacheCtx.featureCollection = undefined
      this.cacheCtx.featureCollectionScope = undefined
    }
    this.releaseMembership()
    this.interactions.dispose()
    this.panels.dispose()
    this.disposed = true
    this.queries.featureRefreshSerial++
    this.queries.invalidateResourceRefreshes()
    this.resources.release()
    this.cacheCtx.releaseEntityStore(this.cache)
    this.isInitialised = false
  }

  // Clear all cache maps (for actual data reset scenarios)
  clearAllCaches = (): void => {
    this.cacheCtx.clear()
    // Invalidate in-flight feature reads before removing their committed state.
    this.queries.featureRefreshSerial += 1
    this.queries.invalidateResourceRefreshes()
    this.cache.organisation.clear()
    this.cache.project.clear()
    this.cache.layer.clear()
    this.cache.feature.clear()
    this.cache.task.clear()
    this.cache.hub.clear()
    this.cache.property.clear()
    this.cache.image.clear()
    this.cache.user.clear()
    this.featuresMap.clear()
    this.organisationCodeToId.clear()
    this.projectCodeToId.clear()
    this.hubCodeToId.clear()
  }

  // ═══════════════════════
  //
  // ═══════════════════════
  setHub = (hub: HubOptsExtended) => {
    if (hub.code && hub.id) {
      this.hubCodeToId.set(hub.code, hub.id)
    }

    const currentHub = this.hub
    if (!currentHub) {
      this.hub = hub
      this.scope.applyInitialLayerPrisms()
      return
    }

    const isSameHub =
      (hub.id && currentHub.id === hub.id) ||
      (!hub.id && currentHub.code && currentHub.code === hub.code)

    if (!isSameHub) {
      this.hub = hub
      this.scope.applyInitialLayerPrisms()
      return
    }

    if (currentHub && !currentHub.id && hub.id) {
      this.hub = {
        ...currentHub,
        ...hub,
      }
      this.scope.applyInitialLayerPrisms()
    }
  }

  resetHub = () => {
    this.hub = null
  }

  // ═══════════════════════
  // CACHE UPDATE UTILITIES
  // ═══════════════════════

  // Generic map sync - only add missing items and remove stale ones (no overwrites)
  private syncMap = <K, V, T>(
    map: Map<K, V>,
    newItems: T[],
    getKey: (item: T) => K,
    getValue?: (item: T) => V,
  ): void => {
    const newKeys = new Set(newItems.map(getKey))

    // Remove entries that are no longer in the result set
    for (const [key] of map) {
      if (!newKeys.has(key)) {
        map.delete(key)
      }
    }

    // Only add entries that aren't already present
    newItems.forEach(item => {
      const key = getKey(item)
      if (!map.has(key)) {
        map.set(key, getValue ? getValue(item) : (item as unknown as V))
      }
    })
  }

  private syncCodeToIdMap = <T extends { id: Id; code: Code }>(
    codeMap: Map<Code, Id>,
    newItems: T[],
  ): void => {
    this.syncMap(
      codeMap,
      newItems,
      item => item.code,
      item => item.id,
    )
  }

  addToCache = <K extends FirstClassResource>(
    resource: K,
    id: Id,
    item: Cache[K] extends Map<Id, infer TValue> ? TValue : never,
  ): void => {
    const cache = this.cache[resource] as Map<
      Id,
      Cache[K] extends Map<Id, infer TValue> ? TValue : never
    >
    cache.set(id, item)
  }

  getResourceByIdSync = (
    resource: FirstClassResource,
    id: Id,
  ): Resource | undefined => {
    switch (resource) {
      case FirstClassResource.organisation:
        return this.cache.organisation.get(id)
      case FirstClassResource.project:
        return this.cache.project.get(id)
      case FirstClassResource.layer:
        return this.cache.layer.get(id)
      case FirstClassResource.feature:
        return this.cache.feature.get(id) ?? this.features.get(id)
      case FirstClassResource.task:
        return this.cache.task.get(id)
      case FirstClassResource.hub:
        return this.cache.hub.get(id)
    }
  }

  getResourceByRefSync = (
    resource: FirstClassResource,
    ref: Id | Code,
  ): Resource | undefined => {
    switch (resource) {
      case FirstClassResource.organisation:
        return this.cache.organisation.get(
          this.getOrganisationIdByCode(ref as Code) ?? (ref as Id),
        )
      case FirstClassResource.project:
        return this.cache.project.get(
          this.getProjectIdByCode(ref as Code) ?? (ref as Id),
        )
      case FirstClassResource.layer:
        return this.cache.layer.get(ref as Id)
      case FirstClassResource.feature:
        return this.cache.feature.get(ref as Id) ?? this.features.get(ref as Id)
      case FirstClassResource.task:
        return this.cache.task.get(ref as Id)
      case FirstClassResource.hub:
        return this.cache.hub.get(this.getHubIdByCode(ref as Code) ?? (ref as Id))
    }
  }
}

// Keep providers and consumers on the same key across development module reloads.
const SURFACE_CONTEXT_KEY = Symbol.for('hype.context.resource-view')

/** Provides the current route's resource view. @param context Surface-owned instance. @returns The supplied instance. */
export function setSurfaceCtx<T extends ResourceViewCtx>(context: T): T {
  setSurfaceLayoutCtx(context.layout)
  return setContext(SURFACE_CONTEXT_KEY, context)
}

/** Resolves the current surface without a process-global fallback. @returns The current resource view. */
export function getSurfaceCtx(): ResourceViewCtx {
  const context = getContext<ResourceViewCtx | undefined>(SURFACE_CONTEXT_KEY)
  if (!context)
    throw new Error('Resource view context is missing from this route layout')
  return context
}
