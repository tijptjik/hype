type RemoteType = 'command' | 'form' | 'query' | 'query_batch'

type RemoteFunction<T extends (...args: never[]) => unknown> = T & {
  __: {
    type: RemoteType
    id: string
    name: string
  }
}

/**
 * Adds the remote metadata SvelteKit expects when initializing SSR remote modules in tests.
 */
export const withRemoteMeta = <T extends (...args: never[]) => unknown>(
  fn: T,
  type: RemoteType,
): RemoteFunction<T> =>
  Object.assign(fn, {
    __: {
      type,
      id: '',
      name: '',
    },
  })
