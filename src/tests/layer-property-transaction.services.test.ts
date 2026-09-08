// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createProperties, updateProperties } from '$lib/db/services/layer'
import * as schema from '$lib/db/schema'
import type { Database } from '$lib/types'

let sqlite: DatabaseSync
let db: Database
let batches: number[]
beforeEach(() => {
  batches = []
  sqlite = new DatabaseSync(':memory:')
  // Include every real selected column so nested hydration runs through Drizzle SQL.
  for (const table of [
    schema.layerProperty,
    schema.property,
    schema.propertyI18n,
    schema.propertyValue,
    schema.propertyValueI18n,
  ]) {
    const columns = Object.values(getTableColumns(table)).map(
      column => `"${column.name}" ${column.getSQLType()}`,
    )
    sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(', ')})`)
  }
  sqlite.exec(`CREATE UNIQUE INDEX layer_property_unique ON layerProperty(layerId, propertyId);
    INSERT INTO layerProperty VALUES ('layer', 'old', 1, 1), ('other-layer', 'other', 1, 0);
    INSERT INTO property (id, key) VALUES ('new', 'new-key');
    INSERT INTO propertyI18n (propertyId, locale, label) VALUES ('new', 'en', 'New property');
    INSERT INTO propertyValue (id, propertyId, rank, value) VALUES ('value', 'new', 0, 'canonical');
    INSERT INTO propertyValueI18n (propertyValueId, locale, value) VALUES ('value', 'en', 'Translated')`)
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
    { schema },
  ) as Database
})
afterEach(() => sqlite.close())

/** Captures every layer's settings for rollback and cross-layer isolation checks. */
function snapshot() {
  return sqlite
    .prepare('SELECT * FROM layerProperty ORDER BY layerId, propertyId')
    .all()
}

describe('layer-property replacement integrity', () => {
  it.each([createProperties, updateProperties])(
    'binds writes to the target layer and preserves hydrated return data (%#)',
    async write => {
      const submitted = {
        layerId: 'spoofed-layer',
        propertyId: 'new',
        isVisible: false,
        isUserContributable: true,
      }
      const rows = await write(db, 'layer', [submitted])
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            layerId: 'layer',
            propertyId: 'new',
            isVisible: false,
            isUserContributable: true,
            property: expect.objectContaining({
              id: 'new',
              i18n: [expect.objectContaining({ locale: 'en', label: 'New property' })],
              values: [
                expect.objectContaining({
                  id: 'value',
                  i18n: [
                    expect.objectContaining({ locale: 'en', value: 'Translated' }),
                  ],
                }),
              ],
            }),
          }),
        ]),
      )
      expect(snapshot().some(row => row.layerId === 'spoofed-layer')).toBe(false)
      expect(snapshot()).toContainEqual({
        layerId: 'other-layer',
        propertyId: 'other',
        isVisible: 1,
        isUserContributable: 0,
      })
    },
  )

  it('rolls back deletion and all earlier chunks when a late replacement insert fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_last_link BEFORE INSERT ON layerProperty
      WHEN NEW.propertyId = 'property-2499'
      BEGIN SELECT RAISE(ABORT, 'injected late failure'); END`)
    const before = snapshot()
    await expect(
      updateProperties(
        db,
        'layer',
        Array.from({ length: 2500 }, (_, i) => ({
          propertyId: `property-${i}`,
          isVisible: true,
          isUserContributable: false,
        })),
      ),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    expect(batches).toEqual([101])
  })

  it('keeps existing links when duplicate replacements fail', async () => {
    const before = snapshot()
    const duplicate = { propertyId: 'new', isVisible: true, isUserContributable: false }
    await expect(
      updateProperties(db, 'layer', [duplicate, duplicate]),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('clears only the target layer and returns an empty hydrated list', async () => {
    expect(await updateProperties(db, 'layer', [])).toEqual([])
    expect(snapshot()).toEqual([
      {
        layerId: 'other-layer',
        propertyId: 'other',
        isVisible: 1,
        isUserContributable: 0,
      },
    ])
    expect(batches).toEqual([1])
  })
})
