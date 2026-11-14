// TYPES
import type { LocationFacts } from './model.js'

export type ReconciliationCandidate = {
  id: string
  resourceReleaseId: string
  facts: LocationFacts
}
type Page = {
  rows: ReconciliationCandidate[]
  nextCursor: string | null
  partial: boolean
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const VERSION = 1
const MAX_AGE = 24 * 60 * 60 * 1000

/** Download complete search cohorts independently of any feature or radius.
 * @param storage Browser storage, or null when unavailable.
 * @returns A scoped cache with deduplicated downloads and progress subscriptions.
 * @remarks Only complete cohorts persist; canonical identity is still verified before linking.
 */
export function createReconciliationCache(storage: Store | null) {
  const running = new Map<
    string,
    {
      promise: Promise<ReconciliationCandidate[]>
      listeners: Set<(count: number) => void>
      count: number
    }
  >()
  const completed = new Map<
    string,
    { savedAt: number; rows: ReconciliationCandidate[] }
  >()
  return {
    /** Fetch or reuse every page for an exact search term.
     * @param scope Account/role scope.
     * @param query Search text, without a spatial constraint.
     * @param fetchPage Authorized upstream page reader.
     * @param progress Receives the unique downloaded count.
     * @returns Complete candidate cohort.
     */
    async get(
      scope: string,
      query: string,
      fetchPage: (cursor?: string) => Promise<Page>,
      progress: (count: number) => void,
    ): Promise<ReconciliationCandidate[]> {
      const key = `reconciliation-search:${VERSION}:${scope}:${query.trim()}`
      let cached = completed.get(key)
      if (!cached) {
        try {
          const value = JSON.parse(storage?.getItem(key) || 'null')
          if (
            value &&
            typeof value.savedAt === 'number' &&
            Array.isArray(value.rows) &&
            value.rows.every(
              (row: ReconciliationCandidate) =>
                typeof row.id === 'string' &&
                typeof row.resourceReleaseId === 'string' &&
                row.facts?.location?.geometry,
            )
          )
            cached = value
        } catch {
          /* Unavailable or invalid storage falls back to a fresh download. */
        }
      }
      if (cached && Date.now() - cached.savedAt < MAX_AGE) {
        completed.set(key, cached)
        progress(cached.rows.length)
        return cached.rows
      }
      let task = running.get(key)
      if (!task) {
        const listeners = new Set<(count: number) => void>()
        const state = {
          listeners,
          count: 0,
          promise: Promise.resolve([] as ReconciliationCandidate[]),
        }
        state.promise = (async () => {
          const rows = new Map<string, ReconciliationCandidate>()
          const cursors = new Set<string>()
          let cursor: string | undefined
          // Exhaust pagination before declaring the cohort complete or persisting it.
          do {
            const page = await fetchPage(cursor)
            if (page.partial) throw new Error('Incomplete upstream search')
            for (const row of page.rows) rows.set(row.id, row)
            state.count = rows.size
            for (const listener of listeners) listener(state.count)
            cursor = page.nextCursor ?? undefined
            if (cursor && cursors.has(cursor))
              throw new Error('Repeated upstream cursor')
            if (cursor) cursors.add(cursor)
          } while (cursor)
          const result = { savedAt: Date.now(), rows: [...rows.values()] }
          completed.set(key, result)
          try {
            storage?.setItem(key, JSON.stringify(result))
          } catch {
            /* Quota failures retain the session cache. */
          }
          return result.rows
        })().finally(() => running.delete(key))
        task = state
        running.set(key, task)
      }
      task.listeners.add(progress)
      progress(task.count)
      try {
        return await task.promise
      } finally {
        task.listeners.delete(progress)
      }
    },
  }
}
