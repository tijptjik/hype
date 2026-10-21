// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { and } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { toQueryConditions, toTaskPrisms } from '#lib/api/services/task.js'
import { GetTasksSchema } from '#lib/db/zod/schema/task.js'
import { task } from '#lib/db/schema/index.js'
import type { Database, Prisms, SessionUser, UserRoleDisco } from '#lib/types.js'

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

describe('task list layer prisms', () => {
  it('preserves selected layers through request validation and normalization', () => {
    const { prisms } = GetTasksSchema.parse({
      prisms: { layer: ['bookshops'] },
    })
    expect(toTaskPrisms(prisms as Prisms)).toEqual({
      organisation: [],
      project: [],
      layer: ['bookshops'],
    })
  })

  it('filters by feature layers with hierarchy overrides and authoritative permissions', () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      sqlite.exec(`
        CREATE TABLE organisation (id TEXT PRIMARY KEY);
        CREATE TABLE project (id TEXT PRIMARY KEY, organisationId TEXT);
        CREATE TABLE layer (id TEXT PRIMARY KEY, projectId TEXT);
        CREATE TABLE feature (id TEXT PRIMARY KEY, layerId TEXT);
        CREATE TABLE task (id TEXT PRIMARY KEY, featureId TEXT, projectId TEXT, organisationId TEXT);
        INSERT INTO organisation VALUES ('culture'), ('ghosts');
        INSERT INTO project VALUES ('books', 'culture'), ('signs', 'ghosts');
        INSERT INTO layer VALUES ('bookshops', 'books'), ('libraries', 'books'), ('ghostsigns', 'signs');
        INSERT INTO feature VALUES ('shop', 'bookshops'), ('library', 'libraries'), ('sign', 'ghostsigns');
        INSERT INTO task VALUES ('shop-task', 'shop', 'books', 'culture'),
          ('library-task', 'library', 'books', 'culture'),
          ('sign-task', 'sign', 'signs', 'ghosts');
      `)
      const db = drizzle({} as never) as Database
      const query = (
        selected: Partial<Prisms>,
        superAdmin = true,
        roles: UserRoleDisco[] = [],
      ): unknown[] => {
        const prisms = toTaskPrisms(
          GetTasksSchema.parse({ prisms: selected }).prisms as Prisms,
        )
        const { conditions } = toQueryConditions(
          db,
          { id: 'reviewer', superAdmin } as SessionUser,
          true,
          {},
          roles,
          prisms,
          'hub',
        )
        const statement = db
          .select({ id: task.id })
          .from(task)
          .where(and(...conditions))
          .orderBy(task.id)
          .toSQL()
        return sqlite
          .prepare(statement.sql)
          .all(...(statement.params as never[]))
          .map(row => row.id)
      }

      expect(query({ layer: ['bookshops'] })).toEqual(['shop-task'])
      expect(query({ layer: ['ghostsigns'] })).toEqual(['sign-task'])
      expect(query({ layer: ['missing'] })).toEqual([])
      expect(query({ project: ['books'], layer: ['bookshops'] })).toEqual(['shop-task'])
      expect(query({ organisation: ['culture'], layer: ['bookshops'] })).toEqual([
        'shop-task',
      ])
      expect(query({ project: ['signs'], layer: ['bookshops'] })).toEqual([
        'shop-task',
        'sign-task',
      ])
      expect(query({ project: ['books'] })).toEqual(['library-task', 'shop-task'])
      expect(query({ layer: ['bookshops', 'ghostsigns'] })).toEqual([
        'shop-task',
        'sign-task',
      ])
      expect(query({})).toEqual(['library-task', 'shop-task', 'sign-task'])
      expect(
        query({ layer: ['bookshops', 'ghostsigns'] }, false, [
          { type: 'project', role: 'maintainer', projectId: 'books' } as UserRoleDisco,
        ]),
      ).toEqual(['shop-task'])
      expect(query({ layer: ['bookshops'] }, false)).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
