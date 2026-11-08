// @vitest-environment node
// TESTS
import { describe, expect, it } from 'vitest'
// SERVICES
import { updateOrganisationPublishedStateById } from '#lib/db/services/organisation.js'
import { updateProjectPublishedStateById } from '#lib/db/services/project.js'
import { updateLayerPublishedStateById } from '#lib/db/services/layer.js'
import {
  createDefaultProjectLicense,
  appendProjectLicenseHistory,
} from '#lib/db/services/licence.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

/** Creates a hierarchy with saved local publication state and eligible image assignments. */
function fixture(published: boolean) {
  const { sqlite, db } = publicationSqlite({})
  const columns =
    'isPublished INTEGER, localIsPublished INTEGER, publishedAt TEXT, publisherId TEXT, modifiedAt TEXT'
  sqlite.exec(`
    CREATE TABLE organisation (id TEXT PRIMARY KEY, hubId TEXT, ${columns});
    CREATE TABLE project (id TEXT PRIMARY KEY, organisationId TEXT, flags TEXT, ${columns});
    CREATE TABLE layer (id TEXT PRIMARY KEY, organisationId TEXT, projectId TEXT, ${columns});
    CREATE TABLE feature (id TEXT PRIMARY KEY, organisationId TEXT, projectId TEXT, layerId TEXT, isArchived INTEGER DEFAULT 0, ${columns});
    CREATE TABLE image (id TEXT PRIMARY KEY, createdAt TEXT, isArchived INTEGER);
    CREATE TABLE task(id TEXT PRIMARY KEY, featureId TEXT, isReviewed INTEGER);
    CREATE TABLE taskImage(taskId TEXT, imageId TEXT);
    CREATE TABLE featureImage (featureId TEXT, imageId TEXT, intent TEXT, isPublished INTEGER, localIsPublished INTEGER, publishedAt TEXT, publisherId TEXT);
    INSERT INTO organisation(id,hubId) VALUES ('o','h'), ('other','h');
    INSERT INTO project(id,organisationId,flags) VALUES ('p','o','{}'), ('other-p','o','{}');
    INSERT INTO layer(id,organisationId,projectId) VALUES ('l','o','p');
    INSERT INTO feature(id,organisationId,projectId,layerId) VALUES ('f','o','p','l'), ('draft','o','p','l'), ('outside','other','other','other');
    INSERT INTO image VALUES ('i','2020',0);
    INSERT INTO featureImage VALUES ('f','i','general',0,NULL,NULL,NULL), ('draft','i','general',0,NULL,NULL,NULL);
  `)
  for (const table of ['organisation', 'project', 'layer', 'feature']) {
    sqlite.exec(
      `UPDATE ${table} SET isPublished=${published ? 1 : 0}, localIsPublished=${published ? 'NULL' : 1}`,
    )
  }
  sqlite.exec(`UPDATE feature SET isPublished=0, localIsPublished=0 WHERE id='draft'`)
  return { sqlite, db: db as unknown as Database }
}

