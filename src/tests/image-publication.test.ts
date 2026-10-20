// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { publishScopedFeatureImages } from '#lib/db/services/publication.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

function fixture() {
  const { sqlite, db } = publicationSqlite({})
  sqlite.exec(`
    CREATE TABLE project (id TEXT, code TEXT, flags TEXT);
    CREATE TABLE feature (id TEXT, projectId TEXT, layerId TEXT, organisationId TEXT, isPublished INTEGER, isArchived INTEGER);
    CREATE TABLE image (id TEXT, createdAt TEXT, isArchived INTEGER);
    CREATE TABLE featureImage (featureId TEXT, imageId TEXT, intent TEXT, isPublished INTEGER, localIsPublished INTEGER, publishedAt TEXT, publisherId TEXT);
    CREATE UNIQUE INDEX canonical_intent ON featureImage(featureId) WHERE intent='canonical';
    INSERT INTO project VALUES ('p', 'eln', '{}');
    INSERT INTO feature VALUES ('f', 'p', 'l', 'o', 1, 0), ('draft', 'p', 'l', 'o', 0, 0), ('outside', 'other', 'other', 'other', 1, 0);
    INSERT INTO image VALUES ('a', '2020', 0), ('b', '2021', 0), ('r', '2019', 0), ('archived', '2018', 1);
    INSERT INTO featureImage(featureId,imageId,intent,isPublished) VALUES
      ('f','a','undefined',0), ('f','b','context',0), ('f','r','research',0), ('f','archived','general',0),
      ('draft','a','undefined',0), ('outside','a','undefined',0);
  `)
  // Execute the helper's prepared statements in one real SQLite transaction.
  db.batch = (async (queries: Promise<unknown>[]) => {
    sqlite.exec('BEGIN')
    try {
      const results = []
      for (const query of queries) results.push(await query)
      sqlite.exec('COMMIT')
      return results
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  }) as typeof db.batch
  return { sqlite, db: db as unknown as Database }
}

describe('project image publication cascade', () => {
  for (const [kind, id] of [
    ['feature', 'f'],
    ['layer', 'l'],
    ['project', 'p'],
    ['organisation', 'o'],
  ] as const) {
    it(`classifies and publishes only eligible images through ${kind}`, async () => {
      const { sqlite, db } = fixture()
      try {
        await publishScopedFeatureImages(db, { kind, id }, 'actor')
        const rows = sqlite
          .prepare(
            "SELECT imageId, intent, isPublished FROM featureImage WHERE featureId='f' ORDER BY imageId",
          )
          .all()
        expect(rows).toEqual([
          { imageId: 'a', intent: 'canonical', isPublished: 1 },
          { imageId: 'archived', intent: 'general', isPublished: 0 },
          { imageId: 'b', intent: 'context', isPublished: 1 },
          { imageId: 'r', intent: 'research', isPublished: 0 },
        ])
        expect(
          sqlite
            .prepare(
              "SELECT count(*) AS n FROM featureImage WHERE featureId <> 'f' AND isPublished=1",
            )
            .get(),
        ).toEqual({ n: 0 })
        await publishScopedFeatureImages(db, { kind, id }, 'second')
        expect(
          sqlite
            .prepare(
              'SELECT DISTINCT publisherId FROM featureImage WHERE isPublished=1',
            )
            .all(),
        ).toEqual([{ publisherId: 'actor' }])
      } finally {
        sqlite.close()
      }
    })
  }
  it('honours independent settings and preserves existing Featured choices', async () => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec(
        `UPDATE project SET flags='{"autoFeatureFirstImage":false,"autoPublishClassifiedImages":false}'`,
      )
      await publishScopedFeatureImages(db, { kind: 'project', id: 'p' })
      expect(
        sqlite
          .prepare(
            "SELECT count(*) AS n FROM featureImage WHERE intent='canonical' OR isPublished=1",
          )
          .get(),
      ).toEqual({ n: 0 })
      sqlite.exec(`UPDATE project SET flags='{"autoPublishClassifiedImages":false}'`)
      await publishScopedFeatureImages(db, { kind: 'project', id: 'p' })
      expect(
        sqlite
          .prepare(
            "SELECT intent,isPublished FROM featureImage WHERE featureId='f' AND imageId='a'",
          )
          .get(),
      ).toEqual({ intent: 'canonical', isPublished: 0 })
      sqlite.exec(`UPDATE project SET flags='{"autoFeatureFirstImage":false}'`)
      await publishScopedFeatureImages(db, { kind: 'project', id: 'p' })
      expect(
        sqlite
          .prepare("SELECT imageId FROM featureImage WHERE intent='canonical'")
          .all(),
      ).toEqual([{ imageId: 'a' }])
      expect(
        sqlite
          .prepare('SELECT count(*) AS n FROM featureImage WHERE isPublished=1')
          .get(),
      ).toEqual({ n: 2 })
    } finally {
      sqlite.close()
    }
  })
  it('migrates boolean defaults and editorial exceptions repeatably', () => {
    const { sqlite } = fixture()
    try {
      sqlite.exec(
        `INSERT INTO project VALUES ('g','hkghostsigns','{}'),('b','independentBookstores','{}'),('x','custom','{"autoPublishClassifiedImages":false}')`,
      )
      const migration = readFileSync(
        'migrations/0133_project_image_publication.sql',
        'utf8',
      )
      sqlite.exec(migration)
      sqlite.exec(migration)
      const rows = sqlite
        .prepare('SELECT code,flags FROM project')
        .all()
        .map(row => [row.code, JSON.parse(row.flags as string)])
      expect(rows).toEqual([
        ['eln', { autoPublishClassifiedImages: true, autoFeatureFirstImage: true }],
        [
          'hkghostsigns',
          { autoPublishClassifiedImages: true, autoFeatureFirstImage: false },
        ],
        [
          'independentBookstores',
          { autoPublishClassifiedImages: true, autoFeatureFirstImage: false },
        ],
        ['custom', { autoPublishClassifiedImages: false, autoFeatureFirstImage: true }],
      ])
    } finally {
      sqlite.close()
    }
  })
})
