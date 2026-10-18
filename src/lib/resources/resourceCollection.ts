// TYPES
import type { ResourceList } from '#lib/context/resource-list.svelte.js'
import type {
  PanelResource,
  PanelResourceType,
  ResourcePageInput,
} from '#lib/api/services/resourcePage.types.js'

/** Surface query intent excludes server-access/cache metadata, supplied by the client. */
export type ResourceCollectionInput = Omit<ResourcePageInput, 'type' | 'meta'>

/** Independent hierarchy traversal with access metadata bound by the resource client. */
export class ResourceCollection {
  private input: ResourceCollectionInput = {}

  constructor(
    private readonly list: ResourceList,
    private readonly type: PanelResourceType,
    private readonly meta: () => ResourcePageInput['meta'],
    private readonly defaults: ResourceCollectionInput = {},
  ) {}

  get rows(): PanelResource[] {
    return this.list.scope === this.meta().scope ? this.list.rows : []
  }
  get loading(): boolean {
    return this.list.loading
  }
  get error(): unknown {
    return this.list.error
  }
  get hasMore(): boolean {
    return this.list.scope === this.meta().scope && this.list.hasMore
  }
  get isInitialised(): boolean {
    return this.list.scope === this.meta().scope && this.list.isInitialised
  }
  get visibleIds(): Set<string> {
    return this.list.visibleIds
  }
  set visibleIds(ids: Set<string>) {
    this.list.visibleIds = ids
  }

  /**
   * Loads view filters using the current access identity.
   * @param input Search, filtering, profile and ordering intent.
   * @param force Whether to revalidate a retained first page.
   * @returns Completion of this traversal's first page.
   */
  load(input: ResourceCollectionInput = {}, force = false): Promise<void> {
    this.input = input
    return this.list.load(
      { ...this.defaults, ...input, type: this.type, meta: this.meta() },
      force,
    )
  }

  /** Loads the next page, restarting after an access change. @returns Page completion. */
  next(): Promise<void> {
    return this.list.scope !== this.meta().scope
      ? this.load(this.input)
      : this.list.next()
  }

  /** Refreshes the current view using current access metadata. @returns Refresh completion. */
  refresh(): Promise<void> {
    return this.load(this.input, true)
  }

  /** Revalidates active data on focus. @returns Refresh completion. */
  revalidate(): Promise<void> {
    return this.list.scope !== this.meta().scope
      ? this.load(this.input)
      : this.list.revalidate()
  }

  /** Releases the consumer and its pending reads. @returns Nothing. */
  release(): void {
    this.list.release()
  }
}
