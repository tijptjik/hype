// NODE
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
// BUN
import { Database } from 'bun:sqlite'
// PIPELINE
import { backupMirror } from './lib/backup'
import {
  acceptUserSyncPlan,
  applyUserSync,
  readUserSyncTarget,
  userSyncHash,
  type UserSyncPlan,
} from './lib/user-sync'
import type { UserSyncJournal } from './lib/user-sync-remote'
import {
  lockUserSyncState,
  readUserSyncState,
  writeUserSyncState,
} from './lib/user-sync-state'

/**
 * Apply an explicitly hashed production plan and promote its accepted local baseline.
 * @returns Completion after durable remote receipt and local baseline application.
 * @remarks No production export is performed. Remote before-image assertions protect
 * newer production edits. Interrupted runs retain a private journal and resume the same plan.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const args = new Map<string, string>()
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i],
      value = process.argv[i + 1]
    if (
      !['--state', '--database', '--plan', '--expect-hash', '--target'].includes(key) ||
      !value ||
      value.startsWith('--') ||
      args.has(key)
    )
      throw new Error('Invalid apply arguments')
    args.set(key, value)
  }
  const required = (key: string): string => {
    const value = args.get(key)
    if (!value) throw new Error(`Missing ${key}`)
    return value
  }
  const plan = JSON.parse(readFileSync(required('--plan'), 'utf8')) as UserSyncPlan
  const hash = userSyncHash(plan)
  if (hash !== required('--expect-hash')) throw new Error('Reviewed plan hash differs')
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
  const binding = config.env.production.d1_databases.find(row => row.binding === 'DB')
  if (
    !binding ||
    required('--target') !== `production:${binding.database_id}` ||
    plan.targetIdentity !== required('--target')
  )
    throw new Error('Explicit production target mismatch')
  const statePath = resolve(required('--state'))
  const release = lockUserSyncState(statePath)
  const state = readUserSyncState(statePath)
  const journalPath = statePath + '.remote-journal.json'
  const journal: UserSyncJournal | null = existsSync(journalPath)
    ? JSON.parse(readFileSync(journalPath, 'utf8'))
    : null
  const samePlan = journal?.planHash === hash
  if (journal && !samePlan && !journal.complete)
    throw new Error('Finish the pending production plan first')
  const db = new Database(resolve(required('--database')), { strict: true })
  try {
    db.exec('PRAGMA foreign_keys=ON')
    const current = readUserSyncTarget(db, state)
    const accepted =
      current.breadlineUserSyncCheckpoint.find(row => row.id === 'users')?.planHash ===
      hash
    if (!accepted && !samePlan && userSyncHash(current) !== plan.baselineHash)
      throw new Error('Local accepted baseline changed')
    const beforeImage = backupMirror(resolve(required('--database')))
    const directory = resolve('.local/breadline/user-sync-production', hash)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const configPath = resolve(directory, 'binding.json')
    writeFileSync(
      configPath,
      JSON.stringify({
        name: 'hype-user-sync-operator',
        account_id: config.account_id,
        compatibility_date: '2026-11-04',
        d1_databases: [{ ...binding, remote: true }],
      }),
      { mode: 0o600 },
    )
    // Wrangler requires Node for remote bindings; keep Bun's SQLite baseline in this process.
    const operatorPath = resolve(directory, 'apply-users-remote.mjs')
    const build = await Bun.build({
      entrypoints: [resolve('scripts/breadline/apply-users-remote.ts')],
      target: 'node',
      external: ['wrangler'],
      outdir: directory,
      naming: 'apply-users-remote.mjs',
    })
    if (!build.success) throw new Error('Remote operator build failed')
    const remoteReceiptPath = resolve(directory, `${randomUUID()}.remote.json`)
    const child = Bun.spawn(
      [
        'node',
        operatorPath,
        resolve(required('--plan')),
        required('--target'),
        hash,
        configPath,
        journalPath,
        remoteReceiptPath,
      ],
      { stdout: 'inherit', stderr: 'inherit' },
    )
    if ((await child.exited) !== 0) throw new Error('Remote operator stopped')
    const remote = JSON.parse(readFileSync(remoteReceiptPath, 'utf8')) as {
      planHash: string
      mutations: number
    }
    if (remote.planHash !== hash) throw new Error('Remote receipt differs')
    // Persist remote completion before touching the local baseline so a retry can recover.
    const receiptPath = resolve(directory, `${randomUUID()}.receipt.json`)
    writeFileSync(
      receiptPath,
      JSON.stringify(
        {
          ...remote,
          beforeImage,
          targetIdentity: plan.targetIdentity,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: 'wx' },
    )
    if (!accepted && (plan.mutations.length || plan.checkpointChanged))
      applyUserSync(db, plan, state, samePlan)
    if (!accepted) writeUserSyncState(statePath, acceptUserSyncPlan(plan, state))
    console.log(JSON.stringify({ ...remote, receiptPath, acceptedLocally: true }))
  } finally {
    db.close()
    release()
  }
}

main().catch(() => {
  console.error(
    'Production user sync stopped. Keep its private plan and receipts; a partial apply retains its local journal. Resume the same reviewed plan after resolving the failure. No identity values are logged.',
  )
  process.exitCode = 1
})