/** Reads every mutated table to verify complete rollback, including timestamps and attribution. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return ['organisation', 'project', 'layer', 'feature', 'featureImage'].map(table =>
    sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(),
  )
}

const commands = [
  ['organisation', 'o', updateOrganisationPublishedStateById],
  ['project', 'p', updateProjectPublishedStateById],
  ['layer', 'l', updateLayerPublishedStateById],
] as const

for (const [kind, id, apply] of commands) {
  const expectedScope = { hubId: 'h', organisationId: 'o', projectId: 'p' }
  const command = (
    db: Database,
    params: Omit<
      Parameters<typeof updateLayerPublishedStateById>[1],
      'expectedScope'
    > & {
      expectedScope?: {
        hubId: string | null
        organisationId: string
        projectId: string
      }
    },
  ) => apply(db, { ...params, expectedScope: params.expectedScope ?? expectedScope })
  describe(`atomic ${kind} publication`, () => {
    it('restores saved publication state after repeated unpublish commands', async () => {
      const { sqlite, db } = fixture(true)
      try {
        await command(db, { id, state: false, publisherId: 'actor' })
        await command(db, { id, state: false, publisherId: 'actor' })
        expect(
          sqlite
            .prepare("SELECT isPublished,localIsPublished FROM feature WHERE id='f'")
            .get(),
        ).toEqual({ isPublished: 0, localIsPublished: 1 })
        await command(db, { id, state: true, publisherId: 'actor' })
        expect(
          sqlite.prepare("SELECT isPublished FROM feature WHERE id='f'").get(),
        ).toEqual({ isPublished: 1 })
        expect(
          sqlite.prepare("SELECT isPublished FROM feature WHERE id='draft'").get(),
        ).toEqual({ isPublished: 0 })
      } finally {
        sqlite.close()
      }
    })

    it.each([false, true])(
      'publishes with explicit draft inclusion %s',
      async publishChildren => {
        const { sqlite, db } = fixture(false)
        try {
          expect(
            await command(db, {
              id,
              state: true,
              publisherId: 'actor',
              publishChildren,
            }),
          ).toEqual({ id, isPublished: true })
          expect(
            sqlite
              .prepare("SELECT isPublished,localIsPublished FROM feature WHERE id='f'")
              .get(),
          ).toEqual({ isPublished: 1, localIsPublished: null })
          expect(
            sqlite.prepare("SELECT isPublished FROM feature WHERE id='draft'").get(),
          ).toEqual({ isPublished: Number(publishChildren) })
          expect(
            sqlite.prepare("SELECT isPublished FROM feature WHERE id='outside'").get(),
          ).toEqual({ isPublished: 0 })
          expect(
            sqlite
              .prepare(
                "SELECT intent,isPublished,publisherId FROM featureImage WHERE featureId='f'",
              )
              .get(),
          ).toEqual({
            intent: 'general',
            isPublished: 1,
            publisherId: 'actor',
          })
        } finally {
          sqlite.close()
        }
      },
    )

    it.each([false, true])(
      'rolls back parent and descendants on failure with state %s',
      async state => {
        const { sqlite, db } = fixture(!state)
        try {
          sqlite.exec(
            "CREATE TRIGGER reject_feature BEFORE UPDATE ON feature BEGIN SELECT RAISE(ABORT,'injected descendant failure'); END",
          )
          const before = snapshot(sqlite)
          await expect(
            command(db, { id, state, publisherId: 'actor' }),
          ).rejects.toThrow()
          expect(snapshot(sqlite)).toEqual(before)
        } finally {
          sqlite.close()
        }
      },
    )

    it.each([false, true])(
      'preserves all rows when the parent update is skipped with state %s',
      async state => {
        const { sqlite, db } = fixture(!state)
        try {
          sqlite.exec(
            `CREATE TRIGGER skip_parent BEFORE UPDATE ON "${kind}" BEGIN SELECT RAISE(IGNORE); END`,
          )
          const before = snapshot(sqlite)
          expect(await command(db, { id, state, publisherId: 'actor' })).toBeNull()
          expect(snapshot(sqlite)).toEqual(before)
        } finally {
          sqlite.close()
        }
      },
    )

    it.each([false, true])(
      'rejects a changed authorized parent scope with state %s',
      async state => {
        const { sqlite, db } = fixture(!state)
        try {
          if (kind === 'organisation')
            sqlite.exec("UPDATE organisation SET hubId='moved' WHERE id='o'")
          if (kind === 'project')
            sqlite.exec("UPDATE project SET organisationId='other' WHERE id='p'")
          if (kind === 'layer')
            sqlite.exec("UPDATE layer SET projectId='other-p' WHERE id='l'")
          const before = snapshot(sqlite)
          expect(await command(db, { id, state, publisherId: 'actor' })).toBeNull()
          expect(snapshot(sqlite)).toEqual(before)
        } finally {
          sqlite.close()
        }
      },
    )

    if (kind === 'layer') {
      it('rejects a project ancestry move within the same hub', async () => {
        const { sqlite, db } = fixture(false)
        try {
          sqlite.exec("UPDATE project SET organisationId='other' WHERE id='p'")
          const before = snapshot(sqlite)
          expect(
            await command(db, { id, state: true, publisherId: 'actor' }),
          ).toBeNull()
          expect(snapshot(sqlite)).toEqual(before)
        } finally {
          sqlite.close()
        }
      })
    }

    it('accepts an unchanged null hub scope', async () => {
      const { sqlite, db } = fixture(false)
      try {
        sqlite.exec("UPDATE organisation SET hubId=NULL WHERE id='o'")
        expect(
          await command(db, {
            id,
            state: true,
            publisherId: 'actor',
            expectedScope: { ...expectedScope, hubId: null },
          }),
        ).toEqual({ id, isPublished: true })
      } finally {
        sqlite.close()
      }
    })

    it('rejects a formerly null hub scope after assignment', async () => {
      const { sqlite, db } = fixture(false)
      try {
        const before = snapshot(sqlite)
        expect(
          await command(db, {
            id,
            state: true,
            publisherId: 'actor',
            expectedScope: { ...expectedScope, hubId: null },
          }),
        ).toBeNull()
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    })

    it('rejects an ancestor hub move after authorization', async () => {
      const { sqlite, db } = fixture(false)
      try {
        sqlite.exec("UPDATE organisation SET hubId='moved' WHERE id='o'")
        const before = snapshot(sqlite)
        expect(await command(db, { id, state: true, publisherId: 'actor' })).toBeNull()
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    })

    it('rolls back classification and all hierarchy writes when final image publication fails', async () => {
      const { sqlite, db } = fixture(false)
      try {
        sqlite.exec(
          "CREATE TRIGGER reject_image BEFORE UPDATE OF isPublished ON featureImage BEGIN SELECT RAISE(ABORT,'injected image failure'); END",
        )
        const before = snapshot(sqlite)
        await expect(
          command(db, {
            id,
            state: true,
            publisherId: 'actor',
            publishChildren: true,
          }),
        ).rejects.toThrow()
        expect(snapshot(sqlite)).toEqual(before)
      } finally {
        sqlite.close()
      }
    })
  })
}

it.each(['rights edit', 'history append'])(
  'does not overwrite a concurrent project license %s during publication',
  async scenario => {
    const { sqlite, db } = fixture(false)
    try {
      sqlite.exec('ALTER TABLE project ADD COLUMN license TEXT')
      const expectedLicense = createDefaultProjectLicense('original attribution')
      const license = appendProjectLicenseHistory(
        expectedLicense,
        '2026-01-01T00:00:00.000Z',
      )
      const currentLicense =
        scenario === 'rights edit'
          ? createDefaultProjectLicense('new attribution')
          : appendProjectLicenseHistory(expectedLicense, '2026-01-02T00:00:00.000Z')
      sqlite
        .prepare("UPDATE project SET license=? WHERE id='p'")
        .run(JSON.stringify(currentLicense))
      const before = snapshot(sqlite)
      expect(
        await updateProjectPublishedStateById(db, {
          id: 'p',
          state: true,
          publisherId: 'actor',
          expectedScope: { organisationId: 'o', hubId: 'h' },
          license,
          expectedLicense,
        }),
      ).toBeNull()
      expect(snapshot(sqlite)).toEqual(before)
    } finally {
      sqlite.close()
    }
  },
)

it.each([false, true])(
  'publishes history against an unchanged license with formatted JSON %s',
  async formatted => {
    const { sqlite, db } = fixture(false)
    try {
      sqlite.exec('ALTER TABLE project ADD COLUMN license TEXT')
      const expectedLicense = createDefaultProjectLicense('owner')
      const license = appendProjectLicenseHistory(
        expectedLicense,
        '2026-01-01T00:00:00.000Z',
      )
      sqlite
        .prepare("UPDATE project SET license=? WHERE id='p'")
        .run(JSON.stringify(expectedLicense, null, formatted ? 2 : undefined))
      expect(
        await updateProjectPublishedStateById(db, {
          id: 'p',
          state: true,
          publisherId: 'actor',
          expectedScope: { organisationId: 'o', hubId: 'h' },
          license,
          expectedLicense,
        }),
      ).toEqual({ id: 'p', isPublished: true })
      const stored = sqlite.prepare("SELECT license FROM project WHERE id='p'").get()
      expect(JSON.parse(stored?.license as string)).toEqual(license)
    } finally {
      sqlite.close()
    }
  },
)
