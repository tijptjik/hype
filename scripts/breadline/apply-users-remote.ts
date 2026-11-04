// NODE
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
// CLOUDFLARE
import { getPlatformProxy } from 'wrangler'
// PIPELINE
import { userSyncHash, type UserSyncPlan } from './lib/user-sync-contract'
import { applyUserSyncRemote, type UserSyncJournal } from './lib/user-sync-remote'
import { writeUserSyncState } from './lib/user-sync-state'
// TYPES
import type { D1Database } from '@cloudflare/workers-types'

/** Execute only the remote half of the importer under Node's supported fetch runtime.
 * @returns Completion after remote progress and an aggregate receipt are durably saved.
 * @remarks Invoked by the Bun operator while it holds the local lock. No local SQLite
 * baseline is promoted here, and no credential values are emitted to logs.
 */
async function main(): Promise<void> {
  process.umask(0o077)
  const [planPath, target, expectedHash, configPath, journalPath, receiptPath] =
    process.argv.slice(2)
  if (!receiptPath || process.argv.length !== 8)
    throw new Error('Invalid remote import arguments')
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as UserSyncPlan
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const binding = config.d1_databases?.find(
    (row: { binding: string }) => row.binding === 'DB',
  )
  if (
    binding?.database_name !== 'hype-db-prod' ||
    target !== `production:${binding.database_id}` ||
    plan.targetIdentity !== target ||
    userSyncHash(plan) !== expectedHash
  )
    throw new Error('Production binding or plan differs')
  const previous = existsSync(journalPath)
    ? (JSON.parse(readFileSync(journalPath, 'utf8')) as UserSyncJournal)
    : null
  if (previous && previous.planHash !== expectedHash && !previous.complete)
    throw new Error('Another production plan is unfinished')
  const proxy = await getPlatformProxy<{ DB: D1Database }>({
    configPath,
    envFiles: [],
    persist: false,
    remoteBindings: true,
  })
  try {
    const result = await applyUserSyncRemote(
      proxy.env.DB,
      plan,
      target,
      previous?.planHash === expectedHash ? previous : null,
      progress => {
        writeUserSyncState(journalPath, progress)
        if (progress.nextMutation % 2000 === 0 || progress.complete)
          console.log(
            JSON.stringify({
              appliedMutations: progress.nextMutation,
              complete: progress.complete,
            }),
          )
      },
    )
    writeFileSync(receiptPath, JSON.stringify(result), { mode: 0o600, flag: 'wx' })
  } finally {
    await proxy.dispose()
  }
}
main().catch(() => {
  console.error(
    'Remote import stopped; preserve its private journal and resume the same reviewed plan.',
  )
  process.exitCode = 1
})
