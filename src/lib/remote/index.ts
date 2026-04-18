import type { ListResponse } from '$lib/types'

export type ImperativeRemoteQuery<T> = Promise<T> & {
  run?: () => Promise<T>
}

/**
 * Returns whether a remote query failed because `.run()` was invoked during render.
 *
 * @param error Unknown thrown value from a remote query execution.
 * @returns `true` when the error matches Svelte's client-side render restriction.
 */
export function isRenderBoundRemoteQueryError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes('On the client, .run() can only be called outside render')
  )
}

/**
 * Executes a remote query, falling back to awaiting the promise directly when `.run()`
 * is unavailable or render-bound on the client.
 *
 * @param query Remote query promise that may expose an imperative `.run()` method.
 * @returns Resolved query result.
 */
export async function runRemoteQuery<T>(query: ImperativeRemoteQuery<T>): Promise<T> {
  if (typeof query.run !== 'function') return await query

  try {
    return await query.run()
  } catch (error) {
    if (isRenderBoundRemoteQueryError(error)) {
      return await query
    }

    throw error
  }
}

/**
 * Normalizes list-style remote responses so query functions never hand TanStack
 * an `undefined` `data` array after transport/runtime edge cases.
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
