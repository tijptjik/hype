// CONTEXT
import { getSurfaceNavigation } from '#lib/context/surfaceNavigation.svelte.js'
// SVELTE
import { untrack, onMount, onDestroy } from 'svelte'
// INDEX SEARCH
import {
  matchesResourceIndexSearch,
  type ResourceIndexFilters,
} from '#lib/resources/indexQuery.js'
import type { Resource } from '#lib/types.js'
// REMOTE
// TYPES
import type { ResourceViewCtx } from './resourceView.svelte'
import type {
  PanelResource,
  PanelResourceType,
} from '#lib/api/services/resourcePage.types.js'

/**
 * Connects a panel's find-ahead search and pinned selection to native query results.
 * @param app - Instance-local application context.
 * @param type - Hierarchy resource being rendered.
 * @param search - Reactive search text getter.
 * @param slot - Panel selection or index filtering/count semantics.
 * @param active - Whether this consumer needs requests and focus refreshes.
 * @param debounceMs Quiet period; use zero when the caller already schedules search updates.
 * @returns Reactive rows, traversal state and retry action.
 */
export function usePanelResources(
  app: ResourceViewCtx,
  type: PanelResourceType,
  search: () => string,
  slot: 'panel' | 'index' = 'panel',
  active: () => boolean = () => true,
  debounceMs = 200,
) {
  const navigation = getSurfaceNavigation()
  const list = app.resources.createCollection(type)
  onDestroy(() => list.release())
  const input = $derived({
    ...app.filters.panelResourceInput(type, search()),
    ...(slot === 'index'
      ? {
          profile: 'default' as const,
          includeCount: true,
          // Retained query identities must not mutate when a nested toggle changes.
          indexFilters: JSON.parse(
            JSON.stringify(app.filters.viewFilters[type]),
          ) as ResourceIndexFilters,
          sorting: app.filters.sorting[type],
          conditions: {
            isPublished: app.filters.viewFilters[type].isPublished,
            isArchived: app.filters.viewFilters[type].isArchived,
          },
        }
      : {}),
  })
  const viewKey = $derived(JSON.stringify(input))
  let submittedKey = $state('')
  const activeResourceId = $derived(navigation.getActiveResourceId())
  const selected = $derived(
    slot === 'index'
      ? []
      : [
          ...new Set([
            ...app.scope.prisms[type],
            ...(navigation.getActiveResourceType() === type && activeResourceId
              ? [activeResourceId]
              : []),
          ]),
        ],
  )
  // Reading a native pin creates its query, so hidden panels must defer reads too.
  const pins = $derived(
    active() ? selected.map(id => app.cacheCtx.pin(type, id, input.meta)) : [],
  )
  $effect(() => {
    if (!active()) return
    const ids = selected
    const meta = input.meta
    const release = untrack(() => ids.map(id => app.cacheCtx.retainPin(type, id, meta)))
    return () =>
      release.forEach(detach => {
        detach()
      })
  })
  $effect(() => {
    if (!active()) return
    const next = input
    const timer = setTimeout(
      () => {
        submittedKey = viewKey
        void list.load(next).catch(() => {})
      },
      next.q ? debounceMs : 0,
    )
    return () => clearTimeout(timer)
  })
  /**
   * Refreshes the current traversal and its independently fetched selections.
   * @param force Whether to bypass traversal freshness for an explicit retry.
   * @returns Nothing; native query errors remain available to reactive consumers.
   */
  function refreshResources(force = false): void {
    if (!active()) return
    const next = input
    // Refresh only this panel's current pins; Kit coalesces shared native query requests.
    void Promise.allSettled([
      Promise.resolve().then(() => (force ? list.load(next, true) : list.revalidate())),
      ...pins.map(async pin => pin.refresh()),
    ])
  }
  onMount(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') refreshResources()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  })
  const rows = $derived.by(() => {
    // A denied collection must not be repopulated from older selection queries.
    if (list.denied) return []
    const byId = new Map<string, PanelResource>()
    // Native queries retain their last payload on failure; denied pins must not revive it.
    const denied = new Set(
      pins.flatMap((pin, index) =>
        [401, 403, 404].includes(
          (pin.error as { status?: number } | undefined)?.status ?? 0,
        )
          ? [selected[index]]
          : [],
      ),
    )
    const visiblePins = pins.filter((_, index) => !denied.has(selected[index]))
    const pageRows = new Map(
      list.rows.filter(row => !denied.has(row.id)).map(row => [row.id, row]),
    )
    // Only prism selections lead the list; navigation keeps paged rows in their existing order.
    for (const pin of visiblePins)
      if (pin.current && app.scope.prisms[type].includes(pin.current.id))
        byId.set(pin.current.id, pageRows.get(pin.current.id) ?? pin.current)
    for (const row of pageRows.values()) if (!byId.has(row.id)) byId.set(row.id, row)
    // Retain an off-page active resource without promoting it above the current page.
    for (const pin of visiblePins)
      if (pin.current && !byId.has(pin.current.id))
        byId.set(pin.current.id, pin.current)
    return [...byId.values()]
  })
  const previewRows = $derived.by(() => {
    if (slot !== 'index') return rows
    // Settled server membership is authoritative, even if related preview metadata is absent.
    if (submittedKey === viewKey && !list.loading && !list.error) return rows
    const searched = rows.filter(row => matchesResourceIndexSearch(row, search()))
    const apply = {
      organisation: app.filters.applyOrganisationViewFilters,
      project: app.filters.applyProjectViewFilters,
      layer: app.filters.applyLayerViewFilters,
    }[type]
    return apply(searched as Resource[]) as PanelResource[]
  })
  $effect(() => {
    const current = rows
    untrack(() => app.retainPanelRows(type, current))
  })
  return {
    list,
    // Include the debounce window so consumers do not mistake old rows for a completed search.
    get searchPending(): boolean {
      return active() && (submittedKey !== viewKey || list.loading)
    },
    get error(): unknown {
      return list.error ?? pins.find(pin => pin.error)?.error
    },
    get rows() {
      return previewRows
    },
    get totalCount(): number | null {
      return submittedKey === viewKey ? list.totalCount : null
    },
    get countLoading(): boolean {
      return submittedKey !== viewKey || list.countLoading
    },
    get viewKey() {
      return viewKey
    },
    retry: () => {
      refreshResources(true)
    },
  }
}
