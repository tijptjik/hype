// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
// DRIZZLE
import { and, eq, getTableColumns, getTableName, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// DB
import * as schema from '#lib/db/schema/index.js'
import { queryFeatureIndex } from '#lib/db/services/featureIndex.js'
import {
  featureIndexFilterConditions,
  featureIndexLicenseConditions,
} from '#lib/db/services/featureIndexFilters.js'
import { ResourceViewCtx } from '#lib/context/resourceView.svelte.js'
import { AccountState } from '#lib/context/account.svelte.js'
import { DivisionCtx } from '#lib/context/division.svelte.js'
import { ResponsiveCtx } from '#lib/context/responsive.svelte.js'
import { createDefaultProjectLicense } from '#lib/db/services/licence.js'
// TYPES
import type { FeatureIndexFilters } from '#lib/features/indexQuery.js'
import type { Database } from '#lib/types.js'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

/** Build an isolated database executing production count, filter and pagination SQL.
 * @returns SQLite, D1 adapter, captured statements and a feature fixture writer.
 */
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  for (const table of [
    schema.feature,
    schema.featureI18n,
    schema.featureImage,
    schema.featureProperty,
    schema.featurePropertyI18n,
    schema.property,
    schema.project,
    schema.user,
    schema.organisation,
    schema.layer,
  ]) {
    const columns = Object.values(getTableColumns(table)).map(
      column => `"${column.name}" ${column.getSQLType()}`,
    )
    sqlite.exec(`create table "${getTableName(table)}" (${columns.join(',')})`)
  }
  sqlite.exec(`
    create unique index fi_pk on featureI18n(featureId,locale);
    create index image_feature on featureImage(featureId,isPublished);
    create unique index fp_pk on featureProperty(featureId,propertyId);
    create unique index fpi_pk on featurePropertyI18n(featureId,propertyId,locale);
    create unique index property_pk on property(id);
    create table featureCountRevision(id integer primary key, revision integer);
    insert into featureCountRevision values(1, 0);
    create table featureCountCache(key text primary key, revision integer, userRevision integer, totalCount integer, facets text, updatedAt integer);
    create table featureCountRollup(organisationId text,projectId text,layerId text,isPublished integer,isArchived integer,isDraft integer,isVisitable integer,isIntangible integer,totalCount integer);
    create unique index feature_pk on feature(id);
    create table featureNeighbourhood(featureId text primary key, neighbourhood text);
  `)
  sqlite.exec(readFileSync('migrations/0081_feature_search_fts.sql', 'utf8'))
  sqlite.exec(readFileSync('migrations/0178_feature_index_counts.sql', 'utf8'))
  const statements: { sql: string; params: unknown[] }[] = []
  const prepare = (query: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => prepare(query, values),
    all: async () => {
      statements.push({ sql: query, params })
      return { results: sqlite.prepare(query).all(...(params as never[])) }
    },
    raw: async () => {
      statements.push({ sql: query, params })
      const stmt = sqlite.prepare(query)
      stmt.setReturnArrays(true)
      return stmt.all(...(params as never[]))
    },
    run: async () => {
      statements.push({ sql: query, params })
      return { meta: sqlite.prepare(query).run(...(params as never[])) }
    },
  })
  const db = drizzle({ prepare } as never, { schema }) as Database
  const add = (id: string, archived = 0, title = id): void => {
    sqlite
      .prepare(
        `insert into feature(id,organisationId,projectId,layerId,isPublished,isArchived,isDraft,isVisitable,isIntangible,isPendingReview,modifiedAt) values(?, 'org','project','layer',1,?,0,1,0,0,?)`,
      )
      .run(id, archived, id)
    sqlite
      .prepare(
        `insert into featureI18n(featureId,locale,title,titleGen,descriptionGen,displayAddressGen) values(?,'en',?,0,0,0)`,
      )
      .run(id, title)
    sqlite
      .prepare(
        `insert into featureCountRollup values('org','project','layer',1,?,0,1,0,1)`,
      )
      .run(archived)
  }
  return { sqlite, db, statements, add }
}
const hub = { isSuperAdmin: true, isAdminRequest: true } as never
const scope = [eq(schema.feature.organisationId, 'org')]
const input = {
  idsOnly: true,
  filters: { isArchived: false },
  sorting: { sortBy: 'id', sortOrder: 'asc' },
} as const

