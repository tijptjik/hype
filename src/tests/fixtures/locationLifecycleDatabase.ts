// TEST DATABASE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { drizzle } from 'drizzle-orm/d1'
import { feature as featureTable } from '#lib/db/schema/feature.js'
import type { Database } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'

/** Build a transactional D1 adapter over the real lifecycle migration chain. */
export function setupLifecycleDatabase(
  includeScope = false,
  includeAddressKind = true,
  beforeCorrections?: (db: DatabaseSync) => void,
) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE organisation(id TEXT PRIMARY KEY);
    CREATE TABLE organisationI18n(organisationId TEXT,locale TEXT,name TEXT,nameShort TEXT);
    INSERT INTO organisation VALUES ('p'),('other');
    CREATE TABLE project(id TEXT PRIMARY KEY, modifiedAt TEXT DEFAULT 'original',
      organisationId TEXT, code TEXT, capabilities TEXT, markerStyleCode TEXT,
      cardStyleCode TEXT, useAllInOrgContext INTEGER);
    CREATE TABLE feature(id TEXT PRIMARY KEY, projectId TEXT, isDraft INTEGER DEFAULT 0, isArchived INTEGER DEFAULT 0, modifiedAt TEXT DEFAULT 'original', geometry TEXT, addressMeta TEXT, isIntangible INTEGER DEFAULT 0);
    CREATE TABLE featureI18n(featureId TEXT,locale TEXT,title TEXT,displayAddress TEXT);
    CREATE TABLE hub(id TEXT PRIMARY KEY,code TEXT);
    CREATE TABLE property(id TEXT PRIMARY KEY,key TEXT,scope TEXT,hubId TEXT,audience TEXT NOT NULL DEFAULT 'public');
    CREATE TABLE featureProperty(featureId TEXT,propertyId TEXT,propertyValueId TEXT,value TEXT,valueJson TEXT);
    CREATE TABLE propertyValue(id TEXT PRIMARY KEY,propertyId TEXT);
    CREATE TABLE propertyValueI18n(propertyValueId TEXT,locale TEXT,value TEXT);
    INSERT INTO project(id,organisationId) VALUES ('p','p'), ('other','other');
    INSERT INTO feature(id,projectId) VALUES ('f','p');`)
  sqlite.exec(readFileSync('migrations/0102_place_inheritance_foundation.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0110_feature_place_history.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0112_feature_place_detachment.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0113_place_adoption_review.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0116_place_identity_history.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0117_place_identity_review.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0118_place_merge_redirect.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0120_place_identity_rejection.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0123_place_owned_fields.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0124_place_adoption_decisions.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0125_place_identity_consolidation.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0135_place_organisation_ownership.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0137_location_kinds.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0114_place_refresh.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0115_place_refresh_processing.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0119_place_source_changes.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0121_place_refresh_identity_scan.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0122_simplify_place_refresh.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0138_location_storage.sql', 'utf8'))
  sqlite.exec(
    readFileSync('migrations/0139_organisation_location_corrections.sql', 'utf8'),
  )
  sqlite.exec(
    readFileSync('migrations/0141_organisation_location_scope_guards.sql', 'utf8'),
  )
  if (includeAddressKind)
    sqlite.exec(readFileSync('migrations/0140_location_address_kind.sql', 'utf8'))
  for (const migration of [
    '0142_location_facts_snapshots.sql',
    '0148_location_relationships.sql',
  ])
    sqlite.exec(readFileSync('migrations/' + migration, 'utf8'))
  beforeCorrections?.(sqlite)
  for (const migration of [
    '0149_location_correction_rows.sql',
    '0150_location_placement_candidates.sql',
    '0151_location_placement_acceptance.sql',
    '0153_location_relationship_review.sql',
    '0154_location_version_names.sql',
  ])
    sqlite.exec(readFileSync('migrations/' + migration, 'utf8'))
  sqlite.exec(readFileSync('migrations/0157_location_rematching.sql', 'utf8'))
  // Scope-focused cases explicitly install their guards after arranging legacy input.
  if (!includeScope)
    sqlite.exec(`DROP TRIGGER feature_location_scope_insert;
    DROP TRIGGER feature_location_scope_update; DROP TRIGGER feature_location_feature_scope;
    DROP TRIGGER feature_location_owner_scope;`)

  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => {
      if (args.length > 100) throw new Error('D1 parameter limit exceeded')
      return prepare(query, args)
    },
    first: async () => sqlite.prepare(query).get(...(values as never[])) ?? null,
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return statement.all(...(values as never[]))
    },
    all: async () => ({
      results: sqlite.prepare(query).all(...(values as never[])),
      success: true,
      meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get()?.n ?? 0) },
    }),
    run: async () => ({
      success: true,
      meta: {
        changes: Number(sqlite.prepare(query).run(...(values as never[])).changes),
      },
    }),
  })
  const batch = async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.all())
      sqlite.exec('COMMIT')
      return results
    } catch (cause) {
      sqlite.exec('ROLLBACK')
      throw cause
    }
  }
  return {
    sqlite,
    binding: { prepare, batch } as unknown as D1Database,
    db: drizzle({ prepare, batch } as unknown as D1Database, {
      schema: { feature: featureTable },
    }) as unknown as Database,
  }
}
