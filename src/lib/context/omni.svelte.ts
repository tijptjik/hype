// SVELTE
import { browser } from '$app/environment'
import { getContext, setContext, tick } from 'svelte'
// LIB
import { isMobile } from '$lib'
import { searchAllAsync } from '$lib/map/data'
// I18N
import { getI18n } from '$lib/i18n'
import { m } from '$lib/i18n'
// NEIGHBOURHOODS
import neighbourhoods from '$lib/map/neighbourhoods.json'
// NAVIGATION
import {
  COLLECTION_QUERY_PARAM,
  navigate,
  serializeCollectionDescriptor,
} from '$lib/navigation'
// ENUMS
import {
  FeatureCardMode,
  FirstClassResource,
  OmniCollection,
  OmniMode,
  PageState,
} from '$lib/enums'
// TYPES
import type {
  SearchResult,
  Id,
  ActiveCollection,
  FeatureCardTransitionRect,
  FeatureCardTransitionState,
  OmniState,
  Locale,
  LocaleKey,
  OmniCollectionDescriptor,
} from '$lib/types'
import type { AppCtx } from '$lib/context/app.svelte'
// TYPES
import type { CardCtx } from './card.svelte'
import type { Feature, FeatureFromCollection } from '$lib/db/zod/schema/feature.types'

// CONSTANTS
const MAX_RESULTS = 9

type OmniNavOptions = {
  paramsToDrop?: string[]
  paramsToAdd?: Record<string, string>
}

type OmniSelectionOptions = {
  activeFeatureId?: string
  openCard?: boolean
  openCardDelay?: number
  isCardOpen?: boolean
  focus?: boolean
  focusFeature?: boolean
  highlight?: boolean
  navOptions?: OmniNavOptions
}

type CollectionI18n = NonNullable<ActiveCollection>['i18n']

export class OmniCtx {
  // STATE must be initialized first
  state: OmniState = $state({
    mode: OmniMode.search,
    isTrayOpen: false,
    isCardOpen: false,
    searchTerm: '',
    focusedIndex: -1,
  })

  appCtx!: AppCtx
  cardCtx: CardCtx | null = null
  eventCleanup?: () => void
  pendingOpenCardTimeout: ReturnType<typeof setTimeout> | null = null

  pageState: PageState = $state(PageState.NoTransition)
  isIntentionallyClosing: boolean = $state(false)
  activeCollectionDescriptor: OmniCollectionDescriptor | null = $state(null)
  cardTransition: FeatureCardTransitionState = $state({
    phase: 'idle',
    sourceRect: null,
    targetRect: null,
    sourceRadiusPx: 0,
    targetRadiusPx: 0,
    sourceKind: 'none',
  })

  // Search results state (updated asynchronously)
  searchResults: Record<string, SearchResult[]> = $state({
    feature: [],
    neighbourhood: [],
    walk: [],
  })

  // Constructor with appCtx
  constructor(appCtx: AppCtx) {
    this.appCtx = appCtx

    // Effect to update search results when dependencies change
    $effect(() => {
      // Explicitly track all reactive dependencies
      const searchTerm = this.state.searchTerm
      this.appCtx.features.size // Track feature changes
      this.appCtx.state.userFeatures.wishlisted.length // Track wishlist changes

      // Schedule async update outside reactive context
      setTimeout(() => this.updateSearchResults(searchTerm), 0)
    })

    // Register custom event handlers
    this.registerEventHandlers()
  }

  // ═══════════════════════
  // EVENT HANDLERS
  // ═══════════════════════

  /**
   * Register custom event handlers for omni context operations
   */
  private registerEventHandlers() {
    if (!browser) return

    // Handler for opening card
    const handleOpenCard = (_event: CustomEvent) => {
      this.openCard()
    }

    // Handler for closing card
    const handleCloseCard = (_event: CustomEvent) => {
      this.closeCard()
    }

    // Register event listeners with namespace
    window.addEventListener('OmniCtx.openCard', handleOpenCard as EventListener)
    window.addEventListener('OmniCtx.closeCard', handleCloseCard as EventListener)

    // Store cleanup function for potential future use
    this.eventCleanup = () => {
      window.removeEventListener('OmniCtx.openCard', handleOpenCard as EventListener)
      window.removeEventListener('OmniCtx.closeCard', handleCloseCard as EventListener)
    }
  }

  // ═══════════════════════
  // MODE
  // ═══════════════════════

  isFeatureMode = $derived(this.state.mode === 'feature')
  isNewFeatureMode = $derived(this.state.mode === 'new-feature')
  isSearchMode = $derived(this.state.mode === 'search')
  isNavigationMode = $derived(this.state.mode === 'navigation')

  setMode(mode: OmniMode, options?: { openCard?: boolean; openCardDelay?: number }) {
    if (this.state.mode === mode) return
    this.state.mode = mode
    this.postModeMutation(mode, options)
  }

