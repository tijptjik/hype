// RUNTIME
import { Database as Sqlite } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/d1'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'
import type { Database } from '../../../src/lib/types'

type Statement = {
  bind: (...values: unknown[]) => Statement
  raw: () => Promise<unknown[][]>
  first: () => Promise<unknown | null>
  all: () => Promise<{
    success: boolean
    results: unknown[]
    meta: { changes: number }
  }>
  run: () => Promise<{ success: boolean; meta: { changes: number } }>
}

/**
 * Open an explicit local SQLite build with D1-compatible atomic batch semantics.
 * @param path Existing offline SQLite database; never a remote binding or a live server file.
 * @param options Optional bounded-memory mode for large offline release rehearsals.
 * @returns Domain database, raw inspection connection and required close operation.
 * @remarks Each statement is prepared/executed separately; failures roll back the batch.
 * This adapter supports offline rebuilds and migration checks, not deployed D1.
 */
export function openSqliteDomain(
  path: string,
  options: { releaseMemoryAfterBatch?: boolean } = {},
): {
  db: Database
  binding: D1Database
  sqlite: Sqlite
  close: () => void
} {
  const sqlite = new Sqlite(path, { strict: true, create: false })
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;')
  /** Build a deferred statement for atomic execution. @param query Trusted SQL. @param values Bound parameters. @returns Statement adapter. */
  const prepare = (query: string, values: unknown[] = []): Statement => ({
    bind: (...args) => {
      if (args.length > 100) throw new Error('D1 bound-parameter limit exceeded')
      return prepare(query, args)
    },
    raw: async () => sqlite.query(query).values(...(values as never[])),
    first: async () => sqlite.query(query).get(...(values as never[])) ?? null,
    all: async () => {
      // Large table readbacks also release the previous table's transient allocations.
      if (options.releaseMemoryAfterBatch) Bun.gc(true)
      return {
        success: true,
        results: sqlite.query(query).all(...(values as never[])),
        meta: {
          changes: Number(
            (sqlite.query('SELECT changes() AS n').get() as { n: number }).n,
          ),
        },
      }
    },
    run: async () => ({
      success: true,
      meta: {
        changes: Number(sqlite.query(query).run(...(values as never[])).changes),
      },
    }),
  })
  /** Execute all statements or roll them all back. @param statements Deferred writes. @returns D1-shaped results. */
  const batch = async (statements: Statement[]) => {
    // Savepoints compose domain batches with an offline import's outer transaction.
    const nested = sqlite.inTransaction
    const savepoint = `domain_${crypto.randomUUID().replaceAll('-', '')}`
    sqlite.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN IMMEDIATE')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.all())
      sqlite.exec(nested ? `RELEASE ${savepoint}` : 'COMMIT')
      if (options.releaseMemoryAfterBatch) {
        // Release transient SQL and JSON allocations before the managed lane throttles.
        sqlite.clearQueryCache()
        sqlite.exec('PRAGMA shrink_memory')
        Bun.gc(true)
      }
      return results
    } catch (error) {
      sqlite.exec(nested ? `ROLLBACK TO ${savepoint}` : 'ROLLBACK')
      if (nested) sqlite.exec(`RELEASE ${savepoint}`)
      throw error
    }
  }
  const binding = { prepare, batch } as unknown as D1Database
  // Drizzle may resolve its global D1 type to Miniflare in Bun tooling; this adapter
  // deliberately supplies the tested statement/batch subset of either runtime.
  const db = drizzle(binding as unknown as Parameters<typeof drizzle>[0]) as Database
  return { db, binding, sqlite, close: () => sqlite.close() }
}
