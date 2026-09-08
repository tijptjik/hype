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
  sqlite.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE property (id TEXT PRIMARY KEY);
    INSERT INTO property VALUES ('property'), ('other-property');
    CREATE TABLE propertyValue (id TEXT PRIMARY KEY, propertyId TEXT NOT NULL REFERENCES property(id),
    rank INTEGER NOT NULL DEFAULT 0, value TEXT);
    INSERT INTO propertyValue VALUES ('owned', 'property', 0, 'original'), ('foreign', 'other-property', 0, 'private');
    CREATE TABLE propertyValueI18n (propertyValueId TEXT REFERENCES propertyValue(id) ON DELETE CASCADE, value TEXT);
    INSERT INTO propertyValueI18n VALUES ('owned', 'translation')`)
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
  it('preserves omitted fields and translations when updating an existing value', async () => {
    expect(
      await syncPropertyValues(
        db,
        [{ id: 'owned', rank: 3 }] as PropertyValue[],
        'property',
      ),
    ).toEqual([{ id: 'owned', propertyId: 'property', rank: 3, value: 'original' }])
    expect(sqlite.prepare('SELECT * FROM propertyValueI18n').all()).toEqual([
      { propertyValueId: 'owned', value: 'translation' },
    ])
    expect(
      await syncPropertyValues(
        db,
        [{ id: 'owned', value: null }] as PropertyValue[],
        'property',
      ),
    ).toEqual([{ id: 'owned', propertyId: 'property', rank: 3, value: null }])
  })

  it('creates missing IDs across insert chunks and returns the complete committed set', async () => {
    const result = await syncPropertyValues(
      db,
      Array.from({ length: 60 }, (_, rank) => ({
        rank,
        value: `new-${rank}`,
      })) as PropertyValue[],
      'property',
    )
    expect(result).toHaveLength(60)
    expect(new Set(result.map(value => value.id)).size).toBe(60)
    expect(result.every(value => value.propertyId === 'property')).toBe(true)
    expect(sqlite.prepare('SELECT * FROM propertyValueI18n').all()).toEqual([])
  })

  it('rolls back deletion when a submitted new ID belongs to another property', async () => {
    const before = sqlite.prepare('SELECT * FROM propertyValue').all()
    await expect(
      syncPropertyValues(
        db,
        [{ id: 'foreign', value: 'changed' }] as PropertyValue[],
        'property',
      ),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM propertyValue').all()).toEqual(before)
    expect(sqlite.prepare('SELECT * FROM propertyValueI18n').all()).toEqual([
      { propertyValueId: 'owned', value: 'translation' },
    ])
  })

  it('rolls back deletion and creation when a later update fails', async () => {
    sqlite.exec(
      "INSERT INTO propertyValue VALUES ('removed', 'property', 0, 'remove me')",
    )
    sqlite.exec(`CREATE TRIGGER fail_update BEFORE UPDATE ON propertyValue
      WHEN NEW.id = 'owned' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    const before = sqlite.prepare('SELECT * FROM propertyValue').all()
    await expect(
      syncPropertyValues(
        db,
        [
          { id: 'owned', value: 'changed' },
          { id: 'new', value: 'created' },
        ] as PropertyValue[],
        'property',
      ),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM propertyValue').all()).toEqual(before)
  })

  it('rolls back earlier insert chunks on a late creation failure', async () => {
    sqlite.exec(`CREATE TRIGGER fail_insert BEFORE INSERT ON propertyValue
      WHEN NEW.id = 'new-59' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    const before = sqlite.prepare('SELECT * FROM propertyValue').all()
    await expect(
      syncPropertyValues(
        db,
        Array.from({ length: 60 }, (_, i) => ({
          id: `new-${i}`,
          value: 'new',
        })) as PropertyValue[],
        'property',
      ),
    ).rejects.toThrow()
    expect(sqlite.prepare('SELECT * FROM propertyValue').all()).toEqual(before)
  })

  it('does not combine concurrent full replacement sets', async () => {
    await Promise.all([
      syncPropertyValues(
        db,
        [{ id: 'first', value: 'first' }] as PropertyValue[],
        'property',
      ),
      syncPropertyValues(
        db,
        [{ id: 'second', value: 'second' }] as PropertyValue[],
        'property',
      ),
    ])
    expect(
      sqlite
        .prepare("SELECT id FROM propertyValue WHERE propertyId = 'property'")
        .all(),
    ).toEqual([{ id: 'second' }])
  })

  it('rolls back other changes when an expected update target disappears', async () => {
    sqlite.exec(
      "INSERT INTO propertyValue VALUES ('removed', 'property', 0, 'keep me')",
    )
    afterSnapshot = () => sqlite.exec("DELETE FROM propertyValue WHERE id = 'owned'")
    await expect(
      syncPropertyValues(
        db,
        [
          { id: 'owned', value: 'changed' },
          { id: 'new', value: 'new' },
        ] as PropertyValue[],
        'property',
      ),
    ).rejects.toMatchObject({ status: 404 })
    expect(row('removed')).toMatchObject({ value: 'keep me' })
    expect(row('new')).toBeUndefined()
  })

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
