// SVELTE
import { SvelteMap } from 'svelte/reactivity'
// REMOTE
import { getResourcePage } from '$lib/api/server/resources.remote'
// CONTEXT
import { ResourceList } from './resource-list.svelte'
// TYPES
import type { Cache, PanelResourceType } from '$lib/types'

/** Session-local domain retention. SvelteKit owns active page payloads and request deduplication. */
export class CacheCtx {
  readonly entities: Cache = {
    organisation: new SvelteMap(),
    project: new SvelteMap(),
    layer: new SvelteMap(),
    feature: new SvelteMap(),
    task: new SvelteMap(),
    hub: new SvelteMap(),
    property: new SvelteMap(),
    image: new SvelteMap(),
    user: new SvelteMap(),
    stats: new SvelteMap(),
  }
  readonly lists = {
    organisation: new ResourceList(getResourcePage),
    project: new ResourceList(getResourcePage),
    layer: new ResourceList(getResourcePage),
  }

  /**
   * Invalidates inactive page membership after a resource mutation.
   * @param type - Changed hierarchy resource.
   * @returns Nothing.
   */
  invalidate(type: PanelResourceType): void {
    this.lists[type].invalidate()
  }

  /** Clears every retained scope-sensitive record and page before an identity transition. */
  clear(): void {
    for (const store of Object.values(this.entities)) store.clear()
    for (const list of Object.values(this.lists)) list.clear()
  }
}
