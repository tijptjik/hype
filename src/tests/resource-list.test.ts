import { describe, expect, it, vi } from 'vitest'
import type { RemoteQuery } from '$app/server'
import type {
  ResourcePage,
  ResourcePageInput,
} from '#lib/api/services/resourcePage.types.js'
import { ResourceList } from '#lib/context/resource-list.svelte.js'

function controlledQuery() {
  let resolve!: (value: ResourcePage) => void
  let reject!: (error: unknown) => void
  const query = new Promise<ResourcePage>((done, fail) => {
    resolve = done
    reject = fail
  }) as RemoteQuery<ResourcePage>
  Object.assign(query, {
    ready: false,
    current: undefined,
    refresh: vi.fn(async () => {}),
  })
  return {
    query,
    reject,
    resolve: (value: ResourcePage) => {
      Object.assign(query, { current: value, ready: true })
      resolve(value)
    },
  }
}
const input: ResourcePageInput = {
  type: 'organisation',
  meta: { isAdminRequest: false, scope: 'a' },
}
const row = (id: string) => ({
  id,
  code: id,
  modifiedAt: '',
  isPublished: true,
  isArchived: false,
})

describe('native resource page traversal', () => {
  it('keeps old searches from replacing a newer view', async () => {
    const old = controlledQuery(),
      next = controlledQuery()
    const list = new ResourceList(
      vi.fn().mockReturnValueOnce(old.query).mockReturnValueOnce(next.query),
    )
    const olderLoad = list.load({ ...input, q: 'old' })
    const newerLoad = list.load({ ...input, q: 'new' })
    next.resolve({ data: [row('new')], nextCursor: null })
    await newerLoad
    old.resolve({ data: [row('old')], nextCursor: null })
    await olderLoad
    expect(list.rows.map(row => row.id)).toEqual(['new'])
  })

  it('fetches one next page for repeated near-end notifications and retains backwards pages', async () => {
    const first = controlledQuery(),
      second = controlledQuery()
    const fetcher = vi
      .fn()
      .mockReturnValueOnce(first.query)
      .mockReturnValueOnce(second.query)
    const list = new ResourceList(fetcher)
    const pending = list.load(input)
    first.resolve({ data: [row('a')], nextCursor: { id: 'a', signature: 'scope' } })
    await pending
    const more = list.next()
    await list.next()
    expect(fetcher).toHaveBeenCalledTimes(2)
    second.resolve({ data: [row('b')], nextCursor: null })
    await more
    expect(list.rows.map(row => row.id)).toEqual(['a', 'b'])
    await list.load(input)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(list.hasMore).toBe(false)
  })

  it('does not repopulate a cleared authorization scope from in-flight pages', async () => {
    const first = controlledQuery()
    const list = new ResourceList(() => first.query)
    const pending = list.load(input)
    list.clear()
    first.resolve({ data: [row('private')], nextCursor: null })
    await pending
    expect(list.rows).toEqual([])
    expect(list.loading).toBe(false)
  })

  it('revalidates a revisited view after one minute even when its arguments did not change', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      const first = controlledQuery()
      const list = new ResourceList(() => first.query)
      const initial = list.load(input)
      first.resolve({ data: [row('old')], nextCursor: null })
      await initial
      now.mockReturnValue(62_000)
      vi.mocked(first.query.refresh).mockImplementation(async () => {
        Object.assign(first.query, {
          current: { data: [row('new')], nextCursor: null },
        })
      })
      await list.load(input)
      expect(first.query.refresh).toHaveBeenCalledOnce()
      expect(list.rows.map(row => row.id)).toEqual(['new'])
    } finally {
      now.mockRestore()
    }
  })

  it('uses native refresh for an existing page and reads its current value', async () => {
    const first = controlledQuery()
    first.resolve({ data: [row('old')], nextCursor: null })
    vi.mocked(first.query.refresh).mockImplementation(async () => {
      Object.assign(first.query, { current: { data: [row('new')], nextCursor: null } })
    })
    const list = new ResourceList(() => first.query)
    await list.load(input, true)
    expect(first.query.refresh).toHaveBeenCalledOnce()
    expect(list.rows.map(row => row.id)).toEqual(['new'])
  })
})

