// TYPES
import type { RemoteQuery } from '@sveltejs/kit'
import type {
  PanelResource,
  ResourcePage,
  ResourcePageFactory,
  ResourcePageInput,
} from '$lib/types'

/** Native query handles own page data; this controller owns traversal and retained handles. */
export class ResourceList {
  pages: RemoteQuery<ResourcePage>[] = $state.raw([])
  loading = $state(false)
  error: unknown = $state(null)
  private generation = 0
  private input: ResourcePageInput | undefined
  private history = new Map<
    string,
    { pages: RemoteQuery<ResourcePage>[]; fetchedAt: number }
  >()

  constructor(private readonly query: ResourcePageFactory) {}

  /** Ordered current rows reflect native optimistic overrides without an AppCtx copy. */
  get rows(): PanelResource[] {
    const rows = new Map<string, PanelResource>()
    for (const page of this.pages)
      for (const row of page.current?.data ?? []) rows.set(row.id, row)
    return [...rows.values()]
  }

  get hasMore(): boolean {
    return Boolean(this.pages.at(-1)?.current?.nextCursor)
  }

  /**
   * Activates a view, retaining previously visited native handles for one-minute reuse.
   * @param input - Complete scope and search arguments.
   * @param force - Whether to bypass freshness and call native refresh.
   * @returns Completion of the current first page; obsolete completions are ignored.
   */
  async load(input: ResourcePageInput, force = false): Promise<void> {
    const key = JSON.stringify(input)
    if (!force && this.input && JSON.stringify(this.input) === key && this.pages.length)
      return
    const generation = ++this.generation
    this.input = input
    this.error = null
    const retained = this.history.get(key)
    if (!force && retained && Date.now() - retained.fetchedAt < 60_000) {
      this.pages = retained.pages
      this.loading = false
      return
    }
    const page = this.query(input)
    this.pages = [page]
    this.loading = true
    try {
      if (force || page.ready) await page.refresh()
      else await page
      if (generation !== this.generation) return
      this.history.set(key, { pages: this.pages, fetchedAt: Date.now() })
    } catch (error) {
      if (generation === this.generation) this.error = error
      throw error
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }

  /**
   * Fetches one next page. Concurrent threshold notifications share this operation.
   * @returns Nothing after the page is available or the view becomes obsolete.
   */
  async next(): Promise<void> {
    const cursor = this.pages.at(-1)?.current?.nextCursor
    if (this.loading || !this.input || !cursor) return
    const generation = this.generation
    const input = this.input
    this.loading = true
    this.error = null
    try {
      const page = this.query({ ...input, cursor })
      await page
      if (generation !== this.generation) return
      this.pages = [...this.pages, page]
      this.history.set(JSON.stringify(input), {
        pages: this.pages,
        fetchedAt: Date.now(),
      })
    } catch (error) {
      if (generation === this.generation) this.error = error
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }

  /** Invalidates retained membership after mutations, preserving visible native handles. */
  invalidate(): void {
    this.history.clear()
  }

  /** Clears scope-sensitive handles and supersedes pending page requests. */
  clear(): void {
    this.generation++
    this.input = undefined
    this.pages = []
    this.history.clear()
    this.loading = false
    this.error = null
  }
}