  postModeMutation(
    mode: OmniMode,
    options?: { openCard?: boolean; openCardDelay?: number },
  ) {
    const optionsWithDefaults = {
      openCard: true,
      openCardDelay: 2000,
      ...options,
    }
    if (mode === OmniMode.search) {
      this.closeCard()
    } else {
      this.closeTray()
      if (optionsWithDefaults.openCard) {
        this.cancelPendingOpenCard()
        this.pendingOpenCardTimeout = setTimeout(() => {
          this.openCard()
          this.pendingOpenCardTimeout = null
        }, optionsWithDefaults.openCardDelay)
      } else {
        this.cancelPendingOpenCard()
      }
    }
  }

  resetMode() {
    this.setMode(OmniMode.search)
  }

  // Cancel new-feature mode with full reset
  cancelNewFeature() {
    this.resetToSearch(false)
    this.appCtx.resetNewFeature()
    this.appCtx.resetActiveCollection()
    navigate('/', undefined, {
      paramsToDrop: [COLLECTION_QUERY_PARAM],
    })
  }

  // ═══════════════════════
  // SEARCH
  // ═══════════════════════

  limits: Record<OmniCollection, number> = $derived(
    this.getLimits(this.searchResults) || {
      feature: 5,
      neighbourhood: 3,
      walk: 1,
    },
  )

  // DERIVED
  totalResults = $derived(
    this.searchResults.feature.length +
      this.searchResults.neighbourhood.length +
      this.searchResults.walk.length,
  )

  setSearchTerm(term: string) {
    this.state.searchTerm = term
  }

  clearSearch() {
    this.state.searchTerm = ''
  }

  focusSearchBar() {
    if (!browser) return

    setTimeout(() => {
      const searchInput = document.getElementById('omni-search-bar') as HTMLElement
      searchInput?.focus()
    }, 50)
  }

  resetToSearch(navigateToRoot: boolean = true) {
    this.setMode(OmniMode.search)
    this.clearActiveCollectionDescriptor()
    this.appCtx.resetActiveCollection()
    this.clearSearch()
    if (navigateToRoot) {
      navigate('/', undefined, {
        paramsToDrop: [COLLECTION_QUERY_PARAM],
      })
    }
  }

  // Async method to update search results
  private async updateSearchResults(searchTerm: string) {
    try {
      const results = await searchAllAsync(searchTerm, this.appCtx)
      this.searchResults = this.toGroups(results)
    } catch (error) {
      console.error('Error updating search results:', error)
      this.searchResults = { feature: [], neighbourhood: [], walk: [] }
    }
  }

  searchHandlers: Record<OmniCollection, (ref: string) => void> = {
    feature: (featureId: Id) =>
      this.handleFeatureSelection(featureId, getStandardNavOptions()),
    neighbourhood: (neighbourhood: string) =>
      this.handleNeighbourhoodSelection(neighbourhood, {
        ...getStandardNavOptions(
          {},
          {
            kind: 'neighbourhood',
            ref: neighbourhood,
          },
        ),
        focusFeature: false,
        isCardOpen: true,
      }),
    walk: (walkId: string) =>
      this.handleWalkSelection(
        walkId,
        getStandardNavOptions(
          {},
          {
            kind: 'walk',
            ref: walkId,
          },
        ),
      ),
  }

  // ═══════════════════════
  // SEARCH :: UTILS
  // ═══════════════════════

  // Convert search results to groups
  toGroups(results: SearchResult[]) {
    return {
      walk: results.filter(r => r.collectionType === OmniCollection.walk),
      neighbourhood: results
        .filter(r => r.collectionType === OmniCollection.neighbourhood && r.count > 0)
        .sort((a, b) => b.count - a.count),
      feature: results.filter(r => r.collectionType === OmniCollection.feature),
    }
  }

  // Calculate limits for each group
  getLimits(groups: Record<OmniCollection, SearchResult[]>) {
    const nonEmptyGroups = Object.values(groups).filter(g => g.length > 0).length
    if (nonEmptyGroups === 0) return { walk: 0, neighbourhood: 0, feature: 0 }

    const baseLimit = Math.floor(MAX_RESULTS / nonEmptyGroups)
    const remainder = MAX_RESULTS % nonEmptyGroups

    return {
      walk: groups.walk.length > 0 ? baseLimit + (remainder > 0 ? 1 : 0) : 0,
      neighbourhood:
        groups.neighbourhood.length > 0 ? baseLimit + (remainder > 1 ? 1 : 0) : 0,
      feature: groups.feature.length > 0 ? baseLimit + (remainder > 2 ? 1 : 0) : 0,
    }
  }

  // ═══════════════════════
  // INTERACTION
  // ═══════════════════════

