// @vitest-environment node
// NODE
import { DatabaseSync } from 'node:sqlite'
// DRIZZLE
import { and, getTableColumns, getTableName, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
// TESTS
import { afterEach, describe, expect, it } from 'vitest'
// QUERY
import * as schema from '#lib/db/schema/index.js'
import { listOrganisations } from '#lib/db/services/organisation.js'
import { listProjects } from '#lib/db/services/project.js'
import { listLayers } from '#lib/db/services/layer.js'
import { GetTasksSchema } from '#lib/db/zod/schema/task.js'
import { listHubs } from '#lib/db/services/hub.js'
import { listLocationResources } from '#lib/db/services/locationDirectory.js'
import {
  resourceIndexFilterConditions,
  resourceIndexSearchCondition,
} from '#lib/db/services/resourceIndexFilters.js'
import { taskIndexSearchCondition } from '#lib/db/services/taskIndexFilters.js'
import { matchesResourceIndexSearch } from '#lib/resources/indexQuery.js'
import type { ResourceIndexFilters } from '#lib/resources/indexQuery.js'
import type { Database } from '#lib/types.js'

const stores: DatabaseSync[] = []
afterEach(() => {
  for (const store of stores.splice(0)) store.close()
})

function setup() {
  const sqlite = new DatabaseSync(':memory:')
  stores.push(sqlite)
  for (const table of [
    schema.organisation,
    schema.organisationI18n,
    schema.project,
    schema.projectI18n,
    schema.layer,
    schema.layerI18n,
    schema.hub,
    schema.hubI18n,
    schema.image,
    schema.location,
    schema.locationRevision,
    schema.feature,
    schema.featureI18n,
    schema.featureLocation,
    schema.user,
    schema.task,
  ]) {
    sqlite.exec(
      `create table "${getTableName(table)}" (${Object.values(getTableColumns(table))
        .map(column => `"${column.name}" ${column.getSQLType()}`)
        .join(',')})`,
    )
  }
  sqlite.exec(
    'create table organisationLocation(locationId text, organisationId text, overrides text, revision text)',
  )
  const statements: string[] = []
  const prepare = (query: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => prepare(query, values),
    all: async () => {
      statements.push(query)
      return { results: sqlite.prepare(query).all(...(params as never[])) }
    },
    raw: async () => {
      statements.push(query)
      const stmt = sqlite.prepare(query)
      stmt.setReturnArrays(true)
      return stmt.all(...(params as never[]))
    },
  })
  const db = drizzle({ prepare } as never, { schema }) as Database
  const opts = { isSuperAdmin: true, isAdminRequest: true } as never
  return { sqlite, db, statements, opts }
}

