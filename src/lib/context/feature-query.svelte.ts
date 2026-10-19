import type { RemoteQuery } from '$app/server'

// +++ Table Of Contents
// ═══════════════════════
// TABLE OF CONTENTS
// ═══════════════════════
//
// 1. SHARED ENTITY RETENTION
// - FeatureQueryRetention
//
// 2. NATIVE FEATURE QUERY TRAVERSAL
// - FeatureQuery
// ---

// SERVICES
import {
  featureListMembershipKey,
  featureQueryKey,
  featureQueryScopeKey,
  matchesFeatureQuery,
} from '#lib/client/services/featureQuery.js'
// TYPES
import type { FeatureFromCollection } from '#lib/db/zod/schema/feature.types.js'

import type {
  FeatureQueryInput,
  FeatureQueryPage,
} from '#lib/api/services/featureQuery.types.js'
import type { FeatureQueryMatchContext } from '#lib/context/featureQuery.types.js'

// TYPES
/** Native remote queries own page payloads and concurrent request deduplication. */
type FeatureQueryFactory = (
  input: FeatureQueryInput,
) => import('$app/server').RemoteQuery<FeatureQueryPage>

/** Retained feature payloads expire using the collection freshness window. */
type FeatureQueryCachedEntity = {
  row: FeatureFromCollection
  fetchedAt: number
  meta: FeatureQueryInput['meta']
  listMemberships?: Record<string, number>
  /** Bounded native provenance reconnects restored map rows to refresh and optimistic updates. */
  nativeSource?: FeatureQueryNativePage
}

/** Exact page ownership retained for fresh shared entities without duplicating remote state. */
type FeatureQueryNativePage = {
  page: import('$app/server').RemoteQuery<FeatureQueryPage>
  input: FeatureQueryInput
  fetchedAt: number
}

/** Retained native handles for a previously visited query. */
type FeatureQueryHistory = {
  pages: import('$app/server').RemoteQuery<FeatureQueryPage>[]
  fetchedAt: number
}

const FRESHNESS_MS = 60_000
const MAX_RETAINED_ENTITIES = 2_000
const MAX_RETAINED_QUERIES = 12
const MAX_RETAINED_PAGES = 20
const MAX_MAP_MARKERS = 500
const MAP_PAGE_SIZE = 100

/********************
 *  1. SHARED ENTITY RETENTION
 ************/
// +++ Shared Entity Retention

/** Fresh collection payloads shared across independently traversed feature queries. */
export class FeatureQueryRetention {
  private entities = new Map<string, FeatureQueryCachedEntity>()
  private nativePages = new Map<RemoteQuery<FeatureQueryPage>, FeatureQueryNativePage>()

  /** Native owners for retained previews. @returns Unique authorized page handles. */
  get retainedPages(): RemoteQuery<FeatureQueryPage>[] {
    return [...this.nativePages.keys()]
  }

  /**
   * Retains complete server payloads with their exact authorized scope.
   * @param data - Features returned by a native query page.
   * @param input - Query that authorized and selected these records.
   * @param page - Optional native owner, retained within the existing page-count bound.
   * @returns Nothing.
   */
  retain(
    data: FeatureFromCollection[],
    input: FeatureQueryInput,
    page?: RemoteQuery<FeatureQueryPage>,
  ): void {
    const fetchedAt = Date.now()
    const scope = featureQueryScopeKey(input.meta)
    this.prune(fetchedAt)
    const nativeSource = page ? { page, input, fetchedAt } : undefined
    if (nativeSource) {
      this.nativePages.delete(nativeSource.page)
      this.nativePages.set(nativeSource.page, nativeSource)
    }
    for (const row of data) {
      const key = JSON.stringify([scope, row.id])
      const previous = this.entities.get(key)
      const memberships = Object.fromEntries(
        Object.entries(previous?.listMemberships ?? {}).filter(
          ([, checkedAt]) => fetchedAt - checkedAt < FRESHNESS_MS,
        ),
      )
      if (input.filters?.list)
        memberships[featureListMembershipKey(input.filters.list)] = fetchedAt
      // Move updated entities to the newest end of the bounded retention map.
      this.entities.delete(key)
      this.entities.set(key, {
        row,
        fetchedAt,
        meta: { ...input.meta },
        listMemberships: memberships,
        nativeSource,
      })
    }
    while (this.entities.size > MAX_RETAINED_ENTITIES) {
      const oldestKey = this.entities.keys().next().value
      if (oldestKey === undefined) break
      this.entities.delete(oldestKey)
    }
    this.pruneNativePages()
  }

