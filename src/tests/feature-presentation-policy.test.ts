// @vitest-environment node
import { expect, it } from 'vitest'
import { resolveFeaturePresentationPolicy } from '#lib/features/presentationPolicy.js'
import {
  featurePresentationPolicySQL,
  readFeaturePresentationPolicy,
} from '#lib/db/services/featurePresentationPolicy.js'
import { setupLifecycleDatabase } from './fixtures/locationLifecycleDatabase'

it('preserves legacy defaults and respects explicit false Layer overrides', () => {
  expect(resolveFeaturePresentationPolicy()).toEqual({
    allowDescriptions: true,
    locationBasedNames: false,
  })
  expect(
    resolveFeaturePresentationPolicy(
      { allowFeatureDescriptions: false, locationBasedFeatureNames: true },
      { allowFeatureDescriptions: true, locationBasedFeatureNames: false },
    ),
  ).toEqual({ allowDescriptions: true, locationBasedNames: false })
  expect(
    resolveFeaturePresentationPolicy(
      { allowFeatureDescriptions: false, locationBasedFeatureNames: true },
      { allowFeatureDescriptions: null, locationBasedFeatureNames: null },
    ),
  ).toEqual({ allowDescriptions: false, locationBasedNames: true })
})

it('reads the policy from the persisted Layer and its Project', async () => {
  const store = setupLifecycleDatabase()
  try {
    store.sqlite.exec(`ALTER TABLE project ADD COLUMN flags TEXT;
      CREATE TABLE layer(id TEXT PRIMARY KEY, projectId TEXT, metadata TEXT);
      UPDATE project SET flags='{"allowFeatureDescriptions":false,"locationBasedFeatureNames":true}' WHERE id='p';
      INSERT INTO layer VALUES ('l','p','{"locationBasedFeatureNames":false}');`)
    expect(await readFeaturePresentationPolicy(store.db, 'l')).toEqual({
      allowDescriptions: false,
      locationBasedNames: false,
    })
    store.sqlite.exec(`UPDATE layer SET metadata='{}' WHERE id='l'`)
    expect(await readFeaturePresentationPolicy(store.db, 'l')).toEqual({
      allowDescriptions: false,
      locationBasedNames: true,
    })
  } finally {
    store.sqlite.close()
  }
})

it('projects first-frame policy without hydrating parent records', async () => {
  const { DatabaseSync } = await import('node:sqlite')
  const { SQLiteSyncDialect } = await import('drizzle-orm/sqlite-core')
  const { sql } = await import('drizzle-orm')
  const { FeatureAdminProfileAPI } = await import('#lib/db/zod/schema/feature.js')
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE feature(id TEXT, layerId TEXT);
      CREATE TABLE layer(id TEXT, projectId TEXT, metadata TEXT);
      CREATE TABLE project(id TEXT, flags TEXT);
      INSERT INTO feature VALUES('f','l');
      INSERT INTO layer VALUES('l','p','{}');
      INSERT INTO project VALUES('p','{"allowFeatureDescriptions":false,"locationBasedFeatureNames":true}');`)
    const query = new SQLiteSyncDialect().sqlToQuery(
      sql`SELECT ${featurePresentationPolicySQL()} policy FROM feature`,
    )
    const read = () =>
      FeatureAdminProfileAPI.shape.presentationPolicy.parse(
        db.prepare(query.sql).get(...(query.params as string[]))?.policy,
      )
    expect(read()).toEqual({ allowDescriptions: false, locationBasedNames: true })
    db.exec(
      `UPDATE layer SET metadata='{"allowFeatureDescriptions":true,"locationBasedFeatureNames":false}'`,
    )
    expect(read()).toEqual({ allowDescriptions: true, locationBasedNames: false })
  } finally {
    db.close()
  }
})