  // CLOSE METHODS
  close() {
    // If the card is open, close it
    if (this.state.isCardOpen) {
      // If the card is in new-feature mode, reset the new feature
      if (this.cardCtx?.isNewMode) {
        this.closeCard()
        this.resetToSearch()
        this.appCtx.setNewFeatureMode(null)
        // Delay the reset to allow the DOM to update and remove the card component
        tick().then(() => {
          this.isIntentionallyClosing = true
          this.appCtx.resetNewFeature()
          this.appCtx.resetActiveCollection()
          // this.focusSearchBar();
          // Reset the flag after reactive effects have had a chance to run
          tick().then(() => {
            this.isIntentionallyClosing = false
          })
        }) // Small delay to allow DOM cleanup
      } else if (!this.cardCtx?.isDisplayMode) {
        // If the card is in newPhoto modes, reset the featureCard

        // EMIT EVENT: Signal to Image Context to refresh images if record was published
        const refreshImagesEvent = new CustomEvent('refreshImages', {
          detail: {
            resourceType: 'feature',
            resourceId: this.appCtx.state.active.feature?.id,
          },
        })
        if (browser) {
          window.dispatchEvent(refreshImagesEvent)
        }
        // turn it into display mode
        this.cardCtx?.setMode(FeatureCardMode.Display)
      } else {
        this.closeCard()
      }
    } else if (this.state.mode === OmniMode.navigation) {
      // In collection mode, the second close clears the selected feature but keeps the collection.
      if (this.appCtx.getActiveFeature()) {
        this.closeTray()
        this.appCtx.resetActiveFeature()
        navigate('/', undefined, {
          paramsToDrop: [COLLECTION_QUERY_PARAM],
        })
        return
      }

      // A subsequent close exits collection mode entirely.
      this.resetToSearch()
    } else if (this.state.mode === OmniMode.feature) {
      this.resetToSearch()
      // We can be in new-feature mode if we are still pre-FeatureCard,
      // i.e. if we are showing the LayerSelctionModal or GeoLocationModal.
    } else if (this.state.mode === OmniMode.newFeature) {
      this.setMode(OmniMode.search)
      this.appCtx.resetNewFeature()
      this.appCtx.setNewFeatureMode(null)
      // If we are in search mode, close the tray
    } else if (this.state.mode === OmniMode.search && this.state.isTrayOpen) {
      this.closeTray()
    }
  }

  selectFirstResult() {
    if (this.searchResults.feature.length > 0) {
      this.handleFeatureSelection(this.searchResults.feature[0].ref)
    } else if (this.searchResults.neighbourhood.length > 0) {
      this.handleNeighbourhoodSelection(this.searchResults.neighbourhood[0].ref)
    } else if (this.searchResults.walk.length > 0) {
      this.handleWalkSelection(this.searchResults.walk[0].ref)
    }
  }

  async handleFeatureSelection(featureId: Id, options?: OmniSelectionOptions) {
    this.isIntentionallyClosing = false

    const optionsWithDefaults = {
      openCard: true,
      focus: false,
      focusFeature: true,
      highlight: true,
      ...options,
    }
    // Check if the feature is part of the active collection
    if (this.isFeatureInCollection(featureId)) {
      this.switchToFeatureInCollection(featureId, optionsWithDefaults)
      // Otherwise create a new single-feature collection
    } else {
      this.initFeature(featureId, optionsWithDefaults)
    }
  }

  handleWalkSelection(
    walkId: string,
    options?: Pick<OmniSelectionOptions, 'navOptions'>,
  ) {
    this.isIntentionallyClosing = false
    this.initWalk(walkId, options)
  }

  handleNeighbourhoodSelection(
    neighbourhood: string,
    options?: Pick<OmniSelectionOptions, 'focusFeature' | 'isCardOpen' | 'navOptions'>,
  ) {
    this.isIntentionallyClosing = false
    this.initNeighbourhood(neighbourhood, options)
  }

  // ═══════════════════════
  // TRAY
  // ═══════════════════════

  openTray() {
    this.state.isTrayOpen = true
  }

  closeTray() {
    this.state.isTrayOpen = false
    this.clearSearch()
  }

  toggleTray(event: Event) {
    event.preventDefault()
    event.stopPropagation()
    this.state.isTrayOpen ? this.closeTray() : this.openTray()
  }

  clearSearchOrCloseTray() {
    if (this.state.searchTerm !== '') {
      this.clearSearch()
    } else {
      this.closeTray()
    }
  }

  // ═══════════════════════
  // CARD
  // ═══════════════════════

  cancelPendingOpenCard() {
    if (this.pendingOpenCardTimeout !== null) {
      clearTimeout(this.pendingOpenCardTimeout)
      this.pendingOpenCardTimeout = null
    }

    this.appCtx.cancelPendingOpenCard?.()
  }

