// SVELTE
import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
// LIB
import { MOBILE_MAX_WIDTH } from '$lib';
import { searchAllAsync } from '$lib/map/data';
// I18N
import { getI18n } from '$lib/i18n';
import { m } from '$lib/i18n';
// NEIGHBOURHOODS
import neighbourhoods from '$lib/map/neighbourhoods.json';
// ENUMS
import { FeatureCardMode } from '$lib/enums';
// TYPES
import type { SearchResult, Id } from '$lib/types';
import type { AppCtx } from '$lib/context/app.svelte';
// TYPES
import type { FeatureCardContext } from './featureCard.svelte';
type OmniMode = 'search' | 'navigation' | 'feature' | 'new-feature';

type OmniState = {
  // Mode -- search, navigation, or feature
  mode: OmniMode;
  // Whether the results are shown
  isTrayOpen: boolean;
  // Whether the card is open
  isCardOpen: boolean;
  // The value of the search input
  searchTerm: string;
  // The index of the focused result
  focusedIndex: number;
};

// ENUMS
export enum PageState {
  NoTransition,
  NeedTransition,
  Transitioning,
  ReadyToNav
}

// CONSTANTS
const MAX_RESULTS = 9;

export class OmniContext {
  // STATE must be initialized first
  state: OmniState = $state({
    mode: 'search',
    isTrayOpen: false,
    isCardOpen: false,
    searchTerm: '',
    focusedIndex: -1
  });

  cardCtx: FeatureCardContext | null = null;

  appCtx!: AppCtx;
  pageState: PageState = $state(PageState.NoTransition);
  isIntentionallyClosing: boolean = $state(false);

  // Search results state (updated asynchronously)
  searchResults: Record<string, SearchResult[]> = $state({
    features: [],
    neighbourhoods: [],
    walks: []
  });

  // Constructor with appCtx
  constructor(appCtx: AppCtx) {
    this.appCtx = appCtx;

    // Effect to update search results when dependencies change
    $effect(() => {
      // Explicitly track all reactive dependencies
      const searchTerm = this.state.searchTerm;
      const featuresSize = this.appCtx.features.size; // Track feature changes
      const userFeaturesWishlisted = this.appCtx.state.userFeatures.wishlisted.length; // Track wishlist changes

      // Schedule async update outside reactive context
      setTimeout(() => this.updateSearchResults(searchTerm), 0);
    });
  }

  // Async method to update search results
  private async updateSearchResults(searchTerm: string) {
    try {
      const results = await searchAllAsync(searchTerm, this.appCtx);
      this.searchResults = this.toGroups(results);
    } catch (error) {
      console.error('Error updating search results:', error);
      this.searchResults = { features: [], neighbourhoods: [], walks: [] };
    }
  }

  // MAPS
  searchHandlers = {
    features: (featureId: Id) => this.handleFeatureSelection(this.appCtx, featureId),
    neighbourhoods: (neighbourhood: string) =>
      this.handleNeighbourhoodSelection(this.appCtx, neighbourhood),
    walks: (walkId: string) => this.handleWalkSelection(this.appCtx, walkId)
  };

  // DERIVED
  limits: Record<string, number> = $derived(
    this.getLimits(this.searchResults) || {
      features: 5,
      neighbourhoods: 3,
      walks: 1
    }
  );

  // DERIVED
  isFeatureMode = $derived(this.state.mode === 'feature');
  isNewFeatureMode = $derived(this.state.mode === 'new-feature');
  isSearchMode = $derived(this.state.mode === 'search');
  isNavigationMode = $derived(this.state.mode === 'navigation');

  // DERIVED
  totalResults = $derived(
    this.searchResults.features.length +
      this.searchResults.neighbourhoods.length +
      this.searchResults.walks.length
  );

  // DERIVED
  navIndex = $derived(
    this.appCtx.state.active.collection?.items.findIndex(
      (item) => item.id === this.appCtx.state.active.feature?.id
    ) ?? -1
  );

  // SEARCH METHODS
  setSearchTerm(term: string) {
    this.state.searchTerm = term;
  }

