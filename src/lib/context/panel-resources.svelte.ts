// SVELTE
import { untrack } from 'svelte'
// REMOTE
import { getPinnedResource } from '$lib/api/server/resources.remote'
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
) {
  const list = app.cacheCtx.lists[type]
  const input = $derived(app.panelResourceInput(type, search()))
  const viewKey = $derived(JSON.stringify(input))
  const selected = $derived(app.state.prisms[type])
  const pins = $derived(
    selected.map(id => getPinnedResource({ type, id, meta: input.meta })),
  )
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
  const rows = $derived.by(() => {
    const byId = new Map<string, PanelResource>()
    for (const pin of pins) if (pin.current) byId.set(pin.current.id, pin.current)
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
