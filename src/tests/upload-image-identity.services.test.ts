// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { image } from '$lib/db/schema'
import { createUploadedImage, createFeatureImage } from '$lib/db/services/image'
import type { Database } from '$lib/types'

describe('direct upload image identity', () => {
  it('converges concurrent confirmations and preserves existing moderation state', async () => {
    const sqlite = new DatabaseSync(':memory:')
    try {
      const columns = Object.values(getTableColumns(image)).map(
        column =>
          `"${column.name}" ${['version', 'isArchived', 'localIsArchived'].includes(column.name) ? 'INTEGER' : 'TEXT'}${column.name === 'id' ? ' PRIMARY KEY' : ''}`,
      )
      sqlite.exec(`CREATE TABLE image (${columns.join(',')});
        CREATE TABLE featureImage (
          featureId TEXT, imageId TEXT, intent TEXT, isPublished INTEGER,
          localIsPublished INTEGER, publishedAt TEXT, publisherId TEXT,
          PRIMARY KEY(featureId, imageId));`)
      const db = drizzle({
        prepare: (sql: string) => ({
          bind: (...params: unknown[]) => ({
            raw: async () =>
              sqlite
                .prepare(sql)
                .all(...(params as never[]))
                .map(row => Object.values(row)),
            run: async () => sqlite.prepare(sql).run(...(params as never[])),
          }),
        }),
      } as never) as Database
      const data = {
        publicId: 'h/features/feature/upload',
        env: 'local',
        version: 1,
      } as const
      const results = await Promise.all(
        Array.from({ length: 4 }, () => createUploadedImage(db, data)),
      )
      expect(new Set(results.map(row => row.id)).size).toBe(1)
      const id = results[0].id
      sqlite.prepare('UPDATE image SET isArchived = 1 WHERE id = ?').run(id)
      const retried = await createUploadedImage(db, {
        ...data,
        version: 2,
        isArchived: false,
      })
      expect(retried).toMatchObject({ id, version: 1, isArchived: true })
      await createFeatureImage(
        db,
        { featureId: 'feature', intent: 'canonical', isPublished: true } as never,
        id,
        true,
      )
      const assignment = await createFeatureImage(
        db,
        { featureId: 'feature', intent: 'undefined', isPublished: false } as never,
        id,
        true,
      )
      expect(assignment).toMatchObject({ intent: 'canonical', isPublished: true })
      const otherStage = await createUploadedImage(db, { ...data, env: 'preview' })
      expect(otherStage.id).not.toBe(id)
      expect(sqlite.prepare('SELECT count(*) AS count FROM image').get()).toEqual({
        count: 2,
      })
    } finally {
      sqlite.close()
    }
  })
})