  clearSearch() {
    this.state.searchTerm = '';
  }

  focusSearchBar() {
    setTimeout(() => {
      const searchInput = document.getElementById('omni-search-bar') as HTMLElement;
      searchInput?.focus();
    }, 50);
  }

  // MODE METHODS
  setMode(mode: OmniMode) {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    if (mode === 'search') {
      this.closeCard();
      this.openTray();
    } else if (mode === 'feature') {
      this.closeTray();
      this.openCard();
    } else if (mode === 'new-feature') {
      this.closeTray();
    }
  }

  resetMode() {
    this.state.mode = 'search';
  }

  // Cancel new-feature mode with full reset
  cancelNewFeature() {
    this.resetMode();
    this.clearSearch();
    this.appCtx.resetNewFeature();
    this.appCtx.resetActiveCollection();
    goto('/');
  }

  // CLOSE METHODS
  close() {
    // If the card is open, close it
    if (this.state.isCardOpen) {
      // If the card is in new-feature mode, reset the new feature
      if (this.cardCtx?.isNewMode) {
        this.closeCard();
        this.setMode('search');
        this.clearSearch();
        goto('/');
        // Delay the reset to allow the DOM to update and remove the card component
        setTimeout(() => {
          this.isIntentionallyClosing = true;
          this.appCtx.resetNewFeature();
          this.appCtx.resetActiveCollection();
          this.focusSearchBar();
          // Reset the flag after reactive effects have had a chance to run
          setTimeout(() => {
            this.isIntentionallyClosing = false;
          }, 0);
        }, 50); // Small delay to allow DOM cleanup
      } else if (!this.cardCtx?.isDisplayMode) {
        // If the card is in missing mode, turn it into display mode
        this.cardCtx?.setMode(FeatureCardMode.Display);
      } else {
        this.closeCard();
      }

      // If there is no card, but the tray is open, close the tray
    } else if (this.state.mode === 'navigation' && this.state.isTrayOpen) {
      this.closeTray();
      // If we are in navigation mode, reset the results and go back to search
    } else if (this.state.mode === 'navigation') {
      this.clearSearch();
      this.setMode('search');
      goto('/');

      // If we are in feature, without a card, reset the search
    } else if (this.state.mode === 'feature') {
      this.clearSearch();
      this.setMode('search');
      this.focusSearchBar();
      goto('/');

      // We can be in new-feature mode if we are still pre-FeatureCard,
      // i.e. if we are showing the LayerSelctionModal or GeoLocationModal.
    } else if (this.state.mode === 'new-feature') {
      const closeLayerEvent = new CustomEvent('closeLayerSelectionModal');
      window.dispatchEvent(closeLayerEvent);
      const closeLocationEvent = new CustomEvent('closeGeoLocationModal');
      window.dispatchEvent(closeLocationEvent);
      // If we are in search mode, close the card
    } else if (this.state.mode === 'search' && this.state.isTrayOpen) {
      this.closeTray();
    }
  }

  selectFirstResult() {
    if (this.searchResults.features.length > 0) {
      this.handleFeatureSelection(this.appCtx, this.searchResults.features[0].ref);
    } else if (this.searchResults.neighbourhoods.length > 0) {
      this.handleNeighbourhoodSelection(
        this.appCtx,
        this.searchResults.neighbourhoods[0].ref
      );
    } else if (this.searchResults.walks.length > 0) {
      this.handleWalkSelection(this.appCtx, this.searchResults.walks[0].ref);
    }
  }