it('latches displayed rows across prism changes until the replacement page resolves', async () => {
  const first = controlledQuery(),
    next = controlledQuery()
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValueOnce(next.query),
  )
  const initial = list.load(input)
  first.resolve({ data: [row('a'), row('b')], nextCursor: null })
  await initial
  const pending = list.load({ ...input, prisms: { organisation: ['a'] } })
  expect(list.loading).toBe(true)
  expect(list.rows.map(row => row.id)).toEqual(['a', 'b'])
  next.resolve({ data: [row('a')], nextCursor: null })
  await pending
  expect(list.rows.map(row => row.id)).toEqual(['a'])
})

it('does not latch rows across an authorization scope change', async () => {
  const first = controlledQuery(),
    next = controlledQuery()
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValueOnce(next.query),
  )
  const initial = list.load(input)
  first.resolve({ data: [row('private')], nextCursor: null })
  await initial
  const pending = list.load({ ...input, meta: { ...input.meta, scope: 'other' } })
  expect(list.rows).toEqual([])
  next.resolve({ data: [], nextCursor: null })
  await pending
  expect(list.rows).toEqual([])
})

it('keeps the index uninitialised until an empty first page settles', async () => {
  const first = controlledQuery()
  const list = new ResourceList(() => first.query)
  expect(list.isInitialised).toBe(false)
  const pending = list.load(input)
  expect(list.isInitialised).toBe(false)
  first.resolve({ data: [], nextCursor: null })
  await pending
  expect(list.isInitialised).toBe(true)
  list.clear()
  expect(list.isInitialised).toBe(false)
})

it('preserves populated results while the next view loads', async () => {
  const first = controlledQuery(),
    next = controlledQuery()
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValueOnce(next.query),
  )
  const pending = list.load(input)
  first.resolve({ data: [row('a')], nextCursor: null })
  await pending
  const changed = list.load({ ...input, q: 'new' })
  expect(list.isInitialised).toBe(true)
  next.resolve({ data: [], nextCursor: null })
  await changed
  expect(list.isInitialised).toBe(true)
  expect(list.rows).toEqual([])
})

it('identifies equivalent native pages across argument and nested key ordering', async () => {
  const first = controlledQuery()
  const second = controlledQuery()
  const a = new ResourceList(() => first.query)
  const b = new ResourceList(() => second.query)
  const pendingA = a.load({
    type: 'project',
    meta: { isAdminRequest: true, scope: 'admin' },
    conditions: { isArchived: false, isPublished: null },
  })
  const pendingB = b.load({
    conditions: { isPublished: null, isArchived: false },
    meta: { scope: 'admin', isAdminRequest: true },
    type: 'project',
  })
  first.resolve({ data: [], nextCursor: null })
  second.resolve({ data: [], nextCursor: null })
  await Promise.all([pendingA, pendingB])
  expect(a.pageIdentity(first.query)).toBe(b.pageIdentity(second.query))
})

it.each([401, 403, 404])(
  'hides retained rows on native denial %s and revalidates for recovery',
  async status => {
    const first = controlledQuery()
    const list = new ResourceList(() => first.query)
    const initial = list.load(input)
    first.resolve({
      data: [row('private')],
      nextCursor: { id: 'private', signature: 'scope' },
    })
    await initial
    Object.assign(first.query, { error: { status } })
    expect(list.rows).toEqual([])
    expect(list.hasMore).toBe(false)
    vi.mocked(first.query.refresh).mockImplementation(async () => {
      Object.assign(first.query, {
        error: undefined,
        current: { data: [row('recovered')], nextCursor: null },
      })
    })
    await list.load(input)
    expect(first.query.refresh).toHaveBeenCalledOnce()
    expect(list.rows.map(row => row.id)).toEqual(['recovered'])
  },
)

