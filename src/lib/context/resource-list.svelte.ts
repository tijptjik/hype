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

/**
 * Canonicalizes JSON query arguments so equivalent native proxies share one identity.
 * @param value - Query arguments, including ordered cursors and access scope.
 * @returns JSON with recursively sorted object keys and unchanged array order.
 */
function resourceQueryIdentity(value: unknown): string {
  return JSON.stringify(value, (_key, child) =>
    child && typeof child === 'object' && !Array.isArray(child)
      ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
      : child,
  )
}

/**
 * Identifies failures that invalidate previously authorized collection data.
 * @param error - Native query or traversal failure.
 * @returns Whether retained rows must be hidden until authorization succeeds again.
 */
function isAccessDenied(error: unknown): boolean {
  return [401, 403, 404].includes((error as { status?: number })?.status ?? 0)
}

/** Native query handles own page data; this controller owns traversal and retained handles. */
export class ResourceList {
  pages: RemoteQuery<ResourcePage>[] = $state.raw([])
  loading = $state(false)
  error: unknown = $state(null)
  visibleIds = new Set<string>()
  private readonly pageIdentities = new WeakMap<RemoteQuery<ResourcePage>, string>()
  private generation = 0
  private invalidationRevision = 0
  private released = false
  private activeLoad: { key: string; promise: Promise<void> } | undefined
  private fallback: PanelResource[] = []
  private fallbackPages: RemoteQuery<ResourcePage>[] = []
  private fallbackOwners = new Map<string, RemoteQuery<ResourcePage>>()

  /**
   * Captures visible identity order while keeping payload ownership with native queries.
   * @param compatible Whether the previous access identity may supply previews.
   * @returns Nothing.
   */
  private captureFallback(compatible: boolean): void {
    // Preserve temporarily removed identities so native rollback survives another search.
    if (compatible && this.showingFallback) return
    const rows = compatible ? this.rows : []
    const owners = new Map<string, RemoteQuery<ResourcePage>>()
    const activeOwners = new Map<string, RemoteQuery<ResourcePage>>()
    for (const page of this.pages)
      for (const row of page.current?.data ?? []) activeOwners.set(row.id, page)
    for (const row of rows) {
      const owner = activeOwners.get(row.id) ?? this.fallbackOwners.get(row.id)
      if (owner) owners.set(row.id, owner)
    }
    this.fallback = rows
    this.fallbackOwners = owners
    this.fallbackPages = [...new Set(owners.values())]
  }
  private validatedAt = 0
  /** Whether the preview, rather than the active native page, supplies visible rows. */
  private get showingFallback(): boolean {
    return Boolean(
      (this.error || (this.loading && !this.pages[0]?.current)) && this.fallback.length,
    )
  }
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

  /** All retained native pages, including displayed previews and inactive queries. @returns Unique handles. */
  get retainedPages(): RemoteQuery<ResourcePage>[] {
    return [
      ...new Set([
        ...this.pages,
        ...this.fallbackPages,
        ...[...this.history.values()].flatMap(entry => entry.pages),
      ]),
    ]
  }

  /**
   * Identifies the underlying query independently of its native proxy object.
   * @param page Retained page handle.
   * @returns Complete query arguments, or the handle for externally supplied pages.
   * @remarks SvelteKit creates distinct proxies for identical query calls.
   */
  pageIdentity(page: RemoteQuery<ResourcePage>): string | RemoteQuery<ResourcePage> {
    return this.pageIdentities.get(page) ?? page
  }

  /** Whether an active page or currently displayed fallback has lost access. */
  get denied(): boolean {
    return (
      isAccessDenied(this.error) ||
      this.pages.some(page => isAccessDenied(page.error)) ||
      // A pending replacement can still be displaying a previously authorized page.
      (this.showingFallback &&
        this.fallbackPages.some(page => isAccessDenied(page.error)))
    )
  }

  /** Drops traversal retention after an access failure. @returns Nothing. */
  private discardDeniedPages(): void {
    this.fallback = []
    this.fallbackPages = []
    this.fallbackOwners.clear()
    this.pages = []
    this.history.clear()
    this.validatedAt = 0
  }

  /** Ordered current rows reflect native optimistic overrides without an AppCtx copy. */
  get rows(): PanelResource[] {
    if (this.denied) return []
    if (this.showingFallback) {
      const currentRows = new Map<string, PanelResource>()
      for (const page of this.fallbackPages)
        for (const row of page.current?.data ?? [])
          if (this.fallbackOwners.get(row.id) === page) currentRows.set(row.id, row)
      return this.fallback.flatMap(row => {
        const current = currentRows.get(row.id)
        return current ? [current] : []
      })
    }

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
    return !this.denied && Boolean(this.pages.at(-1)?.current?.nextCursor)
  }

  /**
   * Activates a view, retaining previously visited native handles for one-minute reuse.
   * @param input - Complete scope and search arguments.
   * @param force - Whether to bypass freshness and call native refresh.
   * @returns Completion of the current first page; obsolete completions are ignored.
   */
  async load(input: ResourcePageInput, force = false): Promise<void> {
    const key = resourceQueryIdentity(input)
    // Await controller completion, including refresh failures and state reconciliation.
    if (!force && this.activeLoad?.key === key) return this.activeLoad.promise
    const operation = { key, promise: this.performLoad(input, force) }
    this.activeLoad = operation
    try {
      await operation.promise
    } finally {
      if (this.activeLoad === operation) this.activeLoad = undefined
    }
  }