  async handleFeatureSelection(
    appCtx: AppCtx,
    featureId: Id,
    options: {
      openCard: boolean;
    } = { openCard: false }
  ) {
    // If we are on mobile, close all panels
    // otherwise the selected feature will be hidden behind the panel
    if (window.innerWidth < MOBILE_MAX_WIDTH) {
      appCtx.closeAllPanels();
    }

    // Wait for features to be loaded if they haven't been yet
    if (appCtx.state.resources.feature.length === 0) {
      await appCtx.queryClient.fetchQuery({
        queryKey: appCtx.featuresQueryKey,
        queryFn: appCtx.featuresQueryFn
      });
    }

    let feature = await appCtx.getFeatureById(featureId);
    if (feature == null) {
      console.error('Feature not found:', featureId);
      return;
    }

    // Check if the feature is part of the active collection
    const activeCollection = appCtx.getActiveCollection();
    if (activeCollection) {
      const featureIndex = activeCollection.items.findIndex(
        (item) => item.id === featureId
      );
      if (featureIndex !== -1) {
        // Feature is in the current collection, just update the active index
        appCtx.setActiveFeature(featureId, {
          focus: true
        });
        if (options.openCard) {
          this.openCard();
        }
        return;
      }
    }

    // If we get here, feature wasn't in the active collection, create a new single-feature collection
    let address = getI18n(feature, 'displayAddress', appCtx.getUserPreferences());

    appCtx.setActiveCollection(
      {
        id: featureId,
        type: 'feature',
        i18n: {
          en: {
            name: address.replace(', Hong Kong', '').replace(', Hong Kong Island', '')
          },
          'zh-hant': { name: address },
          'zh-hans': { name: address }
        },
        items: [feature]
      },
      {
        activateFirst: true,
        focusFirst: false,
        highlight: true,
        focus: false
      }
    );
    this.setMode('feature');
    goto(`/features/${featureId}`);
    if (options.openCard) {
      this.openCard();
    }
  }

  handleWalkSelection(appCtx: AppCtx, walkId: string) {
    if (walkId === 'stars') {
      appCtx.setActiveCollection(
        {
          type: 'walk',
          id: 'stars',
          i18n: {
            en: { name: m.omni__title_star_walks() },
            'zh-hant': { name: '我的最愛' },
            'zh-hans': { name: '我的最爱' }
          },
          items: appCtx.getWishlistedFeatures()
        },
        {
          activateFirst: true,
          focusFirst: true,
          highlight: true,
          focus: true
        }
      );
    } else {
      // TODO Implement walk selection
    }
    this.closeTray();
    this.setMode('navigation');
    setTimeout(() => {
      this.openCard();
    }, 3000);
  }

  handleNeighbourhoodSelection(appCtx: AppCtx, neighbourhood: string) {
    const selectedNeighbourhood =
      neighbourhoods[neighbourhood as keyof typeof neighbourhoods];
    appCtx.setActiveCollection(
      {
        id: neighbourhood,
        type: 'neighbourhood',
        i18n: {
          en: { name: neighbourhood },
          'zh-hant': { name: selectedNeighbourhood.i18n['zh-hant'].name },
          'zh-hans': { name: selectedNeighbourhood.i18n['zh-hans'].name }
        },
        items: appCtx.getNeighbourhoodFeatures(neighbourhood)
      },
      {
        activateFirst: true,
        focusFirst: true,
        highlight: true,
        focus: true,
        openCard: true
      }
    );
    this.closeTray();
    this.setMode('navigation');
    setTimeout(() => {
      this.openCard();
    }, 3000);
  }

  // SEARCH UTILS
  toGroups(results: SearchResult[]) {
    return {
      walks: results.filter((r) => r.group === 'walks'),
      neighbourhoods: results
        .filter((r) => r.group === 'neighbourhoods')
        .sort((a, b) => b.count - a.count),
      features: results.filter((r) => r.group === 'features')
    };
  }

  // Calculate limits for each group
  getLimits(groups: Record<string, SearchResult[]>) {
    const nonEmptyGroups = Object.values(groups).filter((g) => g.length > 0).length;
    if (nonEmptyGroups === 0) return { walks: 0, neighbourhoods: 0, features: 0 };

    const baseLimit = Math.floor(MAX_RESULTS / nonEmptyGroups);
    const remainder = MAX_RESULTS % nonEmptyGroups;

    return {
      walks: groups.walks.length > 0 ? baseLimit + (remainder > 0 ? 1 : 0) : 0,
      neighbourhoods:
        groups.neighbourhoods.length > 0 ? baseLimit + (remainder > 1 ? 1 : 0) : 0,
      features: groups.features.length > 0 ? baseLimit + (remainder > 2 ? 1 : 0) : 0
    };
  }

