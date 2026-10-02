// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { updateProjectArchivedStateById } from '#lib/db/services/project.js'
import type { Database } from '#lib/types.js'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

/** Runs the generated statements in SQLite with D1's documented atomic batch semantics. */
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`CREATE TABLE project (id TEXT PRIMARY KEY, isArchived INTEGER, modifiedAt TEXT);
    CREATE TABLE organisation (id TEXT PRIMARY KEY, isArchived INTEGER);
    CREATE TABLE layer (id TEXT PRIMARY KEY, projectId TEXT, organisationId TEXT,
      isArchived INTEGER, localIsArchived INTEGER, modifiedAt TEXT);
    CREATE TABLE feature (id TEXT PRIMARY KEY, projectId TEXT, organisationId TEXT,
      isArchived INTEGER, localIsArchived INTEGER, modifiedAt TEXT);
    INSERT INTO project (id, isArchived) VALUES ('project', 0);
    INSERT INTO organisation VALUES ('org', 0);
    INSERT INTO layer (id, projectId, organisationId, isArchived, localIsArchived) VALUES ('active', 'project', 'org', 0, NULL),
      ('archived', 'project', 'org', 1, NULL), ('other', 'other', 'org', 0, NULL);
    INSERT INTO feature (id, projectId, organisationId, isArchived, localIsArchived) VALUES ('active', 'project', 'org', 0, NULL),
      ('archived', 'project', 'org', 1, NULL);`)
  const db = drizzle({
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          sqlite.prepare(sql).run(...(params as never[]))
          return { success: true }
        },
      }),
    }),
  } as never) as Database
  vi.spyOn(db, 'batch').mockImplementation(async queries => {
    sqlite.exec('BEGIN')
    try {
      const result = queries.map(query => {
        if (!('toSQL' in query) || typeof query.toSQL !== 'function') {
          throw new Error('Expected a SQL statement')
        }
        const { sql, params } = query.toSQL()
        return sqlite.prepare(sql).all(...(params as never[]))
      })
      sqlite.exec('COMMIT')
      return result as never
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  })
  return { sqlite, db }
}

describe('atomic project archive restoration', () => {
  it('restores active descendants while preserving individually archived records', async () => {
    const { db, sqlite } = setup()
    await updateProjectArchivedStateById(db, { id: 'project', state: true })
    expect(
      sqlite
        .prepare("SELECT isArchived, localIsArchived FROM layer WHERE id = 'active'")
        .get(),
    ).toEqual({ isArchived: 1, localIsArchived: 0 })
    await updateProjectArchivedStateById(db, { id: 'project', state: false })
    for (const table of ['layer', 'feature']) {
      expect(
        sqlite
          .prepare(
            `SELECT isArchived, localIsArchived FROM ${table} WHERE id = 'active'`,
          )
          .get(),
      ).toEqual({ isArchived: 0, localIsArchived: null })
      expect(
        sqlite
          .prepare(
            `SELECT isArchived, localIsArchived FROM ${table} WHERE id = 'archived'`,
          )
          .get(),
      ).toEqual({ isArchived: 1, localIsArchived: null })
    }
    expect(
      sqlite.prepare("SELECT isArchived FROM layer WHERE id = 'other'").get(),
    ).toEqual({ isArchived: 0 })
  })

  it.each(['layer', 'feature'])(
    'rolls back parent and descendants if %s restoration fails',
    async table => {
      const { db, sqlite } = setup()
      await updateProjectArchivedStateById(db, { id: 'project', state: true })
      sqlite.exec(`CREATE TRIGGER fail_restore BEFORE UPDATE ON ${table}
      BEGIN SELECT RAISE(ABORT, 'restore failed'); END;`)
      await expect(
        updateProjectArchivedStateById(db, { id: 'project', state: false }),
      ).rejects.toThrow('restore failed')
      expect(sqlite.prepare('SELECT isArchived FROM project').get()).toEqual({
        isArchived: 1,
      })
      for (const child of ['layer', 'feature']) {
        expect(
          sqlite
            .prepare(
              `SELECT isArchived, localIsArchived FROM ${child} WHERE id = 'active'`,
            )
            .get(),
        ).toEqual({ isArchived: 1, localIsArchived: 0 })
      }
    },
  )

  it('keeps descendants hidden and preserves snapshots under an archived organisation', async () => {
    const { db, sqlite } = setup()
    await updateProjectArchivedStateById(db, { id: 'project', state: true })
    sqlite.exec('UPDATE organisation SET isArchived = 1')
    await updateProjectArchivedStateById(db, { id: 'project', state: false })
    for (const table of ['layer', 'feature']) {
      expect(
        sqlite
          .prepare(
            `SELECT isArchived, localIsArchived FROM ${table} WHERE id = 'active'`,
          )
          .get(),
      ).toEqual({ isArchived: 1, localIsArchived: 0 })
    }
  })
})
