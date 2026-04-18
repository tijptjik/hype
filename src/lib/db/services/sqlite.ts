/**
 * Returns whether an unknown database error represents transient SQLite lock contention.
 *
 * @param error - Unknown error thrown by D1/Drizzle.
 * @returns `true` when the error indicates a transient local SQLite lock.
 * @remarks
 * Local Miniflare/workerd sometimes surfaces `SQLITE_BUSY` as a nested D1 JSON parsing
 * failure instead of preserving the original SQLite message. Treat those local transport
 * wrappers as retryable for read operations so dev-server restarts recover cleanly.
 */
export const isSqliteBusyError = (error: unknown): boolean => {
  const visited = new Set<unknown>()
  const queue: unknown[] = [error]

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)

    if (current instanceof Error) {
      const message = current.message.toUpperCase()

      if (
        message.includes('SQLITE_BUSY') ||
        message.includes('DATABASE IS LOCKED') ||
        (message.includes('D1_ERROR') &&
          message.includes('FAILED TO PARSE BODY AS JSON') &&
          message.includes('INTERNAL ERROR'))
      ) {
        return true
      }

      queue.push(current.cause)
    }
  }

  return false
}

/**
 * Returns whether an unknown database error represents a missing SQLite schema object.
 *
 * @param error - Unknown error thrown by D1/Drizzle.
 * @param relationName - Optional table or column identifier expected in the error message.
 * @returns `true` when the error indicates a missing table or column.
 * @remarks
 * This is used for staged rollouts where a read path must degrade safely if a local or
 * remote SQLite schema is behind the current application code.
 */
export const isSqliteMissingSchemaError = (
  error: unknown,
  relationName?: string,
): boolean => {
  const visited = new Set<unknown>()
  const queue: unknown[] = [error]
  const normalizedRelationName = relationName?.toUpperCase()

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current || visited.has(current)) continue
    visited.add(current)

    if (current instanceof Error) {
      const message = current.message.toUpperCase()
      const isMissingSchemaObject =
        message.includes('NO SUCH TABLE') || message.includes('NO SUCH COLUMN')

      if (
        isMissingSchemaObject &&
        (!normalizedRelationName || message.includes(normalizedRelationName))
      ) {
        return true
      }

      queue.push(current.cause)
    }
  }

  return false
}

/**
 * Retries a D1 read operation when local Miniflare/workerd hits transient SQLite locks.
 *
 * @param operation - Async DB read to execute.
 * @returns Operation result once successful.
 */
export const retryBusyRead = async <T>(operation: () => Promise<T>): Promise<T> => {
  let attempt = 0
  let lastError: unknown

  while (attempt < 6) {
    try {
      return await operation()
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt === 5) {
        throw error
      }

      lastError = error
      attempt += 1
      await new Promise(resolve => setTimeout(resolve, 50 * attempt))
    }
  }

  throw lastError
}
