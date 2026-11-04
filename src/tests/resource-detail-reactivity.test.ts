// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { CacheCtx } from '#lib/context/cache.svelte.js'
import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'

it('reactively hides and restores an active sibling consumer on native denial', async () => {
  const { flushSync } = await import('svelte')
  const { detailQueryProbe, observeResourceDetail } = await import(
    './fixtures/resourceDetailHarness.svelte.js'
  )
  const cache = new CacheCtx()
  const client = new ResourceClient(cache, () => 'admin')
  const native = detailQueryProbe({ id: 'private' })
  const first = client.detail('project', { ref: 'private' }, () => native.query)
  const sibling = client.detail('project', { ref: 'private' }, () => native.query)
  await first.load()
  await sibling.load()
  const observe = vi.fn()
  const stop = observeResourceDetail(sibling, observe)
  try {
    flushSync()
    expect(observe).toHaveBeenLastCalledWith({ id: 'private' })
    native.setError(403)
    flushSync()
    expect(observe).toHaveBeenLastCalledWith(undefined)
    native.setError()
    flushSync()
    expect(observe).toHaveBeenLastCalledWith({ id: 'private' })
  } finally {
    stop()
    client.release()
  }
})

it('reacquires an unchanged panel selection after clearing the account cache', async () => {
  const { flushSync } = await import('svelte')
  const { observeResourceDetail } = await import(
    './fixtures/resourceDetailHarness.svelte.js'
  )
  const pin = vi
    .fn()
    .mockReturnValueOnce({ current: { id: 'private' } })
    .mockReturnValueOnce({ current: undefined })
  const cache = new CacheCtx({ pin } as never)
  const observe = vi.fn()
  const stop = observeResourceDetail(
    {
      get data() {
        return cache.pin('project', 'private', { isAdminRequest: true, scope: 'admin' })
          .current
      },
    },
    observe,
  )
  try {
    flushSync()
    expect(observe).toHaveBeenLastCalledWith({ id: 'private' })
    cache.clear()
    flushSync()
    expect(pin).toHaveBeenCalledTimes(2)
    expect(observe).toHaveBeenLastCalledWith(undefined)
  } finally {
    stop()
  }
})
