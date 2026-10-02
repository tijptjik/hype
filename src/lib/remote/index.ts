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