  /**
   * Reads a stable viewport rect for one transition endpoint.
   *
   * @param element DOM node to measure.
   * @returns Serializable viewport rect or `null` when measurement is unavailable.
   */
  private getCardTransitionRect(
    element: HTMLElement | null,
  ): FeatureCardTransitionRect | null {
    if (!browser || !element) {
      return null
    }

    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }

    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }

  /**
   * Measures the source radius so the FLIP animation can interpolate corners cleanly.
   *
   * @param element DOM node to inspect.
   * @returns Pixel border radius for the element's top-left corner.
   */
  private getCardTransitionRadiusPx(element: HTMLElement | null): number {
    if (!browser || !element) {
      return 0
    }

    const radiusPx = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius)
    return Number.isFinite(radiusPx) ? radiusPx : 0
  }

  /**
   * Resolves the hidden map-overlay toggle so close animations always have a destination rect.
   *
   * @returns Toggle wrapper element or `null` when unavailable.
   */
  private getCardToggleElement(): HTMLElement | null {
    if (!browser) {
      return null
    }

    return document.getElementById('map-overlay-card-toggle')
  }

  /**
   * Resets the transient card FLIP animation state.
   *
   * @returns Nothing.
   */
  resetCardTransition(): void {
    this.cardTransition.phase = 'idle'
    this.cardTransition.sourceRect = null
    this.cardTransition.targetRect = null
    this.cardTransition.sourceRadiusPx = 0
    this.cardTransition.targetRadiusPx = 0
    this.cardTransition.sourceKind = 'none'
  }

  /**
   * Records the map-overlay toggle as the next card-open origin.
   *
   * @param element Button or wrapper element that launched the card.
   * @returns Nothing.
   */
  prepareCardTransitionFromToggle(element?: HTMLElement | null): void {
    const sourceElement = element ?? this.getCardToggleElement()

    this.cardTransition.phase = 'idle'
    this.cardTransition.sourceRect = this.getCardTransitionRect(sourceElement)
    this.cardTransition.targetRect = null
    this.cardTransition.sourceRadiusPx = this.getCardTransitionRadiusPx(sourceElement)
    this.cardTransition.targetRadiusPx = 0
    this.cardTransition.sourceKind = 'toggle'
  }

  /**
   * Records a feature marker as the next card-open origin.
   *
   * @param featureId Active feature id associated with the marker.
   * @param element Marker element captured from the click target, when available.
   * @returns Nothing.
   */
  prepareCardTransitionFromMarker(featureId: Id, element?: HTMLElement | null): void {
    const sourceElement =
      element ??
      (this.appCtx.state.markers.get(featureId)?.getElement() as HTMLElement | null)

    this.cardTransition.phase = 'idle'
    this.cardTransition.sourceRect = this.getCardTransitionRect(sourceElement)
    this.cardTransition.targetRect = null
    this.cardTransition.sourceRadiusPx = this.getCardTransitionRadiusPx(sourceElement)
    this.cardTransition.targetRadiusPx = 0
    this.cardTransition.sourceKind = 'marker'
  }

  /**
   * Finalizes an opening FLIP transition once the card shell reaches its resting geometry.
   *
   * @returns Nothing.
   */
  finishCardOpenTransition(): void {
    this.cardTransition.phase = 'idle'
    this.cardTransition.targetRect = null
    this.cardTransition.targetRadiusPx = 0
  }

  /**
   * Finalizes a close transition and advances deferred navigation when needed.
   *
   * @returns Nothing.
   */
  finishCardCloseTransition(): void {
    this.state.isCardOpen = false

    if (
      this.pageState === PageState.Transitioning ||
      this.pageState === PageState.NeedTransition
    ) {
      this.pageState = PageState.ReadyToNav
      this.resetToSearch(false)
    }

    this.resetCardTransition()
  }

  openCard() {
    if (this.state.isCardOpen) {
      return
    }

    this.cardTransition.phase = this.cardTransition.sourceRect ? 'opening' : 'idle'
    this.state.isCardOpen = true
  }

  closeCard() {
    this.cancelPendingOpenCard()

    if (!this.state.isCardOpen) {
      this.finishCardCloseTransition()
      return
    }

    const targetElement = this.getCardToggleElement()
    const targetRect = this.getCardTransitionRect(targetElement)

    if (!targetRect) {
      this.finishCardCloseTransition()
      return
    }

    if (this.pageState === PageState.NeedTransition) {
      this.pageState = PageState.Transitioning
    }

    this.cardTransition.phase = 'closing'
    this.cardTransition.targetRect = targetRect
    this.cardTransition.targetRadiusPx = this.getCardTransitionRadiusPx(targetElement)
  }

  toggleCard() {
    if (this.state.isCardOpen) {
      this.closeCard()
      return
    }

    this.cancelPendingOpenCard()
    this.openCard()
  }

  setCardCtx(cardCtx: CardCtx) {
    this.cardCtx = cardCtx
  }

  isCardOpen = $derived(this.state.isCardOpen)
  isCardOpeningPending = $derived(
    this.cardTransition.sourceKind === 'marker' &&
      (!this.state.isCardOpen || this.cardTransition.phase === 'opening'),
  )

  // ═══════════════════════
  // NAVIGATION
  // ═══════════════════════

  navIndex = $derived(
    this.appCtx.state.active.collection?.items.findIndex(
      item => item.id === this.appCtx.state.active.feature?.id,
    ) ?? -1,
  )

  navTitle = $derived(
    this.state.mode === 'search'
      ? `Search Results: ${this.state.searchTerm}`
      : this.appCtx.state.active.collection
        ? getI18n(
            this.appCtx.state.active.collection.i18n as Record<
              Locale | LocaleKey,
              { name: string }
            >,
            'name',
            this.appCtx.getUserPreferences(),
          )
        : '',
  )

  navNext() {
    navigateCollection(this, 'next')
  }

  navPrevious() {
    navigateCollection(this, 'previous')
  }

  navToIndex(index: number) {
    navigateCollection(this, index)
  }

  // ═══════════════════════
  // NEW INITIALIZATION API
  // ═══════════════════════

  /**
   * Initialize a collection - sets active collection, activates a feature, and sets mode to navigation
   */
  initSelection(updateUrl: boolean = true) {
    // If we are on mobile, close all panels
    // otherwise the selected feature will be hidden behind the panel
    if (isMobile()) {
      this.appCtx.closeAllPanels(updateUrl)
    }
  }

  initNeighbourhood(neighbourhoodRef: string, options?: OmniSelectionOptions): void {
    this.setActiveCollectionDescriptor({
      kind: 'neighbourhood',
      ref: neighbourhoodRef,
    })

    const optionsWithDefaults = getCollectionInitDefaults({
      ...getStandardNavOptions(
        {},
        {
          kind: 'neighbourhood',
          ref: neighbourhoodRef,
        },
      ),
      isCardOpen: this.state.isCardOpen,
      ...options,
    })

    const featuresIds =
      this.appCtx.placeCtx.getFeaturesForNeighbourhood(neighbourhoodRef) ?? []
    const features = featuresIds.map(id =>
      this.appCtx.getResourceByIdSync(FirstClassResource.feature, id),
    ) as (FeatureFromCollection | Feature)[]
    const collection = this.toNeighbourhoodCollection(neighbourhoodRef, features)

    initializeCollection(this, collection, OmniMode.navigation, optionsWithDefaults)
  }

  initWalk(
    walkRef: string,
    options?: OmniSelectionOptions,
    items?: (FeatureFromCollection | Feature)[],
    customI18n?: Record<Locale, string>,
  ): void {
    this.setActiveCollectionDescriptor({
      kind: 'walk',
      ref: walkRef,
    })

    const optionsWithDefaults = {
      ...getStandardNavOptions(
        {},
        {
          kind: 'walk',
          ref: walkRef,
        },
      ),
      openCard: true,
      openCardDelay: 3000,
      isCardOpen: this.state.isCardOpen,
      focus: true,
      focusFeature: true,
      highlight: true,
      ...options,
    }
    // Run the default selection initialization
    this.initSelection(false)
    let collection = null
    if (walkRef === 'stars') {
      collection = this.toWalkCollection(walkRef, this.appCtx.getWishlistedFeatures())
    } else if (walkRef === 'visited') {
      collection = this.toWalkCollection(walkRef, this.appCtx.getVisitedFeatures())
    } else if (walkRef.endsWith('Features') && items && customI18n) {
      collection = this.toWalkCollection(walkRef, items, customI18n)
    } else if (walkRef.endsWith('Images') && items && customI18n) {
      collection = this.toWalkCollection(walkRef, items, customI18n)
    }
    // Set the active collection on appCtx
    this.appCtx.setActiveCollection(collection, optionsWithDefaults)
    // Set mode to navigation
    this.setMode(OmniMode.navigation)
  }

  /**
   * Initializes a collection from a serializable descriptor.
   *
   * @param descriptor - URL-backed collection identity.
   * @param options - Initialization options to merge into the collection flow.
   * @returns Whether the descriptor could be resolved.
   */
  initCollectionFromDescriptor(
    descriptor: OmniCollectionDescriptor,
    options?: OmniSelectionOptions,
  ): boolean {
    if (descriptor.kind === 'neighbourhood') {
      this.initNeighbourhood(descriptor.ref, options)
      return true
    }

    if (descriptor.kind === 'walk') {
      this.initWalk(descriptor.ref, options)
      return true
    }

    return false
  }

  /**
   * Initialize a single feature - sets active feature and mode to 'feature'
   * Adds layer to the prisms if not yet selected
   */
  async initFeature(featureId: Id, options?: OmniSelectionOptions): Promise<void> {
    this.clearActiveCollectionDescriptor()

    const standaloneNavOptions = getStandardNavOptions().navOptions

    const optionsWithDefaults = {
      openCard: true,
      openCardDelay: 0,
      isCardOpen: this.state.isCardOpen,
      focus: false,
      focusFeature: true,
      highlight: true,
      ...options,
      navOptions: {
        ...standaloneNavOptions,
        ...(options?.navOptions ?? {}),
        paramsToDrop: Array.from(
          new Set([
            ...(standaloneNavOptions?.paramsToDrop ?? []),
            ...(options?.navOptions?.paramsToDrop ?? []),
          ]),
        ),
      },
    }
    // Run the default selection initialization
    this.initSelection()

    // Get the feature first
    const feature = await this.appCtx.getFeatureById(featureId)
    if (!feature) {
      console.error('Feature not found:', featureId)
      return
    }

    // Ensure that the layer is active on the map
    if (!this.appCtx.isPrism(FirstClassResource.layer, feature.layerId)) {
      this.appCtx.addLayer(feature.layerId)
    }

    this.appCtx.setActiveCollection(
      this.toFeatureCollection(feature),
      optionsWithDefaults,
    )

    // Set mode to feature
    this.setMode(OmniMode.feature)
  }

  /**
   * Switch to a different feature within the current collection
   */
  switchToFeatureInCollection(
    featureId: Id,
    options: Pick<
      OmniSelectionOptions,
      'openCard' | 'openCardDelay' | 'focus' | 'navOptions'
    >,
  ): boolean {
    const optionsWithDefaults = {
      isCardOpen: this.state.isCardOpen,
      openCard: true,
      openCardDelay: 2000,
      focus: true,
      ...options,
    }
    if (!this.isFeatureInCollection(featureId)) return false
    this.appCtx.setActiveFeature(featureId, optionsWithDefaults)
    return true
  }

  // ═══════════════════════
  // HELPER METHODS
  // ═══════════════════════

  /**
   * Check if a collection is currently initialized
   */
  isCollectionInitialized(collectionId: Id): boolean {
    const activeCollection = this.appCtx.getActiveCollection()
    if (!activeCollection) return false
    return activeCollection.id === collectionId
  }

  /**
   * Check if a specific feature is currently initialized as active
   */
  isFeatureInitialized(featureId: Id): boolean {
    const activeFeature = this.appCtx.getActiveFeature()
    if (!activeFeature) return false
    return activeFeature.id === featureId
  }

  /**
   * Check if a specific feature is part of the current collection
   */
  isFeatureInCollection(featureId: Id): boolean {
    const activeCollection = this.appCtx.getActiveCollection()
    if (!activeCollection) return false
    return activeCollection.items.some(item => item.id === featureId)
  }

  /**
   * Check if the current page represents a "cold start" (no existing navigation context)
  // Cold start if:
  // 1. No active collection, OR
  // 2. Active feature doesn't match the requested feature, OR
  // 3. Feature not in current collection
   */
  isColdStart(featureId: Id): boolean {
    const activeCollection = this.appCtx.getActiveCollection()
    const activeFeature = this.appCtx.getActiveFeature()

    if (!activeCollection) return true
    if (!activeFeature || activeFeature.id !== featureId) return true

    const featureInCollection = activeCollection.items.some(
      item => item.id === featureId,
    )
    return !featureInCollection
  }

  // ═══════════════════════
  // COLLECTION HELPERS
  // ═══════════════════════

  /**
   * Creates a single-feature collection from a feature
   */
  toFeatureCollection(feature: FeatureFromCollection | Feature): ActiveCollection {
    // Get user preferences for i18n, with fallback for static usage
    const userPreferences = {
      ...this.appCtx.getUserPreferences(),
      fallbackLocales: ['en'] as Locale[],
      preferFallbackInCurrentLocale: false,
      allowMachineTranslation: true,
    }

    const address =
      getI18n(feature, 'displayAddress', userPreferences) || 'Unknown Location'

    return {
      id: feature.id,
      type: OmniCollection.feature,
      i18n: {
        en: {
          name: address.replace(', Hong Kong', '').replace(', Hong Kong Island', ''),
        },
        'zh-hant': { name: address },
        'zh-hans': { name: address },
      },
      items: [feature],
    }
  }

  /**
   * Creates a walk collection (e.g., starred features, user collections)
   */
  toWalkCollection(
    walkRef: string,
    items: (FeatureFromCollection | Feature)[],
    customI18n?: Record<Locale, string>,
  ): ActiveCollection {
    // Default i18n for special walks
    let i18nConfig: CollectionI18n

    if (walkRef === 'stars') {
      i18nConfig = {
        en: { name: m.omni__title_star_walks() },
        'zh-hant': { name: m.omni__title_star_walks() },
        'zh-hans': { name: m.omni__title_star_walks() },
      }
    } else if (walkRef === 'visited') {
      i18nConfig = {
        en: { name: m.omni__title_visited_walks() },
        'zh-hant': { name: m.omni__title_visited_walks() },
        'zh-hans': { name: m.omni__title_visited_walks() },
      }
    } else if (customI18n) {
      i18nConfig = {
        en: { name: customI18n.en },
        'zh-hant': { name: customI18n['zh-hant'] },
        'zh-hans': { name: customI18n['zh-hans'] },
      }
    } else {
      // Fallback for unknown walk types
      i18nConfig = {
        en: { name: walkRef },
        'zh-hant': { name: walkRef },
        'zh-hans': { name: walkRef },
      }
    }

    return {
      type: 'walk',
      id: walkRef,
      i18n: i18nConfig,
      items,
    }
  }

  /**
   * Creates a neighbourhood collection from neighbourhood name and features
   */
  toNeighbourhoodCollection(
    neighbourhood: string,
    features: (FeatureFromCollection | Feature)[],
  ): ActiveCollection {
    const selectedNeighbourhood =
      neighbourhoods[neighbourhood as keyof typeof neighbourhoods]

    return {
      id: neighbourhood,
      type: 'neighbourhood',
      i18n: {
        en: { name: neighbourhood },
        'zh-hant': {
          name: selectedNeighbourhood?.i18n?.zhHant?.name || neighbourhood,
        },
        'zh-hans': {
          name: selectedNeighbourhood?.i18n?.zhHans?.name || neighbourhood,
        },
      },
      items: features,
    }
  }

  toContributedFeaturesCollection(
    username: string,
    features: (FeatureFromCollection | Feature)[],
    projectId: Id,
    projectName: string,
  ): ActiveCollection {
    return {
      id: `${username}${projectId}Features`,
      type: 'walk',
      i18n: {
        en: { name: `${projectName} by ${username}` },
        'zh-hant': { name: `貢獻者 ${username}` },
        'zh-hans': { name: `贡献者 ${username}` },
      },
      items: features as (FeatureFromCollection | Feature)[],
    }
  }

  setActiveCollectionDescriptor(descriptor: OmniCollectionDescriptor | null): void {
    this.activeCollectionDescriptor = descriptor
  }

  clearActiveCollectionDescriptor(): void {
    this.activeCollectionDescriptor = null
  }
}

