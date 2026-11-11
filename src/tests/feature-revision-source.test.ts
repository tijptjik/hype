// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DRIZZLE
import { getTableColumns, getTableName, sql } from 'drizzle-orm'
// SCHEMA
import {
  feature,
  featureI18n,
  featureProperty,
  featurePropertyI18n,
} from '#lib/db/schema/feature.js'
import { featureImage, image } from '#lib/db/schema/image.js'
import { featureLocation } from '#lib/db/schema/location.js'
import { featureLocationMembership } from '#lib/db/schema/locationRelationships.js'
import {
  property,
  propertyI18n,
  propertyValue,
  propertyValueI18n,
} from '#lib/db/schema/property.js'
// SERVICES
import { readFeatureRevisionSource } from '#lib/db/services/featureRevisionSource.js'
import { initializeFeatureRevision } from '#lib/db/services/featureRevision.js'
import {
  executeRevisionBatch,
  prepareRevisionCheck,
} from '#lib/db/services/revisionBatch.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'

const connections: ReturnType<typeof publicationSqlite>[] = []
afterEach(() => {
  for (const connection of connections.splice(0)) connection.sqlite.close()
})

/** Build real SQLite source tables; this fixture tests reads/fences, not domain constraints. */
function fixture() {
  const connection = publicationSqlite({})
  connections.push(connection)
  const { sqlite } = connection
  for (const table of [
    feature,
    featureI18n,
    featureProperty,
    featurePropertyI18n,
    featureLocation,
    featureLocationMembership,
    featureImage,
    image,
    property,
    propertyI18n,
    propertyValue,
    propertyValueI18n,
  ]) {
    const columns = Object.values(getTableColumns(table)).map(
      column =>
        `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`,
    )
    sqlite.exec(`CREATE TABLE "${getTableName(table)}" (${columns.join(',')})`)
  }
  sqlite.exec(`
    INSERT INTO feature(id,modifiedAt,geometry,isVisitable) VALUES
      ('f','unchanged','{"type":"Point","coordinates":[114,22]}',1),('other','other','null',0);
    INSERT INTO featureI18n(featureId,locale,title,titleGen) VALUES ('f','en','Old',0),('other','en','Private other',1);
    INSERT INTO featureProperty(featureId,propertyId,propertyValueId,valueJson) VALUES ('f','p','v',NULL);
    INSERT INTO featurePropertyI18n(featureId,propertyId,locale,value,valueGen) VALUES ('f','p','en','Text',0);
    INSERT INTO property(id,key,audience) VALUES ('p','test','internal'),('unused','unused','public');
    INSERT INTO propertyI18n(propertyId,locale,label) VALUES ('p','en','Field');
    INSERT INTO propertyValue(id,propertyId,value) VALUES ('v','p','Option');
    INSERT INTO propertyValueI18n(propertyValueId,locale,value) VALUES ('v','en','Option EN');
    INSERT INTO featureLocation(featureId,locationId,version,factsRevisionId,locationRevisionId,acceptedOverrides)
      VALUES ('f','place','a1','facts1','geometry1','{}');
    INSERT INTO featureLocationMembership(featureId,containerLocationId,role,bindingVersion,membershipRevisionId)
      VALUES ('f','building','building','binding1','membership1');
    INSERT INTO featureImage(featureId,imageId,intent,isPublished) VALUES ('f','photo','canonical',1);
    INSERT INTO image(id,publicId,contentHash,presentationMode) VALUES ('photo','old-file','old-hash','contain');
    CREATE TABLE accessScope(allowed INTEGER); INSERT INTO accessScope VALUES (1);
  `)
  const db = connection.db as unknown as Database
  const guard = sql`EXISTS (SELECT 1 FROM accessScope WHERE allowed=1)`
  const capture = () => readFeatureRevisionSource(db, 'f', guard)
  const captureRequired = async () => {
    const source = await capture()
    if (!source) throw new Error('Expected authorized source evidence')
    return source
  }
  return { db, sqlite, capture, captureRequired, guard }
}

