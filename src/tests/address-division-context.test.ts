// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, describe, expect, it } from 'vitest'
import {
  readAddressDivisionContext,
  validateAddressDivisionOverrides,
} from '#lib/db/services/addressDivisions.js'
import type { Database } from '#lib/types.js'
import type { D1Database } from '@cloudflare/workers-types'
const databases: DatabaseSync[] = []
afterEach(() => {
  for (const db of databases.splice(0)) db.close()
})
function setup() {
  const sqlite = new DatabaseSync(':memory:')
  databases.push(sqlite)
  sqlite.exec(
    'CREATE TABLE divisionRefresh(id INTEGER PRIMARY KEY,catalogueRelease TEXT); CREATE TABLE divisionDefinition(id TEXT PRIMARY KEY,apiReleaseSet TEXT,attributes TEXT)',
  )
  const queries: { sql: string; rows: number }[] = []
  const hooks: { afterRead?: (query: string) => void } = {}
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => {
      expect(args.length).toBeLessThanOrEqual(100)
      return prepare(query, args)
    },
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      const rows = statement.all(...(values as never[]))
      queries.push({ sql: query, rows: rows.length })
      hooks.afterRead?.(query)
      return rows
    },
    all: async () => {
      const results = sqlite.prepare(query).all(...(values as never[]))
      queries.push({ sql: query, rows: results.length })
      hooks.afterRead?.(query)
      return { results, success: true }
    },
  })
  const binding = { prepare }
  const db = drizzle(binding as unknown as D1Database) as unknown as Database
  function insert(
    id: string,
    kind: string,
    geometry?: unknown,
    attributes: Record<string, unknown> = {},
  ) {
    sqlite.prepare('INSERT INTO divisionDefinition VALUES(?,?,?)').run(
      id,
      'release',
      JSON.stringify({
        class: kind,
        category: kind === 'district' ? 'administrative' : 'hood',
        level: 5,
        names: { en: { name: id } },
        membershipGeometry: geometry ? [{ geometry }] : [],
        ...attributes,
      }),
    )
  }
  return { db, insert, sqlite, queries, binding, hooks }
}
const square = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [3, 3],
      [7, 3],
      [7, 7],
      [3, 7],
      [3, 3],
    ],
  ],
}

