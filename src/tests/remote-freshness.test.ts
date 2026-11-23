import { expect, it, vi } from 'vitest'
import { invalidateRemoteFreshness, readFreshRemoteQuery } from '#lib/remote/index.js'

function nativeQuery() {
  const query = Object.assign(Promise.resolve({ version: 0 }), {
    ready: true,
    current: { version: 0 },
    refresh: vi.fn(async () => {
      query.current = { version: query.current.version + 1 }
    }),
  })
  return query
}

it('reuses a fresh native payload across consumers and revalidates after mutation', async () => {
  const query = nativeQuery()
  expect(await readFreshRemoteQuery(query)).toEqual({ version: 1 })
  expect(await readFreshRemoteQuery(query)).toEqual({ version: 1 })
  expect(query.refresh).toHaveBeenCalledOnce()
  invalidateRemoteFreshness()
  expect(await readFreshRemoteQuery(query)).toEqual({ version: 2 })
})

it('never restores a freshness stamp after a failed explicit refresh', async () => {
  const query = nativeQuery()
  await readFreshRemoteQuery(query)
  query.refresh.mockRejectedValueOnce(new Error('offline'))
  await expect(readFreshRemoteQuery(query, true)).rejects.toThrow('offline')
  expect(await readFreshRemoteQuery(query)).toEqual({ version: 2 })
  expect(query.refresh).toHaveBeenCalledTimes(3)
})

it('does not mark an in-flight response fresh across invalidation', async () => {
  let finish!: () => void
  const query = nativeQuery()
  query.refresh.mockImplementationOnce(
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      }),
  )
  const pending = readFreshRemoteQuery(query)
  invalidateRemoteFreshness()
  finish()
  await pending
  await readFreshRemoteQuery(query)
  expect(query.refresh).toHaveBeenCalledTimes(2)
})

it('refreshes a failed native handle even before its first successful payload', async () => {
  const query = Object.assign(nativeQuery(), {
    ready: false,
    error: new Error('offline'),
  })
  expect(await readFreshRemoteQuery(query, true)).toEqual({ version: 1 })
  expect(query.refresh).toHaveBeenCalledOnce()
})
