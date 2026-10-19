// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTING
import { expect, it } from 'vitest'
// DATA
import brands from '../../scripts/breadline/donor-brand-identities.json'
import { resolveBrandIdentity } from '#lib/features/brandIdentity.js'

it('seeds effective brand values only for reviewed imported donors and preserves overrides', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE property(id TEXT PRIMARY KEY,key TEXT);
      CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT,rank INTEGER,value TEXT);
      CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT,valueGen INTEGER,PRIMARY KEY(propertyValueId,locale));
      CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,propertyValueId TEXT,value TEXT);
      CREATE TABLE organisation(id TEXT,code TEXT); CREATE TABLE project(id TEXT,code TEXT,organisationId TEXT);
      CREATE TABLE feature(id TEXT,projectId TEXT); CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT);
      CREATE TABLE breadlineImportFeature(featureId TEXT,sourceTable TEXT);
      INSERT INTO property VALUES('WhWlW8KcN2wq','brand'); INSERT INTO organisation VALUES('org','hkfoodworks');
      INSERT INTO project VALUES('p','breadline','org');`)
    for (const brand of brands) {
      db.prepare('INSERT INTO feature VALUES(?,?)').run(brand.id, 'p')
      db.prepare('INSERT INTO featureI18n VALUES(?,?,?)').run(
        brand.id,
        'en',
        brand.sourceName,
      )
      db.prepare('INSERT INTO breadlineImportFeature VALUES(?,?)').run(
        brand.id,
        'donors',
      )
      db.prepare('INSERT INTO featureProperty VALUES(?,?,?,NULL)').run(
        brand.id,
        'WhWlW8KcN2wq',
        'blBrandInd01',
      )
      expect(resolveBrandIdentity(brand.code)?.logoSrc).toContain(`/${brand.code}.svg`)
    }
    db.exec(
      "UPDATE featureProperty SET value='explicit override' WHERE featureId='blBrGarden01'",
    )
    const sql = readFileSync(
      'migrations/0106_breadline_donor_brand_identity.sql',
      'utf8',
    )
    db.exec(sql)
    expect(
      db
        .prepare(
          "SELECT count(*) n FROM featureProperty WHERE propertyValueId!='blBrandInd01'",
        )
        .get(),
    ).toEqual({ n: 7 })
    expect(
      db
        .prepare(
          "SELECT propertyValueId,value FROM featureProperty WHERE featureId='blBrGarden01'",
        )
        .get(),
    ).toEqual({ propertyValueId: 'blBrandInd01', value: 'explicit override' })
    const before = db.prepare('SELECT * FROM featureProperty').all()
    db.exec(sql)
    expect(db.prepare('SELECT * FROM featureProperty').all()).toEqual(before)
    expect(db.prepare('SELECT count(*) n FROM propertyValue').get()).toEqual({ n: 8 })
  } finally {
    db.close()
  }
})
