// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { and, asc, eq, inArray, not, sql, type SQL } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chunkedInArray } from '$lib/utils/batch-query'

const records = sqliteTable('records', {
  id: text('id'),
  scope: text('scope'),
  rank: integer('rank'),
  active: integer('active', { mode: 'boolean' }),
  date: integer('date', { mode: 'timestamp_ms' }),
  metadata: text('metadata', { mode: 'json' }),
})
const db = drizzle({} as never)
let sqlite: DatabaseSync

beforeEach(() => {
  sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'CREATE TABLE records (id TEXT, scope TEXT, rank INTEGER, active INTEGER, date INTEGER, metadata TEXT)',
  )
  const insert = sqlite.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?)')
  for (let i = 0; i < 260; i++) {
    insert.run(
      `id-${i}`,
      i % 2 ? 'allowed' : 'other',
      i,
      i % 2,
      i * 1000,
      JSON.stringify({ i }),
    )
  }
  insert.run(null, 'allowed', null, null, null, null)
})
afterEach(() => sqlite.close())

/** Executes generated SQL, enforcing D1's per-statement bind budget. */
function read(predicate: SQL | undefined, limit = 300, offset = 0) {
  if (!predicate) throw new Error('Expected a membership predicate')
  const query = db
    .select({ id: records.id })
    .from(records)
    .where(predicate)
    .orderBy(asc(records.rank))
    .limit(limit)
    .offset(offset)
    .toSQL()
  expect(query.params.length).toBeLessThanOrEqual(100)
  return sqlite.prepare(query.sql).all(...(query.params as never[]))
}

describe('D1-safe membership predicates', () => {
  it('keeps a 250-value filter in one query with global ordering and pagination', () => {
    const values = Array.from({ length: 250 }, (_, i) => `id-${249 - i}`)
    expect(
      read(and(chunkedInArray(records.id, values), eq(records.scope, 'allowed')), 3, 2),
    ).toEqual([{ id: 'id-5' }, { id: 'id-7' }, { id: 'id-9' }])
  })

  it('budgets multiple independent membership filters together', () => {
    const ids = Array.from({ length: 150 }, (_, i) => `id-${i}`)
    const ranks = Array.from({ length: 100 }, (_, i) => i + 99)
    expect(
      read(and(chunkedInArray(records.id, ids), chunkedInArray(records.rank, ranks))),
    ).toHaveLength(51)
  })

  it('never widens an empty scope, including when negated', () => {
    expect(read(chunkedInArray(records.id, []))).toEqual([])
    expect(read(not(chunkedInArray(records.id, [])))).toHaveLength(261)
  })

  it('treats quotes, Unicode, and SQL-looking IDs as bound data', () => {
    const id = "灣仔'); DROP TABLE records; --"
    sqlite.prepare('INSERT INTO records (id) VALUES (?)').run(id)
    expect(read(chunkedInArray(records.id, [id, 'missing']))).toEqual([{ id }])
    expect(read(sql`1 = 1`)).toHaveLength(262)
  })

  it('preserves duplicate and NULL membership and negation semantics', () => {
    const values = ['id-1', 'id-1', null]
    expect(read(chunkedInArray(records.id, values))).toEqual(
      read(inArray(records.id, values as never[])),
    )
    expect(read(not(chunkedInArray(records.id, values)))).toEqual(
      read(not(inArray(records.id, values as never[]))),
    )
  })

  it('uses Drizzle column encoders for boolean, timestamp, and JSON fields', () => {
    expect(read(chunkedInArray(records.active, [true]))).toEqual(
      read(inArray(records.active, [true])),
    )
    expect(
      read(chunkedInArray(records.date, [new Date(3000), new Date(1000)])),
    ).toEqual(read(inArray(records.date, [new Date(3000), new Date(1000)])))
    expect(read(chunkedInArray(records.metadata, [{ i: 3 }, { i: 7 }]))).toEqual(
      read(inArray(records.metadata, [{ i: 3 }, { i: 7 }])),
    )
  })

  it('preserves SQLite integer and text affinity', () => {
    expect(read(chunkedInArray(records.rank, ['001', 2, 3.5]))).toEqual(
      read(inArray(records.rank, ['001', 2, 3.5] as never[])),
    )
  })

  it('matches native numeric bindings when comparing text columns', () => {
    sqlite.exec("INSERT INTO records (id) VALUES ('1'), ('1.0'), ('2.5')")
    expect(read(chunkedInArray(records.id, [1, 2.5]))).toEqual(
      read(inArray(records.id, [1, 2.5] as never[])),
    )
  })

  it('rejects unencodable values rather than silently converting them to null', () => {
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, {}, 1n]) {
      expect(() => chunkedInArray(records.id, [value])).toThrow(TypeError)
    }
    expect(() => chunkedInArray(records.id, ['id-1'], 100)).toThrow('no room')
  })

  it('reserves the single binding alongside 99 existing parameters', () => {
    const filter = chunkedInArray(records.id, ['id-1', 'id-3'], 99)
    const query = db
      .select()
      .from(records)
      .where(
        and(filter, ...Array.from({ length: 99 }, () => eq(records.scope, 'allowed'))),
      )
      .toSQL()
    expect(query.params).toHaveLength(100)
    expect(sqlite.prepare(query.sql).all(...(query.params as never[]))).toHaveLength(2)
  })
})
