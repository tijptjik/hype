// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// DRIZZLE
import { and, eq, getTableColumns, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// VITEST
import { afterEach, describe, expect, it, vi } from 'vitest'
// DB
import * as schema from '$lib/db/schema'
import { feature, featureNeighbourhood } from '$lib/db/schema'
import {
  buildFeatureQueryConditions,
  buildFeatureQuerySource,
  buildFeaturePrismConditions,
  buildFeatureRollupConditions,
  featureQuerySignature,
  queryFeaturePage,
} from '$lib/db/services/featureQuery'
import { listFeatures } from '$lib/db/services/feature'
import { applyPrismConstraints } from '$lib/db'
import { HierarchicalResource } from '$lib/enums'
// TYPES
import type { Database } from '$lib/types'
import type { FeatureQueryInput } from '$lib/api/services/featureQuery.types'

vi.mock('$lib/api/services/feature', () => ({
  getFeatureWithRelations: () => ({ division: { with: { i18n: true } }, divisionMemberships: { columns: { divisionId: true, selected: true } } }),
  toListResponseShape: async (result: unknown) => result,
}))
const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})
const hub = { isSuperAdmin: true, isAdminRequest: true } as never
const base = [
  eq(feature.isPublished, true),
  eq(feature.isArchived, false),
  eq(feature.isDraft, false),
]
const input = (extra: Partial<FeatureQueryInput> = {}): FeatureQueryInput => ({
  meta: { isAdminRequest: false, scope: 'test' },
  ...extra,
})

/** Executes production Drizzle SQL on SQLite with D1's prepared-statement interface. */
function setup(withOrphan = false) {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  const columns = Object.values(getTableColumns(feature)).filter(column => !/^division(?:Id|Level[1-6]Id)$|^landformLeafId$/.test(column.name)).map(
    column =>
      `"${column.name}" ${column.getSQLType()}${column.primary ? ' PRIMARY KEY' : ''}`,
  )
  sqlite.exec(`CREATE TABLE feature (${columns.join(',')});
    CREATE TABLE featureI18n(featureId TEXT, locale TEXT, title TEXT, description TEXT, displayAddress TEXT, addressProperties TEXT, PRIMARY KEY(featureId,locale));
    CREATE TABLE featureProperty(featureId TEXT, propertyId TEXT, propertyValueId TEXT, value TEXT, PRIMARY KEY(featureId,propertyId));
    CREATE TABLE userFeature(userId TEXT, featureId TEXT, isWishlisted INTEGER, isVisited INTEGER, visitedAt TEXT, createdAt TEXT, modifiedAt TEXT, PRIMARY KEY(userId,featureId));
    CREATE TABLE featureSpatial(featureId TEXT, resolution INTEGER, cell TEXT, latitude REAL, longitude REAL, PRIMARY KEY(featureId,resolution));
    CREATE INDEX featureSpatial_cell_layer_idx ON featureSpatial(resolution,cell,featureId,longitude,latitude);
    CREATE TABLE layer(id TEXT PRIMARY KEY, projectId TEXT, organisationId TEXT, isPublished INTEGER, isArchived INTEGER);
    CREATE TABLE project(id TEXT PRIMARY KEY, code TEXT, organisationId TEXT, isPublished INTEGER, isArchived INTEGER);
    CREATE TABLE organisation(id TEXT PRIMARY KEY, code TEXT, hubId TEXT, isHubExclusive INTEGER, isCoreInclusive INTEGER, isPublished INTEGER, isArchived INTEGER);
    CREATE TABLE hub(id TEXT PRIMARY KEY, code TEXT, domain TEXT);
    CREATE TABLE hubRole(hubId TEXT, userId TEXT, role TEXT);
    CREATE TABLE organisationRole(organisationId TEXT, userId TEXT, role TEXT);
    CREATE TABLE projectRole(projectId TEXT, userId TEXT, role TEXT);`)
  if (withOrphan)
    sqlite.exec(
      `INSERT INTO featureI18n VALUES('orphan', 'en', 'Orphan title', NULL, NULL, '{}')`,
    )
  sqlite.exec('PRAGMA foreign_keys = ON')
  sqlite.exec(readFileSync('migrations/0079_feature_query_indexes.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0080_feature_count_cache.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0081_feature_search_fts.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0082_feature_division_refresh.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0083_feature_division_registry.sql', 'utf8'))
  const statements: string[] = []
  const prepare = (query: string, bindings: unknown[] = []) => ({
    bind: (...params: unknown[]) => prepare(query, params),
    all: async () => {
      statements.push(query)
      return { results: sqlite.prepare(query).all(...(bindings as never[])) }
    },
    raw: async () => {
      statements.push(query)
      return sqlite
        .prepare(query)
        .all(...(bindings as never[]))
        .map(row => Object.values(row))
    },
    run: async () => {
      statements.push(query)
      return { results: [], meta: sqlite.prepare(query).run(...(bindings as never[])) }
    },
  })
  const db = drizzle({ prepare } as never, { schema }) as Database
  function add(
    id: string,
    title: string,
    neighbourhood: string | null,
    layerId = 'layer',
    published = 1,
  ) {
    sqlite
      .prepare(`INSERT INTO feature(id,layerId,projectId,organisationId,isPublished,isArchived,isDraft,isVisitable,isIntangible,geometry,addressMeta)
      VALUES(?,?, 'project','org',?,0,0,1,0,'{"type":"Point","coordinates":[114,22]}','{}')`)
      .run(id, layerId, published)
    sqlite
      .prepare('INSERT INTO featureI18n VALUES(?, ?, ?, null, null, ?)')
      .run(id, 'en', title, JSON.stringify({ neighbourhood }))
    if (neighbourhood) {
      sqlite.prepare('INSERT INTO divisionDefinition VALUES(?,?,?) ON CONFLICT(id) DO NOTHING')
        .run(neighbourhood, 'r1', JSON.stringify({ level: 5, category: 'hood', class: 'neighbourhood', names: { en: { name: neighbourhood } } }))
      sqlite.prepare('UPDATE feature SET divisionId=?,divisionLevel5Id=? WHERE id=?').run(neighbourhood, neighbourhood, id)
      sqlite.prepare('INSERT INTO featureDivisionMembership VALUES(?,?,1)').run(id, neighbourhood)
    }
  }
  add('a', 'North 茶餐廳 100%', 'Central')
  add('b', 'North cafe', 'Central')
  add('c', 'South place', 'Wan Chai')
  add('d', 'North private', 'Central', 'layer', 0)
  add('e', 'Other layer', null, 'other')
  sqlite.exec(`INSERT INTO featureProperty VALUES('a','kind','cafe',NULL),('b','kind','bar',NULL),('a','number',NULL,'5'),('b','number',NULL,'garbage');
    INSERT INTO userFeature(userId,featureId,isWishlisted,isVisited) VALUES('user','a',1,0),('user','c',0,1),('other','b',1,0);
    INSERT INTO featureSpatial VALUES('a',7,'cell',22,114),('b',7,'cell',22,115),('c',7,'other',22,114);`)
  return { db, sqlite, add, statements }
}

