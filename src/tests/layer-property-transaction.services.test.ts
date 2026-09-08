// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { getTableColumns, getTableName } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createProperties,
  syncProperties,
  updateProperties,
} from '$lib/db/services/layer'
import * as schema from '$lib/db/schema'
import type { Database } from '$lib/types'
import type { Property } from '$lib/db/zod/schema/property.types'

let sqlite: DatabaseSync
let db: Database
let batches: number[]
let beforeBatch: (() => void) | undefined
beforeEach(() => {
  batches = []
  beforeBatch = undefined
  sqlite = new DatabaseSync(':memory:')
  // Include every real selected column so nested hydration runs through Drizzle SQL.
  for (const table of [
    schema.layer,
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
    INSERT INTO layer (id, projectId) VALUES ('layer', 'project'), ('second', 'project'), ('other-layer', 'other-project');
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
        beforeBatch?.()
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

describe('project child-layer property synchronization', () => {
  it('uses live layer membership and preserves flags changed before the batch begins', async () => {
    beforeBatch = () => {
      sqlite.exec(`UPDATE layerProperty SET isVisible = 0 WHERE layerId = 'layer';
        UPDATE layer SET projectId = 'other-project' WHERE id = 'second';
        INSERT INTO layer (id, projectId) VALUES ('late-layer', 'project');
        INSERT INTO layerProperty VALUES ('second', 'unrelated', 1, 0)`)
    }
    await syncProperties(db, 'project', [
      { id: 'old', scope: 'project', isDefaultEnabled: true },
    ] as Property[])
    expect(snapshot()).toEqual([
      {
        layerId: 'late-layer',
        propertyId: 'old',
        isVisible: 1,
        isUserContributable: 1,
      },
      { layerId: 'layer', propertyId: 'old', isVisible: 0, isUserContributable: 1 },
      {
        layerId: 'other-layer',
        propertyId: 'other',
        isVisible: 1,
        isUserContributable: 0,
      },
      {
        layerId: 'second',
        propertyId: 'unrelated',
        isVisible: 1,
        isUserContributable: 0,
      },
    ])
  })

  it('preserves existing flags and applies enabled/default semantics only to new links', async () => {
    await syncProperties(db, 'project', [
      { id: 'old', scope: 'project', isDefaultEnabled: false },
      { id: 'new', scope: 'global', isEnabled: true, isDefaultEnabled: false },
      { id: 'default', scope: 'global', isDefaultEnabled: true },
      { id: 'disabled', scope: 'global', isEnabled: false, isDefaultEnabled: true },
    ] as Property[])
    expect(snapshot()).toHaveLength(7)
    expect(snapshot()).toContainEqual({
      layerId: 'layer',
      propertyId: 'old',
      isVisible: 1,
      isUserContributable: 1,
    })
    expect(snapshot()).toContainEqual({
      layerId: 'second',
      propertyId: 'old',
      isVisible: 0,
      isUserContributable: 0,
    })
    expect(snapshot()).toContainEqual({
      layerId: 'layer',
      propertyId: 'new',
      isVisible: 0,
      isUserContributable: 0,
    })
    expect(snapshot()).toContainEqual({
      layerId: 'second',
      propertyId: 'default',
      isVisible: 1,
      isUserContributable: 1,
    })
    expect(snapshot()).toContainEqual({
      layerId: 'other-layer',
      propertyId: 'other',
      isVisible: 1,
      isUserContributable: 0,
    })
    expect(batches).toEqual([2])
  })

  it('rolls back removals and earlier layer insertions on a later layer failure', async () => {
    sqlite.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON layerProperty
      WHEN NEW.layerId = 'second'
      BEGIN SELECT RAISE(ABORT, 'injected layer failure'); END`)
    const before = snapshot()
    await expect(
      syncProperties(db, 'project', [
        { id: 'new', scope: 'project', isDefaultEnabled: true },
      ] as Property[]),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
    expect(batches).toEqual([2])
  })

  it('synchronizes large property collections within one bounded batch', async () => {
    await syncProperties(
      db,
      'project',
      Array.from({ length: 2500 }, (_, i) => ({
        id: `property-${i}`,
        scope: 'project',
        isDefaultEnabled: true,
      })) as Property[],
    )
    expect(snapshot()).toHaveLength(5001)
    expect(snapshot().some(row => row.propertyId === 'old')).toBe(false)
    expect(batches).toEqual([2])
  })

  it('clears only the current project layers when no properties are enabled', async () => {
    await syncProperties(db, 'project', [])
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
