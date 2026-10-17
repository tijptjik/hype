// SVELTE
import { getContext, setContext } from 'svelte'
// GEO
import { bbox } from '@turf/bbox'
// CONTEXT
import { AppSelection } from './appSelection.svelte.js'
import { SurfaceNavigation, setSurfaceNavigation } from './surfaceNavigation.svelte.js'
import { ResourceViewCtx, setSurfaceCtx } from './resourceView.svelte.js'
import { CacheCtx } from './cache.svelte.js'
// RESOURCES
import { mapResourceProviders } from '#lib/resources/mapProviders.js'
// NAVIGATION
import { navigate } from '#lib/navigation/index.js'
// MAP
import { isFeaturePointWithinBounds } from '#lib/map/featureSpatial.js'
import { isMobile, PANEL_WIDTH } from '#lib/constants.js'
// ENUMS
import { FirstClassResource } from '#lib/enums.js'
// TYPES
import type { ActiveCollection } from './resourceCollection.types.js'
import type { CollectionNavOptions } from '#lib/client/services/form.types.js'
import type { AccountState } from './account.svelte.js'
import type { MapController } from '#lib/map/controller.js'
import type {
  Feature,
  FeatureFromCollection,
} from '#lib/db/zod/schema/feature.types.js'
import type { FeatureCollection, Feature as GeoJSONFeature } from 'geojson'
import type { DivisionCtx } from './division.svelte.js'
import type { ResponsiveCtx } from './responsive.svelte.js'
import type { Id } from '#lib/types.js'

/** Public map application orchestration. Admin and dashboard routes do not construct it. */
export class AppCtx extends ResourceViewCtx {
  readonly selection = new AppSelection(
    id => this.cache.feature.get(id) ?? this.features.get(id),
  )
  // Whether the public app is transitioning between feature presentations.
  isTransitioning = $state(false)
  private transitionTimeout: ReturnType<typeof setTimeout> | null = null

  /** Cancels presentation timing when selection changes or the surface unmounts. @returns Nothing. */
  private clearTransition(): void {
    if (this.transitionTimeout !== null) clearTimeout(this.transitionTimeout)
    this.transitionTimeout = null
    this.isTransitioning = false
  }

  /** Updates the selected walk after resource membership is reconciled. @returns Nothing. */
  protected override onUserFeaturesChanged(): void {
    this.postUserFeaturesMutation()
  }

  /** Clears public selection when the shared account scope changes. @returns Nothing. */
  protected override onAccountScopeChanged(): void {
    // The base constructor also reconciles account scope, before app fields exist.
    if (this.selection) this.resetActiveCollection()
  }

  readonly navigation = new SurfaceNavigation((type, ref) => {
    if (type === 'organisation' || type === 'project' || type === 'hub')
      return this.getResourceByRefSync(type, ref)?.id ?? null
    return ref
  })

  /** Camera capability supplied by the public map renderer; native map ownership stays there. */
  mapController: MapController | null = $state.raw(null)

  /** Reads the current public map center. @returns Coordinates, or null before mount/after teardown. */
  getMapCenter = (): [number, number] | null =>
    this.mapController?.getCamera()?.center ?? null

  /**
   * Creates only the public application's resource and map orchestration.
   * @param divisionCtx Public division filters.
   * @param account Root-owned identity and self-profile data.
   * @param responsiveCtx Root viewport state.
   * @param cacheCtx Root-owned cache.
   */
  constructor(
    divisionCtx: DivisionCtx,
    account: AccountState,
    responsiveCtx: ResponsiveCtx,
    cacheCtx = new CacheCtx(mapResourceProviders),
  ) {
    super(divisionCtx, account, responsiveCtx, cacheCtx)
    cacheCtx.installProviders(mapResourceProviders)
  }

  /** Drops the camera capability and releases the resource view. @returns Nothing. */
  override dispose(): void {
    this.resetActiveCollection()
    this.mapController = null
    super.dispose()
  }

