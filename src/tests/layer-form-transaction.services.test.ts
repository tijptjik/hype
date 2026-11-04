// @vitest-environment node
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
// TESTS
import { describe, expect, it, vi } from 'vitest'
// DB
import { layer, layerI18n, layerProperty } from '#lib/db/schema/index.js'
import { createLayer, updateLayerByIdWithConcurrency } from '#lib/db/services/layer.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

type Update = Parameters<typeof updateLayerByIdWithConcurrency>[1]
const patch: Update = {
  id: 'l',
  updatedAt: 'before',
  data: {
    organisationId: 'o',
    projectId: 'p',
    metadata: {},
    isDefaultVisible: false,
  },
  i18n: {
    en: { name: 'New', nameShort: 'N' },
    zhHans: { name: '新', nameShort: '新' },
    zhHant: { name: '新', nameShort: '新' },
  },
  properties: Array.from({ length: 250 }, (_, i) => ({
    propertyId: `p-${i}`,
    isVisible: i !== 0,
  })),
}

/** Builds real schema-shaped relation tables and seeds both target and unrelated rows. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  for (const table of [layer, layerI18n, layerProperty]) {
    const columns = Object.values(getTableColumns(table)).map(
      column => `"${column.name}" ${column.getSQLType()}`,
    )
    sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(',')})`)
  }
  sqlite.exec(`CREATE UNIQUE INDEX translation_key ON layerI18n(layerId,locale);
    CREATE UNIQUE INDEX property_key ON layerProperty(layerId,propertyId);
    INSERT INTO layer(id,organisationId,projectId,metadata,modifiedAt) VALUES ('l','o','p','{}','before');
    INSERT INTO layerI18n(layerId,locale,name,nameShort) VALUES ('l','en','Old','O'),('outside','en','Outside','X');
    INSERT INTO layerProperty VALUES ('l','old',1,1),('outside','external',1,1);`)
  return { sqlite, db: db as unknown as Database }
}

/** Includes all fields to prove rollback of core versions, translations, and links. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return ['layer', 'layerI18n', 'layerProperty'].map(table =>
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  )
}

describe('atomic layer form updates', () => {
  it.each([false, true])(
    'creates complete layers atomically with late failure %s',
    async fail => {
      const { sqlite, db } = fixture()
      try {
        if (fail)
          sqlite.exec(
            "CREATE TRIGGER fail_create BEFORE INSERT ON layerProperty WHEN NEW.propertyId='p-249' BEGIN SELECT RAISE(ABORT,'injected create failure'); END",
          )
        const before = snapshot(sqlite)
        const saving = createLayer(
          db,
          { ...patch.data, metadata: {}, isDefaultVisible: false, id: 'new' },
          { i18n: patch.i18n!, properties: patch.properties! },
        )
        if (fail) {
          await expect(saving).rejects.toThrow('injected create failure')
          expect(snapshot(sqlite)).toEqual(before)
        } else {
          expect(await saving).toMatchObject({ id: 'new', isPublished: false })
          expect(
            sqlite
              .prepare("SELECT count(*) AS n FROM layerProperty WHERE layerId='new'")
              .get(),
          ).toEqual({ n: 250 })
          expect(
            sqlite
              .prepare("SELECT name FROM layerI18n WHERE layerId='new' AND locale='en'")
              .get(),
          ).toEqual({ name: 'New' })
        }
      } finally {
        sqlite.close()
      }
    },
  )

  it('saves core, normalized translations and parameter-budgeted property links together', async () => {
    const { sqlite, db } = fixture()
    try {
      const batch = vi.spyOn(db, 'batch')
      expect(await updateLayerByIdWithConcurrency(db, patch)).toMatchObject({
        id: 'l',
      })
      expect(
        sqlite
          .prepare(
            "SELECT name,nameGen FROM layerI18n WHERE layerId='l' AND locale='en'",
          )
          .get(),
      ).toEqual({ name: 'New', nameGen: 1 })
      expect(
        sqlite
          .prepare("SELECT count(*) AS n FROM layerProperty WHERE layerId='l'")
          .get(),
      ).toEqual({ n: 250 })
      expect(
        sqlite
          .prepare(
            "SELECT isVisible,isUserContributable FROM layerProperty WHERE propertyId='p-0'",
          )
          .get(),
      ).toEqual({ isVisible: 0, isUserContributable: 1 })
      expect(
        sqlite.prepare("SELECT name FROM layerI18n WHERE layerId='outside'").get(),
      ).toEqual({ name: 'Outside' })
      expect(batch).toHaveBeenCalledTimes(1)
      for (const statement of batch.mock.calls[0][0]) {
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
      }
    } finally {
      sqlite.close()
    }
  })

  it.each(['layer', 'layerI18n', 'layerProperty'])(
    'rolls back everything on a %s failure',
    async table => {
      const { sqlite, db } = fixture()
      try {
        sqlite.exec(`CREATE TRIGGER fail_save BEFORE ${table === 'layer' ? 'UPDATE' : 'INSERT'} ON ${table}
        ${table === 'layerProperty' ? "WHEN NEW.propertyId='p-249'" : ''}
        BEGIN SELECT RAISE(ABORT,'injected form failure'); END`)
        const before = snapshot(sqlite)
        await expect(updateLayerByIdWithConcurrency(db, patch)).rejects.toThrow(
          'injected form failure',
        )
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it.each(['timestamp', 'missing'])(
    'does not mutate relations when the %s guard fails',
    async reason => {
      const { sqlite, db } = fixture()
      try {
        if (reason === 'timestamp')
          sqlite.exec("UPDATE layer SET modifiedAt='concurrent'")
        const before = snapshot(sqlite)
        expect(
          await updateLayerByIdWithConcurrency(db, {
            ...patch,
            ...(reason === 'missing' ? { id: 'missing' } : {}),
          }),
        ).toBeNull()
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it('clears explicit empty relations but preserves omitted ones', async () => {
    const { sqlite, db } = fixture()
    try {
      await updateLayerByIdWithConcurrency(db, {
        ...patch,
        i18n: undefined,
        properties: [],
      })
      expect(
        sqlite.prepare("SELECT name FROM layerI18n WHERE layerId='l'").get(),
      ).toEqual({ name: 'Old' })
      expect(
        sqlite
          .prepare("SELECT count(*) AS n FROM layerProperty WHERE layerId='l'")
          .get(),
      ).toEqual({ n: 0 })
    } finally {
      sqlite.close()
    }
  })
})
