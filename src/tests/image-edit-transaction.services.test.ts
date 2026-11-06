// TESTS
import { describe, expect, it, vi } from 'vitest'
// DRIZZLE
import { getTableColumns, sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
// DB
import { featureImage, image } from '#lib/db/schema/image.js'
import {
  getImageMutationSnapshot,
  createImageMutationGuards,
} from '#lib/db/services/imageMutationScope.js'
import { getProjectForFeatureId } from '#lib/db/services/project.js'
import { getUserById } from '#lib/db/services/user.js'
import { updateImageForContext } from '#lib/api/services/image.js'
import { ImageContextResource } from '#lib/enums.js'
import { deleteImageWithEvidence } from '#lib/db/services/imageDeletion.js'
import { commitTaskImageReview } from '#lib/db/services/task.js'
import { updateImageWithFeatureImage } from '#lib/db/services/image.js'
import { prepareRevisionCheck } from '#lib/db/services/revisionBatch.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database, SessionUser } from '#lib/types.js'

vi.mock('#lib/db/services/project.js', () => ({
  getProjectForFeatureId: vi.fn(async () => ({ id: 'project' })),
}))
vi.mock('#lib/db/services/user.js', () => ({
  getUserById: vi.fn(async () => ({ id: 'author', attribution: 'Author' })),
  userColumnsWithPrivacyProtected: vi.fn(() => ({})),
}))

/**
 * Builds disposable image and assignment tables for transactional edit checks.
 * @returns SQLite connection and D1 adapter.
 */
async function setup() {
  const { db, sqlite } = publicationSqlite({})
  const columns = (table: typeof image | typeof featureImage) =>
    Object.values(getTableColumns(table))
      .map(column => `"${column.name}" ${column.getSQLType()}`)
      .join(',')
  sqlite.exec(`CREATE TABLE image(${columns(image)},PRIMARY KEY(id));
    CREATE TABLE featureImage(${columns(featureImage)},PRIMARY KEY(featureId,imageId));
    CREATE UNIQUE INDEX canonical_image ON featureImage(featureId) WHERE intent='canonical';
    INSERT INTO featureImage(featureId,imageId,intent,isPublished) VALUES
    ('feature','old','canonical',1),('feature','new','general',0),('other','new','general',0);`)
  sqlite.exec(`CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT,projectId TEXT,organisationId TEXT,
    type TEXT DEFAULT 'newPhoto',modifiedAt TEXT DEFAULT '2099-01-01T00:00:00.000Z',
    isReviewed INTEGER DEFAULT 0,isDraft INTEGER DEFAULT 0,reviewerId TEXT,reviewReason TEXT,reviewOutcome TEXT,reviewAction TEXT);
    CREATE TABLE taskImage(taskId TEXT,imageId TEXT);
    CREATE TABLE feature(id TEXT,projectId TEXT);
    CREATE TABLE project(id TEXT,organisationId TEXT,imageId TEXT);
    CREATE TABLE organisation(id TEXT,hubId TEXT,imageId TEXT);
    CREATE TABLE hub(id TEXT,imageId TEXT);
    INSERT INTO feature VALUES('feature','project');
    INSERT INTO project VALUES('project','org',NULL);
    INSERT INTO organisation VALUES('org',NULL,NULL);
    INSERT INTO task(id,featureId,projectId,organisationId,isReviewed,isDraft) VALUES
      ('pending','feature','project','org',0,0),('draft','feature','project','org',0,1),
      ('other','other','project','org',0,0),('old-canonical','feature','project','org',0,0),
      ('reviewed','feature','project','org',1,0),('unrelated','feature','project','org',0,0);
    INSERT INTO taskImage VALUES('pending','new'),('draft','new'),('other','new'),
      ('old-canonical','old'),('reviewed','new'),('unrelated','unrelated');`)
  await db.insert(image).values({
    id: 'new',
    publicId: 'before',
    contributorId: 'author',
    modifiedAt: '2000-01-01T00:00:00.000Z',
  })
  return { db: db as unknown as Database, sqlite }
}

describe('atomic image and assignment edits', () => {
  it.each(['cover', 'contain', 'cast-edges'] as const)(
    'persists the %s fit mode without a logo capture',
    async presentationMode => {
      const { db, sqlite } = await setup()
      try {
        const result = await updateImageWithFeatureImage(
          db,
          { presentationMode },
          undefined,
          'new',
        )
        expect(result.image.presentationMode).toBe(presentationMode)
        expect(
          sqlite.prepare("SELECT presentationMode FROM image WHERE id='new'").get(),
        ).toEqual({ presentationMode })
      } finally {
        sqlite.close()
      }
    },
  )

  it.each([false, true])(
    'commits logo capture with the image or rolls both back (failure: %s)',
    async fail => {
      const { db, sqlite } = await setup()
      const history = sqliteTable('logoHistory', { phase: text('phase').primaryKey() })
      try {
        sqlite.exec('CREATE TABLE logoHistory(phase TEXT PRIMARY KEY)')
        const before = sqlite.prepare("SELECT * FROM image WHERE id='new'").get()
        // Capture checks must see the old mode before the update and the new mode afterward.
        const update = updateImageWithFeatureImage(
          db,
          { presentationMode: 'cast-edges' },
          undefined,
          'new',
          undefined,
          undefined,
          'author',
          {
            before: [
              prepareRevisionCheck(
                db,
                sql`(SELECT presentationMode FROM image WHERE id='new')='contain'`,
              ),
              db.insert(history).values({ phase: 'before' }),
            ],
            after: [
              prepareRevisionCheck(
                db,
                sql`(SELECT presentationMode FROM image WHERE id='new')='cast-edges'`,
              ),
              db.insert(history).values({ phase: 'after' }),
              ...(fail ? [prepareRevisionCheck(db, sql`0`)] : []),
            ],
          },
        )
        if (fail) {
          await expect(update).rejects.toMatchObject({ status: 409 })
          expect(sqlite.prepare("SELECT * FROM image WHERE id='new'").get()).toEqual(
            before,
          )
          expect(sqlite.prepare('SELECT * FROM logoHistory').all()).toEqual([])
        } else {
          expect((await update).image.presentationMode).toBe('cast-edges')
          expect(
            sqlite.prepare('SELECT phase FROM logoHistory ORDER BY rowid').all(),
          ).toEqual([{ phase: 'before' }, { phase: 'after' }])
        }
      } finally {
        sqlite.close()
      }
    },
  )

  it('commits image fields and canonical replacement without changing another Feature assignment', async () => {
    const { db, sqlite } = await setup()
    try {
      const result = await updateImageWithFeatureImage(
        db,
        { publicId: 'after' },
        { featureId: 'feature', intent: 'canonical', isPublished: true },
        'new',
      )
      expect(result.image.publicId).toBe('after')
      expect(result.featureImage).toMatchObject({
        imageId: 'new',
        intent: 'canonical',
        isPublished: true,
      })
      expect(
        sqlite
          .prepare(
            "SELECT intent FROM featureImage WHERE featureId='feature' AND imageId='old'",
          )
          .get(),
      ).toEqual({ intent: 'undefined' })
      expect(
        sqlite
          .prepare(
            "SELECT intent,isPublished FROM featureImage WHERE featureId='other'",
          )
          .get(),
      ).toEqual({ intent: 'general', isPublished: 0 })
    } finally {
      sqlite.close()
    }
  })

  it.each([
    'image-failure',
    'image-skip',
    'assignment-failure',
    'assignment-skip',
    'missing-assignment',
  ])('rolls back the complete edit on %s', async scenario => {
    const { db, sqlite } = await setup()
    try {
      const taskRevisions = sqlite.prepare('SELECT * FROM task ORDER BY id').all()
      if (scenario === 'missing-assignment')
        sqlite.exec(
          "DELETE FROM featureImage WHERE featureId='feature' AND imageId='new'",
        )
      else {
        const table = scenario.startsWith('image-') ? 'image' : 'featureImage'
        const condition =
          table === 'image'
            ? "NEW.id='new'"
            : "NEW.imageId='new' AND NEW.intent='canonical'"
        sqlite.exec(
          `CREATE TRIGGER stop_write BEFORE UPDATE ON ${table} WHEN ${condition} BEGIN SELECT RAISE(${scenario.endsWith('skip') ? 'IGNORE' : "ABORT, 'forced failure'"}); END`,
        )
      }
      await expect(
        updateImageWithFeatureImage(
          db,
          { publicId: 'after' },
          { featureId: 'feature', intent: 'canonical' },
          'new',
        ),
      ).rejects.toBeDefined()
      expect(
        sqlite.prepare("SELECT publicId,modifiedAt FROM image WHERE id='new'").get(),
      ).toEqual({ publicId: 'before', modifiedAt: '2000-01-01T00:00:00.000Z' })
      expect(
        sqlite.prepare("SELECT intent FROM featureImage WHERE imageId='old'").get(),
      ).toEqual({ intent: 'canonical' })
      expect(sqlite.prepare('SELECT * FROM task ORDER BY id').all()).toEqual(
        taskRevisions,
      )
    } finally {
      sqlite.close()
    }
  })

  it('does not rewrite the image for an assignment-only edit containing its identity', async () => {
    const { db, sqlite } = await setup()
    try {
      const result = await updateImageWithFeatureImage(
        db,
        { id: 'new' },
        { featureId: 'feature', isPublished: true },
        'new',
      )
      expect(result.image.modifiedAt).toBe('2000-01-01T00:00:00.000Z')
      expect(result.featureImage?.isPublished).toBe(true)
    } finally {
      sqlite.close()
    }
  })

  it('supports image-only edits and empty assignment reads', async () => {
    const { db, sqlite } = await setup()
    try {
      expect(
        (
          await updateImageWithFeatureImage(
            db,
            { contentHash: 'hash' },
            undefined,
            'new',
          )
        ).image.contentHash,
      ).toBe('hash')
      expect(
        (await updateImageWithFeatureImage(db, {}, { featureId: 'feature' }, 'new'))
          .featureImage?.intent,
      ).toBe('general')
    } finally {
      sqlite.close()
    }
  })

  it('rejects changing the authorized image identity', async () => {
    const { db, sqlite } = await setup()
    try {
      await expect(
        updateImageWithFeatureImage(db, { id: 'redirected' }, undefined, 'new'),
      ).rejects.toMatchObject({ status: 400 })
      expect(sqlite.prepare('SELECT id FROM image').all()).toEqual([{ id: 'new' }])
    } finally {
      sqlite.close()
    }
  })

  it('rejects a disappeared image before changing its canonical assignment', async () => {
    const { db, sqlite } = await setup()
    try {
      sqlite.exec('DELETE FROM image')
      await expect(
        updateImageWithFeatureImage(
          db,
          {},
          { featureId: 'feature', intent: 'canonical' },
          'new',
        ),
      ).rejects.toMatchObject({ status: 409 })
      expect(
        sqlite.prepare("SELECT intent FROM featureImage WHERE imageId='old'").get(),
      ).toEqual({ intent: 'canonical' })
    } finally {
      sqlite.close()
    }
  })
})

describe('authorized image edit orchestration', () => {
  it.each([
    { publicId: 'after', featureId: 'feature', imageId: 'new', intent: 'invalid' },
    { publicId: 'after', featureId: 'feature', imageId: 'other', intent: 'general' },
    { id: 'redirected', publicId: 'after' },
    { publicId: 'after', intent: 'canonical' },
  ])('rejects invalid edit fields before changing the image: %j', async data => {
    const { db, sqlite } = await setup()
    try {
      await expect(
        updateImageForContext({
          db,
          user: { id: 'author', superAdmin: true } as SessionUser,
          userId: 'author',
          userRoles: [],
          event: {} as never,
          isAdminRequest: true,
          id: 'new',
          ctxType: ImageContextResource.feature,
          ctxId: 'feature',
          data,
        }),
      ).rejects.toMatchObject({ status: 400 })
      expect(sqlite.prepare('SELECT id,publicId FROM image').all()).toEqual([
        { id: 'new', publicId: 'before' },
      ])
    } finally {
      sqlite.close()
    }
  })

  it.each([false, true])(
    'routes authorized compound edits through the transaction (failure: %s)',
    async fail => {
      const { db, sqlite } = await setup()
      try {
        if (fail)
          sqlite.exec(
            "CREATE TRIGGER stop_assignment BEFORE UPDATE ON featureImage WHEN NEW.intent='canonical' BEGIN SELECT RAISE(ABORT,'forced failure'); END",
          )
        const save = updateImageForContext({
          db,
          user: { id: 'author', superAdmin: true } as SessionUser,
          userId: 'author',
          userRoles: [],
          event: {} as never,
          isAdminRequest: true,
          id: 'new',
          ctxType: ImageContextResource.feature,
          ctxId: 'feature',
          data: { publicId: 'after', featureId: 'feature', intent: 'canonical' },
        })
        if (fail) await expect(save).rejects.toThrow()
        else
          expect((await save).data).toMatchObject({
            image: { id: 'new', publicId: 'after' },
            intent: 'canonical',
          })
        expect(sqlite.prepare('SELECT publicId FROM image').get()).toEqual({
          publicId: fail ? 'before' : 'after',
        })
      } finally {
        sqlite.close()
      }
    },
  )
})

describe('image evidence revisions', () => {
  it('invalidates a review snapshot after its image changes', async () => {
    const { db, sqlite } = await setup()
    try {
      const before = sqlite
        .prepare(
          "SELECT id,featureId,projectId,organisationId,type,modifiedAt FROM task WHERE id='pending'",
        )
        .get()!
      await updateImageWithFeatureImage(
        db,
        { publicId: 'replacement' },
        undefined,
        'new',
      )
      expect(
        await commitTaskImageReview(db, {
          task: before as never,
          resourceHubId: null,
          action: 'acceptAll',
          reviewerId: 'reviewer',
        }),
      ).toBe(false)
      expect(
        sqlite.prepare("SELECT isReviewed FROM task WHERE id='pending'").get(),
      ).toEqual({ isReviewed: 0 })
    } finally {
      sqlite.close()
    }
  })

  it('invalidates pending and draft evidence monotonically while preserving reviewed and unrelated tasks', async () => {
    const { db, sqlite } = await setup()
    try {
      await updateImageWithFeatureImage(
        db,
        { contentHash: 'new-bytes' },
        undefined,
        'new',
      )
      const rows = sqlite.prepare('SELECT id,modifiedAt FROM task').all() as {
        id: string
        modifiedAt: string
      }[]
      for (const row of rows)
        expect(row.modifiedAt > '2099-01-01T00:00:00.000Z').toBe(
          ['pending', 'draft', 'other'].includes(row.id),
        )
      const first = sqlite.prepare('SELECT * FROM task ORDER BY id').all()
      await updateImageWithFeatureImage(
        db,
        { contentHash: 'new-bytes' },
        undefined,
        'new',
      )
      expect(sqlite.prepare('SELECT * FROM task ORDER BY id').all()).toEqual(first)
    } finally {
      sqlite.close()
    }
  })
})

describe('evidence mutation boundaries', () => {
  it('limits assignment invalidation to its Feature and includes canonical demotion', async () => {
    const { db, sqlite } = await setup()
    try {
      await updateImageWithFeatureImage(
        db,
        {},
        { featureId: 'feature', intent: 'canonical' },
        'new',
      )
      const rows = sqlite.prepare('SELECT id,modifiedAt FROM task').all() as {
        id: string
        modifiedAt: string
      }[]
      for (const row of rows)
        expect(row.modifiedAt > '2099-01-01T00:00:00.000Z').toBe(
          ['pending', 'draft', 'old-canonical'].includes(row.id),
        )
      const first = sqlite.prepare('SELECT * FROM task ORDER BY id').all()
      await updateImageWithFeatureImage(
        db,
        {},
        { featureId: 'feature', intent: 'canonical' },
        'new',
      )
      expect(sqlite.prepare('SELECT * FROM task ORDER BY id').all()).toEqual(first)
    } finally {
      sqlite.close()
    }
  })

  it.each(['image', 'assignment', 'delete'])(
    'rolls back %s mutation when a required task revision is skipped',
    async operation => {
      const { db, sqlite } = await setup()
      try {
        sqlite.exec(
          "CREATE TRIGGER skip_revision BEFORE UPDATE ON task WHEN NEW.id='pending' BEGIN SELECT RAISE(IGNORE); END",
        )
        const before = ['image', 'featureImage', 'taskImage', 'task'].map(table =>
          sqlite.prepare(`SELECT * FROM ${table}`).all(),
        )
        if (operation === 'delete')
          expect(await deleteImageWithEvidence(db, 'new')).toBe(false)
        else
          await expect(
            updateImageWithFeatureImage(
              db,
              operation === 'image' ? { publicId: 'after' } : {},
              operation === 'assignment'
                ? { featureId: 'feature', intent: 'canonical' }
                : undefined,
              'new',
            ),
          ).rejects.toMatchObject({ status: 409 })
        expect(
          ['image', 'featureImage', 'taskImage', 'task'].map(table =>
            sqlite.prepare(`SELECT * FROM ${table}`).all(),
          ),
        ).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it('invalidates review snapshots before deleting evidence and preserves unrelated tasks', async () => {
    const { db, sqlite } = await setup()
    try {
      const before = sqlite
        .prepare(
          "SELECT id,featureId,projectId,organisationId,type,modifiedAt FROM task WHERE id='pending'",
        )
        .get()!
      expect(await deleteImageWithEvidence(db, 'new')).toBe(true)
      expect(
        await commitTaskImageReview(db, {
          task: before as never,
          resourceHubId: null,
          action: 'acceptAll',
          reviewerId: 'reviewer',
        }),
      ).toBe(false)
      for (const table of ['image', 'featureImage', 'taskImage'])
        expect(
          sqlite
            .prepare(
              `SELECT count(*) AS total FROM ${table} WHERE ${table === 'image' ? 'id' : 'imageId'}='new'`,
            )
            .get(),
        ).toEqual({ total: 0 })
      const rows = sqlite.prepare('SELECT id,modifiedAt FROM task').all() as {
        id: string
        modifiedAt: string
      }[]
      for (const row of rows)
        expect(row.modifiedAt > '2099-01-01T00:00:00.000Z').toBe(
          ['pending', 'draft', 'other'].includes(row.id),
        )
      expect(await deleteImageWithEvidence(db, 'new')).toBe(false)
    } finally {
      sqlite.close()
    }
  })

  it.each(['image', 'featureImage', 'taskImage'])(
    'rolls back revisions and links when %s deletion is skipped',
    async table => {
      const { db, sqlite } = await setup()
      try {
        sqlite.exec(
          `CREATE TRIGGER skip_delete BEFORE DELETE ON ${table} BEGIN SELECT RAISE(IGNORE); END`,
        )
        const before = ['image', 'featureImage', 'taskImage', 'task'].map(name =>
          sqlite.prepare(`SELECT * FROM ${name}`).all(),
        )
        expect(await deleteImageWithEvidence(db, 'new')).toBe(false)
        expect(
          ['image', 'featureImage', 'taskImage', 'task'].map(name =>
            sqlite.prepare(`SELECT * FROM ${name}`).all(),
          ),
        ).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )
})

describe('image mutation scope snapshots', () => {
  const contexts = [
    { type: 'feature', id: 'feature' },
    { type: 'project', id: 'project' },
    { type: 'organisation', id: 'org' },
    { type: 'hub', id: 'hub' },
    { type: 'task', id: 'pending' },
  ] as const

  it.each(contexts)(
    'accepts unchanged $type membership and rejects image changes even with the same timestamp',
    async ({ type, id }) => {
      const { db, sqlite } = await setup()
      try {
        sqlite.exec(
          "UPDATE project SET imageId='new'; UPDATE organisation SET imageId='new'; INSERT INTO hub VALUES('hub','new')",
        )
        const snapshot = (await getImageMutationSnapshot(db, type as never, id, 'new'))!
        expect(snapshot).not.toBeNull()
        const guard = createImageMutationGuards(db, type as never, id, snapshot)
        await updateImageWithFeatureImage(db, {}, undefined, 'new', guard)
        sqlite.exec("UPDATE image SET publicId='concurrent-change'")
        await expect(
          updateImageWithFeatureImage(
            db,
            { publicId: 'stale-edit' },
            undefined,
            'new',
            guard,
          ),
        ).rejects.toMatchObject({ status: 409 })
        expect(await deleteImageWithEvidence(db, 'new', guard.before)).toBe(false)
        expect(sqlite.prepare('SELECT publicId FROM image').get()).toEqual({
          publicId: 'concurrent-change',
        })
        expect(
          sqlite.prepare("SELECT modifiedAt FROM task WHERE id='pending'").get(),
        ).toEqual({ modifiedAt: '2099-01-01T00:00:00.000Z' })
      } finally {
        sqlite.close()
      }
    },
  )

  it.each([
    {
      type: 'feature',
      id: 'feature',
      change: "DELETE FROM featureImage WHERE featureId='feature' AND imageId='new'",
    },
    { type: 'feature', id: 'feature', change: "UPDATE feature SET projectId='moved'" },
    {
      type: 'feature',
      id: 'feature',
      change: "UPDATE organisation SET hubId='new-hub'",
    },
    { type: 'project', id: 'project', change: 'UPDATE project SET imageId=NULL' },
    {
      type: 'project',
      id: 'project',
      change: "UPDATE project SET organisationId='other-org'",
    },
    { type: 'organisation', id: 'org', change: 'UPDATE organisation SET imageId=NULL' },
    {
      type: 'organisation',
      id: 'org',
      change: "UPDATE organisation SET hubId='new-hub'",
    },
    { type: 'hub', id: 'hub', change: 'UPDATE hub SET imageId=NULL' },
    {
      type: 'task',
      id: 'pending',
      change: "DELETE FROM taskImage WHERE taskId='pending'",
    },
    {
      type: 'task',
      id: 'pending',
      change: "UPDATE task SET featureId='other-feature' WHERE id='pending'",
    },
    {
      type: 'task',
      id: 'pending',
      change: "UPDATE task SET organisationId='other-org' WHERE id='pending'",
    },
  ])(
    'rejects changed $type membership/ancestry: $change',
    async ({ type, id, change }) => {
      const { db, sqlite } = await setup()
      try {
        sqlite.exec(
          "UPDATE project SET imageId='new'; UPDATE organisation SET imageId='new'; INSERT INTO hub VALUES('hub','new'); INSERT INTO project VALUES('moved','org',NULL); INSERT INTO organisation VALUES('other-org',NULL,NULL); INSERT INTO feature VALUES('other-feature','project')",
        )
        const snapshot = (await getImageMutationSnapshot(db, type as never, id, 'new'))!
        const guard = createImageMutationGuards(db, type as never, id, snapshot)
        sqlite.exec(change)
        const before = ['image', 'featureImage', 'taskImage', 'task'].map(table =>
          sqlite.prepare(`SELECT * FROM ${table}`).all(),
        )
        await expect(
          updateImageWithFeatureImage(
            db,
            { publicId: 'stale-edit' },
            undefined,
            'new',
            guard,
          ),
        ).rejects.toMatchObject({ status: 409 })
        expect(await deleteImageWithEvidence(db, 'new', guard.before)).toBe(false)
        expect(
          ['image', 'featureImage', 'taskImage', 'task'].map(table =>
            sqlite.prepare(`SELECT * FROM ${table}`).all(),
          ),
        ).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )

  it.each(['authorization', 'attribution'])(
    'rejects scope drift during %s lookup',
    async phase => {
      const { db, sqlite } = await setup()
      try {
        sqlite.exec("INSERT INTO project VALUES('moved','org',NULL)")
        if (phase === 'authorization') {
          vi.mocked(getProjectForFeatureId).mockImplementationOnce(async () => {
            sqlite.exec("UPDATE feature SET projectId='moved'")
            return { id: 'project' } as never
          })
        } else {
          vi.mocked(getUserById).mockImplementationOnce(async () => {
            sqlite.exec("UPDATE feature SET projectId='moved'")
            return { id: 'author', attribution: 'Author' } as never
          })
        }
        await expect(
          updateImageForContext({
            db,
            user: { id: 'author', superAdmin: false } as SessionUser,
            userId: 'author',
            userRoles: [
              { type: 'project', projectId: 'project', role: 'maintainer' },
            ] as never,
            event: {} as never,
            isAdminRequest: true,
            id: 'new',
            ctxType: ImageContextResource.feature,
            ctxId: 'feature',
            data: { publicId: 'stale-edit' },
          }),
        ).rejects.toMatchObject({ status: 409 })
        expect(sqlite.prepare('SELECT publicId FROM image').get()).toEqual({
          publicId: 'before',
        })
      } finally {
        sqlite.close()
      }
    },
  )
  it('rolls back edits and evidence revisions if a write removes the authorized association', async () => {
    const { db, sqlite } = await setup()
    try {
      const snapshot = (await getImageMutationSnapshot(
        db,
        ImageContextResource.feature,
        'feature',
        'new',
      ))!
      const guard = createImageMutationGuards(
        db,
        ImageContextResource.feature,
        'feature',
        snapshot,
      )
      const before = ['image', 'featureImage', 'taskImage', 'task'].map(table =>
        sqlite.prepare(`SELECT * FROM ${table}`).all(),
      )
      sqlite.exec(
        "CREATE TRIGGER detach AFTER UPDATE ON image BEGIN DELETE FROM featureImage WHERE featureId='feature' AND imageId='new'; END",
      )
      await expect(
        updateImageWithFeatureImage(
          db,
          { publicId: 'changed' },
          undefined,
          'new',
          guard,
        ),
      ).rejects.toMatchObject({ status: 409 })
      expect(
        ['image', 'featureImage', 'taskImage', 'task'].map(table =>
          sqlite.prepare(`SELECT * FROM ${table}`).all(),
        ),
      ).toEqual(before)
    } finally {
      sqlite.close()
    }
  })
})

describe('signed upload replacements', () => {
  it.each([
    { type: 'feature', id: 'feature' },
    { type: 'project', id: 'project' },
    { type: 'organisation', id: 'org' },
    { type: 'hub', id: 'hub' },
  ])(
    'commits one $type replacement, preserves replay, and rejects superseded grants',
    async ({ type, id }) => {
      const { db, sqlite } = await setup()
      try {
        sqlite.exec(
          "UPDATE project SET imageId='new'; UPDATE organisation SET imageId='new'; INSERT INTO hub VALUES('hub','new')",
        )
        const snapshot = (await getImageMutationSnapshot(db, type as never, id, 'new'))!
        const args = {
          db,
          user: { id: 'author', superAdmin: true } as SessionUser,
          userId: 'author',
          userRoles: [],
          event: {} as never,
          isAdminRequest: true,
          id: 'new',
          ctxType: type as never,
          ctxId: id,
        }
        const firstData = {
          publicId: 'unique-upload-1',
          env: 'local',
          version: 1000,
          ...(type === 'feature'
            ? { featureId: 'feature', intent: 'general', isPublished: false }
            : {}),
        }
        const first = await updateImageForContext({
          ...args,
          data: firstData,
          replacement: { snapshot, publicId: firstData.publicId, env: 'local' },
        })
        expect(first.data.image).toMatchObject({
          id: 'new',
          publicId: 'unique-upload-1',
          version: 1000,
        })
        expect(first.replayed).toBe(false)
        sqlite.exec(
          "UPDATE featureImage SET intent='undefined' WHERE imageId='old'; UPDATE featureImage SET intent='canonical',isPublished=1 WHERE featureId='feature' AND imageId='new'",
        )
        sqlite.exec('UPDATE image SET isArchived=1')
        const beforeReplay = ['image', 'featureImage', 'task'].map(table =>
          sqlite.prepare(`SELECT * FROM ${table}`).all(),
        )
        const replay = await updateImageForContext({
          ...args,
          data: { ...firstData, version: 2000 },
          replacement: { snapshot, publicId: firstData.publicId, env: 'local' },
        })
        expect(replay.replayed).toBe(true)
        expect(replay.data.image.version).toBe(1000)
        expect(
          ['image', 'featureImage', 'task'].map(table =>
            sqlite.prepare(`SELECT * FROM ${table}`).all(),
          ),
        ).toEqual(beforeReplay)
        await expect(
          updateImageForContext({
            ...args,
            data: { publicId: 'competing', env: 'local', version: 3000 },
            replacement: { snapshot, publicId: 'competing', env: 'local' },
          }),
        ).rejects.toMatchObject({ status: 409 })
        const nextSnapshot = (await getImageMutationSnapshot(
          db,
          type as never,
          id,
          'new',
        ))!
        await updateImageForContext({
          ...args,
          data: { publicId: 'unique-upload-2', env: 'local', version: 4000 },
          replacement: {
            snapshot: nextSnapshot,
            publicId: 'unique-upload-2',
            env: 'local',
          },
        })
        await expect(
          updateImageForContext({
            ...args,
            data: firstData,
            replacement: { snapshot, publicId: firstData.publicId, env: 'local' },
          }),
        ).rejects.toMatchObject({ status: 409 })
        expect(sqlite.prepare('SELECT publicId FROM image').get()).toEqual({
          publicId: 'unique-upload-2',
        })
      } finally {
        sqlite.close()
      }
    },
  )

  it.each(['image', 'featureImage'])(
    'rolls back replacement metadata, moderation and task revisions on a skipped %s write',
    async table => {
      const { db, sqlite } = await setup()
      try {
        const snapshot = (await getImageMutationSnapshot(
          db,
          ImageContextResource.feature,
          'feature',
          'new',
        ))!
        const before = ['image', 'featureImage', 'task'].map(name =>
          sqlite.prepare(`SELECT * FROM ${name}`).all(),
        )
        sqlite.exec(
          `CREATE TRIGGER skip_write BEFORE UPDATE ON ${table} BEGIN SELECT RAISE(IGNORE); END`,
        )
        await expect(
          updateImageForContext({
            db,
            user: { id: 'author', superAdmin: true } as SessionUser,
            userId: 'author',
            userRoles: [],
            event: {} as never,
            isAdminRequest: true,
            id: 'new',
            ctxType: ImageContextResource.feature,
            ctxId: 'feature',
            data: {
              publicId: 'new-upload',
              env: 'local',
              version: 1000,
              featureId: 'feature',
              intent: 'canonical',
            },
            replacement: { snapshot, publicId: 'new-upload', env: 'local' },
          }),
        ).rejects.toBeDefined()
        expect(
          ['image', 'featureImage', 'task'].map(name =>
            sqlite.prepare(`SELECT * FROM ${name}`).all(),
          ),
        ).toEqual(before)
      } finally {
        sqlite.close()
      }
    },
  )
  it('rejects a pending replacement after publication changes without changing the image row', async () => {
    const { db, sqlite } = await setup()
    try {
      const snapshot = (await getImageMutationSnapshot(
        db,
        ImageContextResource.feature,
        'feature',
        'new',
      ))!
      sqlite.exec(
        "UPDATE featureImage SET isPublished=1 WHERE featureId='feature' AND imageId='new'",
      )
      await expect(
        updateImageForContext({
          db,
          user: { id: 'author', superAdmin: true } as SessionUser,
          userId: 'author',
          userRoles: [],
          event: {} as never,
          isAdminRequest: true,
          id: 'new',
          ctxType: ImageContextResource.feature,
          ctxId: 'feature',
          data: {
            publicId: 'new-upload',
            env: 'local',
            version: 1000,
            featureId: 'feature',
            isPublished: false,
          },
          replacement: { snapshot, publicId: 'new-upload', env: 'local' },
        }),
      ).rejects.toMatchObject({ status: 409 })
      expect(sqlite.prepare('SELECT publicId FROM image').get()).toEqual({
        publicId: 'before',
      })
      expect(
        sqlite
          .prepare(
            "SELECT isPublished FROM featureImage WHERE featureId='feature' AND imageId='new'",
          )
          .get(),
      ).toEqual({ isPublished: 1 })
    } finally {
      sqlite.close()
    }
  })
})

it('refuses hard deletion through another context when organisation history retains the image', async () => {
  const {db,sqlite}=await setup()
  try {
    sqlite.exec(`CREATE TABLE organisationRevision(content TEXT);
      CREATE TABLE organisationRevisionHead(organisationId TEXT);
      CREATE TABLE organisationRevisionWrite(organisationId TEXT);
      INSERT INTO organisationRevision VALUES('{"record":{"imageId":"new"}}');`)
    const before=['image','featureImage','taskImage','task'].map(table=>sqlite.prepare(`SELECT * FROM ${table}`).all())
    expect(await deleteImageWithEvidence(db,'new')).toBe(false)
    expect(['image','featureImage','taskImage','task'].map(table=>sqlite.prepare(`SELECT * FROM ${table}`).all())).toEqual(before)
  }finally{sqlite.close()}
})
