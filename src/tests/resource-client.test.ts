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

it.each([401, 403, 404])(
  'hides shared retained details after a background %s response',
  async status => {
    const cache = new CacheCtx()
    const client = new ResourceClient(cache, () => 'admin')
    const data = { id: 'private' }
    const native = query({ data })
    const first = client.detail('project', { ref: 'private' }, () => native)
    const second = client.detail('project', { ref: 'private' }, () => native)
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      await first.load()
      await second.load()
      expect(first.data).toEqual(data)
      now.mockReturnValue(302_000)
      const failure = { status }
      vi.mocked(native.refresh).mockImplementation(async () => {
        // Native SvelteKit queries retain current data and set error after failed refresh.
        Object.assign(native, { error: failure })
        throw failure
      })
      expect(await first.load()).toBeUndefined()
      await vi.waitFor(() => expect(native.error).toEqual(failure))
      expect(first.data).toBeUndefined()
      expect(second.data).toBeUndefined()
      vi.mocked(native.refresh).mockImplementation(async () => {
        Object.assign(native, { error: undefined })
      })
      await first.load()
      expect(first.data).toEqual(data)
      expect(second.data).toEqual(data)
    } finally {
      now.mockRestore()
      client.release()
    }
  },
)

it('retains visible detail data after a transient background error', async () => {
  const cache = new CacheCtx()
  const native = query({ data: { id: 'retained' } })
  const client = new ResourceClient(cache, () => 'admin')
  const detail = client.detail('project', { ref: 'retained' }, () => native)
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
  try {
    await detail.load()
    now.mockReturnValue(302_000)
    vi.mocked(native.refresh).mockImplementation(async () => {
      Object.assign(native, { error: { status: 503 } })
      throw { status: 503 }
    })
    await detail.load()
    await vi.waitFor(() => expect(native.error).toEqual({ status: 503 }))
    expect(detail.data).toEqual({ id: 'retained' })
  } finally {
    now.mockRestore()
    client.release()
  }
})

describe('panel pin ownership', () => {
  it('keeps a query during same-flush ownership handoff', async () => {
    const cache = new CacheCtx({ pin: vi.fn(() => query(null)) } as never)
    const meta = { isAdminRequest: true, scope: 'admin' }
    const release = cache.retainPin('project', 'selected', meta)
    const selected = cache.pin('project', 'selected', meta)
    for (let index = 0; index < 160; index++) cache.pin('project', String(index), meta)
    release()
    const nextRelease = cache.retainPin('project', 'selected', meta)
    await Promise.resolve()
    expect(cache.pin('project', 'selected', meta)).toBe(selected)
    nextRelease()
    await Promise.resolve()
    expect(cache.pin('project', 'selected', meta)).not.toBe(selected)
  })

  it('bounds inactive history while preserving shared active selections across cache resets', async () => {
    const pin = vi.fn(() => query(null))
    const cache = new CacheCtx({ pin } as never)
    const meta = { isAdminRequest: true, scope: 'admin' }
    const first = cache.retainPin('project', 'active', meta)
    const second = cache.retainPin('project', 'active', meta)
    let active = cache.pin('project', 'active', meta)
    first()
    first()
    for (let round = 0; round < 2; round++) {
      for (let index = 0; index < 160; index++) {
        const id = `visited-${round}-${index}`
        const release = cache.retainPin('project', id, meta)
        cache.pin('project', id, meta)
        release()
      }
      await Promise.resolve()
      expect(cache.pin('project', 'active', meta)).toBe(active)
      const calls = pin.mock.calls.length
      cache.pin('project', `visited-${round}-0`, meta)
      expect(pin).toHaveBeenCalledTimes(calls + 1)
      if (round === 0) {
        cache.clear()
        active = cache.pin('project', 'active', meta)
      }
    }
    second()
    await Promise.resolve()
    const calls = pin.mock.calls.length
    cache.pin('project', 'active', meta)
    expect(pin).toHaveBeenCalledTimes(calls + 1)
  })
})

