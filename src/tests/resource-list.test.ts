import { describe, expect, it, vi } from 'vitest'
import type { RemoteQuery } from '$app/server'
import type {
  ResourcePage,
  ResourcePageInput,
} from '#lib/api/services/resourcePage.types.js'
import { ResourceList } from '#lib/context/resource-list.svelte.js'

function controlledQuery() {
  let resolve!: (value: ResourcePage) => void
  const query = new Promise<ResourcePage>(done => {
    resolve = done
  }) as RemoteQuery<ResourcePage>
  Object.assign(query, {
    ready: false,
    current: undefined,
    refresh: vi.fn(async () => {}),
  })
  return {
    query,
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
