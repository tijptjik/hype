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
  ResourcePageInput,
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
import { getInitialHubLayerDefaultIds } from '#lib/client/services/layerDefaults.js'
// AUTH
import {
  getFeatureIdsForProperties,
  sortProperties,
} from '#lib/client/services/property.js'
import { matchesResourceTextQuery } from '#lib/client/services/filters.js'
import { primeFeatureStatsCache } from '#lib/client/services/stats.js'
import {
  refreshRemoteQuery as runRemoteQuery,
  toSafeListResponse,
} from '#lib/remote/index.js'
// DEBUG
import { logMarkerBootstrap } from '#lib/debug/markerBootstrap.js'
// CONTEXT
// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// MARKERS
// ENUMS
import { FirstClassResource, type HierarchicalResource, Panel } from '#lib/enums.js'
// GUARDS
import { isTask } from '#lib/utils/resourceGuards.js'
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
import type {
  FilterState,
  FilteredResources,
  ResourceSortState,
} from '#lib/client/services/filters.types.js'
import type { FilterTriState } from '#lib/client/services/viewFilters.types.js'
import type { FeatureQueryChannel } from '#lib/context/featureQuery.types.js'
import type {
  FeatureQueryFilters,
  FeatureQueryInput,
  FeatureSpatialQuery,
} from '#lib/api/services/featureQuery.types.js'
import type { RangeFilterValue } from '#lib/client/services/propertyFilters.types.js'
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
import type { HierarchicalResourceType, Prisms, EntityResponse } from '#lib/types.js'
import type { ViewFilters } from '#lib/client/services/viewFilters.types.js'
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

type ResourceTypeWithChildren = Exclude<HierarchicalResourceType, 'feature' | 'task'>

type ViewSortingState = Record<FirstClassResource, ResourceSortState>

/* ----------------- */
// CTX STATE :: RESOURCE VIEW
/* -------- */

