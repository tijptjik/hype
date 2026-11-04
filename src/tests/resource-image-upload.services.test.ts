// TESTS
import { describe, expect, it } from 'vitest'
// DRIZZLE
import { getTableColumns } from 'drizzle-orm'
// DB
import { image } from '#lib/db/schema/image.js'
import {
  createUploadedResourceImage,
  getResourceUploadSnapshot,
  type ResourceUploadType,
} from '#lib/db/services/resourceImageUpload.js'
import { ImageInsertWithHubAPI } from '#lib/db/zod/schema/image.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

/**
 * Builds a disposable resource hierarchy with real image column defaults from Drizzle.
 * @returns Database fixture and upload metadata.
 */
function setup() {
  const { db, sqlite } = publicationSqlite({})
  const columns = Object.values(getTableColumns(image))
    .map(column => `"${column.name}" ${column.getSQLType()}`)
    .join(',')
  sqlite.exec(`CREATE TABLE image(${columns}, PRIMARY KEY(id));
    CREATE TABLE hub(id TEXT PRIMARY KEY,imageId TEXT,modifiedAt TEXT);
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,imageId TEXT,modifiedAt TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,imageId TEXT,modifiedAt TEXT);
    INSERT INTO hub VALUES('hub',NULL,'2099-01-01T00:00:00.000Z');
    INSERT INTO organisation VALUES('organisation','hub',NULL,'2099-01-01T00:00:00.000Z');
    INSERT INTO project VALUES('project','organisation',NULL,'2099-01-01T00:00:00.000Z');`)
  const data = ImageInsertWithHubAPI.parse({
    publicId: 'h/upload',
    env: 'local',
    cdn: 'cloudflareR2',
    contributorId: 'author',
    ctxType: 'hub',
    ctxId: 'hub',
    version: 1000,
  })
  return { db: db as unknown as Database, sqlite, data }
}

