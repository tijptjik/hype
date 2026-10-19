// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { SQL } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
// SERVICES
import {
  getTelephoneVisibleUserIds,
  toUserDirectoryProfile,
} from '#lib/api/services/userContacts.js'
import { canReadAllUserContacts } from '#lib/api/services/authz/userDirectory.js'
import { canSearchUsers } from '#lib/api/services/authz/user.js'
// TYPES
import type { Database, UserRoleDisco } from '#lib/types.js'

const row = {
  id: 'target',
  name: 'Example',
  username: 'example',
  displayUsername: 'Example',
  email: 'secret@example.invalid',
  telephone: '+85291234567',
  emailVerified: true,
  image: null,
  attribution: 'Credit',
  locale: 'en',
  isArchived: false,
  createdAt: new Date('2026-01-01'),
  accounts: [{ accessToken: 'secret' }],
}
const manager = (capability: string, enabled = true): UserRoleDisco =>
  ({
    type: 'project',
    role: 'member',
    projectId: 'managed-project',
    userId: 'viewer',
    capabilities: { [capability]: enabled },
  }) as UserRoleDisco

describe('user contact privacy', () => {
  it('strips forbidden fields from the serialized response, including for admins', () => {
    const result = toUserDirectoryProfile(row, false)
    expect(result).toMatchObject({ name: 'Example', email: null, locale: 'en' })
    expect(result).not.toHaveProperty('telephone')
    expect(result).not.toHaveProperty('emailVerified')
    expect(JSON.stringify(result)).not.toMatch(/secret|91234567|accounts/)
  })
  it('grants both contacts globally only to core and explicit super admins', async () => {
    const core = {
      userRoles: [
        {
          type: 'hub',
          role: 'admin',
          hubId: 'core-id',
          userId: 'viewer',
          hub: { code: 'core' },
        } as UserRoleDisco,
      ],
    }
    const superAdmin = { userRoles: [], superAdmin: true }
    for (const actor of [core, superAdmin]) {
      expect(canReadAllUserContacts(actor)).toBe(true)
      expect(
        await getTelephoneVisibleUserIds({} as Database, actor, ['target', 'other']),
      ).toEqual(new Set(['target', 'other']))
      expect(
        toUserDirectoryProfile(row, true, canReadAllUserContacts(actor)),
      ).toMatchObject({ email: row.email, telephone: row.telephone })
    }
    const scoped = {
      userRoles: [{ type: 'hub', role: 'admin', hubId: 'other-hub' } as UserRoleDisco],
    }
    expect(canReadAllUserContacts(scoped)).toBe(false)
    expect(canReadAllUserContacts({ ...superAdmin, isAnonymous: true })).toBe(false)
  })
  it('returns only telephone when contact permission is granted', () => {
    const result = toUserDirectoryProfile(row, true)
    expect(result.telephone).toBe(row.telephone)
    expect(result.email).toBeNull()
    expect(result).not.toHaveProperty('emailVerified')
  })
  it.each(['manageVolunteers', 'manageDropOffs'])(
    'allows %s lookup and scopes telephone to shared projects in this hub',
    async capability => {
      const where = vi.fn(async (_condition: SQL | undefined) => [{ userId: 'target' }])
      const query = { from: vi.fn(() => query), innerJoin: vi.fn(() => query), where }
      const db = { selectDistinct: vi.fn(() => query) } as unknown as Database
      const roles = [manager(capability)]
      expect(canSearchUsers({ userRoles: roles })).toBe(true)
      const result = await getTelephoneVisibleUserIds(
        db,
        { userRoles: roles, hubId: 'active-hub' },
        ['target', 'unrelated'],
      )
      expect([...result]).toEqual(['target'])
      const sql = new SQLiteSyncDialect().sqlToQuery(where.mock.calls[0][0]!)
      expect(sql.sql).toContain('"organisation"."hubId" = ?')
      expect(sql.sql).toContain('"projectRole"."projectId" in (')
      expect(sql.params).toContain('active-hub')
      expect(sql.params).toContain('["managed-project"]')
      expect(sql.params).toContain('["target","unrelated"]')
    },
  )
  it('fails closed without capability, active hub, or authenticated account', async () => {
    const db = { selectDistinct: vi.fn() } as unknown as Database
    for (const userRoles of [
      [],
      [manager('manageBakeries')],
      [manager('manageVolunteers', false)],
      [{ type: 'hub', role: 'admin', hubId: 'active-hub' } as UserRoleDisco],
    ]) {
      expect(
        await getTelephoneVisibleUserIds(db, { userRoles, hubId: 'active-hub' }, [
          'target',
        ]),
      ).toEqual(new Set())
    }
    expect(
      await getTelephoneVisibleUserIds(
        db,
        { userRoles: [manager('manageVolunteers')] },
        ['target'],
      ),
    ).toEqual(new Set())
    expect(
      await getTelephoneVisibleUserIds(
        db,
        {
          isAnonymous: true,
          userRoles: [manager('manageVolunteers')],
          hubId: 'active-hub',
        },
        ['target'],
      ),
    ).toEqual(new Set())
    expect(db.selectDistinct).not.toHaveBeenCalled()
  })
})

describe('telephone scope against stored memberships', () => {
  it('excludes unrelated users, other hubs and archived projects in a bulk lookup', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE organisation (id TEXT, hubId TEXT, isArchived INTEGER);
        CREATE TABLE project (id TEXT, organisationId TEXT, isArchived INTEGER);
        CREATE TABLE projectRole (projectId TEXT, userId TEXT);
        INSERT INTO organisation VALUES ('org', 'active', 0), ('other-org', 'other', 0);
        INSERT INTO project VALUES ('managed-project', 'org', 0), ('other-project', 'other-org', 0), ('archived', 'org', 1);
        INSERT INTO projectRole VALUES ('managed-project', 'allowed'), ('other-project', 'other-hub'), ('archived', 'archived-user');
      `)
      const db = drizzle(async (query, params) => {
        const statement = sqlite.prepare(query)
        statement.setReturnArrays(true)
        return { rows: statement.all(...params) as unknown as unknown[][] }
      }) as unknown as Database
      const userRoles = [
        manager('manageVolunteers'),
        { ...manager('manageDropOffs'), projectId: 'other-project' },
        { ...manager('manageDropOffs'), projectId: 'archived' },
      ] as UserRoleDisco[]
      const ids = [
        'allowed',
        'other-hub',
        'archived-user',
        ...Array.from({ length: 150 }, (_, index) => `unrelated-${index}`),
      ]
      expect(
        await getTelephoneVisibleUserIds(db, { userRoles, hubId: 'active' }, ids),
      ).toEqual(new Set(['allowed']))
    } finally {
      sqlite.close()
    }
  })
})
