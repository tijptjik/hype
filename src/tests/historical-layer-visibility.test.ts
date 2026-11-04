// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import {
  historicalFeatureVisibility,
  historicalLayerVisibility,
} from '#lib/db/services/historicalLayers.js'

describe('historical collection visibility', () => {
  it('requires opt-in and both layer publications while leaving current entries available', () => {
    const db = new DatabaseSync(':memory:')
    db.exec(`CREATE TABLE project(id TEXT,flags TEXT);
      CREATE TABLE layer(id TEXT,projectId TEXT,historicalSourceLayerId TEXT,isPublished INTEGER,isArchived INTEGER);
      CREATE TABLE feature(id TEXT,layerId TEXT,isIntangible INTEGER);
      INSERT INTO project VALUES('p','{"showHistoricalLayers":true}');
      INSERT INTO layer VALUES('main','p',NULL,1,0),('past','p','main',1,0);
      INSERT INTO feature VALUES('current','main',0),('old','past',1),('unrouted','main',1);`)
    const dialect = new SQLiteSyncDialect()
    const featureSQL = dialect.sqlToQuery(historicalFeatureVisibility()).sql
    const layerSQL = dialect.sqlToQuery(historicalLayerVisibility()).sql
    const ids = () =>
      db
        .prepare(`SELECT id FROM feature WHERE ${featureSQL} ORDER BY id`)
        .all()
        .map(row => row.id)
    expect(ids()).toEqual(['current', 'old'])
    db.exec("UPDATE layer SET isPublished=0 WHERE id='main'")
    expect(ids()).toEqual(['current'])
    db.exec("UPDATE layer SET isPublished=1; UPDATE project SET flags='{}'")
    expect(ids()).toEqual(['current'])
    expect(
      db
        .prepare(`SELECT id FROM layer WHERE ${layerSQL}`)
        .all()
        .map(row => row.id),
    ).toEqual(['main'])
    db.close()
  })
})
