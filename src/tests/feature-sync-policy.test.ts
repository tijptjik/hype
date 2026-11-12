// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { expect, it } from 'vitest'
import { getFeatureSyncPolicy } from '#lib/db/services/featureSyncPolicy.js'
import {
  DEFAULT_PROJECT_LOCATION_POLICY,
  locationRulesForOrigin,
} from '#lib/locations/model.js'
import type { Database } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'

it('projects effective policy through persisted ancestry without crossing project scope', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    sqlite.exec(`CREATE TABLE organisation(id TEXT,settings TEXT);
      CREATE TABLE project(id TEXT,organisationId TEXT,locationPolicy TEXT);
      CREATE TABLE layer(id TEXT,projectId TEXT,relocationPolicy TEXT);
      CREATE TABLE feature(id TEXT,projectId TEXT,layerId TEXT);
      INSERT INTO organisation VALUES ('o','{}');
      INSERT INTO project VALUES ('p','o',NULL);
      INSERT INTO layer VALUES ('l','p','fixed');
      INSERT INTO feature VALUES ('f','p','l');`)
    const prepare = (query: string, values: unknown[] = []) => ({
      bind: (...args: unknown[]) => prepare(query, args),
      raw: async () => {
        const statement = sqlite.prepare(query)
        statement.setReturnArrays(true)
        return statement.all(...(values as never[]))
      },
    })
    const db = drizzle({ prepare } as unknown as D1Database) as unknown as Database
    expect(await getFeatureSyncPolicy(db, 'f', 'other')).toBeNull()
    expect(await getFeatureSyncPolicy(db, 'missing', 'p')).toBeNull()
    expect(await getFeatureSyncPolicy(db, 'f', 'p')).toMatchObject({
      source: 'default',
      policy: DEFAULT_PROJECT_LOCATION_POLICY,
      layerRelocation: 'fixed',
    })
    const inherited = {
      ...DEFAULT_PROJECT_LOCATION_POLICY,
      address: 'follow',
      community: {
        coordinates: { mode: 'review' },
        address: 'review',
        unit: 'review',
        establishment: 'review',
        relocation: 'review',
        communications: 'review',
      },
    }
    sqlite
      .prepare('UPDATE organisation SET settings=?')
      .run(JSON.stringify({ locationPolicy: inherited }))
    const organisation = await getFeatureSyncPolicy(db, 'f', 'p')
    expect(organisation).toMatchObject({
      source: 'organisation',
      sourceId: 'o',
      policy: inherited,
    })
    if (!organisation) throw new Error('Missing inherited policy')
    expect(
      locationRulesForOrigin(organisation.policy, 'community').communications,
    ).toBe('review')
    sqlite
      .prepare('UPDATE project SET locationPolicy=?')
      .run(JSON.stringify(DEFAULT_PROJECT_LOCATION_POLICY))
    expect(await getFeatureSyncPolicy(db, 'f', 'p')).toMatchObject({
      source: 'project',
      sourceId: 'p',
      policy: DEFAULT_PROJECT_LOCATION_POLICY,
    })
    sqlite.exec("UPDATE layer SET projectId='other'")
    expect(await getFeatureSyncPolicy(db, 'f', 'p')).toBeNull()
  } finally {
    sqlite.close()
  }
})
