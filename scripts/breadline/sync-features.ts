// NODE
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
// BUN
import { Database } from 'bun:sqlite'
// PIPELINE
import { planBreadlineFeatures } from './features'
import { backupMirror } from './lib/backup'
import { readFeatureSyncSource } from './lib/feature-sync'
import {
  FEATURE_SYNC_TABLES,
  planFeatureSync,
  type FeatureSyncState,
} from './lib/feature-sync-plan'
import { userSyncHash } from './lib/user-sync-contract'
import { lockUserSyncState } from './lib/user-sync-state'

/** Prepare an offline, hash-pinned donor/dropoff reconciliation for the detected Place or revision-enabled Location schema.
 * @returns Aggregate counts and private plan paths.
 * @remarks No source refresh or production mutation. Accepted state changes only after remote application.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const databaseIndex = process.argv.indexOf('--database')
  if (databaseIndex >= 0 && process.argv[databaseIndex + 1]) {
    const probe = new Database(process.argv[databaseIndex + 1], { readonly: true })
    let current = false
    try {
      current = Boolean(
        probe.query("SELECT 1 FROM sqlite_schema WHERE name='location'").get(),
      )
    } finally {
      probe.close()
    }
    if (current) {
      const { planLocationSyncCommand } = await import('./sync-location-features')
      await planLocationSyncCommand(process.argv.slice(2))
      return
    }
  }

  const args = new Map<string, string>()
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i],
      value = process.argv[i + 1]
    if (
      !['--source', '--database', '--state', '--target', '--out'].includes(key) ||
      !value ||
      value.startsWith('--') ||
      args.has(key)
    )
      throw new Error('Invalid feature sync arguments')
    args.set(key, value)
  }
  const required = (key: string): string => {
    const v = args.get(key)
    if (!v) throw new Error(`Missing ${key}`)
    return v
  }
  const directory = resolve(required('--out'))
  if (!directory.startsWith(resolve('.local') + '/'))
    throw new Error('Private output must remain in .local')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const release = lockUserSyncState(required('--state'))
  try {
    const state: FeatureSyncState | null = existsSync(required('--state'))
      ? JSON.parse(readFileSync(required('--state'), 'utf8'))
      : null
    const sourcePath = backupMirror(resolve(required('--source')))
    const sourceDb = new Database(sourcePath, { readonly: true })
    const source = readFeatureSyncSource(sourceDb)
    sourceDb.close()
    const targetPath = backupMirror(resolve(required('--database')))
    const target = new Database(targetPath, { readonly: true })
    const projectionPath = join(directory, `${randomUUID()}.projection.sqlite`)
    const copy = new Database(targetPath, { readonly: true })
    copy.query('VACUUM INTO ?').run(projectionPath)
    copy.close()
    const projection = new Database(projectionPath)
    try {
      // Only the disposable projection is cleared; live/accepted rows remain untouched.
      for (const row of projection
        .query("SELECT name FROM sqlite_master WHERE type='trigger'")
        .all() as { name: string }[])
        projection.run(`DROP TRIGGER "${row.name.replaceAll('"', '""')}"`)
      for (const table of [...FEATURE_SYNC_TABLES].reverse())
        projection.run(`DELETE FROM ${table}`)
      const sqlPath = join(directory, `${randomUUID()}.projection.sql`)
      const statements = planBreadlineFeatures([
        '--legacy-place',
        '--source',
        sourcePath,
        '--target',
        projectionPath,
        '--output',
        sqlPath,
      ])
      projection.transaction(() => {
        for (const statement of statements) projection.query(statement).run()
      })()
      const plan = planFeatureSync(
        source,
        projection,
        target,
        state,
        required('--target'),
      )
      const planPath = join(directory, `${randomUUID()}.plan.json`)
      writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600, flag: 'wx' })
      console.log(
        JSON.stringify({
          ...plan.counts,
          exceptions: plan.exceptions.length,
          groups: plan.groups.length,
          planPath,
          planHash: userSyncHash(plan),
          sourceSnapshotAt: source.snapshotAt,
        }),
      )
    } finally {
      projection.close()
      target.close()
    }
  } finally {
    release()
  }
}
main().catch(error => {
  mkdirSync('.local/breadline', { recursive: true, mode: 0o700 })
  writeFileSync(
    '.local/breadline/feature-sync-error.json',
    JSON.stringify({ message: String(error), stack: error?.stack }),
    { mode: 0o600 },
  )
  console.error(
    'Feature sync planning stopped. Inspect private inputs and diagnostics; no production changes were made.',
  )
  process.exitCode = 1
})