  // NAVIGATION METHODS

  navNext() {
    const collection = this.appCtx.state.active.collection;
    if (collection && this.navIndex < collection.items.length - 1) {
      this.appCtx.setActiveFeature(collection.items[this.navIndex + 1].id, {
        focus: true
      });
    }
  }

  navPrevious() {
    const collection = this.appCtx.state.active.collection;
    if (collection && this.navIndex > 0) {
      this.appCtx.setActiveFeature(collection.items[this.navIndex - 1].id, {
        focus: true
      });
    }
  }

  // NAVIGATION UTILS
  navTitle = $derived(
    this.state.mode === 'search'
      ? `Search Results: ${this.state.searchTerm}`
      : this.appCtx.state.active.collection
        ? getI18n(
            this.appCtx.state.active.collection,
            'name',
            this.appCtx.getUserPreferences()
          )
        : ''
  );

  // OPEN/CLOSE METHODS

  openTray() {
    this.state.isTrayOpen = true;
  }

  closeTray() {
    this.state.isTrayOpen = false;
    this.clearSearch();
  }

  toggleTray(event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.state.isTrayOpen = !this.state.isTrayOpen;
    if (!this.state.isTrayOpen) {
      this.clearSearch();
    }
  }

  clearSearchOrCloseTray() {
    if (this.state.searchTerm !== '') {
      this.clearSearch();
    } else {
      this.closeTray();
    }
  }

  openCard() {
    this.state.isCardOpen = true;
  }

  closeCard() {
    this.state.isCardOpen = false;
  }

  toggleCard() {
    this.state.isCardOpen = !this.state.isCardOpen;
  }

  setFeatureCardContext(cardCtx: FeatureCardContext) {
    this.cardCtx = cardCtx;
  }
}

export const OMNI_CONTEXT_KEY = Symbol('omniContext');

export const setOmniContext = (appCtx: AppCtx) =>
  setContext(OMNI_CONTEXT_KEY, new OmniContext(appCtx));

export const getOmniContext = (): OmniContext => {
  const ctx = getContext(OMNI_CONTEXT_KEY);
  if (!ctx) {
    // Return a safe proxy object that prevents errors when OmniContext isn't ready
    return new Proxy({} as OmniContext, {
      get(target, prop) {
        if (prop === 'state')
          return {
            mode: 'search',
            isTrayOpen: false,
            isCardOpen: false,
            searchTerm: '',
            focusedIndex: -1
          };
        if (prop === 'searchResults')
          return {
            features: [],
            neighbourhoods: [],
            walks: []
          };
        if (prop === 'pageState') return PageState.NoTransition;
        if (prop === 'isIntentionallyClosing') return false;
        if (prop === 'cardCtx') return null;
        if (prop === 'limits') return { features: 5, neighbourhoods: 3, walks: 1 };
        if (prop === 'isFeatureMode') return false;
        if (prop === 'isNewFeatureMode') return false;
        if (prop === 'isSearchMode') return true;
        if (prop === 'isNavigationMode') return false;
        if (prop === 'totalResults') return 0;
        if (prop === 'navIndex') return -1;
        if (prop === 'navTitle') return '';
        // Return no-op functions for methods
        if (
          typeof prop === 'string' &&
          (prop.startsWith('set') ||
            prop.startsWith('clear') ||
            prop.startsWith('focus') ||
            prop.startsWith('reset') ||
            prop.startsWith('cancel') ||
            prop.startsWith('close') ||
            prop.startsWith('open') ||
            prop.startsWith('toggle') ||
            prop.startsWith('select') ||
            prop.startsWith('handle') ||
            prop.startsWith('nav'))
        ) {
          return () => {};
        }
        return undefined;
      }
    }) as OmniContext;
  }
  return ctx;
};
