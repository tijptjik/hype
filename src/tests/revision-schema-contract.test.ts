// @vitest-environment node
// NODE
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
// TESTS
import { expect, it } from 'vitest'
// DRIZZLE
import { getTableName } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
// SCHEMA
import * as featureTables from '#lib/db/schema/featureRevision.js'
import * as organisationTables from '#lib/db/schema/organisationRevision.js'
import * as catalogTables from '#lib/db/schema/propertyCatalogRevision.js'
import * as imageTables from '#lib/db/schema/imageRevision.js'
import * as identityTables from '#lib/db/schema/featureIdentityProposal.js'
import * as privateTables from '#lib/db/schema/featurePrivateCapture.js'

it('keeps revision migrations aligned with Drizzle columns and foreign-key ownership', () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(
      'PRAGMA foreign_keys=ON; CREATE TABLE feature(id TEXT PRIMARY KEY,isPublished INTEGER); CREATE TABLE image(id TEXT PRIMARY KEY);',
    )
    sqlite.exec(readFileSync('migrations/0171_feature_revisions.sql', 'utf8'))
    sqlite.exec(readFileSync('migrations/0172_image_revisions.sql', 'utf8'))
    sqlite.exec(readFileSync('migrations/0188_feature_identity_proposals.sql', 'utf8'))
    sqlite.exec(readFileSync('migrations/0189_feature_private_capture.sql', 'utf8'))
    sqlite.exec(
      'CREATE TABLE organisation(id TEXT PRIMARY KEY); CREATE TABLE organisationI18n(organisationId TEXT); CREATE TABLE organisationUserPolicy(organisationId TEXT); CREATE TABLE organisationProperty(organisationId TEXT);',
    )
    sqlite.exec(readFileSync('migrations/0173_organisation_revisions.sql', 'utf8'))
    sqlite.exec(
      'CREATE TABLE property(id TEXT PRIMARY KEY,scope TEXT,organisationId TEXT,hubId TEXT,projectId TEXT); CREATE TABLE propertyI18n(propertyId TEXT); CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT); CREATE TABLE propertyValueI18n(propertyValueId TEXT);',
    )
    sqlite.exec(readFileSync('migrations/0176_property_catalog_revisions.sql', 'utf8'))
    for (const table of Object.values({
      ...featureTables,
      ...imageTables,
      ...identityTables,
      ...privateTables,
      ...organisationTables,
      ...catalogTables,
    })) {
      const config = getTableConfig(table)
      const columns = sqlite
        .prepare('SELECT name, "notnull" AS required FROM pragma_table_info(?)')
        .all(config.name)
      expect(columns).toEqual(
        config.columns.map(column => ({
          name: column.name,
          required: column.notNull ? 1 : 0,
        })),
      )
      const foreignKeys = sqlite
        .prepare(
          'SELECT id,seq,"table" AS target,"from" AS source,"to" AS destination FROM pragma_foreign_key_list(?) ORDER BY id,seq',
        )
        .all(config.name)
      const actual = new Map<
        unknown,
        { target: unknown; columns: unknown[]; foreignColumns: unknown[] }
      >()
      for (const key of foreignKeys) {
        const existing = actual.get(key.id) ?? {
          target: key.target,
          columns: [],
          foreignColumns: [],
        }
        existing.columns.push(key.source)
        existing.foreignColumns.push(key.destination)
        actual.set(key.id, existing)
      }
      const expected = config.foreignKeys.map(key => {
        const ref = key.reference()
        return {
          target: getTableName(ref.foreignTable),
          columns: ref.columns.map(column => column.name),
          foreignColumns: ref.foreignColumns.map(column => column.name),
        }
      })
      expect([...actual.values()].map(value => JSON.stringify(value)).sort()).toEqual(
        expected.map(value => JSON.stringify(value)).sort(),
      )
    }
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(sqlite.prepare('PRAGMA integrity_check').get()).toEqual({
      integrity_check: 'ok',
    })
  } finally {
    sqlite.close()
  }
})
