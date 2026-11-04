import { describe, expect, it, vi } from 'vitest'
import { getHubs } from '#lib/api/hub.remote.js'
import { getTasks } from '#lib/api/tasks.remote.js'
import { AdminCtx } from '#lib/context/admin.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'

vi.mock('#lib/api/tasks.remote.js', () => ({
  getTasks: vi.fn().mockResolvedValue({ data: [], totalCount: 0 }),
}))

describe('admin task prism queries', () => {
  it('invalidates the task query and sends selected layers when only layer prisms change', async () => {
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    try {
      const admin = new AdminCtx(view)
      const initialKey = JSON.stringify(admin.tasksQueryKey)
      view.scope.prisms.layer = ['bookshops']
      const selectedKey = JSON.stringify(admin.tasksQueryKey)
      expect(selectedKey).not.toBe(initialKey)
      await admin.tasksQueryFn()
      expect(getTasks).toHaveBeenLastCalledWith(
        expect.objectContaining({
          prisms: { organisation: [], project: [], layer: ['bookshops'] },
        }),
      )
      view.scope.prisms.layer = []
      expect(JSON.stringify(admin.tasksQueryKey)).toBe(initialKey)
    } finally {
      view.dispose()
    }
  })
})

vi.mock('#lib/api/hub.remote.js', () => ({ getHubs: vi.fn(), getHub: vi.fn() }))

it.each(['task', 'hub'] as const)(
  'keeps late %s metadata out of a changed query',
  async resource => {
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    vi.spyOn(view, 'isAdmin').mockReturnValue(true)
    const admin = new AdminCtx(view)
    let resolve!: (value: unknown) => void
    const pending = new Promise(resolvePromise => {
      resolve = resolvePromise
    })
    const remote = resource === 'task' ? getTasks : getHubs
    vi.mocked(remote).mockReturnValueOnce(pending as never)
    const write = vi.spyOn(view, 'setListQueryMeta')
    try {
      const read = resource === 'task' ? admin.tasksQueryFn() : admin.hubsQueryFn()
      view.filters.sorting[resource].sortOrder =
        view.filters.sorting[resource].sortOrder === 'asc' ? 'desc' : 'asc'
      resolve({ data: [], totalCount: 99 })
      await read
      expect(write).not.toHaveBeenCalled()
    } finally {
      view.dispose()
    }
  },
)

it.each(['task', 'hub'] as const)(
  'preserves newer %s metadata when an older read finishes last',
  async resource => {
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    vi.spyOn(view, 'isAdmin').mockReturnValue(true)
    const admin = new AdminCtx(view)
    let resolve!: (value: unknown) => void
    const pending = new Promise(resolvePromise => {
      resolve = resolvePromise
    })
    const remote = resource === 'task' ? getTasks : getHubs
    vi.mocked(remote)
      .mockReturnValueOnce(pending as never)
      .mockResolvedValueOnce({ data: [], totalCount: 2 } as never)
    try {
      const read =
        resource === 'task' ? () => admin.tasksQueryFn() : () => admin.hubsQueryFn()
      const older = read()
      await read()
      resolve({ data: [], totalCount: 99 })
      await older
      const key = resource === 'task' ? admin.tasksQueryKey : admin.hubsQueryKey
      expect(view.getListQueryMeta(key)?.totalCount).toBe(2)
    } finally {
      view.dispose()
    }
  },
)

it.each(['task', 'hub'] as const)(
  'rejects %s metadata after its surface is disposed',
  async resource => {
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    vi.spyOn(view, 'isAdmin').mockReturnValue(true)
    const admin = new AdminCtx(view)
    let resolve!: (value: unknown) => void
    const pending = new Promise(resolvePromise => {
      resolve = resolvePromise
    })
    vi.mocked(resource === 'task' ? getTasks : getHubs).mockReturnValueOnce(
      pending as never,
    )
    const write = vi.spyOn(view, 'setListQueryMeta')
    const read = resource === 'task' ? admin.tasksQueryFn() : admin.hubsQueryFn()
    view.dispose()
    resolve({ data: [], totalCount: 99 })
    await read
    expect(write).not.toHaveBeenCalled()
  },
)

it('does not let an obsolete forbidden task response clear newer metadata', async () => {
  const view = new ResourceViewCtx(
    new DivisionCtx(),
    new AccountState(),
    new ResponsiveCtx(),
    undefined,
    'admin',
  )
  const admin = new AdminCtx(view)
  let reject!: (reason: unknown) => void
  const pending = new Promise((_resolve, rejectPromise) => {
    reject = rejectPromise
  })
  vi.mocked(getTasks)
    .mockReturnValueOnce(pending as never)
    .mockResolvedValueOnce({ data: [], totalCount: 2 } as never)
  try {
    const older = admin.tasksQueryFn()
    await admin.tasksQueryFn()
    reject({ status: 403 })
    expect(await older).toEqual([])
    expect(view.getListQueryMeta(admin.tasksQueryKey)?.totalCount).toBe(2)
  } finally {
    view.dispose()
  }
})

it.each(['task', 'hub'] as const)(
  'scopes %s query metadata to the current account',
  resource => {
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    const admin = new AdminCtx(view)
    try {
      const key = resource === 'task' ? admin.tasksQueryKey : admin.hubsQueryKey
      view.setListQueryMeta(key, { data: [], totalCount: 99, hasMore: false })
      view.account.syncSession({ id: 'another-user' } as never)
      const nextKey = resource === 'task' ? admin.tasksQueryKey : admin.hubsQueryKey
      expect(view.getListQueryMeta(nextKey)).toBeNull()
    } finally {
      view.dispose()
    }
  },
)

it.each(['account', 'reset', 'dispose'] as const)(
  'clears retained metadata on %s transitions',
  transition => {
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    const key = view.featuresQueryKey()
    view.setListQueryMeta(key, { data: [], totalCount: 99, hasMore: false })
    try {
      if (transition === 'account') {
        vi.spyOn(view, 'postUserMutation').mockImplementation(() => {})
        view.account.syncSession({ id: 'another-user' } as never)
        view.syncAccount()
      } else if (transition === 'reset') view.clearAllCaches()
      else view.dispose()
      expect(view.getListQueryMeta(key)).toBeNull()
    } finally {
      if (transition !== 'dispose') view.dispose()
    }
  },
)
