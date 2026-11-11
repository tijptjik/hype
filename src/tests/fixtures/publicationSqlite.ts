// NODE
import { DatabaseSync } from 'node:sqlite'
// DRIZZLE
import { drizzle } from 'drizzle-orm/d1'

/**
 * Runs publication queries through the D1 adapter against isolated SQLite.
 * @param schema Tables and relations used by the tested query.
 * @param maxBindings Optional per-statement parameter limit for D1 regression checks.
 * @returns The database adapter and an explicitly owned SQLite connection.
 */
export function publicationSqlite<T extends Record<string, unknown>>(
  schema: T,
  maxBindings = Infinity,
) {
  const sqlite = new DatabaseSync(':memory:')
  const prepare = (query: string, bindings: unknown[] = []) => ({
    bind: (...params: unknown[]) => {
      if (params.length > maxBindings)
        throw new Error(
          `D1 parameter limit exceeded: ${params.length} > ${maxBindings}; SQL length ${query.length}`,
        )
      return prepare(query, params)
    },
    all: async () => ({ results: sqlite.prepare(query).all(...(bindings as never[])) }),
    // Preserve duplicate column names from joined projections, as D1 raw() does.
    raw: async () => {
      const statement = sqlite.prepare(query)
      statement.setReturnArrays(true)
      return statement.all(...(bindings as never[]))
    },
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
