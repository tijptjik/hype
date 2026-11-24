// NODE
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { randomUUID } from 'node:crypto'
// PIPELINE
import { backupMirror } from './lib/backup'
import {
  applyFeatureSyncGroup,
  type FeatureSyncPlan,
  type FeatureSyncState,
} from './lib/feature-sync-plan'
import { userSyncHash } from './lib/user-sync-contract'
import { lockUserSyncState, writeUserSyncState } from './lib/user-sync-state'
import {
  applyLocationFeatureSyncGroup,
  locationSyncSchemaHash,
  type LocationFeatureSyncPlan,
  type LocationFeatureSyncState,
} from './lib/location-feature-sync-contract'
import { openSqliteDomain } from '../locations/lib/sqlite-domain'

/** Apply a hash-pinned production plan, then advance its private accepted baseline.
 * @returns Receipt path after remote completion and local promotion.
 * @remarks Each complete Feature is atomic and resumable; no application deployment or schema migration occurs.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const args = new Map<string, string>()
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i],
      value = process.argv[i + 1]
    if (
      !['--plan', '--expect-hash', '--target', '--state', '--database'].includes(key) ||
      !value ||
      value.startsWith('--') ||
      args.has(key)
    )
      throw new Error('Invalid apply arguments')
    args.set(key, value)
  }
  const required = (k: string): string => {
    const v = args.get(k)
    if (!v) throw new Error(`Missing ${k}`)
    return v
  }
  const planPath = resolve(required('--plan'))
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as
    | FeatureSyncPlan
    | LocationFeatureSyncPlan
  const hash = userSyncHash(plan),
    target = required('--target')
  const config = Bun.TOML.parse(readFileSync('wrangler.toml', 'utf8')) as {
    account_id: string
    env: {
      production: {
        d1_databases: Array<{
          binding: string
          database_name: string
          database_id: string
        }>
      }
    }
  }
  const binding = config.env.production.d1_databases.find(r => r.binding === 'DB')
  if (
    hash !== required('--expect-hash') ||
    ![1, 2].includes(plan.version) ||
    plan.exceptions.length ||
    plan.targetIdentity !== target ||
    target !== `production:${binding?.database_id}`
  )
    throw new Error('Reviewed feature target differs')
  const statePath = resolve(required('--state')),
    release = lockUserSyncState(statePath)
  try {
    const state: FeatureSyncState | LocationFeatureSyncState | null = existsSync(
      statePath,
    )
      ? JSON.parse(readFileSync(statePath, 'utf8'))
      : null
    if (state && (state.version !== plan.version || state.targetIdentity !== target))
      throw new Error('Accepted state version or target differs')
    if (state?.planHash !== hash && (state?.planHash ?? null) !== plan.previousPlanHash)
      throw new Error('Accepted feature baseline changed')
    const directory = dirname(statePath)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const configPath = join(directory, 'remote-binding.json'),
      receiptPath = join(directory, `${randomUUID()}.receipt.json`)
    writeFileSync(
      configPath,
      JSON.stringify({
        name: 'breadline-feature-sync',
        compatibility_date: '2026-01-01',
        account_id: config.account_id,
        d1_databases: [{ ...binding, remote: true }],
      }),
      { mode: 0o600 },
    )
    const beforeImage = backupMirror(resolve(required('--database')))
    // Rehearse against a copy before sending any remote changes, including resumed plans.
    const rehearsalPath = join(directory, `${randomUUID()}.rehearsal.sqlite`)
    copyFileSync(beforeImage, rehearsalPath)
    const rehearsal = openSqliteDomain(rehearsalPath)
    try {
      if (plan.version === 2) {
        const schema = await rehearsal.binding
          .prepare(
            'SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE sql IS NOT NULL',
          )
          .all<Record<string, unknown>>()
        if (locationSyncSchemaHash(schema.results) !== plan.schemaHash)
          throw Error('Location schema changed')
        for (const group of plan.groups)
          await applyLocationFeatureSyncGroup(rehearsal.binding, group)
        if (rehearsal.sqlite.query('PRAGMA foreign_key_check').all().length)
          throw Error('Rehearsal foreign-key violation')
      } else
        for (const group of plan.groups)
          await applyFeatureSyncGroup(rehearsal.binding, group)
    } finally {
      rehearsal.close()
    }
    const child = Bun.spawn(
      [
        'node',
        '--import',
        'tsx',
        'scripts/breadline/apply-features-remote.ts',
        planPath,
        target,
        hash,
        configPath,
        statePath + '.remote-journal.json',
        receiptPath,
      ],
      { stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0)
      throw new Error('Remote feature application incomplete')
    const local = openSqliteDomain(resolve(required('--database')))
    try {
      if (plan.version === 2)
        for (const group of plan.groups)
          await applyLocationFeatureSyncGroup(local.binding, group)
      else
        for (const group of plan.groups)
          await applyFeatureSyncGroup(local.binding, group)
    } finally {
      local.close()
    }
    writeUserSyncState(statePath, {
      version: plan.version,
      targetIdentity: target,
      source: plan.source,
      projections: plan.projections,
      ...(plan.version === 2 ? { featureIds: plan.featureIds } : {}),
      planHash: hash,
    } as FeatureSyncState | LocationFeatureSyncState)
    console.log(
      JSON.stringify({
        groups: plan.groups.length,
        receiptPath,
        beforeImage,
        planHash: hash,
      }),
    )
  } finally {
    release()
  }
}
main().catch(error => {
  mkdirSync('.local/breadline', { recursive: true, mode: 0o700 })
  writeFileSync(
    '.local/breadline/feature-apply-error.json',
    JSON.stringify({ message: String(error), stack: error?.stack }),
    { mode: 0o600 },
  )
  console.error(
    'Feature application stopped. Preserve private plan and journal; accepted state advances only after successful application.',
  )
  process.exitCode = 1
})
