// @vitest-environment node
// TESTS
import { beforeEach, describe, expect, it, vi } from 'vitest'
// TYPES
import type { GuardedBaseContext } from '#lib/api/guarded.types.js'

const { probe, history, fieldHistory } = vi.hoisted(() => ({
  probe: vi.fn(),
  fieldHistory: vi.fn(),
  history: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedQuery: (
    schema: { parse(value: unknown): unknown },
    handler: (value: unknown, context: unknown) => unknown,
  ) =>
    Object.assign(
      (value: unknown, context: unknown) => handler(schema.parse(value), context),
      { __: { type: 'query' } },
    ),
}))
vi.mock('#lib/db/services/organisation.js', () => ({ probeOrganisationQuery: probe }))
vi.mock('#lib/db/services/resourceHistory.js', () => ({
  listOrganisationHistory: history,
  listOrganisationPropertyHistory: fieldHistory,
}))
import { getOrganisationHistory } from '#lib/api/organisationHistory.remote.js'

const read = getOrganisationHistory as unknown as (
  input: unknown,
  ctx: GuardedBaseContext,
) => Promise<unknown>
function context(
  role: Record<string, unknown> | null,
  anonymous = false,
): GuardedBaseContext {
  return {
    db: {},
    user: { id: 'actor', isAnonymous: anonymous },
    userRoles: role ? [role] : [],
  } as unknown as GuardedBaseContext
}
beforeEach(() => {
  vi.clearAllMocks()
  probe.mockResolvedValue({ id: 'o', hubId: 'h', isPublished: true, isArchived: false })
  history.mockResolvedValue({ available: true, entries: [], nextCursor: null })
})

describe('organisation history authorization', () => {
  it.each([
    null,
    { type: 'organisation', organisationId: 'o', role: 'member' },
    { type: 'organisation', organisationId: 'other', role: 'owner' },
    { type: 'hub', hubId: 'other', role: 'admin' },
    { type: 'project', projectId: 'p', organisationId: 'o', role: 'admin' },
  ])('rejects public/upward/out-of-scope access: %j', async role => {
    await expect(read({ organisationId: 'o' }, context(role))).rejects.toMatchObject({
      status: 403,
    })
    expect(history).not.toHaveBeenCalled()
  })
  it.each([
    { type: 'organisation', organisationId: 'o', role: 'owner' },
    { type: 'hub', hubId: 'h', role: 'admin' },
  ])('reads using persisted scope for %j', async role => {
    await read({ organisationId: 'o', before: 42 }, context(role))
    expect(history).toHaveBeenCalledWith(expect.anything(), {
      organisationId: 'o',
      before: 42,
      hubId: 'h',
    })
  })
  it('denies anonymous callers even with an owner-shaped role', async () => {
    await expect(
      read(
        { organisationId: 'o' },
        context({ type: 'organisation', organisationId: 'o', role: 'owner' }, true),
      ),
    ).rejects.toMatchObject({ status: 403 })
  })
  it('rejects caller-supplied ownership scope', () => {
    expect(() => read({ organisationId: 'o', hubId: 'other' }, context(null))).toThrow()
    expect(probe).not.toHaveBeenCalled()
  })
})

it('authorizes field history with the same owner policy and persisted scope', async () => {
  fieldHistory.mockResolvedValue({ available: true, entries: [], nextCursor: null })
  await read(
    { organisationId: 'o', kind: 'fields' },
    context({ type: 'organisation', organisationId: 'o', role: 'owner' }),
  )
  expect(fieldHistory).toHaveBeenCalledWith(expect.anything(), {
    organisationId: 'o',
    hubId: 'h',
  })
  expect(history).not.toHaveBeenCalled()
  await expect(
    read({ organisationId: 'o', kind: 'fields' }, context(null)),
  ).rejects.toMatchObject({ status: 403 })
  expect(fieldHistory).toHaveBeenCalledTimes(1)
})
