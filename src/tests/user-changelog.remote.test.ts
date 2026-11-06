// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const { eligible, history, access } = vi.hoisted(() => ({
  eligible: vi.fn(),
  history: vi.fn(),
  access: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery:
    (
      schema: { parse(value: unknown): unknown },
      handler: (input: unknown, ctx: unknown) => unknown,
    ) =>
    Object.assign(async (input: unknown, ctx: unknown) => handler(schema.parse(input), ctx), {
      __: { type: 'query' },
    }),
}))
vi.mock('#lib/db/services/userChangelogScope.js', () => ({
  canReadUserChangelog: eligible,
}))
vi.mock('#lib/db/services/resourceChangelog.js', () => ({
  listResourceChangelog: history,
}))
vi.mock('#lib/properties/audience.server.js', () => ({
  getInternalPropertyAccess: access,
}))
import { getUserChangelog } from '#lib/api/userChangelog.remote.js'
const read = getUserChangelog as unknown as (
  input: unknown,
  ctx: unknown,
) => Promise<unknown>
const input = { userId: 'subject', locale: 'en' }
const ctx = { db: {}, user: { id: 'viewer', isAnonymous: false } }
beforeEach(() => {
  vi.clearAllMocks()
  eligible.mockResolvedValue(true)
  history.mockResolvedValue({ entries: [], nextCursor: null, unavailable: [] })
  access.mockResolvedValue({ internal: new Set(['private']), allowed: new Set() })
})
it('denies ineligible and anonymous requests before reading history', async () => {
  eligible.mockResolvedValue(false)
  await expect(read(input, ctx)).rejects.toMatchObject({ status: 403 })
  eligible.mockResolvedValue(true)
  await expect(
    read(input, { ...ctx, user: { ...ctx.user, isAnonymous: true } }),
  ).rejects.toMatchObject({ status: 403 })
  expect(history).not.toHaveBeenCalled()
})
it('uses session viewer and preserves current field privacy', async () => {
  await read(input, ctx)
  expect(history.mock.calls[0][1]).toMatchObject({
    scope: { resource: 'user', id: 'subject', viewerId: 'viewer' },
    internalIds: new Set(['private']),
    allowedInternalIds: new Set(),
  })
  await expect(read({ ...input, viewerId: 'other' }, ctx)).rejects.toThrow()
  await expect(
    read({ ...input, before: { createdAt: 'x', key: 'x'.repeat(257) } }, ctx),
  ).rejects.toThrow()
})
it('rejects an in-flight page after subject demotion', async () => {
  eligible.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
  await expect(read(input, ctx)).rejects.toMatchObject({ status: 403 })
})
