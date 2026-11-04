// TESTS
import { describe, expect, it, vi } from 'vitest'
// DRIZZLE
import { getTableColumns } from 'drizzle-orm'
// DB
import { featureImage, image } from '#lib/db/schema/image.js'
import { getImageMutationSnapshot } from '#lib/db/services/imageMutationScope.js'
import { updateImageForContext } from '#lib/api/services/image.js'
import { ImageContextResource } from '#lib/enums.js'
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
