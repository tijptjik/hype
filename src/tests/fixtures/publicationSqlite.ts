// NODE
import { DatabaseSync } from 'node:sqlite'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'

/**
 * Runs publication queries through the D1 adapter against isolated SQLite.
 * @param schema Tables and relations used by the tested query.
 * @returns The database adapter and an explicitly owned SQLite connection.
 */
export function publicationSqlite<T extends Record<string, unknown>>(schema: T) {
  const sqlite = new DatabaseSync(':memory:')
  const prepare = (query: string, bindings: unknown[] = []) => ({
    bind: (...params: unknown[]) => prepare(query, params),
    all: async () => ({ results: sqlite.prepare(query).all(...(bindings as never[])) }),
    raw: async () =>
      sqlite
        .prepare(query)
        .all(...(bindings as never[]))
        .map(row => Object.values(row)),
    run: async () => ({
      results: [],
      meta: sqlite.prepare(query).run(...(bindings as never[])),
    }),
  })
  const batch = async (statements: ReturnType<typeof prepare>[]) => {
    sqlite.exec('BEGIN')
    try {
      const results = []
      for (const statement of statements) results.push(await statement.all())
      sqlite.exec('COMMIT')
      return results
    } catch (error) {
      sqlite.exec('ROLLBACK')
      throw error
    }
  }
  return { sqlite, db: drizzle({ prepare, batch } as never, { schema }) }
}
