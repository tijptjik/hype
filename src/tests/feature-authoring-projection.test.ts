// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { expect, it } from 'vitest'
import { featureAuthoringSQL } from '#lib/db/services/featureAuthoringProjection.js'
import {
  FeatureAdminProfileAPI,
  FeatureListProfileAPI,
  FeatureListRow,
  FeatureUpdate,
  FeatureInsert,
} from '#lib/db/zod/schema/feature.js'

it('projects only record-owned naming state without querying parent tables', () => {
  const db = new DatabaseSync(':memory:')
  try {
    // Deliberately omit Project/Layer tables: this projection must never read parent policy.
    db.exec(`CREATE TABLE feature(id TEXT);
      CREATE TABLE featureLocation(featureId TEXT, acceptancePolicy TEXT);
      INSERT INTO feature VALUES('f');`)
    const query = new SQLiteSyncDialect().sqlToQuery(
      sql`SELECT ${featureAuthoringSQL()} value FROM feature`,
    )
    const read = () => {
      const raw = db.prepare(query.sql).get(...(query.params as string[]))?.value
      const parsed = FeatureAdminProfileAPI.shape.authoring.parse(raw)
      expect(JSON.parse(raw as string)).toEqual(parsed)
      expect(FeatureListProfileAPI.shape.authoring.parse(raw)).toEqual(parsed)
      expect(FeatureListRow.shape.authoring.parse(raw)).toEqual(parsed)
      return parsed
    }
    expect(read()).toEqual({ nameMode: 'independent' })
    db.exec("INSERT INTO featureLocation VALUES('f',NULL)")
    expect(read()).toEqual({ nameMode: 'inherit' })
    db.exec(`UPDATE featureLocation SET acceptancePolicy='{"nameMode":"independent"}'`)
    expect(read()).toEqual({ nameMode: 'independent' })
  } finally {
    db.close()
  }
})

it('keeps saved matching decisions out of ordinary Feature write inputs', () => {
  const spoofed = {
    reconciliationSkippedAt: '2026-11-15T00:00:00.000Z',
    reconciliationSkippedBy: 'another-user',
  }
  expect(FeatureUpdate.parse(spoofed)).toEqual({})
  expect(FeatureInsert.partial().parse(spoofed)).not.toHaveProperty(
    'reconciliationSkippedAt',
  )
  expect(FeatureInsert.partial().parse(spoofed)).not.toHaveProperty(
    'reconciliationSkippedBy',
  )
})