  // Features Collection -- Subsets

  /** Reads the collection context used for public feature stepping. @returns The active collection, if any. */
  getActiveCollection = (): ActiveCollection => this.selection.collection

  /**
   * Selects a collection and coordinates its first or requested feature.
   * @param collection Ordered feature context.
   * @param options Card, camera and URL intent for this action.
   * @returns Nothing.
   */
  setActiveCollection = (
    collection: ActiveCollection,
    options: {
      activeFeatureId?: string
      focus?: boolean
      focusFeature?: boolean
      highlight?: boolean
      openCard?: boolean
      openCardDelay?: number
      isCardOpen?: boolean
      updateUrl?: boolean
      navOptions?: CollectionNavOptions['navOptions']
    },
  ): void => {
    const optionsWithDefaults = {
      highlight: true,
      focus: true,
      focusFeature: true,
      openCard: true,
      openCardDelay: 0,
      ...options,
    }
    this.selection.collection = collection
    if (!collection?.items.length) {
      this.resetActiveFeature()
      return
    }

    // Handle feature activation
    this.postActiveCollectionMutation(optionsWithDefaults)
  }

  private postActiveCollectionMutation = (options: {
    activeFeatureId?: string
    highlight?: boolean
    focus?: boolean
    focusFeature?: boolean
    openCard?: boolean
    openCardDelay?: number
    isCardOpen?: boolean
    updateUrl?: boolean
    navOptions?: CollectionNavOptions['navOptions']
  }): void => {
    const optionsWithDefaults = {
      highlight: true,
      focus: true,
      focusFeature: true,
      openCard: true,
      openCardDelay: 0,
      ...options,
    }
    const collection = this.selection.collection
    if (!collection?.items.length) return

    if (options.highlight) {
      this.highlightActiveCollection({ focus: optionsWithDefaults.focus })
    }

    // Determine which feature to activate, default to first
    let featureIdToActivate: string | null = collection.items[0].id

    if (options.activeFeatureId) {
      // Check if the specific feature exists in the collection
      const featureExists = collection.items.some(
        item => item.id === optionsWithDefaults.activeFeatureId,
      )
      if (featureExists) {
        featureIdToActivate = optionsWithDefaults.activeFeatureId || null
      } else {
        console.error(
          'Feature not found in collection',
          optionsWithDefaults.activeFeatureId,
        )
      }
    }

    if (featureIdToActivate) {
      this.setActiveFeature(featureIdToActivate, {
        focus: optionsWithDefaults.focusFeature,
        openCard: optionsWithDefaults.openCard,
        openCardDelay: optionsWithDefaults.openCardDelay,
        isCardOpen: optionsWithDefaults.isCardOpen,
        updateUrl: optionsWithDefaults.updateUrl,
        navOptions: optionsWithDefaults.navOptions,
      })
    }
  }

  /** Clears feature and collection selection, along with pending presentation work. @returns Nothing. */
  resetActiveCollection = (): void => {
    // Clearing collection membership removes renderer highlighting.
    this.cancelPendingOpenCard()
    this.clearTransition()
    // Reset active collection
    this.selection.collection = null
    // Reset active feature
    this.selection.clearFeature()
  }

  /** Resolves the selected identity to its current resource data. @returns The selected feature, if any. */
  getActiveFeature = (): FeatureFromCollection | Feature | null =>
    this.selection.feature

  pendingOpenCardTimeout: ReturnType<typeof setTimeout> | null = null

  /**
   * Cancels any deferred feature-card open scheduled from active-feature mutations.
   */
  cancelPendingOpenCard = (): void => {
    if (this.pendingOpenCardTimeout !== null) {
      clearTimeout(this.pendingOpenCardTimeout)
      this.pendingOpenCardTimeout = null
    }
  }

