import type { FeatureQueryPage } from '$lib/api/services/featureQuery.types'

/**
 * Creates an effect owner for context integration tests without mounting application UI.
 * @param initialize - Context constructors that register reactive effects.
 * @returns Cleanup for every effect created by the test.
 */
export function createFeatureQueryEffectRoot(initialize: () => void): () => void {
  return $effect.root(initialize)
}

/**
 * Supplies the reactive current-value behavior exposed by a native SvelteKit query.
 * @returns A mutable page signal for controlled network completions in tests.
 */
export function createFeatureQueryPageSignal() {
  let current: FeatureQueryPage | undefined = $state.raw()
  return {
    get current(): FeatureQueryPage | undefined {
      return current
    },
    set current(value: FeatureQueryPage | undefined) {
      current = value
    },
  }
}
