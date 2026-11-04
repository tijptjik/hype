// @vitest-environment node
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
// TESTS
import { describe, expect, it, vi } from 'vitest'
// DB
import {
  project,
  projectI18n,
  projectRole,
  organisationRole,
  layer,
  feature,
  task,
  organisation,
  hub,
  mapStyles,
  projectMapStyles,
} from '#lib/db/schema/index.js'
import {
  createProject,
  updateProjectByIdWithConcurrency,
} from '#lib/db/services/project.js'
import { isProjectMapStyleUnavailable } from '#lib/db/services/map.js'
import { createDefaultProjectLicense } from '#lib/db/services/licence.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

type Patch = Parameters<typeof updateProjectByIdWithConcurrency>[1]
const patch: Patch = {
  id: 'p',
  updatedAt: 'before',
  data: {
    organisationId: 'new',
    code: 'new',
    capabilities: {
      manageBakeries: false,
      manageVolunteers: false,
      manageDropOffs: false,
    },
    flags: {},
    cardStyleCode: null,
    markerStyleCode: null,
    useAllInOrgContext: false,
  },
  i18n: { en: { name: 'New' }, zhHans: { name: '新' }, zhHant: { name: '新' } },
  userRoles: Array.from({ length: 250 }, (_, index) => ({
    projectId: 'untrusted',
    userId: `u-${index}`,
    role: 'owner',
  })),
}
const tables = [
  project,
  projectI18n,
  projectRole,
  organisationRole,
  layer,
  feature,
  task,
  organisation,
  hub,
  mapStyles,
  projectMapStyles,
]

