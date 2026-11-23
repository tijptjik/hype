import type { ListResponse } from '#lib/types.js'

/**
 * Await a remote query result.
 *
 * Remote queries are directly awaitable on both the client and the server in
 * SvelteKit 2.61.0+, so this wrapper preserves existing call sites while using
 * the current invocation style.
 *
 * @param query Remote query promise.
 * @returns Resolved query result.
 */
export async function runRemoteQuery<T>(query: Promise<T>): Promise<T> {
  return await query
}

/**
 * Normalizes list-style remote responses so query consumers never receive an `undefined` `data` array after transport/runtime edge cases.
 *
 * @param result Remote list envelope, which may be partial or absent.
 * @returns A list response with `data` guaranteed to be an array.
 */
export function toSafeListResponse<T>(
  result: Partial<ListResponse<T>> | null | undefined,
): ListResponse<T> {
  const data = Array.isArray(result?.data) ? result.data : []

  return {
    data,
    limit: result?.limit,
    offset: result?.offset ?? 0,
    totalCount:
      typeof result?.totalCount === 'number' ? result.totalCount : data.length,
    hasMore: result?.hasMore ?? false,
    nextOffset: result?.nextOffset ?? null,
    sortBy: result?.sortBy,
    sortOrder: result?.sortOrder,
    appliedFilters: result?.appliedFilters,
    q: result?.q,
    durationMs: result?.durationMs,
  }
}

/**
 * Fetches the latest remote result, bypassing the framework's cached value.
 * @param query - Native query handle (plain promises are supported by test adapters).
 * @returns The current payload after refresh completes.
 */
export async function refreshRemoteQuery<T>(query: Promise<T>): Promise<T> {
  if ('refresh' in query && typeof query.refresh === 'function') {
    await query.refresh()
    if ('current' in query) return query.current as T
  }
  return await query
}

// Native handles retain payloads; this weak registry only records verified freshness.
let freshnessEpoch = 0
const freshResults = new WeakMap<object, { at: number; epoch: number }>()
// Keep a bounded set of browser-native handles alive across route unmounts.
const retainedQueries = new Map<object, { query: Promise<unknown>; at: number }>()

/** Invalidates quick-return freshness after mutations or identity changes.
 * @returns Nothing.
 */
export function invalidateRemoteFreshness(): void {
  freshnessEpoch++
  retainedQueries.clear()
}

/** Reuses a recently verified native payload, without keeping a second data cache.
 * @param query Native remote handle, or a promise supplied by tests.
 * @param force Whether a retry or explicit refresh must bypass the freshness window.
 * @returns Current response after any required read completes.
 * @remarks Errors, changed payload objects and mutations always require revalidation.
 */
export async function readFreshRemoteQuery<T>(
  query: Promise<T>,
  force = false,
): Promise<T> {
  for (const [payload, retained] of retainedQueries)
    if (Date.now() - retained.at >= 60_000) retainedQueries.delete(payload)
  const handle = query as Promise<T> & { current?: T; ready?: boolean; error?: unknown }
  const current = handle.current
  const ready = handle.ready ?? current !== undefined
  const stamp =
    current && typeof current === 'object' ? freshResults.get(current) : undefined
  if (
    !force &&
    ready &&
    !handle.error &&
    stamp?.epoch === freshnessEpoch &&
    Date.now() - stamp.at < 60_000
  )
    return current as T
  if (current && typeof current === 'object') freshResults.delete(current)
  const epoch = freshnessEpoch
  // Failed native handles retain their rejection until explicitly refreshed.
  const result = ready || handle.error ? await refreshRemoteQuery(query) : await query
  if (result && typeof result === 'object' && epoch === freshnessEpoch) {
    const at = Date.now()
    freshResults.set(result, { at, epoch })
    if (typeof window !== 'undefined') {
      retainedQueries.set(result, { query, at })
      while (retainedQueries.size > 32) {
        const oldest = retainedQueries.keys().next()
        if (oldest.done) break
        retainedQueries.delete(oldest.value)
      }
    }
  }
  return result
}
