// @vitest-environment node
// DRIZZLE
import { sql } from 'drizzle-orm'
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
// TESTS
import { describe, expect, it } from 'vitest'
// SERVICES
import { prepareGuardedReplacement } from '#lib/db/services/guardedReplacement.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

let generated = 0
const rows = sqliteTable('rows', {
  id: text('id').$defaultFn(() => `generated-${++generated}`),
  ownerId: text('owner_id'),
  name: text('name'),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  details: text('details', { mode: 'json' }).$type<{ value: string }>(),
  label: text('label').generatedAlwaysAs(sql`upper(name)`),
})

describe('guarded replacement SQL generation', () => {
  it('preserves mapped ownership, driver encodings, generated columns and once-per-row defaults', async () => {
    const { sqlite, db } = publicationSqlite({})
    try {
      generated = 0
      sqlite.exec(
        'CREATE TABLE rows(id TEXT, owner_id TEXT, name TEXT, enabled INTEGER, details TEXT, label TEXT GENERATED ALWAYS AS (upper(name)))',
      )
      const values = Array.from({ length: 100 }, () => ({
        ownerId: 'untrusted',
        name: 'hello',
        details: { value: 'nested' },
      }))
      const statements = prepareGuardedReplacement(
        db as unknown as Database,
        rows,
        values,
        rows.ownerId,
        'target',
        sql`1`,
      )
      expect(generated).toBe(100)
      await db.batch(statements)
      expect(generated).toBe(100)
      expect(
        sqlite.prepare('SELECT owner_id,enabled,details,label FROM rows LIMIT 1').get(),
      ).toEqual({
        owner_id: 'target',
        enabled: 1,
        details: '{"value":"nested"}',
        label: 'HELLO',
      })
      expect(sqlite.prepare('SELECT count(DISTINCT id) n FROM rows').get()).toEqual({
        n: 100,
      })
    } finally {
      sqlite.close()
    }
  })

  it('preserves explicit nulls and false values rather than replacing them with defaults', async () => {
    const { sqlite, db } = publicationSqlite({})
    try {
      sqlite.exec(
        'CREATE TABLE rows(id TEXT, owner_id TEXT, name TEXT, enabled INTEGER, details TEXT, label TEXT GENERATED ALWAYS AS (upper(name)))',
      )
      await db.batch(
        prepareGuardedReplacement(
          db as unknown as Database,
          rows,
          [{ id: 'manual', enabled: false, name: null, details: null }],
          rows.ownerId,
          'target',
          sql`1`,
        ),
      )
      expect(sqlite.prepare('SELECT id,enabled,name,details FROM rows').get()).toEqual({
        id: 'manual',
        enabled: 0,
        name: null,
        details: null,
      })
    } finally {
      sqlite.close()
    }
  })
})
