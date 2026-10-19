// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { getTableColumns } from 'drizzle-orm'
import * as schema from '#lib/db/schema/index.js'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  assertMapStyleProjectScope,
  listMapStylesForScope,
  resolveVisibleMapStyleIdForScope,
  setProjectMapStyleByCode,
} from '#lib/db/services/map.js'
import type { Database } from '#lib/types.js'

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
    CREATE TABLE project (id TEXT PRIMARY KEY, code TEXT);
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
    INSERT INTO project VALUES ('project', 'eln'), ('other', 'other');
    INSERT INTO mapStyles (id, code, organisationId, hubId) VALUES
      ('noclit26', 'noclit26', NULL, NULL),
      ('old', 'old', NULL, NULL), ('global', 'global', NULL, NULL),
      ('scoped', 'scoped', 'org', 'hub'), ('foreign', 'foreign', 'other-org', NULL);
    INSERT INTO projectMapStyles VALUES
      ('project', 'old', 'created', 'modified'), ('other', 'old', 'other-created', 'other-modified')`)
  const i18nColumns = Object.values(getTableColumns(schema.mapStyleI18n)).map(
    column => `"${column.name}" ${column.getSQLType()}`,
  )
  sqlite.exec(`CREATE TABLE mapStyleI18n (${i18nColumns.join(', ')})`)
  db = drizzle(
    {
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
    } as never,
    { schema },
  ) as Database
})
afterEach(() => sqlite.close())

/** Captures assignments and timestamps for rollback and cross-project checks. */
const snapshot = () =>
  sqlite.prepare('SELECT * FROM projectMapStyles ORDER BY projectId').all()

describe('project map-style replacement', () => {
  it('includes NocLit only for eln in the relational picker listing', async () => {
    const shared = { organisationId: 'org', hubId: 'hub' }
    expect(
      (await listMapStylesForScope(db, { ...shared, id: 'project' })).map(
        row => row.code,
      ),
    ).toContain('noclit26')
    expect(
      (await listMapStylesForScope(db, { ...shared, id: 'other' })).map(
        row => row.code,
      ),
    ).not.toContain('noclit26')
    expect(
      (await listMapStylesForScope(db, shared)).map(row => row.code),
    ).not.toContain('noclit26')
  })

  it('allows layer styles only within the owning project, without catalog DB registration', async () => {
    sqlite.exec("DELETE FROM mapStyles WHERE code = 'noclit26'")
    await expect(
      assertMapStyleProjectScope(db, 'project', 'noclit26'),
    ).resolves.toBeUndefined()
    await expect(assertMapStyleProjectScope(db, 'other', 'noclit26')).rejects.toThrow(
      'unavailable',
    )
    await expect(assertMapStyleProjectScope(db, 'missing', 'noclit26')).rejects.toThrow(
      'unavailable',
    )
    await expect(
      assertMapStyleProjectScope(db, 'other', 'hyper'),
    ).resolves.toBeUndefined()
  })

  it('hides NocLit from unscoped and other-project lookups', async () => {
    const organisationScope = { organisationId: 'org', hubId: 'hub' }
    expect(
      await resolveVisibleMapStyleIdForScope(db, organisationScope, 'noclit26'),
    ).toBeNull()
    expect(
      await resolveVisibleMapStyleIdForScope(
        db,
        { ...organisationScope, id: 'other' },
        'noclit26',
      ),
    ).toBeNull()
    expect(
      await resolveVisibleMapStyleIdForScope(
        db,
        { ...organisationScope, id: 'project' },
        'noclit26',
      ),
    ).toBe('noclit26')
  })

  it('allows NocLit only for eln, including a write-time ownership recheck', async () => {
    await setProjectMapStyleByCode(db, { ...scope, mapStyleCode: 'noclit26' })
    const before = snapshot()
    await expect(
      setProjectMapStyleByCode(db, {
        ...scope,
        projectId: 'other',
        mapStyleCode: 'noclit26',
      }),
    ).rejects.toThrow('Unknown or unavailable map style')
    expect(snapshot()).toEqual(before)
    beforeBatch = () =>
      sqlite.exec("UPDATE project SET code = 'renamed' WHERE id = 'project'")
    await expect(
      setProjectMapStyleByCode(db, {
        ...scope,
        mapStyleCode: 'noclit26',
      }),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

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
