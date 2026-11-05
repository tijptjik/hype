// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
// DB
import { hub, hubI18n, hubRole } from '#lib/db/schema/hub.js'
import {
  organisation,
  organisationI18n,
  organisationRole,
} from '#lib/db/schema/organisation.js'
import { project, projectI18n, projectRole } from '#lib/db/schema/project.js'
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
// SERVICES
import { readUserAccessOverview } from '#lib/api/services/userAccess.js'
// TYPES
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'

function fixture() {
  const sqlite = new DatabaseSync(':memory:')
  const prepare = (query: string, bindings: unknown[] = []) => ({
    bind: (...values: unknown[]) => prepare(query, values),
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return statement.all(...(bindings as never[]))
    },
  })
  const db = drizzle({ prepare } as never, {
    schema: { hub, hubRole, organisationRole, projectRole },
  })
  for (const table of [
    hub,
    hubI18n,
    hubRole,
    organisation,
    organisationI18n,
    organisationRole,
    project,
    projectI18n,
    projectRole,
  ]) {
    sqlite.exec(
      `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')})`,
    )
  }
  sqlite.exec(`
    INSERT INTO hub(id,code,isArchived) VALUES ('h1','first',0), ('h2','second',0), ('core','core',0);
    INSERT INTO hubI18n(hubId,locale,name) VALUES ('h1','en','First Hub');
    INSERT INTO hubRole(hubId,userId,role) VALUES ('h1','target','admin');
    INSERT INTO organisation(id,code,hubId,isArchived) VALUES ('o1','first-org','h1',0), ('o2','second-org','h2',0);
    INSERT INTO organisationRole(organisationId,userId,role) VALUES ('o1','target','user'), ('o2','target','owner');
    INSERT INTO project(id,code,organisationId,isArchived,capabilities) VALUES
      ('p1','first-project','o1',0,'{"manageBakeries":true}'),
      ('p2','second-project','o2',1,'{}'), ('p3','third-project','o1',0,'{}');
    INSERT INTO projectRole(projectId,userId,role,capabilities) VALUES
      ('p1','target','maintainer','{"manageBakeries":true,"manageVolunteers":true,"manageDropOffs":false}'),
      ('p2','target','member','{}');
  `)
  const actor = {
    id: 'viewer',
    isAnonymous: false,
    superAdmin: false,
    locale: 'en',
  } as SessionUser
  const read = (userRoles: UserRoleDisco[], patch: Partial<SessionUser> = {}) =>
    readUserAccessOverview(db as unknown as Database, {
      actor: { ...actor, ...patch },
      targetUserId: 'target',
      userRoles,
    })
  return { sqlite, read }
}

const hubAdmin = {
  type: 'hub',
  hubId: 'h1',
  role: 'admin',
  userId: 'viewer',
} as Extract<UserRoleDisco, { type: 'hub' }>
const orgOwner = {
  type: 'organisation',
  organisationId: 'o1',
  role: 'owner',
  userId: 'viewer',
} as UserRoleDisco
const projectMaintainer = {
  type: 'project',
  projectId: 'p1',
  role: 'maintainer',
  userId: 'viewer',
} as UserRoleDisco

describe('user access overview', () => {
  it('rejects anonymous and ordinary viewers', async () => {
    const { sqlite, read } = fixture()
    try {
      await expect(read([])).rejects.toMatchObject({ status: 403 })
      await expect(
        read([hubAdmin], { isAnonymous: true, superAdmin: true }),
      ).rejects.toMatchObject({ status: 403 })
    } finally {
      sqlite.close()
    }
  })

  it.each([
    [[hubAdmin], ['h1'], ['o1'], ['p1']],
    [[orgOwner], [], ['o1'], ['p1']],
    [[projectMaintainer], [], [], ['p1']],
    [[{ ...projectMaintainer, role: 'member' }], [], [], []],
    [[{ ...hubAdmin, hubId: 'unrelated' }], [], [], []],
  ])(
    'filters every resource independently for %j',
    async (roles, hubs, organisations, projects) => {
      const { sqlite, read } = fixture()
      try {
        const result = await read(roles as UserRoleDisco[])
        expect(result.scope).toBe('managed')
        expect(result.hubs.map(row => row.id)).toEqual(hubs)
        expect(result.organisations.map(row => row.id)).toEqual(organisations)
        expect(result.projects.map(row => row.id)).toEqual(projects)
        expect(JSON.stringify(result)).not.toContain('second')
      } finally {
        sqlite.close()
      }
    },
  )

  it('returns global direct assignments for core admins and preserves assigned capability availability', async () => {
    const { sqlite, read } = fixture()
    try {
      const result = await read([
        { ...hubAdmin, hubId: 'core', hub: { code: 'core' } } as UserRoleDisco,
      ])
      expect(result.scope).toBe('all')
      expect(result.hubs[0].name).toBe('First Hub')
      expect(result.organisations.map(row => row.role)).toEqual(['user', 'owner'])
      expect(result.projects.map(row => row.id)).toEqual(['p1', 'p2'])
      expect(result.projects[0].capabilities).toEqual([
        { key: 'manageBakeries', available: true },
        { key: 'manageVolunteers', available: false },
      ])
      expect(result.projects[1]).toMatchObject({ isArchived: true, role: 'member' })
      // Organisation ownership supplies effective management despite the direct member role.
      expect(result.projects[1].permissions).toContain('Configure capabilities')
    } finally {
      sqlite.close()
    }
  })

  it('uses real project policy for maintainer, translator and user roles without inherited authority', async () => {
    const { sqlite, read } = fixture()
    try {
      sqlite.exec("DELETE FROM hubRole WHERE userId='target'")
      let result = await read([], { superAdmin: true })
      expect(result.projects[0].permissions).toContain('Assign capabilities')
      expect(result.projects[0].permissions).not.toContain('Configure capabilities')
      expect(result.projects[0].permissions).not.toContain('Delete project')
      sqlite.exec("UPDATE projectRole SET role='translator' WHERE projectId='p1'")
      result = await read([], { superAdmin: true })
      expect(result.projects[0].permissions).toEqual(['Translate project'])
      sqlite.exec("UPDATE projectRole SET role='user' WHERE projectId='p1'")
      result = await read([], { superAdmin: true })
      expect(result.projects[0].permissions).toEqual([])
    } finally {
      sqlite.close()
    }
  })

  it('lets staff inspect their own assignments without treating them as editors everywhere', async () => {
    const { sqlite, read } = fixture()
    try {
      const result = await read([projectMaintainer], { id: 'target' })
      expect(result.scope).toBe('all')
      expect(result.projects).toHaveLength(2)
    } finally {
      sqlite.close()
    }
  })
})
