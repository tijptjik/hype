vi.mock('$app/server', () => ({ requested: () => ({ refreshAll: async () => {} }) }))
vi.mock('#lib/api/user.remote.js', () => ({
  getAdminUserProfile: Object.assign(() => {}, { __: { type: 'query' } }),
}))
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  returning: vi.fn(),
  set: vi.fn(),
  find: vi.fn(),
}))
vi.mock('#lib/api/server/guarded.js', () => ({
  guardedCommand: (
    schema: { parse: (input: unknown) => unknown },
    handler: (input: unknown, ctx: unknown) => unknown,
  ) =>
    Object.assign((input: unknown, ctx: unknown) => handler(schema.parse(input), ctx), {
      __: { type: 'command' },
    }),
}))
vi.mock('#lib/api/services/authz/adminUser.js', async original => ({
  ...(await original<typeof import('#lib/api/services/authz/adminUser.js')>()),
  canEditAdminUser: mocks.allowed,
}))
import { saveAdminUserProfile } from '#lib/api/adminUser.remote.js'
const settings = {
  name: 'Test',
  username: 'testperson27',
  attribution: null,
  image: null,
  email: 'changed@example.invalid',
  telephone: null,
  locale: 'en',
  isArchived: false,
  emailVerified: true,
  preferences: '{}',
  experimental: '{}',
}
const ctx = {
  user: { id: 'actor', isAnonymous: false, superAdmin: false },
  db: {
    query: { user: { findFirst: mocks.find } },
    update: () => ({ set: mocks.set }),
  },
}
const save = saveAdminUserProfile as unknown as (
  params: unknown,
  ctx: unknown,
) => Promise<unknown>
const params = { id: 'target', updatedAt: '2026-01-01T00:00:00.000Z', settings }
beforeEach(() => {
  vi.resetAllMocks()
  mocks.allowed.mockResolvedValue(true)
  mocks.find
    .mockResolvedValueOnce({ email: 'old@example.invalid', emailVerified: true })
    .mockResolvedValueOnce(undefined)
  mocks.set.mockReturnValue({ where: () => ({ returning: mocks.returning }) })
  mocks.returning.mockImplementation(async () => [
    {
      ...settings,
      ...mocks.set.mock.calls.at(-1)?.[0],
      displayUsername: 'TestPerson27',
      username: 'testperson27',
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ])
})
describe('admin profile saves', () => {
  it('rejects a target outside the staff audience before any write', async () => {
    mocks.allowed.mockResolvedValue(false)
    await expect(save(params, ctx)).rejects.toMatchObject({ status: 403 })
    expect(mocks.set).not.toHaveBeenCalled()
  })
  it('clears verification when staff change a mailbox', async () => {
    await save(params, ctx)
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerified: false, email: settings.email }),
    )
  })
  it('rejects a stale revision or revoked scope instead of claiming success', async () => {
    mocks.returning.mockResolvedValue([])
    await expect(save(params, ctx)).rejects.toMatchObject({ status: 409 })
  })
  it('does not let staff assert email verification', async () => {
    mocks.find
      .mockReset()
      .mockResolvedValue({ email: settings.email, emailVerified: false })
    await expect(save(params, ctx)).rejects.toMatchObject({ status: 403 })
    expect(mocks.set).not.toHaveBeenCalled()
  })
  it('rejects duplicate identity fields before writing', async () => {
    mocks.find
      .mockReset()
      .mockResolvedValueOnce({ emailVerified: true })
      .mockResolvedValueOnce({ id: 'duplicate' })
    await expect(save(params, ctx)).rejects.toMatchObject({ status: 409 })
    expect(mocks.set).not.toHaveBeenCalled()
  })
})

it('identifies a duplicate phone and leaves the existing association unchanged', async () => {
  mocks.find
    .mockReset()
    .mockResolvedValueOnce({ emailVerified: true })
    .mockResolvedValueOnce({ id: 'duplicate', telephone: '+85291234567' })
  await expect(
    save({ ...params, settings: { ...settings, telephone: '91234567' } }, ctx),
  ).rejects.toMatchObject({
    status: 409,
    body: {
      field: 'telephone',
      message: expect.stringContaining('phone number is already assigned'),
    },
  })
  expect(mocks.set).not.toHaveBeenCalled()
})

it('returns committed canonical phone values and the new revision for the editor baseline', async () => {
  const result = await save(
    { ...params, settings: { ...settings, telephone: '91234567' } },
    ctx,
  )
  expect(result).toMatchObject({
    username: 'testperson27',
    updatedAt: '2026-01-02T00:00:00.000Z',
    settings: { telephone: '+85291234567', emailVerified: false },
  })
})
