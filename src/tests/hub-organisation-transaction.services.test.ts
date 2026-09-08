// @vitest-environment node
import { DatabaseSync } from 'node:sqlite'
import { getTableColumns } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { syncOrganisations } from '$lib/db/services/hub'
import { organisation } from '$lib/db/schema'
import type { Database } from '$lib/types'

let sqlite: DatabaseSync
let db: Database
let batches: number[]
beforeEach(() => {
  batches = []
  sqlite = new DatabaseSync(':memory:')
  const columns = Object.values(getTableColumns(organisation)).map(
    column => `"${column.name}" ${column.getSQLType()}`,
  )
  sqlite.exec(`CREATE TABLE organisation (${columns.join(', ')});
    CREATE UNIQUE INDEX org_id ON organisation(id);
    INSERT INTO organisation (id, hubId, isCoreInclusive, isHubExclusive, modifiedAt) VALUES
    ('old', 'hub', 0, 1, 'original'), ('keep', 'hub', 0, 1, 'original'),
    ('other', 'other-hub', 0, 1, 'original')`)
  db = drizzle({
    prepare: (sql: string) => ({
      bind: (...params: never[]) => ({
        sql,
        params,
        raw: async () => {
          const statement = sqlite.prepare(sql)
          statement.setReturnArrays(true)
          return statement.all(...params)
        },
      }),
    }),
    batch: async (statements: { sql: string; params: never[] }[]) => {
      batches.push(statements.length)
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(({ sql, params }) => {
          if (params.length > 100) throw new Error('D1 parameter budget exceeded')
          return { results: sqlite.prepare(sql).all(...params) }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  } as never) as Database
})
afterEach(() => sqlite.close())

/** Captures affiliation, visibility, and write tokens to detect partial updates. */
function snapshot() {
  return sqlite
    .prepare(
      'SELECT id, hubId, isCoreInclusive, isHubExclusive, modifiedAt FROM organisation ORDER BY id',
    )
    .all()
}

describe('atomic hub organisation reassignment', () => {
  it('restores all affiliations and visibility flags when a reassignment fails', async () => {
    sqlite.exec(`CREATE TRIGGER reject_assignment BEFORE UPDATE ON organisation
      WHEN NEW.id = 'other' AND NEW.hubId = 'hub'
      BEGIN SELECT RAISE(ABORT, 'injected failure'); END`)
    const before = snapshot()
    await expect(
      syncOrganisations(db, 'hub', [
        { organisationId: 'keep', isCoreInclusive: true, isHubExclusive: false },
        { organisationId: 'other', isCoreInclusive: false, isHubExclusive: true },
      ]),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('does not detach organisations when a requested target is missing', async () => {
    const before = snapshot()
    await expect(
      syncOrganisations(db, 'hub', [
        { organisationId: 'missing', isCoreInclusive: true, isHubExclusive: false },
      ]),
    ).rejects.toThrow()
    expect(snapshot()).toEqual(before)
  })

  it('applies a complete assignment set while preserving unrelated organisations', async () => {
    const other = snapshot().find(row => row.id === 'other')
    await syncOrganisations(db, 'hub', [
      { organisationId: 'keep', isCoreInclusive: true, isHubExclusive: false },
    ])
    expect(snapshot()).toContainEqual(other)
    expect(snapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'old',
          hubId: null,
          isCoreInclusive: 1,
          isHubExclusive: 0,
        }),
        expect.objectContaining({
          id: 'keep',
          hubId: 'hub',
          isCoreInclusive: 1,
          isHubExclusive: 0,
        }),
      ]),
    )
    expect(batches).toHaveLength(1)
  })

  it('clears the current hub without changing another hub', async () => {
    const other = snapshot().find(row => row.id === 'other')
    await syncOrganisations(db, 'hub', [])
    expect(snapshot().filter(row => row.hubId === 'hub')).toHaveLength(0)
    expect(snapshot()).toContainEqual(other)
    expect(batches).toEqual([1])
  })

  it('keeps more than 100 assignments in one transaction and within SQL binding limits', async () => {
    const insert = sqlite.prepare('INSERT INTO organisation (id) VALUES (?)')
    const rows = Array.from({ length: 250 }, (_, i) => {
      const organisationId = `org-${i}`
      insert.run(organisationId)
      return { organisationId, isCoreInclusive: false, isHubExclusive: true }
    })
    await syncOrganisations(db, 'hub', rows)
    expect(snapshot().filter(row => row.hubId === 'hub')).toHaveLength(250)
    expect(batches).toEqual([252])
  })
})
