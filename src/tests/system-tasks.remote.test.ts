// @vitest-environment node
import { expect, it, vi } from 'vitest'
vi.mock('#lib/api/server/guarded', () => ({
  guardedCommand: (_schema: unknown, handler: unknown) =>
    Object.assign(handler as object, { __: { type: 'command', id: '', name: '' } }),
}))
import { reviewSystemTask } from '../lib/api/systemTasks.remote'

it.each([
  { isAdminRequest: true, user: { superAdmin: false, isAnonymous: false } },
  { isAdminRequest: false, user: { superAdmin: true, isAnonymous: false } },
  { isAdminRequest: true, user: { superAdmin: true, isAnonymous: true } },
])(
  'rejects system review before database access for unauthorized contexts',
  async context => {
    const update = vi.fn()
    const handler = reviewSystemTask as unknown as (
      input: unknown,
      context: unknown,
    ) => Promise<unknown>
    await expect(
      handler(
        { id: 'issue', expectedModifiedAt: '', outcome: 'accepted' },
        { ...context, db: { update } },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(update).not.toHaveBeenCalled()
  },
)