/** Builds schema-shaped relations, existing privileges, and descendants for a project move. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  for (const table of tables)
    sqlite.exec(
      `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
        .map(
          column =>
            `"${column.name}" ${column.getSQLType()}${table === projectMapStyles ? ' NOT NULL' : ''}`,
        )
        .join(',')})`,
    )
  sqlite.exec(`
    CREATE UNIQUE INDEX assignment_id ON projectMapStyles(projectId);
    CREATE UNIQUE INDEX project_id ON project(id);
    CREATE UNIQUE INDEX project_role_key ON projectRole(projectId,userId);
    CREATE UNIQUE INDEX organisation_role_key ON organisationRole(organisationId,userId);
    INSERT INTO project(id,organisationId,code,modifiedAt,locationPolicyRevision) VALUES ('p','old','old','before',0);
    INSERT INTO projectI18n(projectId,locale,name) VALUES ('p','en','Old'),('outside','en','Outside');
    INSERT INTO projectRole(projectId,userId,role) VALUES ('p','old','owner'),('outside','outside','owner');
    INSERT INTO organisationRole VALUES ('new','u-0','owner'),('outside','outside','owner');
    INSERT INTO layer(id,projectId,organisationId) VALUES ('l','p','old');
    INSERT INTO feature(id,projectId,organisationId) VALUES ('f','p','old');
    INSERT INTO task(id,projectId,organisationId) VALUES ('t','p','old');
    INSERT INTO organisation(id,hubId) VALUES ('old','hub'),('new','hub');
    INSERT INTO mapStyles(id,code,organisationId,hubId) VALUES ('global','global',NULL,NULL),('restricted','noclit26',NULL,NULL),('scoped','scoped','new','hub');
    INSERT INTO projectMapStyles VALUES ('p','global','before','before');
  `)
  return { sqlite, db: db as unknown as Database }
}

/** Captures role, membership, translation, ancestry and write-token fields. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return tables.map(table =>
    sqlite.prepare(`SELECT * FROM "${getTableName(table)}" ORDER BY rowid`).all(),
  )
}

describe('project relation form transactions', () => {
  it('rolls back all form writes when the style is unavailable', async () => {
    const { db, sqlite } = fixture()
    try {
      const before = snapshot(sqlite)
      const failure = await updateProjectByIdWithConcurrency(db, {
        ...patch,
        mapStyleCode: 'missing',
      }).catch(cause => cause)
      expect(isProjectMapStyleUnavailable(failure)).toBe(true)
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  })

  it('uses the prospective project code for restricted styles during rename and creation', async () => {
    const { db, sqlite } = fixture()
    try {
      const renamed = await updateProjectByIdWithConcurrency(db, {
        ...patch,
        data: { ...patch.data, code: 'eln' },
        mapStyleCode: 'noclit26',
      })
      expect(renamed).toMatchObject({ id: 'p' })
      expect(
        sqlite
          .prepare("SELECT mapStyleId FROM projectMapStyles WHERE projectId='p'")
          .get(),
      ).toEqual({ mapStyleId: 'restricted' })
      await createProject(
        db,
        {
          ...patch.data,
          code: 'eln',
          id: 'new-project',
          settings: {},
          license: createDefaultProjectLicense(),
        },
        { mapStyleCode: 'noclit26' },
      )
      expect(
        sqlite
          .prepare(
            "SELECT mapStyleId FROM projectMapStyles WHERE projectId='new-project'",
          )
          .get(),
      ).toEqual({ mapStyleId: 'restricted' })
    } finally {
      sqlite.close()
    }
  })

  it('rejects a scoped style if the destination hub changes before execution', async () => {
    const { db, sqlite } = fixture()
    try {
      const original = db.batch.bind(db)
      let before: ReturnType<typeof snapshot>
      vi.spyOn(db, 'batch').mockImplementation(async statements => {
        sqlite.exec("UPDATE organisation SET hubId='changed' WHERE id='new'")
        before = snapshot(sqlite)
        return original(statements)
      })
      await expect(
        updateProjectByIdWithConcurrency(db, { ...patch, mapStyleCode: 'scoped' }),
      ).rejects.toThrow()
      expect(snapshot(sqlite)).toEqual(before!)
    } finally {
      sqlite.close()
    }
  })

  it('rolls back project creation on an unavailable style and distinguishes clear from omission', async () => {
    const { db, sqlite } = fixture()
    try {
      const before = snapshot(sqlite)
      await expect(
        createProject(
          db,
          {
            ...patch.data,
            id: 'new-project',
            settings: {},
            license: createDefaultProjectLicense(),
          },
          { ...patch, mapStyleCode: 'missing' },
        ),
      ).rejects.toThrow()
      expect(snapshot(sqlite)).toEqual(before)
      const saved = await updateProjectByIdWithConcurrency(db, patch)
      expect(
        sqlite
          .prepare("SELECT mapStyleId FROM projectMapStyles WHERE projectId='p'")
          .get(),
      ).toEqual({ mapStyleId: 'global' })
      await updateProjectByIdWithConcurrency(db, {
        ...patch,
        updatedAt: saved!.modifiedAt,
        mapStyleCode: null,
      })
      expect(sqlite.prepare('SELECT count(*) n FROM projectMapStyles').get()).toEqual({
        n: 0,
      })
      expect(isProjectMapStyleUnavailable(new Error('other constraint failure'))).toBe(
        false,
      )
    } finally {
      sqlite.close()
    }
  })

  it('saves translations, roles, memberships and ancestry atomically without downgrading privileges', async () => {
    const { db, sqlite } = fixture()
    try {
      const batch = vi.spyOn(db, 'batch')
      expect(
        await updateProjectByIdWithConcurrency(db, {
          ...patch,
          mapStyleCode: 'scoped',
        }),
      ).toMatchObject({
        id: 'p',
      })
      expect(batch).toHaveBeenCalledTimes(1)
      for (const statement of batch.mock.calls[0][0])
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
      expect(
        sqlite.prepare("SELECT count(*) n FROM projectRole WHERE projectId='p'").get(),
      ).toEqual({ n: 250 })
      expect(
        sqlite
          .prepare("SELECT count(*) n FROM organisationRole WHERE organisationId='new'")
          .get(),
      ).toEqual({ n: 250 })
      expect(
        sqlite
          .prepare(
            "SELECT role FROM organisationRole WHERE organisationId='new' AND userId='u-0'",
          )
          .get(),
      ).toEqual({ role: 'owner' })
      expect(
        sqlite
          .prepare(
            "SELECT role FROM organisationRole WHERE organisationId='new' AND userId='u-249'",
          )
          .get(),
      ).toEqual({ role: 'member' })
      expect(
        sqlite
          .prepare("SELECT name FROM projectI18n WHERE projectId='p' AND locale='en'")
          .get(),
      ).toEqual({ name: 'New' })
      for (const table of ['layer', 'feature', 'task'])
        expect(sqlite.prepare(`SELECT organisationId FROM ${table}`).get()).toEqual({
          organisationId: 'new',
        })
    } finally {
      sqlite.close()
    }
  })

  it.each(['projectI18n', 'organisationRole', 'projectRole', 'layer', 'project'])(
    'rolls back all changes on %s failure',
    async table => {
      const { db, sqlite } = fixture()
      try {
        const operation = table === 'layer' || table === 'project' ? 'UPDATE' : 'INSERT'
        const predicate = table === 'projectRole' ? "WHEN NEW.userId='u-249'" : ''
        sqlite.exec(
          `CREATE TRIGGER fail_write BEFORE ${operation} ON ${table} ${predicate} BEGIN SELECT RAISE(ABORT,'injected failure'); END`,
        )
        const before = snapshot(sqlite)
        await expect(updateProjectByIdWithConcurrency(db, patch)).rejects.toThrow(
          'injected failure',
        )
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it('fences a revision change between the preflight read and the transaction', async () => {
    const { db, sqlite } = fixture()
    try {
      const original = db.batch.bind(db)
      let before: ReturnType<typeof snapshot>
      vi.spyOn(db, 'batch').mockImplementation(async statements => {
        sqlite.exec("UPDATE project SET modifiedAt='concurrent' WHERE id='p'")
        before = snapshot(sqlite)
        return original(statements)
      })
      expect(
        await updateProjectByIdWithConcurrency(db, {
          ...patch,
          mapStyleCode: 'missing',
        }),
      ).toBeNull()
      expect(snapshot(sqlite)).toEqual(before!)
    } finally {
      sqlite.close()
    }
  })

  it('preserves omitted relations and clears explicit empty collections without revoking organisation roles', async () => {
    const { db, sqlite } = fixture()
    try {
      const before = snapshot(sqlite)
      const updated = await updateProjectByIdWithConcurrency(db, {
        id: 'p',
        updatedAt: 'before',
        data: { ...patch.data, organisationId: 'old' },
      })
      expect(snapshot(sqlite).slice(1)).toEqual(before.slice(1))
      await updateProjectByIdWithConcurrency(db, {
        ...patch,
        data: { ...patch.data, organisationId: 'old' },
        updatedAt: updated!.modifiedAt,
        i18n: {} as Patch['i18n'],
        userRoles: [],
      })
      expect(
        sqlite.prepare("SELECT count(*) n FROM projectRole WHERE projectId='p'").get(),
      ).toEqual({ n: 0 })
      expect(snapshot(sqlite)[3]).toEqual(before[3])
    } finally {
      sqlite.close()
    }
  })

  it.each(['success', 'late-failure', 'collision'])(
    'creates project relations atomically: %s',
    async mode => {
      const { db, sqlite } = fixture()
      try {
        if (mode === 'late-failure')
          sqlite.exec(
            "CREATE TRIGGER fail_role BEFORE INSERT ON projectRole WHEN NEW.userId='u-249' BEGIN SELECT RAISE(ABORT,'injected failure'); END",
          )
        const before = snapshot(sqlite)
        const saving = createProject(
          db,
          {
            ...patch.data,
            id: mode === 'collision' ? 'p' : 'new',
            settings: {},
            license: createDefaultProjectLicense(),
          },
          patch,
        )
        if (mode === 'success') {
          expect(await saving).toMatchObject({ id: 'new', isPublished: false })
          expect(
            sqlite
              .prepare("SELECT count(*) n FROM projectRole WHERE projectId='new'")
              .get(),
          ).toEqual({ n: 250 })
          expect(
            sqlite
              .prepare(
                "SELECT role FROM organisationRole WHERE organisationId='new' AND userId='u-0'",
              )
              .get(),
          ).toEqual({ role: 'owner' })
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
