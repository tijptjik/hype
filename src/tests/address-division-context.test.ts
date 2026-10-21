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
    'CREATE TABLE divisionDefinition(id TEXT PRIMARY KEY,apiReleaseSet TEXT,attributes TEXT)',
  )
  const prepare = (query: string, values: unknown[] = []) => ({
    bind: (...args: unknown[]) => {
      expect(args.length).toBeLessThanOrEqual(100)
      return prepare(query, args)
    },
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return statement.all(...(values as never[]))
    },
    all: async () => ({
      results: sqlite.prepare(query).all(...(values as never[])),
      success: true,
    }),
  })
  const db = drizzle({ prepare } as unknown as D1Database) as unknown as Database
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
  return { db, insert }
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
      validateAddressDivisionOverrides(db, { neighbourhoodId: 'hood' }),
    ).resolves.toBeUndefined()
    await expect(
      validateAddressDivisionOverrides(db, { neighbourhoodId: 'district' }),
    ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
    await expect(
      validateAddressDivisionOverrides(db, { neighbourhoodId: 'unknown' }),
    ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
    await expect(
      validateAddressDivisionOverrides(db, { neighbourhoodId: { mode: 'marker' } }),
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
      localityPaths: [['macro', 'hood', 'micro']],
    }),
  ).resolves.toBeUndefined()
  await expect(
    validateAddressDivisionOverrides(db, { localityPaths: [] }),
  ).resolves.toBeUndefined()
  await expect(
    validateAddressDivisionOverrides(db, {
      localityPaths: [['macro', 'hood'], ['other-hood']],
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
      validateAddressDivisionOverrides(db, { localityPaths: [path] }),
    ).rejects.toThrow('INVALID_ADDRESS_DIVISION')
  }
})