// ═══════════════════════
// UTILS :: REFACTORED COMMON PATTERNS
// ═══════════════════════

/**
 * Merge options with defaults for omni navigation
 * @param options - Options to merge
 * @param defaults - Default values
 * @returns Merged options
 */
const mergeOmniOptions = <T extends Record<string, unknown>>(
  options: Partial<T> = {},
  defaults: T,
): T => {
  return {
    ...defaults,
    ...options,
  }
}

/**
 * Resolves the query-param descriptor for a collection-backed navigation context.
 *
 * @param descriptor - Explicit collection descriptor when already known.
 * @returns Query-param payload or `null` for standalone feature navigation.
 */
const getCollectionParamValue = (
  descriptor: OmniCollectionDescriptor | null,
): string | null => {
  if (!descriptor) {
    return null
  }

  return serializeCollectionDescriptor(descriptor)
}

/**
 * Extracts a serializable descriptor from the active collection when possible.
 *
 * @param collection - Active collection to inspect.
 * @returns Collection descriptor or `null` for standalone collections.
 */
const getCollectionDescriptorFromActiveCollection = (
  collection: ActiveCollection,
): OmniCollectionDescriptor | null => {
  if (!collection) {
    return null
  }

  if (collection.type === 'neighbourhood' || collection.type === 'walk') {
    return {
      kind: collection.type,
      ref: collection.id,
    }
  }

  return null
}