type ResourceViewState = {
  filters: FilterState
  prisms: Prisms
  resources: FilteredResources
  userFeatures: {
    wishlisted: UserFeature[]
    visited: UserFeature[]
  }
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
  viewFilters: ViewFilters
  viewSorting: ViewSortingState
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

/** Explicit recent list edits distinguish an optimistic removal from unknown membership. */
type FeatureMembershipOverride = {
  row: import('#lib/db/zod/schema/user.types.js').UserFeature | null
  updatedAt: number
}

export class ResourceViewCtx {
  // Remote queries own transport caching and refreshes.
  // Division context
  divisionCtx!: DivisionCtx
  // Surface-owned panel state and geometry
  readonly panels = new PanelController({
    loadProfile: () => this.refreshUserProfile(false),
    invalidateProfile: () => {
      this.beginResourceRefresh(FirstClassResource.user)
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
  isLoadingResources = $state(false)
  // Whether the app is in mobile mode
  isMobile: boolean = $state(false)

  // Query map to store different query functions (can be overridden by AdminCtx)
  queryMap = new Map<
    FirstClassResource | 'userFeatures',
    {
      queryKey: () => unknown[]
      queryFn: () => Promise<unknown>
    }
  >()

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

  // Cache for all resources
  selectionLayers: Layer[] = $state.raw([])
  featureLoadState = $state<'idle' | 'loading' | 'partial' | 'complete' | 'error'>(
    'idle',
  )
  readonly cacheCtx: CacheCtx
  readonly resources: ResourceClient
  readonly hierarchy: ReturnType<typeof createHierarchyClient>
  cache: Cache
  featureViewport: FeatureSpatialQuery | undefined = $state.raw()
  /** Optional membership/flag filters compose with viewport, properties and neighbourhoods. */
  featureQueryFilters: FeatureQueryFilters = $state({})
  private featureMembershipOverrides = new SvelteMap<Id, FeatureMembershipOverride>()

  hub: HubOptsExtended | null = $state(null)

  // Features map for current state (rebuilt when state.resources.feature changes)
  private featuresMap = new SvelteMap<Id, FeatureFromCollection | Feature>()
  private featureRefreshSerial = 0
  private resourceRefreshSerials = new Map<string, number>()
  private organisationCodeToId = new Map<Code, Id>()
  private projectCodeToId = new Map<Code, Id>()
  private hubCodeToId = new Map<Code, Id>()

  private defaultSortState: ResourceSortState = {
    sortBy: 'modifiedAt',
    sortOrder: 'desc',
  }

  private sortableResources: FirstClassResource[] = [
    FirstClassResource.organisation,
    FirstClassResource.project,
    FirstClassResource.layer,
    FirstClassResource.feature,
    FirstClassResource.task,
    FirstClassResource.hub,
    FirstClassResource.property,
    FirstClassResource.user,
  ]

  private defaultViewSorting = (): Record<FirstClassResource, ResourceSortState> =>
    Object.fromEntries(
      this.sortableResources.map(resource => [resource, { ...this.defaultSortState }]),
    ) as Record<FirstClassResource, ResourceSortState>

  state: ResourceViewState = $state({
    // ═══════════════════════
    // 3-TIER FILTER SYSTEM
    // ═══════════════════════
    // TIER 1: PRISMS -- Which organisations, projects, and layers are pre-filtered when fetching features from the database
    // Applied at the server level to constrain the result set of first-class resources available
    prisms: { organisation: [], project: [], layer: [] },
    // TIER 2: APP FILTERS -- Which neighbourhoods and properties being filtered for when showing features on the map
    // Sent to feature queries for every view, with cached matches providing immediate previews.
    filters: {
      organisation: { text: '', properties: {} },
      project: { text: '', properties: {} },
      layer: { text: '', properties: {} },
      feature: { text: '', properties: {} },
      task: { text: '', properties: {} },
      hub: { text: '', properties: {} },
      property: { text: '', properties: {} },
    },
    // TIER 3: VIEW FILTERS -- Handled by individual admin views (e.g., AppCtx.state.viewFilters)
    // Only affect the current route/view they are applied on, not the underlying data or map view
    // Resources -- The resources fetched from the database (post prism-filtering, pre filters-filtering)
    resources: {
      organisation: [],
      project: [],
      layer: [],
      feature: [],
      task: [],
      hub: [],
    },
    // User Features -- The user's wishlist and visited features
    userFeatures: {
      wishlisted: [],
      visited: [],
    },
    // User Location -- The user's location
    userLocation: null,
    // ENHANCEMENT: Implement distancesFromUser
    // Distances from user -- The distances from the user to the features
    distancesFromUser: {},
    // TIER 3: VIEW FILTERS - Only affect current route/view
    viewFilters: {
      organisation: {
        // Status related
        isPublished: null,
        isArchived: false,

        // Image related
        hasImage: null,

        // Authorship related
        hasName: null,
        hasContextualName: null,
        hasDescription: null,

        // Translation related
        translationLocales: {
          en: false, // Default: English not selected
          zhHant: true,
          zhHans: true,
        },
        isNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isContextualNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isDescriptionTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
      },
      project: {
        // Status related
        isPublished: null,
        isArchived: false,

        // Image related
        hasImage: null,

        // Authorship related
        hasName: null,
        hasContextualName: null,
        hasDescription: null,
        isAllRightsReserved: null,
        isPublicDomain: null,
        hasLicenseBy: null,
        hasLicenseSa: null,
        hasLicenseNc: null,
        hasLicenseNd: null,

        // Translation related
        translationLocales: {
          en: false,
          zhHant: true,
          zhHans: true,
        },
        isNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isContextualNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isDescriptionTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
      },
      layer: {
        // Status related
        isPublished: null,
        isArchived: false,

        // Authorship related
        hasName: null,
        hasContextualName: null,
        hasDescription: null,
        isAllRightsReserved: null,
        isPublicDomain: null,
        hasLicenseBy: null,
        hasLicenseSa: null,
        hasLicenseNc: null,
        hasLicenseNd: null,

        // Translation related
        translationLocales: {
          en: false,
          zhHant: true,
          zhHans: true,
        },
        isNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isContextualNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isDescriptionTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
      },
      feature: {
        // Status related
        isPublished: null,
        isPendingReview: null,
        isArchived: false,
        isIntangible: null,
        isVisitable: null,

        // Image related
        hasImage: null,
        isOneImagePublished: null,
        isAllImagePublished: null,

        // Authorship related
        hasTitle: null,
        hasDescription: null,
        hasDisplayAddress: null,
        isAllRightsReserved: null,
        isPublicDomain: null,
        hasLicenseBy: null,
        hasLicenseSa: null,
        hasLicenseNc: null,
        hasLicenseNd: null,

        // Translation related
        translationLocales: {
          en: false, // Default: English not selected
          zhHant: true,
          zhHans: true,
        },
        isTitleTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isDescriptionTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isSpecifierTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isAddressTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        // Property related
        properties: {} as Record<Id, FilterTriState>,
      },
      task: {
        // Status related
        isReviewed: false,
        reviewOutcome: null,
        reviewAction: null,
        type: null,
      },
      hub: {
        // Status related
        isArchived: false,

        // Image related
        hasImage: null,

        // Authorship related
        hasName: null,
        hasContextualName: null,
        hasDescription: null,

        // Translation related
        translationLocales: {
          en: false,
          zhHant: true,
          zhHans: true,
        },
        isNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isContextualNameTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
        isDescriptionTranslated: {
          en: null,
          zhHant: null,
          zhHans: null,
        },
      },
    },
    viewSorting: this.defaultViewSorting(),
  })

  readonly draft = new FeatureDraft()
  readonly interactions: SurfaceInteractions

  // ═══════════════════════
  // QUERY KEYS
  // ═══════════════════════

  private disposed = false

  protected getRoleScopeQueryKey = (): string => {
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
  protected isExpectedRoleScopeCurrent = (expectedRoleScope?: string): boolean =>
    !expectedRoleScope || expectedRoleScope === this.getRoleScopeQueryKey()

  /**
   * Starts a resource refresh and returns its serial for stale-response checks.
   *
   * @param resource - Resource whose previous refreshes must be superseded.
   * @returns The serial assigned to this refresh.
   */
  private beginResourceRefresh = (resource: string): number => {
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
  private isCurrentResourceRefresh = (resource: string, serial: number): boolean =>
    this.resourceRefreshSerials.get(resource) === serial

  /**
   * Invalidates all tracked list refreshes before identity or cache transitions.
   *
   * @returns Nothing.
   */
  private invalidateResourceRefreshes = (): void => {
    for (const [resource, serial] of this.resourceRefreshSerials) {
      this.resourceRefreshSerials.set(resource, serial + 1)
    }
  }

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

  private getRequiredQueryConfig = (
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

  organisationsQueryKey = () => [
    FirstClassResource.organisation,
    this.getRoleScopeQueryKey(),
    this.isAdmin(),
    this.state.viewSorting.organisation.sortBy,
    this.state.viewSorting.organisation.sortOrder,
  ]
  projectsQueryKey = () => [
    FirstClassResource.project,
    this.getRoleScopeQueryKey(),
    this.state.prisms.organisation,
    this.isAdmin(),
    this.state.viewSorting.project.sortBy,
    this.state.viewSorting.project.sortOrder,
  ]
  layersQueryKey = () => [
    FirstClassResource.layer,
    this.getRoleScopeQueryKey(),
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.isAdmin(),
    this.state.viewSorting.layer.sortBy,
    this.state.viewSorting.layer.sortOrder,
  ]
  featuresQueryKey = () => [
    FirstClassResource.feature,
    this.getRoleScopeQueryKey(),
    this.state.prisms.organisation,
    this.state.prisms.project,
    this.state.prisms.layer,
    this.isAdmin(),
    this.state.viewSorting.feature.sortBy,
    this.state.viewSorting.feature.sortOrder,
  ]
  propertiesQueryKey = () => [
    'property',
    this.getRoleScopeQueryKey(),
    this.state.prisms.organisation,
    this.state.prisms.project,
  ]
  userFeaturesQueryKey = () => ['userFeatures', this.user?.id ?? 'no-user']
  userQueryKey = () => [
    FirstClassResource.user,
    this.getRoleScopeQueryKey(),
    this.panels.state.profile.ctx?.username || this.user?.id,
    ...(this.panels.state.profile.ctx?.observePrisms
      ? [
          this.state.prisms.organisation,
          this.state.prisms.project,
          this.state.prisms.layer,
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
    this.hierarchy = createHierarchyClient(this.resources)
    this.divisionCtx = divisionCtx
    this.responsiveCtx = responsiveCtx
    this.layout = new SurfaceLayout(responsiveCtx, this.panels)
    this.syncAccount()
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
    this.queryMap.clear()

    this.queryMap.set(FirstClassResource.organisation, {
      queryKey: this.organisationsQueryKey,
      queryFn: () => this.organisationsQueryFn(),
    })

    this.queryMap.set(FirstClassResource.project, {
      queryKey: this.projectsQueryKey,
      queryFn: () => this.projectsQueryFn(),
    })

    this.queryMap.set(FirstClassResource.layer, {
      queryKey: this.layersQueryKey,
      queryFn: () => this.layersQueryFn(),
    })

    this.queryMap.set(FirstClassResource.feature, {
      queryKey: this.featuresQueryKey,
      queryFn: () => this.featuresQueryFn(),
    })

    // ADMIN ONLY
    this.queryMap.set(FirstClassResource.task, {
      queryKey: () => [FirstClassResource.task],
      queryFn: () => Promise.resolve([]),
    })

    // ADMIN ONLY
    this.queryMap.set(FirstClassResource.hub, {
      queryKey: () => [FirstClassResource.hub],
      queryFn: () => Promise.resolve([]),
    })

    // APP ONLY
    this.queryMap.set('userFeatures', {
      queryKey: this.userFeaturesQueryKey,
      queryFn: () => this.userFeaturesQueryFn(),
    })

    this.queryMap.set(FirstClassResource.user, {
      queryKey: this.userQueryKey,
      queryFn: () => this.userQueryFn(),
    })

    // PROPERTIES
    this.queryMap.set(FirstClassResource.property, {
      queryKey: this.propertiesQueryKey,
      queryFn: () => this.propertiesQueryFn(),
    })
  }

  /** Initialises shared view bookkeeping without loading another surface's resources. */
  init = async (_userId: Id | null, _loadFeatures: boolean = false): Promise<void> => {
    this.initStatsCache()
    this.isInitialised = true
  }

  private getCurrentHubId = (): Id | null =>
    this.hub?.id ??
    (this.hub?.code ? (this.getHubIdByCode(this.hub.code) ?? null) : null)

  private getUserLayersForCurrentHub = (): UserLayer[] => {
    const hubId = this.getCurrentHubId()
    const hubCode = this.hub?.code ?? null
    if ((!hubId && !hubCode) || !this.user) {
      return []
    }
    const currentHubLayerIds = new Set(
      this.state.resources.layer.map(layer => layer.id),
    )
    const hubUserLayers = this.user.userLayers.filter(layer => {
      if (hubId && layer.hubId === hubId) return true
      if (hubCode && layer.hubCode === hubCode) return true

      // Fallback to the loaded hub-scoped layer list when persisted preferences only
      // carry one hub identifier and the app has only resolved the other on bootstrap.
      return currentHubLayerIds.has(layer.layerId)
    })
    return hubUserLayers
  }

  // Hydrate persisted layer defaults once during app bootstrap so hub prism setup
  // can resolve the initial active layers without coupling to profile panel refreshes.
  protected hydrateCurrentUserLayers = async (): Promise<void> => {
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

  private getHubDefaultLayerIds = (): Id[] => {
    return getInitialHubLayerDefaultIds(
      this.hub,
      this.selectionLayers,
      this.selectionLayers.flatMap(layer => {
        const ancestors = (layer as unknown as { ancestors?: { project?: Project } })
          .ancestors
        return ancestors?.project ? [ancestors.project] : []
      }),
    )
  }

  protected applyInitialLayerPrisms = (expectedRoleScope?: string): void => {
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    const hubId = this.getCurrentHubId()
    const hubCode = this.hub?.code ?? null
    if (!hubId && !hubCode) {
      return
    }

    const userLayerIds = this.getUserLayersForCurrentHub().map(layer => layer.layerId)
    const defaultLayerIds = this.getHubDefaultLayerIds()
    const nextLayerIds = userLayerIds.length > 0 ? userLayerIds : defaultLayerIds
    const dedupedLayerIds = [...new Set(nextLayerIds)]
    const currentLayerIds = this.state.prisms.layer
    const isUnchanged =
      currentLayerIds.length === dedupedLayerIds.length &&
      currentLayerIds.every((layerId, index) => layerId === dedupedLayerIds[index])

    if (isUnchanged) return

    this.state.prisms.layer = dedupedLayerIds
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
      getDefaultLayerResources({ meta: this.panelResourceInput('layer').meta }),
    )
    if (!this.isExpectedRoleScopeCurrent(expected)) return
    this.selectionLayers = rows as unknown as Layer[]
    this.retainPanelRows('layer', rows)
  }

  /** Resolves selected layers outside page one through the shared native batch query. */
  loadPinnedLayers = async (scope?: string): Promise<void> => {
    const expected = scope ?? this.getRoleScopeQueryKey()
    const meta = this.panelResourceInput('layer').meta
    const selection = JSON.stringify(this.state.prisms.layer)
    const rows = await Promise.all(
      this.state.prisms.layer.map(id =>
        getPinnedResource({ type: 'layer', id, profile: 'default', meta }),
      ),
    )
    if (
      !this.isExpectedRoleScopeCurrent(expected) ||
      selection !== JSON.stringify(this.state.prisms.layer)
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
      selection !== JSON.stringify(this.state.prisms.layer)
    )
      return
    this.retainPanelRows(
      'project',
      projects.filter((row): row is PanelResource => row !== null),
    )
    const ids = new Set(available.map(row => row.id))
    this.state.prisms.layer = this.state.prisms.layer.filter(id => ids.has(id))
  }

  /** Builds the complete identity of a compact panel view. */
  panelResourceInput = (type: PanelResourceType, q = ''): ResourcePageInput => ({
    type,
    conditions: { isArchived: false, isPublished: this.isAdmin() ? null : true },
    q: q.trim(),
    prisms: {
      organisation: [...this.state.prisms.organisation],
      project: [...this.state.prisms.project],
    },
    meta: {
      isAdminRequest: this.isAdmin(),
      scope: this.resources.scopeKey,
    },
  })

  /** Loads a first compact page independently of other hierarchy collections. */
  loadPanelResource = async (type: PanelResourceType): Promise<PanelResource[]> => {
    const list = this.resources.lists[type]
    await list.load(this.panelResourceInput(type, list.search), true)
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
   * Builds the complete feature query for a view, optionally constrained to visible cells.
   * @param overrides - Search, membership, spatial or page options for an independent view.
   * @returns Serializable arguments shared by server reads and immediate cache previews.
   */
  featureQueryInput = (
    overrides: Partial<FeatureQueryInput> = {},
  ): FeatureQueryInput => ({
    prisms: {
      organisation: [...this.state.prisms.organisation],
      project: [...this.state.prisms.project],
      layer: [...this.state.prisms.layer],
    },
    limit: 100,
    ...overrides,
    q: (overrides.q ?? this.state.filters.feature.text ?? '').trim(),
    filters: {
      ...this.featureQueryFilters,
      properties: JSON.parse(
        JSON.stringify(this.state.filters.feature.properties ?? {}),
      ),
      divisionIds: [...this.divisionCtx.state.filters.feature.neighbourhood.include],
      excludeDivisionIds: [
        ...this.divisionCtx.state.filters.feature.neighbourhood.exclude,
      ],
      ...overrides.filters,
    },
    meta: {
      isAdminRequest: false,
      scope: this.resources.scopeKey,
    },
  })

  /**
   * Gives cached previews the same known hierarchy and user membership facts as the UI.
   * @returns Nothing after configuring each independent feature collection.
   */
  private configureFeatureQueries = (): void => {
    for (const query of Object.values(this.resources.featureQueries)) {
      query.setMatchContext({
        layerProjectId: id => this.cache.layer.get(id)?.projectId,
        projectOrganisationId: id => this.cache.project.get(id)?.organisationId,
        listMembership: (row, list) => {
          if (list.userId && list.userId !== this.user?.id) return undefined
          return this.getFeatureListMembership(row.id, list.listId)
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
    const query = this.resources.featureQueries[channel]
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
      input.meta.scope !== this.featureQueryInput().meta.scope ||
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
    const query = this.resources.featureQueries[channel]
    for (const row of query.rows) this.cache.feature.set(row.id, row)
    while (this.cache.feature.size > 2_000) {
      const oldest = this.cache.feature.keys().next().value
      if (!oldest) break
      const row = this.cache.feature.get(oldest)
      if (!row) break
      this.cache.feature.delete(oldest)
    }
    const known = new Map<string, UserFeature>(
      [...this.state.userFeatures.wishlisted, ...this.state.userFeatures.visited].map(
        row => [row.featureId, row],
      ),
    )
    for (const page of query.pages) {
      if (!page.current?.userFeatures) continue
      for (const row of page.current.data) {
        if (!this.hasRecentFeatureMembershipOverride(row.id)) known.delete(row.id)
      }
      for (const row of page.current.userFeatures) {
        if (!this.hasRecentFeatureMembershipOverride(row.featureId))
          known.set(row.featureId, row)
      }
    }
    this.state.userFeatures = {
      wishlisted: [...known.values()].filter(row => row.isWishlisted),
      visited: [...known.values()].filter(row => row.isVisited),
    }
  }

  /**
   * Appends one server page to an active feature view.
   * @param channel - Independent list/search collection to extend.
   * @returns Completion after new IDs and membership state are retained.
   */
  loadMoreFeatureQuery = async (channel: FeatureQueryChannel): Promise<void> => {
    const scope = this.featureQueryInput().meta.scope
    await this.resources.featureQueries[channel].next()
    if (scope === this.featureQueryInput().meta.scope)
      this.retainFeatureQueryRows(channel)
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
          prisms: this.state.prisms,
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
          ? { prisms: this.state.prisms }
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
    await this.refresh(resource)
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
    const queryKey = this.queryMap.get(resource)?.queryKey()

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
        if (resource in this.state.resources) {
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
   * Resolves the comparable value used to sort a resource in memory.
   *
   * @param resource - Resource type being sorted.
   * @param entity - Resource instance to read from.
   * @param sortBy - Active sort field.
   * @param userPreferences - I18n preferences used when sorting translated fields.
   * @returns Normalized string or numeric value suitable for comparison.
   * @remarks Translated text fields are resolved using the current user locale preferences so
   * client-side sorting matches the strings users actually see in the UI.
   */
  private getResourceSortValue(
    resource: FirstClassResource,
    entity: Resource,
    sortBy: string,
    userPreferences = this.getUserPreferences(),
  ): string | number {
    if (sortBy === 'createdAt' || sortBy === 'modifiedAt') {
      const rawValue = (entity as Record<string, unknown>)[sortBy]
      // Convert timestamps once so in-memory sorting behaves like a numeric date sort.
      return typeof rawValue === 'string' ? Date.parse(rawValue) || 0 : 0
    }

    if (resource === FirstClassResource.feature) {
      const feature = entity as FeatureFromCollection
      const translatedValue =
        sortBy === 'title' || sortBy === 'description' || sortBy === 'displayAddress'
          ? getI18n(feature, sortBy, userPreferences, '') || ''
          : null

      if (typeof translatedValue === 'string') {
        return translatedValue.toLocaleLowerCase()
      }
    }

    if (sortBy === 'name' || sortBy === 'nameShort' || sortBy === 'description') {
      const translatedValue = getI18n(entity as never, sortBy, userPreferences, '')

      if (typeof translatedValue === 'string') {
        return translatedValue.toLocaleLowerCase()
      }
    }

    const rawValue = (entity as Record<string, unknown>)[sortBy]

    if (typeof rawValue === 'string') {
      return rawValue.toLocaleLowerCase()
    }

    if (typeof rawValue === 'number') {
      return rawValue
    }

    return ''
  }

  /**
   * Sorts an already-loaded resource collection without issuing another server request.
   *
   * @param resource - Resource type being sorted.
   * @param entities - Loaded entities to sort.
   * @param sorting - Requested sort state.
   * @returns A new array ordered according to the requested sort.
   * @remarks The sort falls back to `id` as a stable tiebreaker so repeated renders produce
   * deterministic ordering when primary sort values are equal.
   */
  sortLoadedResources<T extends Resource>(
    resource: FirstClassResource,
    entities: T[],
    sorting: ResourceSortState,
  ): T[] {
    const direction = sorting.sortOrder === 'asc' ? 1 : -1
    const userPreferences = this.getUserPreferences()
    const sortableEntities = entities.map(entity => ({
      entity,
      sortValue: this.getResourceSortValue(
        resource,
        entity,
        sorting.sortBy,
        userPreferences,
      ),
    }))

    sortableEntities.sort((left, right) => {
      const leftValue = left.sortValue
      const rightValue = right.sortValue

      if (leftValue < rightValue) return -1 * direction
      if (leftValue > rightValue) return 1 * direction

      // Use a stable secondary key to avoid order flicker when values are identical.
      return left.entity.id.localeCompare(right.entity.id)
    })

    return sortableEntities.map(item => item.entity)
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
      this.state.resources.organisation = entities as Organisation[]
      return
    }

    if (resource === FirstClassResource.project) {
      this.state.resources.project = entities as Project[]
      return
    }

    if (resource === FirstClassResource.layer) {
      this.state.resources.layer = entities as Layer[]
      return
    }

    if (resource === FirstClassResource.feature) {
      const features = entities as FeatureFromCollection[]
      this.state.resources.feature = features
      // Rebuild derived feature lookups after replacing the entire feature list.
      this.rebuildFeaturesMap()
      // Keep neighbourhood-specific derived state in sync with the sorted feature collection.
      this.divisionCtx.setDivisionFeatures(
        this.getPrism(FirstClassResource.layer).length > 0 ? features : [],
      )
      return
    }

    if (resource === FirstClassResource.task) {
      this.state.resources.task = entities as Task[]
      return
    }

    if (resource === FirstClassResource.hub) {
      this.state.resources.hub = entities as Hub[]
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
    const resourceArray = this.state.resources[resource]
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
      this.beginResourceRefresh(resourceType)
    }
  }

  togglePrism = async (resource: FirstClassResource, id: Id): Promise<void> => {
    const prisms = this.state.prisms[resource as ResourceTypeWithChildren]
    const index = prisms.indexOf(id)
    if (index === -1) {
      prisms.push(id)
    } else {
      prisms.splice(index, 1)
    }
    // Refresh all the dependent resources
    if (resource === FirstClassResource.organisation) {
      await this.refreshProjects()
    } else if (resource === FirstClassResource.project) {
      await this.refreshProperties()
      await this.refreshLayers()
    } else if (resource === FirstClassResource.layer) {
      // Public maps also need to follow active-layer changes.
      await this.refreshFeatures()
      if (this.user?.id) {
        if (this.isAdmin()) {
          await this.refreshTasks()
        }
      }
      // Only refresh if we have a username in the profile context
      if (this.panels.state.profile.ctx?.username) {
        await this.refreshUserProfile()
      }
    }
  }

  // Toggle methods for hierarchical filters
  toggleOrganisation = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.organisation, id)
  }

  /**
   * Returns the IDs of an organisation's layers that should be visible by default.
   *
   * @param organisationId - The organisation whose default layer IDs are required.
   * @returns The organisation's default-visible layer IDs.
   */
  getOrganisationDefaultVisibleLayerIds = (organisationId: Id): Id[] =>
    this.selectionLayers
      .filter(
        layer => layer.organisationId === organisationId && layer.isDefaultVisible,
      )
      .map(layer => layer.id)

  /**
   * Determines whether every default-visible layer for an organisation is active.
   *
   * @param organisationId - The organisation whose default layers are checked.
   * @returns Whether the organisation has default layers and every one is active.
   */
  isOrganisationDefaultLayersActive = (organisationId: Id): boolean => {
    const defaultLayerIds = this.getOrganisationDefaultVisibleLayerIds(organisationId)
    return (
      defaultLayerIds.length > 0 &&
      defaultLayerIds.every(layerId => this.state.prisms.layer.includes(layerId))
    )
  }

  /**
   * Activates an organisation's default-visible layers without changing prism scope.
   *
   * @param organisationId - The organisation whose default layers should be activated.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  addOrganisationDefaultLayers = async (organisationId: Id): Promise<void> => {
    const defaultLayerIds = this.getOrganisationDefaultVisibleLayerIds(organisationId)
    if (defaultLayerIds.length === 0) return

    this.state.prisms.layer = Array.from(
      new Set([...this.state.prisms.layer, ...defaultLayerIds]),
    )
    await this.postLayerMutation(true)
  }

  /**
   * Activates an organisation's defaults and joins its prism when organisation scope is active.
   *
   * @param organisationId - The organisation whose default layers should be activated.
   * @returns A promise that resolves after organisation and layer state are updated.
   */
  activateOrganisationWithDefaultLayers = async (organisationId: Id): Promise<void> => {
    if (this.state.prisms.organisation.length > 0) {
      await this.activateOrganisationPrismWithDefaultLayers(organisationId)
      return
    }

    await this.addOrganisationDefaultLayers(organisationId)
  }

  /**
   * Activates an organisation prism and enables the organisation's default-visible layers.
   *
   * @param organisationId - The organisation prism and default layers to activate.
   * @returns A promise that resolves after organisation and layer state are updated.
   */
  activateOrganisationPrismWithDefaultLayers = async (
    organisationId: Id,
  ): Promise<void> => {
    this.state.prisms.organisation = Array.from(
      new Set([...this.state.prisms.organisation, organisationId]),
    )

    // Load the newly scoped organisation's descendants before selecting its defaults.
    await this.refreshProjects(false)
    await this.refreshProperties()
    await this.refreshLayers(false)
    await this.addOrganisationDefaultLayers(organisationId)
  }

  /**
   * Removes an organisation prism and every active descendant prism and layer.
   *
   * @param organisationId - The organisation to deactivate.
   * @returns A promise that resolves after the expanded organisation scope is loaded.
   */
  deactivateOrganisation = async (organisationId: Id): Promise<void> => {
    const projectIds = new Set(
      [...this.cache.project.values()]
        .filter(project => project.organisationId === organisationId)
        .map(project => project.id),
    )
    const layerIds = new Set(
      [...this.cache.layer.values()]
        .filter(layer => layer.organisationId === organisationId)
        .map(layer => layer.id),
    )

    // Remove the organisation and all of its descendants before expanding the scope.
    this.state.prisms.organisation = this.state.prisms.organisation.filter(
      id => id !== organisationId,
    )
    this.state.prisms.project = this.state.prisms.project.filter(
      projectId => !projectIds.has(projectId),
    )
    this.state.prisms.layer = this.state.prisms.layer.filter(
      layerId => !layerIds.has(layerId),
    )

    await this.refreshProjects(false)
    await this.refreshProperties()
    await this.refreshLayers(true, false)
  }

  /**
   * Deactivates every active layer that belongs to an organisation without changing prism scope.
   *
   * @param organisationId - The organisation whose active layers should be disabled.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  deactivateOrganisationLayers = async (organisationId: Id): Promise<void> => {
    const organisationLayerIds = new Set(
      [...this.cache.layer.values()]
        .filter(layer => layer.organisationId === organisationId)
        .map(layer => layer.id),
    )

    this.state.prisms.layer = this.state.prisms.layer.filter(
      layerId => !organisationLayerIds.has(layerId),
    )
    await this.postLayerMutation(true, false)
  }

  toggleProject = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.project, id)
  }

  /**
   * Returns the IDs of a project's layers that should be visible by default.
   *
   * @param projectId - The project whose default layer IDs are required.
   * @returns The project's default-visible layer IDs.
   */
  getProjectDefaultVisibleLayerIds = (projectId: Id): Id[] =>
    this.selectionLayers
      .filter(layer => layer.projectId === projectId && layer.isDefaultVisible)
      .map(layer => layer.id)

  /**
   * Determines whether every default-visible layer for a project is active.
   *
   * @param projectId - The project whose default layers are checked.
   * @returns Whether the project has default layers and every one is active.
   */
  isProjectDefaultLayersActive = (projectId: Id): boolean => {
    const defaultLayerIds = this.getProjectDefaultVisibleLayerIds(projectId)
    return (
      defaultLayerIds.length > 0 &&
      defaultLayerIds.every(layerId => this.state.prisms.layer.includes(layerId))
    )
  }

  /**
   * Activates a project's default-visible layers without changing its prism scope.
   *
   * @param projectId - The project whose default layers should be activated.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  addProjectDefaultLayers = async (projectId: Id): Promise<void> => {
    const defaultLayerIds = this.getProjectDefaultVisibleLayerIds(projectId)
    if (defaultLayerIds.length === 0) return

    this.state.prisms.layer = Array.from(
      new Set([...this.state.prisms.layer, ...defaultLayerIds]),
    )
    await this.postLayerMutation(true)
  }

  /**
   * Activates a project's defaults and joins its prism when project scope is active.
   *
   * @param projectId - The project whose default layers should be activated.
   * @returns A promise that resolves after project and layer state are updated.
   */
  activateProjectWithDefaultLayers = async (projectId: Id): Promise<void> => {
    const isProjectScopeActive = this.state.prisms.project.length > 0

    if (isProjectScopeActive) {
      await this.activateProjectPrismWithDefaultLayers(projectId)
      return
    }

    await this.addProjectDefaultLayers(projectId)
  }

  /**
   * Activates a project prism and enables the project's default-visible layers.
   *
   * @param projectId - The project prism and default layers to activate.
   * @returns A promise that resolves after project and layer state are updated.
   */
  activateProjectPrismWithDefaultLayers = async (projectId: Id): Promise<void> => {
    this.state.prisms.project = Array.from(
      new Set([...this.state.prisms.project, projectId]),
    )

    // Load the newly scoped project's layers before selecting its defaults.
    await this.refreshProperties()
    await this.refreshLayers(false)
    await this.addProjectDefaultLayers(projectId)
  }

  /**
   * Isolates a project prism and replaces the active layers with its defaults.
   *
   * @param projectId - The project to make the sole active prism.
   * @returns A promise that resolves after the project scope and layer state update.
   */
  isolateProject = async (projectId: Id): Promise<void> => {
    this.state.prisms.project = [projectId]

    // Load the isolated project's resources before deriving its default layers.
    await this.refreshProperties()
    await this.refreshLayers(false)

    const defaultLayerIds = this.getProjectDefaultVisibleLayerIds(projectId)
    this.state.prisms.layer = [...defaultLayerIds]
    await this.postLayerMutation(true)
  }

  /**
   * Removes a project prism and every active layer that belongs to it.
   *
   * @param projectId - The project to deactivate.
   * @returns A promise that resolves after the expanded project scope is loaded.
   */
  deactivateProject = async (projectId: Id): Promise<void> => {
    const projectLayerIds = new Set(
      [...this.cache.layer.values()]
        .filter(layer => layer.projectId === projectId)
        .map(layer => layer.id),
    )

    // Remove both project-level and visible-layer state before expanding the scope.
    this.state.prisms.project = this.state.prisms.project.filter(id => id !== projectId)
    this.state.prisms.layer = this.state.prisms.layer.filter(
      layerId => !projectLayerIds.has(layerId),
    )

    await this.refreshProperties()
    await this.refreshLayers(true, false)
  }

  /**
   * Deactivates every active layer that belongs to a project without changing prism scope.
   *
   * @param projectId - The project whose active layers should be disabled.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  deactivateProjectLayers = async (projectId: Id): Promise<void> => {
    const projectLayerIds = new Set(
      [...this.cache.layer.values()]
        .filter(layer => layer.projectId === projectId)
        .map(layer => layer.id),
    )

    this.state.prisms.layer = this.state.prisms.layer.filter(
      layerId => !projectLayerIds.has(layerId),
    )
    await this.postLayerMutation(true, false)
  }

  /**
   * Toggles a layer's visible state and reconciles its dependent filters.
   *
   * @param id - The layer to toggle.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  toggleLayer = async (id: Id): Promise<void> => {
    const layerIds = this.state.prisms.layer
    const layerIndex = layerIds.indexOf(id)

    if (layerIndex === -1) {
      layerIds.push(id)
    } else {
      layerIds.splice(layerIndex, 1)
    }

    await this.postLayerMutation(true)
  }

  /**
   * Makes a layer the sole active layer.
   *
   * @param id - The layer to isolate.
   * @returns A promise that resolves after dependent layer state is updated.
   */
  isolateLayer = async (id: Id): Promise<void> => {
    this.state.prisms.layer = [id]
    await this.postLayerMutation(true)
  }

  toggleFeature = async (id: Id): Promise<void> => {
    await this.togglePrism(FirstClassResource.feature, id)
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
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    this.state.resources.organisation = organisations
    // Efficiently sync organization cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.organisation, this.state.resources.organisation)
    // Efficiently sync organisation code-to-ID mapping
    this.syncCodeToIdMap(this.organisationCodeToId, this.state.resources.organisation)
    // Sync organisation prisms to remove any invalid organisation IDs
    this.syncOrganisationPrisms()
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
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    this.state.resources.project = projects
    // Efficiently sync project cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.project, this.state.resources.project)
    // Efficiently sync project code-to-ID mapping
    this.syncCodeToIdMap(this.projectCodeToId, this.state.resources.project)
    // Sync project prisms to remove any invalid project IDs
    this.syncProjectPrisms()
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
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    this.state.resources.layer = layers
    // Efficiently sync layer cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.layer, this.state.resources.layer)
    // Sync layer prisms to remove any layerIds which are no londer valid resources given the parent prism selection.
    this.syncLayerPrisms()
    // Also calls this.refreshFeatures()
    await this.postLayerMutation(
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
    const selection = JSON.stringify(this.state.prisms.layer)
    const query = this.getRequiredQueryConfig(FirstClassResource.feature)
    const features: FeatureFromCollection[] = await (query.queryFn() as Promise<
      FeatureFromCollection[]
    >)

    if (
      refreshSerial !== this.featureRefreshSerial ||
      selection !== JSON.stringify(this.state.prisms.layer)
    ) {
      logMarkerBootstrap('stale feature data ignored after a newer refresh started', {
        refreshSerial,
        currentRefreshSerial: this.featureRefreshSerial,
        featureCount: features.length,
      })
      return
    }

    if (expectedRoleScope && expectedRoleScope !== this.getRoleScopeQueryKey()) {
      logMarkerBootstrap('stale feature data ignored after identity change', {
        expectedRoleScope,
        currentRoleScope: this.getRoleScopeQueryKey(),
        featureCount: features.length,
      })
      return
    }

    this.state.resources.feature = features
    // Retain entities shared with search and list queries; viewport membership is independent.
    for (const feature of features) this.cache.feature.set(feature.id, feature)

    logMarkerBootstrap('feature data committed', {
      featureCount: features.length,
      imageBackedFeatureCount: features.filter(feature => Boolean(feature.image))
        .length,
      pointFeatureCount: features.filter(feature => feature.geometry?.type === 'Point')
        .length,
    })

    // Pre-populate stats cache for this feature
    features.forEach(feature => {
      primeFeatureStatsCache(this, feature)
    })

    // Rebuild the featureId to feature map
    this.rebuildFeaturesMap()

    // Keep local neighbourhood membership useful for previews; totals come from server facets.
    this.divisionCtx.setDivisionFeatures(
      this.getPrism(FirstClassResource.layer).length > 0 ? features : [],
    )
  }

  refreshTasks = async (_isCascading: boolean = true): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.task)
    const query = this.getRequiredQueryConfig(FirstClassResource.task)
    const tasks = await (query.queryFn() as Promise<Task[]>)
    if (!this.isCurrentResourceRefresh(FirstClassResource.task, refreshSerial)) {
      return
    }
    this.state.resources.task = tasks
    // Efficiently sync task cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.task, this.state.resources.task)
  }

  setTaskResourceAndCache = (task: Task): void => {
    const existingTask = this.state.resources.task.find(t => t.id === task.id)
    if (existingTask) {
      this.state.resources.task = this.state.resources.task.map(t =>
        t.id === task.id ? task : t,
      )
    } else {
      this.state.resources.task = [...this.state.resources.task, task]
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

  refreshHubs = async (_isCascading: boolean = true): Promise<void> => {
    if (!this.isAdmin()) return
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.hub)
    const query = this.getRequiredQueryConfig(FirstClassResource.hub)
    const hubs = await (query.queryFn() as Promise<Hub[]>)
    if (!this.isCurrentResourceRefresh(FirstClassResource.hub, refreshSerial)) {
      return
    }
    this.state.resources.hub = hubs
    // Efficiently sync hub cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.hub, this.state.resources.hub)
    // Efficiently sync hub code-to-ID mapping
    this.syncCodeToIdMap(this.hubCodeToId, this.state.resources.hub)
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
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    // Efficiently sync property cache (only add missing, remove stale)
    this.syncCacheMap(this.cache.property, properties)
  }

  refreshUserFeatures = async (_isCascading: boolean = true): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh('userFeatures')
    const userId = this.user?.id ?? null
    const query = this.getRequiredQueryConfig('userFeatures')
    const userFeatures = await (query.queryFn() as Promise<UserFeature[]>)
    if (
      !this.isCurrentResourceRefresh('userFeatures', refreshSerial) ||
      userId !== (this.user?.id ?? null)
    ) {
      return
    }

    this.state.userFeatures = {
      wishlisted: (userFeatures || []).filter((f: UserFeature) => f.isWishlisted),
      visited: (userFeatures || []).filter((f: UserFeature) => f.isVisited),
    }

    // Notify the owning surface after membership reconciliation.
    this.onUserFeaturesChanged()
  }

  /**
   * Reconciles one wishlist or visit mutation into the local user-feature cache.
   *
   * @param featureId - The feature whose saved state changed.
   * @param updated - The remaining server state, or `null` when no saved state remains.
   * @returns Nothing.
   * @remarks
   * This is used for optimistic actions as well as their server confirmations, keeping every
   * visible feature card in sync without waiting for a full user-feature refetch.
   */
  applyUserFeatureState = (featureId: Id, updated: UserFeature | null): void => {
    this.featureMembershipOverrides.set(featureId, {
      row: updated,
      updatedAt: Date.now(),
    })
    const current = [
      ...this.state.userFeatures.wishlisted,
      ...this.state.userFeatures.visited.filter(
        visited =>
          !this.state.userFeatures.wishlisted.some(
            wishlisted => wishlisted.featureId === visited.featureId,
          ),
      ),
    ]
    const next = current.filter(item => item.featureId !== featureId)

    if (updated) next.unshift(updated)

    this.state.userFeatures = {
      wishlisted: next.filter(item => item.isWishlisted),
      visited: next.filter(item => item.isVisited),
    }
    this.configureFeatureQueries()
    this.onUserFeaturesChanged()
  }

  /**
   * Tests whether a recent explicit mutation supplies authoritative optimistic membership.
   * @param featureId - Feature whose membership is being read.
   * @returns Whether the override remains within normal collection staleness.
   */
  private hasRecentFeatureMembershipOverride = (featureId: Id): boolean => {
    const override = this.featureMembershipOverrides.get(featureId)
    return Boolean(override && Date.now() - override.updatedAt < 60_000)
  }

  /**
   * Resolves known list membership without treating an unhydrated row as a negative match.
   * @param featureId - Feature whose membership is being read.
   * @param listId - Current user's built-in list.
   * @returns Known membership, or undefined when the cache has no answer.
   */
  getFeatureListMembership = (
    featureId: Id,
    listId: 'wishlist' | 'visited',
  ): boolean | undefined => {
    if (this.hasRecentFeatureMembershipOverride(featureId)) {
      const row = this.featureMembershipOverrides.get(featureId)?.row
      return Boolean(listId === 'wishlist' ? row?.isWishlisted : row?.isVisited)
    }
    const entries =
      listId === 'wishlist'
        ? this.state.userFeatures.wishlisted
        : this.state.userFeatures.visited
    return entries.some(row => row.featureId === featureId) || undefined
  }

  refreshUserProfile = async (_isCascading: boolean = true): Promise<void> => {
    const refreshSerial = this.beginResourceRefresh(FirstClassResource.user)
    const accountRevision = this.account.revision
    const userId = this.user?.id ?? null
    const query = this.getRequiredQueryConfig(FirstClassResource.user)
    const user = await (query.queryFn() as Promise<UserProfile | null>)
    if (
      !this.isCurrentResourceRefresh(FirstClassResource.user, refreshSerial) ||
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

  // ═══════════════════════
  // PRISMS
  // ═══════════════════════

  //* Removes organisation from prisms if they are no longer in the resources.
  // This should rarely happen as we always fetch all organisations. But it could happen in cases where an organisation is unpublished or deleted.
  syncOrganisationPrisms = (): void => {
    // A selected identity may be outside the loaded page; absence is not a deletion.
  }

  //* Removes project from prisms if they are no longer in the resources.
  // This typically is required when an organisation prism is set, and a
  // previously active prism is no longer valid given that the related
  // organisation is not selected as a prism.
  syncProjectPrisms = (): void => {
    // A selected identity may be outside the loaded page; absence is not a deletion.
  }

  //* Removes layer from prisms if they are no longer in the resources.
  // This typically is required when a organisation or project prism is set,
  // and a previously active prism is no longer valid given that the related
  // project or organisation is not selected as a prism.
  syncLayerPrisms = (): void => {
    // A selected identity may be outside the loaded page; absence is not a deletion.
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
    this.featureRefreshSerial++
    await this.loadPinnedLayers(expectedRoleScope)
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    const currentLayerIds = new Set(this.state.prisms.layer)
    const existingFilterLayerIds = new Set(
      Object.keys(this.state.filters.feature.properties || {}),
    )

    // Initialise filters for newly added layers
    currentLayerIds.forEach(layerId => {
      if (!existingFilterLayerIds.has(layerId)) {
        // Call initialization functions for the new layer
        this.initialiseCategoricalPropertyFilters(layerId)
        this.initialiseRangePropertyFilter(layerId)
      }
    })

    // Remove filters for layers that are no longer active
    existingFilterLayerIds.forEach(layerId => {
      if (!currentLayerIds.has(layerId)) {
        delete this.state.filters.feature.properties?.[layerId]
      }
    })

    if (isCascading) {
      // Public maps also need to follow active-layer changes.
      await this.refreshFeatures()
      if (this.user?.id) {
        if (this.isAdmin()) {
          await this.refreshTasks()
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

  // FILTERS

  // FILTERS - GENERIC

  getFilterCount = (): { neighbourhoods: number; properties: number } => {
    return {
      neighbourhoods: this.divisionCtx.divisionFilterCount,
      properties: Object.entries(this.state.filters.feature.properties || {}).reduce(
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
                    values.rangeMax !== values.globalMax)),
            ).length
          )
        },
        0,
      ),
    }
  }

  resetFilters = (): void => {
    this.state.filters = {
      organisation: { text: '', properties: {} },
      project: { text: '', properties: {} },
      layer: { text: '', properties: {} },
      feature: { text: '', properties: {} },
      task: { text: '', properties: {} },
      hub: { text: '', properties: {} },
      property: { text: '', properties: {} },
    }
    this.divisionCtx.resetDivisions()
    // Re-initialize property filters for active layers
    this.state.prisms.layer.forEach(layerId => {
      this.initialiseCategoricalPropertyFilters(layerId)
      this.initialiseRangePropertyFilter(layerId)
    })
  }

  getFilteredResource = <
    T extends Organisation | Project | Layer | Feature | Hub | Task,
  >(
    resource: FirstClassResource | HierarchicalResource,
    filters = { text: true, state: true },
  ): T[] => {
    const query = this.state.filters[resource as keyof FilterState].text || ''
    // FULL SET
    let result = this.state.resources[resource as keyof FilteredResources] as T[]
    // TIER 2 FILTERS :: Boolean State :: (App Wide)
    // TODO Implement these filters if the data responses get too large.
    // TIER 2 FILTERS :: Text :: (App Wide)
    if (filters.text && resource !== FirstClassResource.hub) {
      result = result.filter((entity: T) => {
        if (!isTask(entity)) {
          return this.textFilter(resource as FirstClassResource, entity, query)
        }
        return true
      })
    }

    return result
  }

  textFilter = <
    T extends Organisation | Project | Layer | Feature | Hub | FeatureFromCollection,
  >(
    _resource: FirstClassResource,
    entity: T,
    query: string,
  ) => {
    return matchesResourceTextQuery(entity, query, getLocaleKey())
  }

  // Filtered Helpers
  filteredOrganisations = $derived.by(() => {
    // Explicitly access reactive dependencies so Svelte tracks them
    this.state.resources.organisation
    this.state.filters.organisation
    return this.getFilteredResource<Organisation>(FirstClassResource.organisation)
  })
  filteredProjects = $derived.by(() => {
    this.state.resources.project
    this.state.filters.project
    return this.getFilteredResource<Project>(FirstClassResource.project)
  })
  filteredLayers = $derived.by(() => {
    this.state.resources.layer
    this.state.filters.layer
    return this.getFilteredResource<Layer>(FirstClassResource.layer)
  }) as Layer[]
  filteredFeatures = $derived.by(() => {
    this.state.resources.feature
    this.state.filters.feature
    return this.getFilteredResource<Feature>(FirstClassResource.feature)
  })

  // PRISM RELATIONS

  getPrism = (resource: FirstClassResource): Id[] => {
    return this.state.prisms[resource as ResourceTypeWithChildren]
  }

  isPrism = (resource: FirstClassResource, id: Id): boolean => {
    return this.state.prisms[resource as ResourceTypeWithChildren]?.includes(id)
  }

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
  getOrganisationCount = (): number => this.state.resources.organisation.length

  getOrganisationProjectCount = (organisationId: Id): number =>
    this.state.resources.project.filter(p => p.organisationId === organisationId).length

  getProjectLayerCount = (projectId: Id): number =>
    this.state.resources.layer.filter(l => l.projectId === projectId).length

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
    if (!this.isAdmin()) {
      return this.getVisibleFeatures().map(row => row.id)
    }
    // Avoid showing stale markers while an active-layer feature refresh is in flight.
    if (this.state.prisms.layer.length === 0) {
      return []
    }

    const activeLayerIds = new Set(this.state.prisms.layer)
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
    return (this.state.userFeatures?.wishlisted ?? [])
      .map(wl => wl.featureId)
      .filter((featureId): featureId is Id => Boolean(featureId))
  }

  // Features (for Active Layers) that the user has visited
  getVisitedFeatureIds = (): Id[] => {
    return (this.state.userFeatures?.visited ?? [])
      .map(wl => wl.featureId)
      .filter((featureId): featureId is Id => Boolean(featureId))
  }

  getWishlistUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures?.wishlisted || []
  }

  getVisitedUserFeatures = (): UserFeature[] => {
    return this.state.userFeatures?.visited || []
  }

  // ═══════════════════════
  // REACTIVE FEATURE COLLECTIONS
  // ═══════════════════════

  // Efficiently update features map from current state.resources.feature
  private rebuildFeaturesMap = () => {
    const newFeatures = this.state.resources.feature
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
  protected onUserFeaturesChanged(): void {}

  /** Notifies the owning surface when identity-bound projections must be cleared. @returns Nothing. */
  protected onAccountScopeChanged(): void {}

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
    this.featureRefreshSerial += 1
    this.invalidateResourceRefreshes()

    // Identity-bound records must never survive guest/account or role transitions.
    this.cache.user.clear()
    this.state.userFeatures = { wishlisted: [], visited: [] }
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
    this.featureMembershipOverrides.clear()
    this.selectionLayers = []
    this.featuresMap.clear()
    this.featureLoadState = 'idle'
    for (const resource of [
      'organisation',
      'project',
      'layer',
      'feature',
      'task',
      'hub',
    ] as const)
      this.state.resources[resource] = []
    this.postUserMutation()
  }

  /** Reads the shared account presentation snapshot. @returns Current user, or null. */
  getUser = (): AccountUser | null => {
    return this.user
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

  getUserLayers = (): UserLayer[] => {
    return this.getUserLayersForCurrentHub()
  }

  getUserLayerIds = (): string[] => {
    return this.getUserLayersForCurrentHub().map((layer: UserLayer) => layer.layerId)
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
    const currentHubLayerIds = new Set(
      this.state.resources.layer.map(layer => layer.id),
    )

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
    this.setLayers(layers.map(layer => layer.layerId))
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
    this.interactions.dispose()
    this.panels.dispose()
    this.disposed = true
    this.featureRefreshSerial++
    this.invalidateResourceRefreshes()
    this.resources.release()
    this.cacheCtx.releaseEntityStore(this.cache)
    this.isInitialised = false
  }

  // Clear all cache maps (for actual data reset scenarios)
  clearAllCaches = (): void => {
    this.cacheCtx.clear()
    this.featureMembershipOverrides.clear()
    // Invalidate in-flight feature reads before removing their committed state.
    this.featureRefreshSerial += 1
    this.invalidateResourceRefreshes()
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

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetOrganisations = async () => {
    this.state.prisms.organisation = []
    await this.refreshOrganisations()
  }

  // Efficient reset methods - clears selection filters, used cache if data was fetched before, otherwise refetches
  resetProjects = async () => {
    this.state.prisms.project = []
    await this.refreshProjects()
  }

  // Force refresh methods for when you actually need to invalidate and fetch fresh data
  forceRefreshOrganisations = async () => {
    this.state.prisms.organisation = []
    await this.invalidateAndRefresh(FirstClassResource.organisation)
  }

  forceRefreshProjects = async () => {
    this.state.prisms.project = []
    await this.invalidateAndRefresh(FirstClassResource.project)
  }

  // TODO : Clear the Omnibar when a layer is toggled
  addLayer = (id: Id) => {
    this.state.prisms.layer.push(id)
    this.postLayerMutation()
  }

  removeLayer = (id: Id) => {
    this.state.prisms.layer = this.state.prisms.layer.filter(l => l !== id)
    this.postLayerMutation()
  }

  setLayers = (layers: Id[]) => {
    this.state.prisms.layer = layers
    this.postLayerMutation()
  }

  resetLayers = () => {
    this.state.prisms.layer = []
    this.postLayerMutation()
  }

  initialiseCategoricalPropertyFilters = (layerId: Id) => {
    const layer = this.state.resources.layer.find(l => l.id === layerId)
    if (!layer) {
      return
    }

    const project = this.state.resources.project.find(p => p.id === layer.projectId)
    if (!project) {
      return
    }

    // Filter properties based on visibility in layer (similar logic to Categories.svelte)
    const classifierProperties =
      project.properties
        ?.filter(p => p.type === 'classifier')
        .filter(prop => {
          const layerProperty = layer.properties?.find(lp => lp.propertyId === prop.id)
          // Only consider properties visible in the layer AND not range fields
          return layerProperty?.isVisible !== false && prop.component !== 'RangeField'
        })
        // Ensure uniqueness by key within the project's properties relevant to this layer
        .filter(
          (prop, index, self) => index === self.findIndex(p => p.key === prop.key),
        ) || []

    // Ensure the layer's filter object exists
    if (!this.state.filters.feature.properties) {
      this.state.filters.feature.properties = {}
    }

    const featurePropertyFilters = this.state.filters.feature
      .properties as unknown as Record<Id, Record<string, string[] | RangeFilterValue>>
    if (!featurePropertyFilters[layerId]) {
      featurePropertyFilters[layerId] = {}
    }

    const layerFilters = featurePropertyFilters[layerId] as Record<
      string,
      string[] | RangeFilterValue
    >

    // Initialize each classifier property with an empty array if not already set
    classifierProperties.forEach((property: Property) => {
      if (!(property.key in layerFilters)) {
        layerFilters[property.key] = []
      }
    })
  }

  initialiseRangePropertyFilter = (layerId: Id) => {
    const layer = this.state.resources.layer.find(l => l.id === layerId)
    if (!layer) {
      return
    }

    const project = this.state.resources.project.find(p => p.id === layer.projectId)
    if (!project) {
      return
    }

    // Find properties that are RangeFields and visible for this layer
    const rangeProperties =
      project.properties
        ?.filter(p => p.component === 'RangeField') // Identify range properties
        .filter(prop => {
          const layerProperty = layer.properties?.find(lp => lp.propertyId === prop.id)
          // Only consider properties visible in the layer
          return layerProperty?.isVisible !== false
        })
        // Ensure uniqueness by key
        .filter(
          (prop, index, self) => index === self.findIndex(p => p.key === prop.key),
        ) || []

    // Ensure the layer's filter object exists
    if (!this.state.filters.feature.properties) {
      this.state.filters.feature.properties = {}
    }

    const featurePropertyFilters = this.state.filters.feature
      .properties as unknown as Record<Id, Record<string, string[] | RangeFilterValue>>
    if (!featurePropertyFilters[layerId]) {
      featurePropertyFilters[layerId] = {}
    }

    const layerFilters = featurePropertyFilters[layerId] as Record<
      string,
      string[] | RangeFilterValue
    >

    // Initialize each range property using its min/max if not already set
    rangeProperties.forEach((property: Property) => {
      // Validate that min and max exist and are numbers
      const min = property.min
      const max = property.max

      if (
        !(property.key in layerFilters) &&
        typeof min === 'number' &&
        typeof max === 'number'
      ) {
        const filterConfig = {
          globalMin: min,
          globalMax: max,
          rangeMin: min, // Default rangeMin to globalMin
          rangeMax: max, // Default rangeMax to globalMax
        }

        layerFilters[property.key] = filterConfig
      }
    })
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
      this.applyInitialLayerPrisms()
      return
    }

    const isSameHub =
      (hub.id && currentHub.id === hub.id) ||
      (!hub.id && currentHub.code && currentHub.code === hub.code)

    if (!isSameHub) {
      this.hub = hub
      this.applyInitialLayerPrisms()
      return
    }

    if (currentHub && !currentHub.id && hub.id) {
      this.hub = {
        ...currentHub,
        ...hub,
      }
      this.applyInitialLayerPrisms()
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

  // Convenience methods using the generic syncMap
  private syncCacheMap = <T extends { id: Id }>(
    cache: Map<Id, T>,
    newItems: T[],
  ): void => {
    for (const item of newItems) cache.set(item.id, { ...cache.get(item.id), ...item })
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

const SURFACE_CONTEXT_KEY = Symbol('resource-view-context')

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
