// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { describe, expect, it } from 'vitest'
import { createTaskImagesFromImageIds } from '$lib/db/services/image'
import type { Database } from '$lib/types'

describe('task image attachment', () => {
  it('handles empty input, duplicates, and retries within the SQL parameter budget', async () => {
    const sqlite = new DatabaseSync(':memory:')
    const parameterCounts: number[] = []
    try {
      sqlite.exec(`CREATE TABLE taskImage (
        taskId TEXT NOT NULL, imageId TEXT NOT NULL, PRIMARY KEY (taskId, imageId));`)
      const db = drizzle({
        prepare: (sql: string) => ({
          bind: (...params: unknown[]) => ({
            run: async () => {
              parameterCounts.push(params.length)
              expect(params.length).toBeLessThanOrEqual(100)
              return sqlite.prepare(sql).run(...(params as never[]))
            },
          }),
        }),
      } as never) as Database
      await createTaskImagesFromImageIds(db, 'task', [])
      expect(parameterCounts).toEqual([])
      const ids = Array.from({ length: 125 }, (_, index) => `image-${index}`)
      await createTaskImagesFromImageIds(db, 'task', [...ids, ...ids])
      await createTaskImagesFromImageIds(db, 'task', ids)
      expect(parameterCounts).toEqual([100, 100, 50, 100, 100, 50])
      expect(sqlite.prepare('SELECT count(*) AS count FROM taskImage').get()).toEqual({
        count: 125,
      })
      await createTaskImagesFromImageIds(db, 'other-task', [ids[0]])
      expect(sqlite.prepare('SELECT count(*) AS count FROM taskImage').get()).toEqual({
        count: 126,
      })
    } finally {
      sqlite.close()
    }
  })
})