describe.each<ResourceUploadType>(['project', 'organisation', 'hub'])(
  '%s upload transaction',
  type => {
    it('creates distinct legacy identities and rejects a competing pointer update atomically', async () => {
      const { db, sqlite, data } = setup()
      try {
        const before = (await getResourceUploadSnapshot(db, type, type))!
        const first = await createUploadedResourceImage(
          db,
          type,
          type,
          data,
          before,
          'legacy-first',
        )
        expect(first?.id).toBe('legacy-first')
        expect(
          await createUploadedResourceImage(
            db,
            type,
            type,
            data,
            before,
            'legacy-competing',
          ),
        ).toBeNull()
        expect(
          sqlite.prepare("SELECT id FROM image WHERE id='legacy-competing'").get(),
        ).toBeUndefined()
        const current = (await getResourceUploadSnapshot(db, type, type))!
        const second = await createUploadedResourceImage(
          db,
          type,
          type,
          data,
          current,
          'legacy-second',
        )
        expect(second?.id).toBe('legacy-second')
        expect((await getResourceUploadSnapshot(db, type, type))!.imageId).toBe(
          'legacy-second',
        )
      } finally {
        sqlite.close()
      }
    })

    it('rolls back a legacy image when pointer selection is skipped', async () => {
      const { db, sqlite, data } = setup()
      try {
        const before = (await getResourceUploadSnapshot(db, type, type))!
        sqlite.exec(
          `CREATE TRIGGER skip_pointer BEFORE UPDATE ON ${type} BEGIN SELECT RAISE(IGNORE); END`,
        )
        expect(
          await createUploadedResourceImage(
            db,
            type,
            type,
            data,
            before,
            'legacy-skipped',
          ),
        ).toBeNull()
        expect(
          sqlite.prepare("SELECT id FROM image WHERE id='legacy-skipped'").get(),
        ).toBeUndefined()
        expect(await getResourceUploadSnapshot(db, type, type)).toEqual(before)
      } finally {
        sqlite.close()
      }
    })

    it('commits together, preserves metadata and revision on replay, rejects an old upload after cleanup', async () => {
      const { db, sqlite, data } = setup()
      try {
        const before = (await getResourceUploadSnapshot(db, type, type))!
        const first = await createUploadedResourceImage(db, type, type, data, before)
        expect(first?.id).toBeTruthy()
        const after = (await getResourceUploadSnapshot(db, type, type))!
        expect(after.imageId).toBe(first!.id)
        expect(after.modifiedAt > before.modifiedAt).toBe(true)
        const replay = await createUploadedResourceImage(
          db,
          type,
          type,
          { ...data, version: 2000 },
          before,
        )
        expect(replay?.version).toBe(1000)
        expect(await getResourceUploadSnapshot(db, type, type)).toEqual(after)
        // A competing grant from the old revision cannot displace the first winner.
        expect(
          await createUploadedResourceImage(
            db,
            type,
            type,
            { ...data, publicId: 'h/competitor' },
            before,
          ),
        ).toBeNull()
        const next = await createUploadedResourceImage(
          db,
          type,
          type,
          { ...data, publicId: 'h/next' },
          after,
        )
        expect(next?.id).toBeTruthy()
        expect(
          await createUploadedResourceImage(db, type, type, data, before),
        ).toBeNull()
        sqlite.prepare('DELETE FROM image WHERE id=?').run(first!.id)
        expect(
          await createUploadedResourceImage(db, type, type, data, before),
        ).toBeNull()
        expect((await getResourceUploadSnapshot(db, type, type))?.imageId).toBe(
          next!.id,
        )
        expect(sqlite.prepare('SELECT id FROM image').all()).toEqual([{ id: next!.id }])
      } finally {
        sqlite.close()
      }
    })

    it.each(['deleted', 'revision', 'pointer', 'skip', 'failure', 'image-skip'])(
      'rolls back on %s target',
      async change => {
        const { db, sqlite, data } = setup()
        try {
          const before = (await getResourceUploadSnapshot(db, type, type))!
          if (change === 'deleted') sqlite.exec(`DELETE FROM ${type}`)
          if (change === 'revision')
            sqlite.exec(`UPDATE ${type} SET modifiedAt='changed'`)
          if (change === 'pointer') sqlite.exec(`UPDATE ${type} SET imageId='another'`)
          if (change === 'skip' || change === 'failure')
            sqlite.exec(
              `CREATE TRIGGER stop_write BEFORE UPDATE ON ${type} BEGIN SELECT RAISE(${change === 'skip' ? 'IGNORE' : "ABORT, 'forced failure'"}); END`,
            )
          if (change === 'image-skip')
            sqlite.exec(
              'CREATE TRIGGER stop_image BEFORE INSERT ON image BEGIN SELECT RAISE(IGNORE); END',
            )
          const confirmation = createUploadedResourceImage(db, type, type, data, before)
          if (change === 'failure') await expect(confirmation).rejects.toThrow()
          else expect(await confirmation).toBeNull()
          expect(sqlite.prepare('SELECT * FROM image').all()).toEqual([])
        } finally {
          sqlite.close()
        }
      },
    )

    it('rejects archived or altered stored identities without reselecting them', async () => {
      const { db, sqlite, data } = setup()
      try {
        const before = (await getResourceUploadSnapshot(db, type, type))!
        await createUploadedResourceImage(db, type, type, data, before)
        sqlite.exec('UPDATE image SET isArchived=1')
        expect(
          await createUploadedResourceImage(db, type, type, data, before),
        ).toBeNull()
        sqlite.exec("UPDATE image SET isArchived=0,publicId='changed'")
        expect(
          await createUploadedResourceImage(db, type, type, data, before),
        ).toBeNull()
      } finally {
        sqlite.close()
      }
    })
  },
)

it.each<ResourceUploadType>(['project', 'organisation'])(
  'rejects %s scope changes on new confirmation and replay',
  async type => {
    const { db, sqlite, data } = setup()
    try {
      const before = (await getResourceUploadSnapshot(db, type, type))!
      await createUploadedResourceImage(db, type, type, data, before)
      sqlite.exec("UPDATE organisation SET hubId='another'")
      expect(await createUploadedResourceImage(db, type, type, data, before)).toBeNull()
      expect(
        await createUploadedResourceImage(
          db,
          type,
          type,
          { ...data, publicId: 'h/new' },
          before,
        ),
      ).toBeNull()
    } finally {
      sqlite.close()
    }
  },
)

it.each(["UPDATE project SET organisationId='other'", 'DELETE FROM organisation'])(
  'rejects changed project ancestry: %s',
  async change => {
    const { db, sqlite, data } = setup()
    try {
      const before = (await getResourceUploadSnapshot(db, 'project', 'project'))!
      sqlite.exec("INSERT INTO organisation VALUES('other','hub',NULL,'revision')")
      sqlite.exec(change)
      expect(
        await createUploadedResourceImage(db, 'project', 'project', data, before),
      ).toBeNull()
      expect(sqlite.prepare('SELECT * FROM image').all()).toEqual([])
    } finally {
      sqlite.close()
    }
  },
)
