// SVELTE
import { setContext, getContext } from 'svelte'
import { SvelteMap, SvelteSet } from 'svelte/reactivity'
// TYPES
import type { DivisionFacet } from '#lib/api/services/featureQuery.types.js'
import type { Id, Ref } from '#lib/types.js'
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'
// TYPES

/* ----------------- */
// DIVISIONCTX
/* -------- */

type DivisionState = {
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
 * DivisionCtx - Manages surface-local division memberships, counts and filter selections
 *
 * TABLE OF CONTENTS:
 *
 * 1. GETTERS
 *    - getFeaturesForDivision(neighbourhood: string): Id[]
 *      Gets all feature IDs for a neighbourhood and its subdivisions
 *
 *    - getFilteredDivisions(): string[]
 *      Get all neighbourhoods that are currently selected for filtering
 *
 *    - getFeaturesForFilteredDivisions(): Id[]
 *      Get all feature IDs for all neighbourhoods and their subdivisions
 *
 *    - get divisionFeatureCounts(): SvelteMap<Ref, number>
 *      Gets the counts of features for each neighbourhood
 *
 *    - get divisionFilterCount(): number
 *      Gets the count of currently filtered neighbourhoods
 *
 * 2. SETTERS
 *    - setDivisionFeatures(features: FeatureFromCollection[]): void
 *      Sets neighbourhood features and recalculates stats
 *
 *    - toggleDivision(neighbourhood: string): void
 *      Toggles a neighbourhood in the filter include set
 *
 *    - resetDivisions(): void
 *      Clears all neighbourhood filters
 *
 * 3. COUNTS
 *    - setDivisionCounts: applies exact counts for every selected division level.
 *
 */
export class DivisionCtx {
  /** Registry metadata stays available when a filtered response has no matching members. */
  divisions = new SvelteMap<string, DivisionFacet>()

  /** Retained counts remain visible while the next facet query settles. */
  countsLoading = $state(false)

  /** Surface-local class visibility shared by the panel and Omnibar; selection is independent. */
  hiddenClasses = new SvelteSet<string>()

  /** Transient preview belongs to this surface, independently of selection. */
  hoveredId: string | null = $state(null)

  /**
   * Updates pointer or keyboard preview without changing membership filters.
   * @param id Division being entered or left.
   * @param active Whether this row is being previewed.
   * @returns Nothing.
   */
  previewDivision(id: string, active: boolean): void {
    if (active) this.hoveredId = id
    else if (this.hoveredId === id) this.hoveredId = null
  }

  state: DivisionState = $state({
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
  getFeaturesForDivision(neighbourhood: string): Id[] {
    return [...(this.state.contains.feature.neighbourhood.get(neighbourhood) ?? [])]
  }

  /**
   * Get all neighbourhoods that are currently selected for
   * @returns Array of division IDs
   */
  getFilteredDivisions(): string[] {
    return Array.from(this.state.filters.feature.neighbourhood.include)
  }

  /**
   * Get all feature IDs for all neighbourhoods and their subdivisions
   * @returns Array of feature IDs from all neighbourhoods and their subdivisions
   */
  getFeaturesForFilteredDivisions(): Id[] {
    const allFeatureIds: Set<Id> = new Set()
    for (const neighbourhood of this.getFilteredDivisions()) {
      this.getFeaturesForDivision(neighbourhood).forEach(featureId => {
        allFeatureIds.add(featureId)
      })
    }
    return Array.from(allFeatureIds)
  }

  /**
   * Gets the counts of features for each neighbourhood
   * @returns Map of division ID to feature count
   */
  get divisionFeatureCounts(): SvelteMap<Ref, number> {
    return this.state.counts.feature.neighbourhood
  }

  get divisionFilterCount() {
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
  setDivisionFeatures(features: FeatureFromCollection[]): void {
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
  toggleDivision(neighbourhood: string): void {
    if (this.state.filters.feature.neighbourhood.include.has(neighbourhood)) {
      this.state.filters.feature.neighbourhood.include.delete(neighbourhood)
    } else {
      this.state.filters.feature.neighbourhood.include.add(neighbourhood)
    }
  }

  /** Clears all division selections. @returns Nothing. */
  resetDivisions(): void {
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
  setDivisionCounts(counts: Record<string, DivisionFacet> | null): void {
    // Each membership already includes contained children; retain its exact server count.
    this.state.counts.feature.neighbourhood.clear()
    if (!counts) return
    for (const [id, division] of Object.entries(counts)) {
      this.divisions.set(id, division)
      this.state.counts.feature.neighbourhood.set(id, division.count)
    }
  }
}

export const DIVISION_CONTEXT_KEY = Symbol('divisionContext')

export const setDivisionCtx = () => setContext(DIVISION_CONTEXT_KEY, new DivisionCtx())

export const getDivisionCtx = (): DivisionCtx => {
  const ctx = getContext<DivisionCtx | undefined>(DIVISION_CONTEXT_KEY)
  if (!ctx) {
    throw new Error(
      'DivisionCtx context is missing. Ensure setDivisionCtx() is called before using getDivisionCtx().',
    )
  }
  return ctx
}
