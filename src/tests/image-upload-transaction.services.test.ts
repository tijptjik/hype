// TESTS
import { describe, expect, it, vi } from 'vitest'
// DRIZZLE
import { getTableColumns } from 'drizzle-orm'
// DB
import { image, featureImage } from '#lib/db/schema/image.js'
import {
  createUploadedFeatureImage,
  getFeatureImageCreationScope,
} from '#lib/db/services/imageUpload.js'
import { ImageInsertWithFeatureAPI } from '#lib/db/zod/schema/image.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

function setup() {
  const { db, sqlite } = publicationSqlite({})
  const columns = (table: typeof image | typeof featureImage) =>
    Object.values(getTableColumns(table))
      .map(column => `"${column.name}" ${column.getSQLType()}`)
      .join(',')
  sqlite.exec(`CREATE TABLE image(${columns(image)}, PRIMARY KEY(id));
    CREATE TABLE featureImage(${columns(featureImage)}, PRIMARY KEY(featureId,imageId));
    CREATE UNIQUE INDEX canonical_image ON featureImage(featureId) WHERE intent='canonical';
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT);
    CREATE TABLE feature(id TEXT PRIMARY KEY,projectId TEXT);
    CREATE TABLE task(id TEXT PRIMARY KEY,featureId TEXT,projectId TEXT,organisationId TEXT,contributorId TEXT,isDraft INTEGER,isReviewed INTEGER,modifiedAt TEXT DEFAULT '2026-01-01T00:00:00.000Z');
    CREATE TABLE taskImage(taskId TEXT,imageId TEXT,PRIMARY KEY(taskId,imageId));
    INSERT INTO organisation VALUES('org','hub');
    INSERT INTO project VALUES('project','org');
    INSERT INTO feature VALUES('feature','project');
    INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed) VALUES('one','feature','project','org','author',1,0),('two','feature','project','org','author',1,0);`)
  const data = ImageInsertWithFeatureAPI.parse({
    publicId: 'h/feature/upload',
    env: 'local',
    cdn: 'cloudflareR2',
    contributorId: 'author',
    ctxType: 'feature',
    ctxId: 'feature',
    version: 1000,
    featureImage: { featureId: 'feature', intent: 'undefined', isPublished: false },
  })
  return { db: db as unknown as Database, sqlite, data }
}

