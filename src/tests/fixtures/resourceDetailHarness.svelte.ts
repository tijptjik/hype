// TYPES
import type { RemoteQuery } from '$app/server'

/**
 * Models native query refresh errors while retaining the last successful payload.
 * @param data Previously authorized payload.
 * @returns Reactive query and a controlled error-state setter.
 */
export function detailQueryProbe<T>(data: T): {
  query: RemoteQuery<{ data: T }>
  setError: (status?: number) => void
} {
  let failure: { status: number } | undefined = $state.raw()
  const query = Object.assign(Promise.resolve({ data }), {
    current: { data },
    refresh: async () => {
      if (failure) throw failure
    },
  })
  Object.defineProperty(query, 'error', { get: () => failure })
  return {
    query: query as unknown as RemoteQuery<{ data: T }>,
    setError: status => {
      failure = status === undefined ? undefined : { status }
    },
  }
}

/**
 * Observes the same reactive detail property consumed by rendered resource panels.
 * @param detail Active resource consumer.
 * @param observe Callback receiving its currently visible data.
 * @returns Effect cleanup.
 */
export function observeResourceDetail(
  detail: { readonly data: unknown },
  observe: (data: unknown) => void,
): () => void {
  return $effect.root(() => {
    $effect(() => observe(detail.data))
  })
}