  /**
   * Finds fresh known matches for an immediate preview without inventing query counts.
   * @param input - New complete query identity.
   * @param context - Known hierarchy and user-list facts.
   * @returns Fresh matching entities with their original validation timestamps.
   */
  preview(
    input: FeatureQueryInput,
    context: FeatureQueryMatchContext,
  ): FeatureQueryCachedEntity[] {
    this.prune(Date.now())

    const scope = featureQueryScopeKey(input.meta)

    return [...this.entities.values()]
      .filter(entry => {
        if (featureQueryScopeKey(entry.meta) !== scope) return false

        return matchesFeatureQuery(entry.row, input, {
          ...context,
          listMembership: (row, list) => {
            const known = context.listMembership?.(row, list)

            if (known !== undefined) return known

            const checkedAt = entry.listMemberships?.[featureListMembershipKey(list)]

            return checkedAt !== undefined && Date.now() - checkedAt < FRESHNESS_MS
              ? true
              : undefined
          },
        })
      })
      .sort((left, right) => left.row.id.localeCompare(right.row.id))
      .slice(0, input.limit ?? 100)
  }

  /**
   * Removes payloads that have passed the normal collection freshness window.
   * @param now - Current wall-clock time.
   * @returns Nothing.
   */
  private prune(now: number): void {
    for (const [key, entry] of this.entities)
      if (now - entry.fetchedAt >= FRESHNESS_MS) this.entities.delete(key)
    this.pruneNativePages()
  }

  /**
   * Releases unused or oldest native owners within the normal bounded cache lifetime.
   * @returns Nothing; retained entities never hold more than 20 distinct page handles.
   */
  private pruneNativePages(): void {
    const referenced = new Set(
      [...this.entities.values()].flatMap(entry =>
        entry.nativeSource ? [entry.nativeSource.page] : [],
      ),
    )

    for (const page of this.nativePages.keys())
      if (!referenced.has(page)) this.nativePages.delete(page)

    while (this.nativePages.size > MAX_RETAINED_PAGES) {
      const oldestPage = this.nativePages.keys().next().value
      if (!oldestPage) break
      this.nativePages.delete(oldestPage)
    }
    // Evict orphaned cache entries with their page; active map snapshots remain independently held.
    for (const [key, entry] of this.entities)
      if (entry.nativeSource && !this.nativePages.has(entry.nativeSource.page))
        this.entities.delete(key)
  }

  /**
   * Drops retained facts after mutations or an authorization transition.
   * @returns Nothing.
   */
  clear(): void {
    this.entities.clear()
    this.nativePages.clear()
  }
}

// ---
/********************
 *  2. NATIVE FEATURE QUERY TRAVERSAL
 ************/
// +++ Native Feature Query Traversal

/** Native handles own fetched pages; each controller owns its current query and preview. */
export class FeatureQuery {
  pages: RemoteQuery<FeatureQueryPage>[] = $state.raw([])

  /** Includes inactive queries when projecting an optimistic record change. @returns Unique handles. */
  get retainedPages(): RemoteQuery<FeatureQueryPage>[] {
    return [
      ...new Set([
        ...this.pages,
        ...[...this.history.values()].flatMap(entry => entry.pages),
      ]),
    ]
  }
  loading = $state(false)
  error: unknown = $state(null)
  /** Complete access identity of the active traversal. */
  get scope(): string | undefined {
    return this.input?.meta.scope
  }
  private input: FeatureQueryInput | undefined = $state.raw()
  private preview: FeatureQueryCachedEntity[] = $state.raw([])
  private validatedAt = 0
  private generation = 0
  private pendingPage: RemoteQuery<FeatureQueryPage> | undefined
  private history = new Map<string, FeatureQueryHistory>()
  private matchContext: FeatureQueryMatchContext = {}
  private mapRows: FeatureFromCollection[] = $state.raw([])
  private mapIncomingPage: RemoteQuery<FeatureQueryPage> | undefined = $state.raw()
  private mapPageInputs = new WeakMap<
    RemoteQuery<FeatureQueryPage>,
    FeatureQueryInput
  >()