/**
 * Standard navigation options with image parameter drop and collection context sync.
 *
 * @param additionalOptions - Additional options to merge
 * @param descriptor - Collection descriptor to preserve in the URL.
 * @returns Navigation options object
 */
const getStandardNavOptions = (
  additionalOptions: OmniNavOptions = {},
  descriptor: OmniCollectionDescriptor | null = null,
): Pick<OmniSelectionOptions, 'navOptions'> => {
  const paramsToDrop = Array.from(
    new Set([
      'imageId',
      ...(descriptor ? [] : [COLLECTION_QUERY_PARAM]),
      ...(additionalOptions.paramsToDrop ?? []),
    ]),
  )
  const paramsToAdd = { ...(additionalOptions.paramsToAdd ?? {}) }
  const collectionParamValue = getCollectionParamValue(descriptor)

  if (collectionParamValue) {
    paramsToAdd[COLLECTION_QUERY_PARAM] = collectionParamValue
  }

  return {
    navOptions: {
      ...additionalOptions,
      paramsToDrop,
      paramsToAdd,
    },
  }
}

/**
 * Standard collection initialization options
 * @param customOptions - Custom options to override defaults
 * @returns Collection initialization options
 */
const getCollectionInitDefaults = (
  customOptions: Partial<OmniSelectionOptions> = {},
): OmniSelectionOptions => {
  return mergeOmniOptions(customOptions, {
    openCard: true,
    openCardDelay: 2500,
    focus: true,
    focusFeature: true,
    highlight: true,
  })
}