describe('indexed feature queries', () => {
  it('filters selected stable division IDs without double-counting ancestors or candidates', async () => {
    const { db, sqlite } = setup()
    sqlite.exec("INSERT INTO featureDivisionMembership VALUES('a','parent',1),('b','parent',1),('c','parent',0)")
    const page = await queryFeaturePage(db, input({ filters: { divisionIds: ['parent', 'Central'] } }), base, hub)
    expect(page.data.map(row => row.id)).toEqual(['a', 'b'])
    expect(page.totalCount).toBe(2)
    expect(page.data[0].division?.i18n).toEqual(expect.arrayContaining([expect.objectContaining({ locale: 'en', name: 'Central' })]))
    expect(page.data[0].divisionId).toBe('Central')
  })

  it('keeps large viewport cursor identities fixed-size and bound to the query', async () => {
    const query = input({
      excludeIds: Array.from({ length: 500 }, (_, index) => `feature-${index}`),
      spatial: {
        resolution: 7,
        cells: Array.from({ length: 256 }, (_, index) => `cell-${index}`),
      },
      filters: {
        properties: {
          layer: Object.fromEntries(
            Array.from({ length: 80 }, (_, index) => [
              `property-${index}`,
              ['selected'],
            ]),
          ),
        },
      },
    })
    const signature = await featureQuerySignature(query)
    expect(signature).toMatch(/^[a-f0-9]{64}$/)
    expect(
      await featureQuerySignature({
        ...query,
        cursor: { id: 'page-end', signature },
        limit: 5,
        includeCounts: false,
      }),
    ).toBe(signature)
    expect(await featureQuerySignature({ ...query, q: 'different' })).not.toBe(
      signature,
    )
    expect(await featureQuerySignature({ ...query, excludeIds: [] })).not.toBe(
      signature,
    )
    expect(
      await featureQuerySignature({
        ...query,
        meta: { ...query.meta, scope: 'another-user' },
      }),
    ).not.toBe(signature)
  })

  it('excludes retained markers from page data while keeping full counts and facets', async () => {
    const { db } = setup()
    const request = input({ q: 'North', excludeIds: ['a'] })
    const page = await queryFeaturePage(db, request, base, hub)
    expect(page.data.map(row => row.id)).toEqual(['b'])
    expect(page.totalCount).toBe(2)
    expect(page.facets?.neighbourhoods).toEqual({ Central: 2 })
  })

  it('does no aggregate, revision or count-cache work when counts are omitted', async () => {
    const { db, statements } = setup()
    const page = await queryFeaturePage(
      db,
      input({ q: 'North', includeCounts: false, excludeIds: ['a'] }),
      base,
      hub,
    )
    expect(page.data.map(row => row.id)).toEqual(['b'])
    expect(page.totalCount).toBeNull()
    expect(page.facets).toBeNull()
    expect(statements.join('\n')).not.toContain('featureCount')
    expect(statements.join('\n')).not.toContain('count(*)')
  })

  it('sums maintained bins for common flag and neighbourhood counts', async () => {
    const { db, statements } = setup()
    const page = await queryFeaturePage(
      db,
      input({ filters: { isVisitable: true, neighbourhoods: ['Central'] } }),
      base,
      hub,
    )
    expect(page.totalCount).toBe(2)
    expect(page.facets?.neighbourhoods).toEqual({ Central: 2 })
    expect(
      statements.some(
        statement =>
          statement.includes('sum("feature"."totalCount")') &&
          statement.includes('featureCountRollup'),
      ),
    ).toBe(true)
    expect(statements.join('\n')).not.toContain('count(*)')
    expect(statements.join('\n')).not.toContain('featureCountCache')
  })

  it('reuses a detailed count across pages, exclusions, ordering and client cache scopes', async () => {
    const { db, statements, sqlite } = setup()
    const request = input({ q: 'North', limit: 1 })
    const first = await queryFeaturePage(db, request, base, hub)
    const second = await queryFeaturePage(
      db,
      { ...request, cursor: first.nextCursor },
      base,
      hub,
    )
    const third = await queryFeaturePage(
      db,
      {
        ...request,
        limit: 100,
        excludeIds: ['a'],
        sorting: { sortBy: 'id', sortOrder: 'desc' },
        meta: { ...request.meta, scope: 'other-client-cache' },
      },
      base,
      hub,
    )
    expect([first.totalCount, second.totalCount, third.totalCount]).toEqual([2, 2, 2])
    expect(
      statements.filter(
        statement =>
          statement.includes('count(*)') && statement.includes('featureNeighbourhood'),
      ),
    ).toHaveLength(1)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureCountCache').get()?.count,
    ).toBe(1)
  })

  it('separates counts by the actual authorization predicate despite equal client scope', async () => {
    const { db, statements } = setup()
    const request = input({ q: 'North' })
    expect(
      (await queryFeaturePage(db, request, [...base, eq(feature.id, 'a')], hub))
        .totalCount,
    ).toBe(1)
    expect(
      (await queryFeaturePage(db, request, [...base, eq(feature.id, 'b')], hub))
        .totalCount,
    ).toBe(1)
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(2)
    expect(
      statements.filter(
        statement =>
          statement.includes('count(*)') && statement.includes('featureNeighbourhood'),
      ),
    ).toHaveLength(3)
    expect(
      buildFeatureRollupConditions(db, input(), [...base, eq(feature.id, 'a')], hub),
    ).toBeNull()
  })

  it('invalidates detailed counts after translations, feature flags and property values change', async () => {
    const { db, sqlite } = setup()
    const request = input({
      q: 'North',
      filters: { properties: { layer: { kind: ['cafe'] } } },
    })
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(1)
    sqlite.exec(
      "UPDATE featureProperty SET propertyValueId = 'cafe' WHERE featureId = 'b' AND propertyId = 'kind'",
    )
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(2)
    sqlite.exec("UPDATE feature SET isPublished = 0 WHERE id = 'a'")
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(1)
    sqlite.exec("UPDATE featureI18n SET title = 'Changed' WHERE featureId = 'b'")
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(0)
  })

  it('invalidates only the edited user list, leaving public and other user counts reusable', async () => {
    const { db, sqlite, statements } = setup()
    const publicQuery = input({ q: 'North' })
    const ownList = input({ filters: { list: { userId: 'user', listId: 'wishlist' } } })
    const otherList = input({
      filters: { list: { userId: 'other', listId: 'wishlist' } },
    })
    await queryFeaturePage(db, publicQuery, base, hub)
    await queryFeaturePage(db, ownList, base, hub)
    await queryFeaturePage(db, otherList, base, hub)
    statements.length = 0
    sqlite.exec(
      "UPDATE userFeature SET isWishlisted = 1 WHERE userId = 'user' AND featureId = 'c'",
    )
    expect((await queryFeaturePage(db, publicQuery, base, hub)).totalCount).toBe(2)
    expect((await queryFeaturePage(db, otherList, base, hub)).totalCount).toBe(1)
    expect((await queryFeaturePage(db, ownList, base, hub)).totalCount).toBe(2)
    expect(
      statements.filter(
        statement =>
          statement.includes('count(*)') && statement.includes('featureNeighbourhood'),
      ),
    ).toHaveLength(1)
  })

  it('does not publish an aggregate if a canonical revision changes before cache persistence', async () => {
    const { db, sqlite } = setup()
    const persist = db.run.bind(db)
    vi.spyOn(db, 'run').mockImplementationOnce(statement => {
      sqlite.exec("UPDATE featureI18n SET title = 'Changed' WHERE featureId = 'b'")
      return persist(statement)
    })
    const request = input({ q: 'North' })
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(2)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureCountCache').get()?.count,
    ).toBe(0)
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(1)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureCountCache').get()?.count,
    ).toBe(1)
  })

  it('returns computed counts when cache persistence encounters SQLite lock contention', async () => {
    const { db, sqlite } = setup()
    vi.spyOn(db, 'run').mockRejectedValueOnce(
      new Error('SQLITE_BUSY_SNAPSHOT: database is locked'),
    )
    expect(
      (await queryFeaturePage(db, input({ q: 'North' }), base, hub)).totalCount,
    ).toBe(2)
    expect(
      sqlite.prepare('SELECT count(*) AS count FROM featureCountCache').get()?.count,
    ).toBe(0)
  })

  it('keeps non-lock cache persistence errors visible', async () => {
    const { db } = setup()
    vi.spyOn(db, 'run').mockRejectedValueOnce(
      new Error('count cache constraint failed'),
    )
    await expect(
      queryFeaturePage(db, input({ q: 'North' }), base, hub),
    ).rejects.toThrow('count cache constraint failed')
  })

  it('preserves deepest-selected prism branches and exact hub counts using layer-level predicates', async () => {
    const { db, sqlite, add, statements } = setup()
    sqlite.exec(`INSERT INTO hub VALUES('hub', 'test', 'test.example');
      INSERT INTO organisation VALUES('org', 'org', 'hub', 0, 0, 1, 0),('org2', 'org2', NULL, 0, 0, 1, 0);
      INSERT INTO project VALUES('project','project','org',1,0),('project2','project2','org',1,0),('project3','project3','org2',1,0);
      INSERT INTO layer VALUES('layer','project','org',1,0),('other','project','org',1,0),('layer2','project2','org',1,0),('layer3','project3','org2',1,0);`)
    // The shared hub EXISTS helper selects the complete hierarchy schema.
    for (const [name, table] of Object.entries({
      layer: schema.layer,
      project: schema.project,
      organisation: schema.organisation,
      hub: schema.hub,
    })) {
      const knownColumns = new Set(
        sqlite
          .prepare(`PRAGMA table_info("${name}")`)
          .all()
          .map(row => row.name),
      )
      for (const column of Object.values(getTableColumns(table))) {
        if (!knownColumns.has(column.name))
          sqlite.exec(
            `ALTER TABLE "${name}" ADD COLUMN "${column.name}" ${column.getSQLType()}`,
          )
      }
    }
    add('f', 'Branch2', 'Central', 'layer2')
    add('g', 'Branch3', 'Central', 'layer3')
    const selections = [
      { organisation: ['org'], project: [], layer: [] },
      { organisation: ['org'], project: [], layer: ['layer'] },
      { organisation: ['org'], project: ['project2'], layer: ['layer'] },
      { organisation: ['org2'], project: ['project2'], layer: ['layer'] },
      { organisation: [], project: ['project'], layer: ['other'] },
    ]
    for (const prisms of selections) {
      const original = db
        .select({ id: feature.id })
        .from(feature)
        .where(
          and(
            ...base,
            ...applyPrismConstraints(db, HierarchicalResource.feature, prisms),
          ),
        )
        .toSQL()
      const revised = db
        .select({ id: feature.id })
        .from(feature)
        .where(and(...base, ...buildFeaturePrismConditions(db, prisms)))
        .toSQL()
      expect(
        sqlite
          .prepare(revised.sql)
          .all(...(revised.params as never[]))
          .map(row => row.id)
          .sort(),
      ).toEqual(
        sqlite
          .prepare(original.sql)
          .all(...(original.params as never[]))
          .map(row => row.id)
          .sort(),
      )
    }
    const prisms = selections[2]
    const scope = [...base, ...buildFeaturePrismConditions(db, prisms)]
    const page = await queryFeaturePage(db, input({ prisms }), scope, {
      isCore: false,
      code: 'test',
    } as never)
    expect(page.data.map(row => row.id)).toEqual(['a', 'b', 'c', 'f'])
    expect(page.totalCount).toBe(4)
    expect(page.facets?.neighbourhoods).toEqual({ Central: 3, 'Wan Chai': 1 })
    expect(statements.some(statement => statement.includes('featureCountRollup'))).toBe(
      true,
    )
    expect(statements.join('\n')).not.toContain('count(*)')
    const search = input({ q: 'Branch' })
    expect(
      (
        await queryFeaturePage(db, search, base, {
          isCore: false,
          code: 'test',
        } as never)
      ).totalCount,
    ).toBe(1)
    sqlite.exec("UPDATE organisation SET hubId = 'hub' WHERE id = 'org2'")
    expect(
      (
        await queryFeaturePage(db, search, base, {
          isCore: false,
          code: 'test',
        } as never)
      ).totalCount,
    ).toBe(2)
  })
  it('preserves legacy orphan translations without creating invalid index memberships', () => {
    const { sqlite } = setup(true)
    expect(
      sqlite
        .prepare("SELECT count(*) AS count FROM featureI18n WHERE featureId = 'orphan'")
        .get()?.count,
    ).toBe(1)
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS count FROM featureSearchDocument WHERE featureId = 'orphan'",
        )
        .get()?.count,
    ).toBe(0)
  })

  it('returns only the actor list states for feature IDs in this page', async () => {
    const { db } = setup()
    const page = await queryFeaturePage(db, input({ q: 'North' }), base, hub, 'user')
    expect(
      page.userFeatures?.map(row => [row.userId, row.featureId, row.isWishlisted]),
    ).toEqual([['user', 'a', true]])
  })

  it('orders visited lists globally by visit date and traverses equal dates without duplicates', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(`UPDATE userFeature SET isVisited = 1, visitedAt = '2026-01-01' WHERE userId = 'user';
      INSERT INTO userFeature(userId, featureId, isVisited, isWishlisted, visitedAt) VALUES('user','b',1,0,'2026-03-01'),('user','e',1,0,NULL);`)
    const query = input({
      limit: 1,
      filters: { list: { userId: 'user', listId: 'visited' } },
      sorting: { sortBy: 'visitedAt', sortOrder: 'desc' },
    })
    const collected: string[] = []
    let cursor: FeatureQueryInput['cursor'] = null
    do {
      const page = await queryFeaturePage(db, { ...query, cursor }, base, hub)
      expect(page.totalCount).toBe(4)
      collected.push(...page.data.map(row => row.id))
      cursor = page.nextCursor
    } while (cursor)
    expect(collected).toEqual(['b', 'a', 'c', 'e'])
    const complete = await queryFeaturePage(db, { ...query, limit: 100 }, base, hub)
    expect(complete.data.map(row => row.id)).toEqual(collected)
  })

  it('supports descending ID traversal', async () => {
    const { db } = setup()
    const query = input({ limit: 2, sorting: { sortBy: 'id', sortOrder: 'desc' } })
    const first = await queryFeaturePage(db, query, base, hub)
    const second = await queryFeaturePage(
      db,
      { ...query, cursor: first.nextCursor },
      base,
      hub,
    )
    expect([...first.data, ...second.data].map(row => row.id)).toEqual([
      'e',
      'c',
      'b',
      'a',
    ])
    expect(second.nextCursor).toBeNull()
  })
  it('keeps totals and facets stable through keyset pages and avoids empty trailing pages', async () => {
    const { db } = setup()
    const query = input({ q: 'North', limit: 1 })
    const first = await queryFeaturePage(db, query, base, hub)
    expect(first.data.map(row => row.id)).toEqual(['a'])
    expect(first.totalCount).toBe(2)
    expect(first.facets?.neighbourhoods).toEqual({ Central: 2 })
    expect(first.nextCursor?.signature).toBe(await featureQuerySignature(query))
    const second = await queryFeaturePage(
      db,
      { ...query, cursor: first.nextCursor },
      base,
      hub,
    )
    expect(second.data.map(row => row.id)).toEqual(['b'])
    expect(second.totalCount).toBe(2)
    expect(second.facets).toEqual(first.facets)
    expect(second.nextCursor).toBeNull()
  })

  it.each(['茶', '茶餐', '茶餐廳', '100%', '%'])(
    'uses literal substring semantics for %s',
    async q => {
      const { db } = setup()
      expect(
        (await queryFeaturePage(db, input({ q }), base, hub)).data.map(row => row.id),
      ).toEqual(['a'])
    },
  )

  it.each([
    '_',
    '"quoted"',
    '*',
    '[x]',
    'alpha OR beta',
    'NEAR(tea, cafe)',
    "' OR 1=1 --",
    '\\',
  ])('treats query syntax and wildcard characters literally: %s', async q => {
    const { db, add } = setup()
    add(
      'literal',
      `Literal _ "quoted" * [x] alpha OR beta NEAR(tea, cafe) ' OR 1=1 -- \\`,
      null,
    )
    expect(
      (await queryFeaturePage(db, input({ q }), base, hub)).data.map(row => row.id),
    ).toEqual(['literal'])
  })

  it('preserves ASCII-only case folding without changing accents or Unicode case', async () => {
    const { db, add } = setup()
    add('upper', 'ÉCOLE Café', null)
    add('lower', 'école cafe', null)
    for (const [q, ids] of [
      ['nOrTh', ['a', 'b']],
      ['École', ['upper']],
      ['éCOLE', ['lower']],
      ['CAFÉ', []],
      ['Café', ['upper']],
      ['ECOLE', []],
    ] as const) {
      expect(
        (await queryFeaturePage(db, input({ q }), base, hub)).data.map(row => row.id),
      ).toEqual(ids)
    }
  })

  it('searches every translated field and treats supplementary Unicode characters as codepoints', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(`UPDATE featureI18n SET description = 'Midnight noodles' WHERE featureId = 'b';
      UPDATE featureI18n SET displayAddress = '22 Queen Street' WHERE featureId = 'c';
      INSERT INTO featureI18n VALUES('b', 'zh-hant', '北邊茶館 🍵餐廳', '深夜宵夜', '皇后大道', '{}');`)
    for (const [q, id] of [
      ['night nood', 'b'],
      ['Queen Str', 'c'],
      ['北邊', 'b'],
      ['深夜', 'b'],
      ['皇后大', 'b'],
      ['🍵', 'b'],
      ['🍵餐', 'b'],
      ['🍵餐廳', 'b'],
    ] as const) {
      expect(
        (await queryFeaturePage(db, input({ q }), base, hub)).data.map(row => row.id),
      ).toEqual([id])
    }
  })

  it('verifies the complete substring without crossing fields or translations', async () => {
    const { db, sqlite, add } = setup()
    add('scattered', 'abc--bcd--cde', null)
    add('split-field', 'needle', null)
    add('split-locale', 'needle', null)
    sqlite.exec(`UPDATE featureI18n SET description = 'point' WHERE featureId = 'split-field';
      INSERT INTO featureI18n VALUES('split-locale', 'zh-hant', 'point', NULL, NULL, '{}');`)
    for (const q of ['abcde', 'needlepoint']) {
      expect((await queryFeaturePage(db, input({ q }), base, hub)).totalCount).toBe(0)
    }
  })

  it('restricts FTS matches, totals and facets to the authorized feature scope', async () => {
    const { db, sqlite, add } = setup()
    add('external', 'North external', 'Outside')
    add('archived', 'North archived', 'Archived')
    add('draft', 'North draft', 'Draft')
    sqlite.exec(`UPDATE feature SET organisationId = 'external-org' WHERE id = 'external';
      UPDATE feature SET isArchived = 1 WHERE id = 'archived';
      UPDATE feature SET isDraft = 1 WHERE id = 'draft';`)
    const authorized = [...base, eq(feature.organisationId, 'org')]
    const original = [...authorized]
    const page = await queryFeaturePage(db, input({ q: 'North' }), authorized, hub)
    expect(page.data.map(row => row.id)).toEqual(['a', 'b'])
    expect(page.totalCount).toBe(2)
    expect(page.facets?.neighbourhoods).toEqual({ Central: 2 })
    expect(authorized).toEqual(original)
  })

  it('updates search postings while division identity remains independent of address edits', async () => {
    const { db, sqlite } = setup()
    sqlite.exec(
      `UPDATE featureI18n SET title = 'Changed', addressProperties = '{"neighbourhood":"Wan Chai"}' WHERE featureId = 'a';`,
    )
    expect((await queryFeaturePage(db, input({ q: '茶' }), base, hub)).totalCount).toBe(
      0,
    )
    expect(
      (await queryFeaturePage(db, input({ q: 'Changed' }), base, hub)).facets
        ?.neighbourhoods,
    ).toEqual({ Central: 1 })
    sqlite.exec(`DELETE FROM featureI18n WHERE featureId = 'a'`)
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS count FROM featureSearchDocument WHERE featureId = 'a'",
        )
        .get()?.count,
    ).toBe(0)
  })

  it('cleans FTS when deleting a legacy feature whose translations do not cascade', () => {
    const { sqlite } = setup()
    const documentId = sqlite
      .prepare("SELECT id FROM featureSearchDocument WHERE featureId = 'a'")
      .get()?.id
    sqlite.exec("DELETE FROM feature WHERE id = 'a'")
    expect(
      sqlite
        .prepare("SELECT count(*) AS count FROM featureI18n WHERE featureId = 'a'")
        .get()?.count,
    ).toBe(1)
    expect(
      sqlite
        .prepare('SELECT rowid FROM featureSearchFts WHERE rowid = ?')
        .get(documentId as number),
    ).toBeUndefined()
    expect(
      sqlite
        .prepare(
          "SELECT count(*) AS count FROM featureSearchDocument WHERE featureId = 'a'",
        )
        .get()?.count,
    ).toBe(0)
  })

  it('combines viewport, flags, user-list and property filters before counting', async () => {
    const { db } = setup()
    const page = await queryFeaturePage(
      db,
      input({
        spatial: { resolution: 7, cells: ['cell'], bounds: [113, 21, 114.5, 23] },
        filters: {
          isVisitable: true,
          list: { userId: 'user', listId: 'wishlist' },
          properties: { layer: { kind: ['cafe'] } },
        },
      }),
      base,
      hub,
    )
    expect(page.data.map(row => row.id)).toEqual(['a'])
    expect(page.totalCount).toBe(1)
  })

  it('applies properties only to their layer, rejects invalid numbers, skips inactive ranges', async () => {
    const { db } = setup()
    const selection = await queryFeaturePage(
      db,
      input({ filters: { properties: { layer: { kind: ['cafe'] } } } }),
      base,
      hub,
    )
    expect(selection.data.map(row => row.id)).toEqual(['a', 'e'])
    const numeric = await queryFeaturePage(
      db,
      input({
        filters: {
          properties: {
            layer: {
              number: { globalMin: -1, globalMax: 10, rangeMin: 0, rangeMax: 6 },
            },
          },
        },
      }),
      base,
      hub,
    )
    expect(numeric.data.map(row => row.id)).toEqual(['a', 'e'])
    const inactive = await queryFeaturePage(
      db,
      input({
        filters: {
          properties: {
            layer: {
              number: { globalMin: 0, globalMax: 10, rangeMin: 0, rangeMax: 10 },
            },
          },
        },
      }),
      base,
      hub,
    )
    expect(inactive.totalCount).toBe(4)
  })

  it('filters neighbourhood exclusions and keeps missing neighbourhoods in totalCount', async () => {
    const { db } = setup()
    const page = await queryFeaturePage(
      db,
      input({ filters: { excludeNeighbourhoods: ['Central'] } }),
      base,
      hub,
    )
    expect(page.data.map(row => row.id)).toEqual(['c', 'e'])
    expect(page.totalCount).toBe(2)
    expect(page.facets?.neighbourhoods).toEqual({ 'Wan Chai': 1 })
  })

  it('keeps long searches and large filter arrays within the D1 binding budget', () => {
    const { db } = setup()
    const query = input({
      q: 'abcdefghijklmnopqrstuvwxyz'.repeat(7),
      spatial: {
        resolution: 7,
        cells: Array.from({ length: 256 }, (_, i) => `cell${i}`),
      },
      filters: {
        properties: {
          layer: { kind: Array.from({ length: 1000 }, (_, i) => `kind${i}`) },
        },
      },
    })
    const built = db
      .select({ count: sql`count(*)` })
      .from(feature)
      .where(and(...buildFeatureQueryConditions(db, query, base, hub)))
      .toSQL()
    expect(built.params.length).toBeLessThan(20)
  })

  it('omits numerous inactive defaults from SQL without requiring property rows', async () => {
    const { db } = setup()
    const defaults = Object.fromEntries(
      Array.from({ length: 80 }, (_, index) => [
        `default-${index}`,
        index % 2 ? [] : { globalMin: 0, globalMax: 10, rangeMin: 0, rangeMax: 10 },
      ]),
    )
    const request = input({ filters: { properties: { layer: defaults } } })
    const ordinary = db
      .select({ count: sql`count(*)` })
      .from(feature)
      .where(and(...buildFeatureQueryConditions(db, input(), base, hub)))
      .toSQL()
    const filtered = db
      .select({ count: sql`count(*)` })
      .from(feature)
      .where(and(...buildFeatureQueryConditions(db, request, base, hub)))
      .toSQL()
    expect(filtered).toEqual(ordinary)
    expect((await queryFeaturePage(db, request, base, hub)).totalCount).toBe(4)
  })

  it('combines more than 12 active selection, boolean and range predicates with one binding', async () => {
    const { db, sqlite } = setup()
    const layerFilters: NonNullable<
      NonNullable<FeatureQueryInput['filters']>['properties']
    >[string] = {}
    const insertProperty = sqlite.prepare(
      'INSERT INTO featureProperty VALUES (?, ?, ?, ?)',
    )
    for (let index = 0; index < 24; index++) {
      layerFilters[`selection-${index}`] = ['selected']
      layerFilters[`flag-${index}`] = true
      layerFilters[`range-${index}`] = {
        globalMin: 0,
        globalMax: 10,
        rangeMin: 4,
        rangeMax: 6,
      }
      layerFilters[`inactive-${index}`] = []
      for (const id of ['a', 'b']) {
        insertProperty.run(id, `selection-${index}`, 'selected', null)
        insertProperty.run(
          id,
          `flag-${index}`,
          null,
          id === 'b' && index === 23 ? 'false' : 'true',
        )
        insertProperty.run(id, `range-${index}`, null, '5')
      }
    }
    const request = input({
      q: 'North',
      filters: { properties: { layer: layerFilters } },
    })
    const ordinary = db
      .select({ count: sql`count(*)` })
      .from(feature)
      .where(and(...buildFeatureQueryConditions(db, input({ q: 'North' }), base, hub)))
      .toSQL()
    const filtered = db
      .select({ count: sql`count(*)` })
      .from(buildFeatureQuerySource(request))
      .where(and(...buildFeatureQueryConditions(db, request, base, hub)))
      .toSQL()
    expect(filtered.params).toHaveLength(ordinary.params.length + 1)
    const page = await queryFeaturePage(db, request, base, hub)
    expect(page.data.map(row => row.id)).toEqual(['a'])
    expect(page.totalCount).toBe(1)
    expect(page.facets?.neighbourhoods).toEqual({ Central: 1 })
    const plan = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${filtered.sql}`)
      .all(...(filtered.params as never[]))
      .map(row => String(row.detail))
      .join('\n')
    expect(plan).toContain(
      'SEARCH feature USING COVERING INDEX feature_query_id_idx (id=?',
    )
    expect(plan).toContain(
      'SEARCH featureProperty USING INDEX sqlite_autoindex_featureProperty_1 (featureId=? AND propertyId=?)',
    )
    expect(plan).not.toContain('SCAN featureProperty')
  })

  it('binds unusual property and layer identifiers as data', async () => {
    const { db, sqlite, add } = setup()
    const layerId = 'layer".$[0]'
    const propertyId = "property') OR 1=1 --"
    add('f', 'Escaped identifiers', 'Central', layerId)
    sqlite
      .prepare('INSERT INTO featureProperty VALUES(?, ?, ?, NULL)')
      .run('f', propertyId, 'yes')
    const request = input({
      q: 'Escaped',
      filters: { properties: { [layerId]: { [propertyId]: ['yes'] } } },
    })
    expect(
      (await queryFeaturePage(db, request, base, hub)).data.map(row => row.id),
    ).toEqual(['f'])
  })

  it.each([
    ['all', {}],
    ['spatial', { spatial: { resolution: 7, cells: ['cell'] } }],
    ['search', { q: 'North' }],
    ['property', { filters: { properties: { layer: { kind: ['cafe'] } } } }],
    ['list', { filters: { list: { userId: 'user', listId: 'wishlist' } } }],
  ] as const)('uses indexed feature predicates for %s counts', (_name, extra) => {
    const { db, sqlite, add } = setup()
    for (let i = 0; i < 100; i++) add(`outside-${i}`, 'Unrelated', 'Outside', 'outside')
    sqlite.exec('ANALYZE')
    const queryInput = input(extra as never)
    const query = db
      .select({
        count: sql`count(*)`,
        neighbourhood: featureNeighbourhood.neighbourhood,
      })
      .from(buildFeatureQuerySource(queryInput))
      .leftJoin(featureNeighbourhood, eq(featureNeighbourhood.featureId, feature.id))
      .where(and(...buildFeatureQueryConditions(db, queryInput, base, hub)))
      .groupBy(featureNeighbourhood.neighbourhood)
      .toSQL()
    const plan = sqlite
      .prepare(`EXPLAIN QUERY PLAN ${query.sql}`)
      .all(...(query.params as never[]))
      .map(row => String(row.detail))
    expect(
      plan.some(
        detail =>
          /^SCAN feature(?:$|\s)/.test(detail) &&
          !detail.includes('USING COVERING INDEX'),
      ),
    ).toBe(false)
    expect(
      plan.some(detail => /SEARCH feature USING (?:COVERING )?INDEX/.test(detail)),
    ).toBe(true)
    if (_name === 'spatial')
      expect(plan.join('\n')).toContain('featureSpatial_cell_layer_idx')
    if (_name === 'search') {
      expect(plan.join('\n')).toMatch(
        /SCAN featureSearchFts VIRTUAL TABLE INDEX \d+:M\d/,
      )
      expect(plan.join('\n')).toContain(
        'SEARCH featureSearchDocument USING INTEGER PRIMARY KEY (rowid=?)',
      )
      expect(plan.join('\n')).not.toContain('SCAN featureI18n')
    }
    if (_name === 'list') expect(plan.join('\n')).toContain('user_feature_wishlist_idx')
    if (_name === 'property')
      expect(plan.join('\n')).toContain(
        'SEARCH featureProperty USING INDEX sqlite_autoindex_featureProperty_1 (featureId=? AND propertyId=?)',
      )
  })

  it('legacy feature pages count before both ID and sort-value cursors without mutating authorization', async () => {
    const { db } = setup()
    const conditions = [...base]
    const page = await listFeatures(
      db,
      {},
      conditions,
      hub,
      { limit: 1, afterId: 'a' },
      { sortBy: 'id', sortOrder: 'asc' },
    )
    expect(page.totalCount).toBe(4)
    expect(page.data.map(row => row.id)).toEqual(['b'])
    expect(conditions).toHaveLength(3)
    const last = await listFeatures(
      db,
      {},
      conditions,
      hub,
      { limit: 1, afterId: 'c', afterValue: 'c' },
      { sortBy: 'id', sortOrder: 'asc' },
    )
    expect(last.totalCount).toBe(4)
    expect(last.data.map(row => row.id)).toEqual(['e'])
    expect(last.hasMore).toBe(false)
  })
})
