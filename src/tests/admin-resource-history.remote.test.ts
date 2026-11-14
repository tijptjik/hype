// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
const { project, layer, hub, history } = vi.hoisted(() => ({
  project: vi.fn(),
  layer: vi.fn(),
  hub: vi.fn(),
  history: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse(value: unknown): unknown },
    handler: (value: unknown, ctx: unknown) => unknown,
  ) =>
    Object.assign((value: unknown, ctx: unknown) => handler(schema.parse(value), ctx), {
      __: { type: 'query' },
    }),
}))
vi.mock('#lib/db/services/project.js', () => ({ probeProjectForUpdate: project }))
vi.mock('#lib/db/services/layer.js', () => ({ probeLayerForUpdate: layer }))
vi.mock('#lib/db/services/hub.js', () => ({ probeHubForUpdate: hub }))
vi.mock('#lib/db/services/resourceHistory.js', () => ({
  listAdminResourceHistory: history,
  listPropertyCatalogHistory: vi.fn(),
}))
const staffHistory = vi.hoisted(() => vi.fn())
vi.mock('#lib/db/services/staffRoleHistory.js', () => ({
  listStaffRoleHistory: staffHistory,
}))
import { getAdminResourceHistory } from '#lib/api/adminResourceHistory.remote.js'
const read = getAdminResourceHistory as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
beforeEach(() => {
  vi.clearAllMocks()
  project.mockResolvedValue({ id: 'id', organisationId: 'o', hubId: 'h' })
  layer.mockResolvedValue({ id: 'id', organisationId: 'o', projectId: 'p', hubId: 'h' })
  hub.mockResolvedValue({ id: 'id' })
  history.mockResolvedValue({ available: true, entries: [], nextCursor: null })
})
it.each(['project', 'layer', 'hub'])(
  'denies ordinary public access to %s history',
  async resource => {
    await expect(
      read(
        { resource, id: 'id' },
        { db: {}, user: { id: 'u', isAnonymous: false }, userRoles: [] },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(history).not.toHaveBeenCalled()
  },
)
it.each(['project', 'layer', 'hub'])(
  'allows scoped admins and passes persisted %s ancestry',
  async resource => {
    const role =
      resource === 'hub'
        ? { type: 'hub', hubId: 'id', role: 'admin' }
        : { type: 'organisation', organisationId: 'o', role: 'owner' }
    await read(
      { resource, id: 'id', before: 9 },
      { db: {}, user: { id: 'u', isAnonymous: false }, userRoles: [role] },
    )
    expect(history).toHaveBeenCalledWith(
      {},
      {
        resource,
        id: 'id',
        before: 9,
        ...(resource === 'hub' ? {} : { organisationId: 'o', hubId: 'h' }),
        ...(resource === 'layer' ? { projectId: 'p' } : {}),
      },
    )
  },
)
it.each(['project', 'layer', 'hub'])(
  'rejects client-supplied scope and actor for %s',
  resource => {
    expect(() => read({ resource, id: 'id', hubId: 'h', actorId: 'u' }, {})).toThrow()
    expect(history).not.toHaveBeenCalled()
  },
)
it.each(['project', 'layer', 'hub'])(
  'denies out-of-scope administrators for %s',
  async resource => {
    await expect(
      read(
        { resource, id: 'id' },
        {
          db: {},
          user: { id: 'u', isAnonymous: false },
          userRoles: [{ type: 'hub', hubId: 'other', role: 'admin' }],
        },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(history).not.toHaveBeenCalled()
  },
)

it.each(['hub', 'project'] as const)(
  'protects %s staff history and passes persisted scope',
  async resource => {
    await expect(
      read(
        { resource, id: 'id', kind: 'staff' },
        { db: {}, user: { id: 'u', isAnonymous: false }, userRoles: [] },
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(staffHistory).not.toHaveBeenCalled()
    const role =
      resource === 'hub'
        ? { type: 'hub', hubId: 'id', role: 'admin' }
        : { type: 'organisation', organisationId: 'o', role: 'owner' }
    await read(
      { resource, id: 'id', kind: 'staff', before: 9 },
      { db: {}, user: { id: 'u', isAnonymous: false }, userRoles: [role] },
    )
    expect(staffHistory).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ resource, id: 'id', before: 9 }),
      expect.anything(),
    )
  },
)
it('rejects staff history for layers', async () => {
  await expect(
    read(
      { resource: 'layer', id: 'id', kind: 'staff' },
      { db: {}, user: { id: 'u' }, userRoles: [] },
    ),
  ).rejects.toMatchObject({ status: 400 })
})
