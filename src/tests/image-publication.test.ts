// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { publishAllFeatureImagesExceptResearch } from '#lib/db/services/image.js'
import { publishScopedFeatureImages } from '#lib/db/services/publication.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
import type { Database } from '#lib/types.js'

const expectedScope = {
  organisationId: 'o',
  projectId: 'p',
  layerId: 'l',
  resourceHubId: 'h',
}

function fixture() {
  const { sqlite, db } = publicationSqlite({})
  sqlite.exec(`
    CREATE TABLE organisation (id TEXT, hubId TEXT);
    CREATE TABLE layer (id TEXT, projectId TEXT, organisationId TEXT);
    CREATE TABLE project (id TEXT, code TEXT, flags TEXT, organisationId TEXT);
    CREATE TABLE feature (id TEXT, projectId TEXT, layerId TEXT, organisationId TEXT, isPublished INTEGER, isArchived INTEGER);
    CREATE TABLE image (id TEXT, createdAt TEXT, isArchived INTEGER);
    CREATE TABLE featureImage (featureId TEXT, imageId TEXT, intent TEXT, isPublished INTEGER, localIsPublished INTEGER, publishedAt TEXT, publisherId TEXT);
    CREATE UNIQUE INDEX canonical_intent ON featureImage(featureId) WHERE intent='canonical';
    INSERT INTO organisation VALUES ('o','h'),('other','h');
    INSERT INTO layer VALUES ('l','p','o'),('other-l','p','o');
    INSERT INTO project VALUES ('p', 'eln', '{}', 'o');
    INSERT INTO feature VALUES ('f', 'p', 'l', 'o', 1, 0), ('draft', 'p', 'l', 'o', 0, 0), ('outside', 'other', 'other', 'other', 1, 0);
    INSERT INTO image VALUES ('a', '2020', 0), ('b', '2021', 0), ('r', '2019', 0), ('archived', '2018', 1);
    INSERT INTO featureImage(featureId,imageId,intent,isPublished) VALUES
      ('f','a','undefined',0), ('f','b','context',0), ('f','r','research',0), ('f','archived','general',0),
      ('draft','a','undefined',0), ('outside','a','undefined',0);
  `)
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
        `INSERT INTO project(id,code,flags) VALUES ('g','hkghostsigns','{}'),('b','independentBookstores','{}'),('x','custom','{"autoPublishClassifiedImages":false}')`,
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

  it('explicitly publishes all active non-research images even when project automation is disabled', async () => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec(
        `UPDATE project SET flags='{"autoFeatureFirstImage":false,"autoPublishClassifiedImages":false}'`,
      )
      expect(
        await publishAllFeatureImagesExceptResearch(db, 'f', 'actor', expectedScope),
      ).toBe(true)
      expect(
        sqlite
          .prepare(
            "SELECT imageId, isPublished, publisherId FROM featureImage WHERE featureId='f' ORDER BY imageId",
          )
          .all(),
      ).toEqual([
        { imageId: 'a', isPublished: 1, publisherId: 'actor' },
        { imageId: 'archived', isPublished: 0, publisherId: null },
        { imageId: 'b', isPublished: 1, publisherId: 'actor' },
        { imageId: 'r', isPublished: 0, publisherId: null },
      ])
      const beforeRetry = sqlite.prepare('SELECT * FROM featureImage').all()
      expect(
        await publishAllFeatureImagesExceptResearch(db, 'f', 'second', expectedScope),
      ).toBe(true)
      expect(sqlite.prepare('SELECT * FROM featureImage').all()).toEqual(beforeRetry)
    } finally {
      sqlite.close()
    }
  })
})

it.each([
  "UPDATE feature SET layerId='other-l' WHERE id='f'",
  "UPDATE feature SET projectId='other-p' WHERE id='f'",
  "UPDATE feature SET organisationId='other' WHERE id='f'",
  "UPDATE layer SET projectId='other-p' WHERE id='l'",
  "UPDATE project SET organisationId='other' WHERE id='p'",
  "UPDATE organisation SET hubId='moved' WHERE id='o'",
  "DELETE FROM feature WHERE id='f'",
])('does not publish images after an authorized scope change: %s', async mutation => {
  const { sqlite, db } = fixture()
  try {
    sqlite.exec(mutation)
    const before = sqlite.prepare('SELECT * FROM featureImage').all()
    expect(
      await publishAllFeatureImagesExceptResearch(db, 'f', 'actor', expectedScope),
    ).toBe(false)
    expect(sqlite.prepare('SELECT * FROM featureImage').all()).toEqual(before)
  } finally {
    sqlite.close()
  }
})

it('propagates an image write failure without committing publication', async () => {
  const { sqlite, db } = fixture()
  try {
    sqlite.exec(
      "CREATE TRIGGER fail_publication BEFORE UPDATE ON featureImage BEGIN SELECT RAISE(ABORT,'image publication failed'); END",
    )
    const before = sqlite.prepare('SELECT * FROM featureImage').all()
    await expect(
      publishAllFeatureImagesExceptResearch(db, 'f', 'actor', expectedScope),
    ).rejects.toThrow('image publication failed')
    expect(sqlite.prepare('SELECT * FROM featureImage').all()).toEqual(before)
  } finally {
    sqlite.close()
  }
})
