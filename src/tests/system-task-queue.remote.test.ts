// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ listTasks: vi.fn(), listSystemTasks: vi.fn() }))
vi.mock('#lib/api/server/guarded.js', () => {
  const remote = (type: string) => (_schema: unknown, handler: object) =>
    Object.assign(handler, { __: { type, id: '', name: '' } })
  return {
    guardedQuery: remote('query'),
    guardedCommand: remote('command'),
    guardedForm: remote('form'),
  }
})
vi.mock('#lib/db/services/systemTask.js', () => ({
  listSystemTasks: mocks.listSystemTasks,
}))
vi.mock('#lib/db/services/task.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  listTasks: mocks.listTasks,
}))
vi.mock('#lib/api/services/task.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  toQueryConditions: () => ({ conditions: [], filtersToApply: {} }),
  toListResponseShape: (value: unknown) => value,
}))
import { getTasks } from '../lib/api/tasks.remote'
const handler = getTasks as unknown as (
  input: unknown,
  context: unknown,
) => Promise<{
  data: { id: string }[]
  systemTasks: { id: string }[]
  totalCount: number
}>
const context = (superAdmin: boolean) => ({
  db: {},
  user: { id: 'u', superAdmin, isAnonymous: false },
  userRoles: [{ type: 'organisation', role: 'owner', organisationId: 'org' }],
  isAdminRequest: true,
  event: { locals: { hub: { id: 'hub' } } },
})
beforeEach(() => {
  vi.clearAllMocks()
  mocks.listTasks.mockResolvedValue({
    data: [{ id: 'feature-task', type: 'newPhoto', modifiedAt: '2026-01-01' }],
    totalCount: 1,
  })
  mocks.listSystemTasks.mockResolvedValue([
    { id: 'map-task', type: 'map-correction-missing', modifiedAt: '2026-02-01' },
  ])
})
it('includes system rows in the super-admin total and combined pagination', async () => {
  const result = await handler(
    { pagination: { limit: 1 }, meta: { isAdminRequest: true } },
    context(true),
  )
  expect(result.totalCount).toBe(2)
  expect(result.systemTasks.map(row => row.id)).toEqual(['map-task'])
  expect(result.data).toEqual([])
})
it('does not query system storage for an ordinary organization owner', async () => {
  await handler({ meta: { isAdminRequest: true } }, context(false))
  expect(mocks.listSystemTasks).not.toHaveBeenCalled()
})
it('rejects a forged resource selector before reading system storage', async () => {
  await expect(handler({ resource: 'system' }, context(false))).rejects.toMatchObject({
    status: 403,
  })
  expect(mocks.listSystemTasks).not.toHaveBeenCalled()
})
it('system-only mode ignores stale feature type, action and hierarchy filters', async () => {
  const result = await handler(
    {
      resource: 'system',
      conditions: { type: 'newPhoto', reviewAction: 'ignored', isReviewed: false },
      prisms: { project: ['p'] },
    },
    context(true),
  )
  expect(mocks.listTasks).not.toHaveBeenCalled()
  expect(mocks.listSystemTasks).toHaveBeenCalledWith(
    {},
    expect.objectContaining({ isReviewed: false }),
  )
  expect(result.totalCount).toBe(1)
})
