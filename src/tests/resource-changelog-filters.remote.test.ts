// @vitest-environment node
// TESTS
import { beforeEach, expect, it, vi } from 'vitest'
const { history } = vi.hoisted(() => ({ history: vi.fn() }))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse(value: unknown): unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    Object.assign((input: unknown, ctx: unknown) => handler(schema.parse(input), ctx), {
      __: { type: 'query' },
    }),
  guardedCommand: () => Object.assign(vi.fn(), { __: { type: 'command' } }),
}))
vi.mock('#lib/db/services/layer.js', () => ({
  probeLayerForUpdate: vi
    .fn()
    .mockResolvedValue({ id: 'l', organisationId: 'o', projectId: 'p', hubId: 'h' }),
}))
vi.mock('#lib/db/services/resourceChangelog.js', () => ({
  listResourceChangelog: history,
  buildChangelogRootGuard: vi.fn(),
}))
vi.mock('#lib/db/services/userResourceCheckpoint.js', () => ({
  readUserResourceCheckpoint: vi.fn().mockResolvedValue(null),
  saveUserResourceCheckpoint: vi.fn(),
}))
vi.mock('#lib/properties/audience.server.js', () => ({
  getInternalPropertyAccess: vi
    .fn()
    .mockResolvedValue({ internal: new Set(), allowed: new Set() }),
}))
// API
import { getResourceChangelog } from '#lib/api/resourceChangelog.remote.js'

const read = getResourceChangelog as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const ctx = {
  db: { all: vi.fn().mockResolvedValue([]) },
  user: { id: 'editor', isAnonymous: false },
  userRoles: [{ type: 'organisation', organisationId: 'o', role: 'owner' }],
}
const base = { resource: 'layer', ref: 'layer-code', locale: 'en' }
beforeEach(() => {
  vi.clearAllMocks()
  history.mockResolvedValue({ entries: [], nextCursor: null, unavailable: [] })
})
it('passes validated filters and metadata intent to the authorized reader', async () => {
  const filters = {
    resourceType: 'feature',
    action: 'unpublished',
    category: 'publication',
    origin: 'user',
    actor: { id: 'editor', origin: 'user' },
    from: '2026-11-01',
    to: '2026-11-06',
    search: 'literal %_',
  }
  await read({ ...base, filters, includeFilterOptions: true }, ctx)
  expect(history).toHaveBeenCalledWith(
    ctx.db,
    expect.objectContaining({
      filters,
      includeFilterOptions: true,
      scope: expect.objectContaining({ id: 'l', organisationId: 'o' }),
    }),
  )
})
it.each([
  { resourceType: 'task' },
  { action: 'approve-draft' },
  { category: 'proposal' },
  { from: '2026-02-30' },
  { from: '2026-11-06', to: '2026-11-01' },
  { actor: { id: '', origin: 'user' } },
  { search: 'x'.repeat(201) },
  { organisationId: 'other' },
])('rejects invalid or unbounded filter input %j', filters => {
  expect(() => read({ ...base, filters }, ctx)).toThrow()
  expect(history).not.toHaveBeenCalled()
})