  constructor(
    private readonly query: FeatureQueryFactory,
    private readonly retained = new FeatureQueryRetention(),
    private readonly context: () => FeatureQueryMatchContext = () => ({}),
    private readonly bounded = false,
  ) {}

  /** Ordered native results take precedence over duplicate optimistic cached matches. */
  get rows(): FeatureFromCollection[] {
    if (this.bounded) return this.visibleMapRows()
    const rows = new Map<string, FeatureFromCollection>()
    const list = this.input?.filters?.list
    const context = { ...this.context(), ...this.matchContext }
    for (const page of this.pages)
      for (const row of page.current?.data ?? [])
        if (!list || context.listMembership?.(row, list) !== false)
          rows.set(row.id, row)
    for (const entry of this.preview)
      if (
        Date.now() - entry.fetchedAt < FRESHNESS_MS &&
        !rows.has(entry.row.id) &&
        (!list || context.listMembership?.(entry.row, list) !== false)
      )
        rows.set(entry.row.id, entry.row)
    return [...rows.values()]
  }

  /** Total matching records from the server; a new uncached query remains unknown. */
  get totalCount(): number | null {
    if (this.bounded) return null
    return this.pages[0]?.current?.totalCount ?? null
  }

  /** Server aggregates for exactly the active query, never locally inferred counts. */
  get facets(): FeatureQueryPage['facets'] | null {
    if (this.bounded) return null
    return this.pages[0]?.current?.facets ?? null
  }

  /** Whether the server returned another cursor for this query. */
  get hasMore(): boolean {
    if (this.bounded && this.rows.length >= MAX_MAP_MARKERS) return false
    return Boolean(this.pages.at(-1)?.current?.nextCursor)
  }

  /** Current search term, useful to keep reactive consumers tied to the active query. */
  get search(): string {
    return this.input?.q ?? ''
  }

  /**
   * Checks that an app callback still belongs to this controller's active query.
   * @param input - Query whose asynchronous work is settling.
   * @returns Whether its full scope and selectors still identify the active view.
   */
  isCurrent(input: FeatureQueryInput): boolean {
    return Boolean(this.input && featureQueryKey(this.input) === featureQueryKey(input))
  }

  /**
   * Activates a complete query, showing fresh cached matches before its first page arrives.
   * @param input - Composed search, filter, spatial and authorization arguments.
   * @param force - Whether to bypass one-minute retained-query freshness.
   * @returns Completion of the first page; superseded results never change the active view.
   */
  async load(input: FeatureQueryInput, force = false): Promise<void> {
    if (this.bounded) return await this.loadMap(input, force)
    const key = featureQueryKey(input)
    const sameQuery = this.input && featureQueryKey(this.input) === key
    if (!force && sameQuery && this.loading) {
      await (this.pendingPage ?? this.pages[0])
      return
    }
    if (
      !force &&
      sameQuery &&
      this.pages.length &&
      this.validatedAt > 0 &&
      Date.now() - this.validatedAt < FRESHNESS_MS
    )
      return

    // Saved lists keep their committed page and count while a replacement is pending.
    const listId = input.filters?.list?.listId
    const preserveSavedList = listId === 'wishlist' || listId === 'visited'
    const sameScope =
      this.input &&
      featureQueryScopeKey(this.input.meta) === featureQueryScopeKey(input.meta)
    const keepPrevious =
      preserveSavedList && sameScope && this.input?.filters?.list?.listId === listId

    // Each query transition obtains its own preview and native first-page handle.
    const generation = ++this.generation
    this.input = { ...input, cursor: undefined }
    this.error = null
    if (!keepPrevious)
      this.preview = this.retained.preview(input, {
        ...this.context(),
        ...this.matchContext,
      })
    const history = this.history.get(key)
    if (!force && history && Date.now() - history.fetchedAt < FRESHNESS_MS) {
      this.pendingPage = undefined
      this.pages = history.pages
      this.validatedAt = history.fetchedAt
      this.loading = false
      return
    }
    this.history.delete(key)
    // Retained rows belong to the previous result; they cannot mark a failed replacement fresh.
    this.validatedAt = 0
    const page = this.query(this.input)
    this.pendingPage = page
    if (!preserveSavedList) this.pages = [page]
    else if (!keepPrevious) this.pages = []
    this.loading = true
    try {
      if (force || page.ready) await page.refresh()
      else await page
      if (generation !== this.generation) return
      if (preserveSavedList) {
        this.pages = [page]
        this.preview = []
      }
      this.validatedAt = Date.now()
      if (page.current) this.retained.retain(page.current.data, this.input, page)
      this.remember(key)
    } catch (error) {
      if (generation === this.generation) {
        this.error = error
        if ([401, 403, 404].includes((error as { status?: number })?.status ?? 0)) {
          this.pages = []
          this.preview = []
          this.retained.clear()
          this.history.clear()
        }
      }
      throw error
    } finally {
      if (generation === this.generation) {
        this.pendingPage = undefined
        this.loading = false
      }
    }
  }

