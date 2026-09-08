// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { sqliteTable, text, primaryKey } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { replaceManyRelated } from '$lib/db/crud'
import type { Database } from '$lib/types'

const roles = sqliteTable(
  'roles',
  {
    userId: text('userId').notNull(),
    projectId: text('projectId').notNull(),
    role: text('role').notNull(),
  },
  table => [primaryKey({ columns: [table.userId, table.projectId] })],
)
let sqlite: DatabaseSync
let db: Database
let batches: number[]

beforeEach(() => {
  batches = []
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE roles (userId TEXT, projectId TEXT, role TEXT,
    PRIMARY KEY (userId, projectId));
    INSERT INTO roles VALUES ('old-user', 'project', 'admin'), ('other-user', 'other-project', 'admin')`)
  db = drizzle({
    prepare: (sql: string) => ({
      bind: (...params: never[]) => ({ sql, params }),
    }),
    batch: async (statements: { sql: string; params: never[] }[]) => {
      batches.push(statements.length)
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

/** Generates enough assignments to cross the former 100-statement transaction split. */
function assignments(count = 3300) {
  return Array.from({ length: count }, (_, i) => ({
    userId: `user-${i}`,
    projectId: 'untrusted-project',
    role: 'viewer',
  }))
}

/** Returns complete persisted state for rollback and ownership assertions. */
function snapshot() {
  return sqlite.prepare('SELECT * FROM roles ORDER BY projectId, userId').all()
}

describe('atomic relation replacement', () => {
  it('keeps a large replacement within one batch and enforces target ownership', async () => {
    const result = await replaceManyRelated(
      db,
      roles,
      assignments(),
      roles.projectId,
      'project',
    )
    expect(result).toHaveLength(3300)
    expect(result.every(row => row.projectId === 'project')).toBe(true)
    expect(batches).toEqual([101])
    expect(snapshot()).toHaveLength(3301)
    expect(snapshot()).toContainEqual({
      userId: 'other-user',
      projectId: 'other-project',
      role: 'admin',
    })
  })

  it('rolls back old-role deletion and every earlier insert on a late failure', async () => {
    sqlite.exec(`CREATE TRIGGER fail_late_insert BEFORE INSERT ON roles
      WHEN NEW.userId = 'user-3299'
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    const before = snapshot()
    await expect(
      replaceManyRelated(db, roles, assignments(), roles.projectId, 'project'),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('keeps old assignments when duplicate replacement keys fail', async () => {
    const [row] = assignments(1)
    const before = snapshot()
    await expect(
      replaceManyRelated(db, roles, [row, row], roles.projectId, 'project'),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('clears only the target relation on an empty replacement', async () => {
    expect(await replaceManyRelated(db, roles, [], roles.projectId, 'project')).toEqual(
      [],
    )
    expect(snapshot()).toEqual([
      { userId: 'other-user', projectId: 'other-project', role: 'admin' },
    ])
  })

  it('does not combine concurrent replacement sets across transaction boundaries', async () => {
    await Promise.all([
      replaceManyRelated(db, roles, assignments(), roles.projectId, 'project'),
      replaceManyRelated(
        db,
        roles,
        [{ ...assignments(1)[0], userId: 'last-user' }],
        roles.projectId,
        'project',
      ),
    ])
    expect(snapshot()).toEqual([
      { userId: 'other-user', projectId: 'other-project', role: 'admin' },
      { userId: 'last-user', projectId: 'project', role: 'viewer' },
    ])
  })
})