  /**
   * Clears the active feature while preserving the active collection context.
   */
  resetActiveFeature = (): void => {
    this.cancelPendingOpenCard()
    this.clearTransition()
    this.selection.clearFeature()
  }

  /**
   * Selects a retained feature and coordinates public presentation intent.
   * @param featureId Feature identity to select.
   * @param options Card, camera and URL intent; route hydration disables URL updates.
   * @returns Nothing when the feature cannot be resolved.
   */
  setActiveFeature = (
    featureId: Id,
    options: {
      focus?: boolean
      openCard?: boolean | null
      openCardDelay?: number
      isCardOpen?: boolean
      updateUrl?: boolean
      navOptions?: CollectionNavOptions['navOptions']
    },
  ): void => {
    const optionsWithDefaults = {
      focus: true,
      openCard: true,
      openCardDelay: 0,
      updateUrl: true,
      ...options,
    }

    this.cancelPendingOpenCard()
    this.clearTransition()

    // Pre-mutation: cleanup from previous feature
    this.preActiveFeatureMutation()

    // Set active state to new feature
    const nextFeature =
      this.cache.feature.get(featureId) ??
      this.selection.collection?.items.find(row => row.id === featureId) ??
      this.features.get(featureId)
    if (!nextFeature) {
      this.isTransitioning = false
      return
    }

    this.selection.select(nextFeature)

    // Post-mutation: setup new feature
    this.postActiveFeatureMutation(featureId, optionsWithDefaults)
  }

  private preActiveFeatureMutation = (): void => {
    // Remove active state from previous feature
    this.isTransitioning = true
    // Marker presentation is derived by the map renderer from active state.
  }

  private postActiveFeatureMutation = (
    featureId: Id,
    options: {
      focus?: boolean
      openCard?: boolean | null
      openCardDelay?: number
      isCardOpen?: boolean
      updateUrl?: boolean
      navOptions?: CollectionNavOptions['navOptions']
    },
  ): void => {
    const optionsWithDefaults = {
      focus: true,
      openCard: true,
      openCardDelay: 0,
      ...options,
    }
    if (optionsWithDefaults.focus || optionsWithDefaults.openCard) {
      if (!optionsWithDefaults.isCardOpen && optionsWithDefaults.openCard) {
        this.cancelPendingOpenCard()
        this.pendingOpenCardTimeout = setTimeout(() => {
          window.dispatchEvent(new CustomEvent('OmniCtx.openCard'))
          this.pendingOpenCardTimeout = null
        }, optionsWithDefaults.openCardDelay)
      } else {
        this.cancelPendingOpenCard()
      }
    }
    if (optionsWithDefaults.updateUrl) {
      navigate(FirstClassResource.feature, featureId, optionsWithDefaults.navOptions)
    }
    // Reset transition state; a later selection cancels this timer.
    this.transitionTimeout = setTimeout(() => {
      this.isTransitioning = false
      this.transitionTimeout = null
    }, 2000)
  }

  highlightActiveCollection = (
    options: { focus: boolean } = { focus: false },
  ): void => {
    // Marker presentation is derived by the map renderer from this collection.
    if (options.focus) {
      this.zoomToActiveCollection()
    }
  }

  // MAP OPERATIONS -- REBOUNDING

  zoomToActiveCollection = (): void => {
    const features = this.getActiveCollection()?.items || []
    this.zoomToFeatures(features)
  }

  zoomToActiveFeature = (): void => {
    const feature = this.getActiveFeature()
    if (!feature) return
    this.zoomToFeatures([feature])
  }