it('clears retained pages after an owned refresh denial', async () => {
  const first = controlledQuery()
  const list = new ResourceList(() => first.query)
  const initial = list.load(input)
  first.resolve({ data: [row('private')], nextCursor: null })
  await initial
  vi.mocked(first.query.refresh).mockRejectedValue({ status: 403 })
  await expect(list.refresh()).rejects.toEqual({ status: 403 })
  expect(list.rows).toEqual([])
  expect(list.retainedPages).toEqual([])
})

it('clears earlier pages when pagination is denied', async () => {
  const first = controlledQuery()
  const fetcher = vi.fn().mockReturnValueOnce(first.query)
  const list = new ResourceList(fetcher)
  const initial = list.load(input)
  first.resolve({
    data: [row('private')],
    nextCursor: { id: 'private', signature: 'scope' },
  })
  await initial
  fetcher.mockImplementation(() => {
    throw { status: 403 }
  })
  await list.next()
  expect(list.rows).toEqual([])
  expect(list.hasMore).toBe(false)
  expect(list.retainedPages).toEqual([])
})

it('hides a latched snapshot when its original native owner loses access', async () => {
  const first = controlledQuery(),
    replacement = controlledQuery()
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValueOnce(replacement.query),
  )
  const initial = list.load(input)
  first.resolve({ data: [row('private')], nextCursor: null })
  await initial
  const changed = list.load({ ...input, q: 'new' })
  expect(list.rows.map(row => row.id)).toEqual(['private'])
  Object.assign(first.query, { error: { status: 403 } })
  expect(list.denied).toBe(true)
  expect(list.rows).toEqual([])
  replacement.resolve({ data: [row('authorized')], nextCursor: null })
  await changed
  expect(list.denied).toBe(false)
  expect(list.rows.map(row => row.id)).toEqual(['authorized'])
})

it('keeps compatible rows after a transient refresh failure', async () => {
  const first = controlledQuery()
  const list = new ResourceList(() => first.query)
  const initial = list.load(input)
  first.resolve({ data: [row('available')], nextCursor: null })
  await initial
  Object.assign(first.query, { error: { status: 503 } })
  vi.mocked(first.query.refresh).mockRejectedValue({ status: 503 })
  await expect(list.refresh()).rejects.toEqual({ status: 503 })
  expect(list.rows.map(row => row.id)).toEqual(['available'])
})

