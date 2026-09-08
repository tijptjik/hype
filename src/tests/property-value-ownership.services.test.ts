// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { propertyValue } from '$lib/db/schema'
import { syncPropertyValues } from '$lib/db/services/property'
import type { Database } from '$lib/types'
import type { PropertyValue } from '$lib/db/zod/schema/property.types'

let sqlite: DatabaseSync
let db: Database
let afterSnapshot: (() => void) | undefined

beforeEach(() => {
  afterSnapshot = undefined
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`CREATE TABLE propertyValue (id TEXT PRIMARY KEY, propertyId TEXT NOT NULL,
    rank INTEGER NOT NULL DEFAULT 0, value TEXT);
    INSERT INTO propertyValue VALUES ('owned', 'property', 0, 'original'), ('foreign', 'other-property', 0, 'private')`)
  db = drizzle(
    {
      prepare: (sql: string) => ({
        bind: (...params: never[]) => ({
          sql,
          params,
          raw: async () => {
            if (params.length > 100) throw new Error('D1 parameter budget exceeded')
            const statement = sqlite.prepare(sql)
            statement.setReturnArrays(true)
            const rows = statement.all(...params)
            if (sql.startsWith('select') && afterSnapshot) {
              const callback = afterSnapshot
              afterSnapshot = undefined
              callback()
            }
            return rows
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
    } as never,
    { schema: { propertyValue } },
  ) as Database
})
afterEach(() => sqlite.close())

/** Reads the value directly so foreign rows cannot disappear behind scoped queries. */
function row(id: string) {
  return sqlite.prepare('SELECT * FROM propertyValue WHERE id = ?').get(id)
}

describe('property-value ownership', () => {
  it('does not relocate an owned value using its submitted parent ID', async () => {
    const result = await syncPropertyValues(
      db,
      [
        {
          id: 'owned',
          propertyId: 'other-property',
          rank: 2,
          value: 'updated',
        },
      ] as PropertyValue[],
      'property',
    )
    expect(result).toEqual([
      { id: 'owned', propertyId: 'property', rank: 2, value: 'updated' },
    ])
    expect(row('foreign')).toMatchObject({
      propertyId: 'other-property',
      value: 'private',
    })
  })

  it('does not update a value that moved outside the target after the read', async () => {
    afterSnapshot = () =>
      sqlite.exec(
        "UPDATE propertyValue SET propertyId = 'other-property' WHERE id = 'owned'",
      )
    await expect(
      syncPropertyValues(
        db,
        [{ id: 'owned', value: 'attacker', rank: 3 }] as PropertyValue[],
        'property',
      ),
    ).rejects.toMatchObject({ status: 404 })
    expect(row('owned')).toMatchObject({
      propertyId: 'other-property',
      value: 'original',
      rank: 0,
    })
  })

  it('does not delete a value that moved outside the target after the read', async () => {
    afterSnapshot = () =>
      sqlite.exec(
        "UPDATE propertyValue SET propertyId = 'other-property' WHERE id = 'owned'",
      )
    expect(await syncPropertyValues(db, [], 'property')).toEqual([])
    expect(row('owned')).toMatchObject({
      propertyId: 'other-property',
      value: 'original',
    })
  })

  it('still creates, updates, and removes values within the target property', async () => {
    const result = await syncPropertyValues(
      db,
      [
        { id: 'new', propertyId: 'other-property', value: 'new', rank: 1 },
      ] as PropertyValue[],
      'property',
    )
    expect(result).toEqual([
      { id: 'new', propertyId: 'property', rank: 1, value: 'new' },
    ])
    expect(row('owned')).toBeUndefined()
    expect(row('foreign')).toMatchObject({
      propertyId: 'other-property',
      value: 'private',
    })
  })

  it('keeps large scoped deletions within the D1 parameter budget', async () => {
    const insert = sqlite.prepare('INSERT INTO propertyValue VALUES (?, ?, 0, ?)')
    for (let i = 0; i < 120; i++) insert.run(`value-${i}`, 'property', 'old')
    expect(await syncPropertyValues(db, [], 'property')).toEqual([])
    expect(row('foreign')).toMatchObject({
      propertyId: 'other-property',
      value: 'private',
    })
  })
})
