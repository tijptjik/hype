import type { RemoteQuery } from '$app/server'

// TYPES
import type {
  PanelResource,
  ResourcePage,
  ResourcePageInput,
} from '#lib/api/services/resourcePage.types.js'

// TYPES
type ResourcePageFactory = (
  input: ResourcePageInput,
) => import('$app/server').RemoteQuery<ResourcePage>

/** Native query handles own page data; this controller owns traversal and retained handles. */
export class ResourceList {
  pages: RemoteQuery<ResourcePage>[] = $state.raw([])
  loading = $state(false)
  error: unknown = $state(null)
  visibleIds = new Set<string>()
  private generation = 0
  private released = false
  private fallback: PanelResource[] = []
  private validatedAt = 0
  /** Complete access identity of the active traversal. */
  get scope(): string | undefined {
    return this.input?.meta.scope
  }
  // Scope-gated consumers must react when their first traversal becomes active.
  private input: ResourcePageInput | undefined = $state.raw()
  private history = new Map<
    string,
    { pages: RemoteQuery<ResourcePage>[]; fetchedAt: number }
  >()

  constructor(
    private readonly query: ResourcePageFactory,
    private readonly onRelease: () => void = () => {},
  ) {}

  /** Refreshes the current traversal. @returns Completion of its first page. */
  async refresh(): Promise<void> {
    if (this.input) await this.load(this.input, true)
  }

  /** Releases this consumer and supersedes pending reads. @returns Nothing. */
  release(): void {
    if (this.released) return
    this.released = true
    this.clear()
    this.onRelease()
  }

  /** All retained native pages, including inactive index queries. @returns Unique handles. */
  get retainedPages(): RemoteQuery<ResourcePage>[] {
    return [
      ...new Set([
        ...this.pages,
        ...[...this.history.values()].flatMap(entry => entry.pages),
      ]),
    ]
  }

  /** Ordered current rows reflect native optimistic overrides without an AppCtx copy. */
  get rows(): PanelResource[] {
    if (
      (this.error || (this.loading && !this.pages[0]?.current)) &&
      this.fallback.length
    )
      return this.fallback

    const rows = new Map<string, PanelResource>()

    for (const page of this.pages)
      for (const row of page.current?.data ?? []) rows.set(row.id, row)

    return [...rows.values()]
  }

  /** Whether results can be shown, including a settled empty result or failure. */
  get isInitialised(): boolean {
    return (
      this.rows.length > 0 ||
      (!this.loading && (Boolean(this.pages[0]?.current) || Boolean(this.error)))
    )
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
    if (this.released) throw new Error('Resource list has been released')
    const key = JSON.stringify(input)
    if (
      !force &&
      this.input &&
      JSON.stringify(this.input) === key &&
      this.pages.length &&
      Date.now() - this.validatedAt < 60_000
    )
      return
    if (!force && this.loading && this.input && JSON.stringify(this.input) === key) {
      await this.pages[0]
      return
    }
    // Keep the displayed collection latched during view changes, never across access scopes.
    const sameScope =
      this.input?.type === input.type &&
      JSON.stringify(this.input?.meta) === JSON.stringify(input.meta)
    this.fallback = sameScope ? this.rows : []
    const generation = ++this.generation
    this.input = input
    this.error = null
    const retained = this.history.get(key)
    if (!force && retained && Date.now() - retained.fetchedAt < 60_000) {
      this.pages = retained.pages
      this.validatedAt = retained.fetchedAt
      this.loading = false
      return
    }
    const page = this.query(input)
    this.pages = [page]
    this.loading = true
    try {
      if (page.ready) await page.refresh()
      else await page
      if (generation !== this.generation) return
      this.validatedAt = Date.now()
      this.history.set(key, { pages: this.pages, fetchedAt: this.validatedAt })
      // Keep back-navigation retention bounded independently of the active traversal.
      while (this.history.size > 12) {
        const oldest = this.history.keys().next()
        if (oldest.done) break
        this.history.delete(oldest.value)
      }
    } catch (error) {
      if (generation === this.generation) {
        if ([401, 403, 404].includes((error as { status?: number })?.status ?? 0)) {
          this.fallback = []
          this.history.delete(key)
        }
        this.error = error
      }
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
    this.fallback = this.rows
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

  /** Revalidates visible collection data on focus after its one-minute freshness window. */
  async revalidate(): Promise<void> {
    if (this.loading || Date.now() - this.validatedAt < 60_000 || !this.pages.length)
      return
    if (this.input) await this.load(this.input, true).catch(() => {})
  }

  get search(): string {
    return this.input?.q ?? ''
  }

  /** Applies known list membership rules during an optimistic edit. */
  matches(row: PanelResource): boolean {
    const { conditions, q, prisms } = this.input ?? {}
    for (const field of ['isArchived', 'isPublished'] as const) {
      if (typeof conditions?.[field] === 'boolean' && row[field] !== conditions[field])
        return false
    }
    if (
      'organisationId' in row &&
      prisms?.organisation?.length &&
      !prisms.organisation.includes(row.organisationId)
    )
      return false
    if (
      'projectId' in row &&
      prisms?.project?.length &&
      !prisms.project.includes(row.projectId)
    )
      return false
    if (
      q &&
      !JSON.stringify(row.i18n ?? {})
        .toLocaleLowerCase()
        .includes(q.toLocaleLowerCase()) &&
      !('code' in row && row.code.toLocaleLowerCase().includes(q.toLocaleLowerCase()))
    )
      return false
    return true
  }

  /** Checks whether a pending create belongs in this unfiltered first page. */
  acceptsPending(patch: Record<string, unknown>): boolean {
    if (!this.input || this.input.q) return false

    const { organisation, project } = this.input.prisms ?? {}

    return (
      (!organisation?.length || organisation.includes(String(patch.organisationId))) &&
      (!project?.length || project.includes(String(patch.projectId)))
    )
  }

  /** Rebuilds cursor boundaries after a committed membership or ordering change. */
  async reconcile(): Promise<void> {
    this.history.clear()
    if (this.input) await this.load(this.input, true)
  }

  /** Invalidates retained membership after mutations, preserving visible native handles. */
  invalidate(): void {
    this.history.clear()
  }

  /** Clears scope-sensitive handles and supersedes pending page requests. */
  clear(): void {
    this.generation++
    this.visibleIds.clear()
    this.input = undefined
    this.fallback = []
    this.validatedAt = 0
    this.pages = []
    this.history.clear()
    this.loading = false
    this.error = null
  }
}