describe('atomic Feature upload confirmation', () => {
  it.each(['hub', null])(
    'commits under unchanged ancestry with hub %s',
    async hubId => {
      const { db, sqlite, data } = setup()
      try {
        sqlite.prepare('UPDATE organisation SET hubId=?').run(hubId)
        const scope = (await getFeatureImageCreationScope(db, 'feature'))!
        expect(scope).toEqual({ projectId: 'project', organisationId: 'org', hubId })
        expect(
          (
            await createUploadedFeatureImage(
              db,
              data,
              [],
              undefined,
              'new-image',
              scope,
            )
          )?.image.id,
        ).toBe('new-image')
      } finally {
        sqlite.close()
      }
    },
  )

  it.each([
    "INSERT INTO project VALUES('other','org'); UPDATE feature SET projectId='other'",
    "INSERT INTO organisation VALUES('other','hub'); UPDATE project SET organisationId='other'",
    "UPDATE organisation SET hubId='other'",
  ])('rejects creation after authorized ancestry changes: %s', async change => {
    const { db, sqlite, data } = setup()
    try {
      const scope = (await getFeatureImageCreationScope(db, 'feature'))!
      sqlite.exec(change)
      expect(
        await createUploadedFeatureImage(db, data, [], undefined, 'stale-image', scope),
      ).toBeNull()
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM image').get()).toEqual({
        count: 0,
      })
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM featureImage').get(),
      ).toEqual({ count: 0 })
    } finally {
      sqlite.close()
    }
  })

  it('rejects ancestry changed inside the transaction and rolls back all writes', async () => {
    const { db, sqlite, data } = setup()
    try {
      const scope = (await getFeatureImageCreationScope(db, 'feature'))!
      sqlite.exec(
        "CREATE TRIGGER move_after_insert AFTER INSERT ON image BEGIN UPDATE organisation SET hubId='other'; END",
      )
      expect(
        await createUploadedFeatureImage(db, data, [], undefined, 'stale-image', scope),
      ).toBeNull()
      expect(await getFeatureImageCreationScope(db, 'feature')).toEqual(scope)
      expect(sqlite.prepare('SELECT COUNT(*) AS count FROM image').get()).toEqual({
        count: 0,
      })
    } finally {
      sqlite.close()
    }
  })

  it('rolls back a fresh legacy image when its association is skipped', async () => {
    const { db, sqlite, data } = setup()
    try {
      sqlite.exec(
        'CREATE TRIGGER skip_legacy BEFORE INSERT ON featureImage BEGIN SELECT RAISE(IGNORE); END',
      )
      expect(
        await createUploadedFeatureImage(db, data, [], undefined, 'legacy-new'),
      ).toBeNull()
      expect(
        sqlite.prepare("SELECT id FROM image WHERE id='legacy-new'").get(),
      ).toBeUndefined()
    } finally {
      sqlite.close()
    }
  })

  it('preserves fresh legacy identity semantics for repeated storage keys', async () => {
    const { db, sqlite, data } = setup()
    try {
      expect(
        (await createUploadedFeatureImage(db, data, [], undefined, 'legacy-one'))?.image
          .id,
      ).toBe('legacy-one')
      expect(
        (await createUploadedFeatureImage(db, data, [], undefined, 'legacy-two'))?.image
          .id,
      ).toBe('legacy-two')
      expect(
        sqlite.prepare('SELECT COUNT(*) AS count FROM featureImage').get(),
      ).toEqual({ count: 2 })
    } finally {
      sqlite.close()
    }
  })

  it.each([
    "UPDATE task SET isDraft=0 WHERE id='two'",
    "UPDATE task SET isReviewed=1 WHERE id='two'",
    "UPDATE task SET contributorId='another' WHERE id='two'",
    "UPDATE task SET featureId='another' WHERE id='two'",
    "UPDATE task SET projectId='another' WHERE id='two'",
    "UPDATE task SET organisationId='another' WHERE id='two'",
    "UPDATE feature SET projectId='another'",
    "UPDATE project SET organisationId='another'",
    "DELETE FROM task WHERE id='two'",
  ])(
    'rejects changed draft authorization without leaving an image: %s',
    async change => {
      const { db, sqlite, data } = setup()
      try {
        sqlite.exec(change)
        expect(
          await createUploadedFeatureImage(db, data, ['one', 'two'], 'author'),
        ).toBeNull()
        for (const table of ['image', 'featureImage', 'taskImage'])
          expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )

  it('reuses one upload identity and preserves reviewed metadata on replay', async () => {
    const { db, sqlite, data } = setup()
    try {
      const created = await createUploadedFeatureImage(
        db,
        data,
        ['one', 'two', 'one'],
        'author',
      )
      expect(created?.image.version).toBe(1000)
      expect(created?.featureImage.isPublished).toBe(false)
      sqlite.exec("UPDATE featureImage SET intent='canonical',isPublished=1")
      const replay = await createUploadedFeatureImage(
        db,
        { ...data, version: 2000 },
        ['one', 'two'],
        'author',
      )
      expect(replay?.image.id).toBe(created?.image.id)
      expect(replay?.image.version).toBe(1000)
      expect(replay?.featureImage).toMatchObject({
        intent: 'canonical',
        isPublished: true,
      })
      expect(sqlite.prepare('SELECT * FROM image').all()).toHaveLength(1)
      expect(sqlite.prepare('SELECT * FROM featureImage').all()).toHaveLength(1)
      expect(sqlite.prepare('SELECT * FROM taskImage').all()).toHaveLength(2)
      sqlite.exec("UPDATE image SET contributorId='other'")
      expect(await createUploadedFeatureImage(db, data, ['one'], 'author')).toBeNull()
      sqlite.exec("UPDATE image SET contributorId='author',isArchived=1")
      expect(await createUploadedFeatureImage(db, data, ['one'], 'author')).toBeNull()
    } finally {
      sqlite.close()
    }
  })

  it.each(['featureImage', 'taskImage'])(
    'rolls back earlier writes if %s insertion fails',
    async table => {
      const { db, sqlite, data } = setup()
      try {
        sqlite.exec(
          `CREATE TRIGGER fail BEFORE INSERT ON ${table} ${table === 'taskImage' ? "WHEN NEW.taskId='two'" : ''} BEGIN SELECT RAISE(ABORT,'attachment failed'); END`,
        )
        await expect(
          createUploadedFeatureImage(db, data, ['one', 'two'], 'author'),
        ).rejects.toThrow()
        for (const name of ['image', 'featureImage', 'taskImage'])
          expect(sqlite.prepare(`SELECT * FROM ${name}`).all()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )

  it.each(['featureImage', 'taskImage'])(
    'rolls back silently skipped %s writes',
    async table => {
      const { db, sqlite, data } = setup()
      try {
        sqlite.exec(
          `CREATE TRIGGER skip BEFORE INSERT ON ${table} BEGIN SELECT RAISE(IGNORE); END`,
        )
        expect(await createUploadedFeatureImage(db, data, ['one'], 'author')).toBeNull()
        for (const name of ['image', 'featureImage', 'taskImage'])
          expect(sqlite.prepare(`SELECT * FROM ${name}`).all()).toEqual([])
      } finally {
        sqlite.close()
      }
    },
  )

  it('rolls back a new image when another upload already occupies the canonical slot', async () => {
    const { db, sqlite, data } = setup()
    try {
      const canonical = {
        ...data,
        featureImage: { ...data.featureImage, intent: 'canonical' },
      }
      const first = await createUploadedFeatureImage(db, canonical, [])
      await expect(
        createUploadedFeatureImage(
          db,
          { ...canonical, publicId: 'another-upload' },
          [],
        ),
      ).rejects.toThrow()
      expect(sqlite.prepare('SELECT id FROM image').all()).toEqual([
        { id: first!.image.id },
      ])
      expect(sqlite.prepare('SELECT * FROM featureImage').all()).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })

  it('rechecks task state after writes before committing', async () => {
    const { db, sqlite, data } = setup()
    try {
      sqlite.exec(
        'CREATE TRIGGER submit AFTER INSERT ON taskImage BEGIN UPDATE task SET isDraft=0 WHERE id=NEW.taskId; END',
      )
      expect(await createUploadedFeatureImage(db, data, ['one'], 'author')).toBeNull()
      expect(sqlite.prepare('SELECT * FROM image').all()).toEqual([])
      expect(sqlite.prepare("SELECT isDraft FROM task WHERE id='one'").get()).toEqual({
        isDraft: 1,
      })
    } finally {
      sqlite.close()
    }
  })

  it('permits authorized admin attachment to submitted unreviewed tasks', async () => {
    const { db, sqlite, data } = setup()
    try {
      sqlite.exec('UPDATE task SET isDraft=0')
      expect(await createUploadedFeatureImage(db, data, ['one'])).not.toBeNull()
      expect(sqlite.prepare('SELECT * FROM taskImage').all()).toHaveLength(1)
    } finally {
      sqlite.close()
    }
  })

  it('advances evidence revisions monotonically only for new task links', async () => {
    const { db, sqlite, data } = setup()
    try {
      sqlite.exec("UPDATE task SET modifiedAt='2999-01-01T00:00:00.000Z'")
      await createUploadedFeatureImage(db, data, ['one'], 'author')
      const revisions = () =>
        sqlite.prepare('SELECT id,modifiedAt FROM task ORDER BY id').all()
      expect(revisions()).toEqual([
        { id: 'one', modifiedAt: '2999-01-01T00:00:00.001Z' },
        { id: 'two', modifiedAt: '2999-01-01T00:00:00.000Z' },
      ])
      const beforeRetry = revisions()
      await createUploadedFeatureImage(db, data, ['one'], 'author')
      expect(revisions()).toEqual(beforeRetry)
      await createUploadedFeatureImage(
        db,
        { ...data, publicId: 'second-image' },
        ['one'],
        'author',
      )
      expect(revisions()[0].modifiedAt).toBe('2999-01-01T00:00:00.002Z')
    } finally {
      sqlite.close()
    }
  })

  it('requires an owned task for contributor access but supports ordinary Feature uploads', async () => {
    const { db, sqlite, data } = setup()
    try {
      expect(await createUploadedFeatureImage(db, data, [], 'author')).toBeNull()
      expect(await createUploadedFeatureImage(db, data, [])).not.toBeNull()
    } finally {
      sqlite.close()
    }
  })

  it('keeps 250 task attachments atomic and within the binding limit', async () => {
    const { db, sqlite, data } = setup()
    try {
      const ids = Array.from({ length: 250 }, (_, index) => `task-${index}`)
      const insert = sqlite.prepare(
        "INSERT INTO task(id,featureId,projectId,organisationId,contributorId,isDraft,isReviewed) VALUES(?,'feature','project','org','author',1,0)",
      )
      for (const id of ids) insert.run(id)
      const batch = db.batch.bind(db)
      const spy = vi.spyOn(db, 'batch').mockImplementation(async statements => {
        for (const statement of statements)
          expect(
            (statement as unknown as { toSQL(): { params: unknown[] } }).toSQL().params
              .length,
          ).toBeLessThanOrEqual(100)
        return batch(statements)
      })
      expect(await createUploadedFeatureImage(db, data, ids, 'author')).not.toBeNull()
      expect(spy).toHaveBeenCalledOnce()
      expect(sqlite.prepare('SELECT * FROM taskImage').all()).toHaveLength(250)
    } finally {
      sqlite.close()
    }
  })
  it('rolls back uploaded evidence when a task revision update is skipped', async () => {
    const { db, sqlite, data } = setup()
    try {
      const before = sqlite.prepare('SELECT * FROM task').all()
      sqlite.exec(
        "CREATE TRIGGER skip_revision BEFORE UPDATE ON task WHEN NEW.id='two' BEGIN SELECT RAISE(IGNORE); END",
      )
      expect(
        await createUploadedFeatureImage(db, data, ['one', 'two'], 'author'),
      ).toBeNull()
      expect(sqlite.prepare('SELECT * FROM task').all()).toEqual(before)
      for (const table of ['image', 'featureImage', 'taskImage'])
        expect(sqlite.prepare(`SELECT * FROM ${table}`).all()).toEqual([])
    } finally {
      sqlite.close()
    }
  })
})
