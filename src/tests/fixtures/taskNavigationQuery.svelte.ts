import type { RemoteQuery } from '$app/server'
import type { Task } from '#lib/db/zod/schema/task.types.js'

export const route = $state({
  params: { task: 'photo' },
  url: new URL('http://localhost/admin/tasks/photo'),
})
const states = $state<
  Record<
    string,
    { ready: boolean; error?: { message: string }; current?: { data: Task | null } }
  >
>({ photo: { ready: false }, missing: { ready: false } })
const queries = new Map<string, RemoteQuery<{ data: Task | null }>>()
/** Returns a controlled native-query-shaped handle.
 * @param params Task identity.
 * @returns Pending reactive query handle.
 */
export function getTask(params: { id: string }): RemoteQuery<{ data: Task | null }> {
  const { id } = params
  if (!queries.has(id)) {
    const promise = new Promise<{ data: Task | null }>(() => {})
    Object.defineProperties(promise, {
      current: { get: () => states[id].current },
      ready: { get: () => states[id].ready },
      loading: { get: () => !states[id].ready && !states[id].error },
      error: { get: () => states[id].error },
      refresh: {
        value: async () => {
          states[id] = { ready: false }
        },
      },
    })
    queries.set(id, promise as RemoteQuery<{ data: Task | null }>)
  }
  return queries.get(id)!
}
/** Fails the selected query.
 * @returns Nothing.
 */
export function fail(): void {
  states[route.params.task] = { ready: false, error: { message: 'Unavailable' } }
}
/** Completes a selected query with an empty response.
 * @param id Task identity.
 * @returns Nothing.
 */
export function finish(id: string): void {
  states[id] = { ready: true, current: { data: null } }
}
