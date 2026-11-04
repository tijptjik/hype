// FIXTURES
import { createOrganisationUserTables } from './organisationUserTables'
// TYPES
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { D1Database } from '@cloudflare/workers-types'

interface AuthStatement {
  bind(...parameters: SQLInputValue[]): AuthStatement
  first(column?: string): Promise<unknown>
  all(): Promise<{
    results: unknown[]
    success: boolean
    meta: { changes: number }
  }>
  raw(): Promise<unknown[]>
  run(): Promise<{ success: boolean; meta: { changes: number | bigint } }>
}

/**
 * Add the persisted policy tables consulted by the production authentication hooks.
 * @param sqlite - Isolated SQLite database with the suite's user and import tables.
 * @returns Nothing after the policy migrations have been applied.
 * @remarks Empty policies still execute the real sign-in enrolment. Callers may
 * supply minimal legacy tables or tables derived from the current app schema.
 */
export function createAuthHookTables(sqlite: DatabaseSync): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS hub (id TEXT PRIMARY KEY, code TEXT, domain TEXT);
    CREATE TABLE IF NOT EXISTS organisationRole(organisationId TEXT,userId TEXT,role TEXT NOT NULL DEFAULT 'member',PRIMARY KEY(organisationId,userId));
    CREATE TABLE organisation (
      id TEXT PRIMARY KEY, hubId TEXT, isArchived INTEGER, isPublished INTEGER,
      isCoreInclusive INTEGER, isHubExclusive INTEGER
    );
  `)
  createOrganisationUserTables(sqlite)
}

/**
 * Adapts test SQLite to D1's statement interface for real Better Auth persistence.
 * @param sqlite - Database owned and closed by the calling test suite.
 * @returns A D1-compatible database with bound and unbound statement execution.
 * @remarks Batches serialize and roll back atomically, matching D1's write contract.
 */
export function createAuthDatabase(sqlite: DatabaseSync): D1Database {
  let queued = Promise.resolve()
  const prepare = (sql: string, values: SQLInputValue[] = []): AuthStatement => ({
    bind: (...parameters: SQLInputValue[]) => prepare(sql, parameters),
    async first(column?: string) {
      const row = sqlite.prepare(sql).get(...values)
      return column === undefined ? (row ?? null) : (row?.[column] ?? null)
    },
    async all() {
      const results = sqlite.prepare(sql).all(...values)
      const { changes } = sqlite.prepare('SELECT changes() AS changes').get() as {
        changes: number
      }
      return { results, success: true, meta: { changes } }
    },
    async raw() {
      const statement = sqlite.prepare(sql)
      statement.setReturnArrays(true)
      return statement.all(...values)
    },
    async run() {
      return { success: true, meta: sqlite.prepare(sql).run(...values) }
    },
  })
  return {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      const previous = queued
      let release = (): void => {}
      queued = new Promise<void>(resolve => {
        release = resolve
      })
      await previous
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.all())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      } finally {
        release()
      }
    },
  } as unknown as D1Database
}
