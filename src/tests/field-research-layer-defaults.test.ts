// @vitest-environment node
import { expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import {
  firstResearchLayerSQL,
  initialResearchLayersSQL,
} from '#lib/db/services/fieldResearchLayers.js'

it('includes all eligible layers, chooses the first by name, and preserves exclusions on retry', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`CREATE TABLE layer(id TEXT,projectId TEXT,organisationId TEXT,isArchived INTEGER,historicalSourceLayerId TEXT);
      CREATE TABLE layerI18n(layerId TEXT,locale TEXT,name TEXT);
      CREATE TABLE fieldResearchSession(id TEXT PRIMARY KEY,layerId TEXT);
      CREATE TABLE fieldResearchSessionLayer(sessionId TEXT,layerId TEXT,isDefault INTEGER,overrides TEXT);
      INSERT INTO layer VALUES('z','p','o',0,NULL),('a','p','o',0,NULL),('archived','p','o',1,NULL),('historic','p','o',0,'old'),('other','other','o',0,NULL);
      INSERT INTO layerI18n VALUES('z','en','Donors'),('a','en','Dropoff Points');`)
    const dialect = new SQLiteSyncDialect()
    const first = dialect.sqlToQuery(firstResearchLayerSQL('p', 'o'))
    const seed = dialect.sqlToQuery(initialResearchLayersSQL('s', 'p', 'o'))
    const create = () => {
      db.prepare(
        `INSERT INTO fieldResearchSession SELECT 's',${first.sql} ON CONFLICT DO NOTHING`,
      ).run(...(first.params as string[]))
      db.prepare(`INSERT INTO fieldResearchSessionLayer ${seed.sql}`).run(
        ...(seed.params as string[]),
      )
    }
    create()
    expect(
      db
        .prepare(
          'SELECT layerId,isDefault FROM fieldResearchSessionLayer ORDER BY layerId',
        )
        .all(),
    ).toEqual([
      { layerId: 'a', isDefault: 0 },
      { layerId: 'z', isDefault: 1 },
    ])
    db.exec(
      "DELETE FROM fieldResearchSessionLayer WHERE layerId='a'; UPDATE fieldResearchSessionLayer SET isDefault=0",
    )
    create()
    expect(
      db.prepare('SELECT layerId,isDefault FROM fieldResearchSessionLayer').all(),
    ).toEqual([{ layerId: 'z', isDefault: 0 }])
  } finally {
    db.close()
  }
})