it.each([false, true])(
  'joins the active first-page refresh (failure: %s)',
  async fails => {
    const first = controlledQuery()
    first.resolve({ data: [row('old')], nextCursor: null })
    const list = new ResourceList(() => first.query)
    await list.load(input)
    let finish!: () => void
    let reject!: (error: unknown) => void
    vi.mocked(first.query.refresh).mockImplementation(
      () =>
        new Promise<void>((resolve, fail) => {
          finish = resolve
          reject = fail
        }),
    )
    const outcome = (pending: Promise<void>) =>
      pending.then(
        () => 'success',
        error => error,
      )
    const refresh = outcome(list.refresh())
    let joinedFinished = false
    const joined = outcome(list.load(input)).then(result => {
      joinedFinished = true
      return result
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(joinedFinished).toBe(false)
    const failure = { status: 403 }
    if (fails) reject(failure)
    else {
      Object.assign(first.query, { current: { data: [row('new')], nextCursor: null } })
      finish()
    }
    expect(await refresh).toEqual(fails ? failure : 'success')
    expect(await joined).toEqual(fails ? failure : 'success')
    expect(list.rows.map(value => value.id)).toEqual(fails ? [] : ['new'])
  },
)

it('does not join an obsolete load after clear or let its completion detach the new load', async () => {
  const old = controlledQuery()
  const current = controlledQuery()
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(old.query)
    .mockReturnValueOnce(current.query)
  const list = new ResourceList(fetcher)
  const obsolete = list.load(input)
  list.clear()
  const pending = list.load(input)
  old.resolve({ data: [row('obsolete')], nextCursor: null })
  await obsolete
  let joinedFinished = false
  const joined = list.load(input).then(() => {
    joinedFinished = true
  })
  await Promise.resolve()
  await Promise.resolve()
  expect(joinedFinished).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(2)
  current.resolve({ data: [row('current')], nextCursor: null })
  await Promise.all([pending, joined])
  expect(list.rows.map(value => value.id)).toEqual(['current'])
})

it('drops old-scope pages when constructing the replacement query throws', async () => {
  const first = controlledQuery()
  first.resolve({ data: [row('private')], nextCursor: null })
  const failure = new Error('query construction failed')
  const replacement = controlledQuery()
  replacement.resolve({ data: [row('public')], nextCursor: null })
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(first.query)
    .mockImplementationOnce(() => {
      throw failure
    })
    .mockReturnValue(replacement.query)
  const list = new ResourceList(fetcher)
  await list.load(input)
  const changed = { ...input, meta: { ...input.meta, scope: 'new-account' } }
  await expect(list.load(changed)).rejects.toBe(failure)
  expect(list.rows).toEqual([])
  expect(list.error).toBe(failure)
  expect(list.loading).toBe(false)
  await list.load(changed)
  expect(list.rows.map(value => value.id)).toEqual(['public'])
})

it('settles loading when a throwing factory supersedes a pending request', async () => {
  const old = controlledQuery()
  const failure = new Error('replacement failed')
  const list = new ResourceList(
    vi
      .fn()
      .mockReturnValueOnce(old.query)
      .mockImplementation(() => {
        throw failure
      }),
  )
  const pending = list.load(input)
  await expect(list.load({ ...input, q: 'replacement' })).rejects.toBe(failure)
  expect(list.loading).toBe(false)
  expect(list.error).toBe(failure)
  old.resolve({ data: [row('old')], nextCursor: null })
  await pending
  expect(list.rows).toEqual([])
})

it('retains compatible previews after construction failure but retries instead of treating them as fresh', async () => {
  const first = controlledQuery()
  first.resolve({ data: [row('old')], nextCursor: null })
  const replacement = controlledQuery()
  replacement.resolve({ data: [row('new')], nextCursor: null })
  const failure = new Error('construction failed')
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(first.query)
    .mockImplementationOnce(() => {
      throw failure
    })
    .mockReturnValue(replacement.query)
  const list = new ResourceList(fetcher)
  await list.load(input)
  const changed = { ...input, q: 'new' }
  await expect(list.load(changed)).rejects.toBe(failure)
  expect(list.rows.map(value => value.id)).toEqual(['old'])
  expect(list.error).toBe(failure)
  await list.load(changed)
  expect(fetcher).toHaveBeenCalledTimes(3)
  expect(list.rows.map(value => value.id)).toEqual(['new'])
})

it('revalidates an already-resolved next-page handle before appending its rows', async () => {
  const first = controlledQuery()
  first.resolve({
    data: [row('first')],
    nextCursor: { id: 'first', signature: 'scope' },
  })
  const next = controlledQuery()
  next.resolve({ data: [row('stale')], nextCursor: null })
  vi.mocked(next.query.refresh).mockImplementation(async () => {
    Object.assign(next.query, { current: { data: [row('fresh')], nextCursor: null } })
  })
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValue(next.query),
  )
  await list.load(input)
  await list.next()
  expect(next.query.refresh).toHaveBeenCalledOnce()
  expect(list.rows.map(value => value.id)).toEqual(['first', 'fresh'])
})

it('does not append a retained next-page payload when its refresh denies access', async () => {
  const first = controlledQuery()
  first.resolve({
    data: [row('first')],
    nextCursor: { id: 'first', signature: 'scope' },
  })
  const next = controlledQuery()
  next.resolve({ data: [row('private')], nextCursor: null })
  vi.mocked(next.query.refresh).mockRejectedValue({ status: 403 })
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValue(next.query),
  )
  await list.load(input)
  await list.next()
  expect(list.rows).toEqual([])
  expect(list.error).toEqual({ status: 403 })
})

