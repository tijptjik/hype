// BUN
import { Database } from 'bun:sqlite'
// NODE
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
// SERVICES
import { apiRead, geocodeSchema } from '../workers/division-refresh/src/api'
import { refreshDivisions } from '../workers/division-refresh/src/refresh'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/**
 * Reads an explicit command-line option without printing credential values.
 * @param name Option including its leading dashes.
 * @returns Supplied value, or undefined.
 */
function option(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index < 0 ? undefined : process.argv[index + 1]
}

const databasePath = option('--database')
if (!databasePath) throw new Error('Supply --database with the local HYPE SQLite path.')
const apply = process.argv.includes('--apply')
const api = {
  baseUrl: option('--base-url') ?? 'http://localhost:8787',
  token: process.env[option('--key-env') ?? 'SAANSEOI_API_KEY'],
}
if (!api.token) throw new Error('Missing SaanSeoi API credential. Load a credential file with bun --env-file or supply --key-env.')
// Validate the live contract before touching local data or applying migrations.
const probe = await apiRead(api, '/divisions/v1/geocode', {
  lat: '22.28', lng: '114.16', locales: 'en,zh-hant', profile: 'full',
}, geocodeSchema)
const sqlite = new Database(resolve(databasePath), { readonly: !apply, strict: true })
try {
  const features = sqlite.query('SELECT count(*) AS count FROM feature').get()
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'inspect', features, release: probe.meta.release.apiReleaseSet }))
  if (!apply) process.exit(0)
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;')
  // SQLite creates a consistent backup, including committed WAL data, before any migration.
  const backupDirectory = resolve('.local/division-refresh/backups')
  mkdirSync(backupDirectory, { recursive: true })
  const backup = `${backupDirectory}/${new Date().toISOString().replaceAll(':', '-')}.sqlite`
  sqlite.query('VACUUM INTO ?').run(backup)
  console.log(JSON.stringify({ backup }))
  for (const name of ['0082_feature_division_refresh.sql', '0083_feature_division_registry.sql']) {
    if (sqlite.query('SELECT 1 FROM d1_migrations WHERE name=?').get(name)) continue
    const migration = await Bun.file(new URL(`../migrations/${name}`, import.meta.url)).text()
    sqlite.transaction(() => {
      sqlite.exec(migration)
      sqlite.query('INSERT INTO d1_migrations(name) VALUES(?)').run(name)
    })()
  }
  /**
   * Implements the worker's prepared-statement subset on the explicit local database.
   * @param sql Parameterized SQL produced by the production worker.
   * @param values Bound values.
   * @returns D1-compatible methods and a synchronous batch operation.
   */
  const prepare = (sql: string, values: unknown[] = []) => {
    const runSync = () => ({ success: true, meta: { changes: sqlite.query(sql).run(...values as never[]).changes } })
    return {
      bind: (...args: unknown[]) => prepare(sql, args),
      first: async () => sqlite.query(sql).get(...values as never[]) ?? null,
      all: async () => ({ success: true, results: sqlite.query(sql).all(...values as never[]) }),
      run: async () => runSync(),
      runSync,
    }
  }
  const db = {
    prepare,
    batch: async (statements: ReturnType<typeof prepare>[]) =>
      sqlite.transaction(() => statements.map(statement => statement.runSync()))(),
  } as unknown as D1Database
  for (let step = 0; step < 100000; step++) {
    const phase = await refreshDivisions(db, api)
    const state = sqlite.query('SELECT appliedRelease,targetRelease,phase,lastError FROM divisionRefresh WHERE id=1').get() as { phase: string; appliedRelease: string | null }
    const pending = sqlite.query('SELECT count(*) AS count,sum(attempts>0) AS failed FROM featureDivisionJob').get() as { count: number; failed: number }
    if (step % 10 === 0 || !pending.count) console.log(JSON.stringify({ step, state, pending }))
    if (phase === 'busy') throw new Error('Another refresh owns the database lease; retry after it completes.')
    if (pending.failed) throw new Error('Geocoding jobs failed and remain queued. Inspect featureDivisionJob.lastError; rerun after retryAt.')
    if (state.phase === 'idle' && !pending.count) {
      console.log(JSON.stringify({ complete: true, release: state.appliedRelease,
        divisions: sqlite.query('SELECT count(*) AS count FROM divisionDefinition').get(),
        names: sqlite.query('SELECT locale,count(*) AS count FROM divisionI18n GROUP BY locale').all(),
        foreignKeyViolations: sqlite.query('PRAGMA foreign_key_check').all().length,
      }))
      break
    }
    if (step === 99999) throw new Error('Step limit reached; durable progress is retained.')
  }
} finally {
  sqlite.close()
}
