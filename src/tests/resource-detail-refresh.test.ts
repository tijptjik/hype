import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RemoteQuery } from '$app/server'
import { CacheCtx } from '#lib/context/cache.svelte.js'
import { ResourceClient } from '#lib/resources/resourceClient.svelte.js'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

function nativeQuery() {
  return Object.assign(Promise.resolve({ data: { id: 'one' } }), {
    current: { data: { id: 'one' } },
    ready: true,
    refresh: vi.fn(async () => {}),
  }) as unknown as RemoteQuery<{ data: { id: string } }>
}

afterEach(() => vi.restoreAllMocks())

describe('shared detail refresh ownership', () => {
  it('shares the first refresh across concurrent compatible consumers', async () => {
    const native = nativeQuery()
    const gate = deferred<void>()
    vi.mocked(native.refresh).mockReturnValue(gate.promise)
    const client = new ResourceClient(new CacheCtx(), () => 'public')
    const first = client.detail('project', { ref: 'one' }, () => native)
    const second = client.detail('project', { ref: 'one' }, () => native)
    const loads = [first.load(), second.load()]
    expect(native.refresh).toHaveBeenCalledOnce()
    gate.resolve()
    expect(await Promise.all(loads)).toEqual([{ id: 'one' }, { id: 'one' }])
  })

  it('does not refresh twice for an explicit first load', async () => {
    const native = nativeQuery()
    const detail = new ResourceClient(new CacheCtx(), () => 'public').detail(
      'project',
      {},
      () => native,
    )
    await detail.refresh()
    expect(native.refresh).toHaveBeenCalledOnce()
  })

  it('shares background revalidation while returning compatible snapshots immediately', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const native = nativeQuery()
    const client = new ResourceClient(new CacheCtx(), () => 'public')
    const first = client.detail('project', {}, () => native)
    const second = client.detail('project', {}, () => native)
    await first.load()
    now.mockReturnValue(302_000)
    const gate = deferred<void>()
    vi.mocked(native.refresh).mockClear().mockReturnValue(gate.promise)
    expect(await Promise.all([first.load(), second.load()])).toEqual([
      { id: 'one' },
      { id: 'one' },
    ])
    expect(native.refresh).toHaveBeenCalledOnce()
    gate.resolve()
    await first.refresh()
    expect(native.refresh).toHaveBeenCalledOnce()
  })

  it('awaits the native initial request instead of starting another request', async () => {
    const gate = deferred<{ data: { id: string } }>()
    const native = Object.assign(gate.promise, {
      ready: false,
      current: undefined,
      refresh: vi.fn(async () => {}),
    }) as unknown as RemoteQuery<{ data: { id: string } }>
    const detail = new ResourceClient(new CacheCtx(), () => 'public').detail(
      'project',
      {},
      () => native,
    )
    const load = detail.load()
    expect(native.refresh).not.toHaveBeenCalled()
    gate.resolve({ data: { id: 'one' } })
    Object.assign(native, { current: { data: { id: 'one' } }, ready: true })
    expect(await load).toEqual({ id: 'one' })
  })

  it('bypasses fresh retention after a shared native denial', async () => {
    const native = nativeQuery()
    const detail = new ResourceClient(new CacheCtx(), () => 'public').detail(
      'project',
      {},
      () => native,
    )
    await detail.load()
    Object.assign(native, { error: { status: 403 } })
    vi.mocked(native.refresh)
      .mockClear()
      .mockImplementation(async () => {
        Object.assign(native, {
          error: undefined,
          current: { data: { id: 'recovered' } },
        })
      })
    expect(await detail.load()).toEqual({ id: 'recovered' })
    expect(native.refresh).toHaveBeenCalledOnce()
  })

  it('runs every current consumer reconciliation callback after one shared refresh', async () => {
    const cache = new CacheCtx()
    const native = nativeQuery()
    const gate = deferred<void>()
    vi.mocked(native.refresh).mockReturnValue(gate.promise)
    const first = vi.fn(),
      second = vi.fn()
    const loads = [
      cache.ensureResource('same', () => native, first),
      cache.ensureResource('same', () => native, second),
    ]
    expect(native.refresh).toHaveBeenCalledOnce()
    gate.resolve()
    await Promise.all(loads)
    expect(first).toHaveBeenCalledExactlyOnceWith({ id: 'one' })
    expect(second).toHaveBeenCalledExactlyOnceWith({ id: 'one' })
  })
})

it('reports a shared denial to every waiting consumer and releases it for recovery', async () => {
  const cache = new CacheCtx()
  const native = nativeQuery()
  const gate = deferred<void>()
  vi.mocked(native.refresh).mockReturnValue(gate.promise)
  const first = vi.fn(),
    second = vi.fn()
  const outcome = Promise.allSettled([
    cache.ensureResource('same', () => native, first),
    cache.ensureResource('same', () => native, second),
  ])
  const error = { status: 403 }
  gate.reject(error)
  expect(await outcome).toEqual([
    { status: 'rejected', reason: error },
    { status: 'rejected', reason: error },
  ])
  expect(first).toHaveBeenCalledExactlyOnceWith(undefined)
  expect(second).toHaveBeenCalledExactlyOnceWith(undefined)
  const recovered = nativeQuery()
  expect(await cache.ensureResource('same', () => recovered, vi.fn())).toEqual({
    id: 'one',
  })
  expect(recovered.refresh).toHaveBeenCalledOnce()
})

