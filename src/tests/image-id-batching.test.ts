// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { eq, getTableColumns } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { image } from '$lib/db/schema'
import { getImagesByIds } from '$lib/db/services/image'
import type { Database } from '$lib/types'

describe('bounded image ID reads', () => {
  it('budgets filters, deduplicates input IDs, and retains shared assignments', async () => {
    const sqlite = new DatabaseSync(':memory:')
    const parameterCounts: number[] = []
    try {
      const columns = Object.values(getTableColumns(image)).map(
        column =>
          `"${column.name}" ${column.name === 'isArchived' ? 'INTEGER' : 'TEXT'}`,
      )
      sqlite.exec(`CREATE TABLE image (${columns.join(',')});
        CREATE TABLE featureImage (featureId TEXT, imageId TEXT, intent TEXT, isPublished INTEGER, publishedAt TEXT, publisherId TEXT);
        CREATE TABLE feature (id TEXT, organisationId TEXT, projectId TEXT, layerId TEXT);
        CREATE TABLE user (id TEXT, attribution TEXT);
        INSERT INTO feature VALUES ('a', 'org', 'project', 'layer'), ('b', 'org', 'project', 'layer');
        INSERT INTO featureImage VALUES ('a', 'image-0', 'canonical', 1, NULL, NULL), ('b', 'image-0', 'general', 1, NULL, NULL);`)
      const ids = Array.from({ length: 121 }, (_, index) => `image-${index}`)
      const insert = sqlite.prepare('INSERT INTO image (id, isArchived) VALUES (?, ?)')
      ids.forEach((id, index) => {
        insert.run(id, index === 120 ? 1 : 0)
      })
      const db = drizzle({
        prepare: (sql: string) => ({
          bind: (...params: unknown[]) => ({
            raw: async () => {
              parameterCounts.push(params.length)
              expect(params.length).toBeLessThanOrEqual(100)
              const statement = sqlite.prepare(sql)
              statement.setReturnArrays(true)
              return statement.all(...(params as never[]))
            },
          }),
        }),
      } as never) as Database
      await expect(getImagesByIds(db, [])).resolves.toEqual([])
      expect(parameterCounts).toEqual([])
      const rows = await getImagesByIds(
        db,
        [...ids, ...ids],
        [eq(image.isArchived, false)],
      )
      expect(parameterCounts).toEqual([100, 23])
      expect(rows).toHaveLength(121)
      expect(rows.some(row => row.id === 'image-120')).toBe(false)
      expect(
        rows.filter(row => row.id === 'image-0').map(row => row.featureId),
      ).toEqual(['a', 'b'])
    } finally {
      sqlite.close()
    }
  })
})
