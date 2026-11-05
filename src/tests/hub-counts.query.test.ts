// NODE
import { readFileSync } from 'node:fs'
// VITEST
import { expect, it, vi } from 'vitest'
// DRIZZLE
import { getTableColumns, getTableName } from 'drizzle-orm'
// DB
import * as schema from '#lib/db/schema/index.js'
import { publicationSqlite } from './fixtures/publicationSqlite.js'
// SERVICES
import {
  hubCollectionWithRelations,
  toListResponseShape,
} from '#lib/api/services/hub.js'
import { createAdminIndexCardModel } from '#lib/adapters/cards/createAdminIndexCardModel.js'
import { FirstClassResource } from '#lib/enums.js'
import {
  getOrganisationHubFilter,
  getProjectHubFilter,
  getLayerHubFilter,
} from '#lib/db/services/hub.js'
import type { Database } from '#lib/types.js'

// Canvas fallback generation is outside the count rendering contract.
vi.mock('#lib/client/services/image.js', () => ({
  getHashiconUrl: () => '',
  getURLfromImage: () => '',
}))

it('loads stored totals through the hub relation and renders them without child collections', async () => {
  const { db, sqlite } = publicationSqlite(schema)
  try {
    // Build the hub columns from the real schema so the relational select is exercised.
    sqlite.exec(`CREATE TABLE hub (${Object.values(getTableColumns(schema.hub))
      .map(
        column =>
          `"${column.name}" ${column.getSQLType()}${column.name === 'id' ? ' PRIMARY KEY' : ''}`,
      )
      .join(',')});
      CREATE TABLE organisation(id TEXT PRIMARY KEY, hubId TEXT, isCoreInclusive INTEGER DEFAULT 1, isHubExclusive INTEGER DEFAULT 0);
      CREATE TABLE project(id TEXT PRIMARY KEY, organisationId TEXT);
      CREATE TABLE layer(id TEXT PRIMARY KEY, organisationId TEXT, projectId TEXT);
      INSERT INTO hub(id,code,createdAt,modifiedAt,isPublished,isArchived,isSubscriptionAvailable,subscriptionPlacement)
      VALUES ('h','test','2026-11-05','2026-11-05',1,0,0,'{}');
      INSERT INTO organisation(id,hubId) VALUES ('o','h');
      INSERT INTO project VALUES ('p','o'),('p2','o');
      INSERT INTO layer VALUES ('l','o','p'),('l2','o','p'),('l3','o','p2');`)
    sqlite.exec(readFileSync('migrations/0174_hub_counts.sql', 'utf8'))
    expect(hubCollectionWithRelations.counts).toBe(true)
    const rows = await db.query.hub.findMany({ with: { counts: true } })
    const result = toListResponseShape({
      data: rows.map(row => ({ ...row, i18n: [] })) as never,
      profile: 'card',
    })
    expect(result.data[0].counts).toEqual({
      organisationCount: 1,
      projectCount: 2,
      layerCount: 3,
    })
    // No queries.rows collections exist: card rendering must depend only on the response.
    const model = createAdminIndexCardModel({
      adminCtx: {
        view: { getUserPreferences: () => ({}), cache: { hub: new Map() } },
      } as never,
      resourceType: FirstClassResource.hub,
      entity: result.data[0] as never,
      keyMap: { id: 'code', title: 'code', image: 'image' },
    })
    expect(model.breadcrumbs?.map(crumb => crumb.label)).toEqual(['1', '2', '3'])
    const unavailable = createAdminIndexCardModel({
      adminCtx: {
        view: { getUserPreferences: () => ({}), cache: { hub: new Map() } },
      } as never,
      resourceType: FirstClassResource.hub,
      entity: { ...result.data[0], counts: null } as never,
      keyMap: { id: 'code', title: 'code', image: 'image' },
    })
    expect(unavailable.breadcrumbs?.map(crumb => crumb.label)).toEqual(['—', '—', '—'])

    // EXISTS queries select full schema rows; supply unused nullable fixture columns too.
    for (const table of [schema.organisation, schema.project]) {
      const name = getTableName(table)
      const existing = new Set(
        sqlite
          .prepare(`PRAGMA table_info("${name}")`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table))) {
        if (!existing.has(column.name))
          sqlite.exec(
            `ALTER TABLE "${name}" ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
      }
    }

    // Compare stored membership directly with the application predicates, not a copied formula.
    sqlite.exec("INSERT INTO hub(id,code) VALUES ('core-h','core')")
    for (const mutation of [
      'SELECT 1',
      "UPDATE organisation SET isCoreInclusive=0 WHERE id='o'",
      "UPDATE organisation SET isCoreInclusive=1,isHubExclusive=1 WHERE id='o'",
      "UPDATE organisation SET hubId=NULL WHERE id='o'",
      "UPDATE organisation SET hubId='h',isHubExclusive=0 WHERE id='o'",
    ]) {
      sqlite.exec(mutation)
      for (const [hubId, code] of [
        ['h', 'test'],
        ['core-h', 'core'],
      ]) {
        const opts = { code, isCore: code === 'core' }
        const serviceDb = db as unknown as Database
        const organisations = await db
          .select({ id: schema.organisation.id })
          .from(schema.organisation)
          .where(getOrganisationHubFilter(serviceDb, opts))
        const projects = await db
          .select({ id: schema.project.id })
          .from(schema.project)
          .where(getProjectHubFilter(serviceDb, opts))
        const layers = await db
          .select({ id: schema.layer.id })
          .from(schema.layer)
          .where(getLayerHubFilter(serviceDb, opts))
        expect(
          sqlite
            .prepare(
              'SELECT organisationCount,projectCount,layerCount FROM hubCounts WHERE hubId=?',
            )
            .get(hubId),
        ).toEqual({
          organisationCount: organisations.length,
          projectCount: projects.length,
          layerCount: layers.length,
        })
      }
    }
  } finally {
    sqlite.close()
  }
})
