// SVELTE
import { untrack } from 'svelte'
import { invalidateRemoteFreshness } from '#lib/remote/index.js'
// DOMAIN
import { FirstClassResource } from '#lib/enums.js'
import { matchesResourceIndexSearch } from '#lib/resources/indexQuery.js'
// TYPES
import type { AdminCtx } from '#lib/context/admin.svelte.js'
import type { Resource } from '#lib/types.js'

type AdminIndexQuery = {
  readonly rows: Resource[]
  readonly totalCount: number | null
  readonly countLoading: boolean
  readonly isInitialised: boolean
  readonly failed: boolean
  retry: () => Promise<void>
}

/** Connect smaller admin indexes to their existing authorized query owners.
 * @param admin Surface owning query metadata, rows and mutation reconciliation.
 * @param resource Index family.
 * @returns Optimistic rows, authoritative total, loading state and retry.
 * @remarks Identity and query changes invalidate counts before the debounce begins.
 */
export function useAdminIndexQuery(
  admin: AdminCtx,
  resource: 'hub' | 'task',
): AdminIndexQuery {
  const queryKey = $derived(
    resource === 'hub' ? admin.hubsQueryKey : admin.tasksQueryKey,
  )
  const key = $derived(JSON.stringify(queryKey))
  let settledKey = $state('')
  let ownerScope = $state('')
  let pending = $state(false)
  let failed = $state(false)
  let generation = 0

  /** Refresh the current scope through the same owner used by mutations.
   * @returns Completion after this request settles or becomes obsolete.
   */
  async function load(): Promise<void> {
    const request = ++generation
    const requestedKey = key
    const scope = admin.view.resources.scopeKey
    pending = true
    failed = false
    try {
      if (resource === 'hub') await admin.view.queries.refreshHubs(false)
      else await admin.view.queries.refreshTasks(false)
      if (request === generation && requestedKey === key) {
        settledKey = requestedKey
        ownerScope = scope
      }
    } catch {
      if (request === generation && requestedKey === key) failed = true
    } finally {
      if (request === generation && requestedKey === key) pending = false
    }
  }

  $effect(() => {
    key
    untrack(() => {
      generation++
      pending = true
      failed = false
    })
    const search = admin.view.filters.values[resource].text
    const timer = setTimeout(() => void load(), search?.trim() ? 200 : 0)
    return () => {
      clearTimeout(timer)
      generation++
    }
  })

  return {
    get rows() {
      if (ownerScope !== admin.view.resources.scopeKey) return []
      if (settledKey === key && !pending) return admin.view.queries.rows[resource]
      if (resource === 'hub')
        return admin.view.filters
          .applyHubViewFilters(admin.view.queries.rows.hub)
          .filter(row =>
            matchesResourceIndexSearch(row, admin.view.filters.values.hub.text ?? ''),
          )
      return admin.view.filters.getViewFilteredResource(FirstClassResource.task)
    },
    get totalCount(): number | null {
      return settledKey === key && !pending && !failed && !(resource === 'hub' && admin.hubCountLoading)
        ? (admin.view.getListQueryMeta(queryKey)?.totalCount ?? null)
        : null
    },
    get countLoading(): boolean {
      return !failed && (pending || settledKey !== key || (resource === 'hub' && admin.hubCountLoading))
    },
    get isInitialised(): boolean {
      return settledKey === key || failed
    },
    get failed(): boolean {
      return failed
    },
    retry: async () => {
      invalidateRemoteFreshness()
      await load()
    },
  }
}