it('joins a native refresh already started by another consumer before accepting retained current', async () => {
  const gate = deferred<{ data: { id: string } }>()
  const native = Object.assign(gate.promise, {
    ready: true,
    loading: true,
    current: { data: { id: 'old' } },
    refresh: vi.fn(async () => {}),
  })
  const cache = new CacheCtx()
  const commit = vi.fn()
  const load = cache.ensureResource('same', () => native, commit)
  expect(native.refresh).not.toHaveBeenCalled()
  expect(commit).not.toHaveBeenCalled()
  Object.assign(native, { current: { data: { id: 'new' } }, loading: false })
  gate.resolve({ data: { id: 'new' } })
  expect(await load).toEqual({ id: 'new' })
  expect(commit).toHaveBeenCalledExactlyOnceWith({ id: 'new' })
})

it('records forced refresh freshness so the next ordinary read does not refresh again', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
  const native = nativeQuery()
  const detail = new ResourceClient(new CacheCtx(), () => 'public').detail(
    'project',
    {},
    () => native,
  )
  await detail.load()
  now.mockReturnValue(302_000)
  vi.mocked(native.refresh).mockClear()
  await detail.refresh()
  await detail.load()
  expect(native.refresh).toHaveBeenCalledOnce()
})

it.each(['success', 'denial'] as const)(
  'does not return a superseded detail after same-scope reconciliation (%s)',
  async outcome => {
    const cache = new CacheCtx()
    const gate = deferred<void>()
    const stale = nativeQuery()
    vi.mocked(stale.refresh).mockReturnValue(gate.promise)
    const fresh = nativeQuery()
    Object.assign(fresh, { current: { data: { id: 'new' } } })
    const factory = vi.fn().mockReturnValueOnce(stale).mockReturnValueOnce(fresh)
    const client = new ResourceClient(cache, () => 'admin')
    const detail = client.detail('project', { ref: 'one' }, factory)
    try {
      const pending = detail.load()
      await cache.reconcile('project')
      if (outcome === 'success') gate.resolve()
      else gate.reject({ status: 403 })
      expect(await pending).toBeUndefined()
      expect(detail.data).toBeUndefined()
      expect(await detail.load()).toEqual({ id: 'new' })
      expect(factory).toHaveBeenCalledTimes(2)
    } finally {
      client.release()
    }
  },
)

it('keeps a replacement detail when its superseded read finishes later', async () => {
  const cache = new CacheCtx()
  const gate = deferred<void>()
  const stale = nativeQuery()
  vi.mocked(stale.refresh).mockReturnValue(gate.promise)
  const fresh = nativeQuery()
  Object.assign(fresh, { current: { data: { id: 'new' } } })
  const factory = vi.fn().mockReturnValueOnce(stale).mockReturnValueOnce(fresh)
  const client = new ResourceClient(cache, () => 'admin')
  const detail = client.detail('project', { ref: 'one' }, factory)
  try {
    const pending = detail.load()
    await cache.reconcile('project')
    expect(await detail.load()).toEqual({ id: 'new' })
    gate.resolve()
    expect(await pending).toBeUndefined()
    expect(detail.data).toEqual({ id: 'new' })
  } finally {
    client.release()
  }
})

it.each(['release', 'scope change', 'replacement load'] as const)(
  'ignores a rejected read after %s',
  async transition => {
    const cache = new CacheCtx()
    const gate = deferred<void>()
    const stale = nativeQuery()
    vi.mocked(stale.refresh).mockReturnValue(gate.promise)
    const fresh = nativeQuery()
    Object.assign(fresh, { current: { data: { id: 'new' } } })
    let scope = 'scope-a'
    const client = new ResourceClient(cache, () => scope)
    const factory = vi.fn().mockReturnValueOnce(stale).mockReturnValueOnce(fresh)
    const detail = client.detail('project', { ref: 'one' }, factory)
    try {
      const pending = detail.load()
      if (transition === 'release') detail.release()
      else scope = 'scope-b'
      if (transition === 'replacement load')
        expect(await detail.load()).toEqual({ id: 'new' })
      gate.reject({ status: 403 })
      await expect(pending).resolves.toBeUndefined()
      expect(detail.error).toBeNull()
      expect(detail.loading).toBe(false)
      if (transition === 'replacement load') expect(detail.data).toEqual({ id: 'new' })
    } finally {
      client.release()
    }
  },
)

it('still reports a rejected read owned by the current detail', async () => {
  const cache = new CacheCtx()
  const native = nativeQuery()
  const failure = { status: 403 }
  vi.mocked(native.refresh).mockRejectedValue(failure)
  const client = new ResourceClient(cache, () => 'admin')
  const detail = client.detail('project', { ref: 'one' }, () => native)
  try {
    await expect(detail.load()).rejects.toBe(failure)
    expect(detail.error).toEqual(failure)
    expect(detail.data).toBeUndefined()
    expect(detail.loading).toBe(false)
  } finally {
    client.release()
  }
})

it('keeps an active detail pinned across reload when inactive retention is full', async () => {
  const cache = new CacheCtx()
  const client = new ResourceClient(cache, () => 'admin')
  const native = nativeQuery()
  const factory = vi.fn(() => native)
  const active = client.detail('project', { ref: 'active' }, factory)
  try {
    await active.load()
    for (let index = 0; index < 128; index++) {
      const inactive = client.detail(
        'project',
        { ref: `inactive-${index}` },
        nativeQuery,
      )
      await inactive.load()
      inactive.release()
    }
    await active.load()
    expect(factory).toHaveBeenCalledOnce()
    expect(native.refresh).toHaveBeenCalledOnce()
    // Releasing the real consumer must still make its oldest entry eligible for eviction.
    active.release()
    const replacement = client.detail('project', { ref: 'active' }, factory)
    await replacement.load()
    expect(factory).toHaveBeenCalledTimes(2)
  } finally {
    client.release()
  }
})
