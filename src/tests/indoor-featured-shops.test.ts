// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { expect, it } from 'vitest'
import { featureIndoorUnitSQL } from '#lib/db/services/featureIndoorProjection.js'
import { visibleIndoorPlaces } from '#lib/indoor/visibility.js'
import type { Place } from '#lib/indoor/model.js'

it('uses the accepted unit and excludes drafts, former occupants and private foreign placements', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE feature(id TEXT, projectId TEXT, isDraft INTEGER);
      CREATE TABLE project(id TEXT, organisationId TEXT);
      CREATE TABLE featureLocation(featureId TEXT, locationId TEXT, occupancyRevisionId TEXT);
      CREATE TABLE location(id TEXT, state TEXT, ownerOrganisationId TEXT);
      CREATE TABLE locationOccupancy(id TEXT, establishmentLocationId TEXT, containerLocationId TEXT, assertionState TEXT, occupancyState TEXT, scopeOrganisationId TEXT);
      CREATE TABLE locationCanonicalDraft(locationId TEXT, sourceKey TEXT);
      INSERT INTO feature VALUES('f','p',0);
      INSERT INTO project VALUES('p','org');
      INSERT INTO location VALUES('tenant','upstream',NULL),('unit','upstream',NULL),('other','upstream',NULL);
      INSERT INTO featureLocation VALUES('f','tenant','accepted');
      INSERT INTO locationOccupancy VALUES('accepted','tenant','unit','asserted','current',NULL),('newer','tenant','other','asserted','current',NULL);
      INSERT INTO locationCanonicalDraft VALUES('unit','landsd-mtr-unit:unit-source-id'),('other','landsd-mtr-unit:newer-unit');`)
    const query = new SQLiteSyncDialect().sqlToQuery(
      sql`SELECT ${featureIndoorUnitSQL()} value FROM feature`,
    )
    const read = () => db.prepare(query.sql).get(...(query.params as string[]))?.value
    expect(read()).toBe('unit-source-id')
    for (const [change, restore] of [
      ['UPDATE feature SET isDraft=1', 'UPDATE feature SET isDraft=0'],
      [
        "UPDATE locationOccupancy SET occupancyState='former' WHERE id='accepted'",
        "UPDATE locationOccupancy SET occupancyState='current' WHERE id='accepted'",
      ],
      [
        "UPDATE locationOccupancy SET assertionState='suppressed' WHERE id='accepted'",
        "UPDATE locationOccupancy SET assertionState='asserted' WHERE id='accepted'",
      ],
      [
        "UPDATE locationOccupancy SET scopeOrganisationId='foreign' WHERE id='accepted'",
        "UPDATE locationOccupancy SET scopeOrganisationId=NULL WHERE id='accepted'",
      ],
      [
        "UPDATE location SET state='manual',ownerOrganisationId='foreign' WHERE id='unit'",
        "UPDATE location SET state='upstream',ownerOrganisationId=NULL WHERE id='unit'",
      ],
      [
        "UPDATE location SET state='manual',ownerOrganisationId='foreign' WHERE id='tenant'",
        "UPDATE location SET state='upstream',ownerOrganisationId=NULL WHERE id='tenant'",
      ],
      [
        'UPDATE featureLocation SET occupancyRevisionId=NULL',
        "UPDATE featureLocation SET occupancyRevisionId='accepted'",
      ],
    ]) {
      db.exec(change)
      expect(read()).toBeNull()
      db.exec(restore)
      expect(read()).toBe('unit-source-id')
    }
  } finally {
    db.close()
  }
})

it('retains facilities, matches exact units and distinguishes disabled from no matches', () => {
  const places = [
    { id: 'one', kind: 'shop' },
    { id: 'two', kind: 'shop' },
    { id: 'lift', kind: 'facility' },
  ] as Place[]
  expect(visibleIndoorPlaces(places, null)).toBe(places)
  expect(visibleIndoorPlaces(places, new Set())).toEqual([places[2]])
  expect(visibleIndoorPlaces(places, new Set(['one']))).toEqual([places[0], places[2]])
  expect(visibleIndoorPlaces(places, new Set(['ONE']))).toEqual([places[2]])
})
