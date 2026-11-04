// @vitest-environment node
import { getTableColumns, getTableName } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '#lib/db/schema/index.js'
import { createBaseProperty } from '#lib/db/services/property.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

const tables = [property, propertyI18n, propertyValue, propertyValueI18n]

describe('atomic property creation', () => {
  it.each([false, true])(
    'commits all relations or rolls back on late failure %s',
    async fail => {
      const { db, sqlite } = publicationSqlite({})
      try {
        for (const table of tables) {
          sqlite.exec(
            `CREATE TABLE "${getTableName(table)}" (${Object.values(
              getTableColumns(table),
            )
              .map(column => `"${column.name}" ${column.getSQLType()}`)
              .join(',')})`,
          )
        }
        sqlite.exec(
          'CREATE UNIQUE INDEX property_id ON property(id); CREATE UNIQUE INDEX value_id ON propertyValue(id)',
        )
        if (fail)
          sqlite.exec(
            "CREATE TRIGGER fail_translation BEFORE INSERT ON propertyValueI18n WHEN NEW.value='Value 249' BEGIN SELECT RAISE(ABORT,'late translation failure'); END",
          )
        const batch = vi.spyOn(db, 'batch')
        const saving = createBaseProperty(
          db as unknown as Database,
          {
            id: 'new',
            key: 'key',
            projectId: 'project',
            component: 'select',
          },
          {
            i18n: { en: { label: 'Label' } },
            values: Array.from({ length: 250 }, (_, index) => ({
              propertyId: 'untrusted',
              value: `value-${index}`,
              i18n: { en: { value: `Value ${index}` } },
            })),
          },
        )
        expect(batch).toHaveBeenCalledTimes(1)
        for (const statement of batch.mock.calls[0][0]) {
          expect(
            (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
              .length,
          ).toBeLessThanOrEqual(100)
        }
        if (fail) {
          await expect(saving).rejects.toThrow('late translation failure')
          for (const table of tables)
            expect(
              sqlite
                .prepare(`SELECT count(*) AS n FROM "${getTableName(table)}"`)
                .get(),
            ).toEqual({ n: 0 })
        } else {
          expect(await saving).toMatchObject({ id: 'new', key: 'key' })
          expect(
            sqlite
              .prepare(
                'SELECT count(*) AS n FROM propertyValue v JOIN propertyValueI18n t ON t.propertyValueId=v.id WHERE v.propertyId=?',
              )
              .get('new'),
          ).toEqual({ n: 250 })
          expect(
            sqlite
              .prepare('SELECT label FROM propertyI18n WHERE propertyId=?')
              .get('new'),
          ).toEqual({ label: 'Label' })
        }
      } finally {
        sqlite.close()
      }
    },
  )
})
