// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { and } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { toQueryConditions } from '#lib/api/services/task.js'
import { task } from '#lib/db/schema/index.js'
import type { Database, SessionUser, UserRoleDisco } from '#lib/types.js'

describe('unfiltered task list permissions', () => {
  it('returns the union of owned organisations and managed projects without unrelated tasks', () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`CREATE TABLE task (id TEXT, organisationId TEXT, projectId TEXT);
        INSERT INTO task VALUES
          ('owned', 'owned-org', 'other-project'),
          ('managed', 'other-org', 'managed-project'),
          ('foreign', 'other-org', 'foreign-project');`)
      const db = drizzle({} as never) as Database
      const roles = [
        { type: 'organisation', role: 'owner', organisationId: 'owned-org' },
        { type: 'project', role: 'maintainer', projectId: 'managed-project' },
        { type: 'project', role: 'translator', projectId: 'foreign-project' },
      ] as UserRoleDisco[]
      const user = { id: 'reviewer', superAdmin: false } as SessionUser
      const query = (userRoles: UserRoleDisco[], isAdminRequest = true) => {
        const { conditions } = toQueryConditions(
          db,
          user,
          isAdminRequest,
          {},
          userRoles,
          { organisation: [], project: [], layer: [] },
          'hub',
        )
        const statement = db
          .select({ id: task.id })
          .from(task)
          .where(and(...conditions))
          .toSQL()
        return sqlite
          .prepare(statement.sql)
          .all(...(statement.params as never[]))
          .map(row => row.id)
      }
      expect(query(roles)).toEqual(['owned', 'managed'])
      expect(query([roles[0]])).toEqual(['owned'])
      expect(query([roles[1]])).toEqual(['managed'])
      expect(query([roles[2]])).toEqual([])
      expect(query([])).toEqual([])
      expect(query(roles, false)).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