describe('complete Feature revision source fencing', () => {
  it('retains private cache metadata without treating cache writes as editorial drift', async () => {
    const f = fixture()
    const before = await f.captureRequired()
    f.sqlite.exec(`UPDATE featureI18n SET autoTranslated='{"title":{"value":"Cached"}}' WHERE featureId='f' AND locale='en';
      INSERT INTO featureI18n(featureId,locale,title,titleGen,isAutomaticOnly,autoTranslated) VALUES ('f','ja','',1,1,'{"title":{"value":"Japanese cache"}}');`)
    expect(await executeRevisionBatch(f.db, before.unchanged, [])).toEqual([])
    const after = await f.captureRequired()
    expect(after.snapshot).toMatchObject({
      translations: expect.arrayContaining([
        expect.objectContaining({
          locale: 'ja',
          isAutomaticOnly: true,
          autoTranslated: { title: { value: 'Japanese cache' } },
        }),
      ]),
    })
    f.sqlite.exec(
      "UPDATE featureI18n SET title='Authored change' WHERE featureId='f' AND locale='en'",
    )
    expect(await executeRevisionBatch(f.db, after.unchanged, [])).toBeNull()
  })

  it('captures children, accepted references and private context in one scoped read', async () => {
    const f = fixture()
    const source = await f.captureRequired()
    expect(source.snapshot).toMatchObject({
      record: { id: 'f', isVisitable: true, geometry: { coordinates: [114, 22] } },
      translations: [{ locale: 'en', title: 'Old', titleGen: false }],
      properties: [{ propertyId: 'p', propertyValueId: 'v', valueJson: null }],
      propertyTranslations: [{ locale: 'en', value: 'Text', valueGen: false }],
      location: [
        {
          locationId: 'place',
          factsRevisionId: 'facts1',
          locationRevisionId: 'geometry1',
        },
      ],
      locationMemberships: [{ membershipRevisionId: 'membership1' }],
      galleryLinks: [{ imageId: 'photo', isPublished: true }],
      images: [{ publicId: 'old-file', contentHash: 'old-hash' }],
      fieldDefinitions: [{ id: 'p', audience: 'internal' }],
      fieldTranslations: [{ label: 'Field' }],
      fieldOptions: [{ id: 'v' }],
      fieldOptionTranslations: [{ value: 'Option EN' }],
    })
    expect(JSON.stringify(source.snapshot)).not.toContain('Private other')
    expect(JSON.stringify(source.snapshot)).not.toContain('unused')
    expect(await executeRevisionBatch(f.db, source.unchanged, [])).toEqual([])
  })

  it.each([
    "UPDATE featureI18n SET title='New' WHERE featureId='f'",
    "INSERT INTO featureI18n(featureId,locale,title) VALUES ('f','zh-hant','新')",
    "DELETE FROM featureI18n WHERE featureId='f'",
    "UPDATE featureProperty SET propertyValueId=NULL,valueJson='{\"items\":[1]}' WHERE featureId='f'",
    "UPDATE featurePropertyI18n SET valueGen=1 WHERE featureId='f'",
    "UPDATE featureLocation SET factsRevisionId='facts2' WHERE featureId='f'",
    "UPDATE featureLocationMembership SET membershipRevisionId='membership2' WHERE featureId='f'",
    "DELETE FROM featureImage WHERE featureId='f'",
    "UPDATE featureImage SET intent='research' WHERE featureId='f'",
    "UPDATE image SET publicId='replaced-file' WHERE id='photo'",
    "UPDATE property SET audience='public' WHERE id='p'",
    "UPDATE propertyI18n SET label='Renamed' WHERE propertyId='p'",
    "UPDATE propertyValue SET value='Changed option' WHERE id='v'",
    "UPDATE propertyValueI18n SET value='Changed translation' WHERE propertyValueId='v'",
    "DELETE FROM featurePropertyI18n WHERE featureId='f'; DELETE FROM featureProperty WHERE featureId='f'",
  ])('rejects child-only drift without relying on modifiedAt: %s', async mutation => {
    const f = fixture()
    const source = await f.captureRequired()
    f.sqlite.exec(mutation)
    expect(
      f.sqlite.prepare("SELECT modifiedAt FROM feature WHERE id='f'").get(),
    ).toEqual({ modifiedAt: 'unchanged' })
    expect(await executeRevisionBatch(f.db, source.unchanged, [])).toBeNull()
  })

  it('checks scope both before reading private evidence and again in the batch', async () => {
    const f = fixture()
    const source = await f.captureRequired()
    f.sqlite.exec('UPDATE accessScope SET allowed=0')
    expect(await f.capture()).toBeNull()
    expect(await executeRevisionBatch(f.db, source.unchanged, [])).toBeNull()
    expect(await readFeatureRevisionSource(f.db, 'missing', sql`1`)).toBeNull()
  })

  it('does not fail a captured Feature when another Feature or unused definition changes', async () => {
    const f = fixture()
    const source = await f.captureRequired()
    f.sqlite.exec(
      "UPDATE featureI18n SET title='Unrelated' WHERE featureId='other'; UPDATE property SET key='other' WHERE id='unused'",
    )
    expect(await executeRevisionBatch(f.db, source.unchanged, [])).toEqual([])
  })

  it('keeps the binding count constant with many properties and gallery entries', async () => {
    const f = fixture()
    for (let index = 0; index < 150; index++) {
      f.sqlite
        .prepare(
          'INSERT INTO featureProperty(featureId,propertyId,value) VALUES (?,?,?)',
        )
        .run('f', `p${index}`, `${index}`)
      f.sqlite
        .prepare('INSERT INTO featureImage(featureId,imageId) VALUES (?,?)')
        .run('f', `image${index}`)
    }
    const source = await f.captureRequired()
    const query = f.db.select({ valid: source.unchanged }).from(sql`(SELECT 1)`).toSQL()
    expect(query.params.length).toBeLessThan(10)
    expect(await executeRevisionBatch(f.db, source.unchanged, [])).toEqual([])
  })

  it('refuses baseline enrollment after relation drift and rolls back late failures', async () => {
    const f = fixture()
    f.sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
    const source = await f.captureRequired()
    f.sqlite.exec("UPDATE featureI18n SET title='Concurrent' WHERE featureId='f'")
    expect(
      await initializeFeatureRevision(f.db, {
        actorId: 'migration:unknown-author',
        featureId: 'f',
        guard: source.unchanged,
        content: { title: 'Old' },
        published: true,
      }),
    ).toBeNull()
    expect(
      f.sqlite.prepare('SELECT count(*) n FROM featureRevisionHead').get(),
    ).toEqual({ n: 0 })
    expect(f.sqlite.prepare('SELECT count(*) n FROM revisionChangeSet').get()).toEqual({
      n: 0,
    })
    const refreshed = await f.captureRequired()
    const result = await executeRevisionBatch(f.db, refreshed.unchanged, [
      f.db.update(feature).set({ isVisitable: false }),
      prepareRevisionCheck(f.db, sql`0`),
    ])
    expect(result).toBeNull()
    expect(
      f.sqlite.prepare("SELECT isVisitable FROM feature WHERE id='f'").get(),
    ).toEqual({ isVisitable: 1 })
  })
})
