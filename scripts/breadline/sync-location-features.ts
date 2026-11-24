// NODE
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
// BUN
import { Database } from 'bun:sqlite'
// SYNC
import { openSqliteDomain } from '../locations/lib/sqlite-domain'
import { backupMirror } from './lib/backup'
import { readFeatureSyncSource } from './lib/feature-sync'
import {
  adoptLocationSyncBaseline,
  projectLocationSyncFacts,
  planLocationFeatureSync,
} from './lib/location-feature-sync'
import { lockUserSyncState } from './lib/user-sync-state'
import { userSyncHash } from './lib/user-sync-contract'
import type { LocationFeatureSyncState } from './lib/location-feature-sync-contract'

/** Prepare current-schema sync or explicitly bridge an unchanged accepted legacy baseline.
 * @param args Paired CLI flags; --adopt-state provides the old state for a separate baseline-adoption action.
 * @returns Private plan metadata. Never applies to production or mutates the supplied target database.
 * @remarks Existing state is never replaced during planning; reviewed application advances it.
 */
export async function planLocationSyncCommand(args: string[]): Promise<void> {
  process.umask(0o077)
  const options = new Map<string, string>()
  for (let i = 0; i < args.length; i += 2) {
    if (
      ![
        '--source',
        '--database',
        '--state',
        '--target',
        '--out',
        '--adopt-state',
      ].includes(args[i]) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--') ||
      options.has(args[i])
    )
      throw Error('Invalid Location sync arguments')
    options.set(args[i], args[i + 1])
  }
  const required = (key: string): string => {
    const v = options.get(key)
    if (!v) throw Error('Missing ' + key)
    return v
  }
  const directory = resolve(required('--out')),
    statePath = resolve(required('--state'))
  if (
    !directory.startsWith(resolve('.local') + '/') ||
    !statePath.startsWith(resolve('.local') + '/')
  )
    throw Error('Private output and state must remain in .local')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const release = lockUserSyncState(statePath)
  try {
    const sourcePath = backupMirror(resolve(required('--source'))),
      databasePath = resolve(required('--database')),
      targetIdentity = required('--target')
    if (options.has('--adopt-state')) {
      if (existsSync(statePath)) throw Error('Baseline destination already exists')
      const d = openSqliteDomain(databasePath),
        sourceDb = new Database(sourcePath, { readonly: true })
      try {
        const source = readFeatureSyncSource(sourceDb),
          legacy = JSON.parse(readFileSync(required('--adopt-state'), 'utf8'))
        const state = adoptLocationSyncBaseline(
          d,
          source,
          legacy,
          projectLocationSyncFacts(d, sourcePath, directory),
          targetIdentity,
        )
        writeFileSync(statePath, JSON.stringify(state), { mode: 0o600, flag: 'wx' })
        writeFileSync(
          join(directory, 'baseline-adoption.json'),
          JSON.stringify({
            targetIdentity,
            previousPlanHash: legacy.planHash,
            sourceSnapshotAt: source.snapshotAt,
            stateHash: userSyncHash(state),
            database: databasePath,
            mutations: 0,
          }) + '\n',
          { flag: 'wx', mode: 0o600 },
        )
        console.log(JSON.stringify({ adopted: true, statePath, mutations: 0 }))
      } finally {
        sourceDb.close()
        d.close()
      }
      return
    }
    const state = JSON.parse(
      readFileSync(statePath, 'utf8'),
    ) as LocationFeatureSyncState
    if (state.version !== 2 || state.targetIdentity !== targetIdentity)
      throw Error(
        'Current Location baseline and target required; use explicit adoption first',
      )
    const working = join(directory, randomUUID() + '.projection.sqlite'),
      source = new Database(databasePath, { readonly: true })
    try {
      source.query('VACUUM INTO ?').run(working)
    } finally {
      source.close()
    }
    const plan = await planLocationFeatureSync(working, sourcePath, state, directory),
      planPath = join(directory, randomUUID() + '.plan.json')
    writeFileSync(planPath, JSON.stringify(plan), { mode: 0o600, flag: 'wx' })
    console.log(
      JSON.stringify({
        ...plan.counts,
        exceptions: plan.exceptions.length,
        groups: plan.groups.length,
        planPath,
        planHash: userSyncHash(plan),
        sourceSnapshotAt: plan.source.snapshotAt,
      }),
    )
  } finally {
    release()
  }
}
if (import.meta.main) await planLocationSyncCommand(process.argv.slice(2))
