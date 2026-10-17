// TYPES
import type { D1Database } from '@cloudflare/workers-types'
// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { and, type SQL } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { toOrderByWithLocalizedFields } from '#lib/db/index.js'
import type { Database } from '#lib/types.js'

const resource = sqliteTable('resource', { id: text().primaryKey(), name: text() })
const translations = sqliteTable('translation', {
  resourceId: text(),
  locale: text(),
  name: text(),
})
const sqlite = new DatabaseSync(':memory:')
const db = drizzle({} as D1Database) as unknown as Database
sqlite.exec(`CREATE TABLE resource (id TEXT PRIMARY KEY, name TEXT);
  CREATE TABLE translation (resourceId TEXT, locale TEXT, name TEXT);
  INSERT INTO resource VALUES ('a',NULL),('b','same'),('c','same'),('d','z');
  INSERT INTO translation VALUES ('a','en',NULL),('b','en','same'),('c','en','same'),('d','en','z');`)
afterEach(() => sqlite.exec("DELETE FROM resource WHERE id = '0'"))

function page(
  sortOrder: 'asc' | 'desc',
  localized: boolean,
  cursor?: { id: string; value: string },
) {
  const conditions: SQL[] = []
  const orderBy = toOrderByWithLocalizedFields({
    db,
    locale: 'en',
    sortBy: 'name',
    sortOrder,
    fallbackColumn: resource.id,
    baseTable: resource,
    localizedSortColumns: localized ? { name: translations.name } : {},
    i18nTable: translations,
    parentIdColumn: resource.id,
    foreignKeyColumn: translations.resourceId,
    localeColumn: translations.locale,
    conditions,
    cursor,
  })
  const query = db
    .select({ id: resource.id })
    .from(resource)
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(2)
    .toSQL()
  return sqlite
    .prepare(query.sql)
    .all(...(query.params as string[]))
    .map(row => row.id)
}

describe('stable resource keyset SQL', () => {
  it.each([false, true])(
    'traverses nulls and duplicate sort values without omissions (localized=%s)',
    localized => {
      expect(page('asc', localized)).toEqual(['a', 'b'])
      expect(page('asc', localized, { id: 'b', value: 'same' })).toEqual(['c', 'd'])
      expect(page('desc', localized)).toEqual(['d', 'b'])
      expect(page('desc', localized, { id: 'b', value: 'same' })).toEqual(['c', 'a'])
    },
  )
  it('does not shift the next page when an earlier row is inserted', () => {
    expect(page('asc', false)).toEqual(['a', 'b'])
    sqlite.exec("INSERT INTO resource VALUES ('0','earlier')")
    expect(page('asc', false, { id: 'b', value: 'same' })).toEqual(['c', 'd'])
  })
})