  /**
   * Activates and settles one first-page traversal operation.
   * @param input Complete query identity.
   * @param force Whether to bypass retained freshness.
   * @returns Completion after native refresh and local reconciliation.
   */
  private async performLoad(input: ResourcePageInput, force: boolean): Promise<void> {
    if (this.released) throw new Error('Resource list has been released')
    const key = resourceQueryIdentity(input)
    if (
      !force &&
      !this.denied &&
      this.input &&
      resourceQueryIdentity(this.input) === key &&
      this.pages.length &&
      Date.now() - this.validatedAt < 60_000
    )
      return
    if (
      !force &&
      this.loading &&
      this.input &&
      resourceQueryIdentity(this.input) === key
    ) {
      await this.pages[0]
      return
    }
    // Keep the displayed collection latched during view changes, never across access scopes.
    const sameScope =
      this.input?.type === input.type &&
      resourceQueryIdentity(this.input?.meta) === resourceQueryIdentity(input.meta)
    this.captureFallback(sameScope)
    const generation = ++this.generation
    const invalidationRevision = this.invalidationRevision
    this.input = input
    if (this.denied) this.discardDeniedPages()
    this.error = null
    const retained = this.history.get(key)
    if (
      !force &&
      retained &&
      !retained.pages.some(page => isAccessDenied(page.error)) &&
      Date.now() - retained.fetchedAt < 60_000
    ) {
      this.pages = retained.pages
      this.validatedAt = retained.fetchedAt
      // The retained view is authoritative; earlier preview owners no longer apply.
      this.fallback = []
      this.fallbackPages = []
      this.fallbackOwners.clear()
      this.loading = false
      return
    }
    // A replacement must earn freshness again, including after a failed forced refresh.
    this.history.delete(key)
    // Retire old native owners before construction can fail under the new identity.
    this.pages = []
    this.validatedAt = 0
    this.loading = true
    try {
      const page = this.query(input)
      this.pageIdentities.set(page, key)
      this.pages = [page]
      if (page.ready) await page.refresh()
      else await page
      if (generation !== this.generation) return
      this.fallback = []
      this.fallbackPages = []
      this.fallbackOwners.clear()
      // A read started before a mutation cannot renew the invalidated freshness window.
      if (invalidationRevision !== this.invalidationRevision) return
      this.validatedAt = Date.now()
      this.history.set(key, { pages: this.pages, fetchedAt: this.validatedAt })
      // Keep back-navigation retention bounded independently of the active traversal.
      while (this.history.size > 12) {
        const oldest = this.history.keys().next()
        if (oldest.done) break
        this.history.delete(oldest.value)
      }
    } catch (error) {
      // Obsolete traversals must not reject into the replacement view's error handling.
      if (generation !== this.generation) return
      if (isAccessDenied(error)) this.discardDeniedPages()
      this.error = error
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
    if (this.denied) return
    const cursor = this.pages.at(-1)?.current?.nextCursor
    if (this.loading || !this.input || !cursor) return
    const generation = this.generation
    const invalidationRevision = this.invalidationRevision
    const input = this.input
    this.captureFallback(true)
    this.loading = true
    this.error = null
    try {
      const pageInput = { ...input, cursor }
      const page = this.query(pageInput)
      this.pageIdentities.set(page, resourceQueryIdentity(pageInput))
      // A previously resolved cursor query may still hold pre-mutation or revoked data.
      if (page.ready) await page.refresh()
      else await page
      if (generation !== this.generation) return
      this.pages = [...this.pages, page]
      // Successful pagination supersedes its pre-request preview snapshot.
      this.fallback = []
      this.fallbackPages = []
      this.fallbackOwners.clear()
      if (invalidationRevision !== this.invalidationRevision) return
      this.history.set(resourceQueryIdentity(input), {
        pages: this.pages,
        // Appending a page does not revalidate the earlier pages in this traversal.
        fetchedAt: this.validatedAt,
      })
    } catch (error) {
      if (generation === this.generation) {
        if (isAccessDenied(error)) this.discardDeniedPages()
        this.error = error
      }
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }

  /** Revalidates visible collection data on focus after its one-minute freshness window. */
  async revalidate(): Promise<void> {
    if (
      this.loading ||
      (!this.denied && (Date.now() - this.validatedAt < 60_000 || !this.pages.length))
    )
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
    this.invalidationRevision++
    this.history.clear()
    this.validatedAt = Number.NEGATIVE_INFINITY
  }

  /** Clears scope-sensitive handles and supersedes pending page requests. */
  clear(): void {
    this.generation++
    this.activeLoad = undefined
    this.visibleIds.clear()
    this.input = undefined
    this.fallback = []
    this.fallbackPages = []
    this.fallbackOwners.clear()
    this.validatedAt = 0
    this.pages = []
    this.history.clear()
    this.loading = false
    this.error = null
  }
}
