import { describe, expect, it, vi } from 'vitest'
import type { RemoteQuery } from '$app/server'
import { CacheCtx } from '#lib/context/cache.svelte.js'
import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'
import { RootCTX } from '#lib/context/root.svelte.js'
import type { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import type { SessionUser } from '#lib/types.js'

/** Supplies a native query whose payload and refresh are observable. */
function query<T>(data: T): RemoteQuery<T> {
  return Object.assign(Promise.resolve(data), {
    current: data,
    ready: true,
    refresh: vi.fn(async () => {}),
    withOverride: vi.fn(),
  }) as unknown as RemoteQuery<T>
}

describe('resource client ownership', () => {
  it('creates no queries or surface controllers until requested', async () => {
    const cache = new CacheCtx()
    const factory = vi.fn(() => query({ data: { id: 'one' } }))
    const client = new ResourceClient(cache, () => 'public')
    const detail = client.detail('project', { ref: 'one', profile: 'compact' }, factory)
    expect(factory).not.toHaveBeenCalled()
    expect(Object.keys(client.lists)).toEqual([])
    expect(Object.keys(client.featureQueries)).toEqual([])
    await cache.reconcile('project')
    expect(Object.keys(client.lists)).toEqual([])
    await detail.load()
    expect(factory).toHaveBeenCalledOnce()
    expect(detail.data).toEqual({ id: 'one' })
  })

  it('shares compatible native details while keeping consumers independent', async () => {
    const cache = new CacheCtx()
    const client = new ResourceClient(cache, () => 'public')
    const factory = vi.fn(() => query({ data: { id: 'one' } }))
    const first = client.detail('project', { ref: 'one' }, factory)
    const second = client.detail('project', { ref: 'one' }, factory)
    await first.load()
    await second.load()
    first.release()
    expect(first.data).toBeUndefined()
    expect(second.data).toEqual({ id: 'one' })
    expect(factory).toHaveBeenCalledOnce()
  })

  it('partitions detail handles by scope and profile', async () => {
    const cache = new CacheCtx()
    const factory = vi.fn(() => query({ data: { id: 'one' } }))
    for (const scope of ['public', 'admin']) {
      const client = new ResourceClient(cache, () => scope)
      for (const profile of ['compact', 'default']) {
        await client.detail('project', { ref: 'one', profile }, factory).load()
      }
    }
    expect(factory).toHaveBeenCalledTimes(4)
  })

  it('hides old data immediately on a cache scope reset', async () => {
    const cache = new CacheCtx()
    const detail = new ResourceClient(cache, () => 'admin').detail(
      'project',
      { ref: 'private' },
      () => query({ data: { id: 'private' } }),
    )
    await detail.load()
    expect(detail.data).toEqual({ id: 'private' })
    cache.clear()
    expect(detail.data).toBeUndefined()
  })

  it('discards a pending detail after identity changes', async () => {
    const cache = new CacheCtx()
    let finish!: () => void
    const native = query({ data: { id: 'old-user' } })
    vi.mocked(native.refresh).mockImplementation(
      () =>
        new Promise<void>(resolve => {
          finish = resolve
        }),
    )
    const detail = new ResourceClient(cache, () => 'scope').detail(
      'user',
      {},
      () => native,
    )
    const pending = detail.load()
    cache.clear()
    finish()
    expect(await pending).toBeUndefined()
    expect(detail.data).toBeUndefined()
  })

  it('does not refresh a released list and keeps another list active', async () => {
    const firstPage = query({ data: [], nextCursor: null })
    const secondPage = query({ data: [], nextCursor: null })
    const page = vi.fn().mockReturnValueOnce(firstPage).mockReturnValue(secondPage)
    const cache = new CacheCtx({ page, pin: vi.fn(), feature: vi.fn() })
    const client = new ResourceClient(cache, () => 'public')
    const first = client.createList('project')
    const second = client.createList('project')
    const meta = { isAdminRequest: false, scope: 'public' }
    await first.load({ type: 'project', q: 'first', meta })
    await second.load({ type: 'project', q: 'second', meta })
    expect(first.search).toBe('first')
    expect(second.search).toBe('second')
    first.release()
    vi.mocked(firstPage.refresh).mockClear()
    await cache.reconcile('project')
    expect(firstPage.refresh).not.toHaveBeenCalled()
    expect(page).toHaveBeenLastCalledWith({ type: 'project', q: 'second', meta })
  })

  it('keeps root caches request-local and invalidates on role changes', () => {
    const first = new RootCTX({} as ResponsiveCtx)
    const second = new RootCTX({} as ResponsiveCtx)
    expect(first.cacheCtx).not.toBe(second.cacheCtx)
    first.sync({ id: 'user', roles: [] } as unknown as SessionUser, null)
    const epoch = first.cacheCtx.generation
    const client = new ResourceClient(first.cacheCtx, () => 'admin:user')
    const originalScope = client.queryMeta.scope
    first.sync(
      {
        id: 'user',
        roles: [{ type: 'project', projectId: 'p', role: 'maintainer' }],
      } as unknown as SessionUser,
      null,
    )
    expect(first.cacheCtx.generation).toBeGreaterThan(epoch)
    expect(client.queryMeta.scope).not.toBe(originalScope)
    const roleScope = client.queryMeta.scope
    first.sync(
      { id: 'user', roles: [], superAdmin: true } as unknown as SessionUser,
      null,
    )
    expect(client.queryMeta.scope).not.toBe(roleScope)
    expect(second.cacheCtx.generation).toBe(0)
  })

  it('does not optimistically project admin fields into retained public details', async () => {
    const cache = new CacheCtx()
    const publicQuery = query({ data: { id: 'one', name: 'public' } })
    const adminQuery = query({ data: { id: 'one', name: 'admin' } })
    const publicClient = new ResourceClient(cache, () => 'public')
    const adminClient = new ResourceClient(cache, () => 'admin')
    await publicClient.detail('project', { ref: 'one' }, () => publicQuery).load()
    await adminClient.detail('project', { ref: 'one' }, () => adminQuery).load()
    const mutation = adminClient.beginMutation('project', {
      meta: { id: 'one' },
      data: { privateNote: 'admin only' },
    })
    expect(publicQuery.withOverride).not.toHaveBeenCalled()
    expect(adminQuery.withOverride).toHaveBeenCalledOnce()
    mutation.settle(false)
  })

  it('binds collection access metadata and hides rows after scope changes', async () => {
    const page = vi.fn(() => query({ data: [{ id: 'one' }], nextCursor: null }))
    const cache = new CacheCtx({ page: page as never, pin: vi.fn(), feature: vi.fn() })
    let scope = 'admin-one'
    const client = new ResourceClient(
      cache,
      () => scope,
      cache.entities,
      () => true,
    )
    const collection = client.createCollection('project', { profile: 'compact' })
    await collection.load({ q: 'needle' })
    expect(page).toHaveBeenCalledWith({
      type: 'project',
      q: 'needle',
      profile: 'compact',
      meta: { scope: 'admin-one', isAdminRequest: true },
    })
    expect(collection.rows).toHaveLength(1)
    scope = 'admin-two'
    expect(collection.rows).toEqual([])
    await collection.refresh()
    expect(page).toHaveBeenLastCalledWith(
      expect.objectContaining({ meta: { scope: 'admin-two', isAdminRequest: true } }),
    )
    client.release()
    await expect(collection.load()).rejects.toThrow('released')
  })
})