  /*
   * Handles user features mutation and refreshes the active walk collection
   * If a user has their stars selected as an ActiveCollection (Walk), then we
   * ensure that the collection count is updated and the card navigates to
   * the next item on the list, or returns home if the list is empty.
   */
  postUserFeaturesMutation = (): void => {
    const activeCollection = this.getActiveCollection()
    if (activeCollection?.type !== 'walk') {
      return
    }

    // Paged user lists keep their query predicates, ordering and server totals after an edit.
    if (activeCollection.totalCount !== undefined) {
      const query = this.resources.featureQueries.collection
      this.selection.collection = {
        ...activeCollection,
        items: query.rows,
        totalCount: query.totalCount,
      }
      return
    }

    const currentActiveFeature = this.getActiveFeature()
    let updatedItems: (FeatureFromCollection | Feature)[] = []

    // Get updated items based on walk type
    if (activeCollection.id === 'stars') {
      updatedItems = this.getWishlistedFeatures()
    } else if (activeCollection.id === 'visited') {
      updatedItems = this.getVisitedFeatures()
    }
    // TODO: Add other walk types when implemented

    // If the collection is now empty, reset and navigate to home
    if (updatedItems.length === 0) {
      this.resetActiveCollection()
      navigate('/')
      return
    }

    // Update the collection with new items
    this.setActiveCollection(
      {
        ...activeCollection,
        items: updatedItems,
      },
      {
        activeFeatureId: currentActiveFeature?.id,
        highlight: false,
        focus: false,
      },
    )

    // Handle navigation if current feature is no longer in the collection
    if (currentActiveFeature) {
      const isCurrentFeatureStillInCollection = updatedItems.some(
        f => f.id === currentActiveFeature.id,
      )

      if (!isCurrentFeatureStillInCollection) {
        // Find the next feature to navigate to
        const currentIndex = activeCollection.items.findIndex(
          f => f.id === currentActiveFeature.id,
        )

        let nextFeature: FeatureFromCollection | Feature | null = null

        // Try to get the next feature in the original list
        if (currentIndex >= 0 && currentIndex < updatedItems.length) {
          nextFeature = updatedItems[currentIndex]
        } else if (updatedItems.length > 0) {
          // If current index is out of bounds, get the last item
          nextFeature = updatedItems[updatedItems.length - 1]
        }

        if (nextFeature) {
          this.setActiveFeature(nextFeature.id, { focus: true, openCard: true })
        }
      }
    }
  }

  // Refocus map on currently visible features
  zoomToAllVisibleFeatures = (): void => {
    const visibleFeatures = this.getVisibleFeatures()
    if (visibleFeatures.length > 0) {
      this.zoomToFeatures(visibleFeatures)
    }
  }

  getVisibleFeatures = (): (FeatureFromCollection | Feature)[] => {
    if (!this.isAdmin()) {
      // Remove offscreen points, disabled layers and excluded divisions before the debounced page has settled.
      const { include, exclude } = this.divisionCtx.state.filters.feature.neighbourhood
      return this.resources.featureQueries.map.rows
        .filter(row => this.scope.prisms.layer.includes(row.layerId))
        .filter(row => {
          const selected =
            row.divisionMemberships?.filter(member => member.selected) ?? []
          return (
            (!include.size ||
              selected.some(member => include.has(member.divisionId))) &&
            !selected.some(member => exclude?.has(member.divisionId))
          )
        })
        .filter(
          row =>
            !this.featureViewport?.bounds ||
            isFeaturePointWithinBounds(row.geometry, this.featureViewport.bounds),
        )
    }
    return this.getFeaturesByIds(this.featuresVisible)
  }

