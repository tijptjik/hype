// SVELTE
import { setContext, getContext } from 'svelte'
import { SvelteMap, SvelteSet } from 'svelte/reactivity'
// TYPES
import type { DivisionFacet } from '$lib/api/services/featureQuery.types'
import type { Id, Ref } from '$lib/types'
import type { FeatureFromCollection } from '$lib/db/zod/schema/feature.types'
// TYPES

/* ----------------- */
// PLACECTX
/* -------- */

type PlaceState = {
  filters: {
    feature: {
      neighbourhood: {
        include: SvelteSet<Ref>
        exclude: SvelteSet<Ref>
      }
    }
  }
  contains: {
    feature: {
      // Mapping division ID to feature ids
      neighbourhood: SvelteMap<Ref, SvelteSet<Id>>
      // Mapping district name to feature ids
      // districts: Map<string, Id[]>;
    }
  }
  counts: {
    feature: {
      neighbourhood: SvelteMap<Ref, number>
    }
  }
}

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
 * 3. COUNTS
 *    - setNeighbourhoodCounts: applies exact counts for every selected division level.
 *
 */
export class PlaceCtx {
  /** Registry metadata stays available when a filtered response has no matching members. */
  divisions = new SvelteMap<string, DivisionFacet>()

  state: PlaceState = $state({
    filters: {
      feature: {
        neighbourhood: {
          include: new SvelteSet(),
          exclude: new SvelteSet(),
        },
      },
    },
    contains: {
      feature: {
        neighbourhood: new SvelteMap(),
        // districts: {}
      },
    },
    counts: {
      feature: {
        neighbourhood: new SvelteMap(),
      },
    },
  })

  // ═══════════════════════
  // 1. GETTERS
  // ═══════════════════════

  /**
   * Gets all feature IDs for a neighbourhood and its subdivisions
   * @param neighbourhood - The main division ID
   * @returns Array of feature IDs from the main neighbourhood and all subdivisions
   */
  getFeaturesForNeighbourhood(neighbourhood: string): Id[] {
    return [...(this.state.contains.feature.neighbourhood.get(neighbourhood) ?? [])]
  }

  /**
   * Get all neighbourhoods that are currently selected for
   * @returns Array of division IDs
   */
  getFilteredNeighbourhoods(): string[] {
    return Array.from(this.state.filters.feature.neighbourhood.include)
  }

  /**
   * Get all feature IDs for all neighbourhoods and their subdivisions
   * @returns Array of feature IDs from all neighbourhoods and their subdivisions
   */
  getFeaturesForFilteredNeighbourhoods(): Id[] {
    const allFeatureIds: Set<Id> = new Set()
    for (const neighbourhood of this.getFilteredNeighbourhoods()) {
      this.getFeaturesForNeighbourhood(neighbourhood).forEach(featureId => {
        allFeatureIds.add(featureId)
      })
    }
    return Array.from(allFeatureIds)
  }

  /**
   * Gets the counts of features for each neighbourhood
   * @returns Map of division ID to feature count
   */
  get neighbourhoodFeatureCounts(): SvelteMap<Ref, number> {
    return this.state.counts.feature.neighbourhood
  }

  get neighbourhoodFilterCount() {
    return this.state.filters.feature.neighbourhood.include.size
  }

  // ═══════════════════════
  // 2. SETTERS
  // ═══════════════════════

  /**
   * Indexes all selected containing divisions for immediate feature previews.
   * @param features Locally retained feature rows and their memberships.
   * @returns Nothing; authoritative server counts remain independent of retained rows.
   */
  setNeighbourhoodFeatures(features: FeatureFromCollection[]): void {
    // Build new neighbourhood mappings
    const newNeighbourhoodMap = new SvelteMap<string, SvelteSet<Id>>()

    // First, build all the neighbourhood mappings
    for (const feature of features) {
      for (const membership of feature.divisionMemberships ?? []) {
        if (!membership.selected) continue
        const existingFeatures =
          newNeighbourhoodMap.get(membership.divisionId) ?? new SvelteSet<Id>()
        existingFeatures.add(feature.id)
        newNeighbourhoodMap.set(membership.divisionId, existingFeatures)
      }
    }

    // Set the new map once
    this.state.contains.feature.neighbourhood = newNeighbourhoodMap

    // Local membership supports immediate previews; counts are supplied by the query envelope.
  }

  /**
   * Toggles a stable division ID in the include filter.
   * @param neighbourhood Division ID at any hierarchy level.
   * @returns Nothing.
   */
  toggleNeighbourhood(neighbourhood: string): void {
    if (this.state.filters.feature.neighbourhood.include.has(neighbourhood)) {
      this.state.filters.feature.neighbourhood.include.delete(neighbourhood)
    } else {
      this.state.filters.feature.neighbourhood.include.add(neighbourhood)
    }
  }

  /** Clears all division selections. @returns Nothing. */
  resetNeighbourhoods(): void {
    this.state.filters.feature.neighbourhood.include.clear()
    this.state.filters.feature.neighbourhood.exclude.clear()
  }

  // ═══════════════════════
  // 3. UTILITIES
  // ═══════════════════════

  /**
   * Applies authoritative grouped counts without counting locally retained feature rows.
   * @param counts - Counts per selected division for the complete filtered query.
   * @returns Nothing after division totals are updated.
   */
  setNeighbourhoodCounts(counts: Record<string, DivisionFacet> | null): void {
    // Each membership already includes contained children; retain its exact server count.
    this.state.counts.feature.neighbourhood.clear()
    if (!counts) return
    for (const [id, division] of Object.entries(counts)) {
      this.divisions.set(id, division)
      this.state.counts.feature.neighbourhood.set(id, division.count)
    }
  }
}

export const PLACE_CONTEXT_KEY = Symbol('placeContext')

export const setPlaceCtx = () => setContext(PLACE_CONTEXT_KEY, new PlaceCtx())

export const getPlaceCtx = (): PlaceCtx => {
  const ctx = getContext<PlaceCtx | undefined>(PLACE_CONTEXT_KEY)
  if (!ctx) {
    throw new Error(
      'PlaceCtx context is missing. Ensure setPlaceCtx() is called before using getPlaceCtx().',
    )
  }
  return ctx
}
