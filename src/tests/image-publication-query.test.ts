// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { image, featureImage, taskImage } from '$lib/db/schema'
import {
  getImageEntityQueryContext,
  getImageQueryContext,
} from '$lib/api/services/image'
import { ImageContextResourceExtended } from '$lib/enums'

describe('public image query filtering', () => {
  it.each([false, true])(
    'filters unpublished assignments only outside admin mode (%s)',
    isAdmin => {
      const sqlite = new DatabaseSync(':memory:')
      try {
        sqlite.exec(`CREATE TABLE image (id TEXT, isArchived INTEGER);
        CREATE TABLE featureImage (featureId TEXT, imageId TEXT, isPublished INTEGER);
        CREATE TABLE taskImage (taskId TEXT, imageId TEXT);
        INSERT INTO image VALUES ('published', 0), ('pending', 0), ('unlinked', 0);
        INSERT INTO featureImage VALUES ('feature', 'published', 1), ('feature', 'pending', 0);
        INSERT INTO taskImage VALUES ('task', 'published'), ('task', 'pending'), ('task', 'unlinked');`)
        const db = drizzle({} as never)
        const user = { id: 'account', superAdmin: false } as never
        const single = getImageEntityQueryContext(user, isAdmin, {})
        const task = getImageQueryContext(
          user,
          isAdmin,
          {},
          'task',
          ImageContextResourceExtended.task,
        )
        for (const [conditions, expected] of [
          [
            single.conditions,
            isAdmin ? ['pending', 'published', 'unlinked'] : ['published', 'unlinked'],
          ],
          [
            task.conditions,
            isAdmin ? ['pending', 'published', 'unlinked'] : ['published'],
          ],
        ] as const) {
          const query = db
            .select({ id: image.id })
            .from(image)
            .leftJoin(featureImage, eq(featureImage.imageId, image.id))
            .innerJoin(taskImage, eq(taskImage.imageId, image.id))
            .where(and(...conditions))
            .orderBy(image.id)
            .toSQL()
          expect(sqlite.prepare(query.sql).all(...(query.params as never[]))).toEqual(
            expected.map(id => ({ id })),
          )
        }
      } finally {
        sqlite.close()
      }
    },
  )
})
