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
const db = {} as Database
const read = (roles: UserRoleDisco[]) =>
  readAdminUserProfile(db, { username: 'KindRunner01', actor, userRoles: roles, hub })

beforeEach(() => {
  vi.clearAllMocks()
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
      expect(loadUser.mock.calls[0][2]).toHaveLength(2)
    },
  )

  it('returns non-contact fields to active-hub admins without exposing account or preference data', async () => {
    const result = await read([
      { type: 'hub', role: 'admin', hubId: 'hub-1' } as UserRoleDisco,
    ])
    expect(result?.details).toMatchObject({
      name: row.name,
      email: null,
    })
    expect(JSON.stringify(result)).not.toMatch(
      /never-expose|preferences|experimental|private@example.invalid|91234567/,
    )
    expect(loadUser.mock.calls[0][2]).toHaveLength(1)
    expect(contributions).toHaveBeenCalledWith(db, {
      sessionUser: actor,
      hubOpts: hub,
      isAdminRequest: true,
    })
  })

  it('does not give an unrelated hub admin contact access', async () => {
    const result = await read([
      { type: 'hub', role: 'admin', hubId: 'other' } as UserRoleDisco,
    ])
    expect(result?.details).toBeNull()
  })

  it('allows core admins and super admins the directory fields', async () => {
    const core = await read([
      {
        type: 'hub',
        role: 'admin',
        hubId: 'core-id',
        userId: 'viewer',
        hub: { code: 'core' },
      } as UserRoleDisco,
    ])
    expect(core?.details?.email).toBe(row.email)
    expect(core?.details?.telephone).toBe(row.telephone)
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
