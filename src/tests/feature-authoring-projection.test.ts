// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { sql } from 'drizzle-orm'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import { expect, it } from 'vitest'
import { featureAuthoringSQL } from '#lib/db/services/featureAuthoringProjection.js'
import { FeatureAdminProfileAPI, FeatureListProfileAPI, FeatureListRow } from '#lib/db/zod/schema/feature.js'

it('projects stored ownership and effective policy through list and admin cache contracts', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE feature(id TEXT, projectId TEXT, layerId TEXT);
      CREATE TABLE featureLocation(featureId TEXT, acceptancePolicy TEXT);
      CREATE TABLE project(id TEXT, flags TEXT);
      CREATE TABLE layer(id TEXT, metadata TEXT);
      INSERT INTO feature VALUES('f','p','l');
      INSERT INTO project VALUES('p','{}');
      INSERT INTO layer VALUES('l','{}');`)
    const query = new SQLiteSyncDialect().sqlToQuery(sql`SELECT ${featureAuthoringSQL()} value FROM feature`)
    const read = () => {
      const raw = db.prepare(query.sql).get(...query.params as string[])?.value
      const parsed = FeatureAdminProfileAPI.shape.authoring.parse(raw)
      expect(FeatureListProfileAPI.shape.authoring.parse(raw)).toEqual(parsed)
      expect(FeatureListRow.shape.authoring.parse(raw)).toEqual(parsed)
      return parsed
    }
    expect(read()).toEqual({ nameMode: 'independent', locationBasedNames: false, allowDescriptions: true })
    db.exec("INSERT INTO featureLocation VALUES('f',NULL)")
    expect(read()?.nameMode).toBe('inherit')
    db.exec(`UPDATE featureLocation SET acceptancePolicy='{"nameMode":"independent"}';
      UPDATE project SET flags='{"locationBasedFeatureNames":true,"allowFeatureDescriptions":false}'`)
    expect(read()).toEqual({ nameMode: 'independent', locationBasedNames: true, allowDescriptions: false })
    db.exec(`UPDATE layer SET metadata='{"locationBasedFeatureNames":false,"allowFeatureDescriptions":true}'`)
    expect(read()).toEqual({ nameMode: 'independent', locationBasedNames: false, allowDescriptions: true })
    db.exec(`UPDATE layer SET metadata='{"locationBasedFeatureNames":null,"allowFeatureDescriptions":null}'`)
    expect(read()).toEqual({ nameMode: 'independent', locationBasedNames: true, allowDescriptions: false })
  } finally { db.close() }
})
