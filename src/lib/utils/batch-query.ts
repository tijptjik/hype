import { sql, type AnyColumn, type SQL } from 'drizzle-orm'

export const SQL_BATCH_SIZE = 100

/**
 * Builds an `IN` predicate using one bound JSON array, regardless of the value count.
 * @param column - Column to compare.
 * @param values - Candidate values.
 * @param otherParametersCount - Fixed parameters already present in the statement.
 * @returns A single SQL predicate, or a never-match predicate for no values.
 * @remarks The historical name is retained for callers. OR-ing smaller IN clauses
 * does not reduce a statement's total bindings. D1's json_each keeps filtering,
 * ordering, and pagination in one query without interpolating user data into SQL.
 * Values use the column's driver encoder before JSON serialization, preserving
 * boolean, timestamp, and JSON-column comparisons. Only finite numbers, strings,
 * and null driver values are supported; unsupported encodings fail before execution.
 */
export function chunkedInArray<T>(
  column: AnyColumn,
  values: readonly T[],
  otherParametersCount = 0,
): SQL<unknown> {
  if (values.length === 0) return sql`0 = 1`

  const availableSlots = SQL_BATCH_SIZE - Math.max(0, otherParametersCount)
  if (availableSlots <= 0) {
    throw new Error(
      `D1 batch query has no room for dynamic parameters after reserving ${otherParametersCount} fixed parameters.`,
    )
  }

  // Match Drizzle's null bypass and column mapping before packing a single parameter.
  const driverValues = values.map(value => {
    const mapped = value === null ? null : column.mapToDriverValue(value)
    if (
      mapped === null ||
      typeof mapped === 'string' ||
      (typeof mapped === 'number' && Number.isFinite(mapped))
    )
      return mapped
    throw new TypeError(
      'D1 membership filters require scalar JSON-compatible driver values',
    )
  })

  // D1 binds JavaScript numbers as REAL. CASE also removes json_each.value's affinity
  // so the target column applies the same coercion as it does to ordinary bound values.
  return sql`${column} in (
    select case when type in ('integer', 'real') then cast(value as real) else value end
    from json_each(${JSON.stringify(driverValues)})
  )`
}

type BatchParams<T> = {
  items: T[]
  otherParametersCount?: number
}

/**
 * Split an item list into D1-safe chunks after reserving space for fixed query params.
 *
 * @param params - Items to chunk and the count of non-array SQL parameters in the query.
 * @returns Ordered item batches that fit within D1's bound-parameter limit.
 * @remarks Consumers must budget `otherParametersCount` so the combined fixed and dynamic
 * query parameters stay within `SQL_BATCH_SIZE`. This function throws when the reserved
 * fixed-parameter count leaves no room for any item parameters.
 */
export function chunkForD1<T>(params: BatchParams<T>): T[][] {
  const otherParametersCount = params.otherParametersCount ?? 0
  const availableSlots = SQL_BATCH_SIZE - otherParametersCount

  if (availableSlots <= 0) {
    throw new Error(
      `D1 batch query has no room for dynamic parameters after reserving ${otherParametersCount} fixed parameters.`,
    )
  }

  const batches: T[][] = []

  for (let index = 0; index < params.items.length; index += availableSlots) {
    batches.push(params.items.slice(index, index + availableSlots))
  }

  return batches
}

/**
 * Execute a query callback over D1-safe chunks and flatten the results.
 *
 * @param params - Items to chunk and the count of non-array SQL parameters in the query.
 * @param query - Query callback executed once per chunk.
 * @returns Flattened rows from every chunk query.
 * @remarks This helper inherits the same parameter-budgeting constraints as `chunkForD1`
 * and will throw if `chunkForD1` cannot allocate any item parameter slots. Chunk queries
 * are executed sequentially in input order, so callers must not rely on parallel execution.
 */
export async function autochunk<TItem, TResult>(
  params: BatchParams<TItem>,
  query: (chunk: TItem[]) => Promise<TResult[]>,
): Promise<TResult[]> {
  const rows: TResult[] = []

  for (const chunk of chunkForD1(params)) {
    rows.push(...(await query(chunk)))
  }

  return rows
}
