// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { publicationSqlite } from './fixtures/publicationSqlite'
import {
  researchProjectAccess,
  requireResearchSessionAccess,
} from '#lib/fieldResearch/access.js'
import { authorizeProjectUpdate } from '#lib/api/services/authz/project.js'
import type { Database, UserRoleDisco } from '#lib/types.js'

const stores: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.sqlite.close()
})

/** Exercise the real SQL access predicate against sibling projects and organisations.
 * @returns Isolated database containing independent management scopes.
 */
function fixture() {
  const f = publicationSqlite({}, 100)
  stores.push(f)
  f.sqlite.exec(
    `CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT); CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT); CREATE TABLE fieldResearchSession(id TEXT PRIMARY KEY,projectId TEXT); INSERT INTO organisation VALUES('org-a','hub-a'),('org-b','hub-b'); INSERT INTO project VALUES('project-a','org-a'),('project-sibling','org-a'),('project-b','org-b'); INSERT INTO fieldResearchSession VALUES('session-a','project-a'),('session-b','project-b');`,
  )
  return f
}

describe('private research project management scope', () => {
  for (const [label, roles, superAdmin] of [
    [
      'maintainer',
      [{ type: 'project', role: 'maintainer', projectId: 'project-a' }],
      false,
    ],
    [
      'project owner',
      [{ type: 'project', role: 'owner', projectId: 'project-a' }],
      false,
    ],
    ['member', [{ type: 'project', role: 'member', projectId: 'project-a' }], false],
    [
      'translator',
      [{ type: 'project', role: 'translator', projectId: 'project-a' }],
      false,
    ],
    [
      'organisation owner',
      [{ type: 'organisation', role: 'owner', organisationId: 'org-a' }],
      false,
    ],
    [
      'organisation member',
      [{ type: 'organisation', role: 'member', organisationId: 'org-a' }],
      false,
    ],
    [
      'hub administrator',
      [{ type: 'hub', role: 'admin', hubId: 'hub-a', hub: { code: 'example' } }],
      false,
    ],
    [
      'core administrator',
      [{ type: 'hub', role: 'admin', hubId: 'core', hub: { code: 'core' } }],
      false,
    ],
    ['superAdmin', [], true],
  ] as const)
    it(`matches project edit policy for ${label}`, async () => {
      const f = fixture()
      const userRoles = roles as unknown as UserRoleDisco[]
      const actor = { user: { id: 'actor', isAnonymous: false, superAdmin }, userRoles }
      const rows = await f.db.all<{
        id: string
        organisationId: string
        hubId: string
      }>(
        sql`SELECT project.id,project.organisationId,organisation.hubId FROM project JOIN organisation ON organisation.id=project.organisationId`,
      )
      const allowed = await f.db.all<{ id: string }>(
        sql`SELECT id FROM project WHERE ${researchProjectAccess(actor, sql`project.id`)}`,
      )
      const expected = rows
        .filter(
          row =>
            authorizeProjectUpdate(
              {
                userId: 'actor',
                userRoles,
                isAuthenticated: true,
                isSuperAdmin: superAdmin,
              },
              {
                resourceId: row.id,
                organisationId: row.organisationId,
                resourceHubId: row.hubId,
              },
              [],
            ).allowed,
        )
        .map(row => row.id)
      expect(allowed.map(row => row.id).sort()).toEqual(expected.sort())
    })
  it('denies direct sibling-session access and anonymous superAdmin claims', async () => {
    const f = fixture()
    const ctx = {
      db: f.db as unknown as Database,
      user: { id: 'actor', isAnonymous: false },
      userRoles: [
        { type: 'project', role: 'maintainer', projectId: 'project-a' },
      ] as UserRoleDisco[],
    }
    await expect(
      requireResearchSessionAccess(ctx, 'session-a'),
    ).resolves.toBeUndefined()
    await expect(requireResearchSessionAccess(ctx, 'session-b')).rejects.toMatchObject({
      status: 403,
    })
    const rows = await f.db.all(
      sql`SELECT id FROM project WHERE ${researchProjectAccess({ ...ctx, user: { id: 'actor', isAnonymous: true, superAdmin: true } }, sql`project.id`)}`,
    )
    expect(rows).toEqual([])
  })
})
