// TYPES
import type { RemoteQuery } from '$app/server'
import type { FeatureQueryPage } from '#lib/api/services/featureQuery.types.js'
import type { FeatureQuery } from '#lib/context/feature-query.svelte.js'

/**
 * Models native query errors without deleting the last successful page.
 * @param current - Previously authorized page.
 * @returns Native handle and reactive shared-error setter.
 */
export function featureQueryProbe(current: FeatureQueryPage): {
  query: RemoteQuery<FeatureQueryPage>
  setError: (status?: number) => void
} {
  let failure: { status: number } | undefined = $state.raw()
  const query = Object.assign(Promise.resolve(current), {
    current,
    ready: true,
    refresh: async () => {
      if (failure) throw failure
    },
  })
  Object.defineProperty(query, 'error', { get: () => failure })
  return {
    query: query as unknown as RemoteQuery<FeatureQueryPage>,
    setError: status => {
      failure = status === undefined ? undefined : { status }
    },
  }
}

/**
 * Observes the reactive rows consumed by feature lists and map markers.
 * @param query - Active traversal.
 * @param observe - Callback receiving visible identities.
 * @returns Effect cleanup.
 */
export function observeFeatureRows(
  query: FeatureQuery,
  observe: (ids: string[]) => void,
): () => void {
  return $effect.root(() => {
    $effect(() => observe(query.rows.map(row => row.id)))
  })
}

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
