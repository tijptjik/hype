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
