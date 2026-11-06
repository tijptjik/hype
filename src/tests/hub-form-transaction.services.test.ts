// @vitest-environment node
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
// TESTS
import { describe, expect, it, vi } from 'vitest'
// DB
import { hub, hubI18n, hubRole, hubLayer, organisation } from '#lib/db/schema/index.js'
import { createHub, updateHubByIdWithConcurrency } from '#lib/db/services/hub.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

type Patch = Parameters<typeof updateHubByIdWithConcurrency>[1]
const patch: Patch = {
  id: 'h',
  updatedAt: 'before',
  data: {
    code: 'new',
    domain: null,
    legalContactAddress: null,
    subscriptionService: 'substack',
    subscriptionId: null,
    subscriptionSessionCookie: null,
    subscriptionPlacement: { hubPanel: false, topBar: false, menu: true },
  },
  i18n: { en: { name: 'New' }, zhHans: { name: '新' }, zhHant: { name: '新' } },
  userRoles: Array.from({ length: 250 }, (_, index) => ({
    userId: `u-${index}`,
    role: 'admin',
  })),
  organisations: [
    { organisationId: 'next', isCoreInclusive: false, isHubExclusive: true },
  ],
  layerDefaults: [{ layerId: 'new-layer', isDefaultVisible: false }],
}
const tables = [hub, hubI18n, hubRole, hubLayer, organisation]

