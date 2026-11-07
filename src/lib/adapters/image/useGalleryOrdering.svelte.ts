// SVELTE
import { untrack } from 'svelte'
// API
import { getFeatureGalleryRevisionEditor, saveFeatureGalleryRevision } from '#lib/api/featureRevisions.remote.js'
import { refreshRemoteQuery } from '#lib/remote/index.js'
// TYPES
import type { GallerySortMode } from '#lib/images/galleryOrder.js'
import type { ViewerRenderable } from '#lib/bits/patterns/images/images.types.js'

/** Connects gallery sorting to guarded accepted revisions without editing upload evidence.
 * @param featureId Current Feature identity.
 * @param items Current visible thumbnail membership.
 * @param refresh Refreshes image projections after a successful revision save.
 * @returns Reactive sorting capabilities and a guarded save operation.
 * @remarks Partial/task-only galleries cannot reorder accepted membership through this adapter.
 */
export function useGalleryOrdering(
  featureId: () => string | null | undefined,
  items: () => ViewerRenderable[],
  refresh: () => Promise<unknown>,
) {
  let snapshot = $state<Awaited<ReturnType<typeof getFeatureGalleryRevisionEditor>> | null>(null)
  let loading = $state(false)
  let savingFeatureId = $state<string | null>(null)
  let snapshotFeatureId = $state<string | null>(null)
  let saveSequence = 0
  const saving = $derived(Boolean(savingFeatureId && savingFeatureId === featureId()))
  let sequence = 0
  const enabled = $derived(Boolean(snapshot?.enabled && snapshotFeatureId === featureId() && (!loading || saving) &&
    items().length === snapshot.gallery.order.length && items().every(item => snapshot?.enabled &&
      Object.hasOwn(snapshot.gallery.entries, item.id) &&
      item.intent === snapshot.gallery.entries[item.id].intent &&
      (saving || ((item.gallerySortMode ?? 'automatic') === (snapshot.gallery.sortMode ?? 'automatic') &&
      (snapshot.gallery.sortMode !== 'manual' || item.galleryPosition === snapshot.gallery.order.indexOf(item.id)))))))

  /** Loads an authorized comparison token; obsolete responses cannot replace a new Feature.
   * @returns Completion after the snapshot has loaded or become unavailable.
   */
  async function load(): Promise<void> {
    const id = featureId(), request = ++sequence
    if (!saving || snapshotFeatureId !== id) {
      snapshot = null
      snapshotFeatureId = null
    }
    if (!id) return
    loading = true
    try {
      const result = await refreshRemoteQuery(getFeatureGalleryRevisionEditor({ featureId: id, meta: { isAdminRequest: true } }))
      if (request === sequence && id === featureId()) {
        snapshot = result
        snapshotFeatureId = id
      }
    } catch { if (request === sequence) snapshot = null }
    finally { if (request === sequence) loading = false }
  }

  $effect(() => {
    featureId()
    // A refreshed accepted projection may carry a new comparison after unrelated image edits.
    items().map(item => `${item.id}:${item.renderKey}:${item.intent}:${item.gallerySortMode}:${item.galleryPosition}`).join('|')
    untrack(() => {
      // The active save refreshes its own comparison token; retain capability across that refresh.
      if (!saving) void load()
    })
  })

  return {
    get mode(): GallerySortMode { return snapshot?.enabled ? snapshot.gallery.sortMode ?? 'automatic' : items()[0]?.gallerySortMode ?? 'automatic' },
    get enabled(): boolean { return enabled },
    /** Saves a mode and complete membership under the exact inspected revision token.
     * @param mode Requested sorting mode. @param order Requested complete image order.
     * @returns Completion after accepted state and thumbnails refresh.
     */
    async save(mode: GallerySortMode, order: string[]): Promise<void> {
      const id = featureId(), inspected = snapshot
      if (!id || !inspected?.enabled || !enabled || saving) throw new Error('Gallery changed; refresh before sorting.')
      const request = ++saveSequence
      savingFeatureId = id
      try {
        await saveFeatureGalleryRevision({ featureId: id, baseRevisionId: inspected.comparisonRevisionId,
          sortMode: mode, order: [...order], text: {}, meta: { isAdminRequest: true } })
        if (id !== featureId()) return
        await refresh()
        if (id === featureId()) await load()
      } catch (cause) {
        // Read back the accepted projection before rolling back an optimistic order.
        if (id === featureId()) {
          try { await refresh() } catch { /* Preserve the original save error. */ }
          await load()
        }
        throw cause
      } finally {
        if (request === saveSequence) savingFeatureId = null
      }
    },
  }
}