it('discards a retained next-page refresh after the view changes', async () => {
  const first = controlledQuery()
  first.resolve({
    data: [row('first')],
    nextCursor: { id: 'first', signature: 'scope' },
  })
  const next = controlledQuery()
  next.resolve({ data: [row('old-page')], nextCursor: null })
  let finish!: () => void
  vi.mocked(next.query.refresh).mockImplementation(
    () =>
      new Promise<void>(resolve => {
        finish = resolve
      }),
  )
  const replacement = controlledQuery()
  replacement.resolve({ data: [row('new-view')], nextCursor: null })
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(first.query)
    .mockReturnValueOnce(next.query)
    .mockReturnValue(replacement.query)
  const list = new ResourceList(fetcher)
  await list.load(input)
  const pagination = list.next()
  await list.load({ ...input, q: 'new-view' })
  finish()
  await pagination
  expect(list.rows.map(value => value.id)).toEqual(['new-view'])
  expect(list.loading).toBe(false)
})

it('does not let an unrelated previously visited page deny the current fallback', async () => {
  const a = controlledQuery(),
    b = controlledQuery(),
    c = controlledQuery()
  a.resolve({ data: [row('a')], nextCursor: null })
  b.resolve({ data: [row('b')], nextCursor: null })
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(a.query)
    .mockReturnValueOnce(b.query)
    .mockReturnValue(c.query)
  const list = new ResourceList(fetcher)
  await list.load({ ...input, q: 'a' })
  await list.load({ ...input, q: 'b' })
  await list.load({ ...input, q: 'a' })
  const pending = list.load({ ...input, q: 'c' })
  Object.assign(b.query, { error: { status: 403 } })
  expect(list.rows.map(value => value.id)).toEqual(['a'])
  c.resolve({ data: [row('c')], nextCursor: null })
  await pending
  expect(list.rows.map(value => value.id)).toEqual(['c'])
})

it('reflects native edits, removals and rollback while displaying a pending-search preview', async () => {
  const first = controlledQuery(),
    replacement = controlledQuery()
  const original = { data: [row('a'), row('b')], nextCursor: null }
  first.resolve(original)
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValue(replacement.query),
  )
  await list.load(input)
  const pending = list.load({ ...input, q: 'new' })
  Object.assign(first.query, {
    current: { data: [{ ...row('a'), code: 'edited' }], nextCursor: null },
  })
  expect(list.rows).toEqual([{ ...row('a'), code: 'edited' }])
  Object.assign(first.query, { current: original })
  expect(list.rows.map(value => value.id)).toEqual(['a', 'b'])
  replacement.resolve({ data: [], nextCursor: null })
  await pending
})

it('preserves native rollback identities across overlapping pending searches', async () => {
  const original = controlledQuery(),
    firstSearch = controlledQuery(),
    secondSearch = controlledQuery()
  const originalPage = { data: [row('a'), row('b')], nextCursor: null }
  original.resolve(originalPage)
  const list = new ResourceList(
    vi
      .fn()
      .mockReturnValueOnce(original.query)
      .mockReturnValueOnce(firstSearch.query)
      .mockReturnValue(secondSearch.query),
  )
  await list.load(input)
  const firstPending = list.load({ ...input, q: 'first' })
  Object.assign(original.query, { current: { data: [row('a')], nextCursor: null } })
  expect(list.rows.map(value => value.id)).toEqual(['a'])
  const secondPending = list.load({ ...input, q: 'second' })
  Object.assign(original.query, { current: originalPage })
  expect(list.rows.map(value => value.id)).toEqual(['a', 'b'])
  firstSearch.resolve({ data: [row('obsolete')], nextCursor: null })
  secondSearch.resolve({ data: [row('result')], nextCursor: null })
  await Promise.all([firstPending, secondPending])
  expect(list.rows.map(value => value.id)).toEqual(['result'])
})