  /** Fits the public camera to feature bounds. @param features Optional feature subset. @returns Nothing. */
  zoomToFeatures = (features?: (FeatureFromCollection | Feature)[]): void => {
    if (!this.mapController) return

    // Use provided features or current state features
    const featuresToZoom = features || this.getFeaturesByIds(this.featuresVisible)
    if (!featuresToZoom.length) return

    // Create a FeatureCollection
    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: featuresToZoom.map(f => ({
        type: 'Feature',
        geometry: f.geometry,
        properties: f.properties,
      })) as GeoJSONFeature[],
    }
    const padding = isMobile()
      ? {
          top: 48,
          bottom: 50,
          right: 50,
          left: 50,
        }
      : {
          top: 150,
          bottom: 50,
          right: 50 + (this.panels.isRightPanelOpen() ? PANEL_WIDTH / 2 : 0),
          left: 50 + (this.panels.isLeftPanelOpen() ? PANEL_WIDTH / 2 : 0),
        }
    try {
      // Convert to WGS84 and get bounds
      const bounds = bbox(featureCollection)

      this.mapController.fitBounds(
        [
          [bounds[0], bounds[1]], // southwestern corner
          [bounds[2], bounds[3]], // northeastern corner
        ],
        {
          center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
          padding,
          maxZoom: 18,
          duration: 2500,
        },
      )
    } catch (error) {
      console.error('Error zooming to features:', error)
    }
  }

  /** Fits the public camera to coordinates. @param coordinates Geographic points. @returns Nothing. */
  zoomToCoordinates = (coordinates: [number, number][]): void => {
    if (!this.mapController) return

    // Create a FeatureCollection
    const featureCollection: FeatureCollection = {
      type: 'FeatureCollection',
      features: coordinates.map(c => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: c,
        },
        properties: {},
      })) as GeoJSONFeature[],
    }

    const bounds = bbox(featureCollection)

    this.mapController.fitBounds(
      [
        [bounds[0], bounds[1]], // southwestern corner
        [bounds[2], bounds[3]], // northeastern corner
      ],
      {
        center: { lon: (bounds[0] + bounds[2]) / 2, lat: (bounds[1] + bounds[3]) / 2 },
        padding: {
          top: 150,
          bottom: 150,
          right: 50,
          left: 50,
        },
        maxZoom: 20,
        duration: 2500,
      },
    )
  }

  featuresQueryFn = async (): Promise<FeatureFromCollection[]> => {
    const query = this.resources.featureQueries.map
    if (!this.scope.prisms.layer.length) {
      query.clear()
      this.queries.featureLoadState = 'complete'
      return []
    }
    // The map effect starts its first page once the camera provides a viewport.
    if (!this.featureViewport) return []
    await this.queries.loadFeatureQuery(
      'map',
      this.filters.featureQueryInput({
        spatial: this.featureViewport,
        includeCounts: false,
      }),
    )
    // Native pages allow visible progress without automatically requesting the entire dataset.
    return query.rows
  }

  init = async (userId: Id | null, loadFeatures: boolean = true): Promise<void> => {
    // Unauthenticated routes initialise without account data.
    if (!userId) {
      // Initialize empty data structures for unauthenticated users.
      this.queries.rows.organisation = []
      this.queries.rows.project = []
      this.queries.rows.layer = []
      this.queries.rows.feature = []
      this.queries.rows.task = []
      this.queries.rows.hub = []
      this.isInitialised = true
      return
    }
    // Initialize stats cache
    this.initStatsCache()
    // Use parallel fetching for initial load
    this.queries.isLoadingResources = true
    try {
      await this.initialFetch(true, loadFeatures)
    } finally {
      this.queries.isLoadingResources = false
    }
    // Prevent init from running again, unless the user (re)authenticates
    // see reinitializeWithAuth()
    this.isInitialised = true
  }

  /**
   * Hydrates map resources that are safe to show before a user authenticates.
   *
   * @param loadFeatures - Whether to request the public feature collection.
   * @returns Nothing after the public hierarchy and optional feature collection settle.
   * @remarks Errors are logged here because the login dialog and base map must remain
   * usable even when a non-essential public resource request fails.
   */
  bootstrapPublicMapResources = async (loadFeatures: boolean = true): Promise<void> => {
    const publicRoleScope = this.getRoleScopeQueryKey()

    try {
      this.initStatsCache()
      this.queries.isLoadingResources = true
      try {
        await this.initialFetch(false, loadFeatures, publicRoleScope)
      } finally {
        this.queries.isLoadingResources = false
      }
    } catch (error) {
      console.error('[AppCtx] Public map bootstrap failed:', error)
    }
  }

  /**
   * Loads application resources in dependency order.
   *
   * @param includeUserData - Whether to request identity-bound profile and preference data.
   * @param loadFeatures - Whether to request the initial feature collection.
   * @param expectedRoleScope - Optional identity scope that must still be current before
   * public-bootstrap data is committed.
   * @returns Nothing after the requested resource stages settle.
   */
  initialFetch = async (
    includeUserData: boolean = true,
    loadFeatures: boolean = true,
    expectedRoleScope?: string,
  ): Promise<void> => {
    expectedRoleScope ??= this.getRoleScopeQueryKey()
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    // Bootstrap only map-relevant user state first. Self-profile hydration includes a
    // contribution relation graph and is deferred until its panel needs it.
    const lightSteps = includeUserData
      ? ([
          ['userFeatures', () => this.queries.refreshUserFeatures(false)],
          ['userLayers', () => this.hydrateCurrentUserLayers()],
        ] as const)
      : []

    // Independent compact lists and default identities start together; none waits for ancestors.
    const defaults = this.loadDefaultLayerResources(expectedRoleScope)
    const hierarchy = Promise.allSettled([
      this.queries.refreshOrganisations(false, expectedRoleScope),
      this.queries.refreshProjects(false, expectedRoleScope),
      this.queries.refreshLayers(false, false, expectedRoleScope),
    ])
    const results = await Promise.allSettled([
      defaults,
      hierarchy,
      ...lightSteps.map(([, load]) => load()),
    ])
    for (const result of results)
      if (result.status === 'rejected')
        console.error('[AppCtx] Initial resource loading failed', result.reason)
    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    this.scope.applyInitialLayerPrisms(expectedRoleScope)
    await this.loadPinnedLayers(expectedRoleScope)
    await this.postLayerMutation(false, false, expectedRoleScope)

    if (!this.isExpectedRoleScopeCurrent(expectedRoleScope)) return

    const featureSteps = [
      ...(loadFeatures
        ? ([
            ['features', () => this.queries.refreshFeatures(false, expectedRoleScope)],
            [
              'properties',
              () => this.queries.refreshProperties(false, expectedRoleScope),
            ],
          ] as const)
        : []),
      ...(includeUserData
        ? ([
            [
              'tasks',
              () =>
                this.isAdmin() ? this.queries.refreshTasks(false) : Promise.resolve(),
            ],
          ] as const)
        : []),
    ] as const

    for (const [label, load] of featureSteps) {
      try {
        void load().catch(error =>
          console.error(`[AppCtx] ${label} loading failed`, error),
        )
      } catch (error) {
        console.error(
          `[AppCtx][initialFetch] Resource bootstrap failed (${label}):`,
          error,
        )
      }
    }
  }
}

// Keep providers and consumers on the same key across development module reloads.
export const APPCTX_KEY = Symbol.for('hype.context.public-app')

/**
 * Provides a public app instance under its layout.
 * @param divisionCtx Public place/filter state.
 * @param account Root-owned session and profile state.
 * @param responsiveCtx Shared viewport state.
 * @param cacheCtx Root-owned resource retention.
 * @returns The public application context.
 */
export function setAppCtx(
  divisionCtx: DivisionCtx,
  account: AccountState,
  responsiveCtx: ResponsiveCtx,
  cacheCtx = new CacheCtx(mapResourceProviders),
): AppCtx {
  const context = new AppCtx(divisionCtx, account, responsiveCtx, cacheCtx)
  setSurfaceNavigation(context.navigation)
  setSurfaceCtx(context)
  return setContext(APPCTX_KEY, context)
}

/** Returns the public application context. @returns The public layout's instance. */
export function getAppCtx(): AppCtx {
  const context = getContext<AppCtx | undefined>(APPCTX_KEY)
  if (!context)
    throw new Error('AppCtx is only available inside the public application layout')
  return context
}