  /**
   * Fetches one more page when the user requests more matching results.
   * @returns Completion of the next page; obsolete responses and duplicate triggers are ignored.
   */
  async next(): Promise<void> {
    if (this.bounded) {
      if (!this.loading && this.input && this.hasMore)
        await this.loadMap(this.input, true)
      return
    }
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
      if (page.current)
        this.retained.retain(page.current.data, { ...input, cursor }, page)
      this.remember(featureQueryKey(input))
    } catch (error) {
      if (generation === this.generation) {
        this.error = error
        if ([401, 403, 404].includes((error as { status?: number })?.status ?? 0)) {
          this.pages = []
          this.preview = []
          this.retained.clear()
          this.history.clear()
        }
      }
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }

  /**
   * Retains bounded inactive native-query traversal state.
   * @param key - Complete first-page query identity.
   * @returns Nothing.
   * @remarks Explicit user pagination can grow the active view; large traversals are not
   * retained when changing queries, and do not increase the shared entity-cache bound.
   */
  private remember(key: string): void {
    const now = Date.now()
    for (const [historyKey, history] of this.history)
      if (now - history.fetchedAt >= FRESHNESS_MS) this.history.delete(historyKey)
    this.history.delete(key)
    if (this.pages.length <= MAX_RETAINED_PAGES)
      this.history.set(key, { pages: this.pages, fetchedAt: this.validatedAt })
    while (
      this.history.size > MAX_RETAINED_QUERIES ||
      [...this.history.values()].reduce(
        (count, history) => count + history.pages.length,
        0,
      ) > MAX_RETAINED_PAGES
    ) {
      const oldestKey = this.history.keys().next().value
      if (oldestKey === undefined) break
      this.history.delete(oldestKey)
    }
  }

  /**
   * Revalidates an active query on focus after the regular freshness window.
   * @returns Completion of any needed refresh.
   */
  async revalidate(): Promise<void> {
    if (
      this.loading ||
      (this.validatedAt > 0 && Date.now() - this.validatedAt < FRESHNESS_MS) ||
      !this.input
    )
      return

    await this.load(this.input, true).catch(() => {})
  }

  /**
   * Tests a known row against current selectors for a native optimistic override.
   * @param row - Feature to evaluate.
   * @returns Whether its current fields satisfy the active query.
   */
  matches(row: FeatureFromCollection): boolean {
    const context = { ...this.context(), ...this.matchContext }
    return Boolean(
      this.input &&
        matchesFeatureQuery(row, this.input, {
          ...context,
          // Existing native page rows already have server-confirmed list membership.
          listMembership: (feature, list) =>
            context.listMembership?.(feature, list) ?? true,
        }),
    )
  }