it('keeps displayed preview owners reachable after history invalidation', async () => {
  const first = controlledQuery(),
    replacement = controlledQuery()
  first.resolve({ data: [row('visible')], nextCursor: null })
  const list = new ResourceList(
    vi.fn().mockReturnValueOnce(first.query).mockReturnValue(replacement.query),
  )
  await list.load(input)
  const pending = list.load({ ...input, q: 'replacement' })
  list.invalidate()
  expect(list.rows.map(value => value.id)).toEqual(['visible'])
  expect(list.retainedPages).toContain(first.query)
  replacement.resolve({ data: [], nextCursor: null })
  await pending
  expect(list.retainedPages).not.toContain(first.query)
  list.release()
  expect(list.retainedPages).toEqual([])
})

it.each(['load', 'revalidate'] as const)(
  'expires active freshness on invalidation before %s',
  async action => {
    const first = controlledQuery()
    first.resolve({ data: [row('old')], nextCursor: null })
    const list = new ResourceList(() => first.query)
    await list.load(input)
    vi.mocked(first.query.refresh)
      .mockClear()
      .mockImplementation(async () => {
        Object.assign(first.query, {
          current: { data: [row('new')], nextCursor: null },
        })
      })
    list.invalidate()
    expect(list.rows.map(value => value.id)).toEqual(['old'])
    if (action === 'load') await list.load(input)
    else await list.revalidate()
    expect(first.query.refresh).toHaveBeenCalledOnce()
    expect(list.rows.map(value => value.id)).toEqual(['new'])
  },
)

it('does not restore freshness when a read begun before invalidation finishes', async () => {
  const first = controlledQuery()
  const list = new ResourceList(() => first.query)
  const pending = list.load(input)
  list.invalidate()
  first.resolve({ data: [row('before-mutation')], nextCursor: null })
  await pending
  vi.mocked(first.query.refresh).mockImplementation(async () => {
    Object.assign(first.query, {
      current: { data: [row('after-mutation')], nextCursor: null },
    })
  })
  await list.load(input)
  expect(first.query.refresh).toHaveBeenCalledOnce()
  expect(list.rows.map(value => value.id)).toEqual(['after-mutation'])
})

it('does not renew first-page freshness when a later page finishes', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
  try {
    const first = controlledQuery()
    const second = controlledQuery()
    const other = controlledQuery()
    const fetcher = vi.fn((args: ResourcePageInput) =>
      args.q ? other.query : args.cursor ? second.query : first.query,
    )
    const list = new ResourceList(fetcher)
    const initial = list.load(input)
    first.resolve({ data: [row('old')], nextCursor: { id: 'old', signature: 'scope' } })
    await initial
    now.mockReturnValue(55_000)
    const more = list.next()
    second.resolve({ data: [row('later')], nextCursor: null })
    await more
    const away = list.load({ ...input, q: 'other' })
    other.resolve({ data: [row('other')], nextCursor: null })
    await away
    now.mockReturnValue(62_000)
    vi.mocked(first.query.refresh).mockImplementation(async () => {
      Object.assign(first.query, {
        current: { data: [row('updated')], nextCursor: null },
      })
    })
    await list.load(input)
    expect(first.query.refresh).toHaveBeenCalledOnce()
    expect(list.rows.map(entry => entry.id)).toEqual(['updated'])
  } finally {
    now.mockRestore()
  }
})

