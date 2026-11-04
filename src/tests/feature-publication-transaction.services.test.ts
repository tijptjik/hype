// @vitest-environment node
// TESTS
import { expect, it } from 'vitest'
import { getTableColumns } from 'drizzle-orm'
// DB
import { feature } from '#lib/db/schema/feature.js'
import {
  updateFeaturePublishedStateById,
  updateFeatureArchivedStateById,
} from '#lib/db/services/feature.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// TYPES
import type { Database } from '#lib/types.js'

const expectedScope = {
  organisationId: 'o',
  projectId: 'p',
  layerId: 'l',
  resourceHubId: 'h',
}

/** Creates a disposable publication hierarchy with an eligible image. */
function fixture() {
  const { sqlite, db } = publicationSqlite({})
  sqlite.exec(`CREATE TABLE feature (${Object.values(getTableColumns(feature))
    .map(column => `"${column.name}" ${column.getSQLType()}`)
    .join(',')});
      CREATE TABLE organisation(id TEXT PRIMARY KEY, hubId TEXT);
      CREATE TABLE project(id TEXT PRIMARY KEY, organisationId TEXT, flags TEXT);
      CREATE TABLE layer(id TEXT PRIMARY KEY, projectId TEXT, organisationId TEXT);
      CREATE TABLE image(id TEXT PRIMARY KEY, createdAt TEXT,isArchived INTEGER);
      CREATE TABLE featureImage(featureId TEXT,imageId TEXT,intent TEXT,isPublished INTEGER,localIsPublished INTEGER,publishedAt TEXT,publisherId TEXT);
      INSERT INTO organisation VALUES('o','h'),('other','h');
      INSERT INTO project VALUES('p','o','{}'),('other-p','o','{}');
      INSERT INTO layer VALUES('l','p','o'),('other-l','p','o');
      INSERT INTO feature(id,organisationId,projectId,layerId,isPublished,isArchived,modifiedAt) VALUES('f','o','p','l',0,0,'before');
      INSERT INTO image VALUES('i','2020',0);
      INSERT INTO featureImage VALUES('f','i','undefined',0,NULL,NULL,NULL);`)
  return { sqlite, db: db as unknown as Database }
}

it.each([
  'success',
  'image failure',
  'feature failure',
  'missing',
  'unpublish',
  'feature skipped',
])('publishes Feature and eligible images atomically: %s', async scenario => {
  const { sqlite, db } = fixture()
  try {
    if (scenario === 'unpublish')
      sqlite.exec(
        "UPDATE feature SET isPublished=1,publishedAt='old',publisherId='old-actor'; UPDATE featureImage SET intent='canonical',isPublished=1,publisherId='old-actor'",
      )
    if (scenario === 'feature skipped')
      sqlite.exec(
        'UPDATE feature SET isPublished=1; CREATE TRIGGER skip_feature BEFORE UPDATE ON feature BEGIN SELECT RAISE(IGNORE); END',
      )
    const before = sqlite.prepare('SELECT * FROM feature').all()
    const imagesBefore = sqlite.prepare('SELECT * FROM featureImage').all()
    if (scenario === 'feature failure')
      sqlite.exec(
        "CREATE TRIGGER fail_feature BEFORE UPDATE ON feature BEGIN SELECT RAISE(ABORT,'feature publication failed'); END",
      )
    if (scenario === 'image failure')
      sqlite.exec(
        "CREATE TRIGGER fail_image BEFORE UPDATE OF isPublished ON featureImage BEGIN SELECT RAISE(ABORT,'image publication failed'); END",
      )
    const pending = updateFeaturePublishedStateById(db as unknown as Database, {
      id: scenario === 'missing' ? 'absent' : 'f',
      state: scenario !== 'unpublish',
      expectedScope,
      publisherId: 'actor',
    })
    if (scenario === 'image failure' || scenario === 'feature failure') {
      await expect(pending).rejects.toThrow(
        `${scenario === 'image failure' ? 'image' : 'feature'} publication failed`,
      )
      expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(before)
      expect(
        sqlite.prepare('SELECT intent,isPublished FROM featureImage').get(),
      ).toEqual({ intent: 'undefined', isPublished: 0 })
    } else if (scenario === 'missing' || scenario === 'feature skipped') {
      expect(await pending).toBeUndefined()
      expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(before)
      expect(sqlite.prepare('SELECT * FROM featureImage').all()).toEqual(imagesBefore)
    } else if (scenario === 'unpublish') {
      expect(await pending).toMatchObject({
        id: 'f',
        isPublished: false,
        publisherId: null,
        publishedAt: null,
      })
      expect(sqlite.prepare('SELECT * FROM featureImage').all()).toEqual(imagesBefore)
    } else {
      expect(await pending).toMatchObject({
        id: 'f',
        isPublished: true,
        publisherId: 'actor',
      })
      expect(
        sqlite.prepare('SELECT intent,isPublished,publisherId FROM featureImage').get(),
      ).toEqual({ intent: 'canonical', isPublished: 1, publisherId: 'actor' })
    }
  } finally {
    sqlite.close()
  }
})

