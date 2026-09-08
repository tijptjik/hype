// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setProjectMapStyleByCode } from '$lib/db/services/map'
import type { Database } from '$lib/types'

let sqlite: DatabaseSync
let db: Database
let batches: number[]
let beforeBatch: (() => void) | undefined
const scope = { projectId: 'project', organisationId: 'org', hubId: 'hub' }

beforeEach(() => {
  batches = []
  beforeBatch = undefined
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE project (id TEXT PRIMARY KEY);
    CREATE TABLE mapStyles (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE,
      organisationId TEXT, hubId TEXT, previewImagePath TEXT,
      createdAt TEXT, modifiedAt TEXT
    );
    CREATE TABLE projectMapStyles (
      projectId TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
      mapStyleId TEXT NOT NULL REFERENCES mapStyles(id) ON DELETE RESTRICT,
      createdAt TEXT NOT NULL, modifiedAt TEXT NOT NULL
    );
    INSERT INTO project VALUES ('project'), ('other');
    INSERT INTO mapStyles (id, code, organisationId, hubId) VALUES
      ('old', 'old', NULL, NULL), ('global', 'global', NULL, NULL),
      ('scoped', 'scoped', 'org', 'hub'), ('foreign', 'foreign', 'other-org', NULL);
    INSERT INTO projectMapStyles VALUES
      ('project', 'old', 'created', 'modified'), ('other', 'old', 'other-created', 'other-modified')`)
  db = drizzle({
    prepare: (sql: string) => ({
      bind: (...params: never[]) => ({
        sql,
        params,
        run: async () => {
          sqlite.prepare(sql).run(...params)
          return { success: true, meta: {} }
        },
        raw: async () => {
          const statement = sqlite.prepare(sql)
          statement.setReturnArrays(true)
          return statement.all(...params)
        },
      }),
    }),
    batch: async (statements: { sql: string; params: never[] }[]) => {
      batches.push(statements.length)
      beforeBatch?.()
      sqlite.exec('BEGIN')
      try {
        const result = statements.map(({ sql, params }) => {
          if (params.length > 100) throw new Error('D1 parameter budget exceeded')
          return { results: sqlite.prepare(sql).all(...params) }
        })
        sqlite.exec('COMMIT')
        return result
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  } as never) as Database
})
afterEach(() => sqlite.close())

/** Captures assignments and timestamps for rollback and cross-project checks. */
const snapshot = () =>
  sqlite.prepare('SELECT * FROM projectMapStyles ORDER BY projectId').all()

describe('project map-style replacement', () => {
  it.each(['missing', 'foreign'])(
    'preserves the saved style when %s is unavailable',
    async mapStyleCode => {
      const before = snapshot()
      await expect(
        setProjectMapStyleByCode(db, { ...scope, mapStyleCode }),
      ).rejects.toThrow('Unknown or unavailable map style')
      expect(snapshot()).toEqual(before)
    },
  )

  it('restores the original assignment and timestamps if insertion fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_style BEFORE INSERT ON projectMapStyles
      WHEN NEW.mapStyleId = 'global'
      BEGIN SELECT RAISE(ABORT, 'injected map-style failure'); END`)
    const before = snapshot()
    await expect(
      setProjectMapStyleByCode(db, { ...scope, mapStyleCode: 'global' }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    expect(batches).toEqual([2])
  })

  it.each(['move', 'delete', 'rename'])(
    'rejects a selected style that changes before the batch: %s',
    async change => {
      beforeBatch = () =>
        sqlite.exec(
          change === 'move'
            ? "UPDATE mapStyles SET organisationId = 'other-org' WHERE id = 'scoped'"
            : change === 'delete'
              ? "DELETE FROM mapStyles WHERE id = 'scoped'"
              : "UPDATE mapStyles SET code = 'renamed' WHERE id = 'scoped'",
        )
      const before = snapshot()
      await expect(
        setProjectMapStyleByCode(db, { ...scope, mapStyleCode: 'scoped' }),
      ).rejects.toThrow()
      expect(snapshot()).toEqual(before)
    },
  )

  it.each([' global ', 'scoped'])(
    'assigns an available style without touching another project: %s',
    async mapStyleCode => {
      const other = snapshot()[0]
      await setProjectMapStyleByCode(db, { ...scope, mapStyleCode })
      expect(snapshot()[0]).toEqual(other)
      expect(snapshot()[1].mapStyleId).toBe(mapStyleCode.trim())
      expect(batches).toEqual([2])
    },
  )

  it('excludes hub-scoped styles when the project has no hub', async () => {
    const before = snapshot()
    await expect(
      setProjectMapStyleByCode(db, { ...scope, hubId: null, mapStyleCode: 'scoped' }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    await setProjectMapStyleByCode(db, {
      ...scope,
      hubId: null,
      mapStyleCode: 'global',
    })
    expect(snapshot()[1].mapStyleId).toBe('global')
  })

  it.each([null, undefined, '  '])(
    'clears only the requested project for an empty code: %s',
    async mapStyleCode => {
      const other = snapshot()[0]
      await setProjectMapStyleByCode(db, { ...scope, mapStyleCode })
      expect(snapshot()).toEqual([other])
    },
  )
})
