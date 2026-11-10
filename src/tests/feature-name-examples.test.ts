// @vitest-environment node
// TESTS
import { expect, it } from 'vitest'
// SERVICES
import { readFeatureNameExamples } from '#lib/db/services/featureNameExamples.js'
// FIXTURES
import { publicationSqlite } from './fixtures/publicationSqlite'
// TYPES
import type { Database } from '#lib/types.js'

it('samples populated text by locale within the project or layer, preserving saved text', async () => {
  const { sqlite, db } = publicationSqlite({})
  try {
    sqlite.exec(`
      CREATE TABLE feature(id TEXT,projectId TEXT,layerId TEXT,isArchived INTEGER);
      CREATE TABLE property(id TEXT,dataType TEXT,component TEXT);
      CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,value TEXT);
      CREATE TABLE featurePropertyI18n(featureId TEXT,propertyId TEXT,locale TEXT,value TEXT);
      INSERT INTO property VALUES ('caption','text','InputField'),('empty','text','PhoneField'),('boolean','boolean','ToggleField');
      INSERT INTO feature VALUES ('a','other','layer',0),('b','project','layer',1),('c','project','layer',0),('d','project','layer',0),('e','project','second',0);
      INSERT INTO featureProperty VALUES ('a','caption','other project'),('b','caption','archived'),('c','caption','  '),('d','caption','  Neon lettering  '),('e','caption','Second layer'),('d','empty',char(9)||char(10)),('d','boolean','true');
      INSERT INTO featurePropertyI18n VALUES ('a','caption','en','Other project'),('b','caption','en','Archived'),('c','caption','en',''),('d','caption','en','Saved caption'),('d','caption','zh-Hant','霓虹字樣');
    `)
    expect(await readFeatureNameExamples(db as unknown as Database, 'project')).toEqual(
      {
        caption: {
          '*': '  Neon lettering  ',
          en: 'Saved caption',
          'zh-Hant': '霓虹字樣',
        },
      },
    )
    expect(
      await readFeatureNameExamples(db as unknown as Database, 'project', 'second'),
    ).toEqual({
      caption: { '*': 'Second layer' },
    })
    expect(await readFeatureNameExamples(db as unknown as Database, 'missing')).toEqual(
      {},
    )
  } finally {
    sqlite.close()
  }
})
