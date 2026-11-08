// TESTS
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { eq, getTableColumns } from 'drizzle-orm'
// DB
import { image } from '#lib/db/schema/image.js'
import { imageUpload } from '#lib/db/schema/imageUpload.js'
import { user } from '#lib/db/schema/user.js'
import { executeRevisionBatch } from '#lib/db/services/revisionBatch.js'
import {
  createUploadedResourceImage,
  getResourceUploadSnapshot,
} from '#lib/db/services/resourceImageUpload.js'
import {
  stageImageUpload,
  loadStagedImageUpload,
  discardStagedImageUpload,
  getUserImageUploadSnapshot,
  prepareUserImageAttachment,
} from '#lib/db/services/singleImageUpload.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

/** Build a disposable database with the real staging migration and D1 adapter.
 * @returns Fixture and verified upload inputs.
 */
function setup() {
  const { db: adapter, sqlite } = publicationSqlite({})
  for (const [name, table] of [
    ['image', image],
    ['user', user],
  ] as const) {
    const columns = Object.values(getTableColumns(table))
      .map(c => `"${c.name}" ${c.getSQLType()}`)
      .join(',')
    sqlite.exec(`CREATE TABLE "${name}" (${columns}, PRIMARY KEY(id))`)
  }
  sqlite.exec(readFileSync('migrations/0206_image_upload_attachment.sql', 'utf8'))
  sqlite.exec(`CREATE TABLE hub(id TEXT PRIMARY KEY,imageId TEXT,modifiedAt TEXT);
    CREATE TABLE organisation(id TEXT PRIMARY KEY,hubId TEXT,imageId TEXT,modifiedAt TEXT);
    CREATE TABLE project(id TEXT PRIMARY KEY,organisationId TEXT,imageId TEXT,modifiedAt TEXT);
    INSERT INTO hub VALUES('hub',NULL,'2026-01-01');
    INSERT INTO organisation VALUES('organisation','hub',NULL,'2026-01-01');
    INSERT INTO project VALUES('project','organisation',NULL,'2026-01-01');
    INSERT INTO user(id,image,updatedAt) VALUES('user','https://external.invalid/avatar',1000);`)
  const db = adapter as unknown as Database
  const data = {
    presentationMode: 'contain' as const,
    contributorId: 'actor',
    publicId: 'h/upload',
    env: 'local' as const,
    cdn: 'cloudflareR2' as const,
    version: 1000,
  }
  return { db, sqlite, data }
}

describe.each(['user', 'project', 'organisation', 'hub'] as const)(
  '%s shared upload lifecycle',
  ctxType => {
    it('stages once without selection, binds actor/destination, and prevents canceled replay', async () => {
      const { db, sqlite, data } = setup()
      try {
        const snapshot =
          ctxType === 'user'
            ? await getUserImageUploadSnapshot(db, ctxType)
            : await getResourceUploadSnapshot(db, ctxType, ctxType)
        const input = {
          data,
          actorId: 'actor',
          ctxType,
          ctxId: ctxType,
          snapshot: snapshot!,
          expiresAt: Date.now() + 60000,
        }
        const receipt = await stageImageUpload(db, input)
        expect(sqlite.prepare('SELECT count(*) AS n FROM image').get()?.n).toBe(0)
        expect(
          (await stageImageUpload(db, { ...input, data: { ...data, version: 2000 } }))
            .data.version,
        ).toBe(1000)
        await expect(
          loadStagedImageUpload(db, receipt.imageId, 'other', ctxType, ctxType),
        ).rejects.toMatchObject({ status: 409 })
        await expect(
          loadStagedImageUpload(db, receipt.imageId, 'actor', ctxType, 'other'),
        ).rejects.toMatchObject({ status: 409 })
        expect(await discardStagedImageUpload(db, receipt.imageId, 'other')).toBeNull()
        expect(
          await discardStagedImageUpload(db, receipt.imageId, 'actor'),
        ).toMatchObject({ state: 'discarded' })
        await expect(stageImageUpload(db, input)).rejects.toMatchObject({ status: 409 })
      } finally {
        sqlite.close()
      }
    })
  },
)