/** Creates real schema-shaped rows for parent, owned relations, and reassigned organisations. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  for (const table of tables)
    sqlite.exec(
      `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')})`,
    )
  sqlite.exec(`
    CREATE UNIQUE INDEX hub_id ON hub(id);
    CREATE UNIQUE INDEX role_id ON hubRole(hubId,userId);
    CREATE UNIQUE INDEX layer_id ON hubLayer(hubId,layerId);
    INSERT INTO hub(id,code,modifiedAt) VALUES ('h','old','before');
    INSERT INTO hubI18n(hubId,locale,name) VALUES ('h','en','Old'),('outside','en','Outside');
    INSERT INTO hubRole(hubId,userId,role) VALUES ('h','old','admin'),('outside','other','admin');
    INSERT INTO hubLayer(hubId,layerId,isDefaultVisible) VALUES ('h','old-layer',1),('outside','other-layer',1);
    INSERT INTO organisation(id,hubId,isCoreInclusive,isHubExclusive,modifiedAt) VALUES ('old','h',0,1,'before'),('next','other',1,0,'before'),('outside','other',1,0,'before');
  `)
  return { sqlite, db: db as unknown as Database }
}

/** Captures all persisted fields to detect partial relation, scope, or timestamp changes. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return tables.map(table =>
    sqlite.prepare(`SELECT * FROM "${getTableName(table)}" ORDER BY rowid`).all(),
  )
}

describe('hub form transactions', () => {
  it('commits core and all submitted collections in one parameter-safe batch', async () => {
    const { db, sqlite } = fixture()
    try {
      const batch = vi.spyOn(db, 'batch')
      expect(await updateHubByIdWithConcurrency(db, patch)).toMatchObject({ id: 'h' })
      expect(batch).toHaveBeenCalledTimes(1)
      for (const statement of batch.mock.calls[0][0])
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
      expect(
        sqlite.prepare("SELECT count(*) n FROM hubRole WHERE hubId='h'").get(),
      ).toEqual({ n: 250 })
      expect(
        sqlite
          .prepare("SELECT name FROM hubI18n WHERE hubId='h' AND locale='en'")
          .get(),
      ).toEqual({ name: 'New' })
      expect(
        sqlite
          .prepare("SELECT layerId,isDefaultVisible FROM hubLayer WHERE hubId='h'")
          .get(),
      ).toEqual({ layerId: 'new-layer', isDefaultVisible: 0 })
      expect(
        sqlite.prepare('SELECT id,hubId FROM organisation ORDER BY id').all(),
      ).toEqual([
        { id: 'next', hubId: 'h' },
        { id: 'old', hubId: null },
        { id: 'outside', hubId: 'other' },
      ])
    } finally {
      sqlite.close()
    }
  })

  it('saves many content languages atomically without exceeding D1 parameters', async () => {
    const { db, sqlite } = fixture()
    try {
      const batch = vi.spyOn(db, 'batch')
      const tags = [
        'en',
        'ja',
        'ko',
        'fr',
        'de',
        'es',
        'it',
        'nl',
        'pt-BR',
        'ar',
        'hi',
        'zhHant',
      ]
      const i18n = Object.fromEntries(
        tags.map(locale => [
          locale,
          {
            name: `Hub ${locale}`,
            nameShort: locale,
            privacyPolicy: `Privacy ${locale}`,
            termsOfService: `Terms ${locale}`,
          },
        ]),
      )
      await updateHubByIdWithConcurrency(db, { ...patch, i18n })
      expect(
        sqlite.prepare("SELECT count(*) n FROM hubI18n WHERE hubId='h'").get(),
      ).toEqual({ n: tags.length })
      expect(
        sqlite
          .prepare(
            "SELECT privacyPolicy FROM hubI18n WHERE hubId='h' AND locale='pt-BR'",
          )
          .get(),
      ).toEqual({ privacyPolicy: 'Privacy pt-BR' })
      for (const statement of batch.mock.calls[0][0])
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
    } finally {
      sqlite.close()
    }
  })

  it.each(['hubI18n', 'hubRole', 'organisation', 'hubLayer', 'hub'])(
    'rolls everything back on %s failure',
    async table => {
      const { db, sqlite } = fixture()
      try {
        const operation =
          table === 'hub' || table === 'organisation' ? 'UPDATE' : 'INSERT'
        const predicate =
          table === 'hubRole'
            ? "WHEN NEW.userId='u-249'"
            : table === 'organisation'
              ? "WHEN NEW.id='next'"
              : ''
        sqlite.exec(
          `CREATE TRIGGER fail_write BEFORE ${operation} ON ${table} ${predicate} BEGIN SELECT RAISE(ABORT,'injected failure'); END`,
        )
        const before = snapshot(sqlite)
        await expect(updateHubByIdWithConcurrency(db, patch)).rejects.toThrow(
          'injected failure',
        )
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it('leaves stale submissions untouched even when an assigned organisation disappeared', async () => {
    const { db, sqlite } = fixture()
    try {
      sqlite.exec("DELETE FROM organisation WHERE id='next'")
      const before = snapshot(sqlite)
      expect(
        await updateHubByIdWithConcurrency(db, { ...patch, updatedAt: 'stale' }),
      ).toBeNull()
      expect(snapshot(sqlite)).toEqual(before)
      await expect(updateHubByIdWithConcurrency(db, patch)).rejects.toThrow()
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })

  it('preserves omitted collections and clears explicit empty collections', async () => {
    const { db, sqlite } = fixture()
    try {
      const before = snapshot(sqlite)
      const updated = await updateHubByIdWithConcurrency(db, {
        id: 'h',
        updatedAt: 'before',
        data: patch.data,
      })
      expect(snapshot(sqlite).slice(1)).toEqual(before.slice(1))
      await updateHubByIdWithConcurrency(db, {
        ...patch,
        updatedAt: updated!.modifiedAt,
        i18n: {} as Patch['i18n'],
        userRoles: [],
        organisations: [],
        layerDefaults: [],
      })
      for (const table of ['hubI18n', 'hubRole', 'hubLayer'])
        expect(
          sqlite.prepare(`SELECT count(*) n FROM ${table} WHERE hubId='h'`).get(),
        ).toEqual({ n: 0 })
      expect(
        sqlite.prepare("SELECT hubId FROM organisation WHERE id='old'").get(),
      ).toEqual({ hubId: null })
    } finally {
      sqlite.close()
    }
  })

  it.each(['success', 'late-failure', 'collision'])(
    'creates a hub atomically: %s',
    async mode => {
      const { db, sqlite } = fixture()
      try {
        if (mode === 'late-failure')
          sqlite.exec(
            "CREATE TRIGGER fail_default BEFORE INSERT ON hubLayer BEGIN SELECT RAISE(ABORT,'injected failure'); END",
          )
        const before = snapshot(sqlite)
        const saving = createHub(
          db,
          { ...patch.data, id: mode === 'collision' ? 'h' : 'new' },
          patch,
        )
        if (mode === 'success') {
          expect(await saving).toMatchObject({ id: 'new' })
          expect(
            sqlite.prepare("SELECT count(*) n FROM hubRole WHERE hubId='new'").get(),
          ).toEqual({ n: 250 })
          expect(
            sqlite.prepare("SELECT hubId FROM organisation WHERE id='next'").get(),
          ).toEqual({ hubId: 'new' })
          expect(
            sqlite.prepare("SELECT name FROM hubI18n WHERE hubId='h'").get(),
          ).toEqual({ name: 'Old' })
        } else {
          await expect(saving).rejects.toThrow()
          expect(snapshot(sqlite)).toEqual(before)
        }
      } finally {
        sqlite.close()
      }
    },
  )
})