describe('authoritative feature index', () => {
  it('scopes brand rows and uncached counts before pagination and authorization', async () => {
    const { sqlite, db, add, statements } = setup()
    for (const id of ['a', 'b', 'other-brand', 'unauthorized']) add(id)
    sqlite.exec(`
      CREATE TABLE location(id TEXT,state TEXT,ownerOrganisationId TEXT);
      CREATE TABLE locationRevisionContent(id TEXT,locationId TEXT,facts TEXT);
      CREATE TABLE locationSharedRevision(id TEXT,locationId TEXT,corrections TEXT);
      CREATE TABLE featureLocation(featureId TEXT,locationId TEXT,factsRevisionId TEXT,acceptancePolicy TEXT,acceptedOverrides TEXT);
      INSERT INTO location VALUES('place','published',NULL);
      INSERT INTO locationRevisionContent VALUES('facts','place','{"schemaVersion":1,"details":{}}');
      INSERT INTO locationSharedRevision VALUES('accepted','place','{"brandId":{"choice":{"mode":"override","value":"brand-a"}}}');
      INSERT INTO featureLocation SELECT id,'place','facts','{"factsSharedRevision":"accepted"}','{}' FROM feature;
      UPDATE featureLocation SET acceptedOverrides='{"brandId":{"mode":"override","value":"brand-b"}}' WHERE featureId='other-brand';
      UPDATE feature SET organisationId='other' WHERE id='unauthorized';
    `)
    const query = { ...input, brandId: 'brand-a', pagination: { limit: 1, offset: 0 } }
    expect(await queryFeatureIndex(db, query, scope, hub, 'en')).toMatchObject({
      data: [{ id: 'a' }],
      totalCount: 2,
      hasMore: true,
      nextOffset: 1,
    })
    expect(
      await queryFeatureIndex(
        db,
        { ...query, pagination: { limit: 1, offset: 1 } },
        scope,
        hub,
        'en',
      ),
    ).toMatchObject({
      data: [{ id: 'b' }],
      totalCount: 2,
      hasMore: false,
    })
    sqlite.exec("DELETE FROM featureLocation WHERE featureId='b'")
    expect(
      await queryFeatureIndex(db, { ...query, countOnly: true }, scope, hub, 'en'),
    ).toMatchObject({ totalCount: 1 })
    expect(
      statements.some(
        row =>
          row.sql.includes('featureCountCache') ||
          row.sql.includes('featureCountRollup'),
      ),
    ).toBe(false)
  })

  it('filters provenance and its generic reference before pagination and exact counts', async () => {
    const { sqlite, db, add } = setup()
    sqlite.exec(
      'CREATE TABLE featureOrigin(featureId TEXT PRIMARY KEY,origin TEXT,originId TEXT)',
    )
    for (const id of ['a', 'b', 'c', 'unknown']) add(id)
    sqlite.exec(
      "INSERT INTO featureOrigin VALUES('a','field_research','outing'),('b','field_research','other'),('c','admin_contribution',NULL)",
    )
    const result = await queryFeatureIndex(
      db,
      {
        ...input,
        filters: { origin: 'field_research', originId: 'outing' },
        pagination: { limit: 1, offset: 0 },
      },
      scope,
      hub,
      'en',
    )
    expect(result).toMatchObject({ data: [{ id: 'a' }], totalCount: 1, hasMore: false })
    const unknown = await queryFeatureIndex(
      db,
      { ...input, filters: { origin: 'unknown' } },
      scope,
      hub,
      'en',
    )
    expect(unknown).toMatchObject({ data: [{ id: 'unknown' }], totalCount: 1 })
    const admin = await queryFeatureIndex(
      db,
      { ...input, filters: { origin: 'admin_contribution', originId: 'outing' } },
      scope,
      hub,
      'en',
    )
    expect(admin).toMatchObject({ data: [{ id: 'c' }], totalCount: 1 })
  })
  it('filters Location rows and counts before pagination, without stale Feature-only count caches', async () => {
    const { sqlite, db, add, statements } = setup()
    sqlite.exec(`
      CREATE TABLE featureLocationMembership(featureId TEXT, containerLocationId TEXT);
      CREATE TABLE featureLocationHistory(featureId TEXT, version INTEGER, locationId TEXT, occupancyRevisionId TEXT, membershipRevisionIds TEXT);
      CREATE TABLE featureLocation(featureId TEXT, version INTEGER, locationId TEXT);
      CREATE TABLE locationOccupancy(id TEXT, containerLocationId TEXT);
      CREATE TABLE locationMembership(id TEXT, parentLocationId TEXT, childLocationId TEXT);
    `)
    add('a')
    add('b')
    add('c')
    add('archived', 1)
    sqlite.exec(`INSERT INTO featureLocationMembership VALUES ('a','place'),('b','place'),('archived','place'),('c','elsewhere');
      INSERT INTO featureLocationHistory VALUES ('c',1,'place',NULL,'[]'),('a',1,'place',NULL,'[]');
      INSERT INTO featureLocation VALUES ('a',1,'place');`)
    const placed = {
      ...input,
      location: { id: 'place', view: 'placed' as const },
      pagination: { limit: 1, offset: 0 },
    }
    const first = await queryFeatureIndex(db, placed, scope, hub, 'en')
    expect(first).toMatchObject({
      data: [{ id: 'a' }],
      totalCount: 2,
      hasMore: true,
      nextOffset: 1,
    })
    const next = await queryFeatureIndex(
      db,
      { ...placed, pagination: { limit: 1, offset: 1 } },
      scope,
      hub,
      'en',
    )
    expect(next.data).toEqual([{ id: 'b' }])
    const past = await queryFeatureIndex(
      db,
      { ...input, location: { id: 'place', view: 'past' } },
      scope,
      hub,
      'en',
    )
    expect(past).toMatchObject({ data: [{ id: 'c' }], totalCount: 1 })
    sqlite.exec("DELETE FROM featureLocationMembership WHERE featureId='b'")
    const count = await queryFeatureIndex(
      db,
      { ...placed, countOnly: true },
      scope,
      hub,
      'en',
    )
    expect(count.totalCount).toBe(1)
    expect(
      statements.some(
        row =>
          row.sql.includes('featureCountCache') ||
          row.sql.includes('featureCountRollup'),
      ),
    ).toBe(false)
  })

  it('resolves associated occupants with their persisted Project scope in the standard index', async () => {
    const { sqlite, db, add } = setup()
    sqlite.exec(`
      CREATE TABLE location(id TEXT, matchingType TEXT, state TEXT, ownerOrganisationId TEXT);
      CREATE VIEW locationCanonical AS SELECT id aliasId, id locationId FROM location;
      CREATE TABLE locationMembershipHead(id TEXT, relationshipId TEXT, childLocationId TEXT, parentLocationId TEXT, scopeOrganisationId TEXT, assertionState TEXT, membershipState TEXT);
      CREATE TABLE locationOccupancyHead(id TEXT, relationshipId TEXT, establishmentLocationId TEXT, containerLocationId TEXT, scopeOrganisationId TEXT, assertionState TEXT, occupancyState TEXT);
      CREATE TABLE featureLocation(featureId TEXT, locationId TEXT);
      INSERT INTO project(id,organisationId) VALUES('project','org');
      INSERT INTO location VALUES('building','building','linked',NULL),('shop','establishment','manual','org');
      INSERT INTO locationOccupancyHead VALUES('occupancy','relationship','shop','building','org','asserted','current');
      INSERT INTO featureLocation VALUES('a','shop'),('b','elsewhere');
    `)
    add('a')
    add('b')
    const result = await queryFeatureIndex(
      db,
      { ...input, location: { id: 'building', view: 'associated' } },
      scope,
      hub,
      'en',
    )
    expect(result).toMatchObject({ data: [{ id: 'a' }], totalCount: 1 })
    sqlite.exec("UPDATE locationOccupancyHead SET occupancyState='former'")
    const former = await queryFeatureIndex(
      db,
      { ...input, location: { id: 'building', view: 'associated' } },
      scope,
      hub,
      'en',
    )
    expect(former).toMatchObject({ data: [], totalCount: 0 })
  })

  it('uses maintained totals, returns a bounded page, and omits all count work on continuation', async () => {
    const { db, add, statements } = setup()
    for (let i = 0; i < 53; i++) add(String(i).padStart(3, '0'), i < 2 ? 1 : 0)
    const first = await queryFeatureIndex(
      db,
      { ...input, pagination: { limit: 50, offset: 0 } },
      scope,
      hub,
      'en',
    )
    expect(first.totalCount).toBe(51)
    expect(first.data).toHaveLength(50)
    expect(first.nextOffset).toBe(50)
    expect(statements.some(entry => entry.sql.includes('featureCountRollup'))).toBe(
      true,
    )
    expect(
      statements.some(entry => entry.sql.includes('featureDivisionMembership')),
    ).toBe(false)
    statements.length = 0
    const next = await queryFeatureIndex(
      db,
      { ...input, includeCount: false, pagination: { limit: 50, offset: 50 } },
      scope,
      hub,
      'en',
    )
    expect(next.totalCount).toBeNull()
    expect(next.data).toHaveLength(1)
    expect(next.hasMore).toBe(false)
    expect(statements).toHaveLength(1)
    expect(statements[0].sql).not.toContain('count(')
  })

  it('caches detailed counts and invalidates them when image publication changes', async () => {
    const { sqlite, db, add, statements } = setup()
    add('a')
    add('b')
    sqlite.exec(
      `insert into featureImage(featureId,imageId,isPublished) values('a','img',0)`,
    )
    const query = {
      ...input,
      filters: { isArchived: false, isOneImagePublished: true },
    }
    expect((await queryFeatureIndex(db, query, scope, hub, 'en')).totalCount).toBe(0)
    statements.length = 0
    await queryFeatureIndex(db, query, scope, hub, 'en')
    expect(statements.some(entry => /count\(\*\)/i.test(entry.sql))).toBe(false)
    sqlite.exec(`update featureImage set isPublished=1`)
    const result = await queryFeatureIndex(db, query, scope, hub, 'en')
    expect(result.totalCount).toBe(1)
    expect(result.data).toEqual([{ id: 'a' }])
  })

  it('binds cache entries to authorization and never broadens the requested scope', async () => {
    const { db, add } = setup()
    add('a')
    add('b')
    expect((await queryFeatureIndex(db, input, scope, hub, 'en')).totalCount).toBe(2)
    const result = await queryFeatureIndex(
      db,
      input,
      [...scope, eq(schema.feature.id, 'a')],
      hub,
      'en',
    )
    expect(result.totalCount).toBe(1)
    expect(result.data).toEqual([{ id: 'a' }])
  })

  it('uses a scope-specific covering index for an uncached detailed count', async () => {
    const { sqlite, db, add } = setup()
    add('a')
    const statement = db
      .select({ count: sql`count(*)` })
      .from(schema.feature)
      .where(
        and(
          ...scope,
          ...featureIndexFilterConditions({ isArchived: false, isPendingReview: true }),
        ),
      )
      .toSQL()
    const plan = sqlite
      .prepare('explain query plan ' + statement.sql)
      .all(...(statement.params as never[]))
    expect(JSON.stringify(plan)).toContain(
      'SEARCH feature USING COVERING INDEX feature_index_organisation',
    )
  })

  it('keeps literal search and locale fallback aligned with local filtering', async () => {
    const { sqlite, db, add } = setup()
    add('a', 0, '100% 香港 signage')
    add('b', 0, '100 percent signage')
    sqlite.exec(
      `insert into featureI18n(featureId,locale,title,titleGen) values('a','zh-hant','香港招牌',0)`,
    )
    for (const [q, locale, ids] of [
      ['%', 'en', ['a']],
      ['香港', 'en', ['a']],
      ['招牌', 'zh-hant', ['a']],
      ['signage', 'zh-hant', ['b']],
      ['_', 'en', []],
    ] as const) {
      const result = await queryFeatureIndex(db, { ...input, q }, scope, hub, locale)
      expect(result.data.map(row => row.id)).toEqual(ids)
      expect(result.totalCount).toBe(ids.length)
    }
  })

  it('matches the actual local status, content, image, translation and field predicates', async () => {
    const { sqlite, db, add } = setup()
    add('a', 0, 'Manual')
    add('b', 0, 'Generated')
    add('c', 1, '')
    sqlite.exec(`update featureI18n set titleGen=1 where featureId='b';
      update feature set isPendingReview=1 where id='b';
      insert into featureI18n(featureId,locale,title,titleGen) values('a','zh-hant','手寫',0);
      insert into featureImage(featureId,imageId,isPublished) values('a','image-a',1),('b','image-b',0);
      insert into property(id,type,component,isTranslatable) values('p','specifier','TextField',1);
      insert into featureProperty(featureId,propertyId) values('a','p'),('b','p');
      insert into featurePropertyI18n(featureId,propertyId,locale,value,valueGen) values('a','p','en','Manual',0),('b','p','en','Generated',1);`)
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    view.cache.property.set('p', {
      id: 'p',
      type: 'specifier',
      isTranslatable: true,
    } as never)
    const rows = [
      {
        id: 'a',
        isArchived: false,
        isPendingReview: false,
        isPublished: true,
        isIntangible: false,
        isVisitable: true,
        i18n: {
          en: { title: 'Manual', titleGen: false },
          zhHant: { title: '手寫', titleGen: false },
        },
        images: [{ isPublished: true }],
        properties: [
          { propertyId: 'p', i18n: { en: { value: 'Manual', valueGen: false } } },
        ],
      },
      {
        id: 'b',
        isArchived: false,
        isPendingReview: true,
        isPublished: true,
        isIntangible: false,
        isVisitable: true,
        i18n: { en: { title: 'Generated', titleGen: true } },
        images: [{ isPublished: false }],
        properties: [
          { propertyId: 'p', i18n: { en: { value: 'Generated', valueGen: true } } },
        ],
      },
      {
        id: 'c',
        isArchived: true,
        isPendingReview: false,
        isPublished: true,
        isIntangible: false,
        isVisitable: true,
        i18n: { en: { title: '', titleGen: false } },
        images: [],
        properties: [],
      },
    ]
    const cases = [
      'isPublished',
      'isArchived',
      'isPendingReview',
      'isIntangible',
      'isVisitable',
      'hasTitle',
      'hasDescription',
      'hasDisplayAddress',
      'hasImage',
      'isOneImagePublished',
      'isAllImagePublished',
    ] as const
    try {
      const patches: FeatureIndexFilters[] = cases.flatMap(key =>
        [true, false].map(value => ({ [key]: value })),
      )
      patches.push(
        ...[true, false].flatMap(value => [
          { properties: { p: value } },
          {
            isTitleTranslated: { zhHant: value },
            translationLocales: { en: false, zhHans: false, zhHant: true },
          },
          { isSpecifierTranslated: { en: null, zhHans: null, zhHant: value } },
        ]),
      )
      for (const patch of patches) {
        view.filters.resetViewFilters()
        view.filters.viewFilters.feature.isArchived = null
        Object.assign(view.filters.viewFilters.feature, patch)
        const filters = view.filters.viewFilters.feature
        const expected = view.filters
          .applyFeatureViewFilters(rows as never)
          .map(row => row.id)
        const actual = await db
          .select({ id: schema.feature.id })
          .from(schema.feature)
          .where(and(...scope, ...featureIndexFilterConditions(filters)))
          .orderBy(schema.feature.id)
        expect(
          actual.map(row => row.id),
          JSON.stringify(patch),
        ).toEqual(expected)
      }
    } finally {
      view.dispose()
    }
  })

  it('matches local licence normalization, including legacy labels', async () => {
    const { sqlite, db, add } = setup()
    add('a')
    const view = new ResourceViewCtx(
      new DivisionCtx(),
      new AccountState(),
      new ResponsiveCtx(),
      undefined,
      'admin',
    )
    const keys = [
      'isAllRightsReserved',
      'isPublicDomain',
      'hasLicenseBy',
      'hasLicenseSa',
      'hasLicenseNc',
      'hasLicenseNd',
    ] as const
    try {
      for (const label of ['Copyright', 'CC0 / PDDL', 'CC BY-SA 4.0 / ODbL']) {
        const license = createDefaultProjectLicense()
        license.media.all.license = label
        sqlite.prepare('delete from project').run()
        sqlite
          .prepare('insert into project(id,license) values(?,?)')
          .run('project', JSON.stringify(license))
        view.cache.project.set('project', { id: 'project', license } as never)
        for (const key of keys)
          for (const value of [false, true]) {
            view.filters.resetViewFilters()
            view.filters.viewFilters.feature[key] = value
            const local = view.filters.applyFeatureViewFilters([
              {
                id: 'a',
                projectId: 'project',
                isArchived: false,
                i18n: { en: { title: 'A' } },
              },
            ] as never)
            const conditions = await featureIndexLicenseConditions(
              db,
              view.filters.viewFilters.feature,
            )
            const remote = await db
              .select({ id: schema.feature.id })
              .from(schema.feature)
              .where(and(...conditions))
            expect(
              remote.map(row => row.id),
              `${label} ${key}=${value}`,
            ).toEqual(local.map(row => row.id))
          }
      }
    } finally {
      view.dispose()
    }
  })

  it('invalidates cached totals for every newly counted relation dependency', () => {
    const { sqlite, add } = setup()
    add('a')
    sqlite.exec(`insert into property(id) values('p'); insert into project(id) values('project'); insert into user(id) values('u');
      insert into featurePropertyI18n(featureId,propertyId,locale,value,valueGen) values('a','p','en','Text',0);`)
    for (const mutation of [
      `update feature set isPendingReview=1 where id='a'`,
      `update featureI18n set titleGen=1 where featureId='a'`,
      `update featurePropertyI18n set valueGen=1 where featureId='a'`,
      `update property set isTranslatable=1 where id='p'`,
      `update project set license='{}' where id='project'`,
      `update user set name='New name' where id='u'`,
    ]) {
      const before = sqlite
        .prepare('select revision from featureCountRevision')
        .get()!.revision
      sqlite.exec(mutation)
      const after = sqlite
        .prepare('select revision from featureCountRevision')
        .get()!.revision
      expect(after).toBeGreaterThan(before as number)
    }
  })

  it('keeps the parameter count bounded for hundreds of field filters', () => {
    const { db } = setup()
    const conditions = featureIndexFilterConditions({
      properties: Object.fromEntries(
        Array.from({ length: 300 }, (_, i) => [`p${i}`, true]),
      ),
    })
    const statement = db
      .select({ id: schema.feature.id })
      .from(schema.feature)
      .where(and(...conditions))
      .toSQL()
    expect(statement.params).toHaveLength(1)
  })
})

it('counts authorized matches without selecting or hydrating a feature page', async () => {
  const { db, add, statements } = setup()
  add('visible')
  add('archived', 1)
  const result = await queryFeatureIndex(
    db,
    { ...input, countOnly: true },
    scope,
    hub,
    'en',
  )
  expect(result).toMatchObject({ data: [], totalCount: 1, hasMore: false })
  expect(
    statements.some(entry => /order by|featureDivisionMembership/i.test(entry.sql)),
  ).toBe(false)
})
