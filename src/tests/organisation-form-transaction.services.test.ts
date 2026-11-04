// @vitest-environment node
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
// TESTS
import { describe, expect, it, vi } from 'vitest'
// DB
import {
  organisation,
  organisationI18n,
  organisationRole,
} from '#lib/db/schema/index.js'
import {
  createOrganisation,
  updateOrganisationByIdWithConcurrency,
} from '#lib/db/services/organisation.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

type Patch = Parameters<typeof updateOrganisationByIdWithConcurrency>[1]
const patch: Patch = {
  id: 'o',
  updatedAt: 'before',
  data: { code: 'new', url: null, capabilities: {} },
  i18n: { en: { name: 'New' }, zhHans: { name: '新' }, zhHant: { name: '新' } },
  userRoles: Array.from({ length: 250 }, (_, index) => ({
    userId: `user-${index}`,
    organisationId: 'wrong',
    role: 'owner',
  })),
}

/** Creates schema-shaped relations and descendants to exercise the complete guarded batch. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  for (const table of [organisation, organisationI18n, organisationRole]) {
    sqlite.exec(
      `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')})`,
    )
  }
  sqlite.exec(`
    CREATE UNIQUE INDEX organisation_id ON organisation(id);
    CREATE UNIQUE INDEX role_key ON organisationRole(organisationId,userId);
    CREATE TABLE project(id TEXT PRIMARY KEY, organisationId TEXT, capabilities TEXT, modifiedAt TEXT);
    CREATE TABLE projectRole(projectId TEXT, userId TEXT, capabilities TEXT);
    INSERT INTO organisation(id,code,modifiedAt,capabilities) VALUES ('o','old','before','{}');
    INSERT INTO organisationI18n(organisationId,locale,name) VALUES ('o','en','Old'),('outside','en','Outside');
    INSERT INTO organisationRole(organisationId,userId,role) VALUES ('o','old','owner'),('outside','other','owner');
    INSERT INTO project VALUES ('p','o','{"manageBakeries":true}','before');
    INSERT INTO projectRole VALUES ('p','old','{"manageBakeries":true}');
  `)
  return { sqlite, db: db as unknown as Database }
}

/** Captures all columns, including write tokens and permission state. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return [
    'organisation',
    'organisationI18n',
    'organisationRole',
    'project',
    'projectRole',
  ].map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
}

describe('organisation form revision transaction', () => {
  it.each(['success', 'translation', 'role', 'collision'])(
    'creates the organisation and initial roles atomically: %s',
    async mode => {
      const { db, sqlite } = fixture()
      try {
        if (mode === 'translation')
          sqlite.exec(
            "CREATE TRIGGER fail_translation BEFORE INSERT ON organisationI18n BEGIN SELECT RAISE(ABORT,'injected failure'); END",
          )
        if (mode === 'role')
          sqlite.exec(
            "CREATE TRIGGER fail_role BEFORE INSERT ON organisationRole WHEN NEW.userId='user-249' BEGIN SELECT RAISE(ABORT,'injected failure'); END",
          )
        const before = snapshot(sqlite)
        const batch = vi.spyOn(db, 'batch')
        const saving = createOrganisation(
          db,
          { id: mode === 'collision' ? 'o' : 'new', code: 'new', settings: {} },
          {
            i18n: patch.i18n,
            userRoles: patch.userRoles,
          },
        )
        expect(batch).toHaveBeenCalledTimes(1)
        for (const statement of batch.mock.calls[0][0])
          expect(
            (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
              .length,
          ).toBeLessThanOrEqual(100)
        if (mode === 'success') {
          expect(await saving).toMatchObject({ id: 'new', isPublished: false })
          expect(
            sqlite
              .prepare(
                "SELECT count(*) n FROM organisationRole WHERE organisationId='new'",
              )
              .get(),
          ).toEqual({ n: 250 })
          expect(
            sqlite
              .prepare(
                "SELECT name FROM organisationI18n WHERE organisationId='new' AND locale='en'",
              )
              .get(),
          ).toEqual({ name: 'New' })
          expect(
            snapshot(sqlite).map((rows, index) => rows.slice(0, before[index].length)),
          ).toEqual(before)
        } else {
          await expect(saving).rejects.toThrow()
          expect(snapshot(sqlite)).toEqual(before)
        }
      } finally {
        sqlite.close()
      }
    },
  )

  it('commits core, translations, roles and descendant restrictions together', async () => {
    const { db, sqlite } = fixture()
    try {
      const batch = vi.spyOn(db, 'batch')
      expect(await updateOrganisationByIdWithConcurrency(db, patch)).toMatchObject({
        id: 'o',
      })
      expect(batch).toHaveBeenCalledTimes(1)
      for (const statement of batch.mock.calls[0][0])
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
      expect(
        sqlite
          .prepare("SELECT count(*) n FROM organisationRole WHERE organisationId='o'")
          .get(),
      ).toEqual({ n: 250 })
      expect(
        sqlite
          .prepare(
            "SELECT name FROM organisationI18n WHERE organisationId='o' AND locale='en'",
          )
          .get(),
      ).toEqual({ name: 'New' })
      expect(
        sqlite
          .prepare("SELECT role FROM organisationRole WHERE organisationId='outside'")
          .get(),
      ).toEqual({ role: 'owner' })
      expect(
        JSON.parse(
          sqlite.prepare('SELECT capabilities FROM projectRole').get()!
            .capabilities as string,
        ).manageBakeries,
      ).toBe(false)
    } finally {
      sqlite.close()
    }
  })

  it.each([
    'organisationI18n',
    'organisationRole',
    'project',
    'projectRole',
    'organisation',
  ])('rolls back every stage on %s failure', async table => {
    const { db, sqlite } = fixture()
    try {
      const operation =
        table === 'organisationI18n' || table === 'organisationRole'
          ? 'INSERT'
          : 'UPDATE'
      sqlite.exec(
        `CREATE TRIGGER fail_write BEFORE ${operation} ON ${table} ${table === 'organisationRole' ? "WHEN NEW.userId='user-249'" : ''} BEGIN SELECT RAISE(ABORT,'injected failure'); END`,
      )
      const before = snapshot(sqlite)
      await expect(updateOrganisationByIdWithConcurrency(db, patch)).rejects.toThrow(
        'injected failure',
      )
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })

  it('does not replace permissions or translations for a stale revision', async () => {
    const { db, sqlite } = fixture()
    try {
      const before = snapshot(sqlite)
      expect(
        await updateOrganisationByIdWithConcurrency(db, {
          ...patch,
          updatedAt: 'stale',
        }),
      ).toBeNull()
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })

  it('preserves omitted relations and clears explicit empty collections', async () => {
    const { db, sqlite } = fixture()
    try {
      const before = snapshot(sqlite)
      const updated = await updateOrganisationByIdWithConcurrency(db, {
        id: 'o',
        updatedAt: 'before',
        data: { code: 'new', url: null },
      })
      expect(snapshot(sqlite).slice(1)).toEqual(before.slice(1))
      await updateOrganisationByIdWithConcurrency(db, {
        ...patch,
        updatedAt: updated!.modifiedAt,
        i18n: {} as Patch['i18n'],
        userRoles: [],
      })
      expect(
        sqlite
          .prepare("SELECT count(*) n FROM organisationRole WHERE organisationId='o'")
          .get(),
      ).toEqual({ n: 0 })
      expect(
        sqlite
          .prepare("SELECT count(*) n FROM organisationI18n WHERE organisationId='o'")
          .get(),
      ).toEqual({ n: 0 })
    } finally {
      sqlite.close()
    }
  })
})
