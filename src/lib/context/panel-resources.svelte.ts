// SVELTE
import { untrack, onMount } from 'svelte'
// REMOTE
// TYPES
import type { AppCtx } from './app.svelte'
import type { PanelResource, PanelResourceType } from '$lib/types'

/**
 * Connects a panel's find-ahead search and pinned selection to native query results.
 * @param app - Instance-local application context.
 * @param type - Hierarchy resource being rendered.
 * @param search - Reactive search text getter.
 * @returns Reactive rows, traversal state and retry action.
 */
export function usePanelResources(
  app: AppCtx,
  type: PanelResourceType,
  search: () => string,
  slot: 'panel' | 'index' = 'panel',
) {
  const list =
    slot === 'index' ? app.cacheCtx.indexLists[type] : app.cacheCtx.lists[type]
  const input = $derived({
    ...app.panelResourceInput(type, search()),
    ...(slot === 'index'
      ? {
          profile: 'default' as const,
          sorting: app.state.viewSorting[type],
          conditions: {
            isPublished: app.state.viewFilters[type].isPublished,
            isArchived: app.state.viewFilters[type].isArchived,
          },
        }
      : {}),
  })
  const viewKey = $derived(JSON.stringify(input))
  const selected = $derived(
    slot === 'index'
      ? []
      : [
          ...new Set([
            ...app.state.prisms[type],
            ...(app.getActiveResourceType() === type && app.getActiveResourceId()
              ? [app.getActiveResourceId()!]
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
    for (const pin of pins)
      if (pin.current)
        byId.set(pin.current.id, pageRows.get(pin.current.id) ?? pin.current)
    for (const row of list.rows) if (!byId.has(row.id)) byId.set(row.id, row)
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
