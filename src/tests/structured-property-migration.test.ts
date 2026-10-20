// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

it('migrates legacy values additively and enforces structured storage exclusivity', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE property(id TEXT,projectId TEXT,key TEXT,isUserContributable INTEGER);
      CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,propertyValueId TEXT,value TEXT);
      INSERT INTO property VALUES ('eln_isbn','vGBvWfSZNELM','isbn',1);
      INSERT INTO featureProperty VALUES ('book','eln_isbn',NULL,'9780000000000');`)
    db.exec(readFileSync('migrations/0132_structured_properties.sql', 'utf8'))
    expect(
      db.prepare('SELECT audience,dataType,cardinality FROM property').get(),
    ).toEqual({ audience: 'internal', dataType: 'text', cardinality: 'one' })
    expect(db.prepare('SELECT value FROM featureProperty').get()?.value).toBe(
      '9780000000000',
    )
    expect(() =>
      db.exec(`UPDATE featureProperty SET valueJson='{"version":1,"items":[]}'`),
    ).toThrow()
    expect(() =>
      db.exec(`UPDATE featureProperty SET value=NULL,valueJson='broken'`),
    ).toThrow()
    db.exec(
      `UPDATE featureProperty SET value=NULL,valueJson='{"version":1,"items":[]}'`,
    )
    expect(() =>
      db.exec(`UPDATE featureProperty SET propertyValueId='option'`),
    ).toThrow()
  } finally {
    db.close()
  }
})

it('extends temporal contracts without rebuilding parents or losing foreign-key children', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE property(id TEXT PRIMARY KEY, dataType TEXT NOT NULL DEFAULT 'text' CHECK(dataType IN ('text','number','date','boolean','link')));
      CREATE TABLE child(propertyId TEXT REFERENCES property(id) ON DELETE CASCADE, value TEXT);
      INSERT INTO property VALUES ('links','link'); INSERT INTO child VALUES ('links','keep');`)
    db.exec(readFileSync('migrations/0134_temporal_property_ranges.sql', 'utf8'))
    expect(db.prepare('SELECT * FROM child').all()).toEqual([
      { propertyId: 'links', value: 'keep' },
    ])
    expect(
      db.prepare('SELECT dataType,dateResolution,timeMaxHour FROM property').get(),
    ).toEqual({ dataType: 'link', dateResolution: 'day', timeMaxHour: 24 })
    db.exec(
      "INSERT INTO property(id,dataType,dateResolution,timeMaxHour) VALUES ('dates','dateRange','month',24),('hours','timeRange','day',36)",
    )
    expect(() => db.exec('UPDATE property SET timeMaxHour=48')).toThrow()
    expect(() => db.exec("UPDATE property SET dateResolution='week'")).toThrow()
  } finally {
    db.close()
  }
})