/**
 * Create i18n configuration for collections
 * @param type - Type of collection ('walk', 'neighbourhood', 'feature')
 * @param identifier - Identifier for the collection
 * @param customI18n - Custom i18n overrides
 * @returns i18n configuration object
 */
const _createCollectionI18n = (
  type: 'walk' | 'neighbourhood' | 'feature',
  identifier: string,
  customI18n?: Record<Locale, string>,
): Record<Locale, { name: string }> => {
  if (customI18n) {
    return {
      en: { name: customI18n.en },
      'zh-hant': { name: customI18n['zh-hant'] },
      'zh-hans': { name: customI18n['zh-hans'] },
    }
  }

  // Default i18n for special collections
  if (type === 'walk') {
    if (identifier === 'stars') {
      return {
        en: { name: m.omni__title_star_walks() },
        'zh-hant': { name: m.omni__title_star_walks() },
        'zh-hans': { name: m.omni__title_star_walks() },
      }
    } else if (identifier === 'visited') {
      return {
        en: { name: m.omni__title_visited_walks() },
        'zh-hant': { name: m.omni__title_visited_walks() },
        'zh-hans': { name: m.omni__title_visited_walks() },
      }
    }
  }

  // Fallback
  return {
    en: { name: identifier },
    'zh-hant': { name: identifier },
    'zh-hans': { name: identifier },
  }
}

/**
 * Generic navigation method for next/previous/index
 * @param omniCtx - Omni context instance
 * @param direction - Direction to navigate ('next', 'previous', or index number)
 * @returns Success of navigation
 */
