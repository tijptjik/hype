// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  removeUserFeatureListState,
  upsertUserFeatureState,
} from '$lib/db/services/user'
import type { Database } from '$lib/types'

let sqlite: DatabaseSync
let db: Database
const target = { userId: 'user', featureId: 'feature' }

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE userFeature (
    userId TEXT, featureId TEXT, isVisited INTEGER NOT NULL DEFAULT 0,
    isWishlisted INTEGER NOT NULL DEFAULT 0, visitedAt TEXT,
    createdAt TEXT NOT NULL DEFAULT 'created', modifiedAt TEXT NOT NULL DEFAULT 'modified',
    PRIMARY KEY (userId, featureId)
  )`)
  // Exercise real Drizzle SQL and response mapping with the D1 atomic batch contract.
  db = drizzle({
    prepare: (sql: string) => ({
      bind: (...params: never[]) => ({
        sql,
        params,
        run: async () => sqlite.prepare(sql).run(...params),
        raw: async () => {
          const statement = sqlite.prepare(sql)
          statement.setReturnArrays(true)
          return statement.all(...params)
        },
      }),
    }),
    batch: async (statements: { sql: string; params: never[] }[]) => {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(({ sql, params }) => ({
          results: sqlite.prepare(sql).all(...params),
        }))
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

/** Returns the persisted flags without Drizzle's boolean conversion. */
function state() {
  return sqlite
    .prepare('SELECT isWishlisted, isVisited, visitedAt FROM userFeature')
    .get()
}

describe('atomic saved-place state', () => {
  it('preserves omitted fields and accepts explicit false and null updates', async () => {
    await upsertUserFeatureState(db, {
      ...target,
      isVisited: true,
      isWishlisted: true,
      visitedAt: 'visit',
    })
    expect(
      await upsertUserFeatureState(db, { ...target, isWishlisted: false }),
    ).toMatchObject({ isVisited: true, isWishlisted: false, visitedAt: 'visit' })
    expect(
      await upsertUserFeatureState(db, { ...target, visitedAt: null }),
    ).toMatchObject({ isVisited: true, isWishlisted: false, visitedAt: null })
  })

  it('scopes removal to the exact user and feature', async () => {
    await upsertUserFeatureState(db, { ...target, isWishlisted: true })
    await upsertUserFeatureState(db, {
      ...target,
      userId: 'other-user',
      isWishlisted: true,
    })
    await upsertUserFeatureState(db, {
      ...target,
      featureId: 'other-feature',
      isWishlisted: true,
    })
    await removeUserFeatureListState(db, { ...target, list: 'wishlist' })
    expect(
      sqlite
        .prepare(
          'SELECT userId, featureId, isWishlisted FROM userFeature ORDER BY userId',
        )
        .all(),
    ).toEqual([
      { userId: 'other-user', featureId: 'feature', isWishlisted: 1 },
      { userId: 'user', featureId: 'other-feature', isWishlisted: 1 },
    ])
  })

  it.each([false, true])(
    'retains concurrent independent adds (existing row: %s)',
    async existing => {
      if (existing) await upsertUserFeatureState(db, target)
      await Promise.all([
        upsertUserFeatureState(db, { ...target, isWishlisted: true }),
        upsertUserFeatureState(db, { ...target, isVisited: true, visitedAt: 'visit' }),
      ])
      expect(state()).toEqual({ isWishlisted: 1, isVisited: 1, visitedAt: 'visit' })
    },
  )

  it('does not delete a concurrent visit when removing the wishlist flag', async () => {
    await upsertUserFeatureState(db, { ...target, isWishlisted: true })
    await Promise.all([
      removeUserFeatureListState(db, { ...target, list: 'wishlist' }),
      upsertUserFeatureState(db, { ...target, isVisited: true, visitedAt: 'visit' }),
    ])
    expect(state()).toEqual({ isWishlisted: 0, isVisited: 1, visitedAt: 'visit' })
  })

  it('clears both concurrently removed flags without resurrecting either', async () => {
    await upsertUserFeatureState(db, { ...target, isWishlisted: true, isVisited: true })
    await Promise.all([
      removeUserFeatureListState(db, { ...target, list: 'wishlist' }),
      removeUserFeatureListState(db, { ...target, list: 'visited' }),
    ])
    expect(state()).toBeUndefined()
  })

  it('returns the remaining state and clears the visited timestamp only with that flag', async () => {
    await upsertUserFeatureState(db, {
      ...target,
      isWishlisted: true,
      isVisited: true,
      visitedAt: 'visit',
    })
    expect(
      await removeUserFeatureListState(db, { ...target, list: 'wishlist' }),
    ).toMatchObject({ isWishlisted: false, isVisited: true, visitedAt: 'visit' })
    expect(
      await removeUserFeatureListState(db, { ...target, list: 'visited' }),
    ).toBeNull()
    expect(
      await removeUserFeatureListState(db, { ...target, list: 'visited' }),
    ).toBeNull()
  })

  it('preserves the wishlist when clearing a visit', async () => {
    await upsertUserFeatureState(db, {
      ...target,
      isWishlisted: true,
      isVisited: true,
      visitedAt: 'visit',
    })
    expect(
      await removeUserFeatureListState(db, { ...target, list: 'visited' }),
    ).toMatchObject({ isWishlisted: true, isVisited: false, visitedAt: null })
  })

  it('rolls back the flag update if empty-row cleanup fails', async () => {
    await upsertUserFeatureState(db, { ...target, isVisited: true, visitedAt: 'visit' })
    sqlite.exec(`CREATE TRIGGER fail_cleanup BEFORE DELETE ON userFeature
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    await expect(
      removeUserFeatureListState(db, { ...target, list: 'visited' }),
    ).rejects.toThrow()
    expect(state()).toEqual({ isWishlisted: 0, isVisited: 1, visitedAt: 'visit' })
  })
})
