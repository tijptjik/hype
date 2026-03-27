type RemoteType = 'command' | 'form' | 'query'

type RemoteFunction<T extends (...args: any[]) => any> = T & {
  __: {
    type: RemoteType
    id: string
    name: string
  }
}

/**
 * Adds the remote metadata SvelteKit expects when initializing SSR remote modules in tests.
 */
export const withRemoteMeta = <T extends (...args: any[]) => any>(
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
