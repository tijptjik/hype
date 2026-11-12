// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
// DRIZZLE
import { sql } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { drizzle } from 'drizzle-orm/d1'
// TEST
import { afterEach, expect, it } from 'vitest'
// SERVICES
import { featureLocationBrandsSQL } from '#lib/db/services/locationBrandProjection.js'
import { featureLocationLifecycleSQL } from '#lib/db/services/locationLifecycleProjection.js'
import { featureLocationNamesSQL } from '#lib/db/services/locationNameProjection.js'
import { FeatureListProfileAPI, FeatureListRow } from '#lib/db/zod/schema/feature.js'
import * as schema from '#lib/db/schema/index.js'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})
function fixture(includeShared = false) {
  const db = new DatabaseSync(':memory:')
  stores.push(db)
  db.exec(`CREATE TABLE project(id TEXT, organisationId TEXT);
    CREATE TABLE feature(id TEXT, projectId TEXT, isDraft INTEGER, title TEXT);
    CREATE TABLE featureLocation(featureId TEXT, locationId TEXT, factsRevisionId TEXT, acceptedOverrides TEXT);
    CREATE TABLE location(id TEXT, state TEXT, ownerOrganisationId TEXT);
    CREATE TABLE locationRevision(id TEXT, locationId TEXT, facts TEXT);
    CREATE VIEW locationRevisionContent AS SELECT * FROM locationRevision;
    INSERT INTO project VALUES ('project','owner');
    INSERT INTO feature VALUES ('feature','project',0,'Independent Feature title');
    INSERT INTO location VALUES ('venue','manual','owner');
    INSERT INTO featureLocation VALUES ('feature','venue','accepted','{}');`)
  db.prepare('INSERT INTO locationRevision VALUES (?, ?, ?)').run(
    'accepted',
    'venue',
    JSON.stringify({
      schemaVersion: 1,
      i18n: { en: { name: 'Venue name' }, 'zh-hant': { name: '場所名稱' } },
    }),
  )
  db.prepare('INSERT INTO locationRevision VALUES (?, ?, ?)').run(
    'latest',
    'venue',
    JSON.stringify({
      schemaVersion: 1,
      i18n: { en: { name: 'Unaccepted rename' } },
    }),
  )
  db.exec(
    'ALTER TABLE featureLocation ADD COLUMN acceptancePolicy TEXT; CREATE TABLE locationSharedRevision(id TEXT,locationId TEXT,corrections TEXT);',
  )
  const query = new SQLiteSyncDialect().sqlToQuery(
    sql`SELECT ${featureLocationNamesSQL(includeShared)} AS value FROM feature`,
  )
  const read = () =>
    FeatureListProfileAPI.shape.locationNames.parse(
      db.prepare(query.sql).get(...(query.params as string[]))?.value,
    )
  return { db, read }
}

it('projects the accepted venue independently of the Feature title and newer Location revisions', () => {
  const { db, read } = fixture()
  expect(read()).toEqual({ en: 'Venue name', 'zh-hant': '場所名稱' })
  expect(db.prepare('SELECT title FROM feature').get()?.title).toBe(
    'Independent Feature title',
  )
  expect(FeatureListRow.shape.locationNames.parse(JSON.stringify(read()))).toEqual(
    read(),
  )
  db.exec("UPDATE featureLocation SET factsRevisionId='latest'")
  expect(read()).toEqual({ en: 'Unaccepted rename' })
})

it('applies accepted locale corrections and clears without reviving the source name', () => {
  const { db, read } = fixture()
  db.prepare('UPDATE featureLocation SET acceptedOverrides=?').run(
    JSON.stringify({
      names: {
        en: { mode: 'clear' },
        'zh-hant': { mode: 'override', value: '已核准名稱' },
        ja: { mode: 'override', value: '会場' },
      },
    }),
  )
  expect(read()).toEqual({ 'zh-hant': '已核准名稱', ja: '会場' })
  db.prepare('UPDATE featureLocation SET acceptedOverrides=?').run(
    JSON.stringify({ names: { en: { mode: 'inherit' } } }),
  )
  expect(read()?.en).toBe('Venue name')
})

it('does not expose draft, cross-owner private, unlinked or unsupported revision names', () => {
  const { db, read } = fixture()
  db.exec('UPDATE feature SET isDraft=1')
  expect(read()).toBeNull()
  db.exec(
    "UPDATE feature SET isDraft=0; UPDATE location SET ownerOrganisationId='other'",
  )
  expect(read()).toBeNull()
  db.exec(
    "UPDATE location SET ownerOrganisationId='owner'; UPDATE locationRevision SET facts='{}' WHERE id='accepted'",
  )
  expect(read()).toEqual({})
  db.exec(
    `UPDATE locationRevision SET facts='{"schemaVersion":999,"common":{"names":{"en":"Hidden"}}}' WHERE id='accepted'`,
  )
  expect(read()).toBeNull()
  db.exec('DELETE FROM featureLocation')
  expect(read()).toBeNull()
})

it('uses accepted shared pins instead of the latest shared name and applies Organisation precedence', () => {
  const { db, read } = fixture(true)
  const insert = db.prepare('INSERT INTO locationSharedRevision VALUES(?,?,?)')
  insert.run(
    's1',
    'venue',
    JSON.stringify({
      names: { choice: { mode: 'override', value: { en: 'Accepted Hype name' } } },
    }),
  )
  insert.run(
    's2',
    'venue',
    JSON.stringify({
      names: { choice: { mode: 'override', value: { en: 'Unaccepted Hype name' } } },
    }),
  )
  db.prepare('UPDATE featureLocation SET acceptancePolicy=?').run(
    JSON.stringify({ factsSharedRevision: 's1' }),
  )
  expect(read()).toEqual({ en: 'Accepted Hype name' })
  db.prepare('UPDATE featureLocation SET acceptedOverrides=?').run(
    JSON.stringify({ names: { en: { mode: 'override', value: 'Organisation name' } } }),
  )
  expect(read()).toEqual({ en: 'Organisation name' })
  db.prepare('UPDATE featureLocation SET acceptedOverrides=?,acceptancePolicy=?').run(
    '{}',
    JSON.stringify({
      factsSharedRevision: 's1',
      factsSharedFields: [{ field: 'names', revision: 's2' }],
    }),
  )
  expect(read()).toEqual({ en: 'Unaccepted Hype name' })
})

it('leaves the D1 binding budget for request filters across all location projections', () => {
  const requestedId = "feature' OR 1=1 --"
  const query = new SQLiteSyncDialect().sqlToQuery(sql`
    SELECT ${featureLocationBrandsSQL()}, ${featureLocationNamesSQL()},
      ${featureLocationLifecycleSQL()} FROM feature WHERE id=${requestedId}
  `)
  expect(query.params).toEqual([requestedId])
  expect(query.sql).not.toContain(requestedId)
})

it('preserves the binding budget when relational queries alias projection extras', () => {
  const requestedId = "feature' OR 1=1 --"
  const db = drizzle({} as D1Database, { schema })
  const query = db.query.feature
    .findMany({
      columns: { id: true },
      extras: {
        locationBrands: featureLocationBrandsSQL().as('locationBrands'),
        locationNames: featureLocationNamesSQL().as('locationNames'),
        locationLifecycle: featureLocationLifecycleSQL().as('locationLifecycle'),
      },
      where: sql`${schema.feature.id} = ${requestedId}`,
    })
    .toSQL()
  expect(query.params).toEqual([requestedId])
  expect(query.sql).not.toContain(requestedId)
})
