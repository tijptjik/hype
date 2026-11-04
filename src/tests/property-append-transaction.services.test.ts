// @vitest-environment node
// TESTS
import { describe, expect, it, vi } from 'vitest'
// SERVICES
import { createPropertyValues } from '#lib/db/services/property.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

describe('atomic property value appends', () => {
  it.each(['success', 'value', 'translation', 'collision'])(
    'preserves existing rows and handles %s atomically',
    async mode => {
      const { db, sqlite } = publicationSqlite({})
      try {
        sqlite.exec(`
          PRAGMA foreign_keys=ON;
          CREATE TABLE property(id TEXT PRIMARY KEY);
          CREATE TABLE propertyValue(id TEXT PRIMARY KEY, propertyId TEXT NOT NULL REFERENCES property(id), rank INTEGER NOT NULL, value TEXT);
          CREATE TABLE propertyValueI18n(propertyValueId TEXT NOT NULL REFERENCES propertyValue(id),locale TEXT NOT NULL,value TEXT NOT NULL,valueGen INTEGER NOT NULL,PRIMARY KEY(propertyValueId,locale));
          INSERT INTO property VALUES ('target'),('outside');
          INSERT INTO propertyValue VALUES ('old','target',7,'existing'),('foreign','outside',8,'outside');
          INSERT INTO propertyValueI18n VALUES ('old','en','Existing',0),('foreign','en','Outside',0);
        `)
        if (mode === 'value')
          sqlite.exec(
            "CREATE TRIGGER fail_value BEFORE INSERT ON propertyValue WHEN NEW.value='value-249' BEGIN SELECT RAISE(ABORT,'late failure'); END",
          )
        if (mode === 'translation')
          sqlite.exec(
            "CREATE TRIGGER fail_translation BEFORE INSERT ON propertyValueI18n WHEN NEW.value='Label 249' BEGIN SELECT RAISE(ABORT,'late failure'); END",
          )
        const snapshot = () =>
          ['propertyValue', 'propertyValueI18n'].map(table =>
            sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
          )
        const before = snapshot()
        const batch = vi.spyOn(db, 'batch')
        const saving = createPropertyValues(
          db as unknown as Database,
          Array.from({ length: 250 }, (_, index) => ({
            ...(mode === 'collision' && index === 249 ? { id: 'foreign' } : {}),
            propertyId: 'outside',
            value: `value-${index}`,
            i18n: { en: { value: `Label ${index}`, valueGen: false } },
          })),
          'target',
        )
        expect(batch).toHaveBeenCalledTimes(1)
        for (const statement of batch.mock.calls[0][0]) {
          expect(
            (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
              .length,
          ).toBeLessThanOrEqual(100)
        }
        if (mode === 'success') {
          const created = await saving
          expect(created).toHaveLength(250)
          expect(created.every(row => row.propertyId === 'target')).toBe(true)
          for (const [index, row] of created.entries()) {
            expect(
              sqlite
                .prepare('SELECT value FROM propertyValueI18n WHERE propertyValueId=?')
                .get(row.id),
            ).toEqual({ value: `Label ${index}` })
          }
          expect(snapshot().map(rows => rows.slice(0, 2))).toEqual(before)
        } else {
          await expect(saving).rejects.toThrow()
          expect(snapshot()).toEqual(before)
        }
      } finally {
        sqlite.close()
      }
    },
  )
})