it('retries a failed forced refresh instead of restoring its older fresh history', async () => {
  const first = controlledQuery()
  const list = new ResourceList(() => first.query)
  const initial = list.load(input)
  first.resolve({ data: [row('old')], nextCursor: null })
  await initial
  const failure = new Error('temporary failure')
  vi.mocked(first.query.refresh).mockRejectedValueOnce(failure)
  await expect(list.load(input, true)).rejects.toBe(failure)
  expect(list.rows.map(entry => entry.id)).toEqual(['old'])
  vi.mocked(first.query.refresh).mockImplementation(async () => {
    Object.assign(first.query, {
      current: { data: [row('recovered')], nextCursor: null },
    })
  })
  await list.load(input)
  expect(first.query.refresh).toHaveBeenCalledTimes(2)
  expect(list.rows.map(entry => entry.id)).toEqual(['recovered'])
  expect(list.error).toBeNull()
})

it.each(['clear', 'release', 'new view'] as const)(
  'ignores a first-page failure after %s',
  async transition => {
    const old = controlledQuery()
    const fresh = controlledQuery()
    const list = new ResourceList(
      vi.fn().mockReturnValueOnce(old.query).mockReturnValueOnce(fresh.query),
    )
    const pending = list.load(input)
    if (transition === 'clear') list.clear()
    else if (transition === 'release') list.release()
    else {
      const next = list.load({ ...input, q: 'new' })
      fresh.resolve({ data: [row('new')], nextCursor: null })
      await next
    }
    old.reject({ status: 403 })
    await expect(pending).resolves.toBeUndefined()
    expect(list.error).toBeNull()
    expect(list.loading).toBe(false)
    expect(list.rows.map(value => value.id)).toEqual(
      transition === 'new view' ? ['new'] : [],
    )
    list.release()
  },
)

it('renders rows before the independent count and skips continuation counts', async () => {
  const count = controlledQuery(),
    first = controlledQuery(),
    second = controlledQuery()
  const fetcher = vi
    .fn()
    .mockReturnValueOnce(count.query)
    .mockReturnValueOnce(first.query)
    .mockReturnValueOnce(second.query)
  const list = new ResourceList(fetcher)
  const initial = list.load({ ...input, includeCount: true })
  first.resolve({
    data: [row('a')],
    totalCount: null,
    nextCursor: { id: 'a', signature: 'scope' },
  })
  await initial
  expect(list.rows).toHaveLength(1)
  expect(list.loading).toBe(false)
  expect(list.countLoading).toBe(true)
  expect(list.totalCount).toBeNull()
  count.resolve({ data: [], totalCount: 42, nextCursor: null })
  await count.query
  expect(list.totalCount).toBe(42)
  const more = list.next()
  expect(fetcher).toHaveBeenLastCalledWith(
    expect.objectContaining({ includeCount: false }),
  )
  second.resolve({ data: [row('b')], totalCount: null, nextCursor: null })
  await more
  expect(list.totalCount).toBe(42)
  list.invalidate()
  expect(list.totalCount).toBeNull()
  list.clear()
})

it('does not publish an obsolete count after switching filters', async () => {
  const oldCount = controlledQuery(),
    oldRows = controlledQuery()
  const newCount = controlledQuery(),
    newRows = controlledQuery()
  const list = new ResourceList(
    vi
      .fn()
      .mockReturnValueOnce(oldCount.query)
      .mockReturnValueOnce(oldRows.query)
      .mockReturnValueOnce(newCount.query)
      .mockReturnValueOnce(newRows.query),
  )
  const first = list.load({ ...input, includeCount: true })
  oldRows.resolve({ data: [row('old')], nextCursor: null })
  await first
  const next = list.load({ ...input, q: 'new', includeCount: true })
  newRows.resolve({ data: [row('new')], nextCursor: null })
  newCount.resolve({ data: [], totalCount: 1, nextCursor: null })
  await next
  oldCount.resolve({ data: [], totalCount: 99, nextCursor: null })
  await oldCount.query
  expect(list.totalCount).toBe(1)
  expect(list.rows.map(value => value.id)).toEqual(['new'])
})
