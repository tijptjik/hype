import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { drizzle } from 'drizzle-orm/d1'
import { updateFeatureImage } from '$lib/db/services/image'
import type { Database } from '$lib/types'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

/** Runs the generated statements in SQLite with D1's documented atomic batch semantics. */
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  sqlite.exec(`CREATE TABLE featureImage (
    featureId TEXT, imageId TEXT, intent TEXT NOT NULL,
    isPublished INTEGER NOT NULL DEFAULT 0, localIsPublished INTEGER,
    publishedAt TEXT, publisherId TEXT, PRIMARY KEY(featureId, imageId));
    CREATE UNIQUE INDEX canonical_intent ON featureImage(featureId) WHERE intent = 'canonical';
    INSERT INTO featureImage(featureId,imageId,intent) VALUES
      ('feature','old','canonical'), ('feature','new','general'),
      ('other','other-image','canonical');`)
  const db = drizzle({} as never) as Database
  vi.spyOn(db, 'batch').mockImplementation(async queries => {
    sqlite.exec('BEGIN')
    try {
      const result = queries.map(query => {
        const { sql, params } = query.toSQL()
        return sqlite.prepare(sql).all(...(params as never[]))
      })
      sqlite.exec('COMMIT')
      return result as never
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  })
  return { sqlite, db }
}

describe('canonical image replacement', () => {
  it('replaces only the requested feature canonical image', async () => {
    const { db, sqlite } = setup()
    const result = await updateFeatureImage(
      db,
      { featureId: 'feature', intent: 'canonical' },
      'new',
    )
    expect(result.imageId).toBe('new')
    expect(
      sqlite
        .prepare(
          "SELECT imageId FROM featureImage WHERE intent = 'canonical' ORDER BY imageId",
        )
        .all(),
    ).toEqual([{ imageId: 'new' }, { imageId: 'other-image' }])
  })

  it('retains the canonical image if the target assignment is missing', async () => {
    const { db, sqlite } = setup()
    await expect(
      updateFeatureImage(db, { featureId: 'feature', intent: 'canonical' }, 'missing'),
    ).rejects.toMatchObject({ status: 404 })
    expect(
      sqlite.prepare("SELECT intent FROM featureImage WHERE imageId = 'old'").get(),
    ).toEqual({ intent: 'canonical' })
  })

  it('rolls back demotion if the promotion statement fails', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(`CREATE TRIGGER reject_promotion BEFORE UPDATE ON featureImage
      WHEN NEW.imageId = 'new' AND NEW.intent = 'canonical'
      BEGIN SELECT RAISE(ABORT, 'simulated failure'); END;`)
    await expect(
      updateFeatureImage(db, { featureId: 'feature', intent: 'canonical' }, 'new'),
    ).rejects.toThrow('simulated failure')
    expect(
      sqlite.prepare("SELECT intent FROM featureImage WHERE imageId = 'old'").get(),
    ).toEqual({ intent: 'canonical' })
  })
})