describe('resource index SQL membership and totals', () => {
  it.each(['organisation', 'project', 'layer', 'hub'] as const)(
    '%s filters before paging, excludes cursor from totals, and omits continuation counts',
    async type => {
      const { sqlite, db, statements, opts } = setup()
      for (let i = 0; i < 31; i++) {
        const id = String(i).padStart(2, '0')
        sqlite
          .prepare(
            `insert into ${type}(id,isArchived,isPublished,modifiedAt) values(?,0,1,?)`,
          )
          .run(id, id)
        sqlite
          .prepare(
            `insert into ${type}I18n(${type}Id,locale,name,nameGen) values(?,'en',?,0)`,
          )
          .run(id, i < 3 ? 'No' : 'Matching')
      }
      const read = (
        pagination: {
          limit: number
          offset?: number
          afterId?: string
          afterValue?: string
        },
        includeCount = true,
        countOnly = false,
      ) => {
        const query = {
          q: 'matching',
          indexFilters: { hasName: true },
          includeCount,
          countOnly,
        }
        const sorting = { sortBy: 'id', sortOrder: 'asc' as const }
        const auth = [sql`${sql.identifier(type)}.id != '30'`]
        if (type === 'organisation')
          return listOrganisations(db, {}, auth, opts, pagination, sorting, query)
        if (type === 'project')
          return listProjects(db, {}, auth, opts, pagination, sorting, query)
        if (type === 'layer')
          return listLayers(db, {}, auth, opts, pagination, sorting, query)
        return listHubs(db, {}, auth, pagination, sorting, query)
      }
      const count = await read({ limit: 25 }, true, true)
      expect(count).toMatchObject({ data: [], totalCount: 27, hasMore: false })
      expect(statements).toHaveLength(1)
      expect(statements[0]).toMatch(/count\(\*\)/i)
      statements.length = 0
      const first = await read({ limit: 25 })
      expect(first.totalCount).toBe(27)
      expect(first.data).toHaveLength(25)
      expect(first.hasMore).toBe(true)
      const pagination =
        type === 'hub'
          ? { limit: 25, offset: 25 }
          : { limit: 25, afterId: '27', afterValue: '27' }
      const countedNext = await read(pagination)
      expect(countedNext.totalCount).toBe(27)
      expect(countedNext.data.map(row => row.id)).toEqual(['28', '29'])
      statements.length = 0
      const next = await read(pagination, false)
      expect(next.totalCount).toBeNull()
      expect(next.hasMore).toBe(false)
      expect(statements.some(statement => /count\(\*\)/i.test(statement))).toBe(false)
    },
  )

  it('matches authored content, incomplete translations, images and literal punctuation', async () => {
    const { sqlite, db } = setup()
    sqlite.exec(`insert into organisation(id,code,imageId) values('a','a','image'),('b','b',null),('c','c',null);
      insert into image(id) values('image');
      insert into organisationI18n(organisationId,locale,name,nameGen) values
      ('a','en','100%_Manual',0),('a','zh-hant','字',0),('b','en','Generated',1),('c','en','Source',0);`)
    const ids = async (filters: ResourceIndexFilters) =>
      (
        await db
          .select({ id: schema.organisation.id })
          .from(schema.organisation)
          .where(
            and(...(await resourceIndexFilterConditions(db, 'organisation', filters))),
          )
      ).map(row => row.id)
    expect(await ids({ hasName: true })).toEqual(['a', 'c'])
    expect(await ids({ hasName: false })).toEqual(['b'])
    expect(await ids({ hasImage: true })).toEqual(['a'])
    expect(
      await ids({
        translationLocales: { en: true, zhHant: true },
        isNameTranslated: { en: true },
      }),
    ).toEqual(['a'])
    expect(
      await ids({
        translationLocales: { en: true, zhHant: true },
        isNameTranslated: { en: false },
      }),
    ).toEqual(['c'])
    const found = await db
      .select({ id: schema.organisation.id })
      .from(schema.organisation)
      .where(resourceIndexSearchCondition('organisation', '%_'))
    expect(found.map(row => row.id)).toEqual(['a'])
    expect(
      matchesResourceIndexSearch(
        { id: 'a', i18n: { en: { name: '100%_Manual' } } },
        '%_',
      ),
    ).toBe(true)
    expect(
      matchesResourceIndexSearch(
        { id: 'b', i18n: { en: { name: 'Generated' } } },
        '%_',
      ),
    ).toBe(false)
  })

  it('counts the complete shared location scope independently of cursor and omits detail counts', async () => {
    const { sqlite, db, statements } = setup()
    for (let i = 0; i < 32; i++)
      sqlite
        .prepare(`insert into location(id,state,kind) values(?,'linked','building')`)
        .run(String(i).padStart(2, '0'))
    sqlite.exec(
      `insert into location(id,state,kind,ownerOrganisationId) values('private','manual','building','other')`,
    )
    const first = await listLocationResources(db, {
      includeCount: true,
      kind: 'building',
    })
    expect(first.totalCount).toBe(32)
    expect(first.data).toHaveLength(25)
    const next = await listLocationResources(db, {
      includeCount: true,
      after: first.nextCursor!,
    })
    expect(next.totalCount).toBe(32)
    expect(next.data).toHaveLength(7)
    statements.length = 0
    expect(
      (await listLocationResources(db, { after: first.nextCursor! })).totalCount,
    ).toBeNull()
    expect(statements.some(statement => /count\(\*\)/i.test(statement))).toBe(false)
  })

  it('validates review filters without stripping them from the server query', () => {
    expect(
      GetTasksSchema.parse({
        conditions: { reviewAction: 'added-feature', reviewOutcome: 'accepted' },
      }).conditions,
    ).toEqual({ reviewAction: 'added-feature', reviewOutcome: 'accepted' })
  })

  it('searches task contributors and parent names with literal SQL semantics', async () => {
    const { sqlite, db } = setup()
    sqlite.exec(`insert into task(id,contributorId,projectId) values('a','u','p'),('b','v','q');
      insert into user(id,name) values('u','100%_Name');
      insert into projectI18n(projectId,locale,name) values('p','en','Parent');`)
    for (const text of ['%_', 'Parent']) {
      const rows = await db
        .select({ id: schema.task.id })
        .from(schema.task)
        .where(taskIndexSearchCondition(text))
      expect(rows.map(row => row.id)).toEqual(['a'])
    }
  })
})
