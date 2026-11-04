// TYPES
import type { ResourceCollection } from '#lib/resources/resourceCollection.js'

/**
 * Observes the same scope-gated values rendered by resource indexes and panels.
 * @param collection Consumer whose first load starts after rendering.
 * @param observe Receives each rendered collection state.
 * @returns Cleanup for the reactive observer.
 */
export function observeResourceCollection(
  collection: ResourceCollection,
  observe: (state: { ids: string[]; isInitialised: boolean }) => void,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      observe({
        ids: collection.rows.map(row => row.id),
        isInitialised: collection.isInitialised,
      })
    })
  })
}

/**
 * Supplies reactive native page data for collection ownership checks.
 * @param initial Initially resolved page.
 * @returns Query handle and payload replacement control.
 */
export function reactiveCollectionPage(
  initial: import('#lib/api/services/resourcePage.types.js').ResourcePage,
) {
  let current = $state.raw(initial)
  const query = Object.assign(Promise.resolve(initial), {
    ready: true,
    refresh: async () => {},
  })
  Object.defineProperty(query, 'current', { get: () => current })
  return {
    query: query as unknown as import('$app/server').RemoteQuery<typeof initial>,
    replace: (value: typeof initial): void => {
      current = value
    },
  }
}
