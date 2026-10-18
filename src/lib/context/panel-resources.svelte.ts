// CONTEXT
import { getSurfaceNavigation } from '#lib/context/surfaceNavigation.svelte.js'
// SVELTE
import { untrack, onMount, onDestroy } from 'svelte'
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
 * @returns Reactive rows, traversal state and retry action.
 */
export function usePanelResources(
  app: ResourceViewCtx,
  type: PanelResourceType,
  search: () => string,
  slot: 'panel' | 'index' = 'panel',
) {
  const navigation = getSurfaceNavigation()
  const list = app.resources.createCollection(type)
  onDestroy(() => list.release())
  const input = $derived({
    ...app.filters.panelResourceInput(type, search()),
    ...(slot === 'index'
      ? {
          profile: 'default' as const,
          sorting: app.filters.sorting[type],
          conditions: {
            isPublished: app.filters.viewFilters[type].isPublished,
            isArchived: app.filters.viewFilters[type].isArchived,
          },
        }
      : {}),
  })
  const viewKey = $derived(JSON.stringify(input))
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
  const pins = $derived(selected.map(id => app.cacheCtx.pin(type, id, input.meta)))
  $effect(() => {
    const next = input
    const timer = setTimeout(
      () => {
        void list.load(next).catch(() => {})
      },
      next.q ? 200 : 0,
    )
    return () => clearTimeout(timer)
  })
  onMount(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void list.revalidate()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  })
  const rows = $derived.by(() => {
    const byId = new Map<string, PanelResource>()
    const pageRows = new Map(list.rows.map(row => [row.id, row]))
    // Only prism selections lead the list; navigation keeps paged rows in their existing order.
    for (const pin of pins)
      if (pin.current && app.scope.prisms[type].includes(pin.current.id))
        byId.set(pin.current.id, pageRows.get(pin.current.id) ?? pin.current)
    for (const row of list.rows) if (!byId.has(row.id)) byId.set(row.id, row)
    // Retain an off-page active resource without promoting it above the current page.
    for (const pin of pins)
      if (pin.current && !byId.has(pin.current.id))
        byId.set(pin.current.id, pin.current)
    return [...byId.values()]
  })
  $effect(() => {
    const current = rows
    untrack(() => app.retainPanelRows(type, current))
  })
  return {
    list,
    get rows() {
      return rows
    },
    get viewKey() {
      return viewKey
    },
    retry: () => {
      void list.load(input, true).catch(() => {})
    },
  }
}
