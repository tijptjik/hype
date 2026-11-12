// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
// DRIZZLE
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
// TESTS
import { expect, test } from 'vitest'
// DOMAIN
import { featureLocationBrandCondition } from '#lib/db/services/locationBrandProjection.js'
import { FeatureIndexQuerySchema } from '#lib/features/indexQuery.js'

test('brand scope matches accepted identities, explicit clears, overrides and private ownership', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`
      CREATE TABLE feature(id TEXT, projectId TEXT, isDraft INTEGER);
      CREATE TABLE project(id TEXT, organisationId TEXT);
      CREATE TABLE location(id TEXT, state TEXT, ownerOrganisationId TEXT);
      CREATE TABLE featureLocation(featureId TEXT, locationId TEXT, factsRevisionId TEXT, acceptancePolicy TEXT, acceptedOverrides TEXT);
      CREATE TABLE locationRevisionContent(id TEXT, locationId TEXT, facts TEXT);
      CREATE TABLE locationSharedRevision(id TEXT, locationId TEXT, corrections TEXT);
      INSERT INTO project VALUES('project','org');
      INSERT INTO location VALUES('place','published',NULL);
      INSERT INTO locationRevisionContent VALUES('facts','place','{"schemaVersion":1,"details":{}}');
      INSERT INTO locationSharedRevision VALUES('accepted','place','{"brandId":{"choice":{"mode":"override","value":"brand-a"}}}');
      INSERT INTO locationSharedRevision VALUES('pending','place','{"brandId":{"choice":{"mode":"override","value":"brand-b"}}}');
      INSERT INTO feature VALUES('visible','project',0);
      INSERT INTO featureLocation VALUES('visible','place','facts','{"factsSharedRevision":"accepted"}','{}');
    `)
    const matches = (brand: string): string[] => {
      const query = new SQLiteSyncDialect().sqlToQuery(
        featureLocationBrandCondition(brand),
      )
      return db
        .prepare(`SELECT feature.id FROM feature WHERE ${query.sql}`)
        .all(...(query.params as never[]))
        .map(row => String(row.id))
    }
    expect(matches('brand-a')).toEqual(['visible'])
    expect(matches('brand-b')).toEqual([])
    db.exec(
      `UPDATE featureLocation SET acceptedOverrides='{"brandId":{"mode":"override","value":"brand-b"}}'`,
    )
    expect(matches('brand-a')).toEqual([])
    expect(matches('brand-b')).toEqual(['visible'])
    db.exec(
      `UPDATE featureLocation SET acceptedOverrides='{"brandId":{"mode":"clear"}}'`,
    )
    expect(matches('brand-a')).toEqual([])
    db.exec(
      `UPDATE featureLocation SET acceptedOverrides='{}', acceptancePolicy='{"factsSharedRevision":"accepted","factsSharedFields":[{"field":"brandId","revision":"pending"}]}'`,
    )
    expect(matches('brand-b')).toEqual(['visible'])
    db.exec(`UPDATE location SET state='manual',ownerOrganisationId='other'`)
    expect(matches('brand-b')).toEqual([])
    db.exec(
      `UPDATE location SET ownerOrganisationId='org'; UPDATE feature SET isDraft=1`,
    )
    expect(matches('brand-b')).toEqual([])
    expect(FeatureIndexQuerySchema.parse({ brandId: 'brand-a' }).brandId).toBe(
      'brand-a',
    )
  } finally {
    db.close()
  }
})
