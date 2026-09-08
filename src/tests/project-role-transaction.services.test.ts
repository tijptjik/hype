// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createUserRoles, syncUserRoles } from '$lib/db/services/project'
import type { Database } from '$lib/types'

let sqlite: DatabaseSync
let db: Database
const assignment = {
  projectId: 'spoofed-project',
  userId: 'new-user',
  role: 'user' as const,
  capabilities: null,
}

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, organisationId TEXT NOT NULL);
    CREATE TABLE organisationRole (organisationId TEXT NOT NULL, userId TEXT NOT NULL, role TEXT NOT NULL,
      PRIMARY KEY (organisationId, userId));
    CREATE TABLE projectRole (projectId TEXT NOT NULL, userId TEXT NOT NULL, role TEXT NOT NULL, capabilities TEXT,
      PRIMARY KEY (projectId, userId));
    INSERT INTO project VALUES ('project', 'org'), ('other-project', 'org');
    INSERT INTO organisationRole VALUES ('org', 'old-user', 'admin');
    INSERT INTO projectRole VALUES ('project', 'old-user', 'admin', null)`)
  db = drizzle({
    prepare: (sql: string) => ({
      bind: (...params: never[]) => ({
        sql,
        params,
        raw: async () => {
          if (params.length > 100) throw new Error('D1 parameter budget exceeded')
          const statement = sqlite.prepare(sql)
          statement.setReturnArrays(true)
          return statement.all(...params)
        },
      }),
    }),
    batch: async (statements: { sql: string; params: never[] }[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(({ sql, params }) => {
          if (params.length > 100) throw new Error('D1 parameter budget exceeded')
          return { results: sqlite.prepare(sql).all(...params) }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  } as never) as Database
})
afterEach(() => sqlite.close())

/** Captures both permission tables so failed project writes cannot hide leaked parent grants. */
function snapshot() {
  return {
    organisations: sqlite
      .prepare('SELECT * FROM organisationRole ORDER BY userId')
      .all(),
    projects: sqlite
      .prepare('SELECT * FROM projectRole ORDER BY projectId, userId')
      .all(),
  }
}

describe('atomic project roles and organisation membership', () => {
  it.each([createUserRoles, syncUserRoles])(
    'does not leave parent access after a project write fails (%#)',
    async write => {
      sqlite.exec(`CREATE TRIGGER fail_project_insert BEFORE INSERT ON projectRole
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
      const before = snapshot()
      await expect(write(db, [assignment], 'project', 'org')).rejects.toThrow()
      expect(snapshot()).toEqual(before)
    },
  )

  it('preserves existing organisation privileges while replacing project assignments', async () => {
    const result = await syncUserRoles(
      db,
      [assignment, { ...assignment, userId: 'old-user' }],
      'project',
      'org',
    )
    expect(result).toHaveLength(2)
    expect(result.every(row => row.projectId === 'project')).toBe(true)
    expect(snapshot().organisations).toEqual([
      { organisationId: 'org', userId: 'new-user', role: 'member' },
      { organisationId: 'org', userId: 'old-user', role: 'admin' },
    ])
  })

  it('allows concurrent membership provisioning from different projects', async () => {
    await Promise.all([
      createUserRoles(db, [assignment], 'project', 'org'),
      createUserRoles(db, [assignment], 'other-project', 'org'),
    ])
    expect(snapshot().organisations).toHaveLength(2)
    expect(snapshot().projects).toHaveLength(3)
  })

  it.each([{ rows: [] }, { rows: [assignment] }])(
    'rejects a stale project parent without changing either role table (%#)',
    async ({ rows }) => {
      const before = snapshot()
      await expect(
        syncUserRoles(db, rows, 'project', 'wrong-org'),
      ).rejects.toBeDefined()
      expect(snapshot()).toEqual(before)
    },
  )

  it('clears project roles without removing independent organisation membership', async () => {
    expect(await syncUserRoles(db, [], 'project', 'org')).toEqual([])
    expect(snapshot().projects).toEqual([])
    expect(snapshot().organisations).toHaveLength(1)
  })

  it('rolls back duplicate project assignments and their proposed parent grant', async () => {
    const before = snapshot()
    await expect(
      syncUserRoles(db, [assignment, assignment], 'project', 'org'),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('keeps large role sets within the D1 parameter budget', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({
      ...assignment,
      userId: `user-${i}`,
    }))
    expect(await syncUserRoles(db, rows, 'project', 'org')).toHaveLength(120)
    expect(snapshot().organisations).toHaveLength(121)
  })

  it('rolls back all parent grants and replacement chunks on a late project failure', async () => {
    sqlite.exec(`CREATE TRIGGER fail_late_project BEFORE INSERT ON projectRole
      WHEN NEW.userId = 'user-119' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    const before = snapshot()
    const rows = Array.from({ length: 120 }, (_, i) => ({
      ...assignment,
      userId: `user-${i}`,
    }))
    await expect(syncUserRoles(db, rows, 'project', 'org')).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('rolls back new memberships when deleting the old project roles fails', async () => {
    sqlite.exec(`CREATE TRIGGER fail_delete BEFORE DELETE ON projectRole
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    const before = snapshot()
    await expect(syncUserRoles(db, [assignment], 'project', 'org')).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })
})