describe('avatar attachment transaction', () => {
  it.each(['success', 'cancel', 'expire', 'stale', 'skip'] as const)(
    'handles %s between preparation and save atomically',
    async outcome => {
      const { db, sqlite, data } = setup()
      try {
        const receipt = await stageImageUpload(db, {
          data,
          actorId: 'actor',
          ctxType: 'user',
          ctxId: 'user',
          snapshot: (await getUserImageUploadSnapshot(db, 'user'))!,
          expiresAt: Date.now() + 60000,
        })
        const plan = prepareUserImageAttachment(db, receipt, 'http://localhost:4173')
        if (outcome === 'cancel')
          await discardStagedImageUpload(db, receipt.imageId, 'actor')
        if (outcome === 'expire')
          await db
            .update(imageUpload)
            .set({ expiresAt: 1 })
            .where(eq(imageUpload.imageId, receipt.imageId))
        if (outcome === 'stale')
          sqlite.exec("UPDATE user SET image='newer',updatedAt=2000")
        if (outcome === 'skip')
          sqlite.exec(
            'CREATE TRIGGER skip_avatar BEFORE UPDATE ON user BEGIN SELECT RAISE(IGNORE); END',
          )
        const saved = await executeRevisionBatch(db, plan.guard, [
          ...plan.before,
          db.update(user).set({ image: plan.url }).where(eq(user.id, 'user')),
          ...plan.after,
        ])
        expect(saved !== null).toBe(outcome === 'success')
        expect(sqlite.prepare('SELECT count(*) AS n FROM image').get()?.n).toBe(
          outcome === 'success' ? 1 : 0,
        )
        if (outcome === 'success') {
          expect(sqlite.prepare('SELECT image FROM user').get()?.image).toBe(plan.url)
          expect(
            await discardStagedImageUpload(db, receipt.imageId, 'actor'),
          ).toBeNull()
          const replay = await loadStagedImageUpload(
            db,
            receipt.imageId,
            'actor',
            'user',
            'user',
          )
          sqlite.exec("UPDATE user SET image='newer'")
          expect(
            await executeRevisionBatch(
              db,
              prepareUserImageAttachment(db, replay, 'http://localhost:4173').guard,
              [],
            ),
          ).toBeNull()
        }
      } finally {
        sqlite.close()
      }
    },
  )
})

describe.each(['project', 'organisation', 'hub'] as const)(
  '%s deferred attachment',
  ctxType => {
    it('attaches and consumes its receipt atomically, then rejects resurrection', async () => {
      const { db, sqlite, data } = setup()
      try {
        const receipt = await stageImageUpload(db, {
          data,
          actorId: 'actor',
          ctxType,
          ctxId: ctxType,
          snapshot: (await getResourceUploadSnapshot(db, ctxType, ctxType))!,
          expiresAt: Date.now() + 60000,
        })
        const attach = () =>
          createUploadedResourceImage(
            db,
            ctxType,
            ctxType,
            receipt.data,
            receipt.snapshot,
            receipt.imageId,
            undefined,
            undefined,
            receipt,
          )
        expect(await attach()).toMatchObject({ id: receipt.imageId })
        expect(await attach()).toMatchObject({ id: receipt.imageId })
        expect(await discardStagedImageUpload(db, receipt.imageId, 'actor')).toBeNull()
        sqlite.exec(`UPDATE ${ctxType} SET imageId=NULL,modifiedAt='newer'`)
        expect(await attach()).toBeNull()
      } finally {
        sqlite.close()
      }
    })
  },
)

it('retires a replaced avatar only after selection and keeps cancellation from deleting the new one', async () => {
  const { db, sqlite, data } = setup()
  try {
    const attach = async (publicId: string) => {
      const receipt = await stageImageUpload(db, {
        data: { ...data, publicId },
        actorId: 'actor',
        ctxType: 'user',
        ctxId: 'user',
        snapshot: (await getUserImageUploadSnapshot(db, 'user'))!,
        expiresAt: Date.now() + 60000,
      })
      const plan = prepareUserImageAttachment(db, receipt, 'http://localhost:4173')
      expect(
        await executeRevisionBatch(db, plan.guard, [
          ...plan.before,
          db.update(user).set({ image: plan.url }).where(eq(user.id, 'user')),
          ...plan.after,
        ]),
      ).not.toBeNull()
      return receipt
    }
    const first = await attach('h/first')
    const second = await attach('h/second')
    expect(
      sqlite.prepare('SELECT state FROM imageUpload WHERE imageId=?').get(first.imageId)
        ?.state,
    ).toBe('discarded')
    expect(await discardStagedImageUpload(db, second.imageId, 'actor')).toBeNull()
    await expect(
      loadStagedImageUpload(db, first.imageId, 'actor', 'user', 'user'),
    ).rejects.toMatchObject({ status: 409 })
  } finally {
    sqlite.close()
  }
})