describe('mirrored address geography', () => {
  it('excludes retired definitions while preserving them for existing references', async () => {
    const { db, insert, sqlite } = setup()
    insert('current', 'neighbourhood', square)
    insert('retired', 'neighbourhood', square)
    sqlite.exec(
      "UPDATE divisionDefinition SET apiReleaseSet='old' WHERE id='retired'; INSERT INTO divisionRefresh VALUES(1,'release')",
    )
    const result = await readAddressDivisionContext(db, [1, 1])
    expect(result.memberships.map(item => item.id)).toEqual(['current'])
    expect(result.options.map(item => item.id)).toEqual(['current'])
  })
  it('retains separate ancestry and resolves island groups even without a group polygon', async () => {
    const { db, insert } = setup()
    const ancestry = {
      landform: [
        [{ id: 'island-group', class: 'island_group', fullContainment: true }],
      ],
    }
    insert('island', 'minor_island', square, {
      category: 'landform',
      hierarchies: ancestry,
    })
    insert('island-group', 'island_group', undefined, { category: 'landform' })
    const result = await readAddressDivisionContext(db, [1, 1])
    expect(result.memberships.map(item => item.id)).toEqual(['island', 'island-group'])
    expect(result.memberships[0].hierarchies).toEqual(ancestry)
    expect(result.options).toEqual([])
  })
  it('does not promote partially intersecting landform ancestors to marker memberships', async () => {
    const { db, insert } = setup()
    insert('island', 'minor_island', square, {
      category: 'landform',
      hierarchies: {
        landform: [
          [{ id: 'island-group', class: 'island_group', fullContainment: false }],
        ],
      },
    })
    insert('island-group', 'island_group', undefined, { category: 'landform' })
    expect(
      (await readAddressDivisionContext(db, [1, 1])).memberships.map(item => item.id),
    ).toEqual(['island'])
  })
  it('excludes mirrored cities from address memberships and editable locality choices', async () => {
    const { db, insert } = setup()
    insert('kowloon', 'city', square)
    insert('Kowloon City District', 'district', square)
    insert('mong-kok', 'macrohood', square)
    const result = await readAddressDivisionContext(db, [1, 1])
    expect(result.available).toBe(true)
    expect(result.memberships.map(item => item.id)).toEqual([
      'Kowloon City District',
      'mong-kok',
    ])
    expect(result.options.map(item => item.id)).toEqual(['mong-kok'])
  })
  it('uses authoritative polygon coverage including holes and boundaries, independently of saved address text', async () => {
    const { db, insert } = setup()
    insert('hood', 'neighbourhood', square)
    insert('district', 'district', {
      type: 'Polygon',
      coordinates: [square.coordinates[0]],
    })
    expect(
      (await readAddressDivisionContext(db, [1, 1])).memberships.map(item => item.id),
    ).toEqual(['district', 'hood'])
    expect(
      (await readAddressDivisionContext(db, [5, 5])).memberships.map(item => item.id),
    ).toEqual(['district'])
    expect(
      (await readAddressDivisionContext(db, [3, 5])).memberships.map(item => item.id),
    ).toEqual(['district', 'hood'])
    expect((await readAddressDivisionContext(db, [11, 11])).memberships).toEqual([])
  })
  it('distinguishes unavailable geometry and returns choices beyond the first page', async () => {
    const { db, insert } = setup()
    for (let i = 0; i < 81; i++)
      insert(`hood-${i.toString().padStart(3, '0')}`, 'neighbourhood')
    const result = await readAddressDivisionContext(db, [1, 1])
    expect(result.available).toBe(false)
    expect(result.options).toHaveLength(81)
    expect(result.memberships).toEqual([])
  })
  it('rejects an unknown ID or a factual ID submitted under a subjective role', async () => {
    const { db, insert } = setup()
    insert('district', 'district', square)
    insert('hood', 'neighbourhood', square)
    await expect(
      validateAddressDivisionOverrides(db, { localityPath: ['hood'] }),
    ).resolves.toBeUndefined()
    await expect(
      validateAddressDivisionOverrides(db, { localityPath: ['district'] }),
    ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
    await expect(
      validateAddressDivisionOverrides(db, { localityPath: ['unknown'] }),
    ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
    await expect(
      validateAddressDivisionOverrides(db, { localityPath: null }),
    ).resolves.toBeUndefined()
  })
})

it('accepts only one complete source neighbourhood path and rejects invented ancestry', async () => {
  const { db, insert } = setup()
  insert('macro', 'macrohood', undefined, { level: 4 })
  insert('hood', 'neighbourhood', undefined, {
    level: 5,
    hierarchies: {
      locality: [[{ id: 'macro', class: 'macrohood', fullContainment: true }]],
    },
  })
  insert('other-hood', 'neighbourhood', undefined, { level: 5 })
  insert('micro', 'microhood', undefined, {
    level: 6,
    hierarchies: {
      locality: [
        [
          { id: 'macro', class: 'macrohood', fullContainment: true },
          { id: 'hood', class: 'neighbourhood', fullContainment: true },
        ],
      ],
    },
  })
  insert('district', 'district', undefined, { level: 2 })
  await expect(
    validateAddressDivisionOverrides(db, {
      localityPath: ['macro', 'hood', 'micro'],
    }),
  ).resolves.toBeUndefined()
  await expect(
    validateAddressDivisionOverrides(db, { localityPath: [] }),
  ).resolves.toBeUndefined()
  await expect(
    validateAddressDivisionOverrides(db, {
      // @ts-expect-error Reject nested paths from untyped clients.
      localityPath: [['macro', 'hood'], ['other-hood']],
    }),
  ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
  for (const path of [
    ['hood', 'macro'],
    ['hood', 'other-hood'],
    ['hood', 'hood'],
    ['district', 'hood'],
    ['unknown'],
    ['macro', 'micro'],
    ['other-hood', 'micro'],
  ]) {
    await expect(
      validateAddressDivisionOverrides(db, { localityPath: path }),
    ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
  }
})

it('reuses release-scoped metadata and reads geometry only for bounding-box candidates', async () => {
  const { db, insert, sqlite, queries, binding } = setup()
  sqlite.exec("INSERT INTO divisionRefresh VALUES(1,'release')")
  insert('near', 'neighbourhood', square, { membershipBounds: [0, 0, 10, 10] })
  for (let i = 0; i < 1200; i++)
    insert(`far-${String(i).padStart(4, '0')}`, 'neighbourhood', square, {
      membershipBounds: [20, 20, 30, 30],
    })
  const cold = await readAddressDivisionContext(db, [1, 1])
  expect(cold.memberships.map(row => row.id)).toEqual(['near'])
  expect(cold.options).toHaveLength(1201)
  const coldReads = queries.length
  expect(coldReads).toBe(6)
  queries.length = 0
  const nextRequest = drizzle(binding as unknown as D1Database) as unknown as Database
  const warm = await readAddressDivisionContext(nextRequest, [2, 2])
  expect(warm).toEqual(cold)
  expect(queries).toHaveLength(3)
  const geometryReads = queries.filter(query =>
    query.sql.includes("json_object('membershipGeometry',"),
  )
  expect(geometryReads.map(query => query.rows)).toEqual([1])
  // Escaped response objects cannot poison cached metadata for the next marker.
  warm.options[0].names.en.name = 'mutated'
  expect(
    (await readAddressDivisionContext(db, [2, 2])).options[0].names.en.name,
  ).not.toBe('mutated')
  console.log({
    catalogueRows: 1201,
    priorCataloguePages: 31,
    coldReads,
    warmReads: 3,
    geometryRowsRead: 1,
  })
})

it('invalidates the metadata cache on publication and isolates database bindings', async () => {
  const first = setup()
  first.sqlite.exec("INSERT INTO divisionRefresh VALUES(1,'release')")
  first.insert('old', 'neighbourhood', square, { membershipBounds: [0, 0, 10, 10] })
  expect((await readAddressDivisionContext(first.db, [1, 1])).options[0].id).toBe('old')
  first.insert('new', 'neighbourhood', square, { membershipBounds: [0, 0, 10, 10] })
  first.sqlite.exec(
    "UPDATE divisionDefinition SET apiReleaseSet='next' WHERE id='new'; UPDATE divisionRefresh SET catalogueRelease='next'",
  )
  expect(
    (await readAddressDivisionContext(first.db, [1, 1])).options.map(row => row.id),
  ).toEqual(['new'])
  const second = setup()
  second.sqlite.exec("INSERT INTO divisionRefresh VALUES(1,'next')")
  second.insert('other-db', 'neighbourhood', square)
  second.sqlite.exec("UPDATE divisionDefinition SET apiReleaseSet='next'")
  expect((await readAddressDivisionContext(second.db, [1, 1])).options[0].id).toBe(
    'other-db',
  )
})

it('batches external candidate parts while retaining holes, boundaries and missing-bounds fallback', async () => {
  const { db, insert, sqlite, queries } = setup()
  sqlite.exec(
    'CREATE TABLE divisionGeometryPart(divisionId TEXT, part INTEGER, geometries TEXT, PRIMARY KEY(divisionId,part))',
  )
  for (let i = 0; i < 6; i++) {
    const id = `external-${i}`
    insert(id, 'neighbourhood', undefined, {
      membershipGeometryExternal: true,
      membershipBounds: [0, 0, 10, 10],
    })
    sqlite
      .prepare('INSERT INTO divisionGeometryPart VALUES(?,?,?)')
      .run(id, 0, JSON.stringify([square]))
  }
  insert('missing-bounds', 'neighbourhood', square)
  insert('null-bounds', 'neighbourhood', square, { membershipBounds: null })
  insert('far-external', 'neighbourhood', undefined, {
    membershipGeometryExternal: true,
    membershipBounds: [20, 20, 30, 30],
  })
  expect((await readAddressDivisionContext(db, [1, 1])).memberships).toHaveLength(8)
  const parts = queries.filter(query =>
    query.sql.includes('from "divisionGeometryPart"'),
  )
  expect(parts.map(query => query.rows)).toEqual([4, 2])
  expect((await readAddressDivisionContext(db, [5, 5])).memberships).toEqual([])
  expect((await readAddressDivisionContext(db, [3, 5])).memberships).toHaveLength(8)
})

it('retries rather than combining memberships and options from different published releases', async () => {
  const { db, insert, sqlite, hooks } = setup()
  sqlite.exec("INSERT INTO divisionRefresh VALUES(1,'release')")
  insert('old', 'neighbourhood', square)
  insert('new', 'neighbourhood', square)
  sqlite.exec("UPDATE divisionDefinition SET apiReleaseSet='next' WHERE id='new'")
  hooks.afterRead = query => {
    if (!query.includes("json_object('membershipGeometry',")) return
    hooks.afterRead = undefined
    sqlite.exec("UPDATE divisionRefresh SET catalogueRelease='next'")
  }
  const result = await readAddressDivisionContext(db, [1, 1])
  expect(result.options.map(row => row.id)).toEqual(['new'])
  expect(result.memberships.map(row => row.id)).toEqual(['new'])
})
