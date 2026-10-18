import type { RemoteForm } from '$app/server'

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

/** Handler signatures installed by the guardedForm test mock. */
export type MockedRemoteModule<T> = {
  [K in keyof T]: T[K] extends RemoteForm<infer Input, infer Output>
    ? (input: unknown, invalid?: (message: string) => unknown) => Promise<Output>
    : T[K]
}

/**
 * Exposes callable form handlers installed by vi.mock in remote-module unit tests.
 * @param module The module imported after its guarded form factory was mocked.
 * @returns The same module with the mock handler signatures.
 * @remarks Only use with a guardedForm mock that returns the submission handler.
 */
export function mockedRemoteModule<T>(module: T): MockedRemoteModule<T> {
  return module as MockedRemoteModule<T>
}
