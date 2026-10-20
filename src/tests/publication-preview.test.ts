import { describe, expect, test } from 'vitest'
import { publicationSqlite } from './fixtures/publicationSqlite'
import { integer, sqliteTable } from 'drizzle-orm/sqlite-core'
import { descendantPublicationState } from '../lib/db/services/publication'
import {
  parsePublicationPreview,
  publicationPreviewUrl,
} from '../lib/publication/preview'

const rows = sqliteTable('rows', {
  isPublished: integer({ mode: 'boolean' }).notNull(),
  localIsPublished: integer({ mode: 'boolean' }),
})

describe('publication preview intent', () => {
  test('round trips each resource and descendant choice', () => {
    for (const type of ['organisation', 'project', 'layer'] as const)
      for (const publishChildren of [false, true]) {
        const intent = { type, id: 'saved-resource', publishChildren }
        expect(
          parsePublicationPreview(
            new URL(publicationPreviewUrl(intent), 'https://hype.test').searchParams,
          ),
        ).toEqual(intent)
      }
  })
  test('rejects partial and malformed intents', () => {
    expect(parsePublicationPreview(new URLSearchParams())).toBeNull()
    for (const query of [
      'previewId=x',
      'previewType=feature&previewId=x&previewChildren=true',
      'previewType=layer&previewId=x&previewChildren=maybe',
    ])
      expect(() => parsePublicationPreview(new URLSearchParams(query))).toThrow(
        'INVALID_PUBLICATION_PREVIEW',
      )
  })
})

test('preview and publication use identical local-state restoration for every combination', async () => {
  const { sqlite, db } = publicationSqlite({ rows })
  try {
    sqlite.exec(
      'CREATE TABLE rows (isPublished INTEGER NOT NULL, localIsPublished INTEGER)',
    )
    for (const isPublished of [false, true])
      for (const localIsPublished of [null, false, true])
        for (const publishChildren of [false, true]) {
          await db.delete(rows).run()
          await db.insert(rows).values({ isPublished, localIsPublished }).run()
          const before = await db.select().from(rows).get()
          const preview = await db
            .select({ published: descendantPublicationState(rows, publishChildren) })
            .from(rows)
            .get()
          expect(await db.select().from(rows).get()).toEqual(before)
          await db
            .update(rows)
            .set({ isPublished: descendantPublicationState(rows, publishChildren) })
            .run()
          expect(Boolean(preview?.published)).toBe(
            publishChildren || (localIsPublished ?? isPublished),
          )
          expect((await db.select().from(rows).get())?.isPublished).toBe(
            Boolean(preview?.published),
          )
        }
  } finally {
    sqlite.close()
  }
})
