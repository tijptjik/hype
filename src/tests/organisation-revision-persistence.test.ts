// @vitest-environment node
import { readFileSync } from 'node:fs'
// DRIZZLE
import { eq, getTableColumns, getTableName, sql } from 'drizzle-orm'
// TESTS
import { describe, expect, it, vi } from 'vitest'
// DB
import {
  user,
  organisation,
  organisationI18n,
  organisationRole,
  organisationProperty,
  revisionChangeSet,
} from '#lib/db/schema/index.js'
import {
  createOrganisation,
  updateOrganisationByIdWithConcurrency,
} from '#lib/db/services/organisation.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import { createOrganisationUserTables } from './fixtures/organisationUserTables.js'
import { syncOrganisations } from '#lib/db/services/hub.js'
import {
  createUploadedResourceImage,
  getResourceUploadSnapshot,
} from '#lib/db/services/resourceImageUpload.js'
import { image } from '#lib/db/schema/image.js'
import { ImageInsertWithHubAPI } from '#lib/db/zod/schema/image.js'
import {
  listOrganisationHistory,
  prepareOrganisationRevisionCapture,
  organisationRevisionTarget,
} from '#lib/db/services/organisationRevision.js'
import { removeOrganisationImage } from '#lib/db/services/organisationImage.js'
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
  for (const table of [
    user,
    organisation,
    organisationI18n,
    organisationRole,
    organisationProperty,
    revisionChangeSet,
  ]) {
    sqlite.exec(
      `CREATE TABLE "${getTableName(table)}" (${Object.values(getTableColumns(table))
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')})`,
    )
  }
  sqlite.exec(`
    CREATE TABLE hub(id TEXT PRIMARY KEY,domain TEXT);
    INSERT INTO hub VALUES('h','breadline.hk');
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
  createOrganisationUserTables(sqlite)
  sqlite.exec("UPDATE organisation SET hubId='h' WHERE id='o'")
  sqlite.exec('CREATE UNIQUE INDEX change_set_id ON revisionChangeSet(id)')
  sqlite.exec(readFileSync('migrations/0173_organisation_revisions.sql', 'utf8'))
  sqlite.exec('PRAGMA foreign_keys=ON')
  return { sqlite, db: db as unknown as Database }
}

/** Captures all columns, including write tokens and permission state. */
function snapshot(sqlite: ReturnType<typeof fixture>['sqlite']) {
  return [
    'organisation',
    'organisationI18n',
    'organisationRole',
    'organisationUserPolicy',
    'project',
    'projectRole',
  ].map(table => sqlite.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())
}

describe('organisation persisted history through application writes', () => {
  it('captures baseline, actor and translations; ignores no-op saves', async () => {
    const { db, sqlite } = fixture()
    try {
      const updated = await updateOrganisationByIdWithConcurrency(db, {
        ...patch,
        actorId: 'editor',
      })
      expect(updated).toMatchObject({ id: 'o' })
      if (!updated) throw new Error('Expected updated organisation')
      const rows = sqlite
        .prepare(
          'SELECT r.*, c.actorId FROM organisationRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId ORDER BY r.rowid',
        )
        .all()
      expect(rows).toHaveLength(2)
      expect(rows.map(r => r.actorId)).toEqual([
        'system:organisation-revision-baseline',
        'editor',
      ])
      expect(JSON.parse(rows[0].content as string).record.code).toBe('old')
      expect(JSON.parse(rows[1].content as string).i18n.en.name).toBe('New')
      expect(rows[1].previousRevisionId).toBe(rows[0].id)
      await updateOrganisationByIdWithConcurrency(db, {
        ...patch,
        actorId: 'editor',
        updatedAt: updated.modifiedAt,
      })
      expect(
        sqlite.prepare('SELECT count(*) n FROM organisationRevision').get(),
      ).toEqual({ n: 2 })
      expect(sqlite.prepare('SELECT * FROM organisationRevisionWrite').all()).toEqual(
        [],
      )
      for (const query of [
        "UPDATE organisation SET code='bypass' WHERE id='o'",
        "UPDATE organisationI18n SET name='bypass' WHERE organisationId='o'",
        "INSERT INTO organisationProperty(organisationId,propertyId,rank) VALUES('o','p',1)",
        "INSERT INTO organisationUserPolicy(organisationId) VALUES('o')",
      ])
        expect(() => sqlite.exec(query)).toThrow('requires revision capture')
    } finally {
      sqlite.close()
    }
  })

  it('retains default-off history and records permission grants and revocations atomically', async () => {
    const { db, sqlite } = fixture()
    try {
      const initial = await updateOrganisationByIdWithConcurrency(db, {
        ...patch,
        actorId: 'editor',
      })
      const original = sqlite
        .prepare('SELECT content FROM organisationRevision ORDER BY rowid DESC LIMIT 1')
        .get()!.content
      expect(JSON.parse(original as string).record).not.toHaveProperty(
        'permitUserDetailsEdit',
      )
      const granted = await updateOrganisationByIdWithConcurrency(db, {
        ...patch,
        actorId: 'superadmin',
        updatedAt: initial!.modifiedAt,
        data: { ...patch.data, permitUserDetailsEdit: true },
      })
      expect(
        sqlite.prepare('SELECT permitUserDetailsEdit FROM organisation').get(),
      ).toEqual({ permitUserDetailsEdit: 1 })
      expect(
        JSON.parse(
          sqlite
            .prepare(
              'SELECT content FROM organisationRevision ORDER BY rowid DESC LIMIT 1',
            )
            .get()!.content as string,
        ).record.permitUserDetailsEdit,
      ).toBe(true)
      expect(
        await updateOrganisationByIdWithConcurrency(db, {
          ...patch,
          actorId: 'superadmin',
          updatedAt: 'stale',
          data: { ...patch.data, permitUserDetailsEdit: false },
        }),
      ).toBeNull()
      expect(
        sqlite.prepare('SELECT permitUserDetailsEdit FROM organisation').get(),
      ).toEqual({ permitUserDetailsEdit: 1 })
      await updateOrganisationByIdWithConcurrency(db, {
        ...patch,
        actorId: 'superadmin',
        updatedAt: granted!.modifiedAt,
        data: { ...patch.data, permitUserDetailsEdit: false },
      })
      expect(
        sqlite.prepare('SELECT permitUserDetailsEdit FROM organisation').get(),
      ).toEqual({ permitUserDetailsEdit: 0 })
      expect(
        sqlite
          .prepare(
            'SELECT content FROM organisationRevision ORDER BY rowid DESC LIMIT 1',
          )
          .get()!.content,
      ).toBe(original)
      expect(
        sqlite.prepare('SELECT count(*) n FROM organisationRevision').get(),
      ).toEqual({ n: 4 })
    } finally {
      sqlite.close()
    }
  })

  it.each([false, true])(
    'migrates the HKFoodWorks grant with existing history=%s',
    async enrolled => {
      const { db, sqlite } = fixture()
      try {
        sqlite.exec(
          "UPDATE organisation SET code='hkfoodworks', permitUserDetailsEdit=0, modifiedAt='2026-01-01T00:00:00.000Z' WHERE id='o'",
        )
        sqlite.exec(
          "INSERT INTO organisation(id,code,permitUserDetailsEdit) VALUES ('unrelated','other',0)",
        )
        if (enrolled) {
          await updateOrganisationByIdWithConcurrency(db, {
            ...patch,
            actorId: 'editor',
            updatedAt: '2026-01-01T00:00:00.000Z',
            data: { ...patch.data, code: 'hkfoodworks', permitUserDetailsEdit: false },
          })
        }
        const migration = readFileSync(
          'migrations/0181_hkfoodworks_user_details_permission.sql',
          'utf8',
        )
        const revisionsBefore = sqlite
          .prepare('SELECT * FROM organisationRevision ORDER BY rowid')
          .all()
        sqlite.exec(`BEGIN; ${migration} COMMIT;`)
        expect(
          sqlite
            .prepare('SELECT id,permitUserDetailsEdit FROM organisation ORDER BY id')
            .all(),
        ).toEqual([
          { id: 'o', permitUserDetailsEdit: 1 },
          { id: 'unrelated', permitUserDetailsEdit: 0 },
        ])
        const revisionsAfter = sqlite
          .prepare('SELECT * FROM organisationRevision ORDER BY rowid')
          .all()
        expect(revisionsAfter.slice(0, revisionsBefore.length)).toEqual(revisionsBefore)
        expect(revisionsAfter.length - revisionsBefore.length).toBe(enrolled ? 1 : 0)
        if (enrolled)
          expect(
            JSON.parse(revisionsAfter.at(-1)!.content as string).record
              .permitUserDetailsEdit,
          ).toBe(true)
        const state = snapshot(sqlite)
        sqlite.exec(`BEGIN; ${migration} COMMIT;`)
        expect(snapshot(sqlite)).toEqual(state)
        expect(
          sqlite.prepare('SELECT * FROM organisationRevision ORDER BY rowid').all(),
        ).toEqual(revisionsAfter)
        expect(sqlite.prepare('SELECT * FROM organisationRevisionWrite').all()).toEqual(
          [],
        )
        // The next ordinary edit must still match the captured live projection.
        const current = sqlite
          .prepare("SELECT modifiedAt FROM organisation WHERE id='o'")
          .get()!
        await expect(
          updateOrganisationByIdWithConcurrency(db, {
            ...patch,
            actorId: 'editor',
            updatedAt: current.modifiedAt as string,
            data: { ...patch.data, code: 'hkfoodworks' },
          }),
        ).resolves.not.toBeNull()
        expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )

  it.each([false, true])(
    'enables Ghost Signs contributions with existing policy=%s and preserves history',
    async existingPolicy => {
      const { db, sqlite } = fixture()
      try {
        sqlite.exec(`
        CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT,contributorId TEXT,isDraft INTEGER);
        CREATE TABLE image(id TEXT PRIMARY KEY,contributorId TEXT);
        CREATE TABLE featureImage(featureId TEXT,imageId TEXT,isPublished INTEGER);
        CREATE TABLE task(id TEXT PRIMARY KEY,projectId TEXT,organisationId TEXT,featureId TEXT,contributorId TEXT,isDraft INTEGER,type TEXT);
        CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
        ALTER TABLE project ADD COLUMN code TEXT;
        UPDATE project SET code='hkghostsigns' WHERE id='p';
      `)
        const policy = existingPolicy
          ? {
              enabled: false,
              hubSignIn: true,
              emailDomain: null,
              customCard: true,
              contribution: false,
              revision: 0,
            }
          : undefined
        await updateOrganisationByIdWithConcurrency(db, {
          ...patch,
          actorId: 'editor',
          userPolicy: policy,
        })
        const before = sqlite
          .prepare('SELECT * FROM organisationRevision ORDER BY rowid')
          .all()
        if (existingPolicy)
          expect(
            JSON.parse(before.at(-1)!.content as string).userPolicy,
          ).not.toHaveProperty('contribution')
        const migration = readFileSync(
          'migrations/0183_hkghostsigns_contribution_users.sql',
          'utf8',
        )
        sqlite.exec(`BEGIN; ${migration} COMMIT;`)
        const after = sqlite
          .prepare('SELECT * FROM organisationRevision ORDER BY rowid')
          .all()
        expect(after.slice(0, before.length)).toEqual(before)
        expect(after).toHaveLength(before.length + 1)
        expect(JSON.parse(after.at(-1)!.content as string).userPolicy).toEqual({
          enabled: true,
          hubSignIn: existingPolicy,
          emailDomain: null,
          customCard: existingPolicy,
          contribution: true,
        })
        sqlite.exec(`BEGIN; ${migration} COMMIT;`)
        expect(
          sqlite.prepare('SELECT * FROM organisationRevision ORDER BY rowid').all(),
        ).toEqual(after)
        expect(sqlite.prepare('SELECT * FROM organisationRevisionWrite').all()).toEqual(
          [],
        )
        // The next normal save must match the migration snapshot and permit turning the rule off.
        const current = sqlite
          .prepare("SELECT modifiedAt FROM organisation WHERE id='o'")
          .get()!
        const currentPolicy = sqlite
          .prepare(
            "SELECT revision FROM organisationUserPolicy WHERE organisationId='o'",
          )
          .get()!
        await expect(
          updateOrganisationByIdWithConcurrency(db, {
            ...patch,
            actorId: 'editor',
            updatedAt: current.modifiedAt as string,
            userPolicy: {
              enabled: true,
              hubSignIn: existingPolicy,
              emailDomain: null,
              customCard: existingPolicy,
              contribution: false,
              revision: currentPolicy.revision as number,
            },
          }),
        ).resolves.not.toBeNull()
        expect(
          JSON.parse(
            sqlite
              .prepare(
                'SELECT content FROM organisationRevision ORDER BY rowid DESC LIMIT 1',
              )
              .get()!.content as string,
          ).userPolicy,
        ).not.toHaveProperty('contribution')
      } finally {
        sqlite.close()
      }
    },
  )

  it.each(['stale', 'late-failure'])(
    'rolls back capture and content on %s',
    async mode => {
      const { db, sqlite } = fixture()
      try {
        const before = snapshot(sqlite)
        if (mode === 'late-failure')
          sqlite.exec(
            "CREATE TRIGGER injected BEFORE DELETE ON organisationRevisionWrite BEGIN SELECT RAISE(ABORT,'late failure'); END",
          )
        const saving = updateOrganisationByIdWithConcurrency(db, {
          ...patch,
          actorId: 'editor',
          updatedAt: mode === 'stale' ? 'wrong' : 'before',
        })
        if (mode === 'stale') expect(await saving).toBeNull()
        else await expect(saving).rejects.toThrow('late failure')
        expect(snapshot(sqlite)).toEqual(before)
        for (const table of [
          'organisationRevision',
          'organisationRevisionHead',
          'organisationRevisionWrite',
          'revisionChangeSet',
        ])
          expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )

  it.each(['new', 'o'])(
    'creates a single authored root or rolls back collision: %s',
    async id => {
      const { db, sqlite } = fixture()
      try {
        const saving = createOrganisation(
          db,
          { id, code: 'created', settings: {} },
          { i18n: patch.i18n },
          { actorId: 'creator' },
        )
        if (id === 'o') {
          await expect(saving).rejects.toThrow()
          expect(sqlite.prepare('SELECT * FROM organisationRevision').all()).toEqual([])
        } else {
          expect(await saving).toMatchObject({ id })
          const rows = sqlite
            .prepare(
              'SELECT r.*,c.actorId FROM organisationRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId',
            )
            .all()
          expect(rows).toHaveLength(1)
          expect(rows[0]).toMatchObject({
            organisationId: id,
            previousRevisionId: null,
            actorId: 'creator',
          })
          expect(JSON.parse(rows[0].content as string).record.isPublished).toBe(false)
        }
        expect(sqlite.prepare('SELECT * FROM organisationRevisionWrite').all()).toEqual(
          [],
        )
      } finally {
        sqlite.close()
      }
    },
  )
})

describe('organisation history from indirect writers', () => {
  it('captures large hub replacements once per changed organisation with one actor', async () => {
    const { db, sqlite } = fixture()
    try {
      const next = Array.from({ length: 150 }, (_, i) => ({
        organisationId: `next-${i}`,
        isCoreInclusive: true,
        isHubExclusive: false,
      }))
      for (const row of next)
        sqlite.prepare('INSERT INTO organisation(id) VALUES(?)').run(row.organisationId)
      const batches = vi.spyOn(db, 'batch')
      await syncOrganisations(db, 'h', next, { actorId: 'hub-admin' })
      const rows = sqlite
        .prepare(
          "SELECT r.content,c.actorId FROM organisationRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId WHERE c.origin='user'",
        )
        .all()
      expect(rows).toHaveLength(151)
      expect(rows.every(row => row.actorId === 'hub-admin')).toBe(true)
      expect(
        rows.filter(row => JSON.parse(row.content as string).record.hubId === 'h'),
      ).toHaveLength(150)
      expect(
        sqlite
          .prepare(
            'SELECT count(DISTINCT changeSetId) n FROM organisationRevision WHERE previousRevisionId IS NOT NULL',
          )
          .get(),
      ).toEqual({ n: 1 })
      for (const statement of batches.mock.calls[0][0])
        expect(
          (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
            .length,
        ).toBeLessThanOrEqual(100)
      const count = sqlite.prepare('SELECT count(*) n FROM organisationRevision').get()
      await syncOrganisations(db, 'h', next, { actorId: 'hub-admin' })
      expect(
        sqlite.prepare('SELECT count(*) n FROM organisationRevision').get(),
      ).toEqual(count)
    } finally {
      sqlite.close()
    }
  })

  it('captures logo replacement and preserves history on upload replay', async () => {
    const { db, sqlite } = fixture()
    try {
      sqlite.exec(
        'CREATE TABLE image(' +
          Object.values(getTableColumns(image))
            .map(c => `"${c.name}" ${c.getSQLType()}`)
            .join(',') +
          ',PRIMARY KEY(id))',
      )
      const data = ImageInsertWithHubAPI.parse({
        publicId: 'h/upload',
        env: 'local',
        cdn: 'cloudflareR2',
        contributorId: 'author',
        ctxType: 'hub',
        ctxId: 'h',
        version: 1000,
      })
      const before = await getResourceUploadSnapshot(db, 'organisation', 'o')
      if (!before) throw new Error('Expected upload snapshot')
      const first = await createUploadedResourceImage(
        db,
        'organisation',
        'o',
        data,
        before,
        undefined,
        { actorId: 'uploader' },
      )
      expect(first?.id).toBeTruthy()
      if (!first) throw new Error('Expected uploaded image')
      const rows = sqlite
        .prepare(
          'SELECT r.content,c.actorId FROM organisationRevision r JOIN revisionChangeSet c ON c.id=r.changeSetId ORDER BY r.rowid',
        )
        .all()
      expect(rows).toHaveLength(2)
      expect(rows[1].actorId).toBe('uploader')
      expect(JSON.parse(rows[1].content as string).record.imageId).toBe(first.id)
      expect(
        (
          await createUploadedResourceImage(
            db,
            'organisation',
            'o',
            data,
            before,
            undefined,
            { actorId: 'uploader' },
          )
        )?.id,
      ).toBe(first.id)
      expect(
        sqlite.prepare('SELECT count(*) n FROM organisationRevision').get(),
      ).toEqual({ n: 2 })
    } finally {
      sqlite.close()
    }
  })
})

describe('organisation history reads', () => {
  it('paginates immutable attribution, compares predecessors and fences moved scope', async () => {
    const { db, sqlite } = fixture()
    try {
      sqlite.exec(
        "INSERT INTO user(id,name,username,displayUsername,image) VALUES ('editor','History Editor','history.editor','History.Editor','/avatar.png')",
      )
      let updatedAt = 'before'
      for (let i = 0; i < 12; i++) {
        const saved = await updateOrganisationByIdWithConcurrency(db, {
          id: 'o',
          updatedAt,
          data: { code: `edit-${i}`, url: null },
          actorId: 'editor',
        })
        if (!saved) throw new Error('Expected saved organisation')
        updatedAt = saved.modifiedAt
      }
      const first = await listOrganisationHistory(db, {
        organisationId: 'o',
        hubId: 'h',
      })
      expect(first.entries).toHaveLength(10)
      expect(first.entries[0].actor).toEqual({
        name: 'History Editor',
        username: 'history.editor',
        displayUsername: 'History.Editor',
        image: '/avatar.png',
      })
      expect(first.entries[0].changes).toContainEqual({
        path: ['record', 'code'],
        before: { present: true, value: 'edit-10' },
        after: { present: true, value: 'edit-11' },
      })
      expect(first.nextCursor).not.toBeNull()
      const second = await listOrganisationHistory(db, {
        organisationId: 'o',
        hubId: 'h',
        before: first.nextCursor ?? undefined,
      })
      expect(second.entries).toHaveLength(3)
      expect(first.entries.at(-1)?.previousCreatedAt).toBe(second.entries[0].createdAt)
      expect(second.entries.at(-1)?.previousCreatedAt).toBeNull()
      expect(second.nextCursor).toBeNull()
      expect(second.entries.at(-1)).toMatchObject({
        initial: true,
        origin: 'migration',
        changes: [],
      })
      expect(
        new Set([...first.entries, ...second.entries].map(row => row.id)).size,
      ).toBe(13)
      expect(
        (await listOrganisationHistory(db, { organisationId: 'o', hubId: 'other' }))
          .entries,
      ).toEqual([])
      await syncOrganisations(db, 'h', [], { actorId: 'admin' })
      expect(
        (await listOrganisationHistory(db, { organisationId: 'o', hubId: 'h' }))
          .entries,
      ).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})

it('records a synthetic system edit without attributing it to a human', async () => {
  const { db, sqlite } = fixture()
  try {
    const capture = await prepareOrganisationRevisionCapture(
      db,
      organisationRevisionTarget('o'),
      {
        actorId: 'synthetic:local-demo',
        origin: 'system',
        reason: 'Synthetic demo',
      },
    )
    await db.batch([
      ...capture.before,
      db.update(organisation).set({ code: 'demo' }).where(eq(organisation.id, 'o')),
      ...capture.after,
    ] as never)
    const history = await listOrganisationHistory(db, {
      organisationId: 'o',
      hubId: 'h',
    })
    expect(history.entries[0]).toMatchObject({
      actorId: 'synthetic:local-demo',
      origin: 'system',
      reason: 'Synthetic demo',
    })
  } finally {
    sqlite.close()
  }
})

describe('organisation logo removal preserves historical media', () => {
  it.each(['success', 'stale', 'skip', 'late-failure'])(
    'detaches with atomic history: %s',
    async mode => {
      const { db, sqlite } = fixture()
      try {
        sqlite.exec(
          "CREATE TABLE image(id TEXT PRIMARY KEY); INSERT INTO image VALUES('logo'); UPDATE organisation SET imageId='logo' WHERE id='o'",
        )
        // Enrol first, so this exercises the guards already active in the local application.
        const capture = await prepareOrganisationRevisionCapture(
          db,
          organisationRevisionTarget('o'),
          { actorId: 'editor' },
        )
        await db.batch([...capture.before, ...capture.after] as never)
        const before = sqlite.prepare("SELECT * FROM organisation WHERE id='o'").get()
        if (mode === 'skip')
          sqlite.exec(
            'CREATE TRIGGER skip_logo BEFORE UPDATE ON organisation BEGIN SELECT RAISE(IGNORE); END',
          )
        if (mode === 'late-failure')
          sqlite.exec(
            "CREATE TRIGGER fail_history BEFORE DELETE ON organisationRevisionWrite BEGIN SELECT RAISE(ABORT,'late failure'); END",
          )
        const removal = removeOrganisationImage(db, {
          organisationId: 'o',
          imageId: 'logo',
          actor: { actorId: 'editor', reason: 'Organisation image removed' },
          guard: mode === 'stale' ? sql`0` : sql`1`,
        })
        if (mode === 'late-failure')
          await expect(removal).rejects.toThrow('late failure')
        else expect(await removal).toBe(mode === 'success')
        expect(sqlite.prepare('SELECT * FROM image').all()).toEqual([{ id: 'logo' }])
        expect(sqlite.prepare('SELECT * FROM organisationRevisionWrite').all()).toEqual(
          [],
        )
        const history = await listOrganisationHistory(db, {
          organisationId: 'o',
          hubId: 'h',
        })
        expect(history.entries).toHaveLength(mode === 'success' ? 2 : 1)
        if (mode === 'success') {
          expect(
            sqlite.prepare("SELECT imageId FROM organisation WHERE id='o'").get(),
          ).toEqual({ imageId: null })
          expect(history.entries[0].changes).toContainEqual({
            path: ['record', 'imageId'],
            before: { present: true, value: 'logo' },
            after: { present: true, value: null },
          })
          expect(
            await removeOrganisationImage(db, {
              organisationId: 'o',
              imageId: 'logo',
              actor: { actorId: 'editor' },
              guard: sql`1`,
            }),
          ).toBe(false)
        } else
          expect(
            sqlite.prepare("SELECT * FROM organisation WHERE id='o'").get(),
          ).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )
})
