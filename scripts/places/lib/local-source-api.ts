// RUNTIME
import { Database, constants } from 'bun:sqlite'
import { existsSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
// SOURCE API
import app from '../../../../saanseoi/apps/atlas-api/src/index'
// TYPES
import type { PlaceSourceClient } from '../../../src/lib/places/sourceClient'

/**
 * Serve SaanSeoi API reads in process from explicitly selected sealed local mirrors.
 * @param directory Source export directory containing META, history and source shards.
 * @param currentPath CURRENT export compatible with the checked-out API schema.
 * @returns HYPE source client, requested URLs and a required close operation.
 * @remarks No listener or network is opened. SQLite enforces read-only access; immutable
 * mode requires sealed exports without nonempty WAL files. Authentication is disabled only inside
 * this isolated test transport. Never point at a running source database.
 */
export function openLocalSourceApi(
  directory: string,
  currentPath: string,
): {
  client: PlaceSourceClient
  requests: string[]
  close: () => void
} {
  const databases: Database[] = []
  const requests: string[] = []
  const env: Record<string, unknown> = {
    ATLAS_BASE_URL: 'https://local-source.invalid',
    AUTH_MODE: 'disabled',
    ENVIRONMENT: 'test',
    API_RATE_LIMIT: { limit: async () => ({ success: true }) },
    API_USAGE: { writeDataPoint() {} },
    PRODUCT_USAGE_DATASET: 'local-rehearsal',
  }
  try {
    for (const name of [
      'DB_META',
      'DB_CURRENT',
      'DB_HISTORY_HK_BEFORE',
      'DB_HISTORY_HK_2025',
      'DB_HISTORY_HK_2026',
      'DB_SOURCE_HK_BEFORE',
      'DB_SOURCE_HK_2025',
      'DB_SOURCE_HK_2026',
    ]) {
      const path = realpathSync(
        name === 'DB_CURRENT' ? currentPath : resolve(directory, name + '.sqlite'),
      )
      if (existsSync(path + '-wal') && statSync(path + '-wal').size > 0)
        throw new Error('Sealed source export has a nonempty WAL: ' + name)
      const db = new Database(
        `file:${path}?mode=ro&immutable=1`,
        constants.SQLITE_OPEN_READONLY | constants.SQLITE_OPEN_URI,
      )
      databases.push(db)
      env[name] = {
        /** Prepare a read-only D1-shaped statement. @param query Source API SQL. @returns Bound statement facade. */
        prepare(query: string) {
          const statement = db.query(query)
          let values: unknown[] = []
          const bound = {
            bind(...args: unknown[]) {
              values = args
              return bound
            },
            async all() {
              return { results: statement.all(...(values as never[])), success: true }
            },
            async first() {
              return statement.get(...(values as never[]))
            },
            async raw() {
              return statement.values(...(values as never[]))
            },
            async run() {
              throw new Error('Read-only source rehearsal forbids mutations')
            },
          }
          return bound
        },
      }
    }
  } catch (error) {
    for (const db of databases) db.close()
    throw error
  }
  /** Dispatch within the local API only. @param input Source URL. @param init Fetch options. @returns API response without network I/O. */
  const transport = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const request = new Request(input, init)
    if (new URL(request.url).origin !== 'https://local-source.invalid')
      throw new Error('Unexpected source origin')
    requests.push(request.url)
    return app.fetch(request, env as never)
  }) as typeof fetch
  return {
    client: {
      baseUrl: 'https://local-source.invalid',
      apiKey: 'in-process-rehearsal',
      fetch: transport,
    },
    requests,
    close: () => {
      for (const db of databases) db.close()
    },
  }
}
