// SVELTE
import { setContext, getContext } from 'svelte';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';
// SERVICES
import { buildNeighbourhoodSubdivisionMap } from '$lib/client/services/geospatial';
// TYPES
import type { Id, PlaceState, FeatureFromCollection, Ref } from '$lib/types';

/**
 * PlaceCtx - Manages neighbourhood and place-related state and operations
 *
 * TABLE OF CONTENTS:
 *
 * 1. GETTERS
 *    - getFeaturesForNeighbourhood(neighbourhood: string): Id[]
 *      Gets all feature IDs for a neighbourhood and its subdivisions
 *
 *    - getFilteredNeighbourhoods(): string[]
 *      Get all neighbourhoods that are currently selected for filtering
 *
 *    - getFeaturesForFilteredNeighbourhoods(): Id[]
 *      Get all feature IDs for all neighbourhoods and their subdivisions
 *
 *    - get neighbourhoodFeatureCounts(): SvelteMap<Ref, number>
 *      Gets the counts of features for each neighbourhood
 *
 *    - get neighbourhoodFilterCount(): number
 *      Gets the count of currently filtered neighbourhoods
 *
 * 2. SETTERS
 *    - setNeighbourhoodFeatures(features: FeatureFromCollection[]): void
 *      Sets neighbourhood features and recalculates stats
 *
 *    - toggleNeighbourhood(neighbourhood: string): void
 *      Toggles a neighbourhood in the filter include set
 *
 *    - resetNeighbourhoods(): void
 *      Clears all neighbourhood filters
 *
 * 3. UTILITIES
 *    - expandNeighbourhood(neighbourhood: string): string[]
 *      Expands a neighbourhood to include all its subdivisions
 *
 *    - calculateNeighbourhoodStats(): void
 *      Calculates feature counts for all main neighbourhoods
 *
 */
export class PlaceCtx {
  neighbourhoodSubdivisions: Map<Ref, string[]> = new Map();

  constructor() {
    this.neighbourhoodSubdivisions = buildNeighbourhoodSubdivisionMap();
  }

  state: PlaceState = $state({
    filters: {
      feature: {
        neighbourhood: {
          include: new SvelteSet(),
          exclude: new SvelteSet()
        }
      }
    },
    contains: {
      feature: {
        neighbourhood: new SvelteMap()
        // districts: {}
      }
    },
    counts: {
      feature: {
        neighbourhood: new SvelteMap()
      }
    }
  });

  // ═══════════════════════
  // 1. GETTERS
  // ═══════════════════════

  /**
   * Gets all feature IDs for a neighbourhood and its subdivisions
   * @param neighbourhood - The main neighbourhood name
   * @returns Array of feature IDs from the main neighbourhood and all subdivisions
   */
  getFeaturesForNeighbourhood(neighbourhood: string): Id[] {
    const expandedNeighbourhoods = this.expandNeighbourhood(neighbourhood);
    const allFeatureIds: Set<Id> = new Set();

    for (const hood of expandedNeighbourhoods) {
      const features = this.state.contains.feature.neighbourhood.get(hood);
      if (features) {
        features.forEach((featureId) => {
          allFeatureIds.add(featureId);
        });
      }
    }

    return Array.from(allFeatureIds);
  }

  /**
   * Get all neighbourhoods that are currently selected for
   * @returns Array of neighbourhood names
   */
  getFilteredNeighbourhoods(): string[] {
    return Array.from(this.state.filters.feature.neighbourhood.include);
  }

  /**
   * Get all feature IDs for all neighbourhoods and their subdivisions
   * @returns Array of feature IDs from all neighbourhoods and their subdivisions
   */
  getFeaturesForFilteredNeighbourhoods(): Id[] {
    const allFeatureIds: Set<Id> = new Set();
    for (const neighbourhood of this.getFilteredNeighbourhoods()) {
      this.getFeaturesForNeighbourhood(neighbourhood).forEach((featureId) => {
        allFeatureIds.add(featureId);
      });
    }
    return Array.from(allFeatureIds);
  }

  /**
   * Gets the counts of features for each neighbourhood
   * @returns Map of neighbourhood name to feature count
   */
  get neighbourhoodFeatureCounts(): SvelteMap<Ref, number> {
    return this.state.counts.feature.neighbourhood;
  }

  get neighbourhoodFilterCount() {
    return this.state.filters.feature.neighbourhood.include.size;
  }

  // ═══════════════════════
  // 2. SETTERS
  // ═══════════════════════

  setNeighbourhoodFeatures(features: FeatureFromCollection[]) {
    // Build new neighbourhood mappings
    const newNeighbourhoodMap = new SvelteMap<string, SvelteSet<Id>>();

    // First, build all the neighbourhood mappings
    for (const feature of features) {
      const neighbourhood = feature.i18n?.en?.addressProperties?.neighbourhood;
      if (neighbourhood) {
        const existingFeatures =
          newNeighbourhoodMap.get(neighbourhood) || new SvelteSet<Id>();
        existingFeatures.add(feature.id);
        newNeighbourhoodMap.set(neighbourhood, existingFeatures);
      }
    }

    // Set the new map once
    this.state.contains.feature.neighbourhood = newNeighbourhoodMap;

    // Then, calculate all the stats once
    this.calculateNeighbourhoodStats();
  }

  toggleNeighbourhood(neighbourhood: string) {
    if (this.state.filters.feature.neighbourhood.include.has(neighbourhood)) {
      this.state.filters.feature.neighbourhood.include.delete(neighbourhood);
    } else {
      this.state.filters.feature.neighbourhood.include.add(neighbourhood);
    }
  }

  resetNeighbourhoods() {
    this.state.filters.feature.neighbourhood.include.clear();
    this.state.filters.feature.neighbourhood.exclude.clear();
  }

  // ═══════════════════════
  // 3. UTILITIES
  // ═══════════════════════

  /**
   * Expands a neighbourhood to include all its subdivisions
   * @param neighbourhood - The main neighbourhood name
   * @returns Array of all sub-neighbourhoods including the main one
   */
  private expandNeighbourhood(neighbourhood: string): string[] {
    const subNeighbourhoods = this.neighbourhoodSubdivisions.get(neighbourhood);
    if (subNeighbourhoods) {
      // Return unique neighbourhoods since subNeighbourhoods already includes the main one
      return [...new Set([neighbourhood, ...subNeighbourhoods])];
    }
    return [neighbourhood];
  }

  private calculateNeighbourhoodStats() {
    // Clear existing counts
    this.state.counts.feature.neighbourhood.clear();

    // Calculate counts for all main neighbourhoods
    for (const [mainNeighbourhood] of this.neighbourhoodSubdivisions.entries()) {
      const expandedNeighbourhoods = this.expandNeighbourhood(mainNeighbourhood);
      const count = expandedNeighbourhoods.reduce((total, hood) => {
        const features = this.state.contains.feature.neighbourhood.get(hood);
        return total + (features ? features.size : 0);
      }, 0);

      this.state.counts.feature.neighbourhood.set(mainNeighbourhood, count);
    }
  }
}

export const PLACE_CONTEXT_KEY = Symbol('placeContext');

export const setPlaceCtx = () => setContext(PLACE_CONTEXT_KEY, new PlaceCtx());

export const getPlaceCtx = (): PlaceCtx => getContext(PLACE_CONTEXT_KEY);