  /**
   * Supplies current locally known hierarchy and list-membership facts for previews.
   * @param context - Resolver callbacks owned by the app's current user and hierarchy state.
   * @returns Nothing.
   */
  setMatchContext(context: FeatureQueryMatchContext): void {
    this.matchContext = context
    if (this.input && !this.bounded)
      this.preview = this.retained.preview(this.input, {
        ...this.context(),
        ...context,
      })
  }

  /**
   * Invalidates retained query freshness after a committed mutation.
   * @returns Nothing; visible native handles remain available until refreshed.
   */
  invalidate(): void {
    this.generation++
    this.pendingPage = undefined
    this.loading = false
    this.history.clear()
    this.validatedAt = 0
    this.preview = []
  }

  /**
   * Discards this view and supersedes in-flight requests without clearing other views.
   * @returns Nothing.
   */
  clear(): void {
    this.generation++
    this.pendingPage = undefined
    this.input = undefined
    this.preview = []
    this.mapRows = []
    this.mapIncomingPage = undefined
    this.pages = []
    this.history.clear()
    this.validatedAt = 0
    this.loading = false
    this.error = null
    this.matchContext = {}
  }

  /**
   * Keeps existing marker order while native page updates replace records by identity.
   * @returns At most 500 markers satisfying the current filters and exact viewport.
   * @remarks Visible markers survive the freshness window; leaving the viewport removes
   * them from this active set, and ordinary fresh entity retention enables return visits.
   */
  private visibleMapRows(): FeatureFromCollection[] {
    const input = this.input
    if (!input) return []
    const rows = new Map(this.mapRows.map(row => [row.id, row]))
    const context = { ...this.context(), ...this.matchContext }
    for (const page of this.pages) {
      const sourceList = this.mapPageInputs.get(page)?.filters?.list
      const currentList = input.filters?.list
      const sameList =
        sourceList &&
        currentList &&
        featureListMembershipKey(sourceList) === featureListMembershipKey(currentList)
      for (const row of page.current?.data ?? []) {
        // Older page handles may update retained IDs, but cannot revive stale offscreen rows.
        if (!rows.has(row.id) && page !== this.mapIncomingPage) continue
        if (
          matchesFeatureQuery(row, input, {
            ...context,
            listMembership: (feature, list) =>
              context.listMembership?.(feature, list) ??
              (rows.has(feature.id) || sameList ? true : undefined),
          })
        )
          rows.set(row.id, row)
        else rows.delete(row.id)
      }
    }

    return [...rows.values()]
      .filter(row =>
        matchesFeatureQuery(row, input, {
          ...context,
          // Active rows have already passed this query's list predicate on the server or cache.
          listMembership: (feature, list) =>
            context.listMembership?.(feature, list) ?? true,
        }),
      )
      .slice(0, MAX_MAP_MARKERS)
  }

  /**
   * Retains only native handles that can update currently visible marker records.
   * @param ids - Marker identities retained after viewport and filter matching.
   * @param candidates - Current and freshly restored native owners, in arrival order.
   * @returns Native handles in arrival order, bounded independently of marker snapshots.
   */
  private visibleMapPages(
    ids: Set<string>,
    candidates = this.pages,
  ): RemoteQuery<FeatureQueryPage>[] {
    const uncovered = new Set(ids)
    const pages: RemoteQuery<FeatureQueryPage>[] = []
    // Prefer the latest native owner of each ID while avoiding redundant old page payloads.
    for (const page of [...new Set(candidates)].reverse()) {
      if (!page.current?.data.some(row => uncovered.has(row.id))) continue
      pages.unshift(page)
      for (const row of page.current.data) uncovered.delete(row.id)
      if (pages.length >= MAX_RETAINED_PAGES || !uncovered.size) break
    }
    return pages
  }

