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

it('rejects arbitrary avatar URLs without a verified image ID', async () => {
  await expect(
    save(
      {
        ...params,
        settings: { ...settings, image: 'https://arbitrary.invalid/avatar' },
      },
      ctx,
    ),
  ).rejects.toMatchObject({ status: 400 })
  expect(mocks.set).not.toHaveBeenCalled()
})

// Real D1-adapter checks complement the request mocks above: avatar and profile writes must share a transaction.
import { getTableColumns } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import { user as userTable } from '#lib/db/schema/user.js'
import { image as imageTable } from '#lib/db/schema/image.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import {
  getUserImageUploadSnapshot,
  stageImageUpload,
} from '#lib/db/services/singleImageUpload.js'
import type { Database } from '#lib/types.js'

it.each(['save', 'stale', 'revoked', 'wrong-target', 'skip'] as const)(
  'commits avatar identity and profile fields together: %s',
  async scenario => {
    const { db, sqlite } = publicationSqlite({ user: userTable })
    try {
      for (const [name, table] of [
        ['user', userTable],
        ['image', imageTable],
      ] as const) {
        const columns = Object.values(getTableColumns(table))
          .map(c => `"${c.name}" ${c.getSQLType()}`)
          .join(',')
        sqlite.exec(`CREATE TABLE "${name}" (${columns}, PRIMARY KEY(id))`)
      }
      sqlite.exec(readFileSync('migrations/0206_image_upload_attachment.sql', 'utf8'))
      sqlite.exec(`CREATE TABLE organisationRole(userId TEXT,organisationId TEXT,role TEXT);
      CREATE TABLE organisation(id TEXT,hubId TEXT,isArchived INTEGER,permitUserDetailsEdit INTEGER);
      CREATE TABLE hubRole(userId TEXT,hubId TEXT,role TEXT);`)
      await db.insert(userTable).values({
        ...settings,
        locale: 'en',
        id: 'target',
        name: 'Before',
        image: 'https://external.invalid/previous',
        updatedAt: new Date(params.updatedAt),
      })
      const database = db as unknown as Database
      const receipt = await stageImageUpload(database, {
        data: {
          publicId: 'h/user/new',
          env: 'local',
          cdn: 'cloudflareR2',
          contributorId: 'actor',
          presentationMode: 'contain',
          version: 1000,
        },
        actorId: 'actor',
        ctxType: 'user',
        ctxId: scenario === 'wrong-target' ? 'someone-else' : 'target',
        snapshot: (await getUserImageUploadSnapshot(database, 'target'))!,
        expiresAt: Date.now() + 60000,
      })
      if (scenario === 'stale') sqlite.exec('UPDATE user SET updatedAt=1')
      if (scenario === 'skip')
        sqlite.exec(
          'CREATE TRIGGER skip_avatar BEFORE UPDATE ON user BEGIN SELECT RAISE(IGNORE); END',
        )
      const result = save(
        { ...params, imageId: receipt.imageId },
        {
          db,
          user: { id: 'actor', isAnonymous: false, superAdmin: scenario !== 'revoked' },
          event: { url: new URL('http://localhost:4173') },
        },
      )
      if (scenario === 'save') {
        await expect(result).resolves.toMatchObject({
          settings: {
            name: settings.name,
            image: expect.stringContaining('h/user/new'),
          },
        })
        expect(sqlite.prepare('SELECT state FROM imageUpload').get()?.state).toBe(
          'attached',
        )
        expect(sqlite.prepare('SELECT count(*) AS n FROM image').get()?.n).toBe(1)
      } else {
        await expect(result).rejects.toMatchObject({ status: 409 })
        expect(sqlite.prepare('SELECT name,image FROM user').get()).toEqual({
          name: 'Before',
          image: 'https://external.invalid/previous',
        })
        expect(sqlite.prepare('SELECT count(*) AS n FROM image').get()?.n).toBe(0)
        expect(sqlite.prepare('SELECT state FROM imageUpload').get()?.state).toBe(
          'pending',
        )
      }
    } finally {
      sqlite.close()
    }
  },
)