it('exposes native page denial through the scoped collection facade', async () => {
  const native = query({ data: [], nextCursor: null })
  const cache = new CacheCtx({ page: () => native } as never)
  const client = new ResourceClient(cache, () => 'admin')
  const collection = client.createCollection('project')
  try {
    await collection.load()
    expect(collection.denied).toBe(false)
    Object.assign(native, { error: { status: 403 } })
    expect(collection.denied).toBe(true)
    Object.assign(native, { error: undefined })
    expect(collection.denied).toBe(false)
  } finally {
    client.release()
  }
})

it('preserves publication preview metadata in collection queries and removes it on exit', async () => {
  const page = vi.fn(() => query({ data: [{ id: 'preview-layer' }], nextCursor: null }))
  const cache = new CacheCtx({ page } as never)
  let preview: import('#lib/publication/preview.js').PublicationPreview | null = {
    type: 'project',
    id: 'draft-project',
    publishChildren: true,
  }
  const client = new ResourceClient(
    cache,
    () => `public:${JSON.stringify(preview)}`,
    cache.entities,
    () => false,
    () => preview,
  )
  const collection = client.createCollection('layer')
  try {
    await collection.load()
    expect(page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        meta: {
          scope: `public:${JSON.stringify(preview)}`,
          isAdminRequest: false,
          publicationPreview: preview,
        },
      }),
    )
    preview = null
    expect(collection.rows).toEqual([])
    await collection.revalidate()
    expect(page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        meta: { scope: 'public:null', isAdminRequest: false },
      }),
    )
  } finally {
    client.release()
  }
})

it('clears caller preview intent when binding metadata outside preview mode', () => {
  const cache = new CacheCtx()
  let preview: import('#lib/publication/preview.js').PublicationPreview | null = {
    type: 'project',
    id: 'draft',
    publishChildren: true,
  }
  const client = new ResourceClient(
    cache,
    () => 'public',
    cache.entities,
    () => false,
    () => preview,
  )
  const callerMeta = { profile: 'detail', ...client.queryMeta }
  preview = null
  const bound = { ...callerMeta, ...client.queryMeta }
  expect(bound.publicationPreview).toBeUndefined()
  expect(bound.profile).toBe('detail')
  expect(bound.isAdminRequest).toBe(false)
})

it('hides old collection failures as soon as its access scope changes', async () => {
  const failure = { status: 403, message: 'old account denied' }
  const native = query({ data: [], nextCursor: null })
  vi.mocked(native.refresh).mockRejectedValue(failure)
  const cache = new CacheCtx({ page: () => native } as never)
  let scope = 'old-account'
  const client = new ResourceClient(cache, () => scope)
  const collection = client.createCollection('project')
  try {
    await expect(collection.load()).rejects.toEqual(failure)
    expect(collection.error).toEqual(failure)
    scope = 'new-account'
    expect(collection.error).toBeNull()
    expect(collection.denied).toBe(false)
    expect(collection.isInitialised).toBe(false)
    vi.mocked(native.refresh).mockResolvedValue(undefined)
    await collection.refresh()
    expect(collection.error).toBeNull()
    expect(collection.isInitialised).toBe(true)
  } finally {
    client.release()
  }
})

it('does not report an old scope request as current collection loading', async () => {
  let finish!: () => void
  const native = query({ data: [], nextCursor: null })
  vi.mocked(native.refresh).mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      }),
  )
  const cache = new CacheCtx({ page: () => native } as never)
  let scope = 'old-account'
  const client = new ResourceClient(cache, () => scope)
  const collection = client.createCollection('project')
  const pending = collection.load()
  try {
    expect(collection.loading).toBe(true)
    scope = 'new-account'
    expect(collection.loading).toBe(false)
  } finally {
    finish()
    await pending
    client.release()
  }
})
