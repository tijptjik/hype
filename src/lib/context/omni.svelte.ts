// SVELTE
import { getContext, setContext } from 'svelte';
import { goto } from '$app/navigation';
// LIB
import { MOBILE_MAX_WIDTH } from '$lib';
import { searchAll } from '$lib/map/data';
// I18N
import { getI18nValue } from '$lib/i18n';
import { m } from '$lib/i18n';
// NEIGHBOURHOODS
import neighbourhoods from '$lib/map/neighbourhoods.json';
// ENUMS
import { FeatureCardMode } from '$lib/types';
// TYPES
import type { SearchResult, Id, NewFeature } from '$lib/types';
import type { mapContext } from '$lib/context/map.svelte';
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

  featureCardContext: FeatureCardContext | null = null;

  mapContext!: mapContext;
  pageState: PageState = $state(PageState.NoTransition);

  // Constructor with mapContext
  constructor(mapContext: mapContext) {
    this.mapContext = mapContext;
  }

  // DERIVED values after state and constructor
  searchResults: Record<string, SearchResult[]> = $derived(
    this.toGroups(searchAll(this.state.searchTerm, this.mapContext))
  );

  // MAPS
  searchHandlers = {
    features: (featureId: Id) =>
      this.handleFeatureSelection(this.mapContext, featureId),
    neighbourhoods: (neighbourhood: string) =>
      this.handleNeighbourhoodSelection(this.mapContext, neighbourhood),
    walks: (walkId: string) => this.handleWalkSelection(this.mapContext, walkId)
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
    this.mapContext.state.active.collection?.items.findIndex(
      (item) => item.id === this.mapContext.state.active.feature?.id
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
    }
  }

  // CLOSE METHODS
  close() {
    // If the card is open, close it
    if (this.state.isCardOpen) {
      // If the card is in missing mode, turn it into display mode
      if (!this.featureCardContext?.isDisplayMode) {
        this.featureCardContext?.setMode(FeatureCardMode.Display);
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

      // If we are in search mode, close the card
    } else if (this.state.mode === 'search' && this.state.isTrayOpen) {
      this.closeTray();
    }
  }

  selectFirstResult() {
    if (this.searchResults.features.length > 0) {
      this.handleFeatureSelection(this.mapContext, this.searchResults.features[0].ref);
    } else if (this.searchResults.neighbourhoods.length > 0) {
      this.handleNeighbourhoodSelection(
        this.mapContext,
        this.searchResults.neighbourhoods[0].ref
      );
    } else if (this.searchResults.walks.length > 0) {
      this.handleWalkSelection(this.mapContext, this.searchResults.walks[0].ref);
    }
  }

  async handleFeatureSelection(
    mapContext: mapContext,
    featureId: Id,
    options: {
      openCard: boolean;
    } = { openCard: false }
  ) {
    // If we are on mobile, close all panels
    // otherwise the selected feature will be hidden behind the panel
    if (window.innerWidth < MOBILE_MAX_WIDTH) {
      mapContext.closeAllPanels();
    }

    // Wait for features to be loaded if they haven't been yet
    if (mapContext.state.resources.feature.length === 0) {
      await mapContext.queryClient.fetchQuery({
        queryKey: mapContext.featuresQueryKey,
        queryFn: mapContext.featuresQueryFn
      });
    }

    let feature = mapContext.getFeatureById(featureId);
    if (feature == null) {
      console.error('Feature not found:', featureId);
      return;
    }

    // Check if the feature is part of the active collection
    const activeCollection = mapContext.getActiveCollection();
    if (activeCollection) {
      const featureIndex = activeCollection.items.findIndex(
        (item) => item.id === featureId
      );
      if (featureIndex !== -1) {
        // Feature is in the current collection, just update the active index
        mapContext.setActiveFeature(featureId, {
          focus: true
        });
        return;
      }
    }

    // If we get here, feature wasn't in the active collection, create a new single-feature collection
    let address = getI18nValue(feature, 'displayAddress');

    mapContext.setActiveCollection(
      {
        type: 'feature',
        name: address.replace(', Hong Kong', '').replace(', Hong Kong Island', ''),
        id: featureId,
        translations: [
          { lang: 'zh-hant', name: address },
          { lang: 'zh-hans', name: address }
        ],
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

  handleWalkSelection(mapContext: mapContext, walkId: string) {
    if (walkId === 'stars') {
      mapContext.setActiveCollection(
        {
          type: 'walk',
          name: m.omni__title_star_walks(),
          id: 'stars',
          translations: [
            { lang: 'zh-hant', name: '我的最愛' },
            { lang: 'zh-hans', name: '我的最爱' }
          ],
          items: mapContext.getWishlistedFeatures()
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

  handleNeighbourhoodSelection(mapContext: mapContext, neighbourhood: string) {
    const selectedNeighbourhood =
      neighbourhoods[neighbourhood as keyof typeof neighbourhoods];
    mapContext.setActiveCollection(
      {
        type: 'neighbourhood',
        name: neighbourhood,
        id: neighbourhood,
        translations: [
          {
            lang: 'zh-hant',
            name:
              selectedNeighbourhood.translations.find((t) => t.lang === 'zh-hant')
                ?.name || ''
          },
          {
            lang: 'zh-hans',
            name:
              selectedNeighbourhood.translations.find((t) => t.lang === 'zh-hans')
                ?.name || ''
          }
        ],
        items: mapContext.getNeighbourhoodFeatures(neighbourhood)
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
    if (this.navIndex < this.mapContext.state.active.collection!.items.length - 1) {
      this.mapContext.setActiveFeature(
        this.mapContext.state.active.collection!.items[this.navIndex + 1].id,
        { focus: true }
      );
    }
  }

  navPrevious() {
    if (this.navIndex > 0) {
      this.mapContext.setActiveFeature(
        this.mapContext.state.active.collection!.items[this.navIndex - 1].id,
        { focus: true }
      );
    }
  }

  // NAVIGATION UTILS
  navTitle = $derived(
    this.state.mode === 'search'
      ? `Search Results: ${this.state.searchTerm}`
      : getI18nValue(this.mapContext.state.active.collection!, 'name')
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

  setFeatureCardContext(featureCardContext: FeatureCardContext) {
    this.featureCardContext = featureCardContext;
  }
}

export const OMNI_CONTEXT_KEY = Symbol('omniContext');

export const setOmniContext = (mapContext: mapContext) =>
  setContext(OMNI_CONTEXT_KEY, new OmniContext(mapContext));

export const getOmniContext = (): OmniContext => getContext(OMNI_CONTEXT_KEY);
