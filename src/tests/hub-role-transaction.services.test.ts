// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncHubLayerDefaults, syncUserRoles } from '$lib/db/services/hub'
import type { Database } from '$lib/types'

let sqlite: DatabaseSync
let db: Database
let batches: number[]

beforeEach(() => {
  batches = []
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE hubRole (hubId TEXT NOT NULL, userId TEXT NOT NULL, role TEXT NOT NULL,
    PRIMARY KEY (hubId, userId));
    INSERT INTO hubRole VALUES ('hub', 'old-admin', 'admin'), ('other-hub', 'other-admin', 'admin')`)
  sqlite.exec(`CREATE TABLE hubLayer (hubId TEXT NOT NULL, layerId TEXT NOT NULL, isDefaultVisible INTEGER NOT NULL,
    PRIMARY KEY (hubId, layerId));
    INSERT INTO hubLayer VALUES ('hub', 'old-layer', 1), ('other-hub', 'other-layer', 0)`)
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

describe('atomic hub-layer default replacement', () => {
  /** Captures both hubs so rollback tests also detect out-of-scope mutations. */
  function defaults() {
    return sqlite.prepare('SELECT * FROM hubLayer ORDER BY hubId, layerId').all()
  }

  it('preserves all previous defaults when a late insertion fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_last_default BEFORE INSERT ON hubLayer
      WHEN NEW.layerId = 'layer-3299'
      BEGIN SELECT RAISE(ABORT, 'injected late failure'); END`)
    const before = defaults()
    await expect(
      syncHubLayerDefaults(
        db,
        'hub',
        Array.from({ length: 3300 }, (_, i) => ({
          layerId: `layer-${i}`,
          isDefaultVisible: true,
        })),
      ),
    ).rejects.toThrow()
    expect(defaults()).toEqual(before)
  })

  it('rejects duplicate defaults without deleting existing rows', async () => {
    const before = defaults()
    const duplicate = { layerId: 'new-layer', isDefaultVisible: true }
    await expect(
      syncHubLayerDefaults(db, 'hub', [duplicate, duplicate]),
    ).rejects.toThrow()
    expect(defaults()).toEqual(before)
  })

  it('replaces defaults and clears only the target hub', async () => {
    await syncHubLayerDefaults(db, 'hub', [
      { layerId: 'new-layer', isDefaultVisible: false },
    ])
    expect(defaults()).toEqual([
      { hubId: 'hub', layerId: 'new-layer', isDefaultVisible: 0 },
      { hubId: 'other-hub', layerId: 'other-layer', isDefaultVisible: 0 },
    ])
    await syncHubLayerDefaults(db, 'hub', [])
    expect(defaults()).toEqual([
      { hubId: 'other-hub', layerId: 'other-layer', isDefaultVisible: 0 },
    ])
    expect(batches).toEqual([2, 1])
  })
})
afterEach(() => sqlite.close())

/** Captures all persisted grants, including the hub outside the replacement scope. */
function snapshot() {
  return sqlite.prepare('SELECT * FROM hubRole ORDER BY hubId, userId').all()
}

/** Generates enough grants to require more than 100 parameter-safe statements. */
function assignments() {
  return Array.from({ length: 3300 }, (_, i) => ({
    userId: `user-${i}`,
    role: 'admin',
  }))
}

describe('atomic hub administrator replacement', () => {
  it('keeps a large replacement in one transaction without touching another hub', async () => {
    await syncUserRoles(db, assignments(), 'hub')
    expect(batches).toEqual([101])
    expect(snapshot()).toHaveLength(3301)
    expect(snapshot()).toContainEqual({
      hubId: 'other-hub',
      userId: 'other-admin',
      role: 'admin',
    })
    expect(snapshot()).not.toContainEqual({
      hubId: 'hub',
      userId: 'old-admin',
      role: 'admin',
    })
  })

  it('restores every previous administrator if the final insert fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_last_grant BEFORE INSERT ON hubRole
      WHEN NEW.userId = 'user-3299'
      BEGIN SELECT RAISE(ABORT, 'injected late failure'); END`)
    const before = snapshot()
    await expect(syncUserRoles(db, assignments(), 'hub')).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('keeps previous administrators when duplicate submitted users fail', async () => {
    const before = snapshot()
    const duplicate = { userId: 'new-admin', role: 'admin' }
    await expect(syncUserRoles(db, [duplicate, duplicate], 'hub')).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('clears only the specified hub when an empty replacement is authorized', async () => {
    await syncUserRoles(db, [], 'hub')
    expect(snapshot()).toEqual([
      { hubId: 'other-hub', userId: 'other-admin', role: 'admin' },
    ])
    expect(batches).toEqual([1])
  })

  it('does not combine two concurrent replacement sets', async () => {
    await Promise.all([
      syncUserRoles(db, [{ userId: 'first', role: 'admin' }], 'hub'),
      syncUserRoles(db, [{ userId: 'last', role: 'admin' }], 'hub'),
    ])
    expect(snapshot()).toEqual([
      { hubId: 'hub', userId: 'last', role: 'admin' },
      { hubId: 'other-hub', userId: 'other-admin', role: 'admin' },
    ])
  })
})
