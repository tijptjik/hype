import { describe, expect, it, vi } from 'vitest'
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