const navigateCollection = (
  omniCtx: OmniCtx,
  direction: 'next' | 'previous' | number,
): boolean => {
  const collection = omniCtx.appCtx.state.active.collection
  if (!collection) return false
  const collectionDescriptor =
    omniCtx.activeCollectionDescriptor ??
    getCollectionDescriptorFromActiveCollection(collection)

  const currentIndex = omniCtx.navIndex
  let targetIndex: number

  if (direction === 'next') {
    if (currentIndex >= collection.items.length - 1) return false
    targetIndex = currentIndex + 1
  } else if (direction === 'previous') {
    if (currentIndex <= 0) return false
    targetIndex = currentIndex - 1
  } else {
    // direction is index number
    if (direction < 0 || direction >= collection.items.length) return false
    targetIndex = direction
  }

  omniCtx.setMode(OmniMode.navigation, { openCard: false })
  omniCtx.closeTray()
  omniCtx.appCtx.setActiveFeature(collection.items[targetIndex].id, {
    focus: true,
    isCardOpen: omniCtx.state.isCardOpen,
    ...getStandardNavOptions({}, collectionDescriptor),
  })

  return true
}

/**
 * Standard initialization flow for collections
 * @param omniCtx - Omni context instance
 * @param collection - Collection to initialize
 * @param mode - Mode to set after initialization
 * @param options - Options for initialization
 */
const initializeCollection = (
  omniCtx: OmniCtx,
  collection: ActiveCollection,
  mode: OmniMode,
  options: OmniSelectionOptions = {},
): void => {
  // Run the default selection initialization
  omniCtx.initSelection(false)

  // Set the active collection on appCtx
  omniCtx.appCtx.setActiveCollection(collection, options)

  // Set mode
  omniCtx.setMode(mode, options)
}

export const OMNI_CONTEXT_KEY = Symbol('omniContext')

export const setOmniCtx = (appCtx: AppCtx) =>
  setContext(OMNI_CONTEXT_KEY, new OmniCtx(appCtx))

export const getOmniCtx = (): OmniCtx => {
  const ctx = getContext<OmniCtx | undefined>(OMNI_CONTEXT_KEY)
  if (!ctx) {
    // Return a safe fallback object when OmniContext isn't ready
    return {
      state: {
        mode: 'search',
        isTrayOpen: false,
        isCardOpen: false,
        searchTerm: '',
        focusedIndex: -1,
      },
      searchResults: {
        feature: [],
        neighbourhood: [],
        walk: [],
      },
      pageState: PageState.NoTransition,
      isIntentionallyClosing: false,
      isCardOpeningPending: false,
      activeCollectionDescriptor: null,
      cardTransition: {
        phase: 'idle',
        sourceRect: null,
        targetRect: null,
        sourceRadiusPx: 0,
        targetRadiusPx: 0,
        sourceKind: 'none',
      },
      cardCtx: null,
      appCtx: null,
      eventCleanup: undefined,
      limits: { feature: 5, neighbourhood: 3, walk: 1 },
      isFeatureMode: false,
      isNewFeatureMode: false,
      isSearchMode: true,
      isNavigationMode: false,
      totalResults: 0,
      navIndex: -1,
      navTitle: '',
      isCardOpen: false,
      // No-op methods
      setMode: () => {},
      postModeMutation: () => {},
      resetMode: () => {},
      cancelNewFeature: () => {},
      setSearchTerm: () => {},
      clearSearch: () => {},
      focusSearchBar: () => {},
      resetToSearch: () => {},
      setActiveCollectionDescriptor: () => {},
      clearActiveCollectionDescriptor: () => {},
      searchHandlers: {} as Record<OmniCollection, (ref: string) => void>,
      toGroups: () => ({ feature: [], neighbourhood: [], walk: [] }),
      getLimits: () => ({ feature: 5, neighbourhood: 3, walk: 1 }),
      close: () => {},
      selectFirstResult: () => {},
      handleFeatureSelection: () => Promise.resolve(),
      handleWalkSelection: () => {},
      handleNeighbourhoodSelection: () => {},
      openTray: () => {},
      closeTray: () => {},
      toggleTray: () => {},
      clearSearchOrCloseTray: () => {},
      resetCardTransition: () => {},
      prepareCardTransitionFromToggle: () => {},
      prepareCardTransitionFromMarker: () => {},
      finishCardOpenTransition: () => {},
      finishCardCloseTransition: () => {},
      openCard: () => {},
      closeCard: () => {},
      toggleCard: () => {},
      setCardCtx: () => {},
      navNext: () => {},
      navPrevious: () => {},
      navToIndex: () => {},
      initSelection: () => {},
      initNeighbourhood: () => {},
      initWalk: () => {},
      initFeature: () => Promise.resolve(),
      switchToFeatureInCollection: () => false,
      isCollectionInitialized: () => false,
      isFeatureInitialized: () => false,
      isFeatureInCollection: () => false,
      isColdStart: () => false,
      toFeatureCollection: () => ({}) as ActiveCollection,
      toWalkCollection: () => ({}) as ActiveCollection,
      toNeighbourhoodCollection: () => ({}) as ActiveCollection,
      toContributedFeaturesCollection: () => ({}) as ActiveCollection,
      dispatchOpenCard: () => {},
      dispatchCloseCard: () => {},
      registerEventHandlers: () => {},
      updateSearchResults: () => Promise.resolve(),
    } as unknown as OmniCtx
  }
  return ctx
}