for (const state of [false, true]) {
  it.each([
    "UPDATE feature SET layerId='other-l' WHERE id='f'",
    "UPDATE feature SET projectId='other-p' WHERE id='f'",
    "UPDATE feature SET organisationId='other' WHERE id='f'",
    "UPDATE layer SET projectId='other-p' WHERE id='l'",
    "UPDATE layer SET organisationId='other' WHERE id='l'",
    "UPDATE project SET organisationId='other' WHERE id='p'",
    "UPDATE organisation SET hubId='moved' WHERE id='o'",
  ])(`rejects changed publication scope with state ${state}: %s`, async mutation => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec(`UPDATE feature SET isPublished=${Number(!state)}; ${mutation}`)
      const before = sqlite.prepare('SELECT * FROM feature').all()
      const imagesBefore = sqlite.prepare('SELECT * FROM featureImage').all()
      expect(
        await updateFeaturePublishedStateById(db, {
          id: 'f',
          state,
          publisherId: 'actor',
          expectedScope,
        }),
      ).toBeUndefined()
      expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(before)
      expect(sqlite.prepare('SELECT * FROM featureImage').all()).toEqual(imagesBefore)
    } finally {
      sqlite.close()
    }
  })
}

it.each([false, true])('handles a null authorized hub with state %s', async state => {
  const { sqlite, db } = fixture()
  try {
    sqlite.exec(
      `UPDATE organisation SET hubId=NULL WHERE id='o'; UPDATE feature SET isPublished=${Number(!state)}`,
    )
    expect(
      await updateFeaturePublishedStateById(db, {
        id: 'f',
        state,
        publisherId: 'actor',
        expectedScope: { ...expectedScope, resourceHubId: null },
      }),
    ).toMatchObject({ id: 'f', isPublished: state })
  } finally {
    sqlite.close()
  }
})

it.each([false, true])(
  'rejects hub assignment after null-scope authorization with state %s',
  async state => {
    const { sqlite, db } = fixture()
    try {
      sqlite.exec(`UPDATE feature SET isPublished=${Number(!state)}`)
      const before = sqlite.prepare('SELECT * FROM feature').all()
      const imagesBefore = sqlite.prepare('SELECT * FROM featureImage').all()
      expect(
        await updateFeaturePublishedStateById(db, {
          id: 'f',
          state,
          publisherId: 'actor',
          expectedScope: { ...expectedScope, resourceHubId: null },
        }),
      ).toBeUndefined()
      expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(before)
      expect(sqlite.prepare('SELECT * FROM featureImage').all()).toEqual(imagesBefore)
    } finally {
      sqlite.close()
    }
  },
)

for (const state of [false, true]) {
  it.each([
    null,
    "UPDATE feature SET layerId='other-l' WHERE id='f'",
    "UPDATE feature SET projectId='other-p' WHERE id='f'",
    "UPDATE feature SET organisationId='other' WHERE id='f'",
    "UPDATE layer SET projectId='other-p' WHERE id='l'",
    "UPDATE project SET organisationId='other' WHERE id='p'",
    "UPDATE organisation SET hubId='moved' WHERE id='o'",
    "DELETE FROM feature WHERE id='f'",
  ])(
    `archives only in the authorized scope with state ${state}: %s`,
    async mutation => {
      const { sqlite, db } = fixture()
      try {
        sqlite.exec(`UPDATE feature SET isArchived=${Number(!state)}`)
        if (mutation) sqlite.exec(mutation)
        const before = sqlite.prepare('SELECT * FROM feature').all()
        const result = await updateFeatureArchivedStateById(db, {
          id: 'f',
          state,
          expectedScope,
        })
        if (mutation) {
          expect(result).toBeUndefined()
          expect(sqlite.prepare('SELECT * FROM feature').all()).toEqual(before)
        } else expect(result).toMatchObject({ id: 'f', isArchived: state })
      } finally {
        sqlite.close()
      }
    },
  )
}
