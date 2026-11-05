// @vitest-environment node
// TESTS
import { beforeEach, describe, expect, it, vi } from 'vitest'
// DB
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
// SERVICES
import {
  canReadAdminUserProfile,
  readAdminUserProfile,
} from '#lib/api/services/adminUser.js'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'

vi.mock('#lib/api/services/userAccess.js', () => ({
  readUserAccessOverview: vi.fn(async () => ({
    scope: 'managed',
    hubs: [],
    organisations: [],
    projects: [],
  })),
}))

const { loadUser, contributions } = vi.hoisted(() => ({
  loadUser: vi.fn(),
  contributions: vi.fn(),
}))
vi.mock('#lib/db/services/user.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/db/services/user.js')>()),
  getUser: loadUser,
}))
vi.mock('#lib/api/services/user.js', async importOriginal => ({
  ...(await importOriginal<typeof import('#lib/api/services/user.js')>()),
  toUserRelationsWithContributionConstraints: contributions,
}))
const row = {
  id: 'target',
  name: 'Private Name',
  username: 'kindrunner01',
  displayUsername: 'KindRunner01',
  email: 'private@example.invalid',
  telephone: '+85291234567',
  emailVerified: true,
  image: null,
  locale: 'en',
  attribution: 'Public Credit',
  isAnonymous: false,
  isArchived: false,
  preferences: '{}',
  experimental: '{}',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-02'),
  contributedFeatures: [{ id: 'feature-1', projectId: 'project-1', isPublished: true }],
  contributedImages: [],
  contributedTasks: [{ id: 'task-1', type: 'reportedMissing' }],
  accounts: [{ accessToken: 'never-expose' }],
}
const actor = { id: 'viewer', isAnonymous: false, superAdmin: false } as SessionUser
const hub = { id: 'hub-1', isCore: false }
const audienceLookup = vi.fn()
const linkedWhere = vi
  .fn()
  .mockResolvedValue([{ providerId: 'google', email: 'provider@example.invalid' }])
const selectProviders = vi.fn((projection: Record<string, unknown>) => ({
  from: () => ({
    leftJoin: () => ({ where: linkedWhere }),
    where: async () =>
      'preferredPlatform' in projection ? [{ preferredPlatform: null }] : [],
  }),
}))
const db = {
  select: selectProviders,
  query: { user: { findFirst: audienceLookup } },
} as unknown as Database
const read = (roles: UserRoleDisco[]) =>
  readAdminUserProfile(db, { username: 'KindRunner01', actor, userRoles: roles, hub })

beforeEach(() => {
  vi.clearAllMocks()
  audienceLookup.mockResolvedValue(undefined)
  loadUser.mockResolvedValue(row)
  contributions.mockReturnValue({
    contributedFeatures: {},
    contributedImages: {},
    contributedTasks: {},
  })
})

describe('admin user profile permissions', () => {
  it('rejects ordinary users and anonymous actors before reading records', async () => {
    await expect(read([])).rejects.toMatchObject({ status: 403 })
    expect(
      canReadAdminUserProfile({ isAnonymous: true, superAdmin: true, userRoles: [] }),
    ).toBe(false)
    expect(loadUser).not.toHaveBeenCalled()
  })

  it.each(['organisation', 'project'] as const)(
    'returns only public fields to a %s owner',
    async type => {
      const result = await read([{ type, role: 'owner' } as UserRoleDisco])
      expect(result?.details).toBeNull()
      expect(result?.profile).toMatchObject({
        attribution: 'Public Credit',
        contributedFeatures: { 'project-1': ['feature-1'] },
        reportedMissingCount: 1,
      })
      const serialized = JSON.stringify(result)
      for (const value of [
        'Private Name',
        'private@example.invalid',
        '+85291234567',
        'never-expose',
        'preferences',
        'experimental',
      ])
        expect(serialized).not.toContain(value)
      expect(loadUser.mock.calls[0][2]).toHaveLength(1)
    },
  )

  it('returns all settings only when the persisted audience check grants editing', async () => {
    audienceLookup.mockResolvedValue({ id: 'target' })
    const result = await read([
      { type: 'hub', role: 'admin', hubId: 'hub-1' } as UserRoleDisco,
    ])
    expect(result?.canEdit).toBe(true)
    expect(result?.details).toMatchObject({
      name: row.name,
      email: row.email,
      telephone: row.telephone,
    })
    expect(result?.linkedAccounts).toEqual([
      {
        providerId: 'google',
        email: 'provider@example.invalid',
        emailSource: 'provider',
      },
    ])
    expect(Object.keys(selectProviders.mock.calls[0][0] ?? {})).toEqual([
      'providerId',
      'accountId',
      'idToken',
      'email',
    ])
    expect(result?.settings).toMatchObject({ preferences: '{}', experimental: '{}' })
    expect(JSON.stringify(result)).not.toContain('never-expose')
  })

  it('does not give an unrelated hub admin contact access', async () => {
    const result = await read([
      { type: 'hub', role: 'admin', hubId: 'other' } as UserRoleDisco,
    ])
    expect(result?.details).toBeNull()
  })

  it('keeps core admins scoped and gives explicit super admins global editing', async () => {
    const core = await read([
      {
        type: 'hub',
        role: 'admin',
        hubId: 'core-id',
        userId: 'viewer',
        hub: { code: 'core' },
      } as UserRoleDisco,
    ])
    expect(core?.details).toBeNull()
    expect(core?.canEdit).toBe(false)
    const superUser = await readAdminUserProfile(db, {
      username: 'KindRunner01',
      actor: { ...actor, superAdmin: true },
      userRoles: [],
      hub,
    })
    expect(superUser?.details?.email).toBe(row.email)
    expect(superUser?.details?.telephone).toBe(row.telephone)
  })

  it('matches mixed-case usernames through a bound lowercase lookup and handles missing records', async () => {
    loadUser.mockResolvedValue(undefined)
    expect(await read([{ type: 'project', role: 'owner' } as UserRoleDisco])).toBeNull()
    const query = new SQLiteSyncDialect().sqlToQuery(loadUser.mock.calls[0][2][0])
    expect(query.sql).toContain('lower(')
    expect(query.params).toEqual(['kindrunner01'])
  })
})