  /**
   * Adds one page of new viewport markers after preserving visible and freshly cached matches.
   * @param input - Current viewport, filters and authorization scope before transport exclusions.
   * @param force - Whether ordinary staleness or an explicit refresh bypasses current-view reuse.
   * @returns Completion of at most 100 additional marker records, stopping at the 500-marker cap.
   */
  private async loadMap(input: FeatureQueryInput, force: boolean): Promise<void> {
    const sameQuery = this.isCurrent(input)
    if (!force && sameQuery && this.loading) {
      await this.pages.at(-1)
      return
    }

    if (
      !force &&
      sameQuery &&
      this.validatedAt > 0 &&
      Date.now() - this.validatedAt < FRESHNESS_MS
    )
      return

    const previousInput = this.input
    const sameScope =
      previousInput &&
      featureQueryScopeKey(previousInput.meta) === featureQueryScopeKey(input.meta)
    const previousRows = sameScope ? this.rows : []
    const context = { ...this.context(), ...this.matchContext }
    const sameList =
      previousInput?.filters?.list &&
      input.filters?.list &&
      featureListMembershipKey(previousInput.filters.list) ===
        featureListMembershipKey(input.filters.list)

    const rows = new Map(
      previousRows
        .filter(row =>
          matchesFeatureQuery(row, input, {
            ...context,
            listMembership: (feature, list) =>
              context.listMembership?.(feature, list) ?? (sameList ? true : undefined),
          }),
        )
        .map(row => [row.id, row]),
    )

    // Fresh cached matches fill available slots without moving markers already on screen.
    const cached = this.retained.preview({ ...input, limit: MAX_MAP_MARKERS }, context)
    for (const entry of cached) {
      if (rows.has(entry.row.id) || rows.size < MAX_MAP_MARKERS)
        rows.set(entry.row.id, entry.row)
    }

    const generation = ++this.generation
    this.input = { ...input, cursor: undefined }
    this.mapRows = [...rows.values()].slice(0, MAX_MAP_MARKERS)
    this.mapIncomingPage = undefined
    // Reattach fresh native provenance so cached markers remain editable and refreshable at the cap.
    const sources = cached
      .flatMap(entry =>
        rows.has(entry.row.id) && entry.nativeSource ? [entry.nativeSource] : [],
      )
      .sort((left, right) => left.fetchedAt - right.fetchedAt)

    for (const source of sources) this.mapPageInputs.set(source.page, source.input)

    this.pages = this.visibleMapPages(new Set(rows.keys()), [
      ...sources.map(source => source.page),
      ...(sameScope ? this.pages : []),
    ])
    this.preview = []
    this.error = null
    this.loading = true
    try {
      // Refresh existing native payloads in place so ordinary staleness never clears the map.
      if ((force || sameQuery) && this.pages.length) {
        await Promise.all(this.pages.map(page => page.refresh()))

        if (generation !== this.generation) return

        for (const page of this.pages)
          if (page.current)
            this.retained.retain(
              page.current.data,
              this.mapPageInputs.get(page) ?? input,
              page,
            )

        this.mapRows = this.rows
      }

      const visible = this.rows
      const limit = Math.min(
        input.limit ?? MAP_PAGE_SIZE,
        MAP_PAGE_SIZE,
        MAX_MAP_MARKERS - visible.length,
      )
      if (limit > 0) {
        const transportInput: FeatureQueryInput = {
          ...input,
          cursor: undefined,
          limit,
          includeCounts: false,
          excludeIds: [...new Set(visible.map(row => row.id))],
        }

        const page = this.query(transportInput)

        this.mapPageInputs.set(page, transportInput)
        this.mapIncomingPage = page
        this.pages = [...this.pages, page]

        if (page.ready) await page.refresh()
        else await page
        if (generation !== this.generation) return
        if (page.current) this.retained.retain(page.current.data, transportInput, page)

        this.mapRows = this.rows
        this.mapIncomingPage = undefined
        this.pages = this.visibleMapPages(new Set(this.mapRows.map(row => row.id)))
      }
      this.validatedAt = Date.now()
    } catch (error) {
      if (generation === this.generation) {
        this.error = error
        if ([401, 403, 404].includes((error as { status?: number })?.status ?? 0)) {
          this.mapRows = []
          this.mapIncomingPage = undefined
          this.pages = []
          this.retained.clear()
        }
      }
      throw error
    } finally {
      if (generation === this.generation) this.loading = false
    }
  }
}

// ---
